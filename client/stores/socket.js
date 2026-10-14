import { defineStore } from 'pinia';
import { ref } from 'vue';
import { SocketIOClient, SocketState } from '../utils/socket';
import config from '../config';
import storage from '../utils/storage';
import logger from '../utils/logger';
import emitter from '../utils/emitter';

export const useSocketStore = defineStore('socket', () => {
  const state = ref(SocketState.DISCONNECTED);
  const lastError = ref(null);

  let client = null;

  function init() {
    if (client) return;
    client = new SocketIOClient({
      url: config.SOCKET_URL,
      path: config.SOCKET_PATH,
      authProvider: () => {
        const token = storage.get('accessToken', '');
        return token ? { token } : {};
      },
      onStateChange: (s) => {
        state.value = s;
        emitter.emit('socket:state-change', s);
        if (s === SocketState.CONNECTED) {
          emitter.emit('socket:connected');
        } else if (s === SocketState.DISCONNECTED) {
          emitter.emit('socket:disconnected');
        }
      },
      onEvent: (event, data) => {
        logger.info('[socket] event:', event);
        emitter.emit('socket:' + event, data);
      },
    });
  }

  function connect() {
    init();
    client.connect();
  }

  function disconnect(byServer = false) {
    if (!client) return;
    client.disconnect(byServer);
  }

  /** 发送业务事件 */
  function send(event, payload, ack) {
    if (!client) return false;
    return client.send(event, payload, ack);
  }

  return {
    state,
    lastError,
    init,
    connect,
    disconnect,
    send,
  };
});
