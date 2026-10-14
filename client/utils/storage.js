/**
 * 本地存储封装（统一使用 uni.setStorageSync / uni.getStorageSync）
 * 预留 SQLite 接口占位，可按需扩展
 */

const PREFIX = 'im_';

export const storage = {
  set(key, value) {
    try {
      uni.setStorageSync(PREFIX + key, value);
    } catch (e) {
      console.error('[storage] set failed:', key, e);
    }
  },

  get(key, def = null) {
    try {
      const v = uni.getStorageSync(PREFIX + key);
      return v === '' || v === undefined ? def : v;
    } catch (e) {
      return def;
    }
  },

  remove(key) {
    try {
      uni.removeStorageSync(PREFIX + key);
    } catch (_e) {}
  },

  clear() {
    try {
      uni.clearStorageSync();
    } catch (_e) {}
  },

  // 以下为 SQLite 占位（小程序 App 端可用），默认不启用
  openSQLite(dbName = 'im.db') {
    // #ifdef APP-PLUS
    return new Promise((resolve, reject) => {
      plus.sqlite.openDatabase({
        name: dbName,
        path: dbName,
        success: () => resolve(dbName),
        fail: reject,
      });
    });
    // #endif
    // eslint-disable-next-line no-unreachable
    return Promise.resolve(null);
  },
};

export default storage;
