import { createRouter, createWebHistory } from 'vue-router';
import { ref } from 'vue';
import { loadBootstrap } from './queries/bootstrap';

export const routerBootstrapped = ref(false);

const viewLoaders = {
  setup: () => import('./views/Setup.vue'),
  login: () => import('./views/Login.vue'),
  inbox: () => import('./views/Inbox.vue'),
  sent: () => import('./views/Sent.vue'),
  domains: () => import('./views/Domains.vue'),
  policies: () => import('./views/Policies.vue'),
  settings: () => import('./views/Settings.vue'),
  logs: () => import('./views/Logs.vue')
};

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/setup', name: 'setup', component: viewLoaders.setup, meta: { public: true, title: '初始化' } },
    { path: '/login', name: 'login', component: viewLoaders.login, meta: { public: true, title: '登录' } },
    { path: '/inbox', name: 'inbox', component: viewLoaders.inbox, meta: { title: '邮箱列表', keepAlive: true } },
    { path: '/sent', name: 'sent', component: viewLoaders.sent, meta: { title: '发送邮件', keepAlive: true } },
    { path: '/domains', name: 'domains', component: viewLoaders.domains, meta: { title: '域名管理', keepAlive: true } },
    { path: '/policies', name: 'policies', component: viewLoaders.policies, meta: { title: '邮件策略', keepAlive: true } },
    { path: '/settings', name: 'settings', component: viewLoaders.settings, meta: { title: '系统设置', keepAlive: true } },
    { path: '/logs', name: 'logs', component: viewLoaders.logs, meta: { title: '系统日志', keepAlive: true } },
    { path: '/:pathMatch(.*)*', redirect: '/inbox' }
  ]
});

router.beforeEach(async (to) => {
  const state = (await loadBootstrap()).auth;

  if (!state.initialized && to.path !== '/setup') {
    return '/setup';
  }
  if (state.initialized && to.path === '/setup') {
    return state.authenticated ? '/inbox' : '/login';
  }
  if (!to.meta.public && !state.authenticated) {
    return '/login';
  }
  if (to.path === '/login' && state.authenticated) {
    return '/inbox';
  }
  return true;
});

router.afterEach(() => {
  routerBootstrapped.value = true;
});

export function preloadAppViews() {
  void Promise.allSettled([
    viewLoaders.inbox(),
    viewLoaders.sent(),
    viewLoaders.domains(),
    viewLoaders.policies(),
    viewLoaders.settings(),
    viewLoaders.logs()
  ]);
}

export default router;
