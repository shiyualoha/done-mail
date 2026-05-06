<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { autocompletion, closeCompletion, CompletionContext, startCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { RangeSetBuilder } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, ViewPlugin, ViewUpdate } from '@codemirror/view';

interface TemplateVariable {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    variables: TemplateVariable[];
    language?: 'json' | 'text';
    placeholder?: string;
  }>(),
  {
    language: 'json',
    placeholder: ''
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'format-error', message: string): void;
}>();

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;
let externalUpdate = false;

const variableDecoration = Decoration.mark({ class: 'mc-cm-variable' });
const placeholderTheme = EditorView.theme({
  '&.cm-editor.cm-focused': { outline: 'none' },
  '.cm-placeholder': {
    color: 'var(--dm-control-muted)'
  }
});

function variableCompletion(context: CompletionContext) {
  const before = context.matchBefore(/\{\{[A-Za-z0-9_]*$/);
  if (!before) return null;
  const keyword = before.text.slice(2).toLowerCase();
  const options = props.variables
    .filter((item) => {
      if (!keyword) return true;
      return item.label.toLowerCase().includes(keyword) || item.value.toLowerCase().includes(keyword);
    })
    .map((item) => ({
      label: item.label,
      detail: item.value,
      type: 'variable',
      apply: item.value
    }));
  if (options.length === 0) return null;
  return {
    from: before.from,
    options,
    filter: false,
    validFor: /^\{\{[A-Za-z0-9_]*$/
  };
}

function variablePlugin() {
  return ViewPlugin.fromClass(
    class {
      decorations;

      constructor(editorView: EditorView) {
        this.decorations = buildVariableDecorations(editorView);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildVariableDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations
    }
  );
}

function buildVariableDecorations(editorView: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const pattern = /\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g;
  const variableValues = new Set(props.variables.map((item) => item.value));
  for (const { from, to } of editorView.visibleRanges) {
    const text = editorView.state.doc.sliceString(from, to);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const token = match[0];
      if (variableValues.has(token)) {
        builder.add(from + match.index, from + match.index + token.length, variableDecoration);
      }
    }
  }
  return builder.finish();
}

function editorExtensions(): Extension[] {
  return [
    history(),
    props.language === 'json' ? json() : [],
    variablePlugin(),
    autocompletion({
      override: [variableCompletion],
      activateOnTyping: true,
      activateOnTypingDelay: 0,
      icons: false
    }),
    keymap.of([
      indentWithTab,
      {
        key: 'Mod-Enter',
        run: () => {
          formatJson();
          return true;
        }
      },
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.lineWrapping,
    placeholderTheme,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || externalUpdate) return;
      emit('update:modelValue', update.state.doc.toString());
    })
  ];
}

function formatJson() {
  if (!view) return;
  const raw = view.state.doc.toString();
  try {
    const formatted = JSON.stringify(JSON.parse(raw), null, 2);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted }
    });
    closeCompletion(view);
  } catch {
    emit('format-error', 'JSON 格式化失败，请确认 Body 是合法 JSON，变量需要放在字符串里');
  }
}

function focus() {
  view?.focus();
}

function triggerCompletion() {
  if (view) startCompletion(view);
}

defineExpose({ formatJson, focus, triggerCompletion });

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    doc: props.modelValue,
    extensions: editorExtensions(),
    parent: host.value
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(
  () => props.modelValue,
  (value) => {
    if (!view || value === view.state.doc.toString()) return;
    externalUpdate = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
    externalUpdate = false;
  }
);
</script>

<template>
  <div class="mc-template-code-editor">
    <div ref="host"></div>
  </div>
</template>
