<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage } from '../api/client';
import { endpoints, type DomainBatchResult, type DomainRow, type ZoneRow } from '../api/endpoints';
import McCfSelect from '../components/McCfSelect.vue';
import McIcon from '../components/McIcon.vue';
import { useCursorList } from '../composables/cursorList';
import { useFooterMetrics } from '../composables/footerStatus';
import { usePageRefresh } from '../composables/pageRefresh';
import { useUiStore } from '../stores/ui';
import {
  domainListParams,
  loadDomainsPage,
  loadSubdomainsPage,
  loadZones as loadZonesQuery,
  mergeChildDomainRows,
  mergeDomainPage,
  mergeRootDomainRows,
  mergeSubdomainPage,
  removeDomainPageRecords,
  removeDomainRows,
  removeSubdomainPageRecords
} from '../queries/domains';
import { getSettingsCache, loadSettings as loadSettingsQuery, type SettingsState } from '../queries/settings';

const domainStatusPollMs = 3000;
const uiStore = useUiStore();
const savingDomain = ref(false);
const savingSubdomain = ref(false);
const zonesLoading = ref(false);
const addDomainDialogOpen = ref(false);
const addSubdomainDialogOpen = ref(false);
const selectedZoneIds = ref<string[]>([]);
const subdomainPrefixes = ref('');
const subdomainParent = ref<DomainRow | null>(null);
const actionDomainId = ref('');
const domainsLoaded = ref(false);
const subdomainsLoaded = ref(false);
const activeDomainMenu = ref<{ row: DomainRow; x: number; y: number } | null>(null);
const rootList = useCursorList<DomainRow>();
const subdomainList = useCursorList<DomainRow>();
const { rows } = rootList;
const { rows: subdomainRows } = subdomainList;
const zones = ref<ZoneRow[]>([]);
const settings = ref<SettingsState | null>(null);
const rootQuery = ref({
  pageSize: 20,
  keyword: ''
});
const subdomainQuery = ref({
  pageSize: 20,
  keyword: ''
});

const selectedRootId = computed({
  get: () => uiStore.selectedRootDomainId,
  set: (id: string) => {
    if (id) {
      uiStore.selectRootDomain(id);
    } else {
      uiStore.clearRootDomain();
    }
  }
});
const zoneOptions = computed(() => zones.value.map((zone) => ({ label: zone.name, value: zone.id })));
const rootDomains = computed(() => rows.value.filter((row) => row.is_subdomain !== 1));
const activeQuery = computed(() => (selectedRoot.value ? subdomainQuery.value : rootQuery.value));
const activeHasMore = computed(() => (selectedRoot.value ? subdomainList.hasMore.value : rootList.hasMore.value));
const activePage = computed(() => (selectedRoot.value ? subdomainList.currentPage.value : rootList.currentPage.value));
const activeSearchPlaceholder = computed(() => (selectedRoot.value ? '搜索当前主域下的子域名' : '搜索主域名或子域名'));
const selectedRoot = computed(() => rootDomains.value.find((row) => row.id === selectedRootId.value) || null);
const selectedChildren = computed(() => (selectedRoot.value ? subdomainRows.value : []));
const primaryAddLabel = computed(() => (selectedRoot.value ? '添加子域' : '添加主域'));
const hasConfiguringDomain = computed(() => rows.value.some(domainConfiguring) || subdomainRows.value.some(domainConfiguring));
let domainStatusTimer: number | null = null;
let domainStatusRequesting = false;
let domainsActive = false;

useFooterMetrics(() => [
  { label: '本页', value: selectedRoot.value ? subdomainRows.value.length : rootDomains.value.length, unit: '个' },
  { label: '第', value: activePage.value, unit: '页' }
]);

function domainStatus(row: DomainRow) {
  if (domainConfiguring(row)) {
    return { text: '验证中', tone: 'warn' };
  }

  if (row.last_error) {
    return { text: '异常', tone: 'fail' };
  }

  const ready =
    row.email_routing_enabled === 1 &&
    row.dns_configured === 1 &&
    row.catchall_enabled === 1 &&
    row.worker_action_enabled === 1;

  return ready ? { text: '正常', tone: 'ok' } : { text: '异常', tone: 'fail' };
}

function domainConfiguring(row: DomainRow) {
  return row.setup_status === 'configuring';
}

function canRemoveLocalDomain(row: DomainRow) {
  return row.setup_status !== 'configuring' && domainStatus(row).tone === 'fail';
}

function canPollDomainStatus() {
  return domainsActive && hasConfiguringDomain.value && document.visibilityState === 'visible';
}

async function pollDomainStatus() {
  if (domainStatusRequesting || !canPollDomainStatus()) return;
  domainStatusRequesting = true;
  try {
    await refreshDomainData();
  } finally {
    domainStatusRequesting = false;
    syncDomainStatusPolling();
  }
}

function startDomainStatusPolling() {
  if (domainStatusTimer || !canPollDomainStatus()) return;
  void pollDomainStatus();
  domainStatusTimer = window.setInterval(() => void pollDomainStatus(), domainStatusPollMs);
}

function stopDomainStatusPolling() {
  if (!domainStatusTimer) return;
  window.clearInterval(domainStatusTimer);
  domainStatusTimer = null;
}

function syncDomainStatusPolling() {
  if (canPollDomainStatus()) {
    startDomainStatusPolling();
    return;
  }
  stopDomainStatusPolling();
}

function handleVisibilityChange() {
  syncDomainStatusPolling();
}

function cloudflareConfigured() {
  const cloudflare = settings.value?.cloudflare;
  return Boolean(cloudflare?.accountId && cloudflare.workerName && cloudflare.apiTokenConfigured);
}

async function loadSettings() {
  settings.value = await loadSettingsQuery();
}

function resetRootCursorState() {
  rootList.resetCursorState();
}

function resetSubdomainCursorState() {
  subdomainList.resetCursorState();
}

function rootCursor() {
  return rootList.currentCursor();
}

function subdomainCursor() {
  return subdomainList.currentCursor();
}

function currentRootParams(cursor = rootCursor()) {
  return domainListParams(rootQuery.value, cursor);
}

function currentSubdomainParams(cursor = subdomainCursor()) {
  return domainListParams(subdomainQuery.value, cursor);
}

async function loadDomains(cursor = rootCursor(), force = false) {
  try {
    const data = await loadDomainsPage(currentRootParams(cursor), force);
    if (!data) return;
    rootList.setPageData(data.items, data.info);
    if (selectedRootId.value && !rows.value.some((row) => row.id === selectedRootId.value && row.is_subdomain !== 1)) {
      clearRootSelectionDirect();
    }
    domainsLoaded.value = true;
  } catch (error) {
    console.error('Load domains failed', error);
    ElMessage.error(apiErrorMessage(error, '域名列表加载失败'));
  }
}

async function loadSubdomains(cursor = subdomainCursor(), force = false) {
  if (!selectedRoot.value) {
    resetSubdomainCursorState();
    subdomainList.setPageData([], {});
    subdomainsLoaded.value = true;
    return;
  }

  try {
    const parentId = selectedRoot.value.id;
    const data = await loadSubdomainsPage(parentId, currentSubdomainParams(cursor), force);
    if (!data) return;
    subdomainList.setPageData(data.items, data.info);
    subdomainsLoaded.value = true;
  } catch (error) {
    console.error('Load subdomains failed', error);
    ElMessage.error(apiErrorMessage(error, '子域名列表加载失败'));
  }
}

async function refreshDomainData() {
  await loadDomains(rootCursor(), true);
  if (selectedRoot.value) {
    await loadSubdomains(subdomainCursor(), true);
  }
}

function applySearch() {
  if (selectedRoot.value) {
    resetSubdomainCursorState();
    loadSubdomains();
    return;
  }
  resetRootCursorState();
  loadDomains();
}

function prevPage() {
  if (selectedRoot.value) {
    const cursor = subdomainList.previousPageCursor();
    if (cursor !== null) loadSubdomains(cursor);
    return;
  }
  const cursor = rootList.previousPageCursor();
  if (cursor !== null) loadDomains(cursor);
}

function nextPage() {
  if (selectedRoot.value) {
    const cursor = subdomainList.nextPageCursor();
    if (cursor !== null) loadSubdomains(cursor);
    return;
  }
  const cursor = rootList.nextPageCursor();
  if (cursor !== null) loadDomains(cursor);
}

async function loadZones() {
  zonesLoading.value = true;
  try {
    zones.value = await loadZonesQuery();
  } catch (error) {
    console.error('Load Cloudflare zones failed', error);
    ElMessage.error(apiErrorMessage(error, 'Cloudflare 域名加载失败'));
  } finally {
    zonesLoading.value = false;
  }
}

function openAddDomainDialog() {
  selectedZoneIds.value = [];
  zones.value = [];
  addDomainDialogOpen.value = true;

  if (cloudflareConfigured()) {
    void loadZones();
    return;
  }

  void loadSettings().then(() => {
    if (!addDomainDialogOpen.value) return;
    if (cloudflareConfigured()) {
      void loadZones();
      return;
    }
    addDomainDialogOpen.value = false;
    ElMessage.error('请先完成 Cloudflare 配置');
  });
}

function openAddSubdomainDialog(row: DomainRow) {
  subdomainParent.value = row;
  subdomainPrefixes.value = '';
  addSubdomainDialogOpen.value = true;
}

function openPrimaryAddDialog() {
  if (selectedRoot.value) {
    openAddSubdomainDialog(selectedRoot.value);
    return;
  }
  void openAddDomainDialog();
}

function mergeRootRows(records: DomainRow[]) {
  rows.value = mergeRootDomainRows(rows.value, records);
  mergeDomainPage(currentRootParams(), records);
  domainsLoaded.value = true;
}

function mergeSubdomainRows(records: DomainRow[]) {
  if (!selectedRoot.value) return;
  const selectedParentId = selectedRoot.value.id;
  const nextRows = mergeChildDomainRows(subdomainRows.value, records, selectedParentId);
  if (nextRows === subdomainRows.value) return;
  subdomainRows.value = nextRows;
  mergeSubdomainPage(selectedParentId, currentSubdomainParams(), records);
  subdomainsLoaded.value = true;
}

function mergeDomainRecords(records: DomainRow[]) {
  mergeRootRows(records);
  mergeSubdomainRows(records);
}

function removeLocalRecords(ids: string[]) {
  rows.value = removeDomainRows(rows.value, ids);
  subdomainRows.value = removeDomainRows(subdomainRows.value, ids);
  removeDomainPageRecords(currentRootParams(), ids);
  if (selectedRoot.value) {
    removeSubdomainPageRecords(selectedRoot.value.id, currentSubdomainParams(), ids);
  }
  if (selectedRootId.value && !rows.value.some((row) => row.id === selectedRootId.value)) {
    clearRootSelectionDirect();
  }
}

function subdomainPrefixLabel(child: DomainRow) {
  const parent = rootDomains.value.find((row) => row.id === child.parent_domain_id);
  const suffix = parent ? `.${parent.name}` : '';
  if (suffix && child.name.endsWith(suffix)) {
    return child.name.slice(0, -suffix.length) || child.name;
  }
  return child.name;
}

function parseBatchInput(value: string) {
  return [...new Set(value.split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean))];
}

function showBatchMessage(result: DomainBatchResult, label: string) {
  if (result.failed === 0) {
    ElMessage.success(`${label}已添加 ${result.success} 个`);
    return;
  }

  if (result.success > 0) {
    ElMessage.warning(`${label}部分完成：成功 ${result.success} 个，失败 ${result.failed} 个`);
    return;
  }

  ElMessage.error(result.items[0]?.error || `${label}添加失败`);
}

async function addDomain() {
  if (selectedZoneIds.value.length === 0) {
    ElMessage.error('请选择至少一个主域名');
    return;
  }

  if (selectedZoneIds.value.some((zoneId) => !zones.value.some((zone) => zone.id === zoneId))) {
    ElMessage.error('请从下拉列表中选择主域名');
    return;
  }

  savingDomain.value = true;
  try {
    const selectedZones = selectedZoneIds.value.flatMap((zoneId) => {
      const zone = zones.value.find((item) => item.id === zoneId);
      return zone ? [{ id: zone.id, name: zone.name }] : [];
    });
    const result = await endpoints.addDomains(selectedZones);
    mergeDomainRecords(result.items.flatMap((item) => (item.record ? [item.record] : [])));
    showBatchMessage(result, '主域名');
    addDomainDialogOpen.value = false;
  } catch (error) {
    console.error('Add domain failed', error);
    ElMessage.error(apiErrorMessage(error, '添加主域名失败'));
  } finally {
    savingDomain.value = false;
  }
}

async function addSubdomain() {
  if (!subdomainParent.value) return;
  const prefixes = parseBatchInput(subdomainPrefixes.value);
  if (prefixes.length === 0) {
    ElMessage.error('请填写至少一个子域名前缀');
    return;
  }

  savingSubdomain.value = true;
  try {
    const result = await endpoints.addSubdomains(subdomainParent.value.id, prefixes);
    mergeDomainRecords(result.items.flatMap((item) => (item.record ? [item.record] : [])));
    showBatchMessage(result, '子域名');
    addSubdomainDialogOpen.value = false;
  } catch (error) {
    console.error('Add subdomain failed', error);
    ElMessage.error(apiErrorMessage(error, '添加子域名失败'));
  } finally {
    savingSubdomain.value = false;
  }
}

async function refreshOne(id: string) {
  actionDomainId.value = id;
  try {
    const data = await endpoints.refreshDomain(id);
    if (data.record) mergeDomainRecords([data.record]);
    if (data.success) {
      ElMessage.success('验证可用');
    } else {
      ElMessage.warning(data.error || '验证未通过');
    }
  } catch (error) {
    console.error('Refresh domain failed', error);
    ElMessage.error(apiErrorMessage(error, '验证失败'));
  } finally {
    if (actionDomainId.value === id) actionDomainId.value = '';
  }
}

async function removeLocalOne(row: DomainRow) {
  if (!canRemoveLocalDomain(row)) return;

  actionDomainId.value = row.id;
  try {
    await endpoints.removeLocalDomain(row.id);
    ElMessage.success('本地记录已移除');
    if (row.id === selectedRootId.value || row.parent_domain_id === selectedRootId.value) {
      resetSubdomainCursorState();
    }
    removeLocalRecords([row.id]);
  } catch (error) {
    console.error('Remove local domain failed', error);
    ElMessage.error(apiErrorMessage(error, '本地移除失败'));
  } finally {
    if (actionDomainId.value === row.id) actionDomainId.value = '';
  }
}

function selectRoot(row: DomainRow) {
  closeDomainMenu();
  if (selectedRootId.value === row.id) return;
  selectedRootId.value = row.id;
  subdomainRows.value = [];
  subdomainsLoaded.value = false;
  resetSubdomainCursorState();
  subdomainQuery.value = {
    pageSize: rootQuery.value.pageSize,
    keyword: ''
  };
  void loadSubdomains();
}

function clearRootSelection(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (
    target?.closest(
      '.el-table__row, .mc-table-icon-action, .mc-floating-menu, .mc-page-actions, .el-overlay, .mc-config-dialog'
    )
  ) {
    return;
  }
  clearRootSelectionDirect();
}

function clearRootSelectionDirect() {
  closeDomainMenu();
  uiStore.clearRootDomain();
  subdomainRows.value = [];
  subdomainsLoaded.value = true;
  resetSubdomainCursorState();
}

function closeDomainMenu() {
  activeDomainMenu.value = null;
}

function openDomainMenu(row: DomainRow, event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = 156;
  const menuHeight = 82;
  activeDomainMenu.value = {
    row,
    x: Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12)),
    y: Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - menuHeight - 12))
  };
}

function runActiveDomainCommand(command: 'refresh' | 'remove-local') {
  const row = activeDomainMenu.value?.row;
  closeDomainMenu();
  if (!row) return;
  if (command === 'refresh') {
    void refreshOne(row.id);
    return;
  }
  void removeLocalOne(row);
}

function closeDomainMenuOnOutsidePointer(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.mc-table-icon-action, .mc-floating-menu')) return;
  closeDomainMenu();
}

function rootRowClassName({ row }: { row: DomainRow }) {
  return row.id === selectedRootId.value ? 'mc-table-row-selected' : '';
}

onMounted(() => {
  domainsActive = true;
  settings.value = getSettingsCache();
  void Promise.all([loadDomains(), loadSettings()]).then(syncDomainStatusPolling);
  document.addEventListener('pointerdown', closeDomainMenuOnOutsidePointer);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onActivated(() => {
  domainsActive = true;
  syncDomainStatusPolling();
});

onDeactivated(() => {
  domainsActive = false;
  stopDomainStatusPolling();
});

onBeforeUnmount(() => {
  domainsActive = false;
  stopDomainStatusPolling();
  document.removeEventListener('pointerdown', closeDomainMenuOnOutsidePointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

watch(hasConfiguringDomain, syncDomainStatusPolling);

usePageRefresh(async () => {
  await Promise.all([refreshDomainData(), loadSettings()]);
  syncDomainStatusPolling();
});
</script>

<template>
  <div class="page mc-management-page" @pointerdown.capture="clearRootSelection">
    <section class="mc-panel mc-management-panel">
      <div class="mc-panel-head mc-panel-head--tools">
        <div class="mc-heading-line">
          <h3>域名状态</h3>
        </div>
        <div class="mc-page-actions mc-panel-head-tools">
          <label class="mc-search mc-search--table mc-panel-head-search">
            <McIcon name="search" :size="18" />
            <input v-model.trim="activeQuery.keyword" type="search" :placeholder="activeSearchPlaceholder" @change="applySearch" />
          </label>
          <div class="mc-panel-page-controls">
            <button class="mc-square" :class="{ disabled: activePage <= 1 }" type="button" :disabled="activePage <= 1" aria-label="上一页" @click="prevPage">
              <McIcon name="left" :size="19" />
            </button>
            <button
              class="mc-square"
              :class="{ disabled: !activeHasMore }"
              type="button"
              :disabled="!activeHasMore"
              aria-label="下一页"
              @click="nextPage"
            >
              <McIcon name="right" :size="19" />
            </button>
          </div>
          <button type="button" class="mc-action-primary" @click="openPrimaryAddDialog">{{ primaryAddLabel }}</button>
        </div>
      </div>
      <div class="mc-domain-layout">
        <div class="mc-domain-main" @pointerdown.self="clearRootSelectionDirect">
          <el-table
            :data="rootDomains"
            table-layout="fixed"
            empty-text=" "
            row-key="id"
            class="mc-domain-table mc-management-table"
            :class="{ 'mc-el-table-empty': rootDomains.length === 0 }"
            :row-class-name="rootRowClassName"
            @row-click="selectRoot"
          >
            <el-table-column label="域名" min-width="210">
              <template #default="{ row }">
                <span class="mc-table-main-text">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="子域数量" width="120">
              <template #default="{ row }">
                <span class="mc-table-text">{{ Number(row.child_count || 0) }} 个</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="130">
              <template #default="{ row }">
                <span class="mc-table-status" :title="row.last_error || ''">
                  <span class="mc-table-status-dot" :class="domainStatus(row).tone"></span>{{ domainStatus(row).text }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="" width="54" fixed="right" align="right">
              <template #default="{ row }">
                <button type="button" class="mc-table-icon-action" :disabled="actionDomainId === row.id" aria-label="域名操作" @click.stop="openDomainMenu(row, $event)"><McIcon name="more" :size="18" /></button>
              </template>
            </el-table-column>
            <template #empty>
              <div v-if="domainsLoaded" class="mc-empty-state mc-empty-state--table-inner">
                <div class="mc-empty-icon"><McIcon name="globe" :size="26" /></div>
                <h2>还没有添加域名</h2>
              </div>
            </template>
          </el-table>
        </div>

        <aside class="mc-subdomain-panel">
          <el-table :data="selectedChildren" table-layout="fixed" empty-text=" " row-key="id" class="mc-subdomain-table mc-management-table" :class="{ 'mc-el-table-empty': selectedChildren.length === 0 }">
            <el-table-column label="前缀" min-width="160">
              <template #default="{ row }">
                <span class="mc-table-main-text" :title="row.name">{{ subdomainPrefixLabel(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="120">
              <template #default="{ row }">
                <span class="mc-table-status" :title="row.last_error || ''">
                  <span class="mc-table-status-dot" :class="domainStatus(row).tone"></span>{{ domainStatus(row).text }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="" width="54" fixed="right" align="right">
              <template #default="{ row }">
                <button type="button" class="mc-table-icon-action" :disabled="actionDomainId === row.id" aria-label="子域名操作" @click.stop="openDomainMenu(row, $event)"><McIcon name="more" :size="18" /></button>
              </template>
            </el-table-column>
            <template #empty>
              <div v-if="selectedRoot && subdomainsLoaded" class="mc-empty-state mc-empty-state--table-inner">
                <div class="mc-empty-icon"><McIcon name="globe" :size="25" /></div>
                <h2>还没有添加子域</h2>
              </div>
            </template>
          </el-table>
        </aside>
      </div>
      <div v-if="activeDomainMenu" class="mc-menu-surface mc-floating-menu" :style="{ left: `${activeDomainMenu.x}px`, top: `${activeDomainMenu.y}px` }" @pointerdown.stop @click.stop>
        <button type="button" class="mc-menu-item" :disabled="actionDomainId === activeDomainMenu.row.id" @click="runActiveDomainCommand('refresh')"><McIcon name="refresh" :size="15" />验证可用</button>
        <button type="button" class="mc-menu-item mc-menu-item--danger" :disabled="actionDomainId === activeDomainMenu.row.id || !canRemoveLocalDomain(activeDomainMenu.row)" @click="runActiveDomainCommand('remove-local')">
          <McIcon name="trash" :size="15" />移除域名
        </button>
      </div>
    </section>

    <el-dialog
      v-model="addDomainDialogOpen"
      title="添加主域名"
      width="520px"
      class="mc-config-dialog mc-domain-dialog"
      destroy-on-close
      align-center
      :show-close="false"
      :close-on-click-modal="false"
    >
      <div class="mc-domain-add-form">
        <el-form-item label="主域名">
          <McCfSelect
            v-model="selectedZoneIds"
            :options="zoneOptions"
            allow-input
            select-only
            multiple
            :disabled="zonesLoading"
            :placeholder="zonesLoading ? '加载中' : '搜索并选择主域名'"
          />
        </el-form-item>
      </div>
      <template #footer>
        <div class="mc-dialog-actions">
          <button type="button" class="mc-action-secondary" :disabled="savingDomain" @click="addDomainDialogOpen = false">取消</button>
          <button type="button" class="mc-action-primary" :disabled="savingDomain || zonesLoading || zones.length === 0" @click="addDomain">
            <span v-if="savingDomain" class="mc-button-spinner"></span>
            {{ savingDomain ? '添加中' : '添加' }}
          </button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="addSubdomainDialogOpen"
      title="添加子域名"
      width="520px"
      class="mc-config-dialog mc-domain-dialog"
      destroy-on-close
      align-center
      :show-close="false"
      :close-on-click-modal="false"
    >
      <div class="mc-domain-add-form">
        <el-form-item label="前缀">
          <el-input v-model="subdomainPrefixes" class="mc-subdomain-prefix-input" type="textarea" :rows="3" placeholder="mail&#10;app&#10;api" />
        </el-form-item>
        <el-form-item label="主域名">
          <el-input :model-value="subdomainParent?.name || ''" disabled />
        </el-form-item>
      </div>
      <template #footer>
        <div class="mc-dialog-actions">
          <button type="button" class="mc-action-secondary" :disabled="savingSubdomain" @click="addSubdomainDialogOpen = false">取消</button>
          <button type="button" class="mc-action-primary" :disabled="savingSubdomain" @click="addSubdomain">
            <span v-if="savingSubdomain" class="mc-button-spinner"></span>
            {{ savingSubdomain ? '添加中' : '添加' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
