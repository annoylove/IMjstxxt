/**
 * group 路由（挂载于 /api/v1/groups，路径均为挂载点相对路径）
 * POST /                   创建群（自动加 owner）
 * GET  /                   我所在的群列表
 * GET  /:id                群信息
 * POST /join               凭群号自助入群（body.groupNo）
 * POST /:id/join           管理员加人（body.userId）
 * POST /:id/leave          退群
 * GET  /:id/members        成员列表
 */
import express from 'express';
import { z } from 'zod';

import { ok, AppError } from '../utils/response.js';
import Group from '../models/mysql/Group.js';
import Member from '../models/mysql/Member.js';
import User from '../models/mysql/User.js';

const router = express.Router();

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(64),
  avatar: z.string().max(512).optional(),
  memberIds: z.array(z.string().min(1).max(32)).max(200).optional(),
});

const JoinSchema = z.object({
  userId: z.string().min(1).max(32),
});

const JoinByNoSchema = z.object({
  groupNo: z.string().min(1).max(32),
});

// POST /
router.post('/', async (req, res, next) => {
  try {
    const body = CreateGroupSchema.parse(req.body);
    const id = await Group.create({
      name: body.name,
      avatar: body.avatar,
      ownerId: req.user.uid,
    });

    // 建群时拉人：去重、跳过 owner，已存在的成员不重复加（addMember 会无条件 +1 计数）
    const ownerKey = String(req.user.uid);
    const seen = new Set([ownerKey]);
    let added = 0;
    for (const raw of body.memberIds || []) {
      const uid = String(raw);
      if (seen.has(uid)) continue;
      seen.add(uid);
      const target = await User.findById(uid);
      if (!target) continue;
      const exist = await Member.findOne(id, uid);
      if (exist) continue;
      await Member.addMember(id, uid);
      added += 1;
    }
    return ok(res, { id: String(id), added });
  } catch (err) { next(err); }
});

// GET /
router.get('/', async (req, res, next) => {
  try {
    const list = await Group.listByMember(req.user.uid);
    return ok(res, list);
  } catch (err) { next(err); }
});

// POST /join  凭群号自助入群
router.post('/join', async (req, res, next) => {
  try {
    const body = JoinByNoSchema.parse(req.body);
    const group = await Group.findById(body.groupNo);
    if (!group) throw new AppError('group not found', 1401, 404);
    const me = await Member.findOne(body.groupNo, req.user.uid);
    if (me) return ok(res, { joined: true, already: true });
    await Member.addMember(body.groupNo, req.user.uid);
    return ok(res, { joined: true });
  } catch (err) { next(err); }
});

// GET /:id
router.get('/:id', async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) throw new AppError('group not found', 1401, 404);
    // 校验是否成员
    const m = await Member.findOne(req.params.id, req.user.uid);
    if (!m) throw new AppError('not a member', 1402, 403);
    return ok(res, group);
  } catch (err) { next(err); }
});

// POST /:id/join
router.post('/:id/join', async (req, res, next) => {
  try {
    const body = JoinSchema.parse(req.body);
    const group = await Group.findById(req.params.id);
    if (!group) throw new AppError('group not found', 1401, 404);

    // 操作者必须是群成员（owner/admin）
    const me = await Member.findOne(req.params.id, req.user.uid);
    if (!me) throw new AppError('not a member', 1402, 403);
    if (me.role === 'member') throw new AppError('no permission', 1403, 403);

    const target = await User.findById(body.userId);
    if (!target) throw new AppError('user not found', 1404, 404);

    await Member.addMember(req.params.id, body.userId);
    return ok(res, { joined: true });
  } catch (err) { next(err); }
});

// POST /:id/leave
router.post('/:id/leave', async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) throw new AppError('group not found', 1401, 404);
    if (String(group.owner_id) === String(req.user.uid)) {
      throw new AppError('owner cannot leave directly', 1405, 400);
    }
    const del = await Member.removeMember(req.params.id, req.user.uid);
    return ok(res, del.affectedRows > 0 ? { left: true } : { left: false, reason: 'not member' });
  } catch (err) { next(err); }
});

// GET /:id/members
router.get('/:id/members', async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) throw new AppError('group not found', 1401, 404);
    const list = await Member.listByGroup(req.params.id);
    return ok(res, list);
  } catch (err) { next(err); }
});

export default router;
