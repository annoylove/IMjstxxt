import { http } from './request';

export const friendApi = {
  /** 好友列表 */
  list: () => http.get('/friends/me'),
  /** 发送好友请求 */
  request: (data) => http.post('/friends/requests', data),
  /** 接受好友请求 */
  accept: (requesterId) => http.post(`/friends/requests/${requesterId}/accept`),
  /** 拒绝好友请求 */
  reject: (requesterId) => http.delete(`/friends/requests/${requesterId}`),
  /** 收到的好友请求列表 —— 角标隐式刷新，401 不跳登录 */
  requests: (status) => http.get('/friends/requests', status ? { status } : {}, { background: true }),
  /** 删除好友 */
  remove: (friendId) => http.delete(`/friends/${friendId}`),
};
