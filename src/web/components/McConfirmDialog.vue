<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { confirmState, resolveConfirm } from '../composables/confirmDialog';

const confirmButton = ref<HTMLButtonElement | null>(null);
const confirmClass = computed(() => (confirmState.intent === 'danger' ? 'mc-action-danger' : 'mc-action-primary'));

watch(
  () => confirmState.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    confirmButton.value?.focus();
  }
);

function cancel() {
  resolveConfirm(false);
}

function confirm() {
  resolveConfirm(true);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="mc-confirm">
      <div v-if="confirmState.open" class="mc-confirm-layer" role="presentation" @click.self="cancel">
        <section class="mc-confirm-dialog" role="dialog" aria-modal="true" :aria-labelledby="'mc-confirm-title'" @keydown.esc="cancel">
          <header class="mc-confirm-header">
            <span class="mc-confirm-mark" :class="`mc-confirm-mark--${confirmState.intent}`"></span>
            <h2 id="mc-confirm-title">{{ confirmState.title }}</h2>
          </header>
          <div class="mc-confirm-body">
            <p>{{ confirmState.message }}</p>
          </div>
          <footer class="mc-confirm-actions">
            <button type="button" class="mc-action-secondary" @click="cancel">{{ confirmState.cancelText }}</button>
            <button ref="confirmButton" type="button" :class="confirmClass" @click="confirm">{{ confirmState.confirmText }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
