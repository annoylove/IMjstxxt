<template>
  <view class="groups">
    <view class="action-bar">
      <button class="action-btn primary" @click="onCreate">+ 创建群</button>
      <button class="action-btn ghost" @click="onJoin">加入群</button>
    </view>

    <scroll-view class="group-list" scroll-y>
      <view v-if="groups.length" class="list-card">
        <view
          v-for="(g, idx) in groups"
          :key="g.id"
          class="group-item press-effect"
          :class="{ 'no-line': idx === groups.length - 1 }"
          @click="onOpen(g)"
        >
          <view class="group-avatar">
            <text>👥</text>
          </view>
          <view class="group-info">
            <text class="group-name">{{ g.name }}</text>
            <text class="group-meta">{{ g.memberCount || g.member_count || 0 }} 人</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>

      <view v-else class="empty">
        <view class="empty-icon">
          <text>👥</text>
        </view>
        <text class="empty-title">还没有加入任何群组</text>
        <text class="empty-sub">点击上方按钮创建或加入群聊</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { groupApi } from '../../api';

const groups = ref([]);

onMounted(load);

async function load() {
  try {
    groups.value = (await groupApi.list()) || [];
  } catch (e) {
    uni.showToast({ title: e?.msg || '加载失败', icon: 'none' });
  }
}

function onOpen(g) {
  uni.navigateTo({
    url: `/pages/groups/GroupChat?groupId=${g.id}&groupName=${encodeURIComponent(g.name)}`,
  });
}

function onCreate() {
  uni.navigateTo({ url: '/pages/groups/CreateGroup' });
}

function onJoin() {
  uni.showModal({
    title: '加入群聊',
    editable: true,
    placeholderText: '请输入群号',
    success: async (res) => {
      if (!res.confirm || !res.content) return;
      try {
        await groupApi.join({ groupNo: res.content });
        uni.showToast({ title: '加入成功', icon: 'success' });
        load();
      } catch (e) {
        uni.showToast({ title: e?.msg || '加入失败', icon: 'none' });
      }
    },
  });
}
</script>

<style scoped>
.groups {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}
.action-bar {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 32rpx;
  background: var(--card);
  border-bottom: 1rpx solid var(--line);
}
.action-btn {
  flex: 1;
  padding: 0;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  border-radius: 999rpx;
  border: none;
  margin: 0;
}
.action-btn::after {
  border: none;
}
.action-btn.primary {
  background: var(--primary-gradient);
  color: #fff;
  box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.25);
}
.action-btn.ghost {
  background: #f2f2f2;
  color: var(--text-1);
}
.action-btn:active {
  transform: scale(0.98);
}

.group-list {
  flex: 1;
  height: calc(100vh - 140rpx);
}
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.group-item {
  display: flex;
  align-items: center;
  padding: 24rpx 28rpx;
}
.group-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.group-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #36d6a9, #07c160);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
  margin-right: 24rpx;
  flex-shrink: 0;
}
.group-info {
  flex: 1;
  min-width: 0;
}
.group-name {
  display: block;
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 600;
}
.group-meta {
  display: block;
  font-size: 24rpx;
  color: var(--text-2);
  margin-top: 6rpx;
}
.arrow {
  font-size: 36rpx;
  color: #ccc;
}

/* —— 空态 —— */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 0;
}
.empty-icon {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: var(--card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
  box-shadow: var(--shadow);
  margin-bottom: 28rpx;
}
.empty-title {
  font-size: 30rpx;
  color: var(--text-2);
  font-weight: 500;
}
.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--text-3);
}
</style>
