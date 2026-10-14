import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useChatStore = defineStore('chat', () => {
  /** 当前打开的会话 convId */
  const currentConvId = ref('');
  /** messages: Map<convId, Message[]> */
  const messagesMap = ref({});
  /** 发送中等待 ack 的本地临时消息 Map<localId, tempMessage> */
  const pendingQueue = ref({});
  /** 已读回执队列 Map<convId, latestReadMsgId> */
  const readReceipts = ref({});

  const currentMessages = computed(() => {
    if (!currentConvId.value) return [];
    return messagesMap.value[currentConvId.value] || [];
  });

  function openChat(convId) {
    currentConvId.value = convId;
    if (!messagesMap.value[convId]) messagesMap.value[convId] = [];
  }

  function closeChat() {
    currentConvId.value = '';
  }

  function pushMessage(convId, msg) {
    if (!messagesMap.value[convId]) messagesMap.value[convId] = [];
    const list = messagesMap.value[convId];
    // 避免重复
    if (msg.msgId && list.some((m) => m.msgId === msg.msgId)) return;
    list.push(msg);
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  function prependHistory(convId, history) {
    if (!messagesMap.value[convId]) messagesMap.value[convId] = [];
    const merged = [...history, ...messagesMap.value[convId]];
    // 去重
    const seen = new Set();
    const deduped = merged.filter((m) => {
      if (!m.msgId) return true;
      if (seen.has(m.msgId)) return false;
      seen.add(m.msgId);
      return true;
    });
    deduped.sort((a, b) => a.timestamp - b.timestamp);
    messagesMap.value[convId] = deduped;
  }

  /** 生成本地临时消息（发送中状态），返回 localId */
  function makeTempMessage({ convId, contentType, content }) {
    const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const msg = {
      localId,
      msgId: '',
      convId,
      contentType,
      content,
      timestamp: Date.now(),
      fromSelf: true,
      status: 'sending', // sending | sent | failed | read
    };
    pushMessage(convId, msg);
    pendingQueue.value[localId] = msg;
    return localId;
  }

  /** 发送成功：用后端 msgId 替换临时 */
  function markSent(localId, serverMsgId) {
    const temp = pendingQueue.value[localId];
    if (!temp) return;
    Object.assign(temp, { msgId: serverMsgId, status: 'sent' });
    delete pendingQueue.value[localId];
  }

  function markFailed(localId) {
    const temp = pendingQueue.value[localId];
    if (temp) {
      temp.status = 'failed';
      delete pendingQueue.value[localId];
    }
  }

  function updateReadReceipt(convId, msgId) {
    if (!msgId) return;
    const cur = readReceipts.value[convId] || '';
    if (msgId > cur) readReceipts.value[convId] = msgId;
    // 把该会话里所有 <= msgId 的对方消息标记已读
    const list = messagesMap.value[convId];
    if (list) {
      list.forEach((m) => {
        if (!m.fromSelf && m.msgId && m.msgId <= msgId) m.read = true;
      });
    }
  }

  function clearMessages(convId) {
    if (messagesMap.value[convId]) delete messagesMap.value[convId];
  }

  return {
    currentConvId,
    messagesMap,
    pendingQueue,
    readReceipts,
    currentMessages,
    openChat,
    closeChat,
    pushMessage,
    prependHistory,
    makeTempMessage,
    markSent,
    markFailed,
    updateReadReceipt,
    clearMessages,
  };
});
