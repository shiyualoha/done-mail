<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { apiErrorMessage } from '../api/client';
import { endpoints } from '../api/endpoints';
import McIcon from './McIcon.vue';

const MailBodyEditor = defineAsyncComponent(() => import('./MailBodyEditor.vue'));

interface MailBodyEditorExpose {
  focus: () => void;
  getText: () => string;
}

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

interface AttachmentDraft {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string;
}

const props = defineProps<{
  modelValue: boolean;
  draft?: ComposeDraft | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  sent: [];
}>();

const editorRef = shallowRef<MailBodyEditorExpose | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const sending = ref(false);
const editorReady = ref(false);
const attachments = ref<AttachmentDraft[]>([]);
const form = reactive({
  from: '',
  fromName: '',
  to: '',
  toName: '',
  subject: '',
  html: '',
  inReplyTo: '',
  references: ''
});

const totalAttachmentSize = computed(() => attachments.value.reduce((sum, item) => sum + item.size, 0));

function close() {
  emit('update:modelValue', false);
}

function resetFromDraft() {
  const draft = props.draft || {};
  form.from = draft.from || '';
  form.fromName = draft.fromName || '';
  form.to = draft.to || '';
  form.toName = draft.toName || '';
  form.subject = draft.subject || '';
  form.html = draft.html || '';
  form.inReplyTo = draft.inReplyTo || '';
  form.references = draft.references || draft.inReplyTo || '';
  attachments.value = [];
  editorReady.value = false;
}

function editorText() {
  return editorRef.value?.getText().replace(/\s+/g, ' ').trim() || '';
}

function handleEditorReady() {
  editorReady.value = true;
  editorRef.value?.focus();
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('读取附件失败'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

async function addFiles(files: FileList | null) {
  if (!files || files.length === 0) return;
  const next = [...attachments.value];
  for (const file of Array.from(files)) {
    if (next.length >= 10) {
      ElMessage.error('单封邮件最多 10 个附件');
      break;
    }
    if (file.size > 8 * 1024 * 1024) {
      ElMessage.error(`单个附件不能超过 8MB：${file.name}`);
      continue;
    }
    const total = next.reduce((sum, item) => sum + item.size, 0) + file.size;
    if (total > 20 * 1024 * 1024) {
      ElMessage.error('附件总大小不能超过 20MB');
      break;
    }
    next.push({
      id: crypto.randomUUID(),
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      content: await fileToBase64(file)
    });
  }
  attachments.value = next;
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id);
}

async function send() {
  if (sending.value) return;
  const html = form.html.trim();
  const text = editorText();

  if (!form.from.trim()) {
    ElMessage.error('请填写发件邮箱');
    return;
  }
  if (!form.to.trim()) {
    ElMessage.error('请填写收件邮箱');
    return;
  }
  if (!form.subject.trim()) {
    ElMessage.error('请填写主题');
    return;
  }
  if (!text && !html) {
    ElMessage.error('请填写正文');
    return;
  }

  sending.value = true;
  try {
    await endpoints.sendMail({
      from: form.from,
      fromName: form.fromName,
      to: form.to,
      toName: form.toName,
      subject: form.subject,
      text,
      html,
      inReplyTo: form.inReplyTo,
      references: form.references,
      attachments: attachments.value.map((item) => ({
        filename: item.filename,
        mimeType: item.mimeType,
        content: item.content
      }))
    });
    ElMessage.success('邮件发送成功');
    emit('sent');
    close();
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '邮件发送失败'));
  } finally {
    sending.value = false;
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    resetFromDraft();
    await nextTick();
    editorRef.value?.focus();
  },
  { immediate: true }
);
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="写邮件"
    width="760px"
    class="mc-config-dialog mc-compose-dialog"
    destroy-on-close
    align-center
    :show-close="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="mc-compose-form">
      <section class="mc-compose-address-panel" aria-label="邮件地址">
        <div class="mc-compose-address-row">
          <span class="mc-compose-address-label">发件人</span>
          <el-input v-model.trim="form.from" class="mc-compose-address-main" placeholder="name@example.com" />
          <el-input v-model.trim="form.fromName" class="mc-compose-address-name" placeholder="发件名（可选）" />
        </div>
        <div class="mc-compose-address-row">
          <span class="mc-compose-address-label">收件人</span>
          <el-input v-model.trim="form.to" class="mc-compose-address-main" placeholder="to@example.com" />
          <el-input v-model.trim="form.toName" class="mc-compose-address-name" placeholder="收件名（可选）" />
        </div>
        <div class="mc-compose-address-row subject">
          <span class="mc-compose-address-label">主题</span>
          <el-input v-model.trim="form.subject" placeholder="输入邮件主题" />
        </div>
      </section>
      <div class="mc-compose-editor">
        <div v-if="!editorReady" class="mc-compose-editor-loading">正在加载编辑器</div>
        <MailBodyEditor
          ref="editorRef"
          v-model="form.html"
          @ready="handleEditorReady"
        />
      </div>
      <div class="mc-compose-attachments">
        <button type="button" class="mc-action-secondary mc-action-compact" @click="fileInputRef?.click()">
          <McIcon name="file" :size="15" />添加附件
        </button>
        <input ref="fileInputRef" type="file" multiple class="mc-compose-file-input" @change="addFiles(($event.target as HTMLInputElement).files)" />
        <span>{{ attachments.length }} 个，{{ formatBytes(totalAttachmentSize) }}</span>
      </div>
      <div v-if="attachments.length" class="mc-compose-attachment-list">
        <div v-for="item in attachments" :key="item.id" class="mc-compose-attachment">
          <span>{{ item.filename }}</span>
          <b>{{ formatBytes(item.size) }}</b>
          <button type="button" aria-label="移除附件" @click="removeAttachment(item.id)">×</button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mc-dialog-actions">
        <button type="button" class="mc-action-secondary" :disabled="sending" @click="close">取消</button>
        <button type="button" class="mc-action-primary" :disabled="sending" @click="send">
          <span v-if="sending" class="mc-button-spinner"></span>
          {{ sending ? '发送中' : '发送' }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>
