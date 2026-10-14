/**
 * Friend 表 DDL
 * user_id BIGINT, friend_id BIGINT, remark VARCHAR(64)
 * status ENUM('pending','accepted','blocked') DEFAULT 'pending'
 * created_at DATETIME
 * UNIQUE KEY uk_pair (user_id, friend_id)
 */
import { query, exec, transaction } from '../../db/mysql.js';

export const FRIEND_COLUMNS = 'user_id, friend_id, remark, status, created_at';

export async function findPair(userId, friendId) {
  const rows = await query(
    `SELECT ${FRIEND_COLUMNS} FROM friends
     WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
     LIMIT 2`,
    [userId, friendId, friendId, userId]
  );
  return rows;
}

export async function findRequests(userId, status = null) {
  const where = status ? 'AND f.status = ?' : '';
  const params = status ? [userId, status] : [userId];
  return query(
    `SELECT f.user_id, f.friend_id, f.remark, f.status, f.created_at, u.id as fromUserId, u.username as fromAccount, u.nickname as fromNickname, u.avatar as fromAvatar
     FROM friends f JOIN users u ON u.id = f.user_id
     WHERE f.friend_id = ? ${where}
     ORDER BY f.created_at DESC
     LIMIT 200`,
    params
  );
}

export async function listFriends(userId) {
  // 好友关系为双向存储（accept 时两个方向各一条），只查自己的方向即可，
  // 且 f.remark 语义为"我给对方设的备注"
  return query(
    `SELECT u.id as id, u.username, u.nickname, u.avatar, f.remark, f.status, f.created_at
     FROM friends f JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = ? AND f.status = 'accepted'
     ORDER BY f.created_at DESC`,
    [userId]
  );
}

/** 发起好友请求：只存 user_id → friend_id 一条，status=pending */
export async function createRequest({ userId, friendId, remark }) {
  return exec(
    `INSERT INTO friends (user_id, friend_id, remark, status) VALUES (?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE remark = VALUES(remark)`,
    [userId, friendId, remark || '']
  );
}

/** 接受：把请求方那条改成 accepted，同时插入反向一条 accepted */
export async function acceptRequest(requesterId, acceptorId) {
  return transaction(async (conn) => {
    await conn.execute(
      `UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`,
      [requesterId, acceptorId]
    );
    await conn.execute(
      `INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')
       ON DUPLICATE KEY UPDATE status = 'accepted'`,
      [acceptorId, requesterId]
    );
    return true;
  });
}

export async function rejectRequest(requesterId, acceptorId) {
  return exec(
    `DELETE FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
    [requesterId, acceptorId]
  );
}

/** 删除好友：双向记录一起删除 */
export async function deletePair(userId, friendId) {
  return exec(
    `DELETE FROM friends
     WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
    [userId, friendId, friendId, userId]
  );
}

export default {
  findPair,
  findRequests,
  listFriends,
  createRequest,
  acceptRequest,
  rejectRequest,
  deletePair,
};
