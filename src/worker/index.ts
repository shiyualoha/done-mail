import app from './app';
import { authStateFromConfig } from './auth';
import { getAuthConfig, getSystemConfig } from './config';
import { cleanupExpiredMails, handleIncomingEmail } from './mail';
import { cleanupExpiredRateLimits, consumeRateLimit, rateLimitIdentityFromRequest } from './http/rate-limit';
import { ensureMigrated } from './schema';
import { downloadShareAttachment, renderSharePage, renderShareRateLimitedPage } from './share-page';
import type { Env } from './types';

function sameOrigin(requestUrl: URL, baseUrl: string) {
  if (!baseUrl) return false;
  try {
    const base = new URL(baseUrl);
    return requestUrl.protocol === base.protocol && requestUrl.host === base.host;
  } catch {
    return false;
  }
}

function isSharePath(pathname: string) {
  return /^\/mail\/[^/]+(?:\/attachments\/[^/]+)?$/.test(pathname);
}

function isStaticPath(pathname: string) {
  return pathname.startsWith('/assets/') || pathname.startsWith('/static/') || pathname === '/favicon.svg';
}

async function originAllowed(req: Request, env: Env, url: URL) {
  const auth = authStateFromConfig(await getAuthConfig(env));
  if (!auth.initialized) return true;

  const system = await getSystemConfig(env);
  if (!system.adminBaseUrl) return true;
  if (sameOrigin(url, system.adminBaseUrl)) return true;
  if (system.shareBaseUrl && sameOrigin(url, system.shareBaseUrl)) {
    return isSharePath(url.pathname) || isStaticPath(url.pathname);
  }
  return req.method === 'GET' && isStaticPath(url.pathname);
}

function notFound() {
  return new Response('Not Found', { status: 404 });
}

async function consumeShareAccessRateLimit(req: Request, env: Env) {
  const system = await getSystemConfig(env);
  return consumeRateLimit(env, 'publicShare', rateLimitIdentityFromRequest(req), system.rateLimit.publicShare);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (req.method === 'GET' && isStaticPath(url.pathname)) {
      return env.ASSETS.fetch(req);
    }
    if (!(await originAllowed(req, env, url))) return notFound();

    const shareAttachmentMatch = /^\/mail\/([^/]+)\/attachments\/([^/]+)$/.exec(url.pathname);
    if (shareAttachmentMatch) {
      await ensureMigrated(env);
      if (await consumeShareAccessRateLimit(req, env)) return renderShareRateLimitedPage();
      return downloadShareAttachment(env, decodeURIComponent(shareAttachmentMatch[1]), decodeURIComponent(shareAttachmentMatch[2]));
    }
    const sharePageMatch = /^\/mail\/([^/]+)$/.exec(url.pathname);
    if (sharePageMatch) {
      await ensureMigrated(env);
      if (await consumeShareAccessRateLimit(req, env)) return renderShareRateLimitedPage();
      return renderSharePage(env, decodeURIComponent(sharePageMatch[1]), url.searchParams.get('remote') === '1');
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/health') {
        await ensureMigrated(env);
      }
      return app.fetch(req, env, ctx);
    }
    return env.ASSETS.fetch(req);
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    await ensureMigrated(env);
    await handleIncomingEmail(message, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ensureMigrated(env).then(() => Promise.all([cleanupExpiredMails(env), cleanupExpiredRateLimits(env)])));
  }
} satisfies ExportedHandler<Env>;
