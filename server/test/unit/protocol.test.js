/**
 * 协议层单元测试：zod 验签 + 包构造
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import protocol, {
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
} from '../../src/utils/protocol.js';

test('MsgChatSchema 接受合法单聊文本包', () => {
  const r = MsgChatSchema.parse({
    requestId: 'r1', toId: '2', toType: 'single', contentType: 'text', content: 'hi',
  });
  assert.equal(r.toType, 'single');
});

test('MsgChatSchema 拒绝非法 toType / 空 requestId', () => {
  assert.throws(() => MsgChatSchema.parse({
    requestId: 'r1', toId: '2', toType: 'bad', contentType: 'text', content: 'x',
  }));
  assert.throws(() => MsgChatSchema.parse({
    requestId: '', toId: '2', toType: 'single', contentType: 'text', content: 'x',
  }));
});

test('MsgChatSchema 支持对象 content（image/voice）', () => {
  const r = MsgChatSchema.parse({
    requestId: 'r2', toId: '3', toType: 'group', contentType: 'image',
    content: { url: 'http://x/a.png', size: 10 },
  });
  assert.equal(r.contentType, 'image');
});

test('MsgReadSchema / DeliveredAckSchema 限制 seqIds 数量 1..200', () => {
  assert.throws(() => MsgReadSchema.parse({ seqIds: [] }));
  assert.throws(() => MsgReadSchema.parse({ seqIds: Array(201).fill('1') }));
  assert.doesNotThrow(() => DeliveredAckSchema.parse({ seqIds: ['1', '2'] }));
});

test('RecallSchema 要求非空 seqId', () => {
  assert.throws(() => RecallSchema.parse({ seqId: '' }));
  assert.doesNotThrow(() => RecallSchema.parse({ seqId: '9' }));
});

test('buildAck 返回 MSG_ACK 结构', () => {
  const p = buildAck('r1', '5');
  assert.equal(p.type, 'MSG_ACK');
  assert.deepEqual(p.payload, { requestId: 'r1', seqId: '5' });
});

test('buildRoute / buildReadNotify / buildRecallNotify / buildDeliveredNotify / buildRecallAck 结构正确', () => {
  const msg = { seqId: '1' };
  assert.deepEqual(buildRoute(msg), { type: 'MSG_ROUTE', payload: msg });
  assert.deepEqual(buildReadNotify('2', ['1']), { type: 'MSG_READ_NOTIFY', payload: { fromId: '2', seqIds: ['1'] } });
  assert.deepEqual(buildRecallNotify('3'), { type: 'MSG_RECALL_NOTIFY', payload: { seqId: '3' } });
  assert.deepEqual(buildDeliveredNotify(['4']), { type: 'MSG_ROUTE_DELIVERED_NOTIFY', payload: { seqIds: ['4'] } });
  assert.deepEqual(buildRecallAck('5'), { type: 'MSG_RECALL_ACK', payload: { seqId: '5' } });
});

test('buildPing / buildPong / buildKickOut', () => {
  assert.equal(buildPing().type, 'SYS_PING');
  const pong = buildPong(123);
  assert.equal(pong.type, 'SYS_PONG');
  assert.equal(pong.payload.ts, 123);
  assert.ok(pong.payload.serverTs >= 123);
  assert.equal(buildKickOut().payload.reason, 'new_device_login');
});

test('default export 聚合所有构造函数', () => {
  assert.equal(typeof protocol.buildAck, 'function');
  assert.equal(typeof protocol.MsgChatSchema.parse, 'function');
});
