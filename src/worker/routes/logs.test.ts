import { describe, expect, it, vi } from 'vitest';
import logRoutes from './logs';
import type { Env } from '../types';

function createKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    })
  };
}

function createDb(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn((...params: unknown[]) => {
        calls.push({ sql, params });
        return statement;
      }),
      all: vi.fn(async () => ({ results: rows })),
      run: vi.fn(async () => {
        calls.push({ sql, params: [] });
        return { meta: { changes: 1 } };
      })
    };
    return statement;
  });

  return {
    calls,
    prepare
  };
}

function createEnv(rows: Record<string, unknown>[] = [], kv: Record<string, string> = {}) {
  const db = createDb(rows);
  return {
    env: {
      KV: createKv(kv),
      DB: {
        prepare: db.prepare,
        batch: vi.fn(async () => [])
      }
    } as unknown as Env,
    db
  };
}

describe('logs route', () => {
  it('按状态筛选并使用游标分页', async () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `log_${String(index).padStart(2, '0')}`,
      module: 'domain',
      target: `${index}.example.com`,
      action: 'setup',
      status: 'failed',
      message: '失败',
      createdAt: `2026-05-03T00:${String(59 - index).padStart(2, '0')}:00.000Z`
    }));
    const { env, db } = createEnv(rows, { 'system_logs:pruned_at': String(Math.floor(Date.now() / 1000)) });

    const response = await logRoutes.fetch(new Request('https://example.com/?status=failed&pageSize=10'), env);
    const body = await response.json() as { result: unknown[]; result_info: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.result).toHaveLength(10);
    expect(body.result_info.has_more).toBe(true);
    expect(body.result_info.next_cursor).toBeTruthy();
    expect(db.calls[0].sql).toContain('status = ?');
    expect(db.calls[0].sql).toContain('ORDER BY created_at DESC, id DESC');
    expect(db.calls[0].params).toEqual(['failed', 11]);
  });

  it('按当前筛选清理日志并同步清理 FTS', async () => {
    const { env, db } = createEnv([{ id: 'log_1' }], { 'system_logs:pruned_at': String(Math.floor(Date.now() / 1000)) });

    const response = await logRoutes.fetch(new Request('https://example.com/?module=domain&status=failed&keyword=cloudflare', { method: 'DELETE' }), env);

    expect(response.status).toBe(200);
    expect(db.calls[0].sql).toContain('DELETE FROM system_logs');
    expect(db.calls[0].sql).toContain('SELECT id');
    expect(db.calls[0].sql).toContain('module = ?');
    expect(db.calls[0].sql).toContain('status = ?');
    expect(db.calls[0].sql).toContain('system_logs_fts MATCH ?');
    expect(db.calls[0].params).toEqual(['domain', 'failed', '"cloudflare"*']);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM system_logs_fts'));
  });
});
