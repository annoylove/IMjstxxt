<template>
  <view class="chpwd">
    <view class="form-card">
      <!-- 原密码 -->
      <view class="field">
        <text class="f-label">原密码</text>
        <view class="f-input-row">
          <input
            v-model="oldPwd"
            class="f-input"
            :password="!showOld"
            placeholder="请输入原密码"
            placeholder-class="ph"
          />
          <text class="eye" @click="showOld = !showOld">{{ showOld ? '🙈' : '👁' }}</text>
        </view>
      </view>

      <!-- 新密码 -->
      <view class="field">
        <text class="f-label">新密码</text>
        <view class="f-input-row">
          <input
            v-model="newPwd"
            class="f-input"
            :password="!showNew"
            placeholder="8-64位，需包含字母和数字"
            placeholder-class="ph"
            maxlength="64"
          />
          <text class="eye" @click="showNew = !showNew">{{ showNew ? '🙈' : '👁' }}</text>
        </view>
        <!-- 强度条 -->
        <view v-if="newPwd" class="strength">
          <view class="bars">
            <view
              v-for="i in 3"
              :key="i"
              class="bar"
              :class="[strengthLevel >= i ? 'on' : '', strengthColor]"
            />
          </view>
          <text class="s-text" :class="strengthColor">{{ strengthText }}</text>
        </view>
        <text v-if="newPwd && !newPwdValid" class="f-err">至少 8 位，且同时包含字母和数字</text>
      </view>

      <!-- 确认新密码 -->
      <view class="field no-line">
        <text class="f-label">确认新密码</text>
        <view class="f-input-row">
          <input
            v-model="confirmPwd"
            class="f-input"
            :password="!showConfirm"
            placeholder="请再次输入新密码"
            placeholder-class="ph"
            maxlength="64"
          />
          <text class="eye" @click="showConfirm = !showConfirm">{{ showConfirm ? '🙈' : '👁' }}</text>
        </view>
        <text v-if="confirmPwd && confirmPwd !== newPwd" class="f-err">两次输入的密码不一致</text>
      </view>
    </view>

    <view class="tips">
      <text>· 密码长度 8-64 位，需同时包含字母和数字</text>
      <text>· 新密码不能与原密码相同</text>
      <text>· 修改成功后当前登录状态保持有效</text>
    </view>

    <button class="submit-btn" :class="{ disabled: !canSubmit || submitting }" :disabled="!canSubmit || submitting" @click="onSubmit">
      {{ submitting ? '提交中…' : '确认修改' }}
    </button>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { userApi } from '../../api';

const oldPwd = ref('');
const newPwd = ref('');
const confirmPwd = ref('');
const showOld = ref(false);
const showNew = ref(false);
const showConfirm = ref(false);
const submitting = ref(false);

const NEW_PWD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
const newPwdValid = computed(() => NEW_PWD_RE.test(newPwd.value));

const strengthLevel = computed(() => {
  const p = newPwd.value;
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s += 1;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s += 1;
  if ((/[^A-Za-z\d]/.test(p) || p.length >= 12) && s >= 2) s += 1;
  return s;
});
const strengthText = computed(() => ['', '弱', '中', '强'][strengthLevel.value] || '');
const strengthColor = computed(() => ['', 'lv1', 'lv2', 'lv3'][strengthLevel.value] || '');

const canSubmit = computed(
  () =>
    oldPwd.value &&
    newPwdValid.value &&
    confirmPwd.value === newPwd.value &&
    newPwd.value !== oldPwd.value,
);

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    await userApi.changePassword({
      oldPassword: oldPwd.value,
      newPassword: newPwd.value,
    });
    uni.showToast({ title: '密码修改成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 800);
  } catch (e) {
    uni.showToast({ title: e?.msg || '修改失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.chpwd {
  min-height: 100vh;
  background: var(--bg);
  padding: 24rpx 20rpx 60rpx;
}
.form-card {
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 8rpx 32rpx;
  box-shadow: var(--shadow);
}
.field {
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line);
}
.field.no-line {
  border-bottom: none;
}
.f-label {
  display: block;
  font-size: 26rpx;
  color: var(--text-2);
  margin-bottom: 16rpx;
}
.f-input-row {
  display: flex;
  align-items: center;
  background: #f5f6f7;
  border-radius: var(--radius);
  padding: 0 24rpx;
}
.f-input {
  flex: 1;
  height: 84rpx;
  font-size: 30rpx;
  color: var(--text-1);
  background: transparent;
}
.ph {
  color: #b8b8b8;
  font-size: 26rpx;
}
.eye {
  font-size: 32rpx;
  padding: 10rpx;
  opacity: 0.7;
}

/* —— 强度 —— */
.strength {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  gap: 16rpx;
}
.bars {
  flex: 1;
  display: flex;
  gap: 12rpx;
}
.bar {
  flex: 1;
  height: 8rpx;
  border-radius: 999rpx;
  background: #e8e8e8;
}
.bar.on.lv1 {
  background: var(--danger);
}
.bar.on.lv2 {
  background: var(--warning);
}
.bar.on.lv3 {
  background: var(--primary);
}
.s-text {
  font-size: 22rpx;
  width: 60rpx;
  text-align: right;
}
.s-text.lv1 {
  color: var(--danger);
}
.s-text.lv2 {
  color: var(--warning);
}
.s-text.lv3 {
  color: var(--primary);
}
.f-err {
  display: block;
  font-size: 22rpx;
  color: var(--danger);
  margin-top: 12rpx;
}

/* —— 提示 —— */
.tips {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 28rpx 12rpx;
  font-size: 22rpx;
  color: var(--text-3);
}

/* —— 提交 —— */
.submit-btn {
  margin-top: 24rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 999rpx;
  background: var(--primary-gradient);
  color: #fff;
  font-size: 32rpx;
  font-weight: 600;
  border: none;
  box-shadow: 0 6rpx 16rpx rgba(7, 193, 96, 0.3);
}
.submit-btn::after {
  border: none;
}
.submit-btn:active {
  transform: scale(0.98);
}
.submit-btn.disabled {
  background: #c7c7c7;
  box-shadow: none;
}
</style>
