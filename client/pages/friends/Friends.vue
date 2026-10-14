<template>
  <view class="friends">
    <!-- 顶部入口 -->
    <view class="top-bar">
      <view class="entry-item press-effect" @click="goAddFriend">
        <view class="entry-icon blue">➕</view>
        <text class="entry-label">添加好友</text>
      </view>
      <view class="entry-item press-effect" @click="goRequests">
        <view class="entry-icon orange">📩
          <view v-if="unreadRequests > 0" class="mini-badge">
            <text>{{ unreadRequests }}</text>
          </view>
        </view>
        <text class="entry-label">新的朋友</text>
      </view>
      <view class="entry-item press-effect" @click="goGroups">
        <view class="entry-icon teal">👥</view>
        <text class="entry-label">群聊</text>
      </view>
    </view>

    <!-- 搜索 -->
    <view class="search-bar">
      <view class="search-box">
        <text class="search-icon">🔍</text>
        <input v-model="keyword" class="search-input" placeholder="搜索好友 / 账号" placeholder-class="ph" confirm-type="search" @confirm="onSearch" />
      </view>
    </view>

    <view class="list-tip">
      <text>长按好友可删除</text>
    </view>

    <!-- 好友列表 -->
    <scroll-view class="friend-list" scroll-y>
      <!-- 骨架屏 -->
      <view v-if="loading && !friends.length" class="list-card">
        <view v-for="i in 5" :key="i" class="sk-item">
          <view class="sk-avatar sk-anim" />
          <view class="sk-main">
            <view class="sk-line sk-line-title sk-anim" />
            <view class="sk-line sk-line-sub sk-anim" />
          </view>
        </view>
      </view>

      <view v-else-if="filteredFriends.length" class="list-card">
        <view
          v-for="(f, idx) in filteredFriends"
          :key="f.id"
          class="friend-item press-effect fade-in"
          :class="{ 'no-line': idx === filteredFriends.length - 1 }"
          :style="{ animationDelay: Math.min(idx, 8) * 0.04 + 's' }"
          @click="onOpenFriend(f)"
          @longpress="onRemoveFriend(f)"
        >
          <Avatar :src="f.avatar" :nickname="f.nickname || f.username" :size="88" :show-online="true" :online="!!f.online" />
          <view class="friend-info">
            <text class="friend-name">{{ f.nickname || f.username }}</text>
            <text v-if="f.signature" class="friend-signature">{{ f.signature }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty">
        <view class="empty-icon">
          <text>👥</text>
        </view>
        <text class="empty-title">{{ keyword ? '未找到相关好友' : '还没有好友' }}</text>
        <text class="empty-sub">{{ keyword ? '换个关键词试试' : '点击上方「添加好友」开始吧' }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import Avatar from '../../components/Avatar.vue';
import { friendApi } from '../../api';
import { useFriendRequestStore } from '../../stores/friendRequest';

const friends = ref([]);
const keyword = ref('');
const loading = ref(false);
const frStore = useFriendRequestStore();
const unreadRequests = computed(() => frStore.pendingCount);

const filteredFriends = computed(() => {
  if (!keyword.value) return friends.value;
  const k = keyword.value.toLowerCase();
  return friends.value.filter(
    (f) =>
      (f.nickname || '').toLowerCase().includes(k) ||
      (f.username || '').toLowerCase().includes(k) ||
      (f.account || '').toLowerCase().includes(k),
  );
});

onMounted(load);
onShow(() => {
  frStore.load();
});

async function load() {
  loading.value = true;
  try {
    friends.value = (await friendApi.list()) || [];
  } catch (e) {
    uni.showToast({ title: e?.msg || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

// 下拉刷新
onPullDownRefresh(async () => {
  await Promise.all([load(), frStore.load()]);
  uni.stopPullDownRefresh();
});

function onSearch() {
  // 远程搜索接入点
}

// 长按好友 → 删除
function onRemoveFriend(f) {
  const name = f.nickname || f.username || 'TA';
  uni.showModal({
    title: '删除好友',
    content: `确定删除好友「${name}」吗？删除后将互相从好友列表移除`,
    confirmText: '删除',
    confirmColor: '#e64340',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await friendApi.remove(f.id);
        friends.value = friends.value.filter((x) => String(x.id) !== String(f.id));
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e?.msg || '删除失败', icon: 'none' });
      }
    },
  });
}

function goRequests() {
  uni.navigateTo({ url: '/pages/friends/Requests' });
}

function goAddFriend() {
  uni.navigateTo({ url: '/pages/friends/AddFriend' });
}

function goGroups() {
  uni.navigateTo({ url: '/pages/groups/Groups' });
}

function onOpenFriend(friend) {
  uni.navigateTo({
    url: `/pages/friends/FriendProfile?userId=${friend.id}&name=${encodeURIComponent(friend.remark || friend.nickname || friend.username || '')}`,
  });
}
</script>

<style scoped>
.friends {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* —— 顶部入口 —— */
.top-bar {
  background: var(--card);
  margin-bottom: 16rpx;
  border-radius: 0 0 var(--radius) var(--radius);
}
.entry-item {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
}
.entry-item:not(:last-child) {
  border-bottom: 1rpx solid var(--line);
}
.entry-icon {
  position: relative;
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  margin-right: 24rpx;
  flex-shrink: 0;
  color: #fff;
}
.entry-icon.blue {
  background: linear-gradient(135deg, #57b9ff, #2b7de9);
}
.entry-icon.orange {
  background: linear-gradient(135deg, #ffc06a, #ff9500);
}
.entry-icon.teal {
  background: linear-gradient(135deg, #36d6a9, #07c160);
}
.entry-label {
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 500;
}
.mini-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  background: var(--danger);
  color: #fff;
  border-radius: 16rpx;
  font-size: 20rpx;
  line-height: 32rpx;
  text-align: center;
  border: 2rpx solid #fff;
  box-sizing: border-box;
}

/* —— 搜索 —— */
.search-bar {
  padding: 16rpx 24rpx;
  background: var(--card);
  margin-bottom: 16rpx;
}
.search-box {
  display: flex;
  align-items: center;
  height: 68rpx;
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
  font-size: 26rpx;
  color: var(--text-1);
}
.ph {
  color: var(--text-3);
}

/* —— 骨架屏 —— */
.sk-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.sk-item:not(:last-child) {
  border-bottom: 1rpx solid var(--line);
}
.sk-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 18rpx;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.sk-main {
  flex: 1;
}
.sk-line {
  height: 26rpx;
  border-radius: 8rpx;
}
.sk-line-title {
  width: 36%;
}
.sk-line-sub {
  width: 60%;
  height: 20rpx;
  margin-top: 14rpx;
}
.sk-anim {
  background: linear-gradient(90deg, #f0f0f0 25%, #e2e2e2 37%, #f0f0f0 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
.fade-in {
  animation: fadeUp 0.3s ease both;
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* —— 列表 —— */
.list-tip {
  padding: 4rpx 32rpx 8rpx;
  font-size: 22rpx;
  color: var(--text-3);
}
.friend-list {
  flex: 1;
  height: calc(100vh - 520rpx);
}
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 0 20rpx 16rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.friend-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.friend-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.friend-info {
  flex: 1;
  margin-left: 24rpx;
  min-width: 0;
}
.friend-name {
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 600;
  display: block;
}
.friend-signature {
  font-size: 24rpx;
  color: var(--text-2);
  display: block;
  margin-top: 6rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* —— 空态 —— */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 0;
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
