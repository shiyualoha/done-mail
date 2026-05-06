import type { Env } from './types';
import { nowIso, safeJsonParse } from './utils';

const adminKeyConfigKey = 'auth:admin_key';
const hashAlgorithm = 'SHA-256';
const minAdminKeyLength = 8;

export interface AdminKeyConfig {
  hash: string;
  salt: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  initialized: boolean;
  version: string;
}

function bytesToBase64(bytes: ArrayBuffer) {
  const values = new Uint8Array(bytes);
  let binary = '';
  for (const value of values) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function randomBase64(bytes = 24) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return bytesToBase64(values.buffer);
}

async function hashAdminKey(adminKey: string, salt: string) {
  const input = new TextEncoder().encode(`${salt}:${adminKey}`);
  return bytesToBase64(await crypto.subtle.digest(hashAlgorithm, input));
}

export async function readAdminKeyConfig(env: Env) {
  const value = await env.KV.get(adminKeyConfigKey);
  if (!value) return null;
  const config = safeJsonParse<Partial<AdminKeyConfig>>(value, {});
  if (!config.hash || !config.salt || !config.version) return null;
  return config as AdminKeyConfig;
}

export function authStateFromConfig(config: AdminKeyConfig | null): AuthState {
  return {
    initialized: Boolean(config),
    version: config?.version || ''
  };
}

export async function getAuthState(env: Env): Promise<AuthState> {
  return authStateFromConfig(await readAdminKeyConfig(env));
}

export function normalizeAdminKey(value: unknown) {
  return String(value || '').trim();
}

export function assertValidAdminKey(adminKey: string) {
  if (adminKey.length < minAdminKeyLength) {
    throw new Error(`管理员 Key 至少需要 ${minAdminKeyLength} 个字符`);
  }
}

export async function verifyAdminKey(env: Env, adminKey: string) {
  const config = await readAdminKeyConfig(env);
  return verifyAdminKeyConfig(config, adminKey);
}

export async function verifyAdminKeyConfig(config: AdminKeyConfig | null, adminKey: string) {
  if (!config || !adminKey) return false;
  return (await hashAdminKey(adminKey, config.salt)) === config.hash;
}

export async function initializeAdminKey(env: Env, adminKey: string) {
  assertValidAdminKey(adminKey);
  if (await readAdminKeyConfig(env)) {
    throw new Error('系统已经初始化');
  }

  const salt = randomBase64();
  const now = nowIso();
  const config: AdminKeyConfig = {
    hash: await hashAdminKey(adminKey, salt),
    salt,
    version: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now
  };

  await env.KV.put(adminKeyConfigKey, JSON.stringify(config));
  return config.version;
}

export async function changeAdminKey(env: Env, currentKey: string, newKey: string) {
  assertValidAdminKey(newKey);
  const current = await readAdminKeyConfig(env);
  if (!current) throw new Error('系统尚未初始化');
  if (!(await verifyAdminKeyConfig(current, currentKey))) {
    throw new Error('当前管理员 Key 不正确');
  }

  const salt = randomBase64();
  const next: AdminKeyConfig = {
    hash: await hashAdminKey(newKey, salt),
    salt,
    version: crypto.randomUUID(),
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await env.KV.put(adminKeyConfigKey, JSON.stringify(next));
  return next.version;
}
