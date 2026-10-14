/**
 * User 表 DDL
 * id BIGINT PK AUTO_INCREMENT
 * username VARCHAR(64) UNIQUE NOT NULL
 * password_hash VARCHAR(255) NOT NULL
 * nickname VARCHAR(64)
 * avatar VARCHAR(512)
 * status TINYINT DEFAULT 1 (1=正常, 0=禁用)
 * created_at DATETIME, updated_at DATETIME ON UPDATE
 */
import { query, exec } from '../../db/mysql.js';

export const USER_COLUMNS = 'id, username, nickname, avatar, status, created_at, updated_at';

export async function findByUsername(username) {
  const rows = await query(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

export async function findById(id) {
  const rows = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function search(keyword, limit = 20) {
  const rows = await query(
    `SELECT id, username, nickname, avatar FROM users WHERE username LIKE ? OR nickname LIKE ? LIMIT ?`,
    [`%${keyword}%`, `%${keyword}%`, limit]
  );
  return rows;
}

export async function create({ username, passwordHash, nickname, avatar }) {
  const res = await exec(
    `INSERT INTO users (username, password_hash, nickname, avatar) VALUES (?, ?, ?, ?)`,
    [username, passwordHash, nickname || username, avatar || '']
  );
  return res.insertId;
}

export async function updateProfile(id, fields) {
  const allowed = ['nickname', 'avatar'];
  const set = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!set.length) return 0;
  const sql = `UPDATE users SET ${set.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  return exec(sql, [...set.map((k) => fields[k]), id]);
}

export async function updatePassword(id, passwordHash) {
  return exec(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
}

export default { findByUsername, findById, search, create, updateProfile, updatePassword };
