<template>
  <view class="avatar-wrap" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <image
      v-if="src"
      :src="src"
      class="avatar"
      mode="aspectFill"
      :style="{ width: size + 'rpx', height: size + 'rpx' }"
    />
    <view v-else class="avatar avatar-default" :style="{ width: size + 'rpx', height: size + 'rpx', background: defaultBg }">
      <text class="default-text" :style="{ fontSize: Math.round(size * 0.42) + 'rpx' }">{{ defaultText }}</text>
    </view>
    <view v-if="showOnline" class="online-dot" :class="onlineClass" />
  </view>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  src: { type: String, default: '' },
  nickname: { type: String, default: '' },
  size: { type: Number, default: 80 },
  showOnline: { type: Boolean, default: false },
  online: { type: Boolean, default: false },
});

const defaultText = computed(() => {
  return (props.nickname || 'U').slice(0, 1).toUpperCase();
});

// 按昵称散列出稳定的渐变色
const GRADIENTS = [
  'linear-gradient(135deg, #57b9ff, #2b7de9)',
  'linear-gradient(135deg, #6f6fff, #4d4df0)',
  'linear-gradient(135deg, #ff9a6f, #ff6b35)',
  'linear-gradient(135deg, #36d6a9, #07c160)',
  'linear-gradient(135deg, #f78fb3, #e84393)',
  'linear-gradient(135deg, #ffd166, #f0a500)',
];
const defaultBg = computed(() => {
  const name = props.nickname || 'U';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
});

const onlineClass = computed(() => (props.online ? 'online' : 'offline'));
</script>

<style scoped>
.avatar-wrap {
  position: relative;
  display: inline-block;
  border-radius: 50%;
  overflow: hidden;
  background-color: #ddd;
}
.avatar {
  border-radius: 50%;
  display: block;
}
.avatar-default {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.default-text {
  font-weight: 600;
  line-height: 1;
}
.online-dot {
  position: absolute;
  right: -2rpx;
  bottom: -2rpx;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
  border: 3rpx solid #fff;
  background: #ccc;
}
.online-dot.online {
  background: var(--primary);
}
.online-dot.offline {
  background: #ccc;
}
</style>
