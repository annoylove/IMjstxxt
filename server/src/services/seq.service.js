/**
 * 全局 seqId 生成器
 * Redis INCR im:seq:global → 单调递增字符串
 *
 * fallback 模式下 Redis 是内存态，进程重启后归零，会与已持久化的消息 seqId 冲突，
 * 导致新消息被 upsertMessage 静默丢弃。因此启动时需用 getMaxSeqId() 播种计数器。
 */
import { getRedis } from '../db/redis.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const KEY = 'im:seq:global';

export async function nextSeqId() {
  const r = getRedis();
  const n = await r.incr(KEY);
  return String(n);
}

export async function peekSeqId() {
  const r = getRedis();
  const n = await r.get(KEY);
  return n ? String(n) : '0';
}

/**
 * 播种全局计数器：确保内存计数器 >= 已持久化的最大 seqId。
 * 仅 fallback 模式需要（真实 Redis 本身持久化）。
 */
export async function seedSeqId() {
  if (config.storage.mode === 'real') return;
  try {
    const { getMaxSeqId } = await import('../db/mongo.js');
    const max = await getMaxSeqId();
    const r = getRedis();
    const cur = Number((await r.get(KEY)) || '0');
    if (max > cur) {
      await r.set(KEY, String(max));
      logger.info(`[Seq] 播种全局 seqId 计数器: ${cur} → ${max}`);
    }
  } catch (err) {
    logger.warn(`[Seq] seedSeqId failed: ${err.message}`);
  }
}

export default { nextSeqId, peekSeqId, seedSeqId };
