import { describe, expect, it, vi } from 'vitest';
import app from './app';
import { initializeAdminKey } from './auth';
import { authSessionTtl } from './http/auth';
import type { Env } from './types';

function createKv() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const now = () => Math.floor(Date.now() / 1000);
  return {
    get: async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && item.expiresAt <= now()) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, { value, expiresAt: options?.expirationTtl ? now() + options.expirationTtl : 0 });
    },
    delete: async (key: string) => {
      store.delete(key);
    }
  };
}

function createDb() {
  const emptyAll = { all: async () => ({ results: [] }), first: async () => null };
  const rateLimits = new Map<string, { scope: string; count: number; reset_at: number; updated_at: number }>();
  const rateLimitWrites: string[] = [];
  const result = {
    all: async () => ({ results: [] }),
    first: async () => null
  };
  return {
    rateLimitWrites,
    prepare: (sql: string) => {
      if (sql.includes('INSERT INTO rate_limits')) {
        const statement = {
          bind: (key: string, scope: string, resetAt: number, now: number) => ({
            first: async () => {
              rateLimitWrites.push(scope);
              const current = rateLimits.get(key);
              const next =
                !current || current.reset_at <= now
                  ? { scope, count: 1, reset_at: resetAt, updated_at: now }
                  : { scope: current.scope, count: current.count + 1, reset_at: current.reset_at, updated_at: now };
              rateLimits.set(key, next);
              return { count: next.count };
            }
          })
        };
        return statement;
      }
      if (sql.includes('FROM mails')) {
        return {
          bind: () => emptyAll,
          ...emptyAll
        };
      }
      return {
        bind: () => result,
        ...result
      };
    }
  };
}

async function createEnv() {
  const db = createDb();
  const env = {
    KV: createKv(),
    DB: db,
    ASSETS: { fetch: async () => new Response('', { status: 404 }) }
  } as unknown as Env & { __db: ReturnType<typeof createDb> };
  const version = await initializeAdminKey(env, 'admin-key-123');
  await env.KV.put('auth:session:test-session', version, { expirationTtl: authSessionTtl });
  env.__db = db;
  return env;
}

function sessionCookie(response: Response) {
  const cookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  expect(cookie).toContain('done-mail-session=');
  return cookie.split(';')[0];
}

describe('app auth split', () => {
  it('bootstrap 一次返回初始化和登录态', async () => {
    const env = await createEnv();

    const withoutCookie = await app.fetch(new Request('https://example.com/api/internal/bootstrap'), env);
    expect(withoutCookie.status).toBe(200);
    await expect(withoutCookie.json()).resolves.toMatchObject({
      success: true,
      result: { auth: { initialized: true, authenticated: false } }
    });

    const withCookie = await app.fetch(new Request('https://example.com/api/internal/bootstrap', { headers: { Cookie: 'done-mail-session=test-session' } }), env);
    expect(withCookie.status).toBe(200);
    await expect(withCookie.json()).resolves.toMatchObject({
      success: true,
      result: { auth: { initialized: true, authenticated: true } }
    });
  });

  it('登录成功会写入 Cookie 会话并被 bootstrap 识别', async () => {
    const env = await createEnv();
    const response = await app.fetch(
      new Request('https://example.com/api/internal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: 'admin-key-123' })
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, result: { authenticated: true } });
    expect(env.__db.rateLimitWrites).toEqual([]);

    const bootstrap = await app.fetch(new Request('https://example.com/api/internal/bootstrap', { headers: { Cookie: sessionCookie(response) } }), env);
    expect(bootstrap.status).toBe(200);
    await expect(bootstrap.json()).resolves.toMatchObject({
      success: true,
      result: { auth: { initialized: true, authenticated: true } }
    });
  });

  it('初始化成功会写入 Cookie 会话并被 bootstrap 识别', async () => {
    const env = {
      KV: createKv(),
      DB: createDb(),
      ASSETS: { fetch: async () => new Response('', { status: 404 }) }
    } as unknown as Env;
    const response = await app.fetch(
      new Request('https://example.com/api/internal/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: 'admin-key-123' })
      }),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, result: { initialized: true, authenticated: true } });

    const bootstrap = await app.fetch(new Request('https://example.com/api/internal/bootstrap', { headers: { Cookie: sessionCookie(response) } }), env);
    expect(bootstrap.status).toBe(200);
    await expect(bootstrap.json()).resolves.toMatchObject({
      success: true,
      result: { auth: { initialized: true, authenticated: true } }
    });
  });

  it('旧认证检查接口已删除', async () => {
    const env = await createEnv();

    const setupCheck = await app.fetch(new Request('https://example.com/api/internal/auth/setup'), env);
    const sessionCheck = await app.fetch(new Request('https://example.com/api/internal/auth/session', { headers: { Cookie: 'done-mail-session=test-session' } }), env);
    const stateCheck = await app.fetch(new Request('https://example.com/api/internal/auth/state', { headers: { Cookie: 'done-mail-session=test-session' } }), env);

    expect(setupCheck.status).toBe(404);
    expect(sessionCheck.status).toBe(404);
    expect(stateCheck.status).toBe(404);
  });

  it('独立发送设置接口已删除', async () => {
    const env = await createEnv();

    const response = await app.fetch(new Request('https://example.com/api/internal/send/settings', { headers: { Cookie: 'done-mail-session=test-session' } }), env);

    expect(response.status).toBe(404);
  });

  it('后台内部接口只接受 Cookie 会话', async () => {
    const env = await createEnv();

    const withAdminKey = await app.fetch(new Request('https://example.com/api/internal/mails', { headers: { 'X-Admin-Key': 'admin-key-123' } }), env);
    expect(withAdminKey.status).toBe(401);

    const withCookie = await app.fetch(
      new Request('https://example.com/api/internal/mails', { headers: { Cookie: 'done-mail-session=test-session' } }),
      env
    );
    expect(withCookie.status).toBe(200);
  });

  it('公开接口只接受 X-Admin-Key', async () => {
    const env = await createEnv();

    const withCookie = await app.fetch(new Request('https://example.com/api/mails', { headers: { Cookie: 'done-mail-session=test-session' } }), env);
    expect(withCookie.status).toBe(401);

    const withAdminKey = await app.fetch(new Request('https://example.com/api/mails', { headers: { 'X-Admin-Key': 'admin-key-123' } }), env);
    expect(withAdminKey.status).toBe(200);
    await expect(withAdminKey.json()).resolves.toMatchObject({ ok: true, data: [], pagination: { hasMore: false } });
  });

  it('公开接口只保留查邮件列表、发邮件、生成分享和附件下载', async () => {
    const env = await createEnv();
    const headers = { 'X-Admin-Key': 'admin-key-123' };

    const mailDetail = await app.fetch(new Request('https://example.com/api/mails/mail_1', { headers }), env);
    const mailbox = await app.fetch(new Request('https://example.com/api/mailboxes/user@example.com/mails', { headers }), env);
    const sentMails = await app.fetch(new Request('https://example.com/api/sent-mails', { headers }), env);

    expect(mailDetail.status).toBe(404);
    expect(mailbox.status).toBe(404);
    expect(sentMails.status).toBe(404);
  });

  it('公开附件下载只作为邮件策略附件路径保留', async () => {
    const env = await createEnv();
    const attachment = await app.fetch(
      new Request('https://example.com/api/mails/mail_1/attachments/att_1', { headers: { 'X-Admin-Key': 'admin-key-123' } }),
      env
    );

    expect(attachment.status).toBe(404);
    await expect(attachment.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'attachment_storage_disabled' }
    });
  });

  it('公开接口鉴权成功不写限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        rateLimit: {
          login: 10,
          publicApi: 1,
          publicShare: 100
        }
      })
    );
    const headers = {
      'X-Admin-Key': 'admin-key-123',
      'CF-Connecting-IP': '203.0.113.10'
    };

    const first = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);
    const second = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(env.__db.rateLimitWrites).toEqual([]);
  });

  it('公开接口鉴权失败才计入公共接口限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        rateLimit: {
          login: 10,
          publicApi: 1,
          publicShare: 100
        }
      })
    );
    const headers = {
      'X-Admin-Key': 'wrong-key',
      'CF-Connecting-IP': '203.0.113.13'
    };

    const first = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);
    const second = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });

  it('公开查邮件和发邮件共用鉴权失败限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        rateLimit: {
          login: 10,
          publicApi: 1,
          publicShare: 100
        }
      })
    );
    const headers = {
      'X-Admin-Key': 'wrong-key',
      'CF-Connecting-IP': '203.0.113.12',
      'Content-Type': 'application/json'
    };

    const list = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);
    const send = await app.fetch(
      new Request('https://example.com/api/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ from: 'a@example.com', to: 'b@example.com', subject: 'Test', text: 'Body' })
      }),
      env
    );

    expect(list.status).toBe(401);
    expect(send.status).toBe(429);
    await expect(send.json()).resolves.toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });

  it('未知公开接口鉴权失败也计入公共接口限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        rateLimit: {
          login: 10,
          publicApi: 1,
          publicShare: 100
        }
      })
    );
    const headers = {
      'X-Admin-Key': 'wrong-key',
      'CF-Connecting-IP': '203.0.113.15'
    };

    const first = await app.fetch(new Request('https://example.com/api/not-exist', { headers }), env);
    const second = await app.fetch(new Request('https://example.com/api/not-exist', { headers }), env);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });

  it('公开创建分享链接不使用分享访问限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        shareBaseUrl: 'https://share.example.com',
        mailShareTtlHours: 168,
        rateLimit: {
          login: 10,
          publicApi: 1,
          publicShare: 1
        }
      })
    );
    const headers = {
      'X-Admin-Key': 'admin-key-123',
      'CF-Connecting-IP': '203.0.113.14'
    };

    const list = await app.fetch(new Request('https://example.com/api/mails', { headers }), env);
    const firstShare = await app.fetch(new Request('https://example.com/api/mails/mail_1/share', { method: 'POST', headers }), env);
    const secondShare = await app.fetch(new Request('https://example.com/api/mails/mail_1/share', { method: 'POST', headers }), env);

    expect(list.status).toBe(200);
    expect(firstShare.status).toBe(400);
    expect(secondShare.status).toBe(400);
    expect(env.__db.rateLimitWrites).toEqual([]);
  });

  it('登录失败才按系统配置限流', async () => {
    const env = await createEnv();
    await env.KV.put(
      'config:system',
      JSON.stringify({
        cleanupEnabled: true,
        mailRetentionDays: 30,
        acceptForwardedMail: true,
        rateLimit: {
          login: 1,
          publicApi: 10,
          publicShare: 100
        }
      })
    );
    const init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.11'
      },
      body: JSON.stringify({ adminKey: 'wrong-key' })
    };

    const first = await app.fetch(new Request('https://example.com/api/internal/auth/login', init), env);
    const second = await app.fetch(new Request('https://example.com/api/internal/auth/login', init), env);

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ errors: [{ code: 'rate_limited' }] });
  });

  it('未捕获异常不向客户端返回内部错误', async () => {
    const env = await createEnv();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const brokenEnv = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('D1 secret internal detail');
        }
      }
    } as unknown as Env;

    const response = await app.fetch(
      new Request('https://example.com/api/mails', { headers: { 'X-Admin-Key': 'admin-key-123' } }),
      brokenEnv
    );
    const body = await response.json() as { errors: Array<{ message: string }> };

    expect(response.status).toBe(500);
    expect(body.errors[0].message).toBe('服务器异常');
    expect(body.errors[0].message).not.toContain('D1 secret internal detail');
    errorSpy.mockRestore();
  });
});
