import { Hono } from 'hono';
import { authStateFromConfig, normalizeAdminKey, verifyAdminKeyConfig } from './auth';
import { getAuthConfig, getSystemConfig } from './config';
import { hasValidCookieSession } from './http/auth';
import { publicFail, publicOk } from './http/public-response';
import { consumeRateLimit, rateLimitIdentity } from './http/rate-limit';
import authRoutes from './routes/auth';
import bootstrapRoutes from './routes/bootstrap';
import domainRoutes from './routes/domains';
import logRoutes from './routes/logs';
import mailsRoutes, { publicMailsRoutes } from './routes/mails';
import policyRoutes from './routes/policies';
import sendRoutes, { publicSendRoutes } from './routes/send';
import settingsRoutes from './routes/settings';
import type { Env } from './types';
import { apiFail } from './utils';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  c.header('Server-Timing', `app;dur=${Date.now() - start}`);
});

function isInternalAuthEntry(path: string) {
  return path === '/api/internal/bootstrap' || path === '/api/internal/auth/setup' || path === '/api/internal/auth/login' || path === '/api/internal/auth/logout';
}

app.use('/api/internal/*', async (c, next) => {
  if (isInternalAuthEntry(c.req.path)) {
    return next();
  }

  const authConfig = await getAuthConfig(c.env);
  const authState = authStateFromConfig(authConfig);
  if (!authState.initialized) {
    return apiFail(c, '系统尚未初始化', 428, 'SETUP_REQUIRED');
  }

  if (!(await hasValidCookieSession(c, authState.version))) {
    return apiFail(c, '未授权', 401, 'unauthorized');
  }

  return next();
});

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health' || c.req.path.startsWith('/api/internal/')) {
    return next();
  }

  const authConfig = await getAuthConfig(c.env);
  const authState = authStateFromConfig(authConfig);
  if (!authState.initialized) {
    return publicFail(c, '系统尚未初始化', 428, 'SETUP_REQUIRED');
  }

  const adminKeyValid = await verifyAdminKeyConfig(authConfig, normalizeAdminKey(c.req.header('X-Admin-Key')));
  if (!adminKeyValid) {
    const system = await getSystemConfig(c.env);
    const limited = await consumeRateLimit(c.env, 'publicApi', rateLimitIdentity(c), system.rateLimit.publicApi);
    if (limited) {
      return publicFail(c, '请求过于频繁，请稍后再试', 429, 'rate_limited');
    }
    return publicFail(c, '未授权', 401, 'unauthorized');
  }

  return next();
});

app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      success: false,
      result: null,
      errors: [{ code: 'server_error', message: '服务器异常' }],
      messages: [],
      result_info: {}
    },
    { status: 500 }
  );
});

app.get('/api/health', (c) => publicOk(c, { ok: true }));
app.route('/api/internal/auth', authRoutes);
app.route('/api/internal/bootstrap', bootstrapRoutes);
app.route('/api/internal/mails', mailsRoutes);
app.route('/api/internal', sendRoutes);
app.route('/api/internal/domains', domainRoutes);
app.route('/api/internal/settings', settingsRoutes);
app.route('/api/internal/policies', policyRoutes);
app.route('/api/internal/logs', logRoutes);

app.route('/api/mails', publicMailsRoutes);
app.route('/api', publicSendRoutes);

export default app;
