<script setup lang="ts">
import Squire from 'squire-rte';
import { ElMessage } from 'element-plus/es/components/message/index.mjs';
import { onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import McIcon from './McIcon.vue';

type SquireEditor = InstanceType<typeof Squire>;
type EditorCommand = 'bold' | 'italic' | 'underline' | 'bullet' | 'numbered' | 'quote' | 'clear' | 'link';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
  }>(),
  {
    placeholder: '写邮件正文'
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  ready: [];
}>();

const editorHost = ref<HTMLElement | null>(null);
const editorRef = shallowRef<SquireEditor | null>(null);
const isEmpty = ref(true);
const active = reactive({
  bold: false,
  italic: false,
  underline: false,
  bullet: false,
  numbered: false,
  quote: false,
  link: false
});

const droppedTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'SVG',
  'MATH',
  'IMG',
  'VIDEO',
  'AUDIO',
  'SOURCE',
  'TRACK',
  'CANVAS'
]);
const allowedTags = new Set([
  'A',
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'BR',
  'DIV',
  'P',
  'SPAN',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'PRE',
  'CODE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR'
]);

function sanitizeHref(value: string) {
  const href = value.trim();
  if (!href) return '';
  const compact = href.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (/^(javascript|vbscript|data):/.test(compact)) return '';
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  return '';
}

function normalizeUserLink(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `mailto:${raw}`;
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return sanitizeHref(raw);
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(raw)) return `https://${raw}`;
  return '';
}

function cleanAttributes(element: HTMLElement) {
  const tag = element.tagName.toUpperCase();
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'style' || name === 'class' || name.startsWith('data-')) {
      element.removeAttribute(attr.name);
      continue;
    }
    if (tag === 'A' && name === 'href') {
      const href = sanitizeHref(attr.value);
      if (href) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      } else {
        element.removeAttribute(attr.name);
      }
      continue;
    }
    if (tag === 'A' && (name === 'target' || name === 'rel')) continue;
    if (tag === 'OL' && name === 'start' && /^\d{1,3}$/.test(attr.value)) continue;
    if (name === 'dir' && /^(ltr|rtl|auto)$/i.test(attr.value)) continue;
    element.removeAttribute(attr.name);
  }
}

function scrubTree(root: { childNodes: NodeListOf<ChildNode> }) {
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      continue;
    }

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();
    if (droppedTags.has(tag)) {
      element.remove();
      continue;
    }

    scrubTree(element);
    if (!allowedTags.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    cleanAttributes(element);
  }
}

function sanitizeToDOMFragment(html: string, editor: SquireEditor) {
  const doc = editor.getRoot().ownerDocument;
  const template = doc.createElement('template');
  template.innerHTML = html;
  const fragment = doc.createDocumentFragment();
  fragment.append(...Array.from(template.content.childNodes));
  scrubTree(fragment);
  return fragment;
}

function currentText() {
  return editorRef.value?.getRoot().innerText.replace(/\u200B/g, '').trim() || '';
}

function currentHtml() {
  const editor = editorRef.value;
  if (!editor || !currentText()) return '';
  return editor.getHTML().trim();
}

function syncModel() {
  const html = currentHtml();
  isEmpty.value = !html;
  emit('update:modelValue', html);
}

function updateActiveState() {
  const editor = editorRef.value;
  if (!editor) return;
  const path = editor.getPath();
  active.bold = editor.hasFormat('B');
  active.italic = editor.hasFormat('I');
  active.underline = editor.hasFormat('U');
  active.link = editor.hasFormat('A');
  active.bullet = /(^|>)UL(>|$)/.test(path);
  active.numbered = /(^|>)OL(>|$)/.test(path);
  active.quote = /(^|>)BLOCKQUOTE(>|$)/.test(path);
  isEmpty.value = !currentHtml();
}

function afterCommand() {
  syncModel();
  updateActiveState();
}

function toggleInline(format: 'bold' | 'italic' | 'underline') {
  const editor = editorRef.value;
  if (!editor) return;
  if (format === 'bold') (active.bold ? editor.removeBold() : editor.bold());
  if (format === 'italic') (active.italic ? editor.removeItalic() : editor.italic());
  if (format === 'underline') (active.underline ? editor.removeUnderline() : editor.underline());
  afterCommand();
}

function toggleList(type: 'bullet' | 'numbered') {
  const editor = editorRef.value;
  if (!editor) return;
  if (type === 'bullet') (active.bullet ? editor.removeList() : editor.makeUnorderedList());
  if (type === 'numbered') (active.numbered ? editor.removeList() : editor.makeOrderedList());
  afterCommand();
}

function toggleQuote() {
  const editor = editorRef.value;
  if (!editor) return;
  active.quote ? editor.decreaseQuoteLevel() : editor.increaseQuoteLevel();
  afterCommand();
}

function editLink() {
  const editor = editorRef.value;
  if (!editor) return;
  if (active.link) {
    editor.removeLink();
    afterCommand();
    return;
  }

  const rawHref = window.prompt('链接地址', editor.getSelectedText().trim());
  if (rawHref === null) return;
  const href = normalizeUserLink(rawHref);
  if (!href) {
    ElMessage.error('链接地址无效');
    return;
  }
  editor.makeLink(href, { target: '_blank', rel: 'noopener noreferrer' });
  afterCommand();
}

function runCommand(command: EditorCommand) {
  if (command === 'bold' || command === 'italic' || command === 'underline') toggleInline(command);
  if (command === 'bullet' || command === 'numbered') toggleList(command);
  if (command === 'quote') toggleQuote();
  if (command === 'clear') {
    editorRef.value?.removeAllFormatting();
    afterCommand();
  }
  if (command === 'link') editLink();
}

function focus() {
  editorRef.value?.focus();
}

function getText() {
  return currentText();
}

onMounted(() => {
  if (!editorHost.value) return;
  const editor = new Squire(editorHost.value, {
    blockTag: 'DIV',
    addLinks: true,
    sanitizeToDOMFragment,
    didError(error) {
      console.error(error);
      ElMessage.error('编辑器操作失败');
    }
  });

  editor.addEventListener('input', syncModel);
  editor.addEventListener('pathChange', updateActiveState);
  editor.addEventListener('select', updateActiveState);
  editor.addEventListener('cursor', updateActiveState);
  editor.addEventListener('pasteImage', (event) => {
    event.preventDefault();
    ElMessage.error('正文图片请作为附件发送');
  });
  editor.setHTML(props.modelValue || '');
  editorRef.value = editor;
  updateActiveState();
  emit('ready');
});

onBeforeUnmount(() => {
  editorRef.value?.destroy();
  editorRef.value = null;
});

watch(
  () => props.modelValue,
  (value) => {
    const editor = editorRef.value;
    if (!editor || (value || '') === currentHtml()) return;
    editor.setHTML(value || '');
    updateActiveState();
  }
);

defineExpose({ focus, getText });
</script>

<template>
  <div class="mc-mail-body-editor">
    <div class="mc-mail-body-toolbar" role="toolbar" aria-label="正文工具栏">
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.bold }" title="加粗" aria-label="加粗" @mousedown.prevent="runCommand('bold')">
        <span class="mc-mail-body-tool-mark mc-mail-body-tool-mark--bold">B</span>
      </button>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.italic }" title="斜体" aria-label="斜体" @mousedown.prevent="runCommand('italic')">
        <span class="mc-mail-body-tool-mark mc-mail-body-tool-mark--italic">I</span>
      </button>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.underline }" title="下划线" aria-label="下划线" @mousedown.prevent="runCommand('underline')">
        <span class="mc-mail-body-tool-mark mc-mail-body-tool-mark--underline">U</span>
      </button>
      <span class="mc-mail-body-tool-divider"></span>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.link }" title="链接" aria-label="链接" @mousedown.prevent="runCommand('link')">
        <McIcon name="link" :size="15" />
      </button>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.bullet }" title="无序列表" aria-label="无序列表" @mousedown.prevent="runCommand('bullet')">
        <span class="mc-mail-body-tool-mark">•</span>
      </button>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.numbered }" title="有序列表" aria-label="有序列表" @mousedown.prevent="runCommand('numbered')">
        <span class="mc-mail-body-tool-mark mc-mail-body-tool-mark--numbered">1.</span>
      </button>
      <button type="button" class="mc-mail-body-tool" :class="{ 'is-active': active.quote }" title="引用" aria-label="引用" @mousedown.prevent="runCommand('quote')">
        <span class="mc-mail-body-tool-mark">“</span>
      </button>
      <span class="mc-mail-body-tool-divider"></span>
      <button type="button" class="mc-mail-body-tool" title="清除格式" aria-label="清除格式" @mousedown.prevent="runCommand('clear')">
        <span class="mc-mail-body-tool-mark">Tx</span>
      </button>
    </div>
    <div class="mc-mail-body-host-wrap">
      <div v-if="isEmpty" class="mc-mail-body-placeholder">{{ placeholder }}</div>
      <div ref="editorHost" class="mc-mail-body-host" aria-label="邮件正文"></div>
    </div>
  </div>
</template>
