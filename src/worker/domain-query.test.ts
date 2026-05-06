import { describe, expect, it, vi } from 'vitest';
import { encodeNameCursor } from './http/query';
import { listDomains, listSubdomains } from './domain-query';
import type { DomainRecord, Env } from './types';

function domainRow(input: Partial<DomainRecord>): DomainRecord {
  return {
    id: input.id || 'domain_1',
    zone_id: input.zone_id || 'zone_1',
    zone_name: input.zone_name || input.name || 'example.com',
    name: input.name || 'example.com',
    parent_domain_id: input.parent_domain_id || null,
    is_subdomain: input.is_subdomain || 0,
    setup_status: input.setup_status || 'ready',
    email_routing_enabled: input.email_routing_enabled ?? 1,
    dns_configured: input.dns_configured ?? 1,
    catchall_enabled: input.catchall_enabled ?? 1,
    worker_action_enabled: input.worker_action_enabled ?? 1,
    last_checked_at: input.last_checked_at || null,
    last_error: input.last_error || null,
    created_at: input.created_at || '',
    updated_at: input.updated_at || ''
  };
}

function createEnv(results: unknown[] = [], first: unknown | null = null) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const statement = (sql: string) => ({
    bind: (...params: unknown[]) => {
      calls.push({ sql, params });
      return {
        all: async () => ({ results }),
        first: async () => first
      };
    },
    all: async () => ({ results }),
    first: async () => first
  });

  return {
    env: {
      DB: {
        prepare: vi.fn(statement)
      }
    } as unknown as Env,
    calls
  };
}

describe('domain query', () => {
  it('主域名列表使用名称游标分页', async () => {
    const rows = Array.from({ length: 11 }, (_, index) =>
      domainRow({ id: `root_${index}`, name: `domain-${index}.com`, is_subdomain: 0 })
    );
    const { env, calls } = createEnv(rows);

    const page = await listDomains(env, { pageSize: 10, keyword: '', cursor: encodeNameCursor({ name: 'domain-0.com', id: 'root_0' }) });

    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
    expect(calls[0].sql).not.toContain('OFFSET');
    expect(calls[0].sql).not.toContain('COUNT(*) FROM domains root');
    expect(calls[0].sql).toContain('root.name > ? OR (root.name = ? AND root.id > ?)');
    expect(calls[0].sql).toContain('ORDER BY root.name ASC, root.id ASC');
    expect(calls[0].params).toEqual(['domain-0.com', 'domain-0.com', 'root_0', 11]);
  });

  it('子域名列表使用名称游标并保留父域过滤', async () => {
    const parent = domainRow({ id: 'root_1', name: 'example.com', is_subdomain: 0 });
    const children = Array.from({ length: 6 }, (_, index) =>
      domainRow({ id: `child_${index}`, name: `sub-${index}.example.com`, parent_domain_id: 'root_1', is_subdomain: 1 })
    );
    const { env, calls } = createEnv(children, parent);

    const page = await listSubdomains(env, { parentId: 'root_1', pageSize: 5, keyword: 'sub', cursor: encodeNameCursor({ name: 'sub-0.example.com', id: 'child_0' }) });

    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    expect(calls[0].sql).toContain('WHERE id = ?');
    expect(calls[1].sql).not.toContain('OFFSET');
    expect(calls[1].sql).toContain('child.parent_domain_id = ?');
    expect(calls[1].sql).toContain('child.name > ? OR (child.name = ? AND child.id > ?)');
    expect(calls[1].params).toEqual(['root_1', 'sub', 'sub\uffff', 'sub', 'sub\uffff', 'sub-0.example.com', 'sub-0.example.com', 'child_0', 6]);
  });
});
