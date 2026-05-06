import { Hono } from 'hono';
import { authStateFromConfig, changeAdminKey, initializeAdminKey, normalizeAdminKey, verifyAdminKeyConfig } from '../auth';
import { clearAuthConfigCache, getAuthConfig, getSystemConfig } from '../config';
import { clearAuthSession, createAuthSession } from '../http/auth';
import { consumeRateLimit, rateLimitIdentity } from '../http/rate-limit';
import type { Env } from '../types';
import { apiFail, apiOk, jsonFail } from '../utils';

const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/setup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const adminKey = normalizeAdminKey(body && typeof body === 'object' ? (body as { adminKey?: unknown }).adminKey : '');

  try {
    const version = await initializeAdminKey(c.env, adminKey);
    clearAuthConfigCache(c.env);
    await createAuthSession(c, version);
    return apiOk(c, { initialized: true, authenticated: true });
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '初始化失败', 400);
  }
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const adminKey = normalizeAdminKey(body && typeof body === 'object' ? (body as { adminKey?: unknown }).adminKey : '');
  const authConfig = await getAuthConfig(c.env);
  const authState = authStateFromConfig(authConfig);

  if (!authState.initialized) {
    await clearAuthSession(c);
    return apiFail(c, '系统尚未初始化', 428, 'SETUP_REQUIRED');
  }

  if (!(await verifyAdminKeyConfig(authConfig, adminKey))) {
    const system = await getSystemConfig(c.env);
    const limited = await consumeRateLimit(c.env, 'login', rateLimitIdentity(c), system.rateLimit.login);
    await clearAuthSession(c);
    if (limited) {
      return apiFail(c, '登录尝试过于频繁，请稍后再试', 429, 'rate_limited');
    }
    return apiFail(c, '管理员 Key 不正确', 401, 'unauthorized');
  }

  await createAuthSession(c, authState.version);
  return apiOk(c, { authenticated: true });
});

authRoutes.put('/admin-key', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payload = body && typeof body === 'object' ? (body as { currentKey?: unknown; newKey?: unknown }) : {};
  const currentKey = normalizeAdminKey(payload.currentKey);
  const newKey = normalizeAdminKey(payload.newKey);

  try {
    const version = await changeAdminKey(c.env, currentKey, newKey);
    clearAuthConfigCache(c.env);
    await createAuthSession(c, version);
    return apiOk(c, { authenticated: true });
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '修改管理员 Key 失败', 400);
  }
});

authRoutes.post('/logout', async (c) => {
  await clearAuthSession(c);
  return apiOk(c, { authenticated: false });
});

export default authRoutes;
