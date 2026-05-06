<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import McIcon from './McIcon.vue';
import { formatBytes, hasRemoteImages, mailBodyText, mailHtmlSrcdoc } from '../utils/mail-view';

export interface MailAttachmentView {
  id: string;
  filename: string;
  mimeType?: string;
  size: number;
  stored: boolean;
}

export interface MailMetaRow {
  label: string;
  value: string;
  visible?: boolean;
}

export interface MailDetailDrawerExpose {
  closePanels: () => void;
}

const props = defineProps<{
  loading: boolean;
  title: string;
  summaryTime: string;
  summaryRecipient: string;
  textBody: string;
  htmlBody: string;
  attachments: MailAttachmentView[];
  metaRows: MailMetaRow[];
  errorTitle?: string;
  errorMessage?: string;
  actionLabel?: string;
  actionBusy?: boolean;
  onFramePointerDown?: () => void;
}>();

const emit = defineEmits<{
  close: [];
  delete: [];
  reply: [];
  share: [];
  download: [item: MailAttachmentView];
}>();

const metaExpanded = ref(false);
const actionOpen = ref(false);
const allowRemoteImages = ref(false);
const metaPopoverRef = ref<HTMLElement | null>(null);
const metaSummaryRef = ref<HTMLElement | null>(null);
const actionRef = ref<HTMLElement | null>(null);
let frameDocument: Document | null = null;
const remoteImagesHidden = computed(() => Boolean(props.htmlBody) && hasRemoteImages(props.htmlBody) && !allowRemoteImages.value);

function visibleMetaRows() {
  return props.metaRows.filter((row) => row.visible !== false);
}

function closePanels() {
  metaExpanded.value = false;
  actionOpen.value = false;
}

function handleFramePointerDown() {
  closePanels();
  props.onFramePointerDown?.();
}

function toggleMeta() {
  metaExpanded.value = !metaExpanded.value;
  actionOpen.value = false;
}

function toggleAction() {
  actionOpen.value = !actionOpen.value;
  metaExpanded.value = false;
}

function closeOnOutsideClick(event: PointerEvent) {
  if (!metaExpanded.value && !actionOpen.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (metaPopoverRef.value?.contains(target) || metaSummaryRef.value?.contains(target)) return;
  if (actionRef.value?.contains(target)) return;
  closePanels();
}

function bindFramePointerDown(event: Event) {
  if (frameDocument) {
    frameDocument.removeEventListener('pointerdown', handleFramePointerDown);
    frameDocument = null;
  }

  const frame = event.target as HTMLIFrameElement | null;
  const doc = frame?.contentDocument || null;
  if (!doc) return;
  frameDocument = doc;
  frameDocument.addEventListener('pointerdown', handleFramePointerDown);
}

function cleanupFrameListener() {
  frameDocument?.removeEventListener('pointerdown', handleFramePointerDown);
  frameDocument = null;
}

watch(() => props.title, closePanels);
watch(() => props.htmlBody, () => {
  allowRemoteImages.value = false;
});

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsideClick);
  cleanupFrameListener();
});

defineExpose<MailDetailDrawerExpose>({ closePanels });
</script>

<template>
  <aside v-loading="loading" class="mc-detail-drawer" aria-label="邮件详情抽屉">
    <button class="mc-drawer-rail" type="button" aria-label="收起邮件详情" title="收起邮件详情" @click="emit('close')"><span></span></button>
    <template v-if="title">
      <div class="mc-detail-title">
        <div class="mc-detail-title-main">
          <h2>{{ title || '无主题' }}</h2>
          <div ref="actionRef" class="mc-detail-menu-wrap">
            <button type="button" class="mc-icon-action mc-detail-menu-trigger" :aria-label="actionLabel || '邮件操作'" :aria-expanded="actionOpen" :disabled="actionBusy" @click="toggleAction">
              <span v-if="actionBusy" class="mc-button-spinner"></span>
              <McIcon v-else name="more" :size="18" />
            </button>
            <div v-if="actionOpen" class="mc-menu-surface mc-detail-menu" @click="closePanels">
              <slot name="actions"></slot>
            </div>
          </div>
          <div class="mc-detail-summary-row">
            <button ref="metaSummaryRef" type="button" class="mc-detail-summary" :aria-expanded="metaExpanded" aria-label="查看邮件信息" @click="toggleMeta">
              <span class="mc-detail-summary-text">
                <time>{{ summaryTime }}</time>
                <span class="mc-summary-recipient">收件人：{{ summaryRecipient }}</span>
              </span>
            </button>
          </div>
          <div v-if="metaExpanded" ref="metaPopoverRef" class="mc-meta mc-meta-popover">
            <div v-for="row in visibleMetaRows()" :key="row.label"><span>{{ row.label }}</span><b>{{ row.value || '-' }}</b></div>
          </div>
        </div>
      </div>

      <div class="mc-detail-drawer-body">
        <div v-if="errorTitle && errorMessage" class="mc-send-error">
          <span>{{ errorTitle }}</span>
          <p>{{ errorMessage }}</p>
        </div>
        <div v-if="remoteImagesHidden" class="mc-remote-images-note">
          <McIcon name="globe" :size="14" />
          <span>已隐藏远程图片</span>
          <button type="button" @click="allowRemoteImages = true">显示图片</button>
        </div>
        <div class="mc-body-box">
          <iframe v-if="htmlBody" class="mail-frame" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin" referrerpolicy="no-referrer" title="邮件正文" :srcdoc="mailHtmlSrcdoc({ htmlBody, allowRemoteImages })" @load="bindFramePointerDown"></iframe>
          <pre v-else>{{ mailBodyText({ textBody, htmlBody }) }}</pre>
        </div>

        <div v-if="attachments.length" class="mc-attach-list mc-attach-list--drawer">
          <button v-for="item in attachments" :key="item.id" type="button" class="mc-attach mc-attach-button" :disabled="!item.stored" @click="emit('download', item)">
            <div class="mc-pdf"><McIcon name="file" :size="22" /></div>
            <div>
              <p>{{ item.filename || '未命名附件' }}</p>
              <span>{{ formatBytes(item.size) }} · {{ item.stored ? '可下载' : '仅保存信息' }}</span>
            </div>
          </button>
        </div>
      </div>
    </template>
    <div v-else class="mc-empty-state mc-empty-state--detail">
      <div class="mc-empty-icon"><McIcon name="file" :size="25" /></div>
      <h2>正在加载邮件</h2>
    </div>
  </aside>
</template>
