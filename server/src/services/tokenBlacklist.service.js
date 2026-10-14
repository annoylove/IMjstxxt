/**
 * JWT 吊销黑名单（登出即失效）
 * - key = sha256(token)，value = token 的 exp 时间戳（到期自动清理，不无限增长）
 * - 内存版仅对单进程有效；多实例部署需迁移 Redis SET + TTL（与 fallback/real 双模式约定一致）
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const revoked = new Map(); // sha256hex -> expMs

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** 吊销一个 token（按其 exp 记录；解不出 exp 时兜底 24h） */
export function revokeToken(token) {
  if (!token) return;
  const payload = jwt.decode(token);
  const expMs = payload?.exp ? payload.exp * 1000 : Date.now() + 24 * 3600 * 1000;
  revoked.set(hash(token), expMs);
}

/** 判断 token 是否已被吊销（过期的黑名单条目顺手清除） */
export function isTokenRevoked(token) {
  if (!token) return false;
  const key = hash(token);
  const exp = revoked.get(key);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    revoked.delete(key);
    return false;
  }
  return true;
}

// 定时清理已过期条目（unref：不阻止进程退出）
setInterval(() => {
  const now = Date.now();
  for (const [key, exp] of revoked) {
    if (now > exp) revoked.delete(key);
  }
}, 10 * 60 * 1000).unref();

export default { revokeToken, isTokenRevoked };
