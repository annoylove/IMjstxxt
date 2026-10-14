/**
 * message 路由
 * POST /offline        拉离线增量（body: toId, toType, lastMsgSeqId, limit）
 * GET  /history/:targetId  历史消息分页（query: toType, cursor, limit）
 */
import express from 'express';
import { z } from 'zod';

import { ok, AppError } from '../utils/response.js';
import offline from '../services/offline.service.js';
import { fetchHistory, fetchSessionSummaries, countUnread } from '../db/mongo.js';
import Friend from '../models/mysql/Friend.js';
import Member from '../models/mysql/Member.js';
import User from '../models/mysql/User.js';
import Group from '../models/mysql/Group.js';

const router = express.Router();

const OfflineSchema = z.object({
  toId: z.string().min(1).max(64),
  toType: z.enum(['single', 'group']),
  lastMsgSeqId: z.string().default('0'),
  limit: z.number().int().min(1).max(200).default(50),
});

/** 校验单聊 / 群聊访问权限 */
async function canAccess(uid, toId, toType) {
  if (toType === 'group') {
    const m = await Member.findOne(toId, uid);
    return !!m;
  }
  // single：双方必须是好友
  const pair = await Friend.findPair(uid, toId);
  return pair.some((p) => p.status === 'accepted');
}

// GET /sessions  会话列表（聚合最近消息 + 对方资料 + 未读数）
router.get('/sessions', async (req, res, next) => {
  try {
    const uid = String(req.user.uid);
    const summaries = await fetchSessionSummaries(uid);

    const sessions = [];
    for (const s of summaries) {
      const type = s.__type;
      const peerId = String(s.__peerId);
      let name = '';
      let avatar = '';
      if (type === 'group') {
        const g = await Group.findById(peerId);
        name = g?.name || `群聊 ${peerId}`;
        avatar = g?.avatar || '';
      } else {
        const u = await User.findById(peerId);
        name = u?.nickname || u?.username || `用户 ${peerId}`;
        avatar = u?.avatar || '';
      }
      const unread = await countUnread(uid, peerId, type);
      sessions.push({
        convId: s.__convKey,
        conversationType: type,
        conversationId: peerId,
        name,
        avatar,
        unread,
        pinned: false,
        lastMsg: {
          content: s.content,
          contentType: s.contentType,
          timestamp: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(),
          fromId: s.fromId,
          msgId: s.seqId,
        },
      });
    }
    return ok(res, sessions);
  } catch (err) { next(err); }
});

// POST /offline
router.post('/offline', async (req, res, next) => {
  try {
    const body = OfflineSchema.parse(req.body);
    // 单聊时自己作为接收方视角：按 uid 查 Mongo
    const accessor = body.toType === 'single' ? req.user.uid : body.toId;
    const allowed = await canAccess(req.user.uid, body.toId, body.toType);
    if (!allowed) throw new AppError('no permission', 1501, 403);

    const msgs = await offline.pullOffline({
      toId: accessor,
      toType: body.toType,
      lastMsgSeqId: body.lastMsgSeqId,
      limit: body.limit,
    });
    return ok(res, msgs);
  } catch (err) { next(err); }
});

// GET /history/:targetId
router.get('/history/:targetId', async (req, res, next) => {
  try {
    const targetId = req.params.targetId;
    const toType = z.enum(['single', 'group']).parse(req.query.toType || 'single');
    const cursor = req.query.cursor || null;
    const limit = Math.min(Number(req.query.limit || 50), 100);

    const allowed = await canAccess(req.user.uid, targetId, toType);
    if (!allowed) throw new AppError('no permission', 1501, 403);

    const msgs = await fetchHistory({
      accessor: req.user.uid,
      peerId: toType === 'single' ? targetId : null,
      toType,
      cursor,
      limit,
    });
    return ok(res, msgs);
  } catch (err) { next(err); }
});

export default router;
