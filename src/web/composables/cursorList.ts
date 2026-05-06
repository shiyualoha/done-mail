import { computed, ref, type Ref } from 'vue';

interface CursorPageInfo {
  next_cursor?: unknown;
  has_more?: unknown;
}

export function useCursorList<T extends { id: string }>() {
  const rows = ref<T[]>([]) as Ref<T[]>;
  const checkedIds = ref<string[]>([]);
  const cursorStack = ref<string[]>(['']);
  const nextCursor = ref('');
  const hasMore = ref(false);
  const currentPage = ref(1);
  let rowPointerStart: { x: number; y: number } | null = null;

  const hasRows = computed(() => rows.value.length > 0);
  const checkedIdSet = computed(() => new Set(checkedIds.value));
  const checkedCount = computed(() => checkedIds.value.length);
  const allPageChecked = computed(() => rows.value.length > 0 && rows.value.every((row) => checkedIdSet.value.has(row.id)));
  const pageCheckIndeterminate = computed(() => checkedCount.value > 0 && !allPageChecked.value);

  function currentCursor() {
    return cursorStack.value[currentPage.value - 1] || '';
  }

  function pruneChecked() {
    const currentIds = new Set(rows.value.map((row) => row.id));
    checkedIds.value = checkedIds.value.filter((id) => currentIds.has(id));
  }

  function setPageData(items: T[], info: CursorPageInfo) {
    rows.value = items;
    nextCursor.value = String(info.next_cursor || '');
    hasMore.value = Boolean(info.has_more);
    pruneChecked();
  }

  function removeRows(ids: string[]) {
    const deleted = new Set(ids);
    rows.value = rows.value.filter((row) => !deleted.has(row.id));
    pruneChecked();
  }

  function clearChecked() {
    checkedIds.value = [];
  }

  function togglePageChecked(checked: boolean) {
    checkedIds.value = checked ? rows.value.map((row) => row.id) : [];
  }

  function toggleRowChecked(id: string, checked: boolean) {
    checkedIds.value = checked ? [...new Set([...checkedIds.value, id])] : checkedIds.value.filter((item) => item !== id);
  }

  function isRowChecked(id: string) {
    return checkedIdSet.value.has(id);
  }

  function nextVisibleIdAfterDelete(currentId: string, deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    const currentIndex = rows.value.findIndex((row) => row.id === currentId);
    if (currentIndex < 0) return '';
    return (
      rows.value.slice(currentIndex + 1).find((row) => !deleted.has(row.id))?.id ||
      rows.value
        .slice(0, currentIndex)
        .reverse()
        .find((row) => !deleted.has(row.id))?.id ||
      ''
    );
  }

  function resetCursorState() {
    cursorStack.value = [''];
    nextCursor.value = '';
    hasMore.value = false;
    currentPage.value = 1;
  }

  function previousPageCursor() {
    if (currentPage.value <= 1) return null;
    currentPage.value -= 1;
    clearChecked();
    return currentCursor();
  }

  function nextPageCursor() {
    if (!hasMore.value || !nextCursor.value) return null;
    cursorStack.value[currentPage.value] = nextCursor.value;
    currentPage.value += 1;
    clearChecked();
    return nextCursor.value;
  }

  function recordRowPointer(event: PointerEvent) {
    rowPointerStart = { x: event.clientX, y: event.clientY };
  }

  function shouldOpenRow(event: MouseEvent) {
    if (window.getSelection()?.toString().trim()) return false;
    if (rowPointerStart && Math.hypot(event.clientX - rowPointerStart.x, event.clientY - rowPointerStart.y) > 5) {
      rowPointerStart = null;
      return false;
    }
    rowPointerStart = null;
    return true;
  }

  return {
    rows,
    checkedIds,
    cursorStack,
    nextCursor,
    hasMore,
    currentPage,
    hasRows,
    checkedCount,
    allPageChecked,
    pageCheckIndeterminate,
    currentCursor,
    setPageData,
    removeRows,
    clearChecked,
    togglePageChecked,
    toggleRowChecked,
    isRowChecked,
    nextVisibleIdAfterDelete,
    resetCursorState,
    previousPageCursor,
    nextPageCursor,
    recordRowPointer,
    shouldOpenRow
  };
}
