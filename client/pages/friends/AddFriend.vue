<template>
  <view class="add-friend">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-box">
        <text class="search-icon">🔍</text>
        <input
          v-model="keyword"
          class="search-input"
          placeholder="输入用户名/昵称搜索"
          placeholder-class="ph"
          confirm-type="search"
          @confirm="onSearch"
        />
      </view>
      <view class="search-btn" :class="{ disabled: loading }" @click="onSearch">
        <text>搜索</text>
      </view>
    </view>

    <!-- 搜索结果 -->
    <scroll-view class="result-list" scroll-y>
      <view v-if="loading" class="loading">
        <view class="spinner" />
        <text>搜索中…</text>
      </view>

      <view v-else-if="results.length === 0 && searched" class="empty">
        <view class="empty-icon">🔍</view>
        <text class="empty-title">未找到用户</text>
        <text class="empty-sub">换个用户名或昵称试试</text>
      </view>

      <view v-else-if="results.length" class="list-card">
        <view
          v-for="(u, idx) in results"
          :key="u.id"
          class="user-item"
          :class="{ 'no-line': idx === results.length - 1 }"
        >
          <Avatar :src="u.avatar" :nickname="u.nickname || u.username" :size="88" />
          <view class="user-info">
            <text class="user-name">{{ u.nickname || u.username }}</text>
            <text class="user-account">账号: {{ u.username }}</text>
          </view>
          <view
            class="add-btn"
            :class="{ disabled: u._sent }"
            @click="onSendRequest(u)"
          >
            <text>{{ u._sent ? '已发送' : '添加' }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty">
        <view class="empty-icon">🔎</view>
        <text class="empty-title">搜索用户</text>
        <text class="empty-sub">输入用户名或昵称查找好友</text>
      </view>
    </scroll-view>

    <!-- 备注弹窗 -->
    <view v-if="showRemark" class="remark-mask" @click="showRemark = false">
      <view class="remark-dialog" @click.stop>
        <text class="remark-title">添加好友</text>
        <text class="remark-sub">发送给 {{ currentTarget?.nickname || currentTarget?.username }}</text>
        <input
          v-model="remark"
          class="remark-input"
          placeholder="备注名（选填）"
          placeholder-class="ph"
          maxlength="32"
        />
        <view class="remark-actions">
          <view class="remark-btn cancel" @click="showRemark = false">
            <text>取消</text>
          </view>
          <view class="remark-btn confirm" @click="confirmSend">
            <text>发送</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import Avatar from '../../components/Avatar.vue';
import { userApi, friendApi } from '../../api';

const keyword = ref('');
const results = ref([]);
const loading = ref(false);
const searched = ref(false);
const showRemark = ref(false);
const remark = ref('');
const currentTarget = ref(null);

async function onSearch() {
  const kw = keyword.value.trim();
  if (!kw) return;
  loading.value = true;
  searched.value = false;
  try {
    const list = (await userApi.search(kw)) || [];
    results.value = list.map((u) => ({ ...u, _sent: false }));
    searched.value = true;
  } catch (e) {
    uni.showToast({ title: e?.msg || '搜索失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function onSendRequest(user) {
  if (user._sent) return;
  currentTarget.value = user;
  remark.value = '';
  showRemark.value = true;
}

async function confirmSend() {
  const target = currentTarget.value;
  if (!target) return;
  showRemark.value = false;
  try {
    await friendApi.request({ friendId: String(target.id), remark: remark.value });
    target._sent = true;
    uni.showToast({ title: '好友请求已发送', icon: 'success' });
  } catch (e) {
    if (e?.msg === 'alreadyFriend' || e?.code === 0) {
      uni.showToast({ title: '已经是好友了', icon: 'none' });
    } else {
      uni.showToast({ title: e?.msg || '发送失败', icon: 'none' });
    }
  }
}
</script>

<style scoped>
.add-friend {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* —— 搜索栏 —— */
.search-bar {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: var(--card);
  gap: 16rpx;
}
.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  height: 72rpx;
  padding: 0 24rpx;
  background: var(--bg);
  border-radius: 999rpx;
}
.search-icon {
  font-size: 26rpx;
  margin-right: 12rpx;
  opacity: 0.6;
}
.search-input {
  flex: 1;
  height: 100%;
  background: transparent;
  font-size: 28rpx;
  color: var(--text-1);
}
.ph {
  color: var(--text-3);
}
.search-btn {
  padding: 0 32rpx;
  height: 72rpx;
  line-height: 72rpx;
  background: var(--primary-gradient);
  color: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
  text-align: center;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
  transition: transform 0.1s, opacity 0.2s;
}
.search-btn:active {
  transform: scale(0.96);
}
.search-btn.disabled {
  opacity: 0.6;
}

/* —— 结果列表 —— */
.result-list {
  flex: 1;
  height: calc(100vh - 140rpx);
}
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 80rpx 0;
  color: var(--text-2);
  font-size: 24rpx;
}
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.user-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.user-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.user-info {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}
.user-name {
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 600;
  display: block;
}
.user-account {
  font-size: 24rpx;
  color: var(--text-2);
  display: block;
  margin-top: 6rpx;
}
.add-btn {
  padding: 0 32rpx;
  height: 60rpx;
  line-height: 60rpx;
  background: var(--primary-gradient);
  color: #fff;
  border-radius: 999rpx;
  font-size: 26rpx;
  text-align: center;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
  transition: transform 0.1s;
}
.add-btn:active {
  transform: scale(0.96);
}
.add-btn.disabled {
  background: #e5e5e5;
  color: var(--text-3);
  box-shadow: none;
}

/* —— 空态 —— */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 0;
}
.empty-icon {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56rpx;
  box-shadow: var(--shadow);
  margin-bottom: 28rpx;
}
.empty-title {
  font-size: 30rpx;
  color: var(--text-2);
  font-weight: 500;
}
.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--text-3);
}

/* —— 备注弹窗 —— */
.remark-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.remark-dialog {
  width: 580rpx;
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 48rpx 40rpx 40rpx;
  animation: pop-in 0.2s ease;
}
@keyframes pop-in {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.remark-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--text-1);
  display: block;
  text-align: center;
}
.remark-sub {
  font-size: 26rpx;
  color: var(--text-2);
  display: block;
  text-align: center;
  margin-top: 12rpx;
}
.remark-input {
  height: 88rpx;
  margin-top: 36rpx;
  padding: 0 24rpx;
  background: var(--bg);
  border-radius: var(--radius);
  font-size: 28rpx;
  color: var(--text-1);
}
.remark-actions {
  display: flex;
  gap: 24rpx;
  margin-top: 36rpx;
}
.remark-btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  text-align: center;
  border-radius: 999rpx;
  font-size: 30rpx;
  transition: transform 0.1s;
}
.remark-btn:active {
  transform: scale(0.97);
}
.remark-btn.cancel {
  background: var(--bg);
  color: var(--text-2);
}
.remark-btn.confirm {
  background: var(--primary-gradient);
  color: #fff;
  font-weight: 500;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
}
</style>
