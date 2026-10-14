/**
 * 请求日志/指标中间件
 * - 累计请求数、状态码分布、平均/最大延迟（内存计数，供 /metrics 暴露）
 * - 4xx/5xx 即时 warn 日志，便于排查
 * - /health 与 /metrics 本身不计数，避免噪音
 */
import logger from '../utils/logger.js';

export const stats = {
  startedAt: Date.now(),
  total: 0,
  byStatus: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  latencySumMs: 0,
  latencyMaxMs: 0,
};

export function requestLog(req, res, next) {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    stats.total += 1;
    stats.latencySumMs += dur;
    if (dur > stats.latencyMaxMs) stats.latencyMaxMs = dur;
    const bucket = `${Math.floor(res.statusCode / 100)}xx`;
    if (stats.byStatus[bucket] !== undefined) stats.byStatus[bucket] += 1;
    if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${dur}ms)`);
    }
  });
  next();
}

export default requestLog;
