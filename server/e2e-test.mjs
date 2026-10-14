/**
 * WebSocket 端到端验证脚本
 * 用 socket.io-client 连后端，模拟 alice 发消息给 bob
 *
 * 用法：node e2e-test.mjs
 */
import { io } from 'socket.io-client';

const API = 'http://127.0.0.1:3100';
const SOCK_PATH = '/im';

async function register(name) {
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: '123456', nickname: name }),
  });
  const json = await res.json();
  if (json.code !== 0) {
    // 已注册 → 登录
    const loginRes = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: '123456' }),
    });
    const loginJson = await loginRes.json();
    return loginJson.data;
  }
  return json.data;
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const sock = io(API, { path: SOCK_PATH, auth: { token }, transports: ['websocket'] });
    sock.on('connect', () => resolve(sock));
    sock.on('connect_error', (err) => reject(err));
    sock.on('MSG_ROUTE', (data) => {
      const msg = data?.payload || data;
      console.log(`  [收到消息] seqId=${msg.seqId} from=${msg.fromId} content="${msg.content}"`);
    });
    sock.on('MSG_RECALL_NOTIFY', (data) => {
      console.log(`  [撤回通知]`, data?.payload || data);
    });
    sock.on('MSG_ROUTE_DELIVERED_NOTIFY', (data) => {
      console.log(`  [已送达通知]`, data?.payload || data);
    });
    sock.on('SYS_KICK_OUT', (data) => {
      console.log(`  [被踢下线]`, data?.payload || data);
    });
    sock.on('disconnect', (reason) => {
      console.log(`  [断开] ${reason}`);
    });
  });
}

async function main() {
  console.log('=== 1. 注册/登录 alice 和 bob ===');
  const alice = await register('alice');
  const bob = await register('bob');
  console.log(`  alice uid=${alice.uid} token=${alice.accessToken.slice(0, 20)}...`);
  console.log(`  bob   uid=${bob.uid} token=${bob.accessToken.slice(0, 20)}...`);

  console.log('\n=== 2. alice 和 bob 都连 WebSocket ===');
  const aliceSock = await connectSocket(alice.accessToken);
  console.log(`  alice socket connected, id=${aliceSock.id}`);
  const bobSock = await connectSocket(bob.accessToken);
  console.log(`  bob   socket connected, id=${bobSock.id}`);

  // 如果 alice 和 bob 互踢了（同一 uid 不会，但不同 uid 没问题）
  await sleep(500);

  console.log('\n=== 3. alice 发消息给 bob ===');
  const sendResult = await new Promise((resolve) => {
    aliceSock.emit('MSG_CHAT', {
      requestId: 'test-req-1',
      toId: bob.uid,
      toType: 'single',
      contentType: 'text',
      content: '你好 bob，我是 alice！',
    }, (ack) => {
      resolve(ack);
    });
  });
  console.log('  发送结果:', JSON.stringify(sendResult));

  await sleep(1000);

  console.log('\n=== 4. 检查消息文件 ===');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dataDir = path.resolve(process.cwd(), 'data');
  try {
    const files = await fs.readdir(dataDir);
    const msgFile = files.find((f) => f.startsWith('messages_'));
    if (msgFile) {
      const raw = await fs.readFile(path.join(dataDir, msgFile), 'utf8');
      const data = JSON.parse(raw);
      const msgs = Object.values(data);
      console.log(`  ${msgFile} 里有 ${msgs.length} 条消息`);
      for (const m of msgs) {
        console.log(`    seqId=${m.seqId} from=${m.fromId} to=${m.toId} content="${m.content}"`);
      }
    }
  } catch (e) {
    console.log('  读取消息文件失败:', e.message);
  }

  console.log('\n=== 5. alice 加 bob 为好友，bob 接受 ===');
  const reqRes = await fetch(`${API}/api/v1/friends/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice.accessToken}` },
    body: JSON.stringify({ friendId: bob.uid }),
  });
  const reqJson = await reqRes.json();
  console.log('  好友请求结果:', JSON.stringify(reqJson));

  const accRes = await fetch(`${API}/api/v1/friends/requests/${alice.uid}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bob.accessToken}` },
  });
  const accJson = await accRes.json();
  console.log('  接受结果:', JSON.stringify(accJson));

  console.log('\n=== 6. 通过 HTTP 拉历史消息 ===');
  const histRes = await fetch(`${API}/api/v1/messages/history/${bob.uid}?toType=single&limit=10`, {
    headers: { Authorization: `Bearer ${alice.accessToken}` },
  });
  const histJson = await histRes.json();
  console.log(`  历史消息 ${histJson.data?.length || 0} 条`);
  if (histJson.data?.length) {
    histJson.data.forEach((m) => {
      console.log(`    seqId=${m.seqId} from=${m.fromId} content="${m.content}"`);
    });
  }

  console.log('\n=== 7. 断开连接 ===');
  aliceSock.disconnect();
  bobSock.disconnect();
  console.log('=== 端到端测试完成 ===');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
