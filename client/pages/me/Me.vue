<template>
  <view class="me-page">
    <!-- 用户信息头部（渐变背景） -->
    <view class="profile-header">
      <view class="profile-card">
        <Avatar
          :src="userInfo?.avatar"
          :nickname="userInfo?.nickname || userInfo?.username"
          :size="128"
          :show-online="true"
          :online="socketState === 'connected'"
        />
        <view class="profile-info">
          <text class="nickname">{{ userInfo?.nickname || userInfo?.username || '未登录' }}</text>
          <view class="id-row">
            <text class="account">ID: {{ userInfo?.id || '-' }}</text>
            <text class="state-tag" :class="socketState === 'connected' ? 'on' : 'off'">
              {{ socketState === 'connected' ? '在线' : '离线' }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 个人信息明细 -->
    <view class="info-card">
      <view class="info-row" @click="goProfile">
        <text class="i-label">昵称</text>
        <view class="i-value-row">
          <text class="i-value">{{ userInfo?.nickname || userInfo?.username || '-' }}</text>
          <text class="i-edit">修改 ›</text>
        </view>
      </view>
      <view class="info-row">
        <text class="i-label">账号</text>
        <text class="i-value">{{ userInfo?.username || '-' }}</text>
      </view>
      <view class="info-row no-line" @click="copyId">
        <text class="i-label">用户 ID</text>
        <view class="i-value-row">
          <text class="i-value">{{ userInfo?.id || '-' }}</text>
          <text class="copy-tag">复制</text>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-group">
      <view class="menu-item press-effect" @click="goProfile">
        <view class="menu-left">
          <view class="menu-icon blue">👤</view>
          <text class="menu-label">个人资料</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item press-effect" @click="goSettings">
        <view class="menu-left">
          <view class="menu-icon purple">⚙️</view>
          <text class="menu-label">设置</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item press-effect no-line" @click="goAbout">
        <view class="menu-left">
          <view class="menu-icon teal">ℹ️</view>
          <text class="menu-label">关于</text>
        </view>
        <text class="arrow">›</text>
      </view>
    </view>

    <button class="logout-btn" @click="onLogout">退出登录</button>

    <!-- 资料编辑弹窗 -->
    <view v-if="editVisible" class="edit-mask" @click="editVisible = false">
      <view class="edit-card" @click.stop>
        <text class="edit-title">编辑资料</text>

        <view class="edit-avatar-row">
          <Avatar :src="editAvatar" :nickname="editNickname || userInfo?.username" :size="112" />
          <view class="edit-avatar-actions">
            <button class="mini-btn" :disabled="uploading" @click="onChooseAvatar">
              {{ uploading ? '上传中…' : '更换头像' }}
            </button>
            <text v-if="editAvatar" class="mini-link" @click="editAvatar = ''">移除</text>
          </view>
        </view>

        <view class="edit-field">
          <text class="edit-label">昵称</text>
          <input v-model="editNickname" class="edit-input" placeholder="请输入昵称" maxlength="32" />
        </view>

        <view class="edit-btns">
          <button class="edit-btn cancel" @click="editVisible = false">取消</button>
          <button class="edit-btn save" :disabled="saving" @click="onSaveProfile">{{ saving ? '保存中…' : '保存' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import Avatar from '../../components/Avatar.vue';
import { useUserStore } from '../../stores/user';
import { useSocketStore } from '../../stores/socket';
import { messageApi } from '../../api';
import logger from '../../utils/logger';

const userStore = useUserStore();
const socketStore = useSocketStore();

const userInfo = computed(() => userStore.userInfo);
const socketState = computed(() => socketStore.state);

// —— 资料编辑 ——
const editVisible = ref(false);
const editNickname = ref('');
const editAvatar = ref('');
const uploading = ref(false);
const saving = ref(false);

function goProfile() {
  editNickname.value = userInfo.value?.nickname || '';
  editAvatar.value = userInfo.value?.avatar || '';
  editVisible.value = true;
}

function onChooseAvatar() {
  uni.chooseImage({
    count: 1,
    success: async ({ tempFilePaths }) => {
      const fp = tempFilePaths?.[0];
      if (!fp) return;
      uploading.value = true;
      try {
        const up = await messageApi.upload(fp, { type: 'image' });
        // 兼容不同返回结构：字符串 / { url } / { path }
        editAvatar.value = typeof up === 'string' ? up : (up?.url || up?.path || '');
        if (!editAvatar.value) uni.showToast({ title: '上传成功但未返回地址', icon: 'none' });
      } catch (e) {
        logger.warn('avatar upload fail', e);
        uni.showToast({ title: '头像上传失败', icon: 'none' });
      } finally {
        uploading.value = false;
      }
    },
  });
}

async function onSaveProfile() {
  const nickname = editNickname.value.trim();
  if (!nickname) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    await userStore.updateMe({ nickname, avatar: editAvatar.value });
    uni.showToast({ title: '已保存', icon: 'success' });
    editVisible.value = false;
  } catch (e) {
    uni.showToast({ title: e?.msg || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

function goSettings() {
  uni.navigateTo({ url: '/pages/me/Settings' });
}

function copyId() {
  if (!userInfo.value?.id) return;
  uni.setClipboardData({
    data: String(userInfo.value.id),
    success: () => uni.showToast({ title: '已复制', icon: 'none' }),
  });
}
function goAbout() {
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
    success: async (res) => {
      if (!res.confirm) return;
      socketStore.disconnect();
      await userStore.logout();
    },
  });
}
</script>

<style scoped>
.me-page {
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: 120rpx;
}

/* —— 头部 —— */
.profile-header {
  background: var(--primary-gradient);
  padding: 60rpx 32rpx 80rpx;
}
.profile-card {
  display: flex;
  align-items: center;
}
.profile-info {
  margin-left: 28rpx;
}
.nickname {
  display: block;
  font-size: 38rpx;
  font-weight: 700;
  color: #fff;
}
.id-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 14rpx;
}
.account {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
}
.state-tag {
  font-size: 20rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
.state-tag.off {
  background: rgba(0, 0, 0, 0.15);
}

/* —— 信息明细 —— */
.info-card {
  background: var(--card);
  border-radius: var(--radius-lg);
  margin: -40rpx 20rpx 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid var(--line);
}
.info-row.no-line {
  border-bottom: none;
}
.i-label {
  font-size: 28rpx;
  color: var(--text-2);
}
.i-value-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.i-value {
  font-size: 28rpx;
  color: var(--text-1);
  max-width: 380rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.i-edit {
  font-size: 24rpx;
  color: var(--primary);
}
.copy-tag {
  font-size: 20rpx;
  color: var(--primary);
  border: 1rpx solid var(--primary);
  border-radius: 999rpx;
  padding: 2rpx 16rpx;
}

/* —— 菜单 —— */
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
.menu-icon.blue {
  background: linear-gradient(135deg, #57b9ff, #2b7de9);
}
.menu-icon.purple {
  background: linear-gradient(135deg, #a78bfa, #7c5cf0);
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

/* —— 退出 —— */
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

/* —— 资料编辑弹窗 —— */
.edit-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  animation: maskIn 0.2s ease;
}
@keyframes maskIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.edit-card {
  width: 620rpx;
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 40rpx 36rpx;
  box-sizing: border-box;
  animation: cardIn 0.25s ease;
}
@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(30rpx) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.edit-title {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-1);
  text-align: center;
  margin-bottom: 36rpx;
}
.edit-avatar-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32rpx;
  margin-bottom: 36rpx;
}
.edit-avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  align-items: flex-start;
}
.mini-btn {
  font-size: 24rpx;
  padding: 0 28rpx;
  height: 60rpx;
  line-height: 60rpx;
  background: var(--primary);
  color: #fff;
  border-radius: 999rpx;
  border: none;
}
.mini-btn[disabled] {
  opacity: 0.6;
}
.mini-btn::after {
  border: none;
}
.mini-link {
  font-size: 22rpx;
  color: var(--text-3);
  padding: 4rpx 8rpx;
}
.edit-field {
  display: flex;
  align-items: center;
  background: #f7f7f7;
  border-radius: var(--radius);
  padding: 0 24rpx;
  margin-bottom: 36rpx;
}
.edit-label {
  font-size: 26rpx;
  color: var(--text-2);
  flex-shrink: 0;
}
.edit-input {
  flex: 1;
  height: 80rpx;
  padding-left: 20rpx;
  background: transparent;
  font-size: 28rpx;
  color: var(--text-1);
}
.edit-btns {
  display: flex;
  gap: 24rpx;
}
.edit-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  border: none;
}
.edit-btn::after {
  border: none;
}
.edit-btn.cancel {
  background: #f2f2f2;
  color: var(--text-1);
}
.edit-btn.save {
  background: var(--primary-gradient);
  color: #fff;
  font-weight: 600;
}
.edit-btn.save[disabled] {
  opacity: 0.6;
}
</style>
