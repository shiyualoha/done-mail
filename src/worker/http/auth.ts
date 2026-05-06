import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env } from '../types';

const authCookieName = 'done-mail-session';
const authSessionPrefix = 'auth:session:';
export const authSessionTtl = 60 * 60 * 24 * 30;

type AppContext = Context<{ Bindings: Env }>;

function isTrustedCookieRequest(req: Request) {
  const origin = req.headers.get('Origin');
  if (!origin) return true;
  return origin === new URL(req.url).origin;
}

export async function hasValidCookieSession(c: AppContext, authVersion: string) {
  if (!isTrustedCookieRequest(c.req.raw)) return false;
  const sessionId = getCookie(c, authCookieName);
  if (!sessionId) return false;
  return (await c.env.KV.get(`${authSessionPrefix}${sessionId}`)) === authVersion;
}

function setAuthCookie(c: AppContext, sessionId: string) {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, authCookieName, sessionId, {
    httpOnly: true,
    maxAge: authSessionTtl,
    path: '/',
    sameSite: 'Strict',
    secure
  });
}

function clearAuthCookie(c: AppContext) {
  const secure = new URL(c.req.url).protocol === 'https:';
  deleteCookie(c, authCookieName, {
    path: '/',
    secure
  });
}

export async function createAuthSession(c: AppContext, authVersion: string) {
  const sessionId = crypto.randomUUID();
  await c.env.KV.put(`${authSessionPrefix}${sessionId}`, authVersion, { expirationTtl: authSessionTtl });
  setAuthCookie(c, sessionId);
}

export async function clearAuthSession(c: AppContext) {
  const sessionId = getCookie(c, authCookieName);
  if (sessionId) {
    await c.env.KV.delete(`${authSessionPrefix}${sessionId}`);
  }
  clearAuthCookie(c);
}
