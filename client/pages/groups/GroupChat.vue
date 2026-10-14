<template>
  <view class="chat-page">
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
      <view v-if="!messages.length" class="empty-hint">
        <text>群聊中说点什么吧</text>
      </view>
    </scroll-view>

    <MsgInput
      @send-text="onSendText"
      @send-image="onSendImage"
      @send-voice="onSendVoice"
    />
  </view>
</template>

<script setup>
// 群聊页面：与单聊 Chat.vue 协议一致，仅 toType 换成 group
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import MsgBubble from '../../components/MsgBubble.vue';
import MsgInput from '../../components/MsgInput.vue';
import { useChatStore } from '../../stores/chat';
import { useSocketStore } from '../../stores/socket';
import { useUserStore } from '../../stores/user';
import { messageApi } from '../../api';
import emitter from '../../utils/emitter';
import storage from '../../utils/storage';
import logger from '../../utils/logger';

const chatStore = useChatStore();
const socketStore = useSocketStore();
const userStore = useUserStore();

const groupId = ref('');
const convId = computed(() => 'g_' + groupId.value);
const scrollToId = ref('');
const hasMore = ref(true);
const loadingMore = ref(false);

const currentUserId = computed(() => userStore.userInfo?.id || storage.get('userInfo')?.id || '');
const messages = computed(() => chatStore.currentMessages);

onMounted(async () => {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  groupId.value = page.options?.groupId || '';

  chatStore.openChat(convId.value);
  await loadHistory();

  // 订阅 socket 事件（与后端协议事件名一致）
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
  if (!groupId.value) return;
  try {
    const history = await messageApi.history(groupId.value, { toType: 'group', limit: 50 });
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
    logger.warn('group history load fail', e);
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
    const history = await messageApi.history(groupId.value, { toType: 'group', cursor: oldest.msgId, limit: 30 });
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
    scrollToId.value = '';
    nextTick(() => { scrollToId.value = anchorId; });
  } catch (e) {
    logger.warn('group load more history fail', e);
    uni.showToast({ title: '加载失败，请重试', icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

function handleNewMessage(data) {
  const msg = data?.payload || data;
  if (msg.toType !== 'group' || String(msg.toId) !== String(groupId.value)) return;
  // 群房间包含发送方自己：自己的消息由 ack 更新，忽略回声避免重复
  if (String(msg.fromId) === String(currentUserId.value)) return;
  const list = chatStore.messagesMap[convId.value] || [];
  if (list.some((m) => m.msgId && String(m.msgId) === String(msg.seqId))) return;
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
  // 回送 Delivered ACK
  socketStore.send('MSG_DELIVERED_ACK', { seqIds: [msg.seqId] });
}

function handleDelivered(data) {
  const payload = data?.payload || data;
  const seqIds = payload.seqIds || [];
  const list = chatStore.messagesMap[convId.value];
  if (list) {
    list.forEach((m) => {
      if (m.fromSelf && seqIds.includes(m.msgId)) m.status = 'delivered';
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

function doSend(payload) {
  const localId = chatStore.makeTempMessage({
    convId: convId.value,
    contentType: payload.contentType,
    content: payload.content,
    voiceDuration: payload.voiceDuration,
  });
  scrollToBottom();

  const ok = socketStore.send('MSG_CHAT', {
    requestId: localId,
    toId: String(groupId.value),
    toType: 'group',
    contentType: payload.contentType,
    content: payload.content,
  }, (ack) => {
    if (ack?.code === 0) {
      const seqId = ack?.data?.payload?.seqId || ack?.data?.seqId;
      chatStore.markSent(localId, seqId);
    } else {
      chatStore.markFailed(localId);
      uni.showToast({ title: ack?.message || '发送失败', icon: 'none' });
    }
  });

  if (!ok) {
    chatStore.markFailed(localId);
    uni.showToast({ title: '未连接，点击消息重发', icon: 'none' });
  }
}

function onSendText(t) { doSend({ contentType: 'text', content: t }); }
function onSendImage(p) { doSend({ contentType: 'image', content: p }); }
function onSendVoice(p, d) { doSend({ contentType: 'voice', content: p, voiceDuration: d }); }

function onPreviewImage(url) { uni.previewImage({ urls: [url], current: url }); }
function onPlayVoice(fp) {
  const audio = uni.createInnerAudioContext();
  audio.src = fp;
  audio.play();
}
function onRetrySend(msg) {
  const list = chatStore.messagesMap[convId.value];
  if (list) {
    const idx = list.indexOf(msg);
    if (idx >= 0) list.splice(idx, 1);
  }
  doSend({ contentType: msg.contentType, content: msg.content, voiceDuration: msg.voiceDuration });
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
  content: '👥';
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
</style>
