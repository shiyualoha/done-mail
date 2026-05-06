<script lang="ts">
let nextSelectId = 0;
let activeSelect: { id: number; close: () => void } | null = null;
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import McIcon from './McIcon.vue';

interface Option {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | string[];
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    loading?: boolean;
    allowInput?: boolean;
    selectOnly?: boolean;
    multiple?: boolean;
  }>(),
  {
    placeholder: '',
    disabled: false,
    loading: false,
    allowInput: false,
    selectOnly: false,
    multiple: false
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]];
  change: [value: string | string[]];
  open: [];
}>();

const selectId = ++nextSelectId;
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const searchText = ref('');
const searching = ref(false);
const menuStyle = ref<Record<string, string>>({});

const modelValues = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : []));
const singleValue = computed(() => (Array.isArray(props.modelValue) ? '' : props.modelValue));
const selectedLabel = computed(() => props.options.find((item) => item.value === singleValue.value)?.label || singleValue.value);
const selectedItems = computed(() =>
  modelValues.value
    .map((value) => ({ value, label: props.options.find((item) => item.value === value)?.label || value }))
    .filter((item) => item.label)
);
const selectedLabels = computed(() => selectedItems.value.map((item) => item.label));
const displayValue = computed(() => (props.multiple ? selectedLabels.value.join('、') : selectedLabel.value));
const inputValue = computed(() => {
  if (!props.selectOnly && !open.value) return singleValue.value;
  if (!props.selectOnly && open.value) return searching.value ? searchText.value : singleValue.value;
  if (props.multiple && !open.value && !searchText.value) {
    return modelValues.value.length ? `已选择 ${modelValues.value.length} 个域名` : '';
  }
  if (open.value) return searching.value ? searchText.value : selectedLabel.value;
  return selectedLabel.value;
});
const filteredOptions = computed(() => {
  if (!searching.value || !searchText.value.trim()) return props.options;

  const keyword = searchText.value.trim().toLowerCase();
  return props.options.filter((item) => item.label.toLowerCase().includes(keyword) || item.value.toLowerCase().includes(keyword));
});

function updateMenuPosition() {
  if (!root.value || !open.value) return;

  const rect = root.value.getBoundingClientRect();
  const menuHeight = menu.value?.offsetHeight || 0;
  const viewportGap = 10;
  const belowTop = props.allowInput ? rect.bottom - 1 : rect.top;
  const aboveTop = props.allowInput ? rect.top - menuHeight + 1 : rect.bottom - menuHeight;
  const top = menuHeight && belowTop + menuHeight > window.innerHeight - viewportGap && aboveTop > viewportGap ? aboveTop : belowTop;

  menuStyle.value = {
    position: 'fixed',
    top: `${Math.max(viewportGap, top)}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`
  };
}

function close() {
  if (activeSelect?.id === selectId) {
    activeSelect = null;
  }
  open.value = false;
  searching.value = false;
  menuStyle.value = {};
  if (props.allowInput) {
    searchText.value = '';
  }
}

function activate() {
  if (activeSelect?.id !== selectId) {
    activeSelect?.close();
  }
  activeSelect = { id: selectId, close };
}

function openMenu() {
  if (props.disabled) return;
  if (props.allowInput && !open.value) {
    searchText.value = '';
    searching.value = false;
  }
  if (!open.value) {
    emit('open');
  }
  activate();
  open.value = true;
  nextTick(updateMenuPosition);
}

function toggle() {
  if (props.disabled) return;
  if (open.value) {
    close();
  } else {
    openMenu();
  }
}

function select(value: string) {
  if (props.multiple) {
    const next = modelValues.value.includes(value) ? modelValues.value.filter((item) => item !== value) : [...modelValues.value, value];
    searchText.value = '';
    emit('update:modelValue', next);
    emit('change', next);
    return;
  }

  if (props.selectOnly) {
    searchText.value = '';
    searching.value = false;
  }
  emit('update:modelValue', value);
  emit('change', value);
  close();
}

function remove(value: string) {
  if (!props.multiple) return;
  const next = modelValues.value.filter((item) => item !== value);
  emit('update:modelValue', next);
  emit('change', next);
}

function updateInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  if (props.allowInput) {
    searchText.value = value;
    searching.value = true;
    activate();
    open.value = true;
    nextTick(updateMenuPosition);
  }

  if (props.selectOnly) {
    if (!props.multiple && singleValue.value && value !== selectedLabel.value) {
      emit('update:modelValue', '');
      emit('change', '');
    }
    return;
  }

  emit('update:modelValue', value);
}

function commitInput(event: Event) {
  if (props.selectOnly) return;
  emit('change', (event.target as HTMLInputElement).value);
}

function isSelected(value: string) {
  return modelValues.value.includes(value);
}

function handleDocumentClick(event: PointerEvent) {
  const target = event.target as Node;
  if (!root.value?.contains(target) && !menu.value?.contains(target)) {
    close();
  }
}

function handleViewportChange() {
  updateMenuPosition();
}

watch(
  () => [props.modelValue, props.options],
  () => {
    if (props.selectOnly && !open.value) {
      searchText.value = '';
      searching.value = false;
    }
    if (open.value) {
      nextTick(updateMenuPosition);
    }
  },
  { immediate: true }
);

onMounted(() => document.addEventListener('pointerdown', handleDocumentClick));
onMounted(() => {
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});
onBeforeUnmount(() => {
  if (activeSelect?.id === selectId) {
    activeSelect = null;
  }
  document.removeEventListener('pointerdown', handleDocumentClick);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<template>
  <div ref="root" class="mc-cf-select" :class="{ open, disabled, 'allow-input': allowInput, 'select-only': selectOnly, editable: allowInput && !selectOnly, multiple }" @pointerdown.stop>
    <button v-if="!allowInput" type="button" class="mc-cf-select-trigger" :disabled="disabled" @click="toggle">
      <span class="mc-cf-select-value" :class="{ muted: !displayValue }">{{ displayValue || placeholder }}</span>
      <span class="mc-cf-select-arrow"></span>
    </button>

    <div v-else class="mc-cf-select-trigger" @click="openMenu">
      <div v-if="multiple && selectOnly && modelValues.length && !open" class="mc-cf-select-tags">
        <span v-for="item in selectedItems" :key="item.value" class="mc-cf-select-tag" :title="item.label">
          <span>{{ item.label }}</span>
          <button type="button" class="mc-cf-select-tag-close" :aria-label="`移除 ${item.label}`" @pointerdown.stop @click.stop="remove(item.value)"></button>
        </span>
      </div>
      <input v-else :value="inputValue" :placeholder="placeholder" :disabled="disabled" @input="updateInput" @change="commitInput" @focus="openMenu" />
      <button type="button" class="mc-cf-select-arrow" :disabled="disabled" @click.stop="toggle"></button>
    </div>

    <Teleport to="body">
      <div v-if="open" ref="menu" class="mc-cf-select-menu mc-cf-select-menu--floating" :class="{ 'allow-input': allowInput }" :style="menuStyle" @pointerdown.stop>
        <div class="mc-cf-select-scroll">
          <div v-if="loading" class="mc-cf-select-loading">
            <span class="mc-button-spinner"></span>
            加载中
          </div>
          <div v-else-if="!filteredOptions.length" class="mc-cf-select-empty">暂无可选项</div>
          <template v-else>
            <button v-for="item in filteredOptions" :key="item.value" type="button" class="mc-cf-select-option" :class="{ selected: isSelected(item.value) }" @click="select(item.value)">
              <span>{{ item.label }}</span>
              <McIcon v-if="isSelected(item.value)" name="check" class="mc-cf-select-check" :size="24" :stroke-width="2.35" />
            </button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
