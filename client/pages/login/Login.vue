<template>
  <view class="login-page">
    <!-- 顶部品牌区 -->
    <view class="brand">
      <view class="logo">
        <text class="logo-text">IM</text>
      </view>
      <text class="brand-title">即时通讯</text>
      <text class="brand-sub">快速 · 安全 · 随时随地连接</text>
    </view>

    <!-- 表单卡片 -->
    <view class="form-card">
      <view class="tabs">
        <view class="tab-item" :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</view>
        <view class="tab-item" :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</view>
        <view class="tab-slider" :class="{ right: mode === 'register' }" />
      </view>

      <view class="form">
        <view class="form-item">
          <text class="item-icon">👤</text>
          <input v-model="form.username" class="input" placeholder="用户名" placeholder-class="ph" confirm-type="next" />
        </view>
        <view class="form-item">
          <text class="item-icon">🔒</text>
          <input v-model="form.password" class="input" placeholder="密码" placeholder-class="ph" :password="!showPwd" confirm-type="done" @confirm="onSubmit" />
          <text class="toggle-pwd" @click="showPwd = !showPwd">{{ showPwd ? '🙈' : '👁' }}</text>
        </view>
        <view v-if="mode === 'register'" class="form-item">
          <text class="item-icon">✨</text>
          <input v-model="form.nickname" class="input" placeholder="昵称（注册时必填）" placeholder-class="ph" />
        </view>

        <button class="submit-btn" :disabled="loading" :class="{ loading }" @click="onSubmit">
          {{ loading ? '处理中...' : (mode === 'login' ? '登 录' : '注册并登录') }}
        </button>
      </view>
    </view>

    <view class="footer-tip">
      <text>登录即代表同意《服务协议》与《隐私政策》</text>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useUserStore } from '../../stores/user';
import { useSocketStore } from '../../stores/socket';

const userStore = useUserStore();
const socketStore = useSocketStore();

const mode = ref('login');
const showPwd = ref(false);
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
  nickname: '',
});

function switchMode(m) {
  mode.value = m;
}

async function onSubmit() {
  if (loading.value) return;
  form.username = (form.username || '').trim();
  if (!form.username || !form.password) {
    uni.showToast({ title: '请填写用户名和密码', icon: 'none' });
    return;
  }
  loading.value = true;
  try {
    if (mode.value === 'register') {
      if (!form.nickname) {
        uni.showToast({ title: '请填写昵称', icon: 'none' });
        loading.value = false;
        return;
      }
      await userStore.register({
        username: form.username,
        password: form.password,
        nickname: form.nickname,
      });
      uni.showToast({ title: '注册成功，正在登录…', icon: 'none' });
    }
    await userStore.login({ username: form.username, password: form.password });
    socketStore.connect();
    uni.switchTab({ url: '/pages/home/Home' });
  } catch (e) {
    uni.showToast({ title: e?.msg || '操作失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #e8f8ef 0%, #f5f7f6 40%, #f5f5f5 100%);
  padding: 100rpx 48rpx 60rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* —— 品牌区 —— */
.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 72rpx;
}
.logo {
  width: 160rpx;
  height: 160rpx;
  border-radius: 40rpx;
  background: var(--primary-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 32rpx rgba(7, 193, 96, 0.35);
  margin-bottom: 28rpx;
}
.logo-text {
  font-size: 76rpx;
  font-weight: 800;
  color: #fff;
  letter-spacing: 6rpx;
}
.brand-title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: 4rpx;
}
.brand-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--text-2);
  letter-spacing: 2rpx;
}

/* —— 表单卡片 —— */
.form-card {
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 40rpx 36rpx 48rpx;
  box-shadow: var(--shadow);
}
.tabs {
  position: relative;
  display: flex;
  margin-bottom: 44rpx;
  background: #f5f5f5;
  border-radius: 999rpx;
  padding: 6rpx;
}
.tab-item {
  position: relative;
  z-index: 1;
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 28rpx;
  color: var(--text-2);
  border-radius: 999rpx;
  transition: color 0.25s;
}
.tab-item.active {
  color: #fff;
  font-weight: 600;
}
.tab-slider {
  position: absolute;
  top: 6rpx;
  left: 6rpx;
  width: calc(50% - 6rpx);
  height: calc(100% - 12rpx);
  background: var(--primary-gradient);
  border-radius: 999rpx;
  transition: transform 0.25s ease;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.3);
}
.tab-slider.right {
  transform: translateX(100%);
}

.form-item {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 28rpx;
  background: #f7f7f7;
  border-radius: var(--radius);
  border: 2rpx solid transparent;
  transition: border-color 0.2s;
}
.form-item:focus-within {
  border-color: var(--primary);
  background: #fff;
}
.item-icon {
  width: 76rpx;
  text-align: center;
  font-size: 30rpx;
  flex-shrink: 0;
}
.input {
  flex: 1;
  height: 88rpx;
  padding: 0 20rpx 0 0;
  background: transparent;
  font-size: 28rpx;
  color: var(--text-1);
  box-sizing: border-box;
}
.ph {
  color: var(--text-3);
}
.toggle-pwd {
  position: absolute;
  right: 24rpx;
  top: 50%;
  transform: translateY(-50%);
  font-size: 28rpx;
  color: var(--text-2);
  padding: 8rpx;
}

.submit-btn {
  margin-top: 20rpx;
  height: 92rpx;
  line-height: 92rpx;
  background: var(--primary-gradient);
  color: #fff;
  border-radius: 999rpx;
  font-size: 32rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
  border: none;
  box-shadow: 0 8rpx 20rpx rgba(7, 193, 96, 0.3);
  transition: transform 0.1s, opacity 0.2s;
}
.submit-btn:active {
  transform: scale(0.98);
}
.submit-btn.loading {
  opacity: 0.7;
}
.submit-btn[disabled] {
  background: #d9d9d9;
  color: #fff;
  box-shadow: none;
}

.footer-tip {
  text-align: center;
  margin-top: auto;
  padding-top: 60rpx;
  font-size: 22rpx;
  color: var(--text-3);
}
</style>
