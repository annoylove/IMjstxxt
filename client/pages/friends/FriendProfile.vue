<template>
  <view class="profile-page">
    <!-- 封面 + 头像 -->
    <view class="cover">
      <view class="cover-inner">
        <Avatar :src="user.avatar" :nickname="displayName" :size="160" />
        <text class="p-name">{{ displayName }}</text>
        <text class="p-account">@{{ user.username || '-' }}</text>
      </view>
    </view>

    <!-- 信息卡片 -->
    <view class="info-card">
      <view class="info-row">
        <text class="i-label">昵称</text>
        <text class="i-value">{{ user.nickname || user.username || '-' }}</text>
      </view>
      <view class="info-row">
        <text class="i-label">账号</text>
        <text class="i-value">{{ user.username || '-' }}</text>
      </view>
      <view class="info-row">
        <text class="i-label">用户 ID</text>
        <view class="i-value copy-row" @click="copyId">
          <text>{{ userId }}</text>
          <text class="copy-tag">复制</text>
        </view>
      </view>
      <view v-if="user.created_at" class="info-row no-line">
        <text class="i-label">加入时间</text>
        <text class="i-value">{{ formatDate(user.created_at) }}</text>
      </view>
    </view>

    <!-- 底部固定发消息按钮 -->
    <view class="footer">
      <button class="msg-btn" @click="goChat">
        <text class="msg-icon">💬</text>
        <text>发消息</text>
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import Avatar from '../../components/Avatar.vue';
import { userApi } from '../../api';

const userId = ref('');
const fallbackName = ref('');
const user = ref({});

const displayName = computed(
  () => user.value.nickname || user.value.username || fallbackName.value || '用户',
);

onLoad((options) => {
  userId.value = options?.userId || '';
  fallbackName.value = decodeURIComponent(options?.name || '');
  load();
});

async function load() {
  if (!userId.value) {
    uni.showToast({ title: '参数错误', icon: 'none' });
    return;
  }
  try {
    user.value = (await userApi.getUser(userId.value)) || {};
  } catch (e) {
    uni.showToast({ title: e?.msg || '加载失败', icon: 'none' });
  }
}

function copyId() {
  uni.setClipboardData({
    data: String(userId.value),
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  });
}

function formatDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function goChat() {
  uni.navigateTo({
    url: `/pages/chat/Chat?friendId=${userId.value}&friendName=${encodeURIComponent(displayName.value)}`,
  });
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: 220rpx;
}

/* —— 封面 —— */
.cover {
  background: var(--primary-gradient);
  padding: 60rpx 32rpx 100rpx;
}
.cover-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.p-name {
  margin-top: 24rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}
.p-account {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
}

/* —— 信息卡片 —— */
.info-card {
  background: var(--card);
  border-radius: var(--radius-lg);
  margin: -60rpx 20rpx 0;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 30rpx 32rpx;
  border-bottom: 1rpx solid var(--line);
}
.info-row.no-line {
  border-bottom: none;
}
.i-label {
  font-size: 28rpx;
  color: var(--text-2);
}
.i-value {
  font-size: 28rpx;
  color: var(--text-1);
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.copy-tag {
  font-size: 20rpx;
  color: var(--primary);
  border: 1rpx solid var(--primary);
  border-radius: 999rpx;
  padding: 2rpx 16rpx;
}

/* —— 底部按钮 —— */
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  background: var(--card);
  border-top: 1rpx solid var(--line);
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.04);
}
.msg-btn {
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 999rpx;
  background: var(--primary-gradient);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 6rpx 16rpx rgba(7, 193, 96, 0.3);
}
.msg-btn::after {
  border: none;
}
.msg-btn:active {
  transform: scale(0.98);
}
.msg-icon {
  font-size: 34rpx;
}
</style>
