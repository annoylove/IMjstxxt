/**
 * MySQL / SQLite fallback 双模式
 *
 * STORAGE_MODE=real     → mysql2/promise（真实 MySQL）
 * STORAGE_MODE=fallback → Node 24 内置 node:sqlite（零依赖）
 */
import config from '../config/index.js';
import logger from '../utils/logger.js';

let _impl; // 内部实现，根据 mode 选

// —— SQLite fallback ——
async function _initSQLite() {
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const { DatabaseSync } = await import('node:sqlite');

  const dbDir = path.resolve(process.cwd(), config.storage.dataDir);
  await fs.mkdir(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'im.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      nickname      TEXT,
      avatar        TEXT,
      status        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id    INTEGER NOT NULL,
      friend_id  INTEGER NOT NULL,
      remark     TEXT,
      status     TEXT    NOT NULL DEFAULT 'pending',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      avatar       TEXT,
      owner_id     INTEGER NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      group_id   INTEGER NOT NULL,
      user_id    INTEGER NOT NULL,
      nickname   TEXT,
      role       TEXT    NOT NULL DEFAULT 'member',
      joined_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (group_id, user_id)
    );
  `);

  logger.info(`[SQLite] connected at ${dbPath}`);

  return {
    query(sql, params = []) {
      // SQLite 的 ? 占位符跟 MySQL 一样，直接跑
      // 把 FIELD(m.role,'owner','admin','member') 这种 MySQL 专属改成 SQLite 友好的
      let final = sql.replace(
        /FIELD\s*\(\s*m\.role\s*,\s*'owner'\s*,\s*'admin'\s*,\s*'member'\s*\)/gi,
        `CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END`
      );
      try {
        return db.prepare(final).all(...params);
      } catch (e) {
        // 表不存在会抛 ENOENT-like 错误但 sqlite 已建过，这里 log 下
        logger.warn(`[SQLite] query failed: ${final} | ${e.message}`);
        throw e;
      }
    },

    exec(sql, params = []) {
      let final = sql;
      // MySQL ON DUPLICATE KEY UPDATE → SQLite ON CONFLICT DO UPDATE
      if (sql.includes('ON DUPLICATE KEY UPDATE')) {
        final = sql.replace(
          /ON DUPLICATE KEY UPDATE\s+(.+)$/i,
          (_m, upd) => {
            const setPairs = upd.split(',').map((s) => s.trim());
            return `ON CONFLICT DO UPDATE SET ${setPairs.map((p) => {
              // nickname = VALUES(nickname) → nickname = excluded.nickname
              return p.replace(/VALUES\((\w+)\)/g, 'excluded.$1');
            }).join(', ')}`;
          }
        );
      }
      try {
        const info = db.prepare(final).run(...params);
        // mysql2 返回 { affectedRows, insertId }
        return {
          affectedRows: info.changes,
          insertId: Number(info.lastInsertRowid ?? 0),
          changedRows: info.changes,
        };
      } catch (e) {
        logger.warn(`[SQLite] exec failed: ${final} | ${e.message}`);
        throw e;
      }
    },

    async transaction(fn) {
      db.exec('BEGIN');
      try {
        // SQLite 同步事务里的 query/exec 还是直接 db.prepare
        const result = await fn({
          execute(sql, params = []) {
            let final = sql;
            if (sql.includes('ON DUPLICATE KEY UPDATE')) {
              final = sql.replace(
                /ON DUPLICATE KEY UPDATE\s+(.+)$/i,
                (_m, upd) => {
                  const setPairs = upd.split(',').map((s) => s.trim());
                  return `ON CONFLICT DO UPDATE SET ${setPairs.map((p) =>
                    p.replace(/VALUES\((\w+)\)/g, 'excluded.$1')
                  ).join(', ')}`;
                }
              );
            }
            const info = db.prepare(final).run(...params);
            // 与 mysql2 conn.execute 对齐：返回 [ResultSetHeader]
            return [{ affectedRows: info.changes, insertId: Number(info.lastInsertRowid ?? 0), changedRows: info.changes }];
          },
        });
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    close() { try { db.closeSync(); } catch {} },
  };
}

// —— MySQL 真实模式 ——
async function _initMySQL() {
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    connectionLimit: 20,
    waitForConnections: true,
    queueLimit: 0,
    charset: 'utf8mb4',
  });
  try {
    const conn = await pool.getConnection();
    logger.info('[MySQL] connected successfully');
    conn.release();
  } catch (err) {
    logger.warn(`[MySQL] failed: ${err.message}. 可切 STORAGE_MODE=fallback 绕过`);
    throw err;
  }
  return {
    async query(sql, params = []) {
      const [rows] = await pool.execute(sql, params);
      return rows;
    },
    async exec(sql, params = []) {
      const [result] = await pool.execute(sql, params);
      return result;
    },
    async transaction(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const res = await fn(conn);
        await conn.commit();
        return res;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() { await pool.end(); },
    pool,
  };
}

// —— 公共 API ——
export async function createPool() {
  if (_impl) return _impl;
  try {
    if (config.storage.mode === 'real') {
      _impl = await _initMySQL();
    } else {
      _impl = await _initSQLite();
    }
    logger.info(`[DB] mysql/query 用的是 ${config.storage.mode} 模式`);
  } catch (err) {
    logger.error(`[DB] 初始化失败: ${err.message}`);
  }
  return _impl;
}

export function getPool() { return _impl; }

export async function query(sql, params = []) {
  if (!_impl) await createPool();
  return _impl.query(sql, params);
}

export async function exec(sql, params = []) {
  if (!_impl) await createPool();
  return _impl.exec(sql, params);
}

export async function transaction(fn) {
  if (!_impl) await createPool();
  return _impl.transaction(fn);
}

export async function closePool() {
  if (_impl?.close) await _impl.close();
  _impl = null;
}

export default { createPool, getPool, query, exec, transaction, closePool };
