/**
 * 离线消息拉取
 * 1) 按 lastMsgSeqId 查 MongoDB（跨月分集合）
 * 2) 合并 Redis 中"本次在线期间"收到但未 ack 的内存队列（可选，预留给未来扩展）
 */
import { fetchMessagesAfter } from '../db/mongo.js';

/**
 * @param {string} toId       目标用户 / 群
 * @param {'single'|'group'} toType
 * @param {string} lastMsgSeqId 客户端已收到的最大 seqId，空则拉全量（但仍分页）
 * @param {number} limit      上限 200
 */
export async function pullOffline({ toId, toType, lastMsgSeqId = '0', limit = 200 }) {
  const msgs = await fetchMessagesAfter(toId, toType, lastMsgSeqId, Math.min(limit, 200));
  return msgs;
}

export default { pullOffline };
