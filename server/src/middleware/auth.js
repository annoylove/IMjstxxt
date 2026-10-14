/**
 * JWT 认证中间件
 * 作用于 /api/v1 下所有路由（auth 路由除外）
 */
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { AppError } from '../utils/response.js';
import { isTokenRevoked } from '../services/tokenBlacklist.service.js';

export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError('missing token', 1001, 401);

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (isTokenRevoked(token)) throw new AppError('token revoked', 1004, 401);
    req.user = { uid: payload.uid, username: payload.username };
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError('token expired', 1002, 401);
    }
    throw new AppError('invalid token', 1003, 401);
  }
}

export default authMiddleware;
