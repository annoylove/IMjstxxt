import { http } from './request';

export const groupApi = {
  /** 我的群列表 */
  list: () => http.get('/groups'),
  /** 创建群 */
  create: (data) => http.post('/groups', data),
  /** 加入群（群号/二维码） */
  join: (data) => http.post('/groups/join', data),
  /** 退出群 */
  leave: (groupId) => http.post(`/groups/${groupId}/leave`),
  /** 群成员列表 */
  members: (groupId) => http.get(`/groups/${groupId}/members`),
  /** 转让群主 */
  transfer: (groupId, userId) =>
    http.post(`/groups/${groupId}/transfer`, { userId }),
  /** 解散群 */
  dissolve: (groupId) => http.post(`/groups/${groupId}/dissolve`),
};
