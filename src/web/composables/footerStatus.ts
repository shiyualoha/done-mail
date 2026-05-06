import { computed, onActivated, onDeactivated, onUnmounted, ref, watchEffect } from 'vue';

export interface FooterMetric {
  label: string;
  value: string | number;
  unit?: string;
}

const activeOwner = ref<symbol | null>(null);
const metrics = ref<FooterMetric[]>([]);

export const footerMetrics = computed(() =>
  metrics.value.filter((item) => item.value !== '' && item.value !== null && item.value !== undefined)
);

export function useFooterMetrics(source: () => FooterMetric[]) {
  const owner = Symbol('footer-metrics');

  function applyMetrics() {
    activeOwner.value = owner;
    metrics.value = source();
  }

  function clearMetrics() {
    if (activeOwner.value === owner) {
      activeOwner.value = null;
      metrics.value = [];
    }
  }

  watchEffect(() => {
    if (activeOwner.value === owner) {
      metrics.value = source();
    }
  });

  onActivated(applyMetrics);
  onDeactivated(clearMetrics);
  onUnmounted(clearMetrics);
  applyMetrics();
}
