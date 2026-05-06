import { Hono } from 'hono';
import { deleteOrphanSystemLogFts, systemLogModuleSet, systemLogStatusSet } from '../http/logs';
import { encodeCreatedAtCursor, normalizeSearchKeyword, pageSize, parseCreatedAtCursor } from '../http/query';
import { buildFtsQuery } from '../mail-content';
import type { Env } from '../types';
import { apiOk } from '../utils';

const logRoutes = new Hono<{ Bindings: Env }>();

function buildLogWhere(keyword: string, module: string, status: string, cursor: ReturnType<typeof parseCreatedAtCursor>) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (module) {
    where.push(`module = ?`);
    params.push(module);
  }

  if (status) {
    where.push(`status = ?`);
    params.push(status);
  }

  const ftsQuery = keyword ? buildFtsQuery(keyword) : '';
  if (ftsQuery) {
    where.push(`id IN (
      SELECT log_id
      FROM system_logs_fts
      WHERE system_logs_fts MATCH ?
    )`);
    params.push(ftsQuery);
  }

  if (cursor) {
    where.push(`(created_at < ? OR (created_at = ? AND id < ?))`);
    params.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params
  };
}

logRoutes.get('/', async (c) => {
  const size = pageSize(c.req.query('per_page') || c.req.query('pageSize'), 50, 10, 200);
  const keyword = normalizeSearchKeyword(c.req.query('keyword') || '');
  const rawModule = (c.req.query('module') || '').trim();
  const rawStatus = (c.req.query('status') || '').trim();
  const module = systemLogModuleSet.has(rawModule) ? rawModule : '';
  const status = systemLogStatusSet.has(rawStatus) ? rawStatus : '';
  const cursor = parseCreatedAtCursor((c.req.query('cursor') || '').trim());
  const where = buildLogWhere(keyword, module, status, cursor);

  const limit = size + 1;
  const rows = await c.env.DB.prepare(
    `SELECT id, module, target, action, status, message, created_at AS createdAt
     FROM system_logs
     ${where.sql}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )
    .bind(...where.params, limit)
    .all<Record<string, unknown>>();

  const rawItems = rows.results || [];
  const hasMore = rawItems.length > size;
  const items = rawItems.slice(0, size);
  const nextCursor = hasMore ? encodeCreatedAtCursor(items[items.length - 1]) : '';

  return apiOk(c, items, { per_page: size, next_cursor: nextCursor, has_more: hasMore });
});

logRoutes.delete('/', async (c) => {
  const keyword = normalizeSearchKeyword(c.req.query('keyword') || '');
  const rawModule = (c.req.query('module') || '').trim();
  const rawStatus = (c.req.query('status') || '').trim();
  const module = systemLogModuleSet.has(rawModule) ? rawModule : '';
  const status = systemLogStatusSet.has(rawStatus) ? rawStatus : '';
  const where = buildLogWhere(keyword, module, status, null);

  if (!where.sql) {
    await c.env.DB.prepare(`DELETE FROM system_logs`).run();
  } else {
    await c.env.DB.prepare(
      `DELETE FROM system_logs
       WHERE id IN (
         SELECT id
         FROM system_logs
         ${where.sql}
       )`
    )
      .bind(...where.params)
      .run();
  }
  await deleteOrphanSystemLogFts(c.env);
  return apiOk(c, null);
});

export default logRoutes;
