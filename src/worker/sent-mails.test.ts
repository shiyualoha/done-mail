import { describe, expect, it, vi } from 'vitest';
import { deleteSentMails } from './sent-mails';
import type { Env } from './types';

function createDeleteEnv(_options: { r2Fails?: boolean; batchFails?: boolean; deleted?: number } = {}) {
  const events: string[] = [];
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      params: [] as unknown[],
      bind: vi.fn((...params: unknown[]) => {
        statement.params = params;
        return statement;
      }),
      all: vi.fn(async <T>() => ({ results: [] as T[] })),
      first: vi.fn()
    };
    return statement;
  });
  const batch = vi.fn(async (statements: unknown[]) => {
    events.push('batch');
    return statements.map((_, index) => ({ meta: { changes: index === 3 ? (_options.deleted ?? 1) : 0 } }));
  });

  return {
    env: {
      DB: { prepare, batch }
    } as unknown as Env,
    events,
    batch
  };
}

describe('sent mails', () => {
  it('删除发件箱邮件时直接删除 D1 记录（已注释 R2）', async () => {
    const { env, events } = createDeleteEnv({ deleted: 2 });

    await expect(deleteSentMails(env, ['sent_1'])).resolves.toBe(2);

    expect(events.indexOf('batch')).toBeGreaterThanOrEqual(0);
  });

  it('删除发件箱邮件时始终成功（已注释 R2）', async () => {
    const { env, batch } = createDeleteEnv({ r2Fails: true });

    await expect(deleteSentMails(env, ['sent_1'])).resolves.toBe(1);

    expect(batch).toHaveBeenCalled();
  });
});
