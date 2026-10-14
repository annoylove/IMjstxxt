<template>
  <view class="msg-input">
    <!-- 工具栏 -->
    <view class="toolbar">
      <view class="tool-btn" @click="toggleVoice">
        <text>{{ isVoiceMode ? '⌨️' : '🎤' }}</text>
      </view>
      <view class="tool-btn" @click="chooseImage">
        <text>🖼</text>
      </view>
      <view class="tool-btn" @click="toggleEmoji">
        <text>😊</text>
      </view>
    </view>

    <!-- 输入区 -->
    <view class="input-area">
      <!-- 文本输入 -->
      <textarea
        v-if="!isVoiceMode"
        v-model="text"
        class="text-input"
        placeholder="输入消息..."
        :auto-height="true"
        :maxlength="-1"
        confirm-type="send"
        @confirm="onSend"
        @input="adjustHeight"
      />
      <!-- 语音按钮 -->
      <view v-else class="voice-btn" @touchstart="onVoiceStart" @touchend="onVoiceEnd">
        <text>{{ recording ? '松开 发送' : '按下 说话' }}</text>
      </view>
    </view>

    <!-- 发送按钮 -->
    <view class="send-btn" :class="{ disabled: !canSend }" @click="onSend">
      <text>发送</text>
    </view>

    <!-- 表情面板 -->
    <view v-if="showEmoji" class="emoji-panel">
      <scroll-view scroll-y class="emoji-scroll">
        <view class="emoji-grid">
          <text
            v-for="e in EMOJIS"
            :key="e"
            class="emoji-item"
            @click="appendEmoji(e)"
          >{{ e }}</text>
        </view>
      </scroll-view>
      <view class="emoji-actions">
        <view class="emoji-del press" @click="deleteChar">⌫</view>
        <view class="emoji-send press" :class="{ disabled: !canSend }" @click="onSend">发送</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';

const emit = defineEmits(['send-text', 'send-image', 'send-voice']);

const text = ref('');
const isVoiceMode = ref(false);
const recording = ref(false);
const showEmoji = ref(false);
const recordedTempFilePath = ref('');
const recordedDuration = ref(0);

const canSend = computed(() => text.value.trim().length > 0);

// 常用表情（按类别分组排列）
const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '🙂',
  '😉', '😜', '🤪', '😎', '🥳', '😭', '😤', '😡',
  '🤔', '🙄', '😏', '😴', '🤤', '😳', '🥺', '😱',
  '😰', '🤯', '😇', '🤗', '🤭', '🙈', '💪', '👍',
  '👎', '👏', '🙏', '☝️', '✌️', '🤝', '❤️', '💔',
  '💯', '🎉', '🌹', '🔥', '⭐', '🌙', '☀️', '🌈',
  '🍉', '🍺', '☕', '🎂', '⚽', '🏀', '🚗', '✈️',
];

function appendEmoji(e) {
  text.value += e;
}

function deleteChar() {
  // 表情是代理对，按码点删除而不是按字符
  const chars = Array.from(text.value);
  chars.pop();
  text.value = chars.join('');
}

function toggleVoice() {
  isVoiceMode.value = !isVoiceMode.value;
  showEmoji.value = false;
}

function toggleEmoji() {
  showEmoji.value = !showEmoji.value;
  isVoiceMode.value = false;
}

function adjustHeight() {
  // textarea auto-height 已开启，留作扩展
}

function onSend() {
  if (!canSend.value) return;
  const content = text.value.trim();
  emit('send-text', content);
  text.value = '';
}

function chooseImage() {
  uni.chooseImage({
    count: 1,
    success: (res) => {
      const path = res.tempFilePaths?.[0];
      if (path) emit('send-image', path);
    },
    fail: (err) => console.warn('chooseImage fail', err),
  });
}

function onVoiceStart() {
  recording.value = true;
  // #ifdef MP-WEIXIN || APP-PLUS || H5
  const recorder = uni.getRecorderManager();
  recorder.start({ duration: 60000, format: 'mp3' });
  recorder.onStop((res) => {
    recordedTempFilePath.value = res.tempFilePath;
    recordedDuration.value = Math.floor(res.duration / 1000);
  });
  // #endif
}

function onVoiceEnd() {
  recording.value = false;
  // #ifdef MP-WEIXIN || APP-PLUS || H5
  const recorder = uni.getRecorderManager();
  recorder.stop();
  // 稍微等一下 stop 回调
  setTimeout(() => {
    if (recordedTempFilePath.value) {
      emit('send-voice', recordedTempFilePath.value, recordedDuration.value);
      recordedTempFilePath.value = '';
    }
  }, 100);
  // #endif
}
</script>

<style scoped>
.msg-input {
  position: relative;
  display: flex;
  align-items: flex-end;
  padding: 16rpx 20rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #f7f7f7;
  border-top: 1rpx solid #e8e8e8;
}
.toolbar {
  display: flex;
  gap: 8rpx;
  padding: 0 8rpx;
}
.tool-btn {
  width: 68rpx;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  border-radius: 50%;
  transition: background 0.15s;
}
.tool-btn:active {
  background: #e5e5e5;
}
.input-area {
  flex: 1;
  margin: 0 12rpx;
}
.text-input {
  width: 100%;
  min-height: 68rpx;
  max-height: 240rpx;
  padding: 16rpx 24rpx;
  background: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
  line-height: 1.4;
  box-sizing: border-box;
}
.voice-btn {
  width: 100%;
  height: 68rpx;
  background: #fff;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: var(--text-1);
  font-weight: 500;
}
.send-btn {
  padding: 0 32rpx;
  height: 68rpx;
  line-height: 68rpx;
  background: var(--primary-gradient);
  color: #fff;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 500;
  flex-shrink: 0;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
  transition: opacity 0.15s, transform 0.1s;
}
.send-btn:active {
  transform: scale(0.96);
}
.send-btn.disabled {
  background: #d9d9d9;
  box-shadow: none;
}
.emoji-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 420rpx;
  background: #fff;
  border-top: 1rpx solid #e8e8e8;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.emoji-scroll {
  flex: 1;
  min-height: 0;
  padding: 12rpx 16rpx 0;
}
.emoji-grid {
  display: flex;
  flex-wrap: wrap;
}
.emoji-item {
  width: 12.5%;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  border-radius: 16rpx;
}
.emoji-item:active {
  background: #eee;
}
.emoji-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 24rpx calc(12rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f0f0f0;
}
.emoji-del {
  padding: 8rpx 28rpx;
  background: #f2f2f2;
  border-radius: 999rpx;
  font-size: 30rpx;
}
.emoji-send {
  padding: 8rpx 36rpx;
  background: var(--primary-gradient);
  color: #fff;
  border-radius: 999rpx;
  font-size: 26rpx;
}
.emoji-send.disabled {
  background: #d9d9d9;
}
</style>
