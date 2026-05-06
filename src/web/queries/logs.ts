import { type Ref } from 'vue';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { endpoints, type LogRow, type PageResult } from '../api/endpoints';
import { queryClient as globalQueryClient } from '../queryClient';
import { queryKeys } from './keys';

export function logListParams(query: { perPage: number; module: string; status: string; keyword: string }, cursor: string) {
  return {
    per_page: query.perPage,
    cursor,
    module: query.module || undefined,
    status: query.status || undefined,
    keyword: query.keyword.trim() || undefined
  };
}

export function loadLogsPage(params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.logs(params),
    queryFn: () => endpoints.logs(params),
    staleTime: 30_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<PageResult<LogRow[]>>(options);
}

export function useClearLogsMutation(activeParams: Ref<Record<string, unknown>>) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, Record<string, unknown>, { key: QueryKey; previous?: PageResult<LogRow[]> }>({
    mutationFn: endpoints.clearLogs,
    onMutate: async () => {
      const key = queryKeys.logs(activeParams.value);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PageResult<LogRow[]>>(key);
      if (previous) {
        queryClient.setQueryData<PageResult<LogRow[]>>(key, {
          ...previous,
          items: [],
          info: { ...previous.info, next_cursor: '', has_more: false }
        });
      }
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    }
  });
}
