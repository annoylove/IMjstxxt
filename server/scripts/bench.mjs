/**
 * 消息链路压测脚本（零第三方依赖，socket.io-client 已在 devDependencies）
 *
 * 模型：N 对好友并发，每对 A→B 串行发送 M 条消息（节流 ~9 条/秒，
 * 避开服务端 flood 限制 10/s），统计 ack 延迟分位与整体吞吐。
 * 默认自动 spawn 独立服务实例（端口 3299、独立数据目录），跑完即停。
 *
 * 用法:
 *   node scripts/bench.mjs [--pairs=20] [--msgs=20] [--url=http://127.0.0.1:3299]
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { io } from 'socket.io-client';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')),
);
const PAIRS = Number(args.pairs || 20);
const MSGS = Number(args.msgs || 20);
const PORT = 3299;
const DEFAULT_BASE = `http://127.0.0.1:${PORT}`;
const SERVER_DIR = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.join(SERVER_DIR, 'scripts', '.tmp-bench-data');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => null);
}

function connectSocket(base, token) {
  return new Promise((resolve, reject) => {
    const s = io(base, { path: '/im', transports: ['websocket'], auth: { token }, timeout: 8000 });
    const t = setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, 10000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', (e) => { clearTimeout(t); reject(e); });
  });
}

async function spawnServer() {
  await rm(DATA_DIR, { recursive: true, force: true });
  const proc = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      STORAGE_MODE: 'fallback',
      DATA_DIR: path.relative(SERVER_DIR, DATA_DIR),
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const j = await http('GET', `${DEFAULT_BASE}/health`);
      if (j?.code === 0) return proc;
    } catch { /* not up */ }
    await sleep(300);
  }
  proc.kill();
  throw new Error('bench server did not start within 15s');
}

/** 单对好友：注册→加好友→双端连接→串行发 M 条，返回每条 ack 延迟 */
async function runPair(base, idx) {
  const ts = Date.now().toString(36);
  const latencies = [];
  let failures = 0;
  const users = [];
  for (const side of ['a', 'b']) {
    const u = { username: `bench_${ts}_${idx}_${side}`, password: 'pass123456', nickname: `压测${idx}${side}` };
    const j = await http('POST', `${base}/api/v1/auth/register`, { body: u });
    if (j?.code !== 0) throw new Error(`register failed: ${JSON.stringify(j)}`);
    users.push({ ...u, token: j.data.accessToken, uid: j.data.uid });
  }
  // 好友关系
  await http('POST', `${base}/api/v1/friends/requests`, {
    token: users[0].token,
    body: { friendId: users[1].uid, remark: 'bench' },
  });
  await http('POST', `${base}/api/v1/friends/requests/${users[0].uid}/accept`, { token: users[1].token });

  const sockA = await connectSocket(base, users[0].token);
  const sockB = await connectSocket(base, users[1].token);
  try {
    for (let m = 0; m < MSGS; m += 1) {
      const t0 = Date.now();
      try {
        const ack = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('ack timeout')), 8000);
          sockA.emit('MSG_CHAT', {
            requestId: `bench-${idx}-${m}`,
            toId: users[1].uid,
            toType: 'single',
            contentType: 'text',
            content: `bench msg ${m}`,
          }, (resp) => { clearTimeout(t); resolve(resp); });
        });
        if (ack?.code === 0) latencies.push(Date.now() - t0);
        else failures += 1;
      } catch { failures += 1; }
      await sleep(110); // 节流：低于 flood 限制 10/s
    }
  } finally {
    sockA.close();
    sockB.close();
  }
  return { latencies, failures };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

async function main() {
  const external = args.url;
  let proc = null;
  const base = external || DEFAULT_BASE;
  if (!external) proc = await spawnServer();

  const metricsBefore = await http('GET', `${base}/metrics`).catch(() => null);
  const wall0 = Date.now();
  console.log(`bench start: ${PAIRS} pairs x ${MSGS} msgs = ${PAIRS * MSGS} messages`);

  const results = await Promise.all(
    Array.from({ length: PAIRS }, (_, i) => runPair(base, i).catch((e) => {
      console.error(`pair ${i} error:`, e.message);
      return { latencies: [], failures: MSGS };
    })),
  );

  const wall = Date.now() - wall0;
  const all = results.flatMap((r) => r.latencies).sort((a, b) => a - b);
  const failures = results.reduce((s, r) => s + r.failures, 0);
  const total = PAIRS * MSGS;
  const metricsAfter = await http('GET', `${base}/metrics`).catch(() => null);

  const avg = all.length ? Math.round(all.reduce((s, x) => s + x, 0) / all.length) : 0;
  console.log('---------------------------------------------');
  console.log(`成功消息      : ${all.length}/${total}（失败 ${failures}）`);
  console.log(`端到端耗时    : ${(wall / 1000).toFixed(1)}s`);
  console.log(`吞吐          : ${((all.length / wall) * 1000).toFixed(1)} msg/s`);
  console.log(`ack 延迟 avg  : ${avg}ms`);
  console.log(`ack 延迟 p50  : ${pct(all, 50)}ms`);
  console.log(`ack 延迟 p95  : ${pct(all, 95)}ms`);
  console.log(`ack 延迟 p99  : ${pct(all, 99)}ms`);
  console.log(`ack 延迟 max  : ${all[all.length - 1] ?? 0}ms`);
  if (metricsAfter?.data) {
    const d = metricsAfter.data;
    const httpDelta = (metricsBefore?.data ? d.http.total - metricsBefore.data.http.total : d.http.total);
    console.log(`服务端        : RSS ${d.memoryRssMb}MB，HTTP 请求 +${httpDelta}，4xx=${d.http.byStatus['4xx']} 5xx=${d.http.byStatus['5xx']}`);
  }
  console.log('---------------------------------------------');

  if (proc) proc.kill('SIGINT');
  await rm(DATA_DIR, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
