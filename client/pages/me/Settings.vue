<template>
  <view class="settings">
    <view class="menu-group">
      <view class="menu-item press-effect" @click="goChangePassword">
        <view class="menu-left">
          <view class="menu-icon orange">🔒</view>
          <text class="menu-label">修改密码</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item press-effect no-line" @click="showAbout">
        <view class="menu-left">
          <view class="menu-icon teal">ℹ️</view>
          <text class="menu-label">关于</text>
        </view>
        <text class="version">v1.0.0</text>
      </view>
    </view>

    <button class="logout-btn" @click="onLogout">退出登录</button>
  </view>
</template>

<script setup>
import { useUserStore } from '../../stores/user';
import { useSocketStore } from '../../stores/socket';

const userStore = useUserStore();
const socketStore = useSocketStore();

function goChangePassword() {
  uni.navigateTo({ url: '/pages/me/ChangePassword' });
}

function showAbout() {
  uni.showModal({
    title: '关于 IM',
    content: 'IM 即时通讯客户端 v1.0.0',
    showCancel: false,
  });
}

function onLogout() {
  uni.showModal({
    title: '确认退出',
    content: '退出后需要重新登录',
    confirmText: '退出',
    confirmColor: '#e64340',
    success: async (res) => {
      if (!res.confirm) return;
      socketStore.disconnect();
      await userStore.logout();
    },
  });
}
</script>

<style scoped>
.settings {
  min-height: 100vh;
  background: var(--bg);
  padding-top: 20rpx;
}
.menu-group {
  background: var(--card);
  border-radius: var(--radius);
  margin: 0 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
}
.menu-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.menu-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
}
.menu-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  color: #fff;
}
.menu-icon.orange {
  background: linear-gradient(135deg, #ffc06a, #ff9500);
}
.menu-icon.teal {
  background: linear-gradient(135deg, #36d6a9, #07c160);
}
.menu-label {
  font-size: 30rpx;
  color: var(--text-1);
}
.arrow {
  font-size: 36rpx;
  color: #ccc;
}
.version {
  font-size: 24rpx;
  color: var(--text-3);
}
.logout-btn {
  margin: 64rpx 20rpx 0;
  height: 88rpx;
  line-height: 88rpx;
  background: var(--card);
  color: var(--danger);
  font-size: 30rpx;
  font-weight: 500;
  border-radius: var(--radius);
  border: none;
  box-shadow: var(--shadow);
}
.logout-btn::after {
  border: none;
}
.logout-btn:active {
  background: #fdf0f0;
}
</style>
