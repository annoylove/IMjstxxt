/**
 * 消息风暴限频 —— 滑动窗口
 * Redis ZSET: im:flood:{uid}   score = timestamp
 *
 * shouldDrop(uid): 当前 1s 内超过 maxPerWindow 则返回 true，上层 socket 可启用"合并推送"
 * markFlood(uid): 每发一条调一次，清理过期 + 计数
 */
import { getRedis } from '../db/redis.js';
import config from '../config/index.js';

const KEY_PREFIX = 'im:flood';

async function cleanup(uid, now, windowMs) {
  const r = getRedis();
  await r.zremrangebyscore(`${KEY_PREFIX}:${uid}`, 0, now - windowMs);
}

export async function markFlood(uid) {
  const r = getRedis();
  const now = Date.now();
  const key = `${KEY_PREFIX}:${uid}`;
  await cleanup(uid, now, config.flood.windowMs);
  // 用 now + 随机小数做 score，保证唯一
  const score = now + Math.random() * 1e-6;
  await r.zadd(key, score, `${uid}:${now}:${Math.random().toString(36).slice(2, 8)}`);
  await r.expire(key, config.flood.windowMs * 2);
  const count = await r.zcard(key);
  return count;
}

export async function shouldDrop(uid) {
  const r = getRedis();
  const now = Date.now();
  await cleanup(uid, now, config.flood.windowMs);
  const count = await r.zcard(`${KEY_PREFIX}:${uid}`);
  return count > config.flood.maxPerWindow;
}

export async function getWindowCount(uid) {
  const r = getRedis();
  return r.zcard(`${KEY_PREFIX}:${uid}`);
}

export default { markFlood, shouldDrop, getWindowCount };
