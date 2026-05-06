import { queryClient } from '../queryClient';
import { endpoints, type DomainRow, type PageResult, type ZoneRow } from '../api/endpoints';
import { queryKeys } from './keys';

export function domainListParams(query: { pageSize: number; keyword: string }, cursor: string) {
  return {
    pageSize: query.pageSize,
    cursor,
    keyword: query.keyword.trim() || undefined
  };
}

export function loadDomainsPage(params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.domains(params),
    queryFn: () => endpoints.domains(params),
    staleTime: 60_000
  };
  return force ? queryClient.fetchQuery({ ...options, staleTime: 0 }) : queryClient.ensureQueryData<PageResult<DomainRow[]>>(options);
}

export function loadSubdomainsPage(parentId: string, params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.subdomains(parentId, params),
    queryFn: () => endpoints.subdomains(parentId, params),
    staleTime: 60_000
  };
  return force ? queryClient.fetchQuery({ ...options, staleTime: 0 }) : queryClient.ensureQueryData<PageResult<DomainRow[]>>(options);
}

export function loadZones(force = false) {
  const options = {
    queryKey: queryKeys.zones,
    queryFn: endpoints.zones,
    staleTime: 10 * 60_000
  };
  return force ? queryClient.fetchQuery({ ...options, staleTime: 0 }) : queryClient.ensureQueryData<ZoneRow[]>(options);
}

function sortDomains(items: DomainRow[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function mergeRootDomainRows(rows: DomainRow[], records: DomainRow[]) {
  const current = new Map(rows.map((row) => [row.id, row]));
  for (const record of records.filter((item) => item.is_subdomain !== 1)) current.set(record.id, record);
  return sortDomains([...current.values()]);
}

export function mergeChildDomainRows(rows: DomainRow[], records: DomainRow[], parentId: string) {
  const relevant = records.filter((item) => item.parent_domain_id === parentId);
  if (!relevant.length) return rows;
  const current = new Map(rows.map((row) => [row.id, row]));
  for (const record of relevant) current.set(record.id, record);
  return sortDomains([...current.values()]);
}

export function removeDomainRows(rows: DomainRow[], ids: string[]) {
  const deleted = new Set(ids);
  return rows.filter((row) => !deleted.has(row.id) && !deleted.has(row.parent_domain_id || ''));
}

export function mergeDomainPage(params: Record<string, unknown>, records: DomainRow[]) {
  const key = queryKeys.domains(params);
  const previous = queryClient.getQueryData<PageResult<DomainRow[]>>(key);
  if (!previous) return null;
  const next = {
    ...previous,
    items: mergeRootDomainRows(previous.items, records)
  };
  queryClient.setQueryData<PageResult<DomainRow[]>>(key, next);
  return next;
}

export function mergeSubdomainPage(parentId: string, params: Record<string, unknown>, records: DomainRow[]) {
  const key = queryKeys.subdomains(parentId, params);
  const previous = queryClient.getQueryData<PageResult<DomainRow[]>>(key);
  if (!previous) return null;
  const next = {
    ...previous,
    items: mergeChildDomainRows(previous.items, records, parentId)
  };
  queryClient.setQueryData<PageResult<DomainRow[]>>(key, next);
  return next;
}

export function removeDomainPageRecords(params: Record<string, unknown>, ids: string[]) {
  const key = queryKeys.domains(params);
  const previous = queryClient.getQueryData<PageResult<DomainRow[]>>(key);
  if (!previous) return null;
  const next = {
    ...previous,
    items: removeDomainRows(previous.items, ids)
  };
  queryClient.setQueryData<PageResult<DomainRow[]>>(key, next);
  return next;
}

export function removeSubdomainPageRecords(parentId: string, params: Record<string, unknown>, ids: string[]) {
  const key = queryKeys.subdomains(parentId, params);
  const previous = queryClient.getQueryData<PageResult<DomainRow[]>>(key);
  if (!previous) return null;
  const next = {
    ...previous,
    items: removeDomainRows(previous.items, ids)
  };
  queryClient.setQueryData<PageResult<DomainRow[]>>(key, next);
  return next;
}
