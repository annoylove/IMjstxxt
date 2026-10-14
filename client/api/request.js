import config from '../config';
import storage from '../utils/storage';
import logger from '../utils/logger';

const BASE = config.BASE_URL;

// 防止并发 401 触发多次提示
let notifying = false;

/**
 * 认证彻底失败时的统一处理。
 * 只清理本地登录态并提示，绝不自动跳转登录页——
 * 跳转登录页仅发生在用户主动「退出登录」并确认之后（stores/user.logout）。
 */
function authFail(reject, { background, msg }) {
  if (background) {
    return reject({ code: 401, msg: msg || '登录已过期', background: true });
  }
  clearAuth();
  if (!notifying) {
    notifying = true;
    uni.showToast({ title: msg || '登录已过期，请重新登录', icon: 'none' });
    setTimeout(() => { notifying = false; }, 1500);
  }
  return reject({ code: 401, msg });
}

/**
 * 统一请求封装
 * - 自动携带 JWT Authorization header
 * - 401 自动 refreshToken 刷新一次后重试
 * - background=true 时 401 不跳登录页（仅 reject），供会话列表等隐式请求使用
 * - 业务码 code === 0 视为成功，返回 data 字段
 */
export function request(path, { method = 'GET', data = {}, needAuth = true, background = false, header = {} } = {}) {
  return new Promise((resolve, reject) => {
    const finalHeader = { 'Content-Type': 'application/json', ...header };

    if (needAuth) {
      const accessToken = storage.get('accessToken', '');
      if (accessToken) {
        finalHeader.Authorization = `Bearer ${accessToken}`;
      }
    }

    uni.request({
      url: BASE + path,
      method,
      data,
      header: finalHeader,
      success: async (res) => {
        // 401 且带 refreshToken → 刷新一次
        if (res.statusCode === 401 && needAuth) {
          const refreshToken = storage.get('refreshToken', '');
          if (refreshToken) {
            try {
              const tokens = await doRefresh(refreshToken);
              storage.set('accessToken', tokens.accessToken);
              if (tokens.refreshToken) storage.set('refreshToken', tokens.refreshToken);
              // 重试原请求
              const retryHeader = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokens.accessToken}`,
                ...header,
              };
              uni.request({
                url: BASE + path,
                method,
                data,
                header: retryHeader,
                success: handleResponse(resolve, reject),
                fail: reject,
              });
              return;
            } catch (_e) {
              return authFail(reject, { background, msg: '登录已过期，请重新登录' });
            }
          } else {
            return authFail(reject, { background, msg: '请先登录' });
          }
        }

        handleResponse(resolve, reject)(res);
      },
      fail: (err) => {
        logger.error('[request] fail:', path, err);
        reject({ code: -1, msg: '网络异常', detail: err });
      },
    });
  });
}

function handleResponse(resolve, reject) {
  return (res) => {
    const body = res.data || {};
    if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
      resolve(body.data);
    } else {
      reject({
        code: body.code ?? res.statusCode,
        msg: body.msg || body.message || '请求失败',
        detail: body,
      });
    }
  };
}

function doRefresh(refreshToken) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE + '/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      header: { 'Content-Type': 'application/json' },
      success: (res) => {
        if (res.statusCode === 200 && res.data?.code === 0) {
          resolve(res.data.data); // { accessToken, refreshToken }
        } else {
          reject(res.data);
        }
      },
      fail: reject,
    });
  });
}

function clearAuth() {
  storage.remove('accessToken');
  storage.remove('refreshToken');
  storage.remove('userInfo');
}

// 便捷方法
export const http = {
  get: (path, data, opts = {}) => request(path, { method: 'GET', data, ...opts }),
  post: (path, data, opts = {}) => request(path, { method: 'POST', data, ...opts }),
  put: (path, data, opts = {}) => request(path, { method: 'PUT', data, ...opts }),
  patch: (path, data, opts = {}) => request(path, { method: 'PATCH', data, ...opts }),
  delete: (path, data, opts = {}) => request(path, { method: 'DELETE', data, ...opts }),
};
