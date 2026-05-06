import { CloudflareService } from './cloudflare';
import {
  checkDomainConfig,
  domainCheckErrorMessage,
  domainCheckReady,
  ensureDomainDns,
  getConfiguredCloudflare,
  getDomainById,
  getDomainsByIds,
  hasWorkerAction,
  markDomainSetupFailed,
  markDomainsSetupFailed,
  mapWithConcurrency,
  normalizeSubdomainPrefix,
  savePendingDomain,
  setupResultFromRecord,
  updateDomainState,
  uniqueStrings,
  type DomainTarget,
  type ParentDomainState
} from './domain-common';
import { logSystemEvent, pruneSystemLogs } from './http/logs';
import type { DomainRecord, Env, ZoneInfo } from './types';

function normalizeZoneInput(value: unknown): ZoneInfo {
  const body = value && typeof value === 'object' ? (value as Partial<ZoneInfo>) : {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim().toLowerCase();
  if (!id || !name) throw new Error('请选择 Cloudflare 主域名');
  return { id, name, status: body.status };
}

async function setupRootDomain(env: Env, service: CloudflareService, workerName: string, target: DomainTarget) {
  if (!workerName) throw new Error('Worker 名称未配置');

  try {
    const dnsResult = await ensureDomainDns(service, target);
    if (!dnsResult.configured) {
      throw new Error(dnsResult.errors.length ? `邮件路由 DNS 未完成：${dnsResult.errors.join('; ')}` : '邮件路由 DNS 未完成');
    }
    await logSystemEvent(env, 'domain', target.name, 'dns', 'success', `${target.name} 的邮件路由已接入`);

    const catchAll = await service.updateCatchAllToWorker(target.zoneId, workerName);
    if (catchAll.enabled !== true || !hasWorkerAction(catchAll, workerName)) throw new Error('全收转发未完成');
    await logSystemEvent(env, 'domain', target.name, 'catch_all', 'success', `全收转发已指向 Worker：${workerName}`);

    const check = await checkDomainConfig(service, target.zoneId, target.name, target.isSubdomain, workerName);
    if (!domainCheckReady(check)) {
      throw new Error(`域名验证未通过：${domainCheckErrorMessage(check)}`);
    }
    await logSystemEvent(env, 'domain', target.name, 'email_routing', 'success', '域名可用性已验证');
    return check;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSystemEvent(env, 'domain', target.name, 'setup', 'failed', message);
    throw error;
  }
}

async function getParentDomainState(service: CloudflareService, zoneId: string, workerName: string): Promise<ParentDomainState> {
  if (!workerName) throw new Error('Worker 名称未配置');

  const [status, catchAll] = await Promise.all([
    service.getEmailRoutingStatus(zoneId),
    service.getCatchAll(zoneId)
  ]);
  const state = {
    emailRoutingEnabled: status.enabled === true || status.status === 'ready',
    catchallEnabled: catchAll.enabled === true,
    workerActionEnabled: hasWorkerAction(catchAll, workerName)
  };

  if (!state.emailRoutingEnabled) throw new Error('主域名邮件路由未开启，请先配置主域名');
  if (!state.catchallEnabled || !state.workerActionEnabled) throw new Error('主域名全收转发未完成，请先配置主域名');
  return state;
}

async function setupSubdomain(env: Env, service: CloudflareService, workerName: string, target: DomainTarget, parentState: ParentDomainState) {
  if (!parentState.emailRoutingEnabled || !parentState.catchallEnabled || !parentState.workerActionEnabled) {
    throw new Error('主域名未正常可用，请先验证主域名');
  }

  try {
    const dnsResult = await ensureDomainDns(service, target);
    if (!dnsResult.configured) {
      throw new Error(dnsResult.errors.length ? `邮件路由 DNS 未完成：${dnsResult.errors.join('; ')}` : '邮件路由 DNS 未完成');
    }
    await logSystemEvent(env, 'domain', target.name, 'dns', 'success', `${target.name} 的邮件路由已接入`);

    const check = await checkDomainConfig(service, target.zoneId, target.name, target.isSubdomain, workerName);
    if (!domainCheckReady(check)) {
      throw new Error(`子域名验证未通过：${domainCheckErrorMessage(check)}`);
    }
    return check;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSystemEvent(env, 'domain', target.name, 'setup', 'failed', message);
    throw error;
  }
}

export async function addDomains(env: Env, rawZones: unknown[]) {
  const zones = rawZones.map(normalizeZoneInput);
  const zoneMap = new Map(zones.map((zone) => [zone.id, zone]));
  const items = await mapWithConcurrency([...zoneMap.values()], 3, async (zone) => {
    if (!zone.name) {
      return { input: zone.id, name: zone.id, record: null, setup: null, success: false, error: '没有找到这个 Cloudflare 主域名' };
    }

    const target: DomainTarget = {
      zoneId: zone.id,
      zoneName: zone.name,
      name: zone.name,
      parentDomainId: null,
      isSubdomain: false
    };

    try {
      const record = await savePendingDomain(env, target);
      return {
        input: zone.id,
        name: zone.name,
        record,
        setup: setupResultFromRecord(record),
        success: true
      };
    } catch (error) {
      return {
        input: zone.id,
        name: zone.name,
        record: null,
        setup: null,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  const success = items.filter((item) => item.success).length;
  return { items, total: items.length, success, failed: items.length - success };
}

export async function configureDomains(env: Env, records: DomainRecord[]) {
  if (!records.length) return;
  const { config, service } = await getConfiguredCloudflare(env);
  await mapWithConcurrency(records, 2, async (record) => {
    const target: DomainTarget = {
      zoneId: record.zone_id,
      zoneName: record.zone_name,
      name: record.name,
      parentDomainId: record.parent_domain_id,
      isSubdomain: record.is_subdomain === 1
    };

    try {
      const check = await setupRootDomain(env, service, config.workerName, target);
      await updateDomainState(env, record.id, check, null);
    } catch (error) {
      await markDomainSetupFailed(env, record, error);
    }
  });
}

export async function addSubdomains(env: Env, parentId: string, rawPrefixes: string[]) {
  const parent = await getDomainById(env, parentId);
  if (!parent || parent.is_subdomain === 1) {
    throw new Error('请先选择一个已添加的主域名');
  }

  const prefixes = uniqueStrings(rawPrefixes);
  if (prefixes.length === 0) throw new Error('请填写子域名前缀');

  const items = [];
  const targets: Array<{ input: string; target: DomainTarget }> = [];
  const seen = new Set<string>();
  for (const rawPrefix of prefixes) {
    try {
      const prefix = normalizeSubdomainPrefix(rawPrefix);
      if (seen.has(prefix)) continue;
      seen.add(prefix);
      targets.push({
        input: rawPrefix,
        target: {
          zoneId: parent.zone_id,
          zoneName: parent.zone_name || parent.name,
          name: `${prefix}.${parent.name}`,
          parentDomainId: parent.id,
          isSubdomain: true
        }
      });
    } catch (error) {
      items.push({
        input: rawPrefix,
        name: rawPrefix,
        record: null,
        setup: null,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (targets.length) {
    items.push(
      ...(await mapWithConcurrency(targets, 3, async ({ input, target }) => {
        try {
          const record = await savePendingDomain(env, target);
          return {
            input,
            name: target.name,
            record,
            setup: setupResultFromRecord(record),
            success: true
          };
        } catch (error) {
          return {
            input,
            name: target.name,
            record: null,
            setup: null,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }))
    );
  }

  const success = items.filter((item) => item.success).length;
  return { items, total: items.length, success, failed: items.length - success };
}

export async function configureSubdomains(env: Env, records: DomainRecord[]) {
  if (!records.length) return;
  const { config, service } = await getConfiguredCloudflare(env);
  const parentStateCache = new Map<string, Promise<ParentDomainState>>();

  await mapWithConcurrency(records, 2, async (record) => {
    const target: DomainTarget = {
      zoneId: record.zone_id,
      zoneName: record.zone_name,
      name: record.name,
      parentDomainId: record.parent_domain_id,
      isSubdomain: true
    };

    try {
      if (!record.parent_domain_id) throw new Error('子域名缺少主域名记录');
      let parentState = parentStateCache.get(record.parent_domain_id);
      if (!parentState) {
        parentState = getParentDomainState(service, record.zone_id, config.workerName);
        parentStateCache.set(record.parent_domain_id, parentState);
      }
      const check = await setupSubdomain(env, service, config.workerName, target, await parentState);
      await updateDomainState(env, record.id, check, null);
    } catch (error) {
      await markDomainSetupFailed(env, record, error);
    }
  });
}

export async function runDomainSetup(env: Env, ids: string[], subdomain: boolean) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;
  try {
    const records = await getDomainsByIds(env, uniqueIds);
    if (subdomain) {
      await configureSubdomains(env, records);
    } else {
      await configureDomains(env, records);
    }
    await pruneSystemLogs(env);
  } catch (error) {
    await markDomainsSetupFailed(env, uniqueIds, error);
    console.error('域名后台接入失败', error);
  }
}
