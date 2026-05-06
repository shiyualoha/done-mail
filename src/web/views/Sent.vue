<script setup lang="ts">
import { computed, defineAsyncComponent, onActivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { type SentDetail, type SentRow } from '../api/endpoints';
import { useUiStore } from '../stores/ui';
import MailDetailDrawer, { type MailMetaRow } from '../components/MailDetailDrawer.vue';
import McIcon from '../components/McIcon.vue';
import { confirmDialog } from '../composables/confirmDialog';
import { useCursorList } from '../composables/cursorList';
import { useFooterMetrics } from '../composables/footerStatus';
import { usePageRefresh } from '../composables/pageRefresh';
import { deleteSentAndUpdatePage, loadSentDetail as loadSentDetailQuery, loadSentPage, sentListParams } from '../queries/mail';
import { loadSettings as loadSettingsQuery, sendSettingsFromSettings, type SendSettings } from '../queries/settings';
import { formatFullTime, formatTime } from '../utils/mail-view';

const router = useRouter();
const route = useRoute();
const uiStore = useUiStore();
const MailComposer = defineAsyncComponent(() => import('../components/MailComposer.vue'));
const listLoaded = ref(false);
const detailLoading = ref(false);
const composerOpen = ref(false);
const selectedMail = ref<SentDetail | null>(null);
const sentList = useCursorList<SentRow>();
const {
  rows,
  checkedIds: checkedSentIds,
  hasMore,
  currentPage,
  hasRows,
  checkedCount,
  allPageChecked,
  pageCheckIndeterminate,
  clearChecked,
  togglePageChecked,
  recordRowPointer
} = sentList;
const detailLoadRunId = ref(0);
const query = reactive({
  perPage: 20,
  keyword: String(route.query.keyword || '')
});
const listParams = computed(() => sentListParams(query, sentList.currentCursor()));
const sendSettings = reactive<SendSettings>({
  enabled: false,
  apiKeyConfigured: false
});

const drawerOpen = computed(() => uiStore.sentDetailOpen);
const sendEnabled = computed(() => sendSettings.enabled && sendSettings.apiKeyConfigured);
const selectedMetaRows = computed<MailMetaRow[]>(() => {
  if (!selectedMail.value) return [];
  return [
    { label: '发件人', value: selectedMail.value.fromName ? `${selectedMail.value.fromName} <${selectedMail.value.fromAddr}>` : selectedMail.value.fromAddr },
    { label: '收件人', value: selectedMail.value.toName ? `${selectedMail.value.toName} <${selectedMail.value.toAddr}>` : selectedMail.value.toAddr },
    { label: '发送时间', value: formatFullTime(selectedMail.value.sentAt) },
    { label: '状态', value: selectedMail.value.status === 'failed' ? '发送失败' : selectedMail.value.status === 'sending' ? '发送中' : '已发送' },
    { label: 'Resend ID', value: selectedMail.value.resendId || '-' },
    { label: '附件', value: `${selectedMail.value.attachments.length} 个` }
  ];
});

useFooterMetrics(() => [
  { label: '本页', value: rows.value.length, unit: '封' },
  { label: '第', value: currentPage.value, unit: '页' }
]);

function recipientName(row: SentRow) {
  return row.toName || row.toAddr || '-';
}

function statusText(row: SentRow) {
  if (row.status === 'failed') return '发送失败';
  if (row.status === 'sending') return '发送中';
  return '';
}

async function loadSent(cursor = sentList.currentCursor(), force = false) {
  const data = await loadSentPage(sentListParams(query, cursor), force);
  if (!data) return;
  sentList.setPageData(data.items, data.info);
  listLoaded.value = true;
}

async function loadSendSettings(force = false) {
  Object.assign(sendSettings, sendSettingsFromSettings(await loadSettingsQuery(force)));
}

function openComposer() {
  if (!sendEnabled.value) {
    ElMessage.error('请先在系统设置中开启发送邮件并配置 Resend Key');
    return;
  }
  composerOpen.value = true;
}

async function loadDetail(id: string) {
  if (selectedMail.value?.id === id) {
    uiStore.openSentDetail(id);
    return;
  }
  const runId = detailLoadRunId.value + 1;
  detailLoadRunId.value = runId;
  uiStore.openSentDetail(id);
  detailLoading.value = true;
  try {
    const data = await loadSentDetailQuery(id);
    if (runId !== detailLoadRunId.value) return;
    selectedMail.value = data;
  } finally {
    if (runId === detailLoadRunId.value) detailLoading.value = false;
  }
}

function closeDrawer() {
  detailLoadRunId.value += 1;
  uiStore.closeSentDetail();
  detailLoading.value = false;
  selectedMail.value = null;
}

async function deleteSent(id: string) {
  await deleteSentRows([id], '确认删除这封发送邮件？');
}

async function deleteCurrentSentFromMenu(id: string) {
  await deleteSent(id);
}

async function deleteCheckedSent() {
  await deleteSentRows(checkedSentIds.value, `确认删除选中的 ${checkedCount.value} 封发送邮件？`);
}

async function deleteSentRows(ids: string[], confirmText: string) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const currentId = selectedMail.value?.id || '';
  const replacementId = currentId && uniqueIds.includes(currentId) ? sentList.nextVisibleIdAfterDelete(currentId, uniqueIds) : '';

  const confirmed = await confirmDialog({
    title: '删除发送邮件',
    message: confirmText,
    confirmText: '删除',
    intent: 'danger'
  });
  if (!confirmed) return;
  const nextPage = await deleteSentAndUpdatePage(uniqueIds, listParams);
  ElMessage.success(uniqueIds.length === 1 ? '已删除' : `已删除 ${uniqueIds.length} 封`);
  if (nextPage) sentList.setPageData(nextPage.items, nextPage.info);
  clearChecked();
  if (currentId && uniqueIds.includes(currentId)) {
    if (replacementId) {
      await loadDetail(replacementId);
    } else {
      closeDrawer();
    }
  }
}

function toggleSentChecked(id: string, checked: boolean) {
  sentList.toggleRowChecked(id, checked);
}

function isSentChecked(id: string) {
  return sentList.isRowChecked(id);
}

function openSentFromRow(id: string, event: MouseEvent) {
  if (!sentList.shouldOpenRow(event)) return;
  loadDetail(id);
}

function downloadAttachment(item: { id: string; stored: boolean }) {
  if (!selectedMail.value || !item.stored) return;
  window.open(`/api/internal/sent-mails/${selectedMail.value.id}/attachments/${item.id}`, '_blank', 'noopener,noreferrer');
}

function prevPage() {
  const cursor = sentList.previousPageCursor();
  if (cursor === null) return;
  loadSent(cursor);
}

function nextPage() {
  const cursor = sentList.nextPageCursor();
  if (cursor === null) return;
  loadSent(cursor);
}

function resetCursorState() {
  sentList.resetCursorState();
}

function routeQuery() {
  const keyword = query.keyword.trim();
  return {
    ...(keyword ? { keyword } : {})
  };
}

function applySearch() {
  resetCursorState();
  clearChecked();
  closeDrawer();
  const next = routeQuery();
  if (String(route.query.keyword || '') === (next.keyword || '')) {
    loadSent();
    return;
  }
  router.replace({ path: '/sent', query: next });
}

watch(
  () => route.query.keyword,
  (keyword) => {
    query.keyword = String(keyword || '');
    resetCursorState();
    clearChecked();
    loadSent();
  }
);

onActivated(() => {
  void Promise.all([loadSent(), loadSendSettings()]);
});

usePageRefresh(async () => {
  await Promise.all([loadSent(sentList.currentCursor(), true), loadSendSettings(true)]);
});
</script>

<template>
  <section class="mc-workspace" :class="{ 'mc-workspace--drawer-open': drawerOpen }">
    <div class="mc-list-pane">
      <div class="mc-toolbar">
        <div class="mc-table-searchbar">
          <label class="mc-search mc-search--table">
            <McIcon name="search" :size="18" />
            <input v-model.trim="query.keyword" type="search" placeholder="搜索发件人、收件人、主题或内容" @keyup.enter="applySearch" />
          </label>
          <button class="mc-action-primary mc-action-compact" type="button" @click="applySearch">
            <McIcon name="search" :size="15" />筛选
          </button>
        </div>
        <div class="mc-tools-right">
          <button v-if="sendSettings.enabled" class="mc-action-compose mc-action-compact" type="button" :disabled="!sendEnabled" @click="openComposer">
            <McIcon name="mail" :size="15" />写邮件
          </button>
          <button class="mc-square" :class="{ disabled: currentPage <= 1 }" type="button" :disabled="currentPage <= 1" aria-label="上一页" @click="prevPage">
            <McIcon name="left" :size="19" />
          </button>
          <button class="mc-square" :class="{ disabled: !hasMore }" type="button" :disabled="!hasMore" aria-label="下一页" @click="nextPage">
            <McIcon name="right" :size="19" />
          </button>
        </div>
      </div>

      <div class="mc-table" :class="{ 'mc-table--empty': !hasRows }">
        <div class="mc-mail-list-tools">
          <div class="mc-mail-list-tools-left">
            <el-checkbox :model-value="allPageChecked" :indeterminate="pageCheckIndeterminate" :disabled="rows.length === 0" @change="togglePageChecked(Boolean($event))" />
            <span>全选</span>
            <span v-if="checkedCount > 0" class="mc-selected-count">已选 {{ checkedCount }} 封</span>
          </div>
          <button v-if="checkedCount > 0" type="button" class="mc-action-danger mc-action-compact mc-bulk-delete" @click="deleteCheckedSent">删除</button>
        </div>

        <div class="mc-table-body">
          <div
            v-for="row in rows"
            :key="row.id"
            class="mc-mail-row mc-mail-row--sent"
            :class="{ selected: selectedMail?.id === row.id, checked: isSentChecked(row.id) }"
            role="button"
            tabindex="0"
            @pointerdown="recordRowPointer"
            @click="openSentFromRow(row.id, $event)"
            @keydown.enter="loadDetail(row.id)"
          >
            <div class="mc-cell mc-check-cell">
              <el-checkbox :model-value="isSentChecked(row.id)" :aria-label="`选择 ${row.subject || '无主题'}`" @click.stop @change="toggleSentChecked(row.id, Boolean($event))" />
            </div>
            <div class="mc-cell mc-sender">{{ recipientName(row) }}</div>
            <div class="mc-cell mc-subject" :title="row.bodyPreview ? `${row.subject || '无主题'} - ${row.bodyPreview}` : row.subject || '无主题'">
              <span class="mc-subject-combined">
                <span v-if="statusText(row)" class="mc-status-chip" :class="`mc-status-chip--${row.status}`">{{ statusText(row) }}</span>
                <span class="mc-subject-text">{{ row.subject || '无主题' }}</span>
                <span v-if="row.bodyPreview" class="mc-body-preview"> - {{ row.bodyPreview }}</span>
              </span>
            </div>
            <div class="mc-cell mc-to">{{ row.fromAddr }}</div>
            <div class="mc-cell mc-time">{{ formatTime(row.sentAt) }}</div>
          </div>

          <div v-if="listLoaded && rows.length === 0" class="mc-empty-state mc-empty-state--table">
            <div class="mc-empty-icon"><McIcon name="mail" :size="26" /></div>
            <h2>还没有发送邮件</h2>
          </div>
        </div>
      </div>
    </div>

    <MailDetailDrawer
      v-if="drawerOpen"
      :loading="detailLoading"
      :title="selectedMail?.subject || ''"
      :summary-time="selectedMail ? formatFullTime(selectedMail.sentAt) : ''"
      :summary-recipient="selectedMail?.toAddr || '-'"
      :text-body="selectedMail?.textBody || ''"
      :html-body="selectedMail?.htmlBody || ''"
      :attachments="selectedMail?.attachments || []"
      :meta-rows="selectedMetaRows"
      :error-title="selectedMail?.status === 'failed' && selectedMail.error ? '发送失败' : ''"
      :error-message="selectedMail?.status === 'failed' ? selectedMail.error || '' : ''"
      action-label="发送邮件操作"
      @close="closeDrawer"
      @download="downloadAttachment"
    >
      <template #actions>
        <button v-if="selectedMail" type="button" class="mc-menu-item mc-menu-item--danger" @click="deleteCurrentSentFromMenu(selectedMail.id)"><McIcon name="trash" :size="16" />删除邮件</button>
      </template>
    </MailDetailDrawer>
    <MailComposer v-if="composerOpen" v-model="composerOpen" @sent="loadSent" />
  </section>
</template>
