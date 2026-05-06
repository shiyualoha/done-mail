<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage, changeAdminKey, logoutSession } from './api/client';
import McConfirmDialog from './components/McConfirmDialog.vue';
import McIcon from './components/McIcon.vue';
import { footerMetrics } from './composables/footerStatus';
import { pageRefreshing, runPageRefresh } from './composables/pageRefresh';
import { preloadAppViews, routerBootstrapped } from './router';

const route = useRoute();
const router = useRouter();

const isAuthPage = computed(() => route.path === '/login' || route.path === '/setup');
const title = computed(() => String(route.meta.title || 'DoneMail'));
const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const securityDialogOpen = ref(false);
const savingAdminKey = ref(false);
const adminKeyForm = ref({
  currentKey: '',
  newKey: '',
  confirmKey: ''
});
let appViewsPreloaded = false;

const closeAppMenusKey = Symbol.for('done-mail.close-app-menus');

const navGroups = [
  [
    { path: '/inbox', label: '邮箱列表', icon: 'mail' },
    { path: '/sent', label: '发送邮件', icon: 'file' }
  ],
  [
    { path: '/domains', label: '域名管理', icon: 'globe' },
    { path: '/policies', label: '邮件策略', icon: 'policy' },
    { path: '/logs', label: '系统日志', icon: 'file' },
    { path: '/settings', label: '系统设置', icon: 'settings' }
  ]
];

async function logout() {
  closeAppMenus();
  await logoutSession();
  router.push('/login');
}

function refreshPage() {
  void runPageRefresh();
}

function openGithub() {
  closeAppMenus();
  window.open('https://github.com/lchily/done-mail', '_blank', 'noopener,noreferrer');
}

function openDocs() {
  closeAppMenus();
  window.open('https://sow.us.kg', '_blank', 'noopener,noreferrer');
}

function openSecurityDialog() {
  closeAppMenus();
  adminKeyForm.value = {
    currentKey: '',
    newKey: '',
    confirmKey: ''
  };
  securityDialogOpen.value = true;
}

async function saveAdminKey() {
  const currentKey = adminKeyForm.value.currentKey.trim();
  const newKey = adminKeyForm.value.newKey.trim();
  const confirmKey = adminKeyForm.value.confirmKey.trim();

  if (!currentKey) {
    ElMessage.error('请填写当前管理员 Key');
    return;
  }
  if (!newKey) {
    ElMessage.error('请填写新管理员 Key');
    return;
  }
  if (newKey !== confirmKey) {
    ElMessage.error('两次输入的新管理员 Key 不一致');
    return;
  }

  savingAdminKey.value = true;
  try {
    await changeAdminKey(currentKey, newKey);
    securityDialogOpen.value = false;
    adminKeyForm.value = {
      currentKey: '',
      newKey: '',
      confirmKey: ''
    };
    ElMessage.success('管理员 Key 已更新');
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '修改管理员 Key 失败'));
  } finally {
    savingAdminKey.value = false;
  }
}

function closeAppMenus() {
  menuOpen.value = false;
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return;
  if (event.target instanceof Node && menuRef.value?.contains(event.target)) return;
  closeAppMenus();
}

function scheduleAppViewPreload() {
  if (appViewsPreloaded || !routerBootstrapped.value || isAuthPage.value) return;
  appViewsPreloaded = true;

  const idleCallback = window.requestIdleCallback || ((callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 300));
  idleCallback(() => preloadAppViews(), { timeout: 1200 });
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  scheduleAppViewPreload();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
});

watch([routerBootstrapped, isAuthPage], scheduleAppViewPreload);

provide(closeAppMenusKey, closeAppMenus);
</script>

<template>
  <main v-if="!routerBootstrapped" class="login-shell login-boot-shell" aria-label="正在加载"></main>
  <router-view v-else-if="isAuthPage" />
  <div v-else class="mc-page">
    <div class="mc-frame">
      <aside class="mc-sidebar">
        <div class="mc-brand">
          <img src="/static/logo-mark.svg" alt="DoneMail" />
          <span>DoneMail</span>
        </div>

        <nav class="mc-nav">
          <div v-for="(group, groupIndex) in navGroups" :key="groupIndex" class="mc-nav-group">
            <router-link
              v-for="item in group"
              :key="item.path"
              :to="item.path"
              class="mc-nav-item"
              :class="{ active: route.path === item.path }"
            >
              <McIcon :name="item.icon" :size="20" />
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </nav>

        <div class="mc-sidebar-footer">
          <div class="mc-cf">
            <McIcon name="cloud" :size="24" />
            <p>基于 Cloudflare</p>
          </div>
        </div>
      </aside>

      <main class="mc-main">
        <header class="mc-header">
          <div class="mc-top-title">{{ title }}</div>
          <div class="mc-user-actions">
            <button
              type="button"
              :class="{ 'is-refreshing': pageRefreshing }"
              :disabled="pageRefreshing"
              :aria-label="pageRefreshing ? '正在刷新' : '刷新当前页面'"
              :title="pageRefreshing ? '正在刷新' : '刷新当前页面'"
              @click="refreshPage"
            >
              <McIcon name="refresh" :size="19" />
            </button>
            <div ref="menuRef" class="mc-menu-wrap">
              <button class="mc-menu-trigger" type="button" aria-label="打开菜单" @click="menuOpen = !menuOpen">
                <McIcon name="down" :size="17" :stroke-width="2" />
              </button>
              <div v-if="menuOpen" class="mc-menu-surface mc-user-menu">
                <button type="button" class="mc-menu-item" @click="openGithub"><McIcon name="github" :size="16" />GitHub</button>
                <button type="button" class="mc-menu-item" @click="openDocs"><McIcon name="docs" :size="16" />使用文档</button>
                <button type="button" class="mc-menu-item" @click="openSecurityDialog"><McIcon name="settings" :size="16" />修改密钥</button>
                <button type="button" class="mc-menu-item" @click="logout"><McIcon name="logout" :size="16" />退出登录</button>
              </div>
            </div>
          </div>
        </header>

        <div class="mc-route-shell">
          <router-view v-slot="{ Component, route: viewRoute }">
            <keep-alive>
              <component :is="Component" v-if="viewRoute.meta.keepAlive" :key="viewRoute.name" />
            </keep-alive>
            <component :is="Component" v-if="!viewRoute.meta.keepAlive" :key="viewRoute.fullPath" />
          </router-view>
        </div>

        <footer class="mc-footer">
          <div v-if="footerMetrics.length > 0" class="mc-footer-metrics">
            <span v-for="item in footerMetrics" :key="`${item.label}-${item.unit}`" class="mc-footer-metric">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
              <span v-if="item.unit">{{ item.unit }}</span>
            </span>
          </div>
        </footer>
      </main>
    </div>

    <el-dialog
      v-model="securityDialogOpen"
      title="修改密钥"
      width="500px"
      class="mc-config-dialog mc-key-dialog"
      destroy-on-close
      align-center
      :show-close="false"
      :close-on-click-modal="false"
    >
      <div class="mc-key-dialog-form">
        <el-form-item label="当前密钥">
          <el-input v-model="adminKeyForm.currentKey" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新设密钥">
          <el-input v-model="adminKeyForm.newKey" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认密钥">
          <el-input v-model="adminKeyForm.confirmKey" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </div>
      <template #footer>
        <div class="mc-dialog-actions">
          <button type="button" class="mc-action-secondary" :disabled="savingAdminKey" @click="securityDialogOpen = false">取消</button>
          <button type="button" class="mc-action-primary" :disabled="savingAdminKey" @click="saveAdminKey">
            <span v-if="savingAdminKey" class="mc-button-spinner"></span>
            {{ savingAdminKey ? '保存中' : '保存' }}
          </button>
        </div>
      </template>
    </el-dialog>
    <McConfirmDialog />
  </div>
</template>
