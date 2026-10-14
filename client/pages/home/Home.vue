<template>
  <view class="home">
    <!-- 连接状态提示条 -->
    <view v-if="connectionTip" class="connect-tip" :class="socketState">
      <view class="tip-dot" />
      <text>{{ connectionTip }}</text>
    </view>

    <!-- 会话列表 -->
    <scroll-view class="session-list" scroll-y>
      <!-- 骨架屏 -->
      <view v-if="loading && !sessionList.length" class="list-card skeleton-card">
        <view v-for="i in 4" :key="i" class="sk-item">
          <view class="sk-avatar sk-anim" />
          <view class="sk-main">
            <view class="sk-line sk-line-title sk-anim" />
            <view class="sk-line sk-line-sub sk-anim" />
          </view>
        </view>
      </view>

      <view v-else class="list-card">
        <view
          v-for="(session, idx) in sessionList"
          :key="session.convId"
          class="session-item press-effect fade-in"
          :class="{ 'no-line': idx === sessionList.length - 1 }"
          :style="{ animationDelay: Math.min(idx, 8) * 0.04 + 's' }"
          @click="onOpenSession(session)"
        >
          <view class="avatar-wrap">
            <Avatar
              :src="session.avatar"
              :nickname="session.name"
              :size="96"
              :show-online="session.conversationType === 'single'"
              :online="!!session.online"
            />
            <view v-if="session.unread > 0" class="unread-badge">
              <text>{{ session.unread > 99 ? '99+' : session.unread }}</text>
            </view>
          </view>
          <view class="session-main">
            <view class="session-row1">
              <text class="session-name">{{ session.name || '未知会话' }}</text>
              <text v-if="session.lastMsg" class="session-time">{{ formatTime(session.lastMsg.timestamp) }}</text>
            </view>
            <view class="session-row2">
              <text class="last-msg">{{ formatLastMsg(session.lastMsg) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="!loading && !sessionList.length" class="empty" @click="onEmptyClick">
        <view class="empty-icon">
          <text>{{ loadError ? '⚠️' : '💬' }}</text>
        </view>
        <text class="empty-title">{{ loadError ? '会话加载失败' : '暂无消息' }}</text>
        <text class="empty-sub">{{ loadError ? '点击重试' : '点击右下角 + 添加好友，开始聊天' }}</text>
      </view>
    </scroll-view>

    <!-- 添加好友悬浮按钮 -->
    <view class="fab" @click="goAddFriend">
      <text class="fab-icon">+</text>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import Avatar from '../../components/Avatar.vue';
import { useSessionStore } from '../../stores/session';
import { useSocketStore } from '../../stores/socket';
import emitter from '../../utils/emitter';
import logger from '../../utils/logger';

const sessionStore = useSessionStore();
const socketStore = useSocketStore();

const loading = ref(false);
const loadError = ref(false);

const sessionList = computed(() => sessionStore.sessionList);
const socketState = computed(() => socketStore.state);

const connectionTip = computed(() => {
  const s = socketState.value;
  if (s === 'connecting') return '连接中…';
  if (s === 'reconnecting') return '网络波动，重连中…';
  if (s === 'disconnected') return '未连接';
  return '';
});

function formatTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatLastMsg(lastMsg) {
  if (!lastMsg) return '';
  const t = lastMsg.contentType;
  if (t === 'text') return lastMsg.content;
  if (t === 'image') return '[图片]';
  if (t === 'voice') return '[语音]';
  if (t === 'recall') return '[撤回消息]';
  if (t === 'system') return lastMsg.content;
  return '[消息]';
}

function onOpenSession(session) {
  const url = session.conversationType === 'group'
    ? `/pages/groups/GroupChat?groupId=${session.conversationId}&groupName=${encodeURIComponent(session.name)}`
    : `/pages/chat/Chat?friendId=${session.conversationId}&friendName=${encodeURIComponent(session.name)}`;
  uni.navigateTo({ url });
}

function goAddFriend() {
  uni.navigateTo({ url: '/pages/friends/AddFriend' });
}

function onEmptyClick() {
  if (loadError.value) {
    loadSessions();
  } else {
    goAddFriend();
  }
}

async function loadSessions() {
  loading.value = true;
  loadError.value = false;
  try {
    const ok = await sessionStore.loadSessions();
    if (!ok) loadError.value = true;
  } catch (e) {
    loadError.value = true;
    logger.warn('load sessions fail', e);
  } finally {
    loading.value = false;
  }
}

let offNewMessage;

onMounted(async () => {
  await loadSessions();
  offNewMessage = emitter.on('socket:MSG_ROUTE', (data) => {
    const msg = data?.payload || data;
    sessionStore.upsertSessionFromMessage(msg);
  });
});

// 切回消息 tab 时刷新会话列表（含未读数）
onShow(() => {
  if (sessionStore.loaded) loadSessions();
});

// 下拉刷新
onPullDownRefresh(async () => {
  await loadSessions();
  uni.stopPullDownRefresh();
});

onUnmounted(() => {
  if (offNewMessage) offNewMessage();
});
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* —— 连接状态条 —— */
.connect-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 12rpx 0;
  font-size: 22rpx;
  color: #fff;
}
.connect-tip.connecting,
.connect-tip.reconnecting {
  background: linear-gradient(90deg, #ff9500, #ffb340);
}
.connect-tip.disconnected {
  background: linear-gradient(90deg, #fa5151, #ff7676);
}
.tip-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: #fff;
  animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.session-list {
  flex: 1;
  height: calc(100vh - 200rpx);
}

/* —— 骨架屏 —— */
.skeleton-card {
  padding: 0;
}
.sk-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.sk-item:not(:last-child) {
  border-bottom: 1rpx solid var(--line);
}
.sk-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 20rpx;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.sk-main {
  flex: 1;
}
.sk-line {
  height: 28rpx;
  border-radius: 8rpx;
}
.sk-line-title {
  width: 40%;
}
.sk-line-sub {
  width: 70%;
  height: 22rpx;
  margin-top: 16rpx;
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

/* —— 列表入场动画 —— */
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

/* —— 列表卡片 —— */
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 16rpx 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.session-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
  background: var(--card);
  transition: background 0.15s;
}
.session-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.avatar-wrap {
  position: relative;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.unread-badge {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  min-width: 36rpx;
  height: 36rpx;
  padding: 0 10rpx;
  background: var(--danger);
  color: #fff;
  border-radius: 18rpx;
  font-size: 20rpx;
  line-height: 36rpx;
  text-align: center;
  box-sizing: border-box;
  border: 3rpx solid #fff;
}
.session-main {
  flex: 1;
  min-width: 0;
}
.session-row1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.session-name {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-1);
  max-width: 340rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-time {
  font-size: 22rpx;
  color: var(--text-3);
  flex-shrink: 0;
}
.session-row2 {
  margin-top: 10rpx;
}
.last-msg {
  font-size: 26rpx;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
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
  background: #fff;
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

/* —— 悬浮按钮 —— */
.fab {
  position: fixed;
  right: 40rpx;
  bottom: 160rpx;
  width: 104rpx;
  height: 104rpx;
  background: var(--primary-gradient);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-fab);
  z-index: 100;
  transition: transform 0.15s;
}
.fab:active {
  transform: scale(0.92);
}
.fab-icon {
  font-size: 60rpx;
  color: #fff;
  line-height: 1;
  font-weight: 300;
}
</style>
