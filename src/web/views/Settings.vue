<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage } from '../api/client';
import { endpoints, type CloudflareAccountOption, type CloudflareInspectResult, type CloudflareWorkerOption, type EntryOriginOption } from '../api/endpoints';
import McCfSelect from '../components/McCfSelect.vue';
import McIcon from '../components/McIcon.vue';
import { usePageRefresh } from '../composables/pageRefresh';
import { applySettingsCache, getSettingsCache, loadSettings as loadSettingsQuery, loadEntryOrigins as loadEntryOriginsQuery, type SettingsState } from '../queries/settings';

type InspectStatus = 'idle' | 'checking' | 'ok' | 'error';

const settingsLoaded = ref(false);
const mailboxSaving = ref(false);
const maintenanceSaving = ref(false);
const rateLimitSaving = ref(false);
const cloudflareTokenSaving = ref(false);
const accountOptions = ref<CloudflareAccountOption[]>([]);
const workerOptions = ref<CloudflareWorkerOption[]>([]);
const entryOriginOptions = ref<EntryOriginOption[]>([]);
const cloudflareDialogOpen = ref(false);
const cloudflareOptionsLoading = ref(false);
const entryOriginLoading = ref(false);
const cloudflareProfileSaving = ref(false);
const adminEntrySaving = ref(false);
const cloudflareStatus = ref<InspectStatus>('idle');
const cloudflareErrorMessage = ref('');
const tokenInspectStatus = ref<InspectStatus>('idle');
const tokenInspectMessage = ref('');
let tokenInspectTimer: ReturnType<typeof setTimeout> | undefined;
let tokenInspectRunId = 0;

const form = reactive({
  cloudflare: {
    accountId: '',
    apiToken: '',
    workerName: '',
    apiTokenConfigured: false,
    apiTokenMasked: ''
  },
  resend: {
    enabled: false,
    apiKey: '',
    apiKeyConfigured: false,
    apiKeyMasked: ''
  },
  system: {
    cleanupEnabled: true,
    mailRetentionDays: 30,
    acceptForwardedMail: true,
    adminBaseUrl: '',
    shareBaseUrl: '',
    mailShareTtlHours: 168,
    rateLimit: {
      login: 10,
      publicApi: 10,
      publicShare: 100
    }
  }
});

const tokenDraft = reactive({
  apiToken: '',
  accountId: '',
  workerName: ''
});

const tokenPermissionGroups = [
  { key: 'account_settings', type: 'read' },
  { key: 'workers_scripts', type: 'edit' },
  { key: 'zone', type: 'read' },
  { key: 'dns', type: 'edit' },
  { key: 'zone_settings', type: 'edit' },
  { key: 'email_routing_rule', type: 'edit' },
  { key: 'email_routing_address', type: 'edit' }
];

const tokenCreateUrl = computed(() => {
  const params = new URLSearchParams({
    name: 'DoneMail Cloudflare Management Token',
    accountId: '*',
    zoneId: 'all',
    permissionGroupKeys: JSON.stringify(tokenPermissionGroups)
  });
  return `https://dash.cloudflare.com/profile/api-tokens?${params.toString()}`;
});

const cloudflareConfigured = computed(() => Boolean(form.cloudflare.apiTokenConfigured));
const accountSelectOptions = computed(() => accountOptions.value.map((item) => ({ label: `${item.name} (${item.id})`, value: item.id })));
const workerSelectOptions = computed(() => workerOptions.value.map((item) => ({ label: item.name, value: item.name })));
const entrySelectOptions = computed(() => entryOriginOptions.value.map((item) => ({ label: item.label, value: item.value })));
const adminEntrySelectOptions = computed(() => [{ label: '任意', value: '' }, ...entrySelectOptions.value]);
const shareEntrySelectOptions = computed(() => entrySelectOptions.value);
const tokenOptionsReady = computed(() => Boolean(tokenDraft.apiToken.trim() && accountOptions.value.length));
const tokenSaveLabel = computed(() => {
  if (tokenInspectStatus.value === 'checking') return '检测中';
  if (cloudflareTokenSaving.value) return '保存中';
  return '保存';
});

function clearTokenInspectTimer() {
  if (tokenInspectTimer) {
    clearTimeout(tokenInspectTimer);
    tokenInspectTimer = undefined;
  }
}

function resetTokenDraft() {
  clearTokenInspectTimer();
  tokenInspectRunId += 1;
  tokenDraft.apiToken = '';
  tokenDraft.accountId = '';
  tokenDraft.workerName = '';
  tokenInspectStatus.value = 'idle';
  tokenInspectMessage.value = '';
  seedCloudflareOptions();
}

function openCloudflareDialog() {
  resetTokenDraft();
  cloudflareDialogOpen.value = true;
}

function openTokenPage() {
  window.open(tokenCreateUrl.value, '_blank', 'noopener,noreferrer');
}

function inspectPassed(data: CloudflareInspectResult) {
  return data.errors.length === 0 && data.accounts.length > 0;
}

function summarizeInspectError(data: CloudflareInspectResult) {
  return data.errors[0] || 'Cloudflare 令牌检测失败，请确认至少包含账号读取权限。';
}

function rateLimitCount(value: unknown, fallback: number) {
  const rawValue = value && typeof value === 'object' && 'max' in value ? (value as { max?: unknown }).max : value;
  const count = Number(rawValue ?? fallback);
  return Number.isFinite(count) ? Math.min(Math.max(Math.floor(count), 1), 100000) : fallback;
}

function assignSystemConfig(system: Partial<typeof form.system>) {
  form.system.cleanupEnabled = system.cleanupEnabled === undefined ? true : system.cleanupEnabled === true;
  form.system.mailRetentionDays = Math.max(Math.floor(Number(system.mailRetentionDays ?? 30) || 0), 0);
  form.system.acceptForwardedMail = system.acceptForwardedMail === undefined ? true : system.acceptForwardedMail === true;
  form.system.adminBaseUrl = String(system.adminBaseUrl || '');
  form.system.shareBaseUrl = String(system.shareBaseUrl || '');
  form.system.mailShareTtlHours = Math.min(Math.max(Math.floor(Number(system.mailShareTtlHours ?? 168) || 168), 1), 720);
  form.system.rateLimit = {
    login: rateLimitCount(system.rateLimit?.login, 10),
    publicApi: rateLimitCount(system.rateLimit?.publicApi, 10),
    publicShare: rateLimitCount(system.rateLimit?.publicShare, 100)
  };
}

function applyCloudflareInspectResult(data: CloudflareInspectResult, target: 'saved' | 'draft') {
  accountOptions.value = data.accounts;
  workerOptions.value = data.workers;

  const current = target === 'draft' ? tokenDraft : form.cloudflare;
  if (!current.accountId && data.accountId) {
    current.accountId = data.accountId;
  }
  if (!current.workerName && data.workerName) {
    current.workerName = data.workerName;
  }

  return {
    ok: inspectPassed(data),
    message: summarizeInspectError(data)
  };
}

function seedCloudflareOptions() {
  accountOptions.value = form.cloudflare.accountId ? [{ id: form.cloudflare.accountId, name: form.cloudflare.accountId }] : [];
  workerOptions.value = form.cloudflare.workerName ? [{ id: form.cloudflare.workerName, name: form.cloudflare.workerName }] : [];
}

function seedEntryOriginOptions() {
  entryOriginOptions.value = entryOriginCandidates();
}

function currentEntryOrigin() {
  return window.location.origin.replace(/\/+$/, '');
}

function entryOriginCandidates(options: EntryOriginOption[] = []) {
  const current = currentEntryOrigin();
  const candidates: EntryOriginOption[] = [
    { label: current.replace(/^https?:\/\//, ''), value: current, source: 'current_site' }
  ];
  if (form.system.adminBaseUrl && form.system.adminBaseUrl !== current) {
    candidates.push({ label: form.system.adminBaseUrl.replace(/^https?:\/\//, ''), value: form.system.adminBaseUrl, source: 'custom_domain' });
  }
  if (form.system.shareBaseUrl && form.system.shareBaseUrl !== current) {
    candidates.push({ label: form.system.shareBaseUrl.replace(/^https?:\/\//, ''), value: form.system.shareBaseUrl, source: 'custom_domain' });
  }
  candidates.push(...options);
  const seen = new Set<string>();
  return candidates.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

function applySettings(data: SettingsState) {
  cloudflareStatus.value = 'idle';
  cloudflareErrorMessage.value = '';
  Object.assign(form.cloudflare, data.cloudflare);
  Object.assign(form.resend, data.resend);
  assignSystemConfig(data.system);
  seedCloudflareOptions();
  seedEntryOriginOptions();
  settingsLoaded.value = true;
}

async function loadSettings(force = false) {
  applySettings(await loadSettingsQuery(force));
}

function seedCachedSettings() {
  const cached = getSettingsCache();
  if (cached) applySettings(cached);
}

async function loadEntryOrigins(force = false) {
  if (!form.cloudflare.apiTokenConfigured || !form.cloudflare.accountId || !form.cloudflare.workerName) return;
  if (entryOriginLoading.value) return;
  if (!force && entryOriginOptions.value.length > 1) return;
  entryOriginLoading.value = true;
  try {
    entryOriginOptions.value = entryOriginCandidates(await loadEntryOriginsQuery(force));
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '入口地址读取失败'));
  } finally {
    entryOriginLoading.value = false;
  }
}

function ensureEntryOrigins() {
  void loadEntryOrigins(true);
}

async function saveSettingsPatch(saving: Ref<boolean>, payload: Record<string, unknown>, successMessage: string, fallbackMessage: string, afterSave?: () => void) {
  saving.value = true;
  try {
    const next = applySettingsCache(await endpoints.saveSettings(payload));
    applySettings(next);
    afterSave?.();
    ElMessage.success(successMessage);
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, fallbackMessage));
  } finally {
    saving.value = false;
  }
}

async function saveMailboxCapabilitySettings() {
  if (form.resend.enabled && !form.resend.apiKey.trim() && !form.resend.apiKeyConfigured) {
    ElMessage.error('请填写 Resend Key');
    return;
  }

  await saveSettingsPatch(mailboxSaving, {
    resend: {
      enabled: form.resend.enabled,
      apiKey: form.resend.apiKey
    },
    system: {
      acceptForwardedMail: form.system.acceptForwardedMail
    }
  }, '邮箱配置已保存', '邮箱配置保存失败', () => {
    form.resend.apiKey = '';
  });
}

async function saveMailMaintenanceSettings() {
  await saveSettingsPatch(maintenanceSaving, {
    system: {
      cleanupEnabled: form.system.cleanupEnabled,
      mailRetentionDays: form.system.mailRetentionDays,
      shareBaseUrl: form.system.shareBaseUrl,
      mailShareTtlHours: form.system.mailShareTtlHours
    }
  }, '邮件维护已保存', '邮件维护保存失败');
}

async function saveRateLimitSettings() {
  await saveSettingsPatch(rateLimitSaving, {
    system: {
      rateLimit: {
        login: form.system.rateLimit.login,
        publicApi: form.system.rateLimit.publicApi,
        publicShare: form.system.rateLimit.publicShare
      }
    }
  }, '访问保护已保存', '访问保护保存失败');
}

async function saveCloudflareProfile(showMessage = true) {
  if (!form.cloudflare.apiTokenConfigured) {
    ElMessage.error('请先填写 Cloudflare 接口令牌');
    return;
  }

  if (!form.cloudflare.accountId) {
    ElMessage.error('请选择账号 ID');
    return;
  }

  if (!form.cloudflare.workerName) {
    ElMessage.error('请选择 Worker 名称');
    return;
  }

  cloudflareProfileSaving.value = true;
  try {
    const next = applySettingsCache(await endpoints.saveSettings({
      cloudflare: {
        accountId: form.cloudflare.accountId,
        workerName: form.cloudflare.workerName
      }
    }));
    applySettings(next);
    if (showMessage) ElMessage.success('Cloudflare 配置已保存');
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, 'Cloudflare 配置保存失败'));
  } finally {
    cloudflareProfileSaving.value = false;
  }
}

async function saveAdminEntrySettings() {
  await saveSettingsPatch(adminEntrySaving, {
    system: {
      adminBaseUrl: form.system.adminBaseUrl
    }
  }, '后台入口已保存', '后台入口保存失败');
}

function handleAdminEntryChange() {
  void saveAdminEntrySettings();
}

async function loadCloudflareOptions(force = false) {
  if (!form.cloudflare.apiTokenConfigured) {
    return;
  }
  if (!force && accountOptions.value.length > 1 && workerOptions.value.length > 0) {
    return;
  }

  cloudflareStatus.value = 'checking';
  cloudflareErrorMessage.value = '';
  cloudflareOptionsLoading.value = true;
  try {
    const data = await endpoints.testCloudflare({
      cloudflare: {
        accountId: form.cloudflare.accountId
      }
    });
    const result = applyCloudflareInspectResult(data, 'saved');
    cloudflareStatus.value = result.ok ? 'ok' : 'error';
    cloudflareErrorMessage.value = result.ok ? '' : result.message;
  } catch (error) {
    console.error('Cloudflare options load failed', error);
    cloudflareStatus.value = 'error';
    cloudflareErrorMessage.value = apiErrorMessage(error, 'Cloudflare 令牌检测失败');
  } finally {
    cloudflareOptionsLoading.value = false;
  }
}

function ensureCloudflareOptions() {
  void loadCloudflareOptions();
}

async function handleCloudflareAccountChange() {
  form.cloudflare.workerName = '';
  await loadCloudflareOptions(true);
  if (workerOptions.value.length === 1) {
    form.cloudflare.workerName = workerOptions.value[0].name;
  }
  if (form.cloudflare.workerName) {
    await saveCloudflareProfile(false);
  }
}

function handleCloudflareWorkerChange() {
  void saveCloudflareProfile();
}

function resetCloudflareDialogState() {
  resetTokenDraft();
}

async function inspectTokenDraft() {
  const apiToken = tokenDraft.apiToken.trim();
  if (!apiToken) {
    tokenInspectStatus.value = 'idle';
    tokenInspectMessage.value = '';
    return false;
  }

  const runId = ++tokenInspectRunId;
  tokenInspectStatus.value = 'checking';
  tokenInspectMessage.value = '';

  try {
    const data = await endpoints.testCloudflare({
      cloudflare: {
        apiToken,
        accountId: tokenDraft.accountId
      }
    });
    if (runId !== tokenInspectRunId) return false;
    const result = applyCloudflareInspectResult(data, 'draft');
    tokenInspectStatus.value = result.ok ? 'ok' : 'error';
    tokenInspectMessage.value = result.ok ? '' : result.message;
    return result.ok;
  } catch (error) {
    if (runId !== tokenInspectRunId) return false;
    tokenInspectStatus.value = 'error';
    tokenInspectMessage.value = apiErrorMessage(error, 'Cloudflare 令牌检测失败');
    accountOptions.value = [];
    workerOptions.value = [];
    return false;
  }
}

function scheduleTokenInspect(value: string) {
  if (!cloudflareDialogOpen.value) return;

  clearTokenInspectTimer();
  tokenInspectRunId += 1;
  tokenDraft.accountId = '';
  tokenDraft.workerName = '';
  tokenInspectMessage.value = '';

  if (!value.trim()) {
    tokenInspectStatus.value = 'idle';
    seedCloudflareOptions();
    return;
  }

  tokenInspectStatus.value = 'checking';
  accountOptions.value = [];
  workerOptions.value = [];
  tokenInspectTimer = setTimeout(() => {
    void inspectTokenDraft();
  }, 550);
}

function handleTokenAccountChange() {
  tokenDraft.workerName = '';
  void inspectTokenDraft();
}

async function saveCloudflareToken() {
  if (!tokenDraft.apiToken.trim()) {
    ElMessage.error('请填写 Cloudflare 接口令牌');
    return;
  }

  if (tokenInspectStatus.value === 'checking') {
    ElMessage.error('令牌正在检测，请稍后保存');
    return;
  }

  if (tokenInspectStatus.value === 'idle' && !(await inspectTokenDraft())) {
    ElMessage.error(tokenInspectMessage.value || 'Cloudflare 令牌检测失败');
    return;
  }

  if (tokenInspectStatus.value === 'error') {
    ElMessage.error(tokenInspectMessage.value || 'Cloudflare 令牌检测失败');
    return;
  }

  if (!tokenDraft.accountId) {
    ElMessage.error('请选择账号 ID');
    return;
  }

  if (!tokenDraft.workerName) {
    ElMessage.error('请选择 Worker 名称');
    return;
  }

  cloudflareTokenSaving.value = true;
  try {
    const next = applySettingsCache(await endpoints.saveSettings({
      cloudflare: {
        accountId: tokenDraft.accountId,
        workerName: tokenDraft.workerName,
        apiToken: tokenDraft.apiToken
      },
    }));
    applySettings(next);
    ElMessage.success('Cloudflare 配置已保存');
    cloudflareDialogOpen.value = false;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, 'Cloudflare 配置保存失败'));
  } finally {
    cloudflareTokenSaving.value = false;
  }
}

watch(() => tokenDraft.apiToken, scheduleTokenInspect);

onMounted(() => {
  seedCachedSettings();
  void loadSettings(!settingsLoaded.value);
});
onBeforeUnmount(clearTokenInspectTimer);
usePageRefresh(() => loadSettings(true));
</script>

<template>
  <div class="page">
    <div v-if="settingsLoaded" class="mc-settings-grid">
      <section class="mc-settings-card mc-settings-card--wide">
        <div class="mc-settings-card-head">
          <div class="mc-heading-line">
            <h3>Cloudflare 配置</h3>
            <span v-if="cloudflareStatus === 'ok' || cloudflareStatus === 'error'" class="mc-heading-status-dot" :class="cloudflareStatus"></span>
          </div>
          <button type="button" class="mc-action-primary" @click="openCloudflareDialog">{{ cloudflareConfigured ? '更新' : '填写' }}</button>
        </div>

        <div v-if="cloudflareConfigured" class="mc-config-panel mc-config-panel--card">
          <div class="mc-field-grid mc-field-grid--config">
            <el-form-item label="账号 ID">
              <McCfSelect
                v-model="form.cloudflare.accountId"
                :options="accountSelectOptions"
                allow-input
                :loading="cloudflareOptionsLoading"
                :disabled="cloudflareProfileSaving"
                placeholder="选择或输入账号 ID"
                @change="handleCloudflareAccountChange"
                @open="ensureCloudflareOptions"
              />
            </el-form-item>
            <el-form-item label="Worker 名称">
              <McCfSelect
                v-model="form.cloudflare.workerName"
                :options="workerSelectOptions"
                allow-input
                :loading="cloudflareOptionsLoading"
                :disabled="cloudflareProfileSaving"
                placeholder="选择或输入 Worker 名称"
                @change="handleCloudflareWorkerChange"
                @open="ensureCloudflareOptions"
              />
            </el-form-item>
            <el-form-item label="后台入口">
              <McCfSelect
                v-model="form.system.adminBaseUrl"
                :options="adminEntrySelectOptions"
                select-only
                :loading="entryOriginLoading"
                placeholder="任意"
                :disabled="adminEntrySaving"
                @change="handleAdminEntryChange"
                @open="ensureEntryOrigins"
              />
            </el-form-item>
          </div>
          <div v-if="cloudflareStatus === 'error' && cloudflareErrorMessage" class="mc-config-alert">
            <span>×</span>
            <p>{{ cloudflareErrorMessage }}</p>
          </div>
        </div>

        <div v-else class="mc-empty-state mc-empty-state--panel mc-section-empty mc-empty-state--config">
          <div class="mc-empty-icon"><McIcon name="mail" :size="26" /></div>
          <h2>Cloudflare 尚未配置</h2>
        </div>
      </section>

      <section class="mc-settings-card">
        <div class="mc-settings-card-head">
          <div class="mc-heading-line">
            <h3>邮箱配置</h3>
            <span v-if="form.resend.enabled && form.resend.apiKeyConfigured" class="mc-heading-status-dot ok"></span>
          </div>
          <button type="button" class="mc-action-primary" :disabled="mailboxSaving" @click="saveMailboxCapabilitySettings">
            <span v-if="mailboxSaving" class="mc-button-spinner"></span>
            {{ mailboxSaving ? '保存中' : '保存' }}
          </button>
        </div>
        <div class="mc-settings-card-body mc-settings-card-body--rows">
          <div class="mc-settings-row">
            <div class="mc-settings-switch-field">
              <span>接受转发</span>
              <el-switch v-model="form.system.acceptForwardedMail" />
            </div>
            <div></div>
          </div>
          <div class="mc-settings-row">
            <div class="mc-settings-switch-field">
              <span>发送邮件</span>
              <el-switch v-model="form.resend.enabled" />
            </div>
            <label class="mc-settings-field">
              <span>Resend Key</span>
              <el-input v-model.trim="form.resend.apiKey" type="password" show-password :disabled="!form.resend.enabled" :placeholder="form.resend.apiKeyConfigured ? form.resend.apiKeyMasked : '填写 Resend API Key'" autocomplete="off" />
            </label>
          </div>
        </div>
      </section>

      <section class="mc-settings-card">
        <div class="mc-settings-card-head">
          <h3>邮件维护</h3>
          <button type="button" class="mc-action-primary" :disabled="maintenanceSaving" @click="saveMailMaintenanceSettings">
            <span v-if="maintenanceSaving" class="mc-button-spinner"></span>
            {{ maintenanceSaving ? '保存中' : '保存' }}
          </button>
        </div>
        <div class="mc-settings-card-body mc-settings-card-body--rows">
          <div class="mc-settings-row">
            <div class="mc-settings-switch-field">
              <span>定时清理</span>
              <el-switch v-model="form.system.cleanupEnabled" />
            </div>
            <div class="mc-settings-field mc-settings-number-field">
              <span>邮件保留天数</span>
              <div class="mc-settings-number">
                <el-input-number v-model="form.system.mailRetentionDays" :min="0" :max="3650" />
                <span>天</span>
              </div>
            </div>
          </div>
          <div class="mc-settings-row">
            <div class="mc-settings-field mc-settings-number-field">
              <span>分享有效期</span>
              <div class="mc-settings-number">
                <el-input-number v-model="form.system.mailShareTtlHours" :min="1" :max="720" />
                <span>时</span>
              </div>
            </div>
            <label class="mc-settings-field mc-settings-field--fill">
              <span>分享地址</span>
              <McCfSelect
                v-model="form.system.shareBaseUrl"
                :options="shareEntrySelectOptions"
                select-only
                :loading="entryOriginLoading"
                placeholder="选择 Worker 绑定域名"
                @open="ensureEntryOrigins"
              />
            </label>
          </div>
        </div>
      </section>

      <section class="mc-settings-card mc-settings-card--wide">
        <div class="mc-settings-card-head">
          <h3>访问保护</h3>
          <button type="button" class="mc-action-primary" :disabled="rateLimitSaving" @click="saveRateLimitSettings">
            <span v-if="rateLimitSaving" class="mc-button-spinner"></span>
            {{ rateLimitSaving ? '保存中' : '保存' }}
          </button>
        </div>
        <div class="mc-rate-limit-grid">
          <div class="mc-rate-limit-row">
            <span>登录失败</span>
            <div class="mc-rate-limit-control">
              <el-input-number v-model="form.system.rateLimit.login" :min="1" :max="100000" />
              <span>次/时</span>
            </div>
          </div>
          <div class="mc-rate-limit-row">
            <span>接口鉴权失败</span>
            <div class="mc-rate-limit-control">
              <el-input-number v-model="form.system.rateLimit.publicApi" :min="1" :max="100000" />
              <span>次/时</span>
            </div>
          </div>
          <div class="mc-rate-limit-row">
            <span>分享链接访问</span>
            <div class="mc-rate-limit-control">
              <el-input-number v-model="form.system.rateLimit.publicShare" :min="1" :max="100000" />
              <span>次/时</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="mc-settings-grid mc-settings-grid--skeleton" aria-hidden="true">
      <section class="mc-settings-card mc-settings-card--wide">
        <span class="mc-settings-skeleton-line short"></span>
        <span class="mc-settings-skeleton-line"></span>
        <span class="mc-settings-skeleton-line medium"></span>
      </section>
      <section class="mc-settings-card">
        <span class="mc-settings-skeleton-line short"></span>
        <span class="mc-settings-skeleton-line"></span>
        <span class="mc-settings-skeleton-line medium"></span>
      </section>
      <section class="mc-settings-card">
        <span class="mc-settings-skeleton-line short"></span>
        <span class="mc-settings-skeleton-line"></span>
        <span class="mc-settings-skeleton-line medium"></span>
      </section>
      <section class="mc-settings-card mc-settings-card--wide">
        <span class="mc-settings-skeleton-line short"></span>
        <span class="mc-settings-skeleton-line"></span>
        <span class="mc-settings-skeleton-line medium"></span>
      </section>
    </div>

    <el-dialog
      v-model="cloudflareDialogOpen"
      title="配置接口令牌"
      width="620px"
      class="mc-config-dialog"
      destroy-on-close
      align-center
      :show-close="false"
      @closed="resetCloudflareDialogState"
    >
      <div class="mc-token-guide">
        <div class="mc-token-step"><span>1</span><b>打开授权页</b></div>
        <div class="mc-token-step"><span>2</span><b>复制令牌</b></div>
        <div class="mc-token-step"><span>3</span><b>粘贴保存</b></div>
        <button type="button" class="mc-action-primary mc-token-link" @click="openTokenPage"><McIcon name="right" :size="15" />获取令牌</button>
      </div>

      <div class="mc-config-dialog-body mc-token-form">
        <el-form-item label="接口令牌">
          <el-input
            v-model.trim="tokenDraft.apiToken"
            type="password"
            show-password
            placeholder="从 Cloudflare 粘贴接口令牌"
          />
        </el-form-item>

        <div v-if="tokenInspectMessage" class="mc-config-alert mc-config-alert--dialog">
          <span>×</span>
          <div>
            <p>{{ tokenInspectMessage }}</p>
            <button type="button" class="mc-alert-link" @click="openTokenPage">重新获取令牌</button>
          </div>
        </div>

        <div v-if="tokenOptionsReady" class="mc-token-select-grid">
          <el-form-item label="账号 ID">
            <McCfSelect
              v-model="tokenDraft.accountId"
              :options="accountSelectOptions"
              allow-input
              :disabled="tokenInspectStatus === 'checking'"
              placeholder="选择账号 ID"
              @change="handleTokenAccountChange"
            />
          </el-form-item>
          <el-form-item label="Worker 名称">
            <McCfSelect
              v-model="tokenDraft.workerName"
              :options="workerSelectOptions"
              allow-input
              :disabled="tokenInspectStatus === 'checking' || !tokenDraft.accountId"
              placeholder="选择 Worker 名称"
            />
          </el-form-item>
        </div>
      </div>

      <template #footer>
        <div class="mc-dialog-actions">
          <button type="button" class="mc-action-secondary" :disabled="cloudflareTokenSaving" @click="cloudflareDialogOpen = false">取消</button>
          <button type="button" class="mc-action-primary" :disabled="cloudflareTokenSaving || tokenInspectStatus === 'checking'" @click="saveCloudflareToken">
            <span v-if="cloudflareTokenSaving || tokenInspectStatus === 'checking'" class="mc-button-spinner"></span>
            {{ tokenSaveLabel }}
          </button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>
