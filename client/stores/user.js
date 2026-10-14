import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, userApi } from '../api';
import storage from '../utils/storage';
import { claimSession, releaseSession } from '../utils/sessionGuard';

export const useUserStore = defineStore('user', () => {
  const accessToken = ref('');
  const refreshToken = ref('');
  const userInfo = ref(null); // { id, username, nickname, avatar, ... }

  const isLoggedIn = computed(() => !!accessToken.value);

  function restore() {
    accessToken.value = storage.get('accessToken', '');
    refreshToken.value = storage.get('refreshToken', '');
    userInfo.value = storage.get('userInfo', null);
  }

  function persist() {
    storage.set('accessToken', accessToken.value);
    storage.set('refreshToken', refreshToken.value);
    storage.set('userInfo', userInfo.value);
  }

  async function login({ username, password }) {
    const res = await authApi.login({ username, password });
    accessToken.value = res.accessToken;
    refreshToken.value = res.refreshToken;
    // 后端返回扁平结构 { uid, username, nickname, avatar, ... }
    userInfo.value = {
      id: res.uid,
      username: res.username,
      nickname: res.nickname || res.username,
      avatar: res.avatar || '',
    };
    persist();
    claimSession(res.uid);
    return userInfo.value;
  }

  async function register(payload) {
    const res = await authApi.register(payload);
    // 注册成功后直接拿到 token，也存下来
    accessToken.value = res.accessToken;
    refreshToken.value = res.refreshToken;
    userInfo.value = {
      id: res.uid,
      username: res.username,
      nickname: payload.nickname || res.username,
      avatar: '',
    };
    persist();
    claimSession(res.uid);
    return res;
  }

  async function fetchMe() {
    const me = await userApi.getMe();
    userInfo.value = me;
    persist();
    return me;
  }

  async function updateMe(patch) {
    const me = await userApi.updateMe(patch);
    userInfo.value = { ...userInfo.value, ...me };
    persist();
    return userInfo.value;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch (_e) {
      /* 忽略网络失败 */
    }
    clear();
    uni.reLaunch({ url: '/pages/login/Login' });
  }

  function clear() {
    accessToken.value = '';
    refreshToken.value = '';
    userInfo.value = null;
    storage.remove('accessToken');
    storage.remove('refreshToken');
    storage.remove('userInfo');
    releaseSession();
  }

  return {
    accessToken,
    refreshToken,
    userInfo,
    isLoggedIn,
    restore,
    persist,
    login,
    register,
    fetchMe,
    updateMe,
    logout,
    clear,
  };
});
