/**
 * 统一错误处理中间件
 * 放最后，必须四个参数
 */
import { ZodError } from 'zod';
import { fail } from '../utils/response.js';
import logger from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, req, res, _next) {
  // AppError（业务抛）
  if (err?.name === 'AppError') {
    return fail(res, err.code ?? -1, err.message, err.status ?? 400);
  }

  // Zod 校验错误
  if (err instanceof ZodError) {
    const msg = err.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return fail(res, 2001, `validation failed: ${msg}`, 400);
  }

  // MySQL 错误
  if (err?.code === 'ER_DUP_ENTRY') {
    return fail(res, 3001, 'duplicate entry', 409);
  }
  if (typeof err?.code === 'string' && err.code.startsWith('ER_')) {
    logger.error('[MySQL]', err.message);
    return fail(res, 3002, 'database error', 500);
  }

  // Mongo 错误
  if (err?.name === 'MongoError' || err?.name === 'CastError' || err?.name === 'ValidationError') {
    logger.error('[Mongo]', err.message);
    return fail(res, 4001, 'storage error', 500);
  }

  // 默认 500
  logger.error('[Unhandled]', err?.stack || err);
  return fail(res, 5000, err?.message || 'internal server error', 500);
}

export default errorMiddleware;
