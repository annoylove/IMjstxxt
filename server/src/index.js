/**
 * IM 即时通讯系统入口
 * - 加载 dotenv
 * - 初始化 mysql / mongo / redis（连接失败 warn 不阻塞）
 * - Express: helmet / cors / rate-limit / body json
 * - /api/v1 路由组（auth 路由独立）
 * - 统一错误中间件
 * - Socket.io 挂同一 HTTP server（path: '/im'）
 * - 监听 PORT + 优雅关闭
 */
import 'dotenv/config';

import express from 'express';
import http from 'http';
import path from 'node:path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import config from './config/index.js';
import logger from './utils/logger.js';
import { ok, fail } from './utils/response.js';
import { errorMiddleware } from './middleware/error.js';
import authMiddleware from './middleware/auth.js';
import requestLog, { stats as httpStats } from './middleware/requestLog.js';
import { createPool } from './db/mysql.js';
import { connectMongo, closeMongo } from './db/mongo.js';
import { connectRedis, closeRedis, getRedis } from './db/redis.js';
import { seedSeqId } from './services/seq.service.js';
import {
  authRouter,
  userRouter,
  friendRouter,
  groupRouter,
  messageRouter,
  uploadRouter,
} from './routes/index.js';
import { createSocketIO } from './socket/index.js';

// —— 初始化存储（失败只 warn，不阻塞）— //
createPool();           // MySQL pool 懒连接
const storageReady = (async () => {
  try { await connectMongo(); } catch (e) { logger.warn(`[Mongo] init: ${e.message}`); }
  try { await connectRedis(); } catch (e) { logger.warn(`[Redis] init: ${e.message}`); }
  await seedSeqId();    // 播种全局 seqId，避免重启后 seqId 冲突丢消息
})();

// —— Express — //
const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

const limiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '1mb' }));

// 请求日志/指标统计
app.use(requestLog);

// —— 健康检查 — //
app.get('/health', (_req, res) => ok(res, { status: 'ok', ts: Date.now() }));

// —— /api/v1/auth 不受 JWT 保护 — //
app.use('/api/v1/auth', authRouter);

// —— 其他路由挂 /api/v1 + JWT 保护 — //
app.use('/api/v1', authMiddleware);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/friends', friendRouter);
app.use('/api/v1/groups', groupRouter);
app.use('/api/v1/messages', messageRouter);
app.use('/api/v1/upload', uploadRouter);

// —— 静态文件（上传文件通过 /static 访问）— //
app.use('/static', express.static(path.resolve(process.cwd(), 'public')));

// —— 运行指标（进程/HTTP/Socket 概览，必须注册在 404 兜底之前）— //
app.get('/metrics', (_req, res) => {
  ok(res, {
    uptimeSec: Math.round(process.uptime()),
    memoryRssMb: Math.round(process.memoryUsage().rss / 1048576),
    http: {
      total: httpStats.total,
      byStatus: httpStats.byStatus,
      avgLatencyMs: httpStats.total ? +(httpStats.latencySumMs / httpStats.total).toFixed(1) : 0,
      maxLatencyMs: httpStats.latencyMaxMs,
    },
    sockets: { connected: app.io?.engine?.clientsCount ?? 0 },
  });
});

// —— 404 —— //
app.use((req, res) => fail(res, 4004, `route not found: ${req.method} ${req.path}`, 404));

// —— 统一错误处理（必须放最后）— //
app.use(errorMiddleware);

// —— HTTP + Socket.io（同一个 server）— //
const server = http.createServer(app);

// Socket.io Redis Adapter 预留（分布式部署时启用）
let io;
if (process.env.SOCKET_IO_REDIS_ADAPTER === 'true') {
  try {
    const mod = await import('@socket.io/redis-adapter').catch(() => null);
    const createServerAdapter = mod?.createServerAdapter;
    if (createServerAdapter) {
      const pub = getRedis();
      const sub = pub.duplicate();
      io = createSocketIO(server);
      io.adapter(createServerAdapter(pub, sub));
      logger.info('[Socket.io] Redis adapter enabled');
    } else {
      logger.warn('[Socket.io] Redis adapter not installed, fallback to in-memory');
      io = createSocketIO(server);
    }
  } catch (err) {
    logger.warn(`[Socket.io] Redis adapter failed: ${err.message}, fallback to in-memory`);
    io = createSocketIO(server);
  }
} else {
  io = createSocketIO(server);
}

// 将 io 挂到 app 上方便测试或其他模块访问
app.io = io;

// —— 启动监听 — //
(async () => {
  await storageReady;
  server.listen(config.port, () => {
    logger.info(`[Server] listening on http://0.0.0.0:${config.port}`);
    logger.info(`[Socket.io] path = ${config.socket.path}`);
  });
})();

// —— 优雅关闭 — //
const shutdown = async (signal) => {
  logger.info(`[Server] received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await closeMongo();
      await closeRedis();
      logger.info('[Server] closed all connections, bye');
    } catch (err) {
      logger.error('[Server] shutdown error', err.message);
    }
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, server, io };
export default app;
