// 开发期用电脑 IP（H5 调试），小程序需要把域名加到后台配置白名单
export default {
  // HTTP API 基础地址
  BASE_URL: 'http://127.0.0.1:3100/api/v1',
  // Socket.io 服务地址（不含路径，路径由 utils/socket.js 拼接）
  SOCKET_URL: 'http://127.0.0.1:3100',
  // Socket.io 路径
  SOCKET_PATH: '/im',
  // 心跳间隔（毫秒）
  HEARTBEAT_INTERVAL: 30000,
  // 重连指数退避上限（毫秒）
  MAX_RECONNECT_DELAY: 60000,
  // 断线后重连防抖延迟（毫秒）
  RECONNECT_DEBOUNCE: 1500,
};
