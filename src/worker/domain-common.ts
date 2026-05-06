import { getCloudflareConfig } from './config';
import { CloudflareService } from './cloudflare';
import type { DomainRecord, Env, SetupResult } from './types';
import { createId, nowIso, toIntFlag } from './utils';

export interface DomainCheckResult {
  emailRoutingEnabled: boolean;
  dnsConfigured: boolean;
  catchallEnabled: boolean;
  workerActionEnabled: boolean;
}

export interface DomainTarget {
  zoneId: string;
  zoneName: string;
  name: string;
  parentDomainId: string | null;
  isSubdomain: boolean;
}

const zeroCheck: DomainCheckResult = {
  emailRoutingEnabled: false,
  dnsConfigured: false,
  catchallEnabled: false,
  workerActionEnabled: false
};

export interface ParentDomainState {
  emailRoutingEnabled: boolean;
  catchallEnabled: boolean;
  workerActionEnabled: boolean;
}

const domainCheckLabels: Array<[keyof DomainCheckResult, string]> = [
  ['emailRoutingEnabled', '邮件路由未开启'],
  ['dnsConfigured', '邮件路由 DNS 未完成'],
  ['catchallEnabled', '全收转发未开启'],
  ['workerActionEnabled', '全收转发未指向当前 Worker']
];

export function normalizeSubdomainPrefix(value: string) {
  const prefix = value.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!prefix) throw new Error('请填写子域名前缀');
  if (prefix.includes('@') || prefix.includes('/') || prefix.includes(':')) {
    throw new Error('请填写子域名前缀，不要填写邮箱地址或 URL');
  }

  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const pattern = new RegExp(`^${label}(?:\\.${label})*$`);
  if (!pattern.test(prefix)) throw new Error('子域名前缀格式不正确');
  return prefix;
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function getDomainById(env: Env, id: string) {
  return env.DB.prepare(`SELECT * FROM domains WHERE id = ?`).bind(id).first<DomainRecord>();
}

export async function getDomainsByIds(env: Env, ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await env.DB.prepare(`SELECT * FROM domains WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .all<DomainRecord>();
  return rows.results || [];
}

export async function getConfiguredCloudflare(env: Env) {
  const config = await getCloudflareConfig(env);
  if (!config.accountId) throw new Error('Cloudflare 账号 ID 未配置');
  if (!config.apiToken) throw new Error('Cloudflare 接口令牌未配置');
  return {
    config,
    service: CloudflareService.fromToken(config.apiToken, config.accountId)
  };
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function hasWorkerAction(catchAll: { actions?: Array<{ type?: string; value?: string[] }> }, workerName: string) {
  return Boolean(
    catchAll.actions?.some((action) => action.type === 'worker' && Array.isArray(action.value) && action.value.includes(workerName))
  );
}

export async function checkDomainConfig(
  service: CloudflareService,
  zoneId: string,
  domain: string,
  isSubdomain: boolean,
  workerName: string
): Promise<DomainCheckResult> {
  const status = await service.getEmailRoutingStatus(zoneId);
  const emailRoutingEnabled = status.enabled === true || status.status === 'ready';
  const dnsDomain = isSubdomain ? domain : undefined;
  const dnsStatus = await service.getEmailRoutingDnsStatus(zoneId, dnsDomain);
  const dnsConfigured = dnsStatus.errors.length === 0;
  const catchAll = await service.getCatchAll(zoneId);

  return {
    emailRoutingEnabled,
    dnsConfigured,
    catchallEnabled: catchAll.enabled === true,
    workerActionEnabled: hasWorkerAction(catchAll, workerName)
  };
}

export async function updateDomainState(env: Env, id: string, check: DomainCheckResult, lastError: string | null) {
  await env.DB.prepare(
    `UPDATE domains SET
       setup_status = ?,
       email_routing_enabled = ?,
       dns_configured = ?,
       catchall_enabled = ?,
       worker_action_enabled = ?,
       last_checked_at = ?,
       last_error = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      lastError ? 'failed' : domainCheckReady(check) ? 'ready' : 'failed',
      toIntFlag(check.emailRoutingEnabled),
      toIntFlag(check.dnsConfigured),
      toIntFlag(check.catchallEnabled),
      toIntFlag(check.workerActionEnabled),
      nowIso(),
      lastError,
      id
    )
    .run();
}

export function domainCheckReady(check: DomainCheckResult) {
  return check.emailRoutingEnabled && check.dnsConfigured && check.catchallEnabled && check.workerActionEnabled;
}

export function domainCheckErrorMessage(check: DomainCheckResult) {
  return domainCheckLabels
    .filter(([key]) => !check[key])
    .map(([, label]) => label)
    .join('；');
}

export async function ensureDomainDns(service: CloudflareService, target: DomainTarget) {
  const dnsDomain = target.isSubdomain ? target.name : undefined;
  await service.ensureEmailDnsRecords(target.zoneId, dnsDomain);
  const afterStatus = await service.getEmailRoutingDnsStatus(target.zoneId, dnsDomain);
  return {
    configured: afterStatus.errors.length === 0,
    errors: afterStatus.errors.map((error) => error.message || String(error.code || '')).filter(Boolean)
  };
}

export async function savePendingDomain(env: Env, target: DomainTarget) {
  const id = createId('dom');
  await env.DB.prepare(
    `INSERT INTO domains (
       id, zone_id, zone_name, name, parent_domain_id, is_subdomain, setup_status,
       email_routing_enabled, dns_configured, catchall_enabled, worker_action_enabled,
       last_checked_at, last_error, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, 'configuring', 0, 0, 0, 0, ?, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(name) DO UPDATE SET
       zone_id = excluded.zone_id,
       zone_name = excluded.zone_name,
       parent_domain_id = excluded.parent_domain_id,
       is_subdomain = excluded.is_subdomain,
       setup_status = 'configuring',
       email_routing_enabled = 0,
       dns_configured = 0,
       catchall_enabled = 0,
       worker_action_enabled = 0,
       last_checked_at = excluded.last_checked_at,
       last_error = NULL,
       updated_at = CURRENT_TIMESTAMP`
  )
    .bind(
      id,
      target.zoneId,
      target.zoneName,
      target.name,
      target.parentDomainId,
      toIntFlag(target.isSubdomain),
      nowIso()
    )
    .run();

  const record = await env.DB.prepare(`SELECT * FROM domains WHERE name = ?`).bind(target.name).first<DomainRecord>();
  if (!record) throw new Error('域名添加失败');
  return record;
}

export async function markDomainSetupFailed(env: Env, record: DomainRecord, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await updateDomainState(env, record.id, zeroCheck, message);
  return message;
}

export async function markDomainsSetupFailed(env: Env, ids: string[], error: unknown) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;
  const message = error instanceof Error ? error.message : String(error);
  const placeholders = uniqueIds.map(() => '?').join(', ');
  await env.DB.prepare(
    `UPDATE domains SET
       setup_status = 'failed',
       email_routing_enabled = 0,
       dns_configured = 0,
       catchall_enabled = 0,
       worker_action_enabled = 0,
       last_checked_at = ?,
       last_error = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders})`
  )
    .bind(nowIso(), message, ...uniqueIds)
    .run();
}

export function setupResultFromRecord(record: DomainRecord): SetupResult {
  return {
    id: record.id,
    zoneId: record.zone_id,
    domain: record.name,
    success: record.setup_status !== 'failed',
    error: record.last_error || undefined
  };
}
