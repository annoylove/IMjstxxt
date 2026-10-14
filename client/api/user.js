import { http } from './request';

export const userApi = {
  /** 获取当前用户信息 */
  getMe: () => http.get('/users/me'),
  /** 更新当前用户资料（后端为 PATCH /users/me） */
  updateMe: (data) => http.patch('/users/me', data),
  /** 根据 userId 查询用户 */
  getUser: (userId) => http.get(`/users/${userId}`),
  /** 搜索用户 */
  search: (keyword) => http.get('/users/search', { keyword }),
  /** 修改密码 */
  changePassword: (data) => http.post('/users/password', data),
};
