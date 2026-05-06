<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { type LogRow } from '../api/endpoints';
import McCfSelect from '../components/McCfSelect.vue';
import McIcon from '../components/McIcon.vue';
import { confirmDialog } from '../composables/confirmDialog';
import { useCursorList } from '../composables/cursorList';
import { useFooterMetrics } from '../composables/footerStatus';
import { usePageRefresh } from '../composables/pageRefresh';
import { loadLogsPage, logListParams, useClearLogsMutation } from '../queries/logs';

const refreshing = ref(false);
const logsLoaded = ref(false);
const logList = useCursorList<LogRow>();
const { rows, hasMore, currentPage } = logList;
const query = reactive({
  perPage: 50,
  keyword: '',
  module: '',
  status: ''
});
const listParams = computed(() => logListParams(query, logList.currentCursor()));
const clearLogsMutation = useClearLogsMutation(listParams);

const actionLabels: Record<string, string> = {
  email_routing: '邮箱路由',
  dns: 'DNS 配置',
  catch_all: '全收转发',
  setup: '配置域名',
  refresh: '验证可用',
  policy: '邮件策略'
};

const statusLabels: Record<string, string> = {
  success: '成功',
  failed: '失败',
  skipped: '跳过'
};

const moduleOptions = [
  { label: '全部模块', value: '' },
  { label: '域名管理', value: 'domain' },
  { label: '邮件策略', value: 'policy' },
  { label: '邮件收发', value: 'mail' },
  { label: '发送邮件', value: 'send' },
  { label: '系统动作', value: 'system' }
];

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '失败', value: 'failed' },
  { label: '成功', value: 'success' },
  { label: '跳过', value: 'skipped' }
];

const filtered = computed(() => Boolean(query.module || query.status || query.keyword.trim()));
const clearButtonText = computed(() => (filtered.value ? '清空当前结果' : '清空日志'));

useFooterMetrics(() => [
  { label: '本页', value: rows.value.length, unit: '条' },
  { label: '第', value: currentPage.value, unit: '页' }
]);

function resetCursorState() {
  logList.resetCursorState();
}

async function loadLogs(cursor = logList.currentCursor(), force = false) {
  refreshing.value = true;
  try {
    const data = await loadLogsPage(logListParams(query, cursor), force);
    if (!data) return;
    logList.setPageData(data.items, data.info);
    logsLoaded.value = true;
  } finally {
    refreshing.value = false;
  }
}

async function clearLogs() {
  const message = filtered.value ? '确认清空当前筛选结果？' : '确认清空所有系统日志？';
  const confirmed = await confirmDialog({
    title: clearButtonText.value,
    message,
    confirmText: '清空',
    intent: 'danger'
  });
  if (!confirmed) return;
  await clearLogsMutation.mutateAsync({
    module: query.module || undefined,
    status: query.status || undefined,
    keyword: query.keyword.trim() || undefined
  });
  ElMessage.success('已清空');
  resetCursorState();
  rows.value = [];
  logsLoaded.value = true;
}

function applySearch() {
  resetCursorState();
  loadLogs();
}

function applyFilter() {
  resetCursorState();
  loadLogs();
}

function prevPage() {
  const cursor = logList.previousPageCursor();
  if (cursor === null) return;
  loadLogs(cursor);
}

function nextPage() {
  const cursor = logList.nextPageCursor();
  if (cursor === null) return;
  loadLogs(cursor);
}

function parseServerTime(value: string) {
  if (!value) return null;
  const normalized = /z$/i.test(value) || /[+-]\d{2}:\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFullTime(value: string) {
  const date = parseServerTime(value);
  if (!date) return value || '-';
  const day = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  const time = date.toLocaleTimeString('zh-CN', { hour12: false });
  return `${day} ${time}`;
}

function actionLabel(value: string) {
  return actionLabels[value] || '系统动作';
}

function moduleLabel(value: string) {
  return moduleOptions.find((item) => item.value === value)?.label || '系统';
}

function statusLabel(value: string) {
  return statusLabels[value] || '未知状态';
}

onMounted(loadLogs);
usePageRefresh(() => loadLogs(logList.currentCursor(), true));
</script>

<template>
  <div class="page mc-management-page">
    <section class="mc-panel mc-management-panel">
      <div class="mc-panel-head mc-panel-head--tools">
        <div class="mc-heading-line">
          <h3>系统日志</h3>
        </div>
        <div class="mc-page-actions mc-panel-head-tools">
          <McCfSelect v-model="query.module" class="mc-log-module-select" :options="moduleOptions" select-only @change="applyFilter" />
          <McCfSelect v-model="query.status" class="mc-log-status-select" :options="statusOptions" select-only @change="applyFilter" />
          <label class="mc-search mc-search--table mc-panel-head-search">
            <McIcon name="search" :size="18" />
            <input v-model.trim="query.keyword" type="search" placeholder="搜索域名、动作或错误信息" @change="applySearch" />
          </label>
          <div class="mc-panel-page-controls">
            <button class="mc-square" :class="{ disabled: currentPage <= 1 }" type="button" :disabled="currentPage <= 1" aria-label="上一页" @click="prevPage">
              <McIcon name="left" :size="19" />
            </button>
            <button
              class="mc-square"
              :class="{ disabled: !hasMore }"
              type="button"
              :disabled="!hasMore"
              aria-label="下一页"
              @click="nextPage"
            >
              <McIcon name="right" :size="19" />
            </button>
          </div>
          <button type="button" class="mc-action-danger" :disabled="refreshing || rows.length === 0" @click="clearLogs">{{ clearButtonText }}</button>
        </div>
      </div>
      <el-table :data="rows" table-layout="fixed" empty-text=" " class="mc-management-table" :class="{ 'mc-el-table-empty': logsLoaded && rows.length === 0 }">
        <el-table-column label="对象" width="190">
          <template #default="{ row }">
            <span class="mc-table-main-text">{{ row.target || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="模块" width="120">
          <template #default="{ row }">
            <span class="mc-table-text">{{ moduleLabel(row.module) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="动作" width="170">
          <template #default="{ row }">
            <span class="mc-table-text">{{ actionLabel(row.action) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <span class="mc-table-status">
              <span class="mc-table-status-dot" :class="{ ok: row.status === 'success', fail: row.status === 'failed', warn: row.status === 'skipped' }"></span>
              {{ statusLabel(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="320" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mc-table-muted-text">{{ row.message || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="210">
          <template #default="{ row }">
            <span class="mc-table-muted-text">{{ formatFullTime(row.createdAt) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <div v-if="logsLoaded" class="mc-empty-state mc-empty-state--table-inner">
            <div class="mc-empty-icon"><McIcon name="file" :size="26" /></div>
            <h2>暂无系统日志</h2>
          </div>
        </template>
      </el-table>
    </section>
  </div>
</template>
