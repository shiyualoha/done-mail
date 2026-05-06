import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function apiSuccess<T>(result: T, resultInfo: Record<string, unknown> = {}) {
  return { success: true, result, errors: [], messages: [], result_info: resultInfo };
}

export function apiError(message: string, code = 'request_failed') {
  return {
    success: false,
    result: null,
    errors: [{ code, message }],
    messages: [],
    result_info: {}
  };
}

export function apiOk<T>(c: Context, result: T, resultInfo: Record<string, unknown> = {}) {
  return c.json(apiSuccess(result, resultInfo));
}

export function apiFail(c: Context, message: string, status: ContentfulStatusCode = 400, code = 'request_failed') {
  return c.json(apiError(message, code), { status });
}

export function jsonFail(c: Context, message: string, status: ContentfulStatusCode = 400, code = 'request_failed') {
  return apiFail(c, message, status, code);
}

export function createId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function maskSecret(value: string) {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`;
}

export function extractDomain(email: string) {
  const match = email.trim().toLowerCase().match(/@([^>\s]+)$/);
  return match?.[1] || '';
}

export function pickEmailAddress(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return pickEmailAddress(value[0]);
  if (typeof value === 'object' && 'address' in value) {
    return String((value as { address?: unknown }).address || '');
  }
  return '';
}

export function toIntFlag(value: boolean) {
  return value ? 1 : 0;
}
