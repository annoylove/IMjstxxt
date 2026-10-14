/**
 * 统一路由导出
 *   /auth           认证（不受 authMiddleware 保护）
 *   /users          用户
 *   /friends        好友
 *   /groups         群组
 *   /messages       消息（离线/历史）
 *   /upload         文件上传
 */
import authRouter from './auth.js';
import userRouter from './user.js';
import friendRouter from './friend.js';
import groupRouter from './group.js';
import messageRouter from './message.js';
import uploadRouter from './upload.js';

export {
  authRouter,
  userRouter,
  friendRouter,
  groupRouter,
  messageRouter,
  uploadRouter,
};

export default {
  authRouter,
  userRouter,
  friendRouter,
  groupRouter,
  messageRouter,
  uploadRouter,
};
