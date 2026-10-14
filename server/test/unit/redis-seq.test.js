/**
 * FakeRedis（fallback 模式）与 seq 服务单元测试
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getRedis } from '../../src/db/redis.js';
import { nextSeqId, peekSeqId } from '../../src/services/seq.service.js';

test('FakeRedis incr 单调递增、get 返回字符串', async () => {
  const r = getRedis();
  const key = 'test:incr:' + Date.now();
  assert.equal(await r.get(key), null);
  assert.equal(await r.incr(key), 1);
  assert.equal(await r.incr(key), 2);
  assert.equal(await r.get(key), '2');
});

test('FakeRedis set/get/del 基本流程', async () => {
  const r = getRedis();
  const key = 'test:set:' + Date.now();
  assert.equal(await r.set(key, 'v1'), 'OK');
  assert.equal(await r.get(key), 'v1');
  assert.equal(await r.del(key), 1);
  assert.equal(await r.get(key), null);
});

test('FakeRedis set NX 已存在时不覆盖', async () => {
  const r = getRedis();
  const key = 'test:nx:' + Date.now();
  await r.set(key, 'a');
  assert.equal(await r.set(key, 'b', 'NX'), 'null');
  assert.equal(await r.get(key), 'a');
});

test('FakeRedis zadd/zcard/zremrangebyscore', async () => {
  const r = getRedis();
  const key = 'test:zset:' + Date.now();
  await r.zadd(key, 10, 'm1');
  await r.zadd(key, 20, 'm2');
  await r.zadd(key, 30, 'm3');
  assert.equal(await r.zcard(key), 3);
  const removed = await r.zremrangebyscore(key, 0, 20);
  assert.equal(removed, 2);
  assert.equal(await r.zcard(key), 1);
});

test('FakeRedis hash 操作 hset/hget/hgetall/hdel', async () => {
  const r = getRedis();
  const key = 'test:hash:' + Date.now();
  await r.hset(key, 'f1', 'v1');
  await r.hset(key, 'f2', 'v2');
  assert.equal(await r.hget(key, 'f1'), 'v1');
  const all = await r.hgetall(key);
  assert.deepEqual(all, { f1: 'v1', f2: 'v2' });
  assert.equal(await r.hdel(key, 'f1'), 1);
  assert.equal(await r.hget(key, 'f1'), null);
});

test('nextSeqId 返回递增字符串，peekSeqId 可见当前值', async () => {
  const before = Number(await peekSeqId());
  const s1 = await nextSeqId();
  const s2 = await nextSeqId();
  assert.equal(typeof s1, 'string');
  assert.equal(Number(s2), Number(s1) + 1);
  assert.ok(Number(s1) > before);
});
