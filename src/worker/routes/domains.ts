import { Hono } from 'hono';
import { listCloudflareZones, listDomains, listSubdomains, removeLocalDomain } from '../domain-query';
import { refreshDomain } from '../domain-refresh';
import { addDomains, addSubdomains, runDomainSetup } from '../domain-setup';
import { pruneSystemLogs } from '../http/logs';
import { pageSize } from '../http/query';
import type { Env } from '../types';
import { apiOk, jsonFail } from '../utils';

const domainRoutes = new Hono<{ Bindings: Env }>();

domainRoutes.get('/', async (c) => {
  const size = pageSize(c.req.query('pageSize'));
  const keyword = (c.req.query('keyword') || '').trim();
  const data = await listDomains(c.env, { pageSize: size, keyword, cursor: c.req.query('cursor') || '' });
  return apiOk(c, data.items, { pageSize: data.pageSize, next_cursor: data.nextCursor, has_more: data.hasMore });
});

domainRoutes.get('/:id/subdomains', async (c) => {
  const size = pageSize(c.req.query('pageSize'));
  const keyword = (c.req.query('keyword') || '').trim();
  try {
    const data = await listSubdomains(c.env, { parentId: c.req.param('id'), pageSize: size, keyword, cursor: c.req.query('cursor') || '' });
    return apiOk(c, data.items, { pageSize: data.pageSize, next_cursor: data.nextCursor, has_more: data.hasMore });
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '子域名列表加载失败', 404, 'subdomains_not_found');
  }
});

domainRoutes.get('/zones', async (c) => {
  try {
    return apiOk(c, await listCloudflareZones(c.env));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare 域名加载失败';
    const code = /Cloudflare (账号 ID|接口令牌) 未配置/.test(message) ? 'cloudflare_config_required' : 'cloudflare_zones_failed';
    return jsonFail(c, message, 400, code);
  }
});

domainRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body && typeof body === 'object' ? (body as { zones?: unknown }) : {};
  const rawZones = Array.isArray(payload.zones) ? payload.zones : [];
  try {
    const result = await addDomains(c.env, rawZones);
    const records = result.items.flatMap((item) => (item.record ? [item.record] : []));
    c.executionCtx.waitUntil(runDomainSetup(c.env, records.map((record) => record.id), false));
    return apiOk(c, result);
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '添加域名失败', 400);
  }
});

domainRoutes.post('/:id/subdomains', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body && typeof body === 'object' ? (body as { prefixes?: unknown }) : {};
  const rawPrefixes = payload.prefixes;
  const prefixes = Array.isArray(rawPrefixes) ? rawPrefixes.map((item) => String(item)) : [];
  try {
    const result = await addSubdomains(c.env, c.req.param('id'), prefixes);
    const records = result.items.flatMap((item) => (item.record ? [item.record] : []));
    c.executionCtx.waitUntil(runDomainSetup(c.env, records.map((record) => record.id), true));
    return apiOk(c, result);
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '添加子域名失败', 400);
  }
});

domainRoutes.post('/:id/refresh', async (c) => {
  const result = await refreshDomain(c.env, c.req.param('id'));
  c.executionCtx.waitUntil(pruneSystemLogs(c.env));
  return apiOk(c, result);
});

domainRoutes.post('/:id/remove-local', async (c) => {
  try {
    return apiOk(c, await removeLocalDomain(c.env, c.req.param('id')));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '本地移除失败', 400);
  }
});

export default domainRoutes;
