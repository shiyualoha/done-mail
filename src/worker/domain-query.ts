import { CloudflareService } from './cloudflare';
import { getDomainById } from './domain-common';
import { encodeNameCursor, parseNameCursor } from './http/query';
import type { DomainRecord, Env } from './types';

export async function listCloudflareZones(env: Env) {
  const service = await CloudflareService.fromEnv(env);
  const zones = await service.getZones();
  return zones.sort((a, b) => a.name.localeCompare(b.name));
}

export interface DomainListQuery {
  pageSize: number;
  keyword: string;
  cursor?: string;
}

export interface SubdomainListQuery extends DomainListQuery {
  parentId: string;
}

const domainSelectFields = `id, zone_id, zone_name, name, parent_domain_id, is_subdomain, setup_status,
            email_routing_enabled, dns_configured, catchall_enabled,
            worker_action_enabled, last_checked_at, last_error, created_at, updated_at`;

function normalizedDomainKeyword(value: string) {
  return value.trim().toLowerCase();
}

function prefixUpperBound(value: string) {
  return `${value}\uffff`;
}

function domainPrefixWhere(alias: string, fields: string[]) {
  return `(${fields.map((field) => `(${alias}.${field} >= ? AND ${alias}.${field} < ?)`).join(' OR ')})`;
}

function pushDomainPrefixParams(params: unknown[], keyword: string, fields: number) {
  const end = prefixUpperBound(keyword);
  for (let index = 0; index < fields; index += 1) {
    params.push(keyword, end);
  }
}

function isDomainError(record: DomainRecord) {
  return Boolean(
    record.last_error ||
      record.setup_status !== 'ready' ||
      record.email_routing_enabled !== 1 ||
      record.dns_configured !== 1 ||
      record.catchall_enabled !== 1 ||
      record.worker_action_enabled !== 1
  );
}

export async function listDomains(env: Env, query: DomainListQuery) {
  const where = ['root.is_subdomain = 0'];
  const params: unknown[] = [];
  const keyword = normalizedDomainKeyword(query.keyword);
  const cursor = parseNameCursor(query.cursor || '');

  if (keyword) {
    where.push(`(
      ${domainPrefixWhere('root', ['name', 'zone_name'])}
      OR EXISTS (
        SELECT 1
        FROM domains child
        WHERE child.parent_domain_id = root.id
          AND ${domainPrefixWhere('child', ['name'])}
      )
    )`);
    pushDomainPrefixParams(params, keyword, 3);
  }

  if (cursor) {
    where.push(`(root.name > ? OR (root.name = ? AND root.id > ?))`);
    params.push(cursor.name, cursor.name, cursor.id);
  }

  const whereSql = where.join(' AND ');
  const limit = query.pageSize + 1;

  const roots = await env.DB.prepare(
    `SELECT ${domainSelectFields
      .split(',')
      .map((field) => `root.${field.trim()}`)
      .join(', ')},
        (
          SELECT COUNT(*)
          FROM domains child_count
          WHERE child_count.parent_domain_id = root.id
        ) AS child_count
     FROM domains root
     WHERE ${whereSql}
     ORDER BY root.name ASC, root.id ASC
     LIMIT ?`
  )
    .bind(...params, limit)
    .all<DomainRecord>();

  const rawItems = roots.results || [];
  const hasMore = rawItems.length > query.pageSize;
  const items = rawItems.slice(0, query.pageSize);

  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeNameCursor(items[items.length - 1]) : '',
    pageSize: query.pageSize
  };
}

export async function removeLocalDomain(env: Env, id: string) {
  const record = await getDomainById(env, id);
  if (!record) throw new Error('域名不存在');
  if (!isDomainError(record)) throw new Error('只有异常状态的域名可以移除本地记录');

  if (record.is_subdomain === 1) {
    await env.DB.prepare(`DELETE FROM domains WHERE id = ?`).bind(id).run();
    return { id, domain: record.name, removed: 1 };
  }

  const result = await env.DB.prepare(`DELETE FROM domains WHERE id = ? OR parent_domain_id = ?`).bind(id, id).run();
  return { id, domain: record.name, removed: result.meta.changes || 0 };
}

export async function listSubdomains(env: Env, query: SubdomainListQuery) {
  const parent = await getDomainById(env, query.parentId);
  if (!parent || parent.is_subdomain === 1) {
    throw new Error('主域名不存在');
  }

  const where = ['child.is_subdomain = 1', 'child.parent_domain_id = ?'];
  const params: unknown[] = [query.parentId];
  const keyword = normalizedDomainKeyword(query.keyword);
  const cursor = parseNameCursor(query.cursor || '');

  if (keyword) {
    where.push(domainPrefixWhere('child', ['name', 'zone_name']));
    pushDomainPrefixParams(params, keyword, 2);
  }

  if (cursor) {
    where.push(`(child.name > ? OR (child.name = ? AND child.id > ?))`);
    params.push(cursor.name, cursor.name, cursor.id);
  }

  const whereSql = where.join(' AND ');
  const limit = query.pageSize + 1;

  const rows = await env.DB.prepare(
    `SELECT ${domainSelectFields
      .split(',')
      .map((field) => `child.${field.trim()}`)
      .join(', ')}
     FROM domains child
     WHERE ${whereSql}
     ORDER BY child.name ASC, child.id ASC
     LIMIT ?`
  )
    .bind(...params, limit)
    .all<DomainRecord>();

  const rawItems = rows.results || [];
  const hasMore = rawItems.length > query.pageSize;
  const items = rawItems.slice(0, query.pageSize);

  return {
    items,
    hasMore,
    nextCursor: hasMore ? encodeNameCursor(items[items.length - 1]) : '',
    pageSize: query.pageSize
  };
}
