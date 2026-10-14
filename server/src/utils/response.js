/**
 * 统一响应工具：{ code, data, message }
 * code = 0 成功，非 0 失败
 */

export function ok(res, data = null, message = 'ok') {
  return res.status(200).json({ code: 0, data, message });
}

export function fail(res, code = -1, message = 'error', status = 400) {
  return res.status(status).json({ code, data: null, message });
}

/**
 * 业务异常（在 service/middleware 中抛出）
 */
export class AppError extends Error {
  constructor(message, code = -1, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export default { ok, fail, AppError };
