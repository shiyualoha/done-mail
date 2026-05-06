<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

interface TemplateVariable {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    variables: TemplateVariable[];
    placeholder?: string;
  }>(),
  {
    placeholder: ''
  }
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const focused = ref(false);
const menuOpen = ref(false);
const activeIndex = ref(0);
const scrollTop = ref(0);
const scrollLeft = ref(0);
const menuStyle = ref<Record<string, string>>({});

const variableValues = computed(() => new Set(props.variables.map((item) => item.value)));
const highlightedParts = computed(() => splitTemplateText(props.modelValue || ''));

function splitTemplateText(value: string) {
  const parts: Array<{ text: string; variable: boolean }> = [];
  const pattern = /\{\{[A-Za-z][A-Za-z0-9_]*\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) parts.push({ text: value.slice(lastIndex, match.index), variable: false });
    parts.push({ text: match[0], variable: variableValues.value.has(match[0]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) parts.push({ text: value.slice(lastIndex), variable: false });
  return parts.length ? parts : [{ text: '', variable: false }];
}

function updateValue(value: string) {
  emit('update:modelValue', value);
  const cursor = inputRef.value?.selectionStart ?? value.length;
  const beforeCursor = value.slice(0, cursor);
  const openIndex = beforeCursor.lastIndexOf('{{');
  const closeIndex = beforeCursor.lastIndexOf('}}');
  const shouldOpen = focused.value && openIndex > closeIndex;
  menuOpen.value = shouldOpen;
  activeIndex.value = 0;
  if (shouldOpen) {
    nextTick(updateMenuPosition);
  } else {
    stopMenuTracking();
  }
}

function handleInput(event: Event) {
  updateValue((event.target as HTMLInputElement | HTMLTextAreaElement).value);
}

function handleScroll(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  scrollTop.value = target.scrollTop;
  scrollLeft.value = target.scrollLeft;
}

function closeMenuSoon() {
  window.setTimeout(() => {
    closeMenu();
    focused.value = false;
  }, 120);
}

function closeMenu() {
  menuOpen.value = false;
  stopMenuTracking();
}

function updateMenuPosition() {
  const field = inputRef.value;
  if (!field || !menuOpen.value) return;
  const rect = field.getBoundingClientRect();
  const gap = 6;
  const viewportGap = 8;
  const maxWidth = Math.max(160, window.innerWidth - viewportGap * 2);
  const width = Math.min(maxWidth, Math.max(rect.width, 220));
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportGap;
  const spaceAbove = rect.top - gap - viewportGap;
  const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(360, Math.max(120, openAbove ? spaceAbove : spaceBelow));
  const top = openAbove ? Math.max(viewportGap, rect.top - gap - maxHeight) : Math.min(rect.bottom + gap, window.innerHeight - viewportGap);
  const left = Math.max(viewportGap, Math.min(rect.left, window.innerWidth - width - viewportGap));
  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`
  };
  startMenuTracking();
}

function startMenuTracking() {
  window.addEventListener('resize', updateMenuPosition);
  window.addEventListener('scroll', updateMenuPosition, true);
}

function stopMenuTracking() {
  window.removeEventListener('resize', updateMenuPosition);
  window.removeEventListener('scroll', updateMenuPosition, true);
}

function insertVariable(variable: string) {
  const field = inputRef.value;
  if (!field) return;
  const value = props.modelValue || '';
  const cursor = field.selectionStart ?? value.length;
  const beforeCursor = value.slice(0, cursor);
  const openIndex = beforeCursor.lastIndexOf('{{');
  const closeIndex = beforeCursor.lastIndexOf('}}');
  const replaceFrom = openIndex > closeIndex ? openIndex : cursor;
  const nextValue = `${value.slice(0, replaceFrom)}${variable}${value.slice(cursor)}`;
  emit('update:modelValue', nextValue);
  closeMenu();
  nextTick(() => {
    field.focus();
    const nextCursor = replaceFrom + variable.length;
    field.setSelectionRange(nextCursor, nextCursor);
  });
}

function moveActive(offset: number) {
  if (!menuOpen.value) return;
  activeIndex.value = (activeIndex.value + offset + props.variables.length) % props.variables.length;
}

function handleKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || props.variables.length === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    const variable = props.variables[activeIndex.value];
    if (variable) insertVariable(variable.value);
  } else if (event.key === 'Escape') {
    closeMenu();
  }
}

onBeforeUnmount(stopMenuTracking);
</script>

<template>
  <div class="mc-template-field" :class="{ focused }">
    <div class="mc-template-highlight" :style="{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }" aria-hidden="true">
      <template v-for="(part, index) in highlightedParts" :key="index">
        <mark v-if="part.variable">{{ part.text }}</mark>
        <span v-else>{{ part.text }}</span>
      </template>
    </div>
    <input
      ref="inputRef"
      class="mc-template-control"
      :value="modelValue"
      :placeholder="placeholder"
      spellcheck="false"
      @blur="closeMenuSoon"
      @focus="focused = true"
      @input="handleInput"
      @keydown="handleKeydown"
      @scroll="handleScroll"
    />
    <Teleport to="body">
      <div v-if="menuOpen" class="mc-menu-surface mc-template-menu" :style="menuStyle" @pointerdown.prevent>
        <button v-for="(item, index) in variables" :key="item.value" type="button" :class="{ active: index === activeIndex }" @click="insertVariable(item.value)">
          <span>{{ item.label }}</span>
          <small>{{ item.value }}</small>
        </button>
      </div>
    </Teleport>
  </div>
</template>
