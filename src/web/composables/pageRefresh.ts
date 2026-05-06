import { readonly, ref, onActivated, onBeforeUnmount, onDeactivated, onMounted, shallowRef } from 'vue';

type PageRefreshHandler = () => void | Promise<void>;

const currentRefreshHandler = shallowRef<PageRefreshHandler | null>(null);
const refreshing = ref(false);

export const pageRefreshing = readonly(refreshing);

export async function runPageRefresh() {
  if (refreshing.value) return;
  const handler = currentRefreshHandler.value;
  if (!handler) return;
  refreshing.value = true;
  try {
    await handler();
  } finally {
    refreshing.value = false;
  }
}

export function usePageRefresh(handler: PageRefreshHandler) {
  function activate() {
    currentRefreshHandler.value = handler;
  }

  function deactivate() {
    if (currentRefreshHandler.value === handler) {
      currentRefreshHandler.value = null;
    }
  }

  onMounted(activate);
  onActivated(activate);
  onDeactivated(deactivate);
  onBeforeUnmount(deactivate);
}
