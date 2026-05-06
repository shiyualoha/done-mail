import { QueryClient } from '@tanstack/vue-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: 1,
      structuralSharing: true
    },
    mutations: {
      retry: 0
    }
  }
});

export function clearQueryState() {
  queryClient.clear();
}
