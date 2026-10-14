<script>
import { useUserStore } from './stores/user';
import { useSocketStore } from './stores/socket';
import { useSessionStore } from './stores/session';
import { useFriendRequestStore } from './stores/friendRequest';
import emitter from './utils/emitter';
import { claimSession, startSessionWatch } from './utils/sessionGuard';

export default {
  globalOffs: [],

  onLaunch() {
    console.log('[App] onLaunch');
    const userStore = useUserStore();
    const socketStore = useSocketStore();

    // 1. 恢复本地登录态
    userStore.restore();

    if (userStore.isLoggedIn) {
      // 2. 已登录：认领设备会话 + 连接 WebSocket + 拉离线消息
      claimSession(userStore.userInfo?.id);
      socketStore.connect();
      this.pullOfflineMessages();
    } else {
      // 3. 未登录：跳到登录页
      uni.reLaunch({ url: '/pages/login/Login' });
    }

    // 同设备会话接管监测：其他标签页/实例登录后，本实例强制下线
    startSessionWatch({
      isLoggedIn: () => useUserStore().isLoggedIn,
      onTakenOver: () => this.handleSessionTakenOver(),
    });

    this.registerGlobalListeners();
  },

  onShow() {
    console.log('[App] onShow');
    const socketStore = useSocketStore();
    const userStore = useUserStore();
    // 从后台切回前台时，如果已登录且未连接，触发重连
    if (userStore.isLoggedIn && socketStore.state !== 'connected') {
      socketStore.connect();
    }
  },

  onHide() {
    console.log('[App] onHide');
    // App 切后台时主动断开（避免小程序后台连接被系统杀掉导致状态错乱）
    const socketStore = useSocketStore();
    socketStore.disconnect();
  },

  onError(msg) {
    console.error('[App] onError:', msg);
  },

  methods: {
    handleSessionTakenOver() {
      const userStore = useUserStore();
      const socketStore = useSocketStore();
      socketStore.disconnect();
      // 只清本实例内存态：共享存储里的 token 已被新账号登录覆盖，属于其他会话，不能删
      userStore.accessToken = '';
      userStore.refreshToken = '';
      userStore.userInfo = null;
      uni.showModal({
        title: '登录状态变更',
        content: '检测到本设备已登录其他账号，当前会话已失效',
        showCancel: false,
        confirmText: '去登录',
        success: () => uni.reLaunch({ url: '/pages/login/Login' }),
      });
    },

    async pullOfflineMessages() {
      try {
        const sessionStore = useSessionStore();
        await sessionStore.loadSessions();
      } catch (e) {
        console.warn('[App] pullOfflineMessages failed:', e);
      }
    },

    registerGlobalListeners() {
      const offReq = emitter.on('socket:FRIEND_REQUEST_NOTIFY', (data) => {
        const req = data?.payload || data;
        const frStore = useFriendRequestStore();
        frStore.increment();
        const name = req.fromNickname || req.fromAccount || '新朋友';
        uni.showToast({ title: `${name} 请求添加你为好友`, icon: 'none', duration: 2500 });
      });
      const offAcc = emitter.on('socket:FRIEND_ACCEPTED_NOTIFY', (data) => {
        const info = data?.payload || data;
        const name = info.nickname || '对方';
        uni.showToast({ title: `${name} 已接受你的好友请求`, icon: 'none', duration: 2500 });
      });
      this.globalOffs = [offReq, offAcc];
    },
  },
};
</script>

<style>
/* ===== 全局设计令牌 ===== */
page {
  --primary: #07c160;
  --primary-dark: #05a551;
  --primary-gradient: linear-gradient(135deg, #2bd47a, #07c160);
  --bg: #f5f6f8;
  --card: #ffffff;
  --text-1: #1f2329;
  --text-2: #7a8087;
  --text-3: #b4b9bf;
  --line: #eef0f2;
  --fill: #f3f4f6;
  --danger: #fa5151;
  --warning: #ff9500;
  --bubble-self: #95ec69;
  --radius-sm: 12rpx;
  --radius: 20rpx;
  --radius-lg: 28rpx;
  --shadow: 0 6rpx 24rpx rgba(31, 43, 54, 0.05);
  --shadow-fab: 0 10rpx 28rpx rgba(7, 193, 96, 0.32);

  background-color: var(--bg);
  font-size: 28rpx;
  color: var(--text-1);
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 通用按压反馈（H5） */
.press-effect:active {
  background-color: #f1f2f4 !important;
}

/* 通用加载动画 */
.spinner {
  width: 40rpx;
  height: 40rpx;
  border: 4rpx solid #e0e0e0;
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
