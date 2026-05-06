import { readAdminKeyConfig } from './auth';
import type { AppConfig, CloudflareConfig, Env, PublicCloudflareConfig, PublicResendConfig, ResendConfig, SystemConfig } from './types';
import { maskSecret, safeJsonParse } from './utils';

const CLOUDFLARE_KEY = 'config:cloudflare';
const SYSTEM_KEY = 'config:system';
const RESEND_KEY = 'config:resend';
const configCacheTtlMs = 5000;

const defaultCloudflare: CloudflareConfig = {
  accountId: '',
  apiToken: '',
  workerName: ''
};

const defaultSystem: SystemConfig = {
  cleanupEnabled: true,
  mailRetentionDays: 30,
  acceptForwardedMail: true,
  adminBaseUrl: '',
  shareBaseUrl: '',
  mailShareTtlHours: 168,
  rateLimit: {
    login: 10,
    publicApi: 10,
    publicShare: 100
  }
};

const defaultResend: ResendConfig = {
  enabled: false,
  apiKey: ''
};

interface CacheEntry<T> {
  env: Env;
  expiresAt: number;
  value: T;
}

let cloudflareCache: CacheEntry<CloudflareConfig> | null = null;
let systemCache: CacheEntry<SystemConfig> | null = null;
let resendCache: CacheEntry<ResendConfig> | null = null;
let authCache: CacheEntry<Awaited<ReturnType<typeof readAdminKeyConfig>>> | null = null;

function cacheValid<T>(entry: CacheEntry<T> | null, env: Env) {
  return entry?.env === env && entry.expiresAt > Date.now();
}

function cacheEntry<T>(env: Env, value: T): CacheEntry<T> {
  return { env, value, expiresAt: Date.now() + configCacheTtlMs };
}

export function clearConfigCache(env?: Env) {
  if (!env || cloudflareCache?.env === env) cloudflareCache = null;
  if (!env || systemCache?.env === env) systemCache = null;
  if (!env || resendCache?.env === env) resendCache = null;
  if (!env || authCache?.env === env) authCache = null;
}

export function clearAuthConfigCache(env?: Env) {
  if (!env || authCache?.env === env) authCache = null;
}

export async function getCloudflareConfig(env: Env): Promise<CloudflareConfig> {
  if (cloudflareCache?.env === env && cloudflareCache.expiresAt > Date.now()) return cloudflareCache.value;
  const stored = safeJsonParse<CloudflareConfig>(await env.KV.get(CLOUDFLARE_KEY), defaultCloudflare);
  const value = {
    accountId: stored.accountId || '',
    apiToken: stored.apiToken || '',
    workerName: stored.workerName || ''
  };
  cloudflareCache = cacheEntry(env, value);
  return value;
}

export async function getSystemConfig(env: Env): Promise<SystemConfig> {
  if (systemCache?.env === env && systemCache.expiresAt > Date.now()) return systemCache.value;
  const stored = safeJsonParse<SystemConfig>(await env.KV.get(SYSTEM_KEY), defaultSystem);
  const cleanupEnabled = stored.cleanupEnabled === undefined ? defaultSystem.cleanupEnabled : stored.cleanupEnabled;
  const retentionDays = stored.mailRetentionDays === undefined ? defaultSystem.mailRetentionDays : stored.mailRetentionDays;
  const acceptForwardedMail = stored.acceptForwardedMail === undefined ? defaultSystem.acceptForwardedMail : stored.acceptForwardedMail;
  const value = {
    cleanupEnabled: cleanupEnabled === true,
    mailRetentionDays: Math.max(Math.floor(Number(retentionDays) || 0), 0),
    acceptForwardedMail: acceptForwardedMail === true,
    adminBaseUrl: normalizeBaseUrl(stored.adminBaseUrl),
    shareBaseUrl: normalizeBaseUrl(stored.shareBaseUrl),
    mailShareTtlHours: normalizeShareTtlHours(stored.mailShareTtlHours),
    rateLimit: normalizeRateLimitConfig(stored.rateLimit)
  };
  systemCache = cacheEntry(env, value);
  return value;
}

function normalizeRateLimitCount(input: unknown, fallback: number) {
  const value = Number(input ?? fallback);
  const count = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(count, 1), 100000);
}

function normalizeRateLimitConfig(input: unknown): SystemConfig['rateLimit'] {
  const body = input && typeof input === 'object' ? (input as Partial<Record<keyof SystemConfig['rateLimit'], unknown>>) : {};
  return {
    login: normalizeRateLimitCount(body.login, defaultSystem.rateLimit.login),
    publicApi: normalizeRateLimitCount(body.publicApi, defaultSystem.rateLimit.publicApi),
    publicShare: normalizeRateLimitCount(body.publicShare, defaultSystem.rateLimit.publicShare)
  };
}

function normalizeBaseUrl(input: unknown) {
  const value = String(input || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function normalizeShareTtlHours(input: unknown) {
  const value = Number(input ?? defaultSystem.mailShareTtlHours);
  const hours = Number.isFinite(value) ? Math.floor(value) : defaultSystem.mailShareTtlHours;
  return Math.min(Math.max(hours, 1), 720);
}

export async function getResendConfig(env: Env): Promise<ResendConfig> {
  if (resendCache?.env === env && resendCache.expiresAt > Date.now()) return resendCache.value;
  const stored = safeJsonParse<ResendConfig>(await env.KV.get(RESEND_KEY), defaultResend);
  const apiKey = stored.apiKey || '';
  const enabled = stored.enabled === undefined ? Boolean(apiKey) : stored.enabled === true;
  const value = {
    enabled,
    apiKey
  };
  resendCache = cacheEntry(env, value);
  return value;
}

export async function getAuthConfig(env: Env) {
  if (authCache?.env === env && authCache.expiresAt > Date.now()) return authCache.value;
  const value = await readAdminKeyConfig(env);
  authCache = value ? cacheEntry(env, value) : null;
  return value;
}

export async function getAppConfig(env: Env): Promise<AppConfig> {
  const [cloudflare, system, resend] = await Promise.all([
    getCloudflareConfig(env),
    getSystemConfig(env),
    getResendConfig(env)
  ]);

  return { cloudflare, system, resend };
}

export function toPublicCloudflareConfig(config: CloudflareConfig): PublicCloudflareConfig {
  return {
    accountId: config.accountId,
    workerName: config.workerName,
    apiTokenConfigured: Boolean(config.apiToken),
    apiTokenMasked: maskSecret(config.apiToken)
  };
}

export function toPublicResendConfig(config: ResendConfig): PublicResendConfig {
  return {
    enabled: config.enabled,
    apiKeyConfigured: Boolean(config.apiKey),
    apiKeyMasked: maskSecret(config.apiKey)
  };
}

export async function getPublicSettings(env: Env) {
  const config = await getAppConfig(env);
  return {
    cloudflare: toPublicCloudflareConfig(config.cloudflare),
    system: config.system,
    resend: toPublicResendConfig(config.resend)
  };
}

export async function buildSettingsUpdate(env: Env, input: Partial<AppConfig> & { cloudflare?: Partial<CloudflareConfig>; resend?: Partial<ResendConfig> }) {
  const current = await getAppConfig(env);

  const cloudflare: CloudflareConfig = {
    accountId: String(input.cloudflare?.accountId ?? current.cloudflare.accountId).trim(),
    workerName: String(input.cloudflare?.workerName ?? current.cloudflare.workerName).trim(),
    apiToken: current.cloudflare.apiToken
  };

  const nextToken = input.cloudflare?.apiToken;
  if (typeof nextToken === 'string' && nextToken.trim()) {
    cloudflare.apiToken = nextToken.trim();
  }

  const system: SystemConfig = {
    cleanupEnabled: input.system?.cleanupEnabled === undefined ? current.system.cleanupEnabled : input.system.cleanupEnabled === true,
    mailRetentionDays: Math.max(Math.floor(Number(input.system?.mailRetentionDays ?? current.system.mailRetentionDays) || 0), 0),
    acceptForwardedMail: input.system?.acceptForwardedMail === undefined ? current.system.acceptForwardedMail : input.system.acceptForwardedMail === true,
    adminBaseUrl: input.system?.adminBaseUrl === undefined ? current.system.adminBaseUrl : normalizeBaseUrl(input.system.adminBaseUrl),
    shareBaseUrl: input.system?.shareBaseUrl === undefined ? current.system.shareBaseUrl : normalizeBaseUrl(input.system.shareBaseUrl),
    mailShareTtlHours: input.system?.mailShareTtlHours === undefined ? current.system.mailShareTtlHours : normalizeShareTtlHours(input.system.mailShareTtlHours),
    rateLimit: normalizeRateLimitConfig(input.system?.rateLimit ?? current.system.rateLimit)
  };

  const resend: ResendConfig = {
    enabled: input.resend?.enabled === undefined ? current.resend.enabled : input.resend.enabled === true,
    apiKey: current.resend.apiKey
  };

  const nextResendApiKey = input.resend?.apiKey;
  if (typeof nextResendApiKey === 'string' && nextResendApiKey.trim()) {
    resend.apiKey = nextResendApiKey.trim();
  }

  return { cloudflare, system, resend };
}

export async function saveSettingsUpdate(env: Env, config: AppConfig) {
  await Promise.all([
    env.KV.put(CLOUDFLARE_KEY, JSON.stringify(config.cloudflare)),
    env.KV.put(SYSTEM_KEY, JSON.stringify(config.system)),
    env.KV.put(RESEND_KEY, JSON.stringify(config.resend))
  ]);
  clearConfigCache(env);

  return {
    cloudflare: toPublicCloudflareConfig(config.cloudflare),
    system: config.system,
    resend: toPublicResendConfig(config.resend)
  };
}
