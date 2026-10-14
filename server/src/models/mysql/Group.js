/**
 * Group 表
 * id BIGINT PK AUTO_INCREMENT
 * name VARCHAR(64) NOT NULL
 * avatar VARCHAR(512)
 * owner_id BIGINT NOT NULL
 * member_count INT DEFAULT 0
 * created_at DATETIME
 */
import { query, exec, transaction } from '../../db/mysql.js';

export const GROUP_COLUMNS = 'id, name, avatar, owner_id, member_count, created_at';

export async function findById(id) {
  const rows = await query(`SELECT ${GROUP_COLUMNS} FROM groups WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

export async function listByMember(userId) {
  return query(
    `SELECT g.* FROM groups g
     JOIN members m ON m.group_id = g.id
     WHERE m.user_id = ?
     ORDER BY g.created_at DESC`,
    [userId]
  );
}

export async function create({ name, avatar, ownerId }) {
  return transaction(async (conn) => {
    const [gRes] = await conn.execute(
      `INSERT INTO groups (name, avatar, owner_id, member_count) VALUES (?, ?, ?, 1)`,
      [name, avatar || '', ownerId]
    );
    const groupId = gRes.insertId;
    await conn.execute(
      `INSERT INTO members (group_id, user_id, nickname, role) VALUES (?, ?, '', 'owner')`,
      [groupId, ownerId]
    );
    return groupId;
  });
}

export async function incMemberCount(groupId, delta = 1) {
  return exec(
    `UPDATE groups SET member_count = member_count + ? WHERE id = ?`,
    [delta, groupId]
  );
}

export default { findById, listByMember, create, incMemberCount };
