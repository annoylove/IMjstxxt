import { http } from './request';

export const authApi = {
  /** 用户注册 */
  register: (data) => http.post('/auth/register', data, { needAuth: false }),
  /** 用户登录 */
  login: (data) => http.post('/auth/login', data, { needAuth: false }),
  /** 刷新 token（一般由 request.js 内部自动调用，这里暴露供手动使用） */
  refresh: (refreshToken) =>
    http.post('/auth/refresh', { refreshToken }, { needAuth: false }),
  /** 退出登录（服务端踢下线） */
  logout: () => http.post('/auth/logout'),
  /** 发送短信/邮箱验证码 */
  sendCode: (data) => http.post('/auth/send-code', data, { needAuth: false }),
};
