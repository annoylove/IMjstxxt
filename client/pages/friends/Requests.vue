<template>
  <view class="requests">
    <scroll-view class="req-list" scroll-y>
      <view v-if="requests.length" class="list-card">
        <view
          v-for="(r, idx) in requests"
          :key="r.fromUserId"
          class="req-item"
          :class="{ 'no-line': idx === requests.length - 1 }"
        >
          <Avatar :src="r.fromAvatar" :nickname="r.fromNickname || r.fromAccount" :size="96" />
          <view class="req-info">
            <text class="req-name">{{ r.fromNickname || r.fromAccount }}</text>
            <text class="req-msg">{{ r.remark || '请求添加你为好友' }}</text>
          </view>
          <view class="req-actions">
            <button
              v-if="r.status === 'pending'"
              class="action-btn accept"
              :disabled="handlingIds.has(r.fromUserId)"
              @click="onAccept(r)"
            >接受</button>
            <button
              v-if="r.status === 'pending'"
              class="action-btn reject"
              :disabled="handlingIds.has(r.fromUserId)"
              @click="onReject(r)"
            >拒绝</button>
            <text v-else class="status-tag" :class="r.status">{{ statusText(r.status) }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty">
        <view class="empty-icon">
          <text>📭</text>
        </view>
        <text class="empty-title">暂无好友请求</text>
        <text class="empty-sub">新朋友会在这里出现</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import Avatar from '../../components/Avatar.vue';
import { friendApi } from '../../api';
import { useFriendRequestStore } from '../../stores/friendRequest';
import emitter from '../../utils/emitter';

const requests = ref([]);
const handlingIds = ref(new Set());
const frStore = useFriendRequestStore();

onMounted(async () => {
  await load();
  frStore.reset();
  offNotify = emitter.on('socket:FRIEND_REQUEST_NOTIFY', () => {
    load();
    frStore.reset();
  });
});

onUnmounted(() => {
  if (offNotify) offNotify();
});

let offNotify;

// 下拉刷新
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});

async function load() {
  try {
    requests.value = (await friendApi.requests()) || [];
  } catch (e) {
    uni.showToast({ title: e?.msg || '加载失败', icon: 'none' });
  }
}

function statusText(s) {
  if (s === 'accepted') return '已添加';
  if (s === 'rejected') return '已拒绝';
  return '';
}

async function onAccept(r) {
  handlingIds.value.add(r.fromUserId);
  try {
    await friendApi.accept(r.fromUserId);
    r.status = 'accepted';
    uni.showToast({ title: '已添加好友', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e?.msg || '操作失败', icon: 'none' });
  } finally {
    handlingIds.value.delete(r.fromUserId);
  }
}

async function onReject(r) {
  handlingIds.value.add(r.fromUserId);
  try {
    await friendApi.reject(r.fromUserId);
    r.status = 'rejected';
  } catch (e) {
    uni.showToast({ title: e?.msg || '操作失败', icon: 'none' });
  } finally {
    handlingIds.value.delete(r.fromUserId);
  }
}
</script>

<style scoped>
.requests {
  min-height: 100vh;
  background: var(--bg);
}
.req-list {
  height: 100vh;
}
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.req-item {
  display: flex;
  align-items: center;
  padding: 28rpx;
}
.req-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.req-info {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}
.req-name {
  display: block;
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 600;
}
.req-msg {
  display: block;
  font-size: 24rpx;
  color: var(--text-2);
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.req-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}
.action-btn {
  padding: 0 28rpx;
  height: 60rpx;
  line-height: 60rpx;
  font-size: 24rpx;
  border-radius: 999rpx;
  border: none;
  margin: 0;
}
.action-btn::after {
  border: none;
}
.action-btn.accept {
  background: var(--primary-gradient);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
}
.action-btn.accept[disabled] {
  background: #d9f3e3;
  color: #fff;
  box-shadow: none;
}
.action-btn.reject {
  background: #f2f2f2;
  color: var(--text-2);
}
.action-btn.reject[disabled] {
  color: #ccc;
}
.status-tag {
  font-size: 24rpx;
  color: var(--text-3);
  padding: 8rpx 20rpx;
  background: var(--bg);
  border-radius: 999rpx;
}
.status-tag.accepted {
  color: var(--primary);
  background: rgba(7, 193, 96, 0.1);
}

/* —— 空态 —— */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 0;
}
.empty-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
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
</style>
