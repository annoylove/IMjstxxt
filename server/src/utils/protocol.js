/**
 * 协议包构造 + zod 验签
 */
import { z } from 'zod';

// MSG_CHAT 客户端 → 服务端
export const MsgChatSchema = z.object({
  requestId: z.string().min(1).max(64),
  toId: z.string().min(1).max(64),
  toType: z.enum(['single', 'group']),
  contentType: z.enum(['text', 'image', 'voice', 'system', 'recall']),
  content: z.union([z.string(), z.record(z.unknown())]),
});

// MSG_READ
export const MsgReadSchema = z.object({
  seqIds: z.array(z.string().min(1)).min(1).max(200),
});

// MSG_RECALL
export const RecallSchema = z.object({
  seqId: z.string().min(1).max(64),
});

// MSG_DELIVERED_ACK（接收方客户端 → 服务端，确认收到）
export const DeliveredAckSchema = z.object({
  seqIds: z.array(z.string().min(1)).min(1).max(200),
});

// 构造 MSG_ACK
export function buildAck(requestId, seqId) {
  return {
    type: 'MSG_ACK',
    payload: { requestId, seqId },
  };
}

// 构造 MSG_ROUTE（服务端 → 接收方）
export function buildRoute(msg) {
  return {
    type: 'MSG_ROUTE',
    payload: msg,
  };
}

// 构造 MSG_READ_NOTIFY（通知发送方对方已读）
export function buildReadNotify(fromId, seqIds) {
  return {
    type: 'MSG_READ_NOTIFY',
    payload: { fromId, seqIds },
  };
}

// 构造 MSG_RECALL_NOTIFY（服务端 → 接收方，通知消息被撤回）
export function buildRecallNotify(seqId) {
  return {
    type: 'MSG_RECALL_NOTIFY',
    payload: { seqId },
  };
}

// 构造 MSG_ROUTE_DELIVERED_NOTIFY（服务端 → 发送方，对方在线已收到）
export function buildDeliveredNotify(seqIds) {
  return {
    type: 'MSG_ROUTE_DELIVERED_NOTIFY',
    payload: { seqIds },
  };
}

// 构造 MSG_RECALL 内部包（服务端 → 发送方 ACK）
export function buildRecallAck(seqId) {
  return {
    type: 'MSG_RECALL_ACK',
    payload: { seqId },
  };
}

// 构造 SYS_PING / PONG
export function buildPing() {
  return { type: 'SYS_PING', payload: { ts: Date.now() } };
}
export function buildPong(ts) {
  return { type: 'SYS_PONG', payload: { ts, serverTs: Date.now() } };
}

// 构造 SYS_KICK_OUT
export function buildKickOut(reason = 'new_device_login') {
  return { type: 'SYS_KICK_OUT', payload: { reason } };
}

export default {
  MsgChatSchema,
  MsgReadSchema,
  RecallSchema,
  DeliveredAckSchema,
  buildAck,
  buildRoute,
  buildReadNotify,
  buildRecallNotify,
  buildDeliveredNotify,
  buildRecallAck,
  buildPing,
  buildPong,
  buildKickOut,
};
