<template>
  <view class="create-group">
    <!-- 群名称 -->
    <view class="name-card">
      <text class="label">群名称</text>
      <input
        v-model="groupName"
        class="name-input"
        placeholder="请输入群名称（必填）"
        placeholder-class="ph"
        maxlength="64"
        confirm-type="done"
      />
    </view>

    <!-- 已选成员头像条 -->
    <view v-if="selectedIds.length" class="selected-bar">
      <view class="selected-avatars">
        <view v-for="f in selectedFriends" :key="f.id" class="sel-item" @click="toggle(f)">
          <Avatar :src="f.avatar" :nickname="displayName(f)" :size="72" />
          <view class="sel-remove">
            <text>×</text>
          </view>
        </view>
      </view>
      <text class="sel-count">已选 {{ selectedIds.length }} 人</text>
    </view>

    <!-- 好友列表 -->
    <scroll-view class="friend-scroll" scroll-y>
      <view class="section-title">
        <text>选择好友邀请入群</text>
        <text v-if="friends.length" class="toggle-all" @click="toggleAll">
          {{ allSelected ? '取消全选' : '全选' }}
        </text>
      </view>

      <view v-if="friends.length" class="list-card">
        <view
          v-for="(f, idx) in friends"
          :key="f.id"
          class="friend-item"
          :class="{ 'no-line': idx === friends.length - 1, picked: selectedIds.includes(String(f.id)) }"
          @click="toggle(f)"
        >
          <view class="check" :class="{ on: selectedIds.includes(String(f.id)) }">
            <text v-if="selectedIds.includes(String(f.id))">✓</text>
          </view>
          <Avatar :src="f.avatar" :nickname="displayName(f)" :size="84" />
          <view class="f-info">
            <text class="f-name">{{ displayName(f) }}</text>
            <text class="f-sub">@{{ f.username }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="!loading" class="empty">
        <text class="empty-icon">👥</text>
        <text class="empty-title">暂无好友</text>
        <text class="empty-sub">先在通讯录中添加好友，再创建群聊</text>
      </view>
    </scroll-view>

    <!-- 底部按钮 -->
    <view class="footer">
      <button class="create-btn" :class="{ disabled: !canSubmit || submitting }" :disabled="!canSubmit || submitting" @click="onCreate">
        创建群聊{{ selectedIds.length ? '（' + (selectedIds.length + 1) + '人）' : '' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import Avatar from '../../components/Avatar.vue';
import { friendApi, groupApi } from '../../api';

const friends = ref([]);
const selectedIds = ref([]);
const groupName = ref('');
const loading = ref(true);
const submitting = ref(false);

const canSubmit = computed(() => groupName.value.trim().length > 0);
const allSelected = computed(
  () => friends.value.length > 0 && selectedIds.value.length === friends.value.length
);
const selectedFriends = computed(() =>
  friends.value.filter((f) => selectedIds.value.includes(String(f.id)))
);

onMounted(load);

async function load() {
  try {
    friends.value = (await friendApi.list()) || [];
  } catch (e) {
    uni.showToast({ title: e?.msg || '好友加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function displayName(f) {
  return f.remark || f.nickname || f.username;
}

function toggle(f) {
  const id = String(f.id);
  const i = selectedIds.value.indexOf(id);
  if (i >= 0) selectedIds.value.splice(i, 1);
  else selectedIds.value.push(id);
}

function toggleAll() {
  if (allSelected.value) selectedIds.value = [];
  else selectedIds.value = friends.value.map((f) => String(f.id));
}

async function onCreate() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const name = groupName.value.trim();
    const res = await groupApi.create({ name, memberIds: selectedIds.value });
    uni.showToast({ title: '创建成功', icon: 'success' });
    setTimeout(() => {
      uni.redirectTo({
        url: `/pages/groups/GroupChat?groupId=${res.id}&groupName=${encodeURIComponent(name)}`,
      });
    }, 600);
  } catch (e) {
    uni.showToast({ title: e?.msg || '创建失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.create-group {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* —— 群名称 —— */
.name-card {
  background: var(--card);
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid var(--line);
}
.label {
  display: block;
  font-size: 24rpx;
  color: var(--text-3);
  margin-bottom: 14rpx;
}
.name-input {
  height: 76rpx;
  background: #f5f6f7;
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: var(--text-1);
}
.ph {
  color: #b8b8b8;
  font-size: 28rpx;
}

/* —— 已选条 —— */
.selected-bar {
  display: flex;
  align-items: center;
  background: var(--card);
  padding: 20rpx 32rpx;
  border-bottom: 1rpx solid var(--line);
}
.selected-avatars {
  flex: 1;
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
}
.sel-item {
  position: relative;
  margin-right: 16rpx;
  flex-shrink: 0;
}
.sel-remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 24rpx;
  line-height: 30rpx;
  text-align: center;
}
.sel-count {
  font-size: 24rpx;
  color: var(--text-2);
  margin-left: 20rpx;
  flex-shrink: 0;
}

/* —— 列表 —— */
.friend-scroll {
  flex: 1;
  height: 0;
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx 12rpx;
  font-size: 26rpx;
  color: var(--text-2);
}
.toggle-all {
  color: var(--primary);
  font-size: 26rpx;
}
.list-card {
  background: var(--card);
  border-radius: var(--radius);
  margin: 8rpx 20rpx 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.friend-item {
  display: flex;
  align-items: center;
  padding: 20rpx 28rpx;
}
.friend-item:not(.no-line) {
  border-bottom: 1rpx solid var(--line);
}
.friend-item.picked {
  background: rgba(7, 193, 96, 0.06);
}
.check {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 2rpx solid #c8c8c8;
  margin-right: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  color: #fff;
  flex-shrink: 0;
}
.check.on {
  background: var(--primary);
  border-color: var(--primary);
}
.f-info {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
}
.f-name {
  display: block;
  font-size: 30rpx;
  color: var(--text-1);
  font-weight: 500;
}
.f-sub {
  display: block;
  font-size: 22rpx;
  color: var(--text-3);
  margin-top: 4rpx;
}

/* —— 空态 —— */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 0;
}
.empty-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}
.empty-title {
  font-size: 30rpx;
  color: var(--text-2);
}
.empty-sub {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--text-3);
}

/* —— 底部 —— */
.footer {
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--card);
  border-top: 1rpx solid var(--line);
}
.create-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: var(--primary-gradient);
  color: #fff;
  font-size: 32rpx;
  border: none;
  box-shadow: 0 6rpx 16rpx rgba(7, 193, 96, 0.3);
}
.create-btn::after {
  border: none;
}
.create-btn:active {
  transform: scale(0.98);
}
.create-btn.disabled {
  background: #c7c7c7;
  box-shadow: none;
}
</style>
