/**
 * friend 路由
 * POST /requests       发起好友请求
 * GET  /requests       当前用户收到的请求列表
 * POST /requests/:id/accept
 * DELETE /requests/:id  拒绝
 * GET  /me             自己的好友列表
 */
import express from 'express';
import { z } from 'zod';

import { ok, AppError } from '../utils/response.js';
import Friend from '../models/mysql/Friend.js';
import User from '../models/mysql/User.js';

const router = express.Router();

const RequestSchema = z.object({
  friendId: z.string().min(1).max(32),
  remark: z.string().max(64).optional(),
});

// POST /requests
router.post('/requests', async (req, res, next) => {
  try {
    const body = RequestSchema.parse(req.body);
    if (body.friendId === req.user.uid) {
      throw new AppError('cannot add yourself', 1301, 400);
    }
    const friend = await User.findById(body.friendId);
    if (!friend) throw new AppError('friend not found', 1302, 404);

    // 已是好友则直接返回成功
    const pair = await Friend.findPair(req.user.uid, body.friendId);
    const accepted = pair.find((p) => p.status === 'accepted');
    if (accepted) return ok(res, { alreadyFriend: true });

    await Friend.createRequest({
      userId: req.user.uid,
      friendId: body.friendId,
      remark: body.remark,
    });

    // 实时推送好友请求通知给对方
    const io = req.app.io;
    if (io) {
      const me = await User.findById(req.user.uid);
      io.to(`user:${body.friendId}`).emit('FRIEND_REQUEST_NOTIFY', {
        fromUserId: String(req.user.uid),
        fromNickname: me?.nickname || me?.username || '',
        fromAccount: me?.username || '',
        fromAvatar: me?.avatar || '',
        remark: body.remark || '',
      });
    }
    return ok(res, { sent: true });
  } catch (err) { next(err); }
});

// GET /requests
router.get('/requests', async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const list = await Friend.findRequests(req.user.uid, status);
    return ok(res, list);
  } catch (err) { next(err); }
});

// POST /requests/:id/accept
router.post('/requests/:id/accept', async (req, res, next) => {
  try {
    const requesterId = req.params.id;
    const me = req.user.uid;
    const pair = await Friend.findPair(requesterId, me);
    const pending = pair.find(
      (p) => String(p.user_id) === String(requesterId) && String(p.friend_id) === String(me) && p.status === 'pending'
    );
    if (!pending) throw new AppError('request not found', 1303, 404);

    await Friend.acceptRequest(requesterId, me);

    // 通知请求方：好友请求已被接受
    const io = req.app.io;
    if (io) {
      const meUser = await User.findById(me);
      io.to(`user:${requesterId}`).emit('FRIEND_ACCEPTED_NOTIFY', {
        userId: String(me),
        nickname: meUser?.nickname || meUser?.username || '',
        avatar: meUser?.avatar || '',
      });
    }
    return ok(res, { accepted: true });
  } catch (err) { next(err); }
});

// DELETE /requests/:id
router.delete('/requests/:id', async (req, res, next) => {
  try {
    const requesterId = req.params.id;
    await Friend.rejectRequest(requesterId, req.user.uid);
    return ok(res, { rejected: true });
  } catch (err) { next(err); }
});

// GET /me 好友列表
router.get('/me', async (req, res, next) => {
  try {
    const list = await Friend.listFriends(req.user.uid);
    return ok(res, list);
  } catch (err) { next(err); }
});

// DELETE /:id 删除好友（双向记录一起删除）
router.delete('/:id', async (req, res, next) => {
  try {
    const friendId = req.params.id;
    if (String(friendId) === String(req.user.uid)) {
      throw new AppError('cannot remove yourself', 1305, 400);
    }
    const pair = await Friend.findPair(req.user.uid, friendId);
    const accepted = pair.find((p) => p.status === 'accepted');
    if (!accepted) throw new AppError('not friends', 1306, 404);
    await Friend.deletePair(req.user.uid, friendId);
    return ok(res, { removed: true });
  } catch (err) { next(err); }
});

export default router;
