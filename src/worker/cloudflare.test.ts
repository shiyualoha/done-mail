import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareService } from './cloudflare';

function cloudflareResponse(result: unknown) {
  return Response.json({ success: true, result });
}

describe('CloudflareService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('统一返回 workers.dev、自定义域名和路由入口', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;

      if (path === '/client/v4/accounts/account_1/workers/subdomain') {
        return cloudflareResponse({ subdomain: 'owner-name' });
      }
      if (path === '/client/v4/accounts/account_1/workers/scripts/done-mail/subdomain') {
        return cloudflareResponse({ enabled: true, previews_enabled: true });
      }
      if (path === '/client/v4/accounts/account_1/workers/domains') {
        return cloudflareResponse([
          { hostname: 'mail.example.com', service: 'done-mail' },
          { hostname: 'other.example.com', service: 'other-worker' }
        ]);
      }
      if (path === '/client/v4/accounts/account_1/workers/scripts') {
        return cloudflareResponse([
          {
            id: 'done-mail',
            routes: [
              { pattern: 'route.example.com/*', script: 'done-mail' },
              { pattern: 'ignored.example.com/*', script: 'other-worker' }
            ]
          }
        ]);
      }

      return Response.json({ success: false, errors: [{ message: `Unexpected path: ${path}` }] }, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = CloudflareService.fromToken('cf-token', 'account_1');
    await expect(service.getWorkerEntryOrigins('account_1', 'done-mail')).resolves.toEqual([
      { label: 'done-mail.owner-name.workers.dev', value: 'https://done-mail.owner-name.workers.dev', source: 'workers_dev' },
      { label: 'mail.example.com', value: 'https://mail.example.com', source: 'custom_domain' },
      { label: 'route.example.com', value: 'https://route.example.com', source: 'route' }
    ]);
  });
});
