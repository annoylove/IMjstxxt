/**
 * Socket.io 核心
 * - 鉴权中间件（handshake.auth.token）
 * - 事件 MSG_CHAT / MSG_ACK / MSG_READ / MSG_RECALL / MSG_DELIVERED_ACK / SYS_PING / SYS_KICK_OUT
 * - 心跳 30s（客户端发 SYS_PING，服务端回 SYS_PONG）
 * - 消息：生成 seqId → upsert Mongo → 路由接收方（单/群）→ 回发送方 MSG_ACK
 * - Delivered：服务端只 emit MSG_ROUTE，接收方确认后回 MSG_DELIVERED_ACK → 服务端更新 status 并通知发送方 MSG_ROUTE_DELIVERED_NOTIFY
 * - 新设备登录触发 session.kickOut
 */
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import config from '../config/index.js';
import logger from '../utils/logger.js';
import protocol from '../utils/protocol.js';
import seqService from '../services/seq.service.js';
import sessionService from '../services/session.service.js';
import floodService from '../services/flood.service.js';
import moderation from '../services/moderation.service.js';
import { isTokenRevoked } from '../services/tokenBlacklist.service.js';
import { upsertMessage, updateMessage, findMessageBySeqId } from '../db/mongo.js';
import Member from '../models/mysql/Member.js';
import Friend from '../models/mysql/Friend.js';

export function createSocketIO(httpServer) {
  const io = new Server(httpServer, {
    path: config.socket.path,
    cors: { origin: '*', credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: config.socket.heartbeatInterval,
    pingTimeout: 60_000,
  });

  // —— 鉴权中间件 ——
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('missing token'));
      let payload;
      try {
        payload = jwt.verify(token, config.jwt.secret);
      } catch (err) {
        return next(new Error('invalid token'));
      }
      if (isTokenRevoked(token)) return next(new Error('token revoked'));
      socket.user = { uid: payload.uid, username: payload.username };
      socket.device = socket.handshake.auth?.device || 'web';
      next();
    } catch (err) {
      next(err);
    }
  });

  // —— 连接 ——
  io.on('connection', async (socket) => {
    const { uid } = socket.user;
    logger.info(`[Socket] connected uid=${uid} sid=${socket.id}`);

    try {
      // 多端互踢
      const oldSockets = await sessionService.kickOut(uid, socket.id);
      for (const sid of oldSockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.emit('SYS_KICK_OUT', protocol.buildKickOut('new_device_login'));
          s.disconnect(true);
        }
      }

      await sessionService.bind(uid, socket.id, socket.device);

      // 单聊房间
      socket.join(`user:${uid}`);

      // 群聊房间：用户加入所有已在的群
      try {
        const groupIds = await Member.listGroupsByUser(uid);
        for (const gid of groupIds) {
          socket.join(`group:${gid}`);
        }
        logger.info(`[Socket] uid=${uid} joined ${groupIds.length} groups`);
      } catch (e) {
        logger.warn(`[Socket] join-groups failed uid=${uid}: ${e.message}`);
      }
    } catch (err) {
      logger.error('[Socket] post-connect error', err.message);
    }

    // —— 客户端请求临时加入某个群（拉离线群消息前用）——
    socket.on('GROUP_JOIN', async (payload, ack) => {
      try {
        const gid = payload?.groupId;
        if (!gid) { if (ack) ack({ code: 1, message: 'missing groupId' }); return; }
        const m = await Member.findOne(gid, uid);
        if (!m) { if (ack) ack({ code: 1, message: 'not group member' }); return; }
        socket.join(`group:${gid}`);
        if (ack) ack({ code: 0 });
      } catch (err) { logger.error('[GROUP_JOIN]', err.message); }
    });

    // —— SYS_PING / PONG ——
    socket.on('SYS_PING', async (_payload, ack) => {
      await sessionService.touch(uid, socket.id);
      const resp = protocol.buildPong(_payload?.ts);
      if (typeof ack === 'function') ack(resp);
      else socket.emit('SYS_PONG', resp);
    });

    // —— MSG_CHAT ——
    // 幂等去重窗口：同连接 5 分钟内重复 requestId 直接复用首次结果
    //（客户端 ack 超时重发不产生第二条消息 → 整体投递语义为 at-least-once + 服务端幂等）
    const DEDUP_TTL_MS = 5 * 60 * 1000;
    const DEDUP_MAX = 1000;
    const recentRequests = new Map(); // requestId -> { seqId, ts }

    socket.on('MSG_CHAT', async (payload, ack) => {
      try {
        // 验签
        const parsed = protocol.MsgChatSchema.parse(payload);

        // 幂等：重复 requestId 返回缓存的 seqId，不重新入库/路由
        const dup = recentRequests.get(parsed.requestId);
        if (dup && Date.now() - dup.ts <= DEDUP_TTL_MS) {
          if (typeof ack === 'function') ack({ code: 0, data: protocol.buildAck(parsed.requestId, dup.seqId) });
          else socket.emit('MSG_ACK', protocol.buildAck(parsed.requestId, dup.seqId));
          return;
        }

        // 风暴限频（只 warn 不阻断，让客户端降频；超过阈值时后续可启用合并推送）
        const count = await floodService.markFlood(uid);
        if (count > config.flood.maxPerWindow) {
          logger.warn(`[FLOOD] uid=${uid} window_count=${count}`);
        }
        if (await floodService.shouldDrop(uid)) {
          // 风暴时丢弃（或改为合并推送）
          if (typeof ack === 'function') ack({ code: 2, message: 'flooding, dropped' });
          return;
        }

        // 目标校验
        if (parsed.toType === 'single') {
          if (String(parsed.toId) === String(uid)) {
            if (typeof ack === 'function') ack({ code: 1, message: 'cannot chat to yourself' });
            return;
          }
          // 单聊必须是已接受的好友关系（与 HTTP canAccess 保持一致）
          const pair = await Friend.findPair(uid, parsed.toId);
          if (!pair.some((p) => p.status === 'accepted')) {
            if (typeof ack === 'function') ack({ code: 1, message: 'not friend' });
            return;
          }
        } else {
          // 群聊：校验是否群成员
          const m = await Member.findOne(parsed.toId, uid);
          if (!m) {
            if (typeof ack === 'function') ack({ code: 1, message: 'not group member' });
            return;
          }
        }

        // 生成 seqId
        const seqId = await seqService.nextSeqId();

        // 存 Mongo（upsert 去重）；text 内容经服务端敏感词打码，各端看到同一份净化内容
        const msg = {
          seqId,
          fromId: uid,
          fromType: 'user',
          toId: parsed.toId,
          toType: parsed.toType,
          contentType: parsed.contentType,
          content: parsed.contentType === 'text' ? moderation.maskText(parsed.content) : parsed.content,
          status: 'sent',
        };
        await upsertMessage(msg);

        // 记录幂等窗口（超容量时按插入顺序淘汰最旧）
        if (recentRequests.size >= DEDUP_MAX) {
          recentRequests.delete(recentRequests.keys().next().value);
        }
        recentRequests.set(parsed.requestId, { seqId, ts: Date.now() });

        // 路由给接收方（只 emit MSG_ROUTE，不再单方面宣告 delivered）
        if (parsed.toType === 'single') {
          io.to(`user:${parsed.toId}`).emit('MSG_ROUTE', protocol.buildRoute(msg));
        } else {
          // 群聊：投递到 group 房间（所有成员 join 了 group:<id>）
          io.to(`group:${parsed.toId}`).emit('MSG_ROUTE', protocol.buildRoute(msg));
        }

        // 给发送方回 MSG_ACK
        if (typeof ack === 'function') {
          ack({ code: 0, data: protocol.buildAck(parsed.requestId, seqId) });
        } else {
          socket.emit('MSG_ACK', protocol.buildAck(parsed.requestId, seqId));
        }
      } catch (err) {
        logger.error('[MSG_CHAT]', err.message);
        if (typeof ack === 'function') ack({ code: 1, message: err.message });
      }
    });

    // —— MSG_READ ——
    socket.on('MSG_READ', async (payload) => {
      try {
        const parsed = protocol.MsgReadSchema.parse(payload);
        // 更新 Mongo status（近 3 个月所有 collection 一起更新）
        const now = new Date();
        const offsets = Array.from({ length: 3 }, (_, i) => -i);
        const { getCollectionByDate } = await import('../db/mongo.js');
        for (const off of offsets) {
          const Model = getCollectionByDate(
            new Date(now.getFullYear(), now.getMonth() + off, 1)
          );
          await Model.updateMany(
            { seqId: { $in: parsed.seqIds }, toId: uid, status: { $ne: 'read' } },
            { $set: { status: 'read', updatedAt: new Date() } }
          );
        }
        // 通知发送方
        // 简单做法：只告诉对方"你发给我的这些 seqId 我已读了"——发送方客户端自己更新
        socket.emit('MSG_READ_OK', { seqIds: parsed.seqIds });
      } catch (err) {
        logger.error('[MSG_READ]', err.message);
      }
    });

    // —— MSG_DELIVERED_ACK（接收方在线确认送达）——
    socket.on('MSG_DELIVERED_ACK', async (payload) => {
      try {
        const parsed = protocol.DeliveredAckSchema.parse(payload);
        const seqIds = parsed.seqIds;

        // 更新近 3 个月集合里的 status='delivered'（只更新 toId === 当前 uid 的）
        const now = new Date();
        const offsets = Array.from({ length: 3 }, (_, i) => -i);
        let affected = 0;
        const { getCollectionByDate } = await import('../db/mongo.js');
        for (const off of offsets) {
          const Model = getCollectionByDate(
            new Date(now.getFullYear(), now.getMonth() + off, 1)
          );
          const r = await Model.updateMany(
            { seqId: { $in: seqIds }, toId: uid, status: 'sent' },
            { $set: { status: 'delivered', updatedAt: new Date() } }
          );
          affected += r.modifiedCount;
        }

        // 只给发送方发通知。注意：客户端客户端需要在 MSG_ROUTE_DELIVERED_NOTIFY 里拿到 seqIds 自己过滤
        // 这里做简化：把这些 seqIds 对应的消息发送方都找出来再通知？太重。
        // 约定：发送方客户端会订阅 MSG_ROUTE_DELIVERED_NOTIFY，并按自己的 seqIds 匹配。
        // 但 Socket.io 不做全局广播，我们得精准投。
        // 折中：从 DB 查每条消息的 fromId，然后 emit 到 `user:${fromId}` 房间，payload 里带上 [ { seqId, toId } ]
        if (affected > 0) {
          // 查出这些 seqId 对应的 fromId（从近 3 个月集合查）
          const deliveredToSend = []; // [{ seqId, fromId }]
          for (const off of offsets) {
            const Model = getCollectionByDate(
              new Date(now.getFullYear(), now.getMonth() + off, 1)
            );
            const docs = await Model.find(
              { seqId: { $in: seqIds }, toId: uid, status: 'delivered' },
              { seqId: 1, fromId: 1 }
            ).lean();
            deliveredToSend.push(...docs);
          }
          // 按 fromId 分组 emit
          const grouped = new Map();
          for (const d of deliveredToSend) {
            const arr = grouped.get(d.fromId) || [];
            arr.push(d.seqId);
            grouped.set(d.fromId, arr);
          }
          for (const [fromId, seqIdList] of grouped) {
            io.to(`user:${fromId}`).emit(
              'MSG_ROUTE_DELIVERED_NOTIFY',
              protocol.buildDeliveredNotify(seqIdList)
            );
          }
        }
      } catch (err) {
        logger.error('[MSG_DELIVERED_ACK]', err.message);
      }
    });

    // —— MSG_RECALL（撤回 2 分钟内自己发的消息）——
    socket.on('MSG_RECALL', async (payload, ack) => {
      try {
        const parsed = protocol.RecallSchema.parse(payload);
        const doc = await findMessageBySeqId(parsed.seqId);
        if (!doc) {
          if (typeof ack === 'function') ack({ code: 1, message: 'message not found' });
          return;
        }
        if (String(doc.fromId) !== uid) {
          if (typeof ack === 'function') ack({ code: 1, message: 'not your message' });
          return;
        }
        if (doc.contentType === 'recall' || doc.recalledAt) {
          if (typeof ack === 'function') ack({ code: 1, message: 'already recalled' });
          return;
        }
        if (Date.now() - new Date(doc.createdAt).getTime() > config.socket.recallWindowMs) {
          if (typeof ack === 'function') ack({ code: 1, message: 'recall expired (2min)' });
          return;
        }

        // 服务端存中性文案，前端渲染时根据 fromId===当前uid 决定显示"你"还是"对方"
        await updateMessage(parsed.seqId, {
          contentType: 'recall',
          content: 'message_recalled',
          originalContent: {
            contentType: doc.contentType,
            content: doc.content,
          },
          recalledAt: new Date(),
        });

        if (typeof ack === 'function') ack({ code: 0 });
        else socket.emit('MSG_RECALL_ACK', protocol.buildRecallAck(parsed.seqId));

        // 通知接收方
        if (doc.toType === 'single') {
          io.to(`user:${doc.toId}`).emit('MSG_RECALL_NOTIFY', protocol.buildRecallNotify(parsed.seqId));
        } else {
          io.to(`group:${doc.toId}`).emit('MSG_RECALL_NOTIFY', protocol.buildRecallNotify(parsed.seqId));
        }
      } catch (err) {
        logger.error('[MSG_RECALL]', err.message);
        if (typeof ack === 'function') ack({ code: 1, message: err.message });
      }
    });

    // —— SYS_KICK_OUT 由服务端触发（上面 new_device_login 已处理）— //

    // —— disconnect ——
    socket.on('disconnect', async (reason) => {
      logger.info(`[Socket] disconnected uid=${uid} sid=${socket.id} reason=${reason}`);
      await sessionService.unbind(uid, socket.id);
      await sessionService.consumeKick(uid, socket.id);
    });
  });

  /**
   * 手动触发某 uid 踢人（HTTP 登录时多端互踢也可以走这里）
   */
  io.kickUser = async (uid, reason = 'force_logout') => {
    const sids = await sessionService.getSocketIds(uid);
    for (const sid of sids) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit('SYS_KICK_OUT', protocol.buildKickOut(reason));
        s.disconnect(true);
      }
    }
    await sessionService.clearAll(uid);
  };

  return io;
}

export default createSocketIO;
