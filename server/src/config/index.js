/**
 * 统一配置导出（dotenv 已在入口加载）
 *
 * STORAGE_MODE:
 *   'fallback' — 零依赖模式：SQLite + JSON 文件 + 内存 Map（npm run dev 直接能跑）
 *   'real'     — 真实中间件：MySQL + MongoDB + Redis（需 docker compose up）
 *
 * 默认 'fallback'，一行切换。
 */

const getEnv = (key, fallback) => process.env[key] ?? fallback;

export const config = {
  env: getEnv('NODE_ENV', 'development'),
  port: Number(getEnv('PORT', 3000)),

  // ★ 关键：切 real 后自动走真实中间件
  storage: {
    mode: getEnv('STORAGE_MODE', 'fallback'),
    // fallback 模式下的数据目录
    dataDir: getEnv('DATA_DIR', 'data'),
  },

  jwt: {
    secret: getEnv('JWT_SECRET', 'change-me-in-production'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '1h'),
    refreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  mysql: {
    host: getEnv('MYSQL_HOST', '127.0.0.1'),
    port: Number(getEnv('MYSQL_PORT', 3306)),
    user: getEnv('MYSQL_USER', 'root'),
    password: getEnv('MYSQL_PASSWORD', 'root'),
    database: getEnv('MYSQL_DATABASE', 'im_system'),
  },

  mongo: {
    uri: getEnv('MONGO_URI', 'mongodb://127.0.0.1:27017/im_messages'),
  },

  redis: {
    host: getEnv('REDIS_HOST', '127.0.0.1'),
    port: Number(getEnv('REDIS_PORT', 6379)),
    password: getEnv('REDIS_PASSWORD', '') || undefined,
  },

  socket: {
    path: '/im',
    heartbeatInterval: 30_000,
    recallWindowMs: 2 * 60 * 1000,
  },

  flood: {
    windowMs: 1000,
    maxPerWindow: 10,
  },

  upload: {
    dir: getEnv('UPLOAD_DIR', 'public/uploads'),
    maxImageSize: Number(getEnv('MAX_IMAGE_SIZE', 5 * 1024 * 1024)),
    maxVoiceSize: Number(getEnv('MAX_VOICE_SIZE', 10 * 1024 * 1024)),
    allowedImageExts: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    allowedVoiceExts: ['mp3', 'amr', 'wav'],
  },
};

export default config;
