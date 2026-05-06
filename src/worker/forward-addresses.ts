import { CloudflareService, type EmailRoutingAddress } from './cloudflare';
import { getCloudflareConfig } from './config';
import type { Env, ForwardAddressStatus } from './types';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('转发邮箱格式不正确');
  }
}

export function normalizeForwardAddressList(value: unknown) {
  const raw = (Array.isArray(value) ? value : [value]).flatMap((item) => String(item || '').split(/[\s,]+/));
  const emails = [...new Set(raw.map(normalizeEmail).filter(Boolean))];
  emails.forEach(assertEmail);
  return emails;
}

function toStatus(address: EmailRoutingAddress, fallbackEmail = ''): ForwardAddressStatus {
  const email = normalizeEmail(address.email || fallbackEmail);
  return {
    email,
    id: String(address.id || address.tag || ''),
    exists: Boolean(address.email || fallbackEmail),
    verified: Boolean(address.verified),
    verifiedAt: String(address.verified || ''),
    createdAt: String(address.created || ''),
    modifiedAt: String(address.modified || '')
  };
}

async function cloudflareService(env: Env) {
  const config = await getCloudflareConfig(env);
  return {
    config,
    service: CloudflareService.fromToken(config.apiToken, config.accountId)
  };
}

export async function listForwardAddressStatuses(env: Env, targetEmails?: string[]) {
  const targets = targetEmails?.length ? normalizeForwardAddressList(targetEmails) : [];
  const { config, service } = await cloudflareService(env);
  const addresses = await service.listDestinationAddresses(config.accountId);
  const statusMap = new Map(addresses.map((address) => [normalizeEmail(address.email), toStatus(address)]));

  if (!targets.length) {
    return [...statusMap.values()].sort((a, b) => a.email.localeCompare(b.email));
  }

  return targets.map(
    (email) =>
      statusMap.get(email) || {
        email,
        id: '',
        exists: false,
        verified: false,
        verifiedAt: '',
        createdAt: '',
        modifiedAt: ''
      }
  );
}

export async function createForwardAddress(env: Env, inputEmail: string) {
  const [email] = normalizeForwardAddressList([inputEmail]);
  const [existing] = await listForwardAddressStatuses(env, [email]);
  if (existing?.exists) return existing;

  const { config, service } = await cloudflareService(env);
  return toStatus(await service.createDestinationAddress(email, config.accountId), email);
}
