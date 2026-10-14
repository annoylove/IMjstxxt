import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { messageApi } from '../api';
import storage from '../utils/storage';
import logger from '../utils/logger';

/**
 * 会话 = 最近聊天的一侧（可能是单聊 friendId，也可能是群聊 groupId）
 * conversationId 约定：
 *   single:  'u_' + friendId
 *   group:   'g_' + groupId
 */
function makeConvId({ type, id }) {
  return (type === 'group' ? 'g_' : 'u_') + id;
}

export const useSessionStore = defineStore('session', () => {
  /** sessions: Map<convId, Session> */
  const sessions = ref({});
  const loaded = ref(false);

  const sessionList = computed(() => {
    return Object.values(sessions.value).sort((a, b) => {
      const ta = a.lastMsg?.timestamp || 0;
      const tb = b.lastMsg?.timestamp || 0;
      return tb - ta;
    });
  });

  const totalUnread = computed(() =>
    Object.values(sessions.value).reduce((s, v) => s + (v.unread || 0), 0),
  );

  async function loadSessions() {
    // 优先读本地缓存，再拉远端刷新
    const cached = storage.get('sessions', null);
    if (cached && !loaded.value) {
      sessions.value = cached;
    }
    try {
      const list = (await messageApi.sessions()) || [];
      const map = {};
      for (const s of list) {
        map[s.convId] = {
          convId: s.convId,
          conversationType: s.conversationType,
          conversationId: s.conversationId,
          name: s.name,
          avatar: s.avatar,
          lastMsg: s.lastMsg,
          unread: s.unread || 0,
          pinned: !!s.pinned,
        };
      }
      sessions.value = map;
      storage.set('sessions', map);
      return true;
    } catch (e) {
      logger.warn('loadSessions fail', e);
      return false;
    } finally {
      loaded.value = true;
    }
  }

  function upsertSessionFromMessage(msg) {
    // 兼容后端 MSG_ROUTE payload: { toType, toId, fromId, contentType, content, seqId, createdAt }
    const type = msg.toType || msg.conversationType || 'single';
    const otherId = type === 'single'
      ? (msg.fromSelf ? msg.toId : msg.fromId)
      : msg.toId || msg.conversationId;
    const convId = makeConvId({ type, id: otherId });
    const prev = sessions.value[convId] || {
      convId,
      conversationType: type,
      conversationId: otherId,
      name: '',
      avatar: '',
      lastMsg: null,
      unread: 0,
      pinned: false,
    };

    const ts = msg.timestamp || (msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now());
    const newSession = {
      ...prev,
      lastMsg: {
        content: msg.content,
        contentType: msg.contentType,
        timestamp: ts,
        fromId: msg.fromId,
        msgId: msg.seqId || msg.msgId,
      },
    };

    // 不是自己发的 → 未读 +1
    const myId = String(storage.get('userInfo')?.id || '');
    if (String(msg.fromId) !== myId) {
      newSession.unread = (prev.unread || 0) + 1;
    }

    sessions.value[convId] = newSession;
    storage.set('sessions', sessions.value);
  }

  function upsertSession(session) {
    const convId = session.convId || makeConvId(session);
    sessions.value[convId] = { ...(sessions.value[convId] || {}), ...session };
  }

  function markRead(convId) {
    if (sessions.value[convId]) {
      sessions.value[convId].unread = 0;
      storage.set('sessions', sessions.value);
    }
  }

  function removeSession(convId) {
    delete sessions.value[convId];
  }

  function getSession(convId) {
    return sessions.value[convId];
  }

  return {
    sessions,
    loaded,
    sessionList,
    totalUnread,
    loadSessions,
    upsertSession,
    upsertSessionFromMessage,
    markRead,
    removeSession,
    getSession,
    makeConvId,
  };
});
