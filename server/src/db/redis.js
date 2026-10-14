/**
 * Redis / 内存 fallback 双模式
 *
 * STORAGE_MODE=real     → ioredis（真实 Redis）
 * STORAGE_MODE=fallback → 纯 JS 内存 Map/Set/ZSet（进程内）
 */
import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let client = null;

// —— ZSet 简易实现 ——
class FakeZSet {
  constructor() { this.items = []; } // [{score, member}]
  add(score, member) {
    const idx = this.items.findIndex((i) => i.member === member);
    if (idx >= 0) {
      this.items[idx].score = score;
    } else {
      this.items.push({ score, member });
    }
    this.items.sort((a, b) => a.score - b.score);
  }
  remRangeByScore(min, max) {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.score < min || i.score > max);
    return before - this.items.length;
  }
  card() { return this.items.length; }
}

// —— 内存存储 ——
const mem = {
  strings: new Map(),  // key → string
  hashes: new Map(),   // key → Map(field → value)
  sets: new Map(),     // key → Set(member)
  zsets: new Map(),    // key → FakeZSet
  expiries: new Map(), // key → timestamp ms
};

function _checkExpiry(key) {
  const t = mem.expiries.get(key);
  if (t && Date.now() > t) {
    mem.strings.delete(key);
    mem.hashes.delete(key);
    mem.sets.delete(key);
    mem.zsets.delete(key);
    mem.expiries.delete(key);
  }
}

class FakeRedis {
  incr(key) {
    _checkExpiry(key);
    const cur = Number(mem.strings.get(key) || '0');
    const n = cur + 1;
    mem.strings.set(key, String(n));
    return Promise.resolve(n);
  }

  get(key) {
    _checkExpiry(key);
    return Promise.resolve(mem.strings.get(key) ?? null);
  }

  async set(key, value, ...rest) {
    let ttlMs = null;
    let nx = false;
    for (let i = 0; i < rest.length; i += 2) {
      const flag = rest[i]?.toString().toUpperCase();
      const val = rest[i + 1];
      if (flag === 'PX') ttlMs = Number(val);
      if (flag === 'EX') ttlMs = Number(val) * 1000;
      if (flag === 'NX') nx = true;
    }
    if (nx && mem.strings.has(key)) return 'null';
    mem.strings.set(key, String(value));
    if (ttlMs) mem.expiries.set(key, Date.now() + ttlMs);
    return 'OK';
  }

  hset(key, field, value) {
    _checkExpiry(key);
    let h = mem.hashes.get(key);
    if (!h) { h = new Map(); mem.hashes.set(key, h); }
    h.set(String(field), String(value));
    return Promise.resolve(1);
  }

  hdel(key, field) {
    _checkExpiry(key);
    const h = mem.hashes.get(key);
    if (!h) return Promise.resolve(0);
    return Promise.resolve(h.delete(String(field)) ? 1 : 0);
  }

  hlen(key) {
    _checkExpiry(key);
    const h = mem.hashes.get(key);
    return Promise.resolve(h ? h.size : 0);
  }

  hget(key, field) {
    _checkExpiry(key);
    const h = mem.hashes.get(key);
    return Promise.resolve(h?.get(String(field)) ?? null);
  }

  hgetall(key) {
    _checkExpiry(key);
    const h = mem.hashes.get(key);
    if (!h) return Promise.resolve({});
    const obj = {};
    for (const [k, v] of h) obj[k] = v;
    return Promise.resolve(obj);
  }

  sadd(key, ...members) {
    _checkExpiry(key);
    let s = mem.sets.get(key);
    if (!s) { s = new Set(); mem.sets.set(key, s); }
    let added = 0;
    for (const m of members) { if (!s.has(m)) { s.add(m); added++; } }
    return Promise.resolve(added);
  }

  srem(key, ...members) {
    _checkExpiry(key);
    const s = mem.sets.get(key);
    if (!s) return Promise.resolve(0);
    let rm = 0;
    for (const m of members) { if (s.delete(m)) rm++; }
    return Promise.resolve(rm);
  }

  sismember(key, member) {
    _checkExpiry(key);
    const s = mem.sets.get(key);
    return Promise.resolve(s?.has(member) ? 1 : 0);
  }

  zadd(key, score, member) {
    _checkExpiry(key);
    let z = mem.zsets.get(key);
    if (!z) { z = new FakeZSet(); mem.zsets.set(key, z); }
    z.add(Number(score), String(member));
    return Promise.resolve(1);
  }

  zremrangebyscore(key, min, max) {
    _checkExpiry(key);
    const z = mem.zsets.get(key);
    return Promise.resolve(z ? z.remRangeByScore(Number(min), Number(max)) : 0);
  }

  zcard(key) {
    _checkExpiry(key);
    const z = mem.zsets.get(key);
    return Promise.resolve(z ? z.card() : 0);
  }

  expire(key, ttlSec) {
    mem.expiries.set(key, Date.now() + Number(ttlSec) * 1000);
    return Promise.resolve(1);
  }

  del(...keys) {
    let n = 0;
    for (const k of keys) {
      if (mem.strings.has(k) || mem.hashes.has(k) || mem.sets.has(k) || mem.zsets.has(k)) {
        mem.strings.delete(k);
        mem.hashes.delete(k);
        mem.sets.delete(k);
        mem.zsets.delete(k);
        mem.expiries.delete(k);
        n++;
      }
    }
    return Promise.resolve(n);
  }

  ping() { return Promise.resolve('PONG'); }

  quit() { return Promise.resolve('OK'); }

  duplicate() { return this; } // pub/sub 场景 stub
  eval() { return Promise.resolve(0); } // 分布式锁 Lua stub
}

// —— 真实 Redis 创建 ——
function _createRealRedis() {
  const { host, port, password } = config.redis;
  if (host.includes(',')) {
    const nodes = host.split(',').map((h) => {
      const [ip, p] = h.trim().split(':');
      return { host: ip, port: Number(p) || port };
    });
    const r = new Redis.Cluster(nodes, { redisOptions: { password, lazyConnect: true } });
    client = r;
  } else {
    client = new Redis({
      host, port, password,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) { return Math.min(times * 200, 3000); },
    });
  }
  client.on('connect', () => logger.info('[Redis] connected'));
  client.on('ready', () => logger.info('[Redis] ready'));
  client.on('error', (err) => logger.warn(`[Redis] error: ${err.message}`));
  return client;
}

export function createRedis() {
  if (config.storage.mode === 'real') {
    client = _createRealRedis();
  } else {
    client = new FakeRedis();
    logger.info('[Redis] 走 fallback(内存) 模式');
  }
  return client;
}

export function getRedis() {
  if (!client) createRedis();
  return client;
}

export async function connectRedis() {
  try {
    const c = createRedis();
    await c.ping();
  } catch (err) {
    logger.warn(`[Redis] init ping failed: ${err.message}`);
  }
}

export async function acquireLock(key, ttlMs = 3000) {
  const c = getRedis();
  const token = Math.random().toString(36).slice(2);
  const ok = await c.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  return ok === 'OK' ? { token, release: () => releaseLock(key, token) } : null;
}
async function releaseLock(key, token) { await getRedis().del(`lock:${key}`); }

export async function closeRedis() {
  if (client?.quit) await client.quit();
  client = null;
}

export default { createRedis, getRedis, connectRedis, acquireLock, closeRedis };
