import { Hono } from 'hono';
import { buildSettingsUpdate, getCloudflareConfig, getPublicSettings, saveSettingsUpdate } from '../config';
import { CloudflareService } from '../cloudflare';
import { createForwardAddress, listForwardAddressStatuses, normalizeForwardAddressList } from '../forward-addresses';
import type { Env } from '../types';
import { apiOk, jsonFail } from '../utils';

const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.get('/', async (c) => {
  return apiOk(c, await getPublicSettings(c.env));
});

settingsRoutes.put('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const next = await buildSettingsUpdate(c.env, body);
  return apiOk(c, await saveSettingsUpdate(c.env, next));
});

settingsRoutes.post('/test-cloudflare', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const current = await getCloudflareConfig(c.env);
  const cloudflare = body && typeof body === 'object' && 'cloudflare' in body ? (body as { cloudflare?: Record<string, unknown> }).cloudflare || {} : {};
  const apiToken = String(cloudflare.apiToken || current.apiToken || '').trim();
  const accountId = String(cloudflare.accountId || current.accountId || '').trim();
  const service = CloudflareService.fromToken(apiToken, accountId);
  return apiOk(c, await service.inspect());
});

settingsRoutes.get('/entry-origins', async (c) => {
  try {
    const current = await getCloudflareConfig(c.env);
    const service = CloudflareService.fromToken(current.apiToken, current.accountId);
    return apiOk(c, await service.getWorkerEntryOrigins(current.accountId, current.workerName));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '入口地址读取失败', 400, 'entry_origins_failed');
  }
});

settingsRoutes.get('/forward-addresses', async (c) => {
  try {
    const emails = normalizeForwardAddressList(c.req.queries('email') || []);
    return apiOk(c, await listForwardAddressStatuses(c.env, emails));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '转发目标读取失败', 400, 'forward_addresses_failed');
  }
});

settingsRoutes.post('/forward-addresses', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = body && typeof body === 'object' && 'email' in body ? String((body as { email?: unknown }).email || '') : '';
  try {
    return apiOk(c, await createForwardAddress(c.env, email));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '转发目标添加失败', 400, 'forward_address_create_failed');
  }
});

export default settingsRoutes;
