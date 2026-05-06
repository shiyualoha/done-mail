import type { Context } from 'hono';
import type { Env } from '../types';

type AppContext = Context<{ Bindings: Env }>;
const rateLimitWindowSeconds = 3600;

interface RateLimitRow {
  count: number;
}

function clientIp(c: AppContext) {
  return requestClientIp(c.req.raw);
}

function requestClientIp(req: Request) {
  return req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

async function scopeHash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

export async function consumeRateLimit(env: Env, scope: string, identity: string, maxPerHour: number) {
  const max = Math.max(Math.floor(maxPerHour), 1);
  const now = Math.floor(Date.now() / 1000);
  const key = `rate:${scope}:${await scopeHash(identity)}`;
  const resetAt = now + rateLimitWindowSeconds;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, scope, count, reset_at, updated_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE
         WHEN rate_limits.reset_at <= excluded.updated_at THEN 1
         ELSE rate_limits.count + 1
       END,
       reset_at = CASE
         WHEN rate_limits.reset_at <= excluded.updated_at THEN excluded.reset_at
         ELSE rate_limits.reset_at
       END,
       updated_at = excluded.updated_at
     RETURNING count`
  )
    .bind(key, scope, resetAt, now)
    .first<RateLimitRow>();

  if (!row) {
    throw new Error('限流计数失败');
  }

  const count = Number(row.count || 0);

  return count > max;
}

export async function cleanupExpiredRateLimits(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(`DELETE FROM rate_limits WHERE reset_at <= ?`).bind(now).run();
  return Number(result.meta.changes || 0);
}

export function rateLimitIdentity(c: AppContext, extra = '') {
  return [clientIp(c), extra].filter(Boolean).join(':');
}

export function rateLimitIdentityFromRequest(req: Request, extra = '') {
  return [requestClientIp(req), extra].filter(Boolean).join(':');
}
