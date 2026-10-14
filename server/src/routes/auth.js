/**
 * auth 路由
 * POST /register  POST /login  POST /refresh
 */
import express from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import config from '../config/index.js';
import { ok, fail, AppError } from '../utils/response.js';
import User from '../models/mysql/User.js';
import session from '../services/session.service.js';
import { revokeToken } from '../services/tokenBlacklist.service.js';

const router = express.Router();

// —— zod schemas ——
const RegisterSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6).max(64),
  nickname: z.string().max(32).optional(),
  avatar: z.string().max(512).optional(),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  device: z.string().max(32).optional(),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// —— 工具 ——
function issueTokens({ uid, username }) {
  const accessToken = jwt.sign({ uid, username }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ uid, username, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
}

// —— POST /register ——
router.post('/register', async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);

    const exists = await User.findByUsername(body.username);
    if (exists) throw new AppError('username already exists', 1101, 409);

    const hash = await bcrypt.hash(body.password, 10);
    const id = await User.create({
      username: body.username,
      passwordHash: hash,
      nickname: body.nickname,
      avatar: body.avatar,
    });

    const { accessToken, refreshToken } = issueTokens({ uid: String(id), username: body.username });
    return ok(res, { uid: String(id), username: body.username, accessToken, refreshToken });
  } catch (err) { next(err); }
});

// —— POST /login ——
router.post('/login', async (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);

    const user = await User.findByUsername(body.username);
    if (!user) throw new AppError('invalid credentials', 1102, 401);

    const okPwd = await bcrypt.compare(body.password, user.password_hash);
    if (!okPwd) throw new AppError('invalid credentials', 1102, 401);

    if (user.status !== 1) throw new AppError('account disabled', 1103, 403);

    const { accessToken, refreshToken } = issueTokens({
      uid: String(user.id),
      username: user.username,
    });

    // 记录设备登录（但此时没 socket，跳过 bind 只给 HTTP 用）
    return ok(res, {
      uid: String(user.id),
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      accessToken,
      refreshToken,
    });
  } catch (err) { next(err); }
});

// —— POST /refresh ——
router.post('/refresh', async (req, res, next) => {
  try {
    const body = RefreshSchema.parse(req.body);
    let payload;
    try {
      payload = jwt.verify(body.refreshToken, config.jwt.secret);
    } catch (err) {
      throw new AppError('invalid refresh token', 1104, 401);
    }
    if (payload.type !== 'refresh') throw new AppError('invalid refresh token', 1104, 401);

    // 校验用户存在
    const user = await User.findById(payload.uid);
    if (!user) throw new AppError('user not found', 1105, 404);

    const { accessToken, refreshToken: newRefresh } = issueTokens({
      uid: String(user.id),
      username: user.username,
    });
    return ok(res, { accessToken, refreshToken: newRefresh });
  } catch (err) { next(err); }
});

// —— POST /logout ——
// 吊销当前 accessToken（Authorization header）与可选的 refreshToken（body），登出即失效
router.post('/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const access = header.startsWith('Bearer ') ? header.slice(7) : (req.body?.accessToken || '');
  const refresh = req.body?.refreshToken || '';
  if (!access && !refresh) throw new AppError('missing token', 1106, 400);
  if (access) revokeToken(access);
  if (refresh) revokeToken(refresh);
  return ok(res, { revoked: true });
});

export default router;
