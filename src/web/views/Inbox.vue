<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onActivated, onBeforeUnmount, onDeactivated, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage } from '../api/client';
import { endpoints, type MailDetail, type MailRow } from '../api/endpoints';
import { useUiStore } from '../stores/ui';
import MailDetailDrawer, { type MailDetailDrawerExpose, type MailMetaRow } from '../components/MailDetailDrawer.vue';
import McIcon from '../components/McIcon.vue';
import { confirmDialog } from '../composables/confirmDialog';
import { useCursorList } from '../composables/cursorList';
import { useFooterMetrics } from '../composables/footerStatus';
import { usePageRefresh } from '../composables/pageRefresh';
import { deleteMailsAndUpdatePage, loadLatestMail, loadMailDetail as loadMailDetailQuery, loadMailsPage, mailListParams } from '../queries/mail';
import { loadSettings as loadSettingsQuery, sendSettingsFromSettings, type SendSettings } from '../queries/settings';
import { formatBytes, formatFullTime, formatTime, mailBodyText } from '../utils/mail-view';

interface ComposeDraft {
  from?: string;
  fromName?: string;
  to?: string;
  toName?: string;
  subject?: string;
  html?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
}

const latestMailPollMs = 5000;
const MailComposer = defineAsyncComponent(() => import('../components/MailComposer.vue'));
const closeAppMenus = inject<() => void>(Symbol.for('done-mail.close-app-menus'), () => undefined);
const router = useRouter();
const route = useRoute();
const uiStore = useUiStore();
const listLoaded = ref(false);
const detailLoading = ref(false);
const detailDrawerRef = ref<MailDetailDrawerExpose | null>(null);
const selectedMail = ref<MailDetail | null>(null);
const mailList = useCursorList<MailRow>();
const {
  rows,
  checkedIds: checkedMailIds,
  hasMore,
  currentPage,
  hasRows,
  checkedCount,
  allPageChecked,
  pageCheckIndeterminate,
  clearChecked,
  togglePageChecked,
  recordRowPointer
} = mailList;
const composerOpen = ref(false);
const composeDraft = ref<ComposeDraft | null>(null);
const sharingMailId = ref('');
const sendSettings = reactive<SendSettings>({
  enabled: false,
  apiKeyConfigured: false
});
let detailLoadRunId = 0;
let latestMailTimer: number | null = null;
let checkingLatestMail = false;
let inboxActive = false;
const query = reactive({
  perPage: 20,
  keyword: String(route.query.keyword || '')
});
const listParams = computed(() => mailListParams(query, mailList.currentCursor()));

const detailDrawerOpen = computed(() => uiStore.inboxDetailOpen);
const selectedId = computed(() => (detailDrawerOpen.value ? uiStore.inboxDetailId : ''));
const sendEnabled = computed(() => sendSettings.enabled && sendSettings.apiKeyConfigured);
const selectedMetaRows = computed<MailMetaRow[]>(() => {
  if (!selectedMail.value) return [];
  return [
    { label: '发件人', value: senderLabel(selectedMail.value) },
    { label: '收件人', value: selectedMail.value.toAddr },
    { label: '类型', value: '转发邮件', visible: selectedMail.value.forwarded },
    { label: '接收地址', value: selectedMail.value.receivedByAddr || '-', visible: selectedMail.value.forwarded },
    { label: '收件时间', value: formatFullTime(selectedMail.value.receivedAt) },
    { label: '域名', value: selectedMail.value.domain || '-' },
    { label: '邮件 ID', value: selectedMail.value.messageId || '-' },
    { label: '大小', value: formatBytes(selectedMail.value.rawSize || 0) },
    { label: '附件', value: `${selectedMail.value.attachments.length} 个` }
  ];
});

useFooterMetrics(() => [
  { label: '本页', value: rows.value.length, unit: '封' },
  { label: '第', value: currentPage.value, unit: '页' }
]);

async function loadMails(cursor = mailList.currentCursor(), force = false) {
  const data = await loadMailsPage(mailListParams(query, cursor), force);
  if (!data) return;
  mailList.setPageData(data.items, data.info);
  listLoaded.value = true;
}

function canAutoRefreshInbox() {
  return inboxActive && currentPage.value === 1 && !query.keyword.trim() && document.visibilityState === 'visible';
}

async function checkLatestMail() {
  if (checkingLatestMail || !canAutoRefreshInbox()) return;
  checkingLatestMail = true;
  try {
    const latest = await loadLatestMail();
    if (!latest || rows.value[0]?.id === latest.id) return;
    if (!canAutoRefreshInbox()) return;
    await loadMails('', true);
  } catch (error) {
    if (import.meta.env.DEV) console.warn('Check latest mail failed', error);
  } finally {
    checkingLatestMail = false;
  }
}

function startLatestMailPolling() {
  stopLatestMailPolling();
  void checkLatestMail();
  latestMailTimer = window.setInterval(() => void checkLatestMail(), latestMailPollMs);
}

function stopLatestMailPolling() {
  if (!latestMailTimer) return;
  window.clearInterval(latestMailTimer);
  latestMailTimer = null;
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void checkLatestMail();
  }
}

async function loadSendSettings(force = false) {
  Object.assign(sendSettings, sendSettingsFromSettings(await loadSettingsQuery(force)));
}

async function loadMailDetail(id: string) {
  if (selectedMail.value?.id === id) {
    uiStore.openInboxDetail(id);
    return;
  }
  const runId = ++detailLoadRunId;
  uiStore.openInboxDetail(id);
  detailLoading.value = true;
  try {
    const data = await loadMailDetailQuery(id);
    if (runId !== detailLoadRunId) return;
    selectedMail.value = data;
  } catch (error) {
    if (runId === detailLoadRunId) {
      closeDetailDrawer();
    }
    console.error('Load mail detail failed', error);
  } finally {
    if (runId === detailLoadRunId) {
      detailLoading.value = false;
    }
  }
}

function closeDetailDrawer() {
  detailLoadRunId += 1;
  uiStore.closeInboxDetail();
  selectedMail.value = null;
  detailLoading.value = false;
}

function closeDetailDrawerFromUser() {
  closeDetailDrawer();
}

async function deleteMail(id: string) {
  await deleteMails([id], '确认删除这封邮件？');
}

async function deleteCurrentMailFromMenu(id: string) {
  await deleteMail(id);
}

async function shareCurrentMail() {
  if (!selectedMail.value) return;
  const id = selectedMail.value.id;
  if (sharingMailId.value) return;
  sharingMailId.value = id;
  detailDrawerRef.value?.closePanels();
  try {
    const url = (await endpoints.createMailShare(id)).url;
    await navigator.clipboard.writeText(url);
    ElMessage.success('分享链接已复制');
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '分享链接生成失败'));
  } finally {
    if (sharingMailId.value === id) sharingMailId.value = '';
  }
}

function openComposer() {
  if (!sendEnabled.value) {
    ElMessage.error('请先在系统设置中开启发送邮件并配置 Resend Key');
    return;
  }
  composeDraft.value = null;
  composerOpen.value = true;
}

function escapeComposeHtml(value: string) {
  return value.replace(/[<>&"]/g, (char) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '&') return '&amp;';
    return '&quot;';
  });
}

function replySubject(subject: string) {
  const value = subject.trim() || '无主题';
  return /^(回复|Re):/i.test(value) ? value : `回复：${value}`;
}

function replyReferenceHtml(mail: MailDetail) {
  const sender = senderLabel(mail);
  const receivedAt = formatFullTime(mail.receivedAt);
  const source = mailBodyText({ textBody: mail.textBody, htmlBody: mail.htmlBody }).slice(0, 1200);
  return [
    '<div><br></div>',
    `<div>在 ${escapeComposeHtml(receivedAt)}，${escapeComposeHtml(sender)} 写道：</div>`,
    `<blockquote>${escapeComposeHtml(source).replace(/\n/g, '<br>')}</blockquote>`
  ].join('');
}

function replyCurrentMail() {
  if (!sendEnabled.value) {
    ElMessage.error('请先在系统设置中开启发送邮件并配置 Resend Key');
    return;
  }
  if (!selectedMail.value) return;
  detailDrawerRef.value?.closePanels();
  composeDraft.value = {
    from: selectedMail.value.receivedByAddr || selectedMail.value.toAddr,
    fromName: '',
    to: selectedMail.value.fromAddr,
    toName: selectedMail.value.fromName,
    subject: replySubject(selectedMail.value.subject),
    html: replyReferenceHtml(selectedMail.value),
    inReplyTo: selectedMail.value.messageId || '',
    references: selectedMail.value.headers.references || selectedMail.value.headers.References || selectedMail.value.messageId || ''
  };
  composerOpen.value = true;
}

async function deleteCheckedMails() {
  await deleteMails(checkedMailIds.value, `确认删除选中的 ${checkedCount.value} 封邮件？`);
}

async function deleteMails(ids: string[], confirmText: string) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return;
  const currentId = selectedMail.value?.id || '';
  const replacementId = currentId && uniqueIds.includes(currentId) ? mailList.nextVisibleIdAfterDelete(currentId, uniqueIds) : '';

  const confirmed = await confirmDialog({
    title: '删除邮件',
    message: confirmText,
    confirmText: '删除',
    intent: 'danger'
  });
  if (!confirmed) return;
  const nextPage = await deleteMailsAndUpdatePage(uniqueIds, listParams);
  ElMessage.success(uniqueIds.length === 1 ? '已删除' : `已删除 ${uniqueIds.length} 封`);

  if (nextPage) mailList.setPageData(nextPage.items, nextPage.info);
  clearChecked();
  if (currentId && uniqueIds.includes(currentId)) {
    if (replacementId) {
      await loadMailDetail(replacementId);
    } else {
      closeDetailDrawer();
    }
  }
}

function toggleMailChecked(id: string, checked: boolean) {
  mailList.toggleRowChecked(id, checked);
}

function isMailChecked(id: string) {
  return mailList.isRowChecked(id);
}

function openMailFromRow(id: string, event: MouseEvent) {
  if (!mailList.shouldOpenRow(event)) return;
  loadMailDetail(id);
}

function downloadAttachment(item: { id: string; stored: boolean }) {
  if (!selectedMail.value || !item.stored) return;
  window.open(`/api/internal/mails/${selectedMail.value.id}/attachments/${item.id}`, '_blank', 'noopener,noreferrer');
}

function senderLabel(row: MailRow) {
  return row.fromName ? `${row.fromName} <${row.fromAddr}>` : row.fromAddr || '-';
}

function senderName(row: MailRow) {
  return row.fromName || row.fromAddr || '-';
}

function prevPage() {
  const cursor = mailList.previousPageCursor();
  if (cursor === null) return;
  loadMails(cursor);
}

function nextPage() {
  const cursor = mailList.nextPageCursor();
  if (cursor === null) return;
  loadMails(cursor);
}

function routeQuery() {
  const keyword = query.keyword.trim();
  return {
    ...(keyword ? { keyword } : {})
  };
}

function sameRouteQuery(next: Partial<Record<'keyword', string>>) {
  return String(route.query.keyword || '') === (next.keyword || '');
}

function applySearch() {
  resetCursorState();
  clearChecked();
  closeDetailDrawer();
  const next = routeQuery();
  if (sameRouteQuery(next)) {
    loadMails();
    return;
  }
  router.replace({ path: '/inbox', query: next });
}

watch(
  () => route.query.keyword,
  (keyword) => {
    query.keyword = String(keyword || '');
    resetCursorState();
    clearChecked();
    loadMails();
  }
);

function resetCursorState() {
  mailList.resetCursorState();
}

async function restoreInboxState() {
  clearChecked();
  await Promise.all([loadMails(), loadSendSettings()]);
  const openId = uiStore.inboxDetailOpen ? uiStore.inboxDetailId : '';
  if (openId && selectedMail.value?.id !== openId) {
    await loadMailDetail(openId);
  }
}

onActivated(() => {
  inboxActive = true;
  void restoreInboxState().then(() => {
    if (inboxActive) startLatestMailPolling();
  });
});

onDeactivated(() => {
  inboxActive = false;
  stopLatestMailPolling();
});

onBeforeUnmount(() => {
  inboxActive = false;
  stopLatestMailPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

document.addEventListener('visibilitychange', handleVisibilityChange);

usePageRefresh(async () => {
  await Promise.all([loadMails(mailList.currentCursor(), true), loadSendSettings(true)]);
});

</script>

<template>
  <section class="mc-workspace" :class="{ 'mc-workspace--drawer-open': detailDrawerOpen }">
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
      </div>

      <div class="mc-table" :class="{ 'mc-table--empty': !hasRows }">
        <div class="mc-mail-list-tools">
          <div class="mc-mail-list-tools-left">
            <el-checkbox :model-value="allPageChecked" :indeterminate="pageCheckIndeterminate" :disabled="rows.length === 0" @change="togglePageChecked(Boolean($event))" />
            <span>全选</span>
            <span v-if="checkedCount > 0" class="mc-selected-count">已选 {{ checkedCount }} 封</span>
          </div>
          <button v-if="checkedCount > 0" type="button" class="mc-action-danger mc-action-compact mc-bulk-delete" @click="deleteCheckedMails">删除</button>
        </div>

        <div class="mc-table-body">
          <div
            v-for="row in rows"
            :key="row.id"
            class="mc-mail-row"
            :class="{ selected: row.id === selectedId, checked: isMailChecked(row.id) }"
            role="button"
            tabindex="0"
            @pointerdown="recordRowPointer"
            @click="openMailFromRow(row.id, $event)"
            @keydown.enter="loadMailDetail(row.id)"
          >
            <div class="mc-cell mc-check-cell">
              <el-checkbox :model-value="isMailChecked(row.id)" :aria-label="`选择 ${row.subject || '无主题'}`" @click.stop @change="toggleMailChecked(row.id, Boolean($event))" />
            </div>
            <div class="mc-cell mc-sender">{{ senderName(row) }}</div>
            <div class="mc-cell mc-subject" :class="{ strong: row.id === selectedId }" :title="row.bodyPreview ? `${row.subject || '无主题'} - ${row.bodyPreview}` : row.subject || '无主题'">
              <span class="mc-subject-combined">
                <span v-if="row.forwarded" class="mc-status-chip mc-status-chip--forwarded">转发</span>
                <span class="mc-subject-text">{{ row.subject || '无主题' }}</span>
                <span v-if="row.bodyPreview" class="mc-body-preview"> - {{ row.bodyPreview }}</span>
              </span>
            </div>
            <div class="mc-cell mc-to">{{ row.toAddr }}</div>
            <div class="mc-cell mc-time" :class="{ strong: row.id === selectedId }">{{ formatTime(row.receivedAt) }}</div>
          </div>

          <div v-if="listLoaded && rows.length === 0" class="mc-empty-state mc-empty-state--table">
            <div class="mc-empty-icon"><McIcon name="mail" :size="26" /></div>
            <h2>等待第一封邮件</h2>
          </div>
        </div>
      </div>
    </div>

    <MailDetailDrawer
      ref="detailDrawerRef"
      v-if="detailDrawerOpen"
      :loading="detailLoading"
      :title="selectedMail?.subject || ''"
      :summary-time="selectedMail ? formatFullTime(selectedMail.receivedAt) : ''"
      :summary-recipient="selectedMail?.toAddr || '-'"
      :text-body="selectedMail?.textBody || ''"
      :html-body="selectedMail?.htmlBody || ''"
      :attachments="selectedMail?.attachments || []"
      :meta-rows="selectedMetaRows"
      :action-busy="Boolean(sharingMailId)"
      :on-frame-pointer-down="closeAppMenus"
      @close="closeDetailDrawerFromUser"
      @download="downloadAttachment"
    >
      <template #actions>
        <button v-if="sendSettings.enabled" type="button" class="mc-menu-item" :disabled="!sendEnabled" @click="replyCurrentMail"><McIcon name="mail" :size="16" />回复</button>
        <button type="button" class="mc-menu-item" :disabled="Boolean(sharingMailId)" @click="shareCurrentMail">
          <span v-if="sharingMailId" class="mc-button-spinner"></span>
          <McIcon v-else name="link" :size="16" />{{ sharingMailId ? '生成中' : '分享链接' }}
        </button>
        <button v-if="selectedMail" type="button" class="mc-menu-item mc-menu-item--danger" @click="deleteCurrentMailFromMenu(selectedMail.id)"><McIcon name="trash" :size="16" />删除邮件</button>
      </template>
    </MailDetailDrawer>
    <MailComposer v-if="composerOpen" v-model="composerOpen" :draft="composeDraft" />
  </section>
</template>
