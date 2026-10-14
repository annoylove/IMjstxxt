/**
 * Member 表
 * group_id BIGINT, user_id BIGINT, nickname VARCHAR(64)
 * role ENUM('owner','admin','member') DEFAULT 'member'
 * joined_at DATETIME
 * UNIQUE KEY uk (group_id, user_id)
 */
import { query, exec, transaction } from '../../db/mysql.js';

export async function findOne(groupId, userId) {
  const rows = await query(
    `SELECT group_id, user_id, nickname, role, joined_at
     FROM members WHERE group_id = ? AND user_id = ? LIMIT 1`,
    [groupId, userId]
  );
  return rows[0] || null;
}

export async function listByGroup(groupId) {
  return query(
    `SELECT m.group_id, m.user_id, m.nickname, m.role, m.joined_at,
            u.username, u.avatar
     FROM members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?
     ORDER BY FIELD(m.role, 'owner','admin','member'), m.joined_at ASC
     LIMIT 500`,
    [groupId]
  );
}

export async function addMember(groupId, userId, nickname = '', role = 'member') {
  return transaction(async (conn) => {
    await conn.execute(
      `INSERT INTO members (group_id, user_id, nickname, role) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)`,
      [groupId, userId, nickname, role]
    );
    const [g] = await conn.execute(
      `UPDATE groups SET member_count = member_count + 1 WHERE id = ?`,
      [groupId]
    );
    return g;
  });
}

export async function removeMember(groupId, userId) {
  return transaction(async (conn) => {
    const [del] = await conn.execute(
      `DELETE FROM members WHERE group_id = ? AND user_id = ? AND role != 'owner'`,
      [groupId, userId]
    );
    if (del.affectedRows > 0) {
      await conn.execute(
        `UPDATE groups SET member_count = CASE WHEN member_count > 0 THEN member_count - 1 ELSE 0 END WHERE id = ?`,
        [groupId]
      );
    }
    return del;
  });
}

export async function listGroupsByUser(userId) {
  const rows = await query(
    `SELECT group_id FROM members WHERE user_id = ?`,
    [userId]
  );
  return rows.map((r) => r.group_id);
}

export default { findOne, listByGroup, addMember, removeMember, listGroupsByUser };
