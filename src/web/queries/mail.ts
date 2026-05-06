import { type Ref } from 'vue';
import { queryClient as globalQueryClient } from '../queryClient';
import { endpoints, type MailDetail, type MailRow, type PageResult, type SentDetail, type SentRow } from '../api/endpoints';
import { queryKeys } from './keys';

export function mailListParams(query: { perPage: number; keyword: string }, cursor: string) {
  return {
    per_page: query.perPage,
    cursor,
    keyword: query.keyword.trim() || undefined
  };
}

export function loadMailsPage(params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.mails(params),
    queryFn: () => endpoints.mails(params),
    staleTime: 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<PageResult<MailRow[]>>(options);
}

export function loadLatestMail() {
  return globalQueryClient.fetchQuery({
    queryKey: queryKeys.latestMail,
    queryFn: endpoints.latestMail,
    staleTime: 0
  });
}

function removeRowsFromPage<T extends { id: string }>(page: PageResult<T[]>, ids: string[]) {
  const deleted = new Set(ids);
  return {
    ...page,
    items: page.items.filter((row) => !deleted.has(row.id))
  };
}

export async function deleteMailsAndUpdatePage(ids: string[], activeParams: Ref<Record<string, unknown>>) {
  const key = queryKeys.mails(activeParams.value);
  await globalQueryClient.cancelQueries({ queryKey: key });
  await (ids.length === 1 ? endpoints.deleteMail(ids[0]) : endpoints.deleteMails(ids));
  const previous = globalQueryClient.getQueryData<PageResult<MailRow[]>>(key);
  const next = previous ? removeRowsFromPage(previous, ids) : null;
  if (next) globalQueryClient.setQueryData<PageResult<MailRow[]>>(key, next);
  for (const id of ids) globalQueryClient.removeQueries({ queryKey: queryKeys.mailDetail(id) });
  return next;
}

export function sentListParams(query: { perPage: number; keyword: string }, cursor: string) {
  return {
    per_page: query.perPage,
    cursor,
    keyword: query.keyword.trim() || undefined
  };
}

export function loadSentPage(params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.sent(params),
    queryFn: () => endpoints.sent(params),
    staleTime: 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<PageResult<SentRow[]>>(options);
}

export async function deleteSentAndUpdatePage(ids: string[], activeParams: Ref<Record<string, unknown>>) {
  const key = queryKeys.sent(activeParams.value);
  await globalQueryClient.cancelQueries({ queryKey: key });
  await (ids.length === 1 ? endpoints.deleteSent(ids[0]) : endpoints.deleteSentBatch(ids));
  const previous = globalQueryClient.getQueryData<PageResult<SentRow[]>>(key);
  const next = previous ? removeRowsFromPage(previous, ids) : null;
  if (next) globalQueryClient.setQueryData<PageResult<SentRow[]>>(key, next);
  for (const id of ids) globalQueryClient.removeQueries({ queryKey: queryKeys.sentDetail(id) });
  return next;
}

export function loadMailDetail(id: string, force = false) {
  const options = {
    queryKey: queryKeys.mailDetail(id),
    queryFn: () => endpoints.mailDetail(id),
    staleTime: 10 * 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<MailDetail>(options);
}

export function loadSentDetail(id: string, force = false) {
  const options = {
    queryKey: queryKeys.sentDetail(id),
    queryFn: () => endpoints.sentDetail(id),
    staleTime: 10 * 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<SentDetail>(options);
}
