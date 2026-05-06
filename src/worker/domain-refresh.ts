import {
  checkDomainConfig,
  domainCheckErrorMessage,
  domainCheckReady,
  getConfiguredCloudflare,
  getDomainById,
  updateDomainState
} from './domain-common';
import { logSystemEvent } from './http/logs';
import type { Env, SetupResult } from './types';

export async function refreshDomain(env: Env, id: string): Promise<SetupResult> {
  const record = await getDomainById(env, id);
  if (!record) {
    return { id, zoneId: '', domain: '', success: false, error: '域名不存在' };
  }

  const { config, service } = await getConfiguredCloudflare(env);

  try {
    const check = await checkDomainConfig(service, record.zone_id, record.name, record.is_subdomain === 1, config.workerName);
    const ready = domainCheckReady(check);
    const message = ready ? null : `验证未通过：${domainCheckErrorMessage(check)}`;
    await updateDomainState(env, id, check, message);
    const current = await getDomainById(env, id);
    await logSystemEvent(env, 'domain', record.name, 'refresh', ready ? 'success' : 'failed', ready ? '域名可用性已验证' : message || '验证未通过');
    return {
      id,
      zoneId: record.zone_id,
      domain: record.name,
      success: ready,
      record: current || undefined,
      error: message || undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logSystemEvent(env, 'domain', record.name, 'refresh', 'failed', message);
    await updateDomainState(
      env,
      id,
      {
        emailRoutingEnabled: false,
        dnsConfigured: false,
        catchallEnabled: false,
        workerActionEnabled: false
      },
      message
    );
    const current = await getDomainById(env, id);
    return { id, zoneId: record.zone_id, domain: record.name, success: false, record: current || undefined, error: message };
  }
}
