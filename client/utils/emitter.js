/**
 * 极简 EventBus —— 直接包一层 uni.$emit / uni.$on / uni.$off
 * 注意：uni.$on 必须配对 uni.$off，页面 onUnload 时记得清理
 */
const emitter = {
  on(event, handler) {
    uni.$on(event, handler);
    return () => uni.$off(event, handler); // 返回取消函数
  },
  off(event, handler) {
    if (handler) uni.$off(event, handler);
    else uni.$off(event);
  },
  emit(event, payload) {
    uni.$emit(event, payload);
  },
  once(event, handler) {
    const wrapper = (payload) => {
      handler(payload);
      uni.$off(event, wrapper);
    };
    uni.$on(event, wrapper);
  },
};

export default emitter;
