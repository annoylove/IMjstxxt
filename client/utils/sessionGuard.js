/**
 * 同设备单会话守卫
 * - 每个页面实例（标签页/App 实例）拥有唯一 INSTANCE_ID
 * - 登录成功即"认领"设备会话（deviceSession 写入共享存储）
 * - 其他实例轮询发现会话被别的实例认领 → 判定为被接管，本实例强制下线，
 *   从而保证同一设备不能并行登录两个账号
 */
import storage from './storage';

export const INSTANCE_ID =
  'inst_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

/** 认领设备会话（登录/注册成功后调用） */
export function claimSession(uid) {
  storage.set('deviceSession', { id: INSTANCE_ID, uid: String(uid || ''), ts: Date.now() });
}

/** 释放设备会话（退出登录时调用；仅当会话属于本实例时才清除） */
export function releaseSession() {
  const ds = storage.get('deviceSession', null);
  if (!ds || ds.id === INSTANCE_ID) storage.remove('deviceSession');
}

let started = false;
let fired = false;

/**
 * 启动接管监测
 * @param {Object} opts
 * @param {() => boolean} opts.isLoggedIn 本实例当前是否处于登录态
 * @param {(ds: {id: string, uid: string}) => void} opts.onTakenOver 检测到被其他实例接管时的回调
 * @param {number} [opts.interval=3000] 轮询间隔（毫秒）
 */
export function startSessionWatch({ isLoggedIn, onTakenOver, interval = 3000 }) {
  if (started) return;
  started = true;
  setInterval(() => {
    if (fired) return;
    if (!isLoggedIn()) return;
    const ds = storage.get('deviceSession', null);
    if (ds && ds.id !== INSTANCE_ID) {
      fired = true;
      onTakenOver(ds);
    }
  }, interval);
}
