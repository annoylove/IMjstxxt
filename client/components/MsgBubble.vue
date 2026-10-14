<template>
  <view class="msg-bubble" :class="{ self: isSelf, system: contentType === 'system' }">
    <!-- 系统消息：居中灰色 -->
    <view v-if="contentType === 'system'" class="system-content">
      <text>{{ content }}</text>
    </view>

    <!-- 撤回消息 -->
    <view v-else-if="contentType === 'recall'" class="recall-content">
      <text>{{ isSelf ? '你撤回了一条消息' : '对方撤回了一条消息' }}</text>
    </view>

    <!-- 普通消息 -->
    <block v-else>
      <!-- 头像（非 self 显示） -->
      <Avatar v-if="!isSelf" :src="avatar" :nickname="nickname" :size="64" />

      <view class="bubble-body" :class="contentType">
        <!-- 文本 -->
        <text v-if="contentType === 'text'" class="bubble-text">{{ content }}</text>

        <!-- 图片 -->
        <image
          v-else-if="contentType === 'image'"
          :src="content"
          class="bubble-image"
          mode="widthFix"
          @click="onPreviewImage"
        />

        <!-- 语音 -->
        <view v-else-if="contentType === 'voice'" class="bubble-voice" @click="onPlayVoice">
          <text class="voice-icon">🔊</text>
          <text class="voice-duration">{{ voiceDuration }}″</text>
        </view>

        <!-- 其他类型 -->
        <text v-else class="bubble-text unsupported">[暂不支持的消息类型]</text>
      </view>

      <!-- 头像（self 显示在右侧） -->
      <Avatar v-if="isSelf" :src="avatar" :nickname="nickname" :size="64" />

      <!-- 消息状态（仅 self 消息显示） -->
      <view v-if="isSelf && showStatus" class="msg-status">
        <text v-if="status === 'sending'" class="status-text">发送中…</text>
        <text v-else-if="status === 'failed'" class="status-text fail" @click="onRetry">失败 点重试</text>
        <text v-else-if="status === 'sent'" class="status-icon">✓</text>
        <text v-else-if="status === 'read'" class="status-icon read">✓✓</text>
      </view>
    </block>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import Avatar from './Avatar.vue';

const props = defineProps({
  msg: { type: Object, required: true },
  currentUserId: { type: [String, Number], default: '' },
  showStatus: { type: Boolean, default: true },
});

const emit = defineEmits(['preview-image', 'play-voice', 'retry']);

const isSelf = computed(() => {
  if (props.msg.fromSelf !== undefined) return props.msg.fromSelf;
  return props.msg.fromId && String(props.msg.fromId) === String(props.currentUserId);
});

const contentType = computed(() => props.msg.contentType || 'text');
const content = computed(() => props.msg.content || '');
const avatar = computed(() => props.msg.avatar || '');
const nickname = computed(() => props.msg.nickname || '');
const status = computed(() => props.msg.status || '');
const voiceDuration = computed(() => props.msg.voiceDuration || props.msg.duration || 0);

function onPreviewImage() {
  emit('preview-image', content.value);
}
function onPlayVoice() {
  emit('play-voice', content.value, voiceDuration.value);
}
function onRetry() {
  emit('retry', props.msg);
}
</script>

<style scoped>
.msg-bubble {
  display: flex;
  align-items: flex-start;
  margin: 20rpx 24rpx;
}
.msg-bubble.self {
  flex-direction: row-reverse;
}
.msg-bubble.system {
  justify-content: center;
  margin: 24rpx 0;
}

.system-content text {
  color: #fff;
  font-size: 22rpx;
  background: rgba(0, 0, 0, 0.2);
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
}
.recall-content text {
  color: var(--text-2);
  font-size: 24rpx;
  font-style: italic;
}

.bubble-body {
  max-width: 520rpx;
  margin: 0 16rpx;
  padding: 20rpx 26rpx;
  border-radius: 8rpx 18rpx 18rpx 18rpx;
  word-break: break-all;
  background: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}
.msg-bubble.self .bubble-body {
  background: var(--bubble-self);
  border-radius: 18rpx 8rpx 18rpx 18rpx;
}
.bubble-body.image,
.bubble-body.voice {
  padding: 8rpx;
}

.bubble-text {
  font-size: 30rpx;
  line-height: 1.5;
  color: var(--text-1);
}
.msg-bubble.self .bubble-text {
  color: #000;
}

.bubble-image {
  max-width: 360rpx;
  border-radius: 12rpx;
  display: block;
}

.bubble-voice {
  display: flex;
  align-items: center;
  padding: 14rpx 26rpx;
  min-width: 160rpx;
}
.voice-icon {
  font-size: 36rpx;
  margin-right: 12rpx;
}
.voice-duration {
  font-size: 26rpx;
  color: var(--text-1);
}

.msg-status {
  display: flex;
  align-items: center;
  margin-top: 4rpx;
}
.status-text {
  font-size: 22rpx;
  color: var(--text-2);
}
.status-text.fail {
  color: var(--danger);
}
.status-icon {
  color: #c0c0c0;
  font-size: 28rpx;
}
.status-icon.read {
  color: #576b95;
}
</style>
