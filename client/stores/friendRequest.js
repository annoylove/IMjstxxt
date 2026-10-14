import { defineStore } from 'pinia';
import { ref } from 'vue';
import { friendApi } from '../api';
import logger from '../utils/logger';

export const useFriendRequestStore = defineStore('friendRequest', () => {
  const pendingCount = ref(0);

  async function load() {
    try {
      const list = (await friendApi.requests('pending')) || [];
      pendingCount.value = list.length;
    } catch (e) {
      logger.warn('load friend requests fail', e);
    }
  }

  function increment() {
    pendingCount.value += 1;
  }

  function reset() {
    pendingCount.value = 0;
  }

  return { pendingCount, load, increment, reset };
});
