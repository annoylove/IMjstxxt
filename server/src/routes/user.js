/**
 * user 路由
 * GET /me  PATCH /me  GET /users/:id
 */
import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { ok, AppError } from '../utils/response.js';
import User from '../models/mysql/User.js';

const router = express.Router();

const UpdateMeSchema = z.object({
  nickname: z.string().max(32).optional(),
  avatar: z.string().max(512).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'no fields to update' });

// 新密码强度：8-64 位，至少包含字母和数字
const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1).max(64),
  newPassword: z
    .string()
    .min(8, '新密码至少 8 位')
    .max(64)
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, '新密码需同时包含字母和数字'),
});

// GET /me
router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.uid);
    if (!user) throw new AppError('user not found', 1201, 404);
    return ok(res, user);
  } catch (err) { next(err); }
});

// PATCH /me
router.patch('/me', async (req, res, next) => {
  try {
    const body = UpdateMeSchema.parse(req.body);
    await User.updateProfile(req.user.uid, body);
    const user = await User.findById(req.user.uid);
    return ok(res, user);
  } catch (err) { next(err); }
});

// GET /search?keyword=xxx
router.get('/search', async (req, res, next) => {
  try {
    const keyword = (req.query.keyword || '').trim();
    if (!keyword) return ok(res, []);
    const rows = await User.search(keyword);
    const filtered = rows.filter((r) => String(r.id) !== String(req.user.uid));
    return ok(res, filtered);
  } catch (err) { next(err); }
});

// POST /password 修改密码（原密码校验 + 新密码强度校验）
router.post('/password', async (req, res, next) => {
  try {
    const body = ChangePasswordSchema.parse(req.body);
    // findByUsername 带 password_hash（findById 的列不含）
    const target = await User.findByUsername(req.user.username);
    if (!target || String(target.id) !== String(req.user.uid)) {
      throw new AppError('user not found', 1201, 404);
    }

    const okOld = await bcrypt.compare(body.oldPassword, target.password_hash);
    if (!okOld) throw new AppError('原密码不正确', 1204, 400);

    const sameAsOld = await bcrypt.compare(body.newPassword, target.password_hash);
    if (sameAsOld) throw new AppError('新密码不能与原密码相同', 1205, 400);

    const hash = await bcrypt.hash(body.newPassword, 10);
    await User.updatePassword(req.user.uid, hash);
    return ok(res, { changed: true });
  } catch (err) { next(err); }
});

// GET /:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('user not found', 1201, 404);
    return ok(res, user);
  } catch (err) { next(err); }
});

export default router;
