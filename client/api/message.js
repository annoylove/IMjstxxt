import { http } from './request';
import config from '../config';
import storage from '../utils/storage';

export const messageApi = {
  /** 会话列表（聚合最近消息 + 未读数）—— 隐式刷新，401 不跳登录 */
  sessions: () => http.get('/messages/sessions', {}, { background: true }),
  /** 历史消息（游标分页） */
  history: (targetId, params = {}) =>
    http.get(`/messages/history/${targetId}`, { toType: 'single', ...params }),
  /** 离线消息（自上次拉取后的新消息） */
  offline: (data) => http.post('/messages/offline', data),
  /** 上传文件（图片/语音） */
  upload: (filePath, { type = 'image', ext = '' } = {}) =>
    new Promise((resolve, reject) => {
      const accessToken = storage.get('accessToken', '');
      const query = ext ? `?type=${type}&ext=${ext}` : `?type=${type}`;
      uni.uploadFile({
        url: config.BASE_URL + '/upload' + query,
        filePath,
        name: 'file',
        header: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        success: (res) => {
          try {
            const body = JSON.parse(res.data);
            if (body.code === 0) resolve(body.data);
            else reject(body);
          } catch (e) {
            reject(e);
          }
        },
        fail: reject,
      });
    }),
};
