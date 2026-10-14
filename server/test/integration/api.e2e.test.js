/**
 * 集成测试：启动独立端口的服务实例（fallback 模式、独立数据目录），
 * 跑通 注册→登录→好友→发消息(socket)→会话列表→历史消息→404/401 全链路。
 *
 * 运行: npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { rm } from 'node:fs/promises';

import { io } from 'socket.io-client';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api/v1`;
const SERVER_DIR = path.resolve(import.meta.dirname, '../..');
const TEST_DATA_DIR = path.join(SERVER_DIR, 'test', '.tmp-data');

let serverProc;
const tokens = {}; // { userA: token, userB: token }
const uids = {};   // { userA: '12', userB: '13' }

async function http(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

function loginSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      path: '/im',
      transports: ['websocket'],
      auth: { token },
      timeout: 5000,
    });
    const timer = setTimeout(() => { socket.close(); reject(new Error('socket connect timeout')); }, 6000);
    socket.on('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
}

before(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
  serverProc = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      STORAGE_MODE: 'fallback',
      DATA_DIR: path.relative(SERVER_DIR, TEST_DATA_DIR),
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});

  // 等待健康检查通过
  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const { status } = await http('GET', `${BASE}/health`);
      if (status === 200) { up = true; break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(up, 'server did not start within 15s');
});

after(() => {
  serverProc?.kill('SIGINT');
});

const suffix = Date.now().toString(36);
const userA = { username: `it_a_${suffix}`, password: 'pass123456', nickname: '测试A' };
const userB = { username: `it_b_${suffix}`, password: 'pass123456', nickname: '测试B' };

test('注册两个用户并获得 token', async () => {
  for (const [k, u] of Object.entries({ userA, userB })) {
    const { status, json } = await http('POST', `${API}/auth/register`, { body: u });
    assert.equal(status, 200, `${u.username} register failed`);
    assert.equal(json.code, 0);
    tokens[k] = json.data.accessToken;
    uids[k] = json.data.uid;
    assert.ok(json.data.refreshToken);
  }
});

test('重复注册返回 409', async () => {
  const { status } = await http('POST', `${API}/auth/register`, { body: userA });
  assert.equal(status, 409);
});

test('登录成功 / 错误密码 401', async () => {
  const ok = await http('POST', `${API}/auth/login`, { body: { username: userA.username, password: userA.password } });
  assert.equal(ok.status, 200);
  const bad = await http('POST', `${API}/auth/login`, { body: { username: userA.username, password: 'wrong' } });
  assert.equal(bad.status, 401);
});

test('未带 token 访问受保护接口返回 401', async () => {
  const { status } = await http('GET', `${API}/messages/sessions`);
  assert.equal(status, 401);
});

test('不存在的路由返回 404 且业务码非 0', async () => {
  const { status, json } = await http('GET', `${API}/no-such-route`, { token: tokens.userA });
  assert.equal(status, 404);
  assert.notEqual(json?.code, 0);
});

test('A 向 B 发送好友请求，B 接受', async () => {
  const req = await http('POST', `${API}/friends/requests`, {
    token: tokens.userA,
    body: { friendId: uids.userB, remark: 'hi 我是A' },
  });
  assert.equal(req.status, 200, JSON.stringify(req.json));

  const list = await http('GET', `${API}/friends/requests?status=pending`, { token: tokens.userB });
  assert.equal(list.status, 200);
  const items = list.json.data.list || list.json.data;
  assert.ok(Array.isArray(items) && items.length >= 1);

  const accept = await http('POST', `${API}/friends/requests/${uids.userA}/accept`, { token: tokens.userB });
  assert.equal(accept.status, 200, JSON.stringify(accept.json));

  const friends = await http('GET', `${API}/friends/me`, { token: tokens.userB });
  assert.equal(friends.status, 200);
  const fl = friends.json.data.list || friends.json.data;
  assert.ok(fl.some((f) => String(f.id ?? f.userId ?? f.friendId) === String(uids.userA)), 'A should be in B friend list');
});

test('socket 鉴权：无效 token 被拒绝', async () => {
  await assert.rejects(loginSocket('invalid.token.here'));
});

test('A 通过 socket 发消息给 B，双方会话列表与历史正确', async () => {
  const sockA = await loginSocket(tokens.userA);
  const sockB = await loginSocket(tokens.userB);
  try {
    // B 监听路由消息
    const received = new Promise((resolve) => {
      sockB.on('MSG_ROUTE', (pkg) => resolve(pkg));
    });

    const ack = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ack timeout')), 5000);
      sockA.emit('MSG_CHAT', {
        requestId: 'it-req-1',
        toId: uids.userB,
        toType: 'single',
        contentType: 'text',
        content: '你好B，集成测试消息',
      }, (resp) => { clearTimeout(timer); resolve(resp); });
    });

    assert.equal(ack?.code, 0, `MSG_CHAT ack failed: ${JSON.stringify(ack)}`);
    const seqId = ack?.data?.payload?.seqId;
    assert.ok(seqId, 'ack should carry seqId');

    const pkg = await received;
    assert.equal(pkg?.payload?.seqId, seqId);
    assert.equal(pkg?.payload?.content, '你好B，集成测试消息');

    // 会话列表：B 应能看到与 A 的会话（带昵称与未读数）
    const sessions = await http('GET', `${API}/messages/sessions`, { token: tokens.userB });
    assert.equal(sessions.status, 200);
    const list = sessions.json.data.list || sessions.json.data;
    const conv = list.find((s) => String(s.conversationId) === String(uids.userA));
    assert.ok(conv, 'B sessions should contain conversation with A');
    assert.equal(conv.name, userA.nickname);
    assert.ok(conv.unread >= 1);

    // 历史消息：A 视角拉取与 B 的双向历史
    const hist = await http('GET', `${API}/messages/history/${uids.userB}?toType=single&limit=20`, { token: tokens.userA });
    assert.equal(hist.status, 200);
    const msgs = hist.json.data.list || hist.json.data;
    assert.ok(msgs.some((m) => String(m.seqId) === String(seqId)), 'history should contain sent message');
  } finally {
    sockA.close();
    sockB.close();
  }
});

test('非好友/无权限的私聊被拒绝', async () => {
  // 注册第三个用户 C，A 直接发给 C 应失败（无好友关系）
  const userC = { username: `it_c_${suffix}`, password: 'pass123456', nickname: '测试C' };
  const reg = await http('POST', `${API}/auth/register`, { body: userC });
  assert.equal(reg.status, 200);
  const sockA = await loginSocket(tokens.userA);
  try {
    const ack = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ack timeout')), 5000);
      sockA.emit('MSG_CHAT', {
        requestId: 'it-req-2',
        toId: reg.json.data.uid,
        toType: 'single',
        contentType: 'text',
        content: 'hi C',
      }, (resp) => { clearTimeout(timer); resolve(resp); });
    });
    assert.notEqual(ack?.code, 0, 'sending to non-friend should fail');
  } finally {
    sockA.close();
  }
});

test('MSG_CHAT 幂等：同 requestId 重发返回同一 seqId，不产生新消息', async () => {
  const sockA = await loginSocket(tokens.userA);
  const send = (requestId) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ack timeout')), 5000);
    sockA.emit('MSG_CHAT', {
      requestId,
      toId: uids.userB,
      toType: 'single',
      contentType: 'text',
      content: '幂等重发测试',
    }, (resp) => { clearTimeout(timer); resolve(resp); });
  });
  try {
    const a1 = await send('it-idem-1');
    const a2 = await send('it-idem-1'); // 模拟客户端超时重发
    assert.equal(a1?.code, 0);
    assert.equal(a2?.code, 0);
    assert.equal(a1.data.payload.seqId, a2.data.payload.seqId, 'duplicate requestId must reuse first seqId');
  } finally {
    sockA.close();
  }
});

test('敏感词由服务端打码后入库', async () => {
  const sockA = await loginSocket(tokens.userA);
  try {
    const ack = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ack timeout')), 5000);
      sockA.emit('MSG_CHAT', {
        requestId: 'it-mask-1',
        toId: uids.userB,
        toType: 'single',
        contentType: 'text',
        content: '推广赌博网站，诚信诈骗平台',
      }, (resp) => { clearTimeout(timer); resolve(resp); });
    });
    assert.equal(ack?.code, 0);
    const seqId = ack.data.payload.seqId;

    const hist = await http('GET', `${API}/messages/history/${uids.userB}?toType=single&limit=50`, { token: tokens.userA });
    const msgs = hist.json.data.list || hist.json.data;
    const msg = msgs.find((m) => String(m.seqId) === String(seqId));
    assert.ok(msg, 'masked message should exist in history');
    assert.ok(!msg.content.includes('赌博'), 'sensitive word should be masked');
    assert.ok(!msg.content.includes('诈骗'), 'sensitive word should be masked');
    assert.ok(msg.content.includes('*'), 'masked content should contain asterisks');
  } finally {
    sockA.close();
  }
});

test('POST /auth/logout 后 accessToken 立即失效（吊销黑名单）', async () => {
  // 用 B 的 token 验证：登出前可用 → 登出 → 同一 token 401
  const before = await http('GET', `${API}/friends/me`, { token: tokens.userB });
  assert.equal(before.status, 200);

  const out = await http('POST', `${API}/auth/logout`, { token: tokens.userB, body: {} });
  assert.equal(out.status, 200, JSON.stringify(out.json));

  const after = await http('GET', `${API}/friends/me`, { token: tokens.userB });
  assert.equal(after.status, 401, 'revoked token should be rejected');

  // socket 握手同样应被拒绝
  await assert.rejects(loginSocket(tokens.userB), 'revoked token should not connect socket');
});
