import { queryClient } from '../queryClient';
import { endpoints, type BootstrapState } from '../api/endpoints';
import { queryKeys } from './keys';

export function applyBootstrapCache(data: BootstrapState) {
  queryClient.setQueryData(queryKeys.auth, data.auth);
  queryClient.setQueryData(queryKeys.settings, data.settings);
  queryClient.setQueryData(queryKeys.bootstrap, data);
}

export async function loadBootstrap(force = false) {
  if (!force) {
    const cached = queryClient.getQueryData<BootstrapState>(queryKeys.bootstrap);
    if (cached) return cached;
  }

  const data = await queryClient.fetchQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: endpoints.bootstrap,
    staleTime: 5 * 60_000
  });
  applyBootstrapCache(data);
  return data;
}
