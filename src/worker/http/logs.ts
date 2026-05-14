import type { Env } from '../types';
import { createId, nowIso } from '../utils';

const logRetentionDays = 30;
const maxSystemLogs = 2000;
const pruneKvKey = 'system_logs:pruned_at';
const pruneIntervalSeconds = 3600;

export const systemLogModules = ['domain', 'policy', 'mail', 'send', 'system'] as const;
export const systemLogActions = ['email_routing', 'dns', 'catch_all', 'setup', 'refresh', 'policy', 'receive'] as const;
export const systemLogStatuses = ['success', 'failed', 'skipped'] as const;

export type SystemLogModule = (typeof systemLogModules)[number];
export type SystemLogAction = (typeof systemLogActions)[number];
export type SystemLogStatus = (typeof systemLogStatuses)[number];

export const systemLogModuleSet = new Set<string>(systemLogModules);
export const systemLogStatusSet = new Set<string>(systemLogStatuses);

function buildLogSearchText(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).join(' ');
}

export async function deleteOrphanSystemLogFts(env: Env) {
  await env.DB.prepare(
    `DELETE FROM system_logs_fts
     WHERE log_id NOT IN (
       SELECT id
       FROM system_logs
     )`
  ).run();
}

export async function pruneSystemLogs(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  const lastPrunedAt = Number(await env.KV.get(pruneKvKey));
  if (Number.isFinite(lastPrunedAt) && now - lastPrunedAt < pruneIntervalSeconds) return;

  const cutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM system_logs WHERE created_at < ?`).bind(cutoff),
    env.DB.prepare(
      `DELETE FROM system_logs
       WHERE id NOT IN (
         SELECT id
         FROM system_logs
         ORDER BY created_at DESC
         LIMIT ?
       )`
    ).bind(maxSystemLogs)
  ]);
  await deleteOrphanSystemLogFts(env);
  await env.KV.put(pruneKvKey, String(now), { expirationTtl: pruneIntervalSeconds * 2 });
}

export async function logSystemEvent(env: Env, module: SystemLogModule, target: string, action: SystemLogAction, status: SystemLogStatus, message: string) {
  const id = createId('log');
  const createdAt = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO system_logs (id, module, target, action, status, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, module, target, action, status, message, createdAt),
    env.DB.prepare(
      `INSERT INTO system_logs_fts (log_id, search_text)
       VALUES (?, ?)`
    ).bind(id, buildLogSearchText([module, target, action, status, message]))
  ]);
}
