/**
 * Session + 在线状态 + 多端互踢
 *
 * Redis Hash  im:sessions:{userId}   field = socketId, value = {device, lastSeen} (JSON)
 * Redis Set   im:online              存所有在线 uid
 * Redis Set   im:kickout:{uid}       需要踢掉的 socketId 集合
 */
import { getRedis } from '../db/redis.js';

const SESSION_HNS = 'im:sessions';
const ONLINE_SET = 'im:online';
const KICKOUT_HNS = 'im:kickout';

function sessKey(uid) { return `${SESSION_HNS}:${uid}`; }
function kickKey(uid) { return `${KICKOUT_HNS}:${uid}`; }

/** 用户上线 */
export async function bind(uid, socketId, device = 'web') {
  const r = getRedis();
  await r.hset(sessKey(uid), socketId, JSON.stringify({ device, lastSeen: Date.now() }));
  await r.sadd(ONLINE_SET, uid);
}

/** 用户断线 */
export async function unbind(uid, socketId) {
  const r = getRedis();
  await r.hdel(sessKey(uid), socketId);
  const remain = await r.hlen(sessKey(uid));
  if (remain === 0) {
    await r.srem(ONLINE_SET, uid);
  }
}

/** 刷新心跳 */
export async function touch(uid, socketId) {
  const r = getRedis();
  const raw = await r.hget(sessKey(uid), socketId);
  if (!raw) return;
  try {
    const info = JSON.parse(raw);
    info.lastSeen = Date.now();
    await r.hset(sessKey(uid), socketId, JSON.stringify(info));
  } catch {
    // ignore
  }
}

/** 获取用户所有在线 socketId */
export async function getSocketIds(uid) {
  const r = getRedis();
  const map = await r.hgetall(sessKey(uid));
  return Object.keys(map);
}

/** 判断是否在线 */
export async function isOnline(uid) {
  const r = getRedis();
  return (await r.sismember(ONLINE_SET, uid)) === 1;
}

/** 多端互踢：把其他 socketId 加入 kickout set，返回要踢的 socketId 列表 */
export async function kickOut(uid, keepSocketId = null) {
  const r = getRedis();
  const all = await getSocketIds(uid);
  const targets = keepSocketId ? all.filter((s) => s !== keepSocketId) : all;
  if (targets.length === 0) return [];
  if (targets.length === 1) {
    // 单条用 sadd 即可
    await r.sadd(kickKey(uid), targets[0]);
  } else {
    await r.sadd(kickKey(uid), ...targets);
  }
  return targets;
}

/** 消费并清除踢掉标记（socket 断开时调用） */
export async function consumeKick(uid, socketId) {
  const r = getRedis();
  await r.srem(kickKey(uid), socketId);
}

/** 清空（用户登出时调用） */
export async function clearAll(uid) {
  const r = getRedis();
  await r.del(sessKey(uid));
  await r.srem(ONLINE_SET, uid);
  await r.del(kickKey(uid));
}

export default {
  bind,
  unbind,
  touch,
  getSocketIds,
  isOnline,
  kickOut,
  consumeKick,
  clearAll,
};
