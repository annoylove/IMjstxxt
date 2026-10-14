<template>
  <view class="chat-page">
    <!-- 消息列表 -->
    <scroll-view
      ref="scrollRef"
      class="msg-list"
      scroll-y
      :scroll-into-view="scrollToId"
      :scroll-with-animation="true"
    >
      <view v-if="hasMore && messages.length" class="history-more" @click="loadMoreHistory">
        <text>{{ loadingMore ? '加载中…' : '加载更早的消息' }}</text>
      </view>
      <view
        v-for="m in messages"
        :key="m.localId || m.msgId"
        :id="'msg-' + (m.localId || m.msgId)"
      >
        <MsgBubble
          :msg="m"
          :current-user-id="currentUserId"
          @preview-image="onPreviewImage"
          @play-voice="onPlayVoice"
          @retry="onRetrySend"
        />
      </view>
      <view v-if="historyLoading" class="history-tip">
        <text>加载历史消息…</text>
      </view>
      <view v-else-if="historyError" class="history-tip error" @click="loadHistory">
        <text>历史消息加载失败，点击重试</text>
      </view>
      <view v-if="!historyLoading && !messages.length" class="empty-hint">
        <text>开始你们的对话吧</text>
      </view>
    </scroll-view>

    <!-- 输入框 -->
    <MsgInput
      @send-text="onSendText"
      @send-image="onSendImage"
      @send-voice="onSendVoice"
    />
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import MsgBubble from '../../components/MsgBubble.vue';
import MsgInput from '../../components/MsgInput.vue';
import { useChatStore } from '../../stores/chat';
import { useSocketStore } from '../../stores/socket';
import { useUserStore } from '../../stores/user';
import { useSessionStore } from '../../stores/session';
import { messageApi } from '../../api';
import emitter from '../../utils/emitter';
import storage from '../../utils/storage';
import logger from '../../utils/logger';

const chatStore = useChatStore();
const socketStore = useSocketStore();
const userStore = useUserStore();
const sessionStore = useSessionStore();

const friendId = ref('');
const friendName = ref('');
const convId = computed(() => 'u_' + friendId.value);

const scrollToId = ref('');
const historyLoading = ref(false);
const historyError = ref(false);
const hasMore = ref(true);
const loadingMore = ref(false);
const currentUserId = computed(() => String(userStore.userInfo?.id || storage.get('userInfo')?.id || ''));
const messages = computed(() => chatStore.currentMessages);

onMounted(async () => {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  friendId.value = page.options?.friendId || '';
  friendName.value = decodeURIComponent(page.options?.friendName || '');

  // 打开聊天上下文
  chatStore.openChat(convId.value);

  // 标记已读
  sessionStore.markRead(convId.value);

  // 拉历史消息
  await loadHistory();

  // 订阅 socket 新消息（后端 emit 'MSG_ROUTE'）
  emitter.on('socket:MSG_ROUTE', handleNewMessage);
  emitter.on('socket:MSG_RECALL_NOTIFY', handleRecall);
  emitter.on('socket:MSG_ROUTE_DELIVERED_NOTIFY', handleDelivered);
});

onUnmounted(() => {
  emitter.off('socket:MSG_ROUTE', handleNewMessage);
  emitter.off('socket:MSG_RECALL_NOTIFY', handleRecall);
  emitter.off('socket:MSG_ROUTE_DELIVERED_NOTIFY', handleDelivered);
  chatStore.closeChat();
});

async function loadHistory() {
  if (!friendId.value) return;
  historyLoading.value = true;
  historyError.value = false;
  try {
    const history = await messageApi.history(friendId.value, { toType: 'single', limit: 50 });
    // 后端返回 Mongo 文档数组，映射到 chat store 格式
    const mapped = (history || []).map((m) => ({
      msgId: m.seqId,
      fromId: m.fromId,
      toId: m.toId,
      contentType: m.contentType,
      content: m.content,
      timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      fromSelf: String(m.fromId) === String(currentUserId.value),
      status: m.status || 'sent',
    }));
    chatStore.prependHistory(convId.value, mapped);
    hasMore.value = (history || []).length >= 50;
    scrollToBottom();
  } catch (e) {
    historyError.value = true;
    logger.warn('load history fail', e);
  } finally {
    historyLoading.value = false;
  }
}

/** 向上翻页：cursor = 当前最早一条消息的 seqId */
async function loadMoreHistory() {
  if (loadingMore.value || !hasMore.value) return;
  const list = chatStore.messagesMap[convId.value] || [];
  const oldest = list.find((m) => m.msgId);
  if (!oldest) return;
  loadingMore.value = true;
  const anchorId = 'msg-' + (oldest.localId || oldest.msgId);
  try {
    const history = await messageApi.history(friendId.value, { toType: 'single', cursor: oldest.msgId, limit: 30 });
    const mapped = (history || []).map((m) => ({
      msgId: m.seqId,
      fromId: m.fromId,
      toId: m.toId,
      contentType: m.contentType,
      content: m.content,
      timestamp: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
      fromSelf: String(m.fromId) === String(currentUserId.value),
      status: m.status || 'sent',
    }));
    chatStore.prependHistory(convId.value, mapped);
    hasMore.value = mapped.length >= 30;
    // 保持视口停留在原来最早的消息处
    scrollToId.value = '';
    nextTick(() => { scrollToId.value = anchorId; });
  } catch (e) {
    logger.warn('load more history fail', e);
    uni.showToast({ title: '加载失败，请重试', icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function handleNewMessage(data) {
  // 后端 emit 'MSG_ROUTE' payload 格式: { type:'MSG_ROUTE', payload: { seqId, fromId, toId, toType, contentType, content, ... } }
  const msg = data?.payload || data;
  if (msg.toType === 'single' && String(msg.fromId) === String(friendId.value)) {
    chatStore.pushMessage(convId.value, {
      msgId: msg.seqId,
      fromId: msg.fromId,
      toId: msg.toId,
      contentType: msg.contentType,
      content: msg.content,
      timestamp: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now(),
      fromSelf: false,
      status: 'sent',
    });
    scrollToBottom();

    // 回送 Delivered ACK 让发送方知道已送达
    socketStore.send('MSG_DELIVERED_ACK', { seqIds: [msg.seqId] });
  }
}

function handleDelivered(data) {
  // 后端 emit 'MSG_ROUTE_DELIVERED_NOTIFY' payload: { seqIds: [...] }
  const payload = data?.payload || data;
  const seqIds = payload.seqIds || [];
  const list = chatStore.messagesMap[convId.value];
  if (list) {
    list.forEach((m) => {
      if (m.fromSelf && seqIds.includes(m.msgId)) {
        m.status = 'delivered';
      }
    });
  }
}

function handleRecall(data) {
  const payload = data?.payload || data;
  const seqId = payload.seqId;
  const list = chatStore.messagesMap[convId.value];
  if (!list) return;
  const target = list.find((m) => m.msgId === seqId);
  if (target) {
    target.contentType = 'recall';
    target.content = '';
  }
}

function onSendText(text) {
  doSend({ contentType: 'text', content: text });
}
function onSendImage(filePath) {
  doSend({ contentType: 'image', content: filePath });
}
function onSendVoice(tempFilePath, duration) {
  doSend({ contentType: 'voice', content: tempFilePath, voiceDuration: duration });
}

function doSend(payload) {
  // 先在本地插入发送中临时消息
  const localId = chatStore.makeTempMessage({
    convId: convId.value,
    contentType: payload.contentType,
    content: payload.content,
    voiceDuration: payload.voiceDuration,
  });
  scrollToBottom();

  // 后端事件名 'MSG_CHAT'，payload: { requestId, toId, toType, contentType, content }
  const ok = socketStore.send('MSG_CHAT', {
    requestId: localId,
    toId: String(friendId.value),
    toType: 'single',
    contentType: payload.contentType,
    content: payload.content,
  }, (ack) => {
    // 服务端回: { code: 0, data: { type:'MSG_ACK', payload: { requestId, seqId } } }
    if (ack?.code === 0) {
      const seqId = ack?.data?.payload?.seqId || ack?.data?.seqId;
      chatStore.markSent(localId, seqId);
    } else {
      chatStore.markFailed(localId);
      uni.showToast({ title: ack?.message || '发送失败', icon: 'none' });
    }
  });

  if (!ok) {
    // 未连接 → 标记失败，等用户点重试
    chatStore.markFailed(localId);
    uni.showToast({ title: '未连接，点击消息重发', icon: 'none' });
  }
}

function onPreviewImage(url) {
  uni.previewImage({ urls: [url], current: url });
}
function onPlayVoice(tempFilePath) {
  const innerAudio = uni.createInnerAudioContext();
  innerAudio.src = tempFilePath;
  innerAudio.play();
}
function onRetrySend(msg) {
  // 简单重试：删掉旧的重新发
  const list = chatStore.messagesMap[convId.value];
  if (list) {
    const idx = list.indexOf(msg);
    if (idx >= 0) list.splice(idx, 1);
  }
  doSend({
    contentType: msg.contentType,
    content: msg.content,
    voiceDuration: msg.voiceDuration,
  });
}

function scrollToBottom() {
  nextTick(() => {
    const last = messages.value[messages.value.length - 1];
    if (last) scrollToId.value = 'msg-' + (last.localId || last.msgId);
  });
}
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}
.msg-list {
  flex: 1;
  padding: 16rpx 0;
}
.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
  color: var(--text-3);
  font-size: 24rpx;
}
.empty-hint::before {
  content: '💬';
  font-size: 64rpx;
  margin-bottom: 20rpx;
  opacity: 0.5;
}
.history-more {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8rpx auto 16rpx;
  padding: 10rpx 28rpx;
  width: fit-content;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999rpx;
  color: var(--text-2);
  font-size: 22rpx;
}
.history-more:active {
  background: rgba(0, 0, 0, 0.1);
}
.history-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin: 8rpx auto;
  padding: 10rpx 28rpx;
  width: fit-content;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999rpx;
  color: var(--text-2);
  font-size: 22rpx;
}
.history-tip.error {
  color: var(--danger);
  background: rgba(250, 81, 81, 0.08);
}
</style>
