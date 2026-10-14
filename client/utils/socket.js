/**
 * Socket.io 客户端封装（纯 WebSocket，自实现 EIO v4 + Socket.io 协议）
 *
 * Uni-app 不支持 socket.io-client（依赖 XMLHttpRequest / WebSocket 二进制等
 * 在小程序环境被裁剪），所以这里手写 Socket.io 协议握手 + 消息编解码。
 *
 * 使用的是 Engine.IO v4 + Socket.io 4.x 协议：
 *   1. 连接 URL: `${SOCKET_URL}/im/?EIO=4&transport=websocket`
 *   2. open 帧 (握手包) 以字符串 "0" 开头，payload 是 JSON，包含 sid/pingInterval/pingTimeout/...
 *      我们需要在 open 包里携带 auth（Socket.io 服务器约定）
 *      Engine.IO 协议本身 open 帧是 `0${json}`；Socket.io 层会在 open 帧 payload 里带 `auth`。
 *      但因为是 websocket transport，EIO open 包就是一个字符串 JSON `0{"sid":"...",...}`，
 *      我们先发一个 `40`（Socket.io open packet）来把 auth 带上——实际上：
 *        - EIO open:  服务端 → 客户端:  `0{"sid":"xxx","pingInterval":25000,"pingTimeout":20000,...}`
 *        - Socket.io 层: 客户端 → 服务端: `40${JSON.stringify({ auth: { token } })}`
 *        - 服务端 → 客户端: `40` 或 `44`(错误)
 *        - 之后正常收发 `42["event", {...}]`
 *   3. 心跳：
 *        - EIO 层：客户端每 pingInterval 发 `2`（ping），服务端回 `3`（pong）
 *        - Socket.io 层 ping/pong 已被 EIO 层吸收，不再单独发
 *   4. 消息帧前缀：
 *        0 = open
 *        1 = close
 *        2 = ping
 *        3 = pong
 *        4 = message → 下一位数字决定类型：
 *          40 = Socket.io open (握手带 auth)
 *          42 = Socket.io event  (业务事件)
 *          43 = Socket.io ack
 *          44 = Socket.io error
 *          41 = Socket.io disconnect
 *
 * 注：uni.connectSocket 返回一个 SocketTask 对象，它的 send 只支持 String/ArrayBuffer。
 *     小程序里通常走 String 就够了。
 */

import config from '../config';
import logger from './logger';

const TAG = '[SocketIO]';

// 重连指数退避初始/最大延迟
const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = config.MAX_RECONNECT_DELAY || 60000;

// 状态常量
export const SocketState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
});

export class SocketIOClient {
  constructor({ url, path, authProvider, onStateChange, onEvent }) {
    this.url = url;
    this.path = path || '/im';
    this.authProvider = authProvider || (() => ({})); // 函数，每次连接时拿最新 token
    this.onStateChange = onStateChange || (() => {});
    this.onEvent = onEvent || (() => {});

    this.state = SocketState.DISCONNECTED;
    this.socketTask = null;
    this.sid = null;
    this.pingInterval = 25000;
    this.pingTimeout = 20000;

    this._heartbeatTimer = null;
    this._pongTimer = null;
    this._backoff = INITIAL_BACKOFF;
    this._reconnectTimer = null;
    this._reconnectDebounceTimer = null;
    this._manuallyClosed = false;
    this._seq = 0; // ack 序号（预留）
    this._pendingAcks = new Map();
  }

  setState(next) {
    if (this.state === next) return;
    logger.debug(TAG, 'state:', this.state, '→', next);
    this.state = next;
    this.onStateChange(next);
  }

  /** 生成 EIO 连接 URL */
  _buildUrl() {
    // url 形如 http://host:port  或  https://host:port
    // uni.connectSocket 需要完整 ws:// 或 wss://
    const proto = this.url.startsWith('https') ? 'wss' : 'ws';
    const host = this.url.replace(/^https?:\/\//, '');
    const query = 'EIO=4&transport=websocket';
    return `${proto}://${host}${this.path}/?${query}`;
  }

  /** 对外：发起连接 */
  connect() {
    if (
      this.state === SocketState.CONNECTING ||
      this.state === SocketState.CONNECTED
    ) {
      logger.debug(TAG, 'connect() skipped, state =', this.state);
      return;
    }
    this._manuallyClosed = false;
    this._clearReconnectTimer();
    this._clearDebounceTimer();
    this.setState(SocketState.CONNECTING);
    this._doConnect();
  }

  _doConnect() {
    const fullUrl = this._buildUrl();
    logger.info(TAG, 'connecting →', fullUrl);

    this.socketTask = uni.connectSocket({
      url: fullUrl,
      complete: () => {},
    });

    this.socketTask.onOpen(() => {
      logger.info(TAG, 'EIO websocket opened');
      // 等 EIO open 帧回来后再发 socket.io open（带 auth）
      // 这里先不做什么
    });

    this.socketTask.onMessage((evt) => this._onMessage(evt));

    this.socketTask.onError((err) => {
      logger.error(TAG, 'onError:', err);
      this._handleCloseOrError(true);
    });

    this.socketTask.onClose((evt) => {
      logger.warn(TAG, 'onClose:', evt);
      this._handleCloseOrError(false);
    });
  }

  _onMessage(evt) {
    const raw = typeof evt === 'string' ? evt : evt.data;
    if (!raw) return;
    // 只处理字符串帧
    if (typeof raw !== 'string') {
      logger.warn(TAG, 'binary frame ignored');
      return;
    }

    logger.debug(TAG, '←', raw);

    const prefix = raw[0];
    switch (prefix) {
      case '0': // EIO open
        this._handleEioOpen(raw.slice(1));
        break;
      case '1': // EIO close
        logger.info(TAG, 'EIO close frame received');
        break;
      case '2': // EIO ping
        this._sendRaw('3'); // pong
        break;
      case '3': // EIO pong
        this._clearPongTimeout();
        break;
      case '4': // Socket.io message
        this._handleSocketMessage(raw.slice(1));
        break;
      default:
        logger.warn(TAG, 'unknown frame:', raw);
    }
  }

  _handleEioOpen(payload) {
    try {
      const conf = JSON.parse(payload);
      this.sid = conf.sid;
      this.pingInterval = conf.pingInterval || 25000;
      this.pingTimeout = conf.pingTimeout || 20000;
      logger.info(TAG, 'EIO open, sid =', this.sid);
    } catch (e) {
      logger.error(TAG, 'EIO open parse failed:', e);
    }

    // 发 Socket.io open (40) 带 auth
    // Socket.io v4: CONNECT 包的 data 直接就是 auth 字段（spread），不包裹在 {auth:...} 里
    const auth = this.authProvider();
    this._sendRaw('40' + JSON.stringify(auth));
  }

  /** payload 是去掉前导 "4" 之后的内容 */
  _handleSocketMessage(payload) {
    if (!payload) return;
    const code = payload[0];
    const rest = payload.slice(1);

    switch (code) {
      case '0': // Socket.io open
        logger.info(TAG, 'Socket.io open confirmed');
        this._onConnected();
        break;
      case '1': // Socket.io disconnect
        logger.info(TAG, 'Socket.io disconnect');
        this.disconnect(true);
        break;
      case '2': // Socket.io event (业务事件)
        this._handleSocketEvent(rest);
        break;
      case '3': // Socket.io ack
        this._handleAck(rest);
        break;
      case '4': // Socket.io CONNECT_ERROR
        logger.error(TAG, 'Socket.io CONNECT_ERROR:', rest);
        this._handleCloseOrError(true);
        break;
      default:
        logger.warn(TAG, 'unknown socket.io code:', code, 'rest:', rest);
    }
  }

  _handleSocketEvent(rest) {
    // rest 形如 ["eventName", {...}]  或  ["eventName", {...}, ackId]
    try {
      // 用 indexOf 找到第一个逗号后的有效位置，简单 JSON.parse 整条
      const parsed = JSON.parse(rest);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const [eventName, data] = parsed;
        logger.debug(TAG, 'event:', eventName, data);
        this.onEvent(eventName, data);
      }
    } catch (e) {
      logger.error(TAG, 'socket event parse failed:', e, 'raw:', rest);
    }
  }

  _handleAck(rest) {
    try {
      // rest 形如 "123" 或 "123[...]"：ackId + args 数组
      // Socket.io v4 协议：服务端 ack(obj) 回传的 data 永远是 args 数组 [obj]
      let i = 0;
      while (i < rest.length && /\d/.test(rest[i])) i++;
      const ackId = parseInt(rest.slice(0, i), 10);
      const dataStr = rest.slice(i);
      let args = dataStr ? JSON.parse(dataStr) : [];
      // 解包 args 数组：单参数回调取第一个元素
      const data = Array.isArray(args) ? args[0] : args;
      const cb = this._pendingAcks.get(ackId);
      if (cb) {
        this._pendingAcks.delete(ackId);
        cb(data);
      }
    } catch (e) {
      logger.error(TAG, 'ack parse failed:', e, 'raw:', rest);
    }
  }

  _onConnected() {
    this._backoff = INITIAL_BACKOFF;
    this.setState(SocketState.CONNECTED);
    this._startHeartbeat();
  }

  _startHeartbeat() {
    this._clearHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this.state !== SocketState.CONNECTED) return;
      this._sendRaw('2'); // EIO ping
      // pong 超时保护
      this._pongTimer = setTimeout(() => {
        logger.warn(TAG, 'pong timeout → force disconnect');
        this._handleCloseOrError(true);
      }, this.pingTimeout);
    }, this.pingInterval);
  }

  _clearHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _clearPongTimeout() {
    if (this._pongTimer) {
      clearTimeout(this._pongTimer);
      this._pongTimer = null;
    }
  }

  _sendRaw(str) {
    if (!this.socketTask) return;
    logger.debug(TAG, '→', str);
    try {
      this.socketTask.send({
        data: str,
        fail: (err) => logger.error(TAG, 'send fail:', err),
      });
    } catch (e) {
      logger.error(TAG, 'send exception:', e);
    }
  }

  /** 业务发送：event + payload + 可选 ack 回调 */
  send(event, payload, ack) {
    if (this.state !== SocketState.CONNECTED) {
      logger.warn(TAG, 'send() skipped, not connected. state =', this.state);
      return false;
    }
    const packet = [event, payload];
    // Socket.io v4: ackId 是包级别字段，紧跟在类型码 42 之后，不在 event 数组里
    // 格式: 42<ackId>["event", payload]，无 ack 时为 42["event", payload]
    let ackId = '';
    if (typeof ack === 'function') {
      this._seq += 1;
      ackId = this._seq;
      this._pendingAcks.set(ackId, ack);
    }
    this._sendRaw('42' + ackId + JSON.stringify(packet));
    return true;
  }

  /** 主动断开 */
  disconnect(byServer = false) {
    this._manuallyClosed = !byServer;
    this._clearHeartbeat();
    this._clearPongTimeout();
    this._clearReconnectTimer();
    this._clearDebounceTimer();
    if (this.socketTask) {
      try {
        this.socketTask.close({});
      } catch (e) {
        /* ignore */
      }
      this.socketTask = null;
    }
    this.setState(SocketState.DISCONNECTED);
  }

  _handleCloseOrError(isError) {
    const wasConnected = this.state === SocketState.CONNECTED;
    this._clearHeartbeat();
    this._clearPongTimeout();
    if (this.socketTask) {
      try {
        this.socketTask.close({});
      } catch (_e) {}
      this.socketTask = null;
    }

    if (this._manuallyClosed) {
      this.setState(SocketState.DISCONNECTED);
      return;
    }

    // 断线重连：先进入 RECONNECTING，等 1.5s 防抖再真正重连
    this.setState(
      wasConnected ? SocketState.RECONNECTING : SocketState.DISCONNECTED,
    );

    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    this._clearDebounceTimer();
    this._reconnectDebounceTimer = setTimeout(() => {
      if (this._manuallyClosed) return;
      this._doReconnect();
    }, config.RECONNECT_DEBOUNCE || 1500);
  }

  _doReconnect() {
    if (this._manuallyClosed) return;
    this.setState(SocketState.RECONNECTING);
    logger.info(TAG, 'reconnect in', this._backoff, 'ms');
    this._reconnectTimer = setTimeout(() => {
      if (this._manuallyClosed) return;
      this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF);
      this.setState(SocketState.CONNECTING);
      this._doConnect();
    }, this._backoff);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _clearDebounceTimer() {
    if (this._reconnectDebounceTimer) {
      clearTimeout(this._reconnectDebounceTimer);
      this._reconnectDebounceTimer = null;
    }
  }
}

/**
 * 默认单例（业务层一般通过 stores/socket.js 使用，这里暴露底层类）
 */
let _instance = null;
export function getSocketInstance() {
  if (_instance) return _instance;
  _instance = new SocketIOClient({
    url: config.SOCKET_URL,
    path: config.SOCKET_PATH,
  });
  return _instance;
}
