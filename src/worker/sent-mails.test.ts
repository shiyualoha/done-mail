import { describe, expect, it, vi } from 'vitest';
import { deleteSentMails } from './sent-mails';
import type { Env } from './types';

function createDeleteEnv(options: { r2Fails?: boolean; batchFails?: boolean; deleted?: number } = {}) {
  const events: string[] = [];
  const bucketDelete = vi.fn(async (key: string) => {
    events.push(`r2:${key}`);
    if (options.r2Fails) throw new Error('R2 delete failed');
  });
  const prepare = vi.fn((sql: string) => {
    const statement = {
      sql,
      params: [] as unknown[],
      bind: vi.fn((...params: unknown[]) => {
        statement.params = params;
        return statement;
      }),
      all: vi.fn(async <T>() => ({
        results: sql.includes('FROM sent_mail_attachments') ? ([{ objectKey: 'sent/sent_1/a.txt' }] as T[]) : []
      }))
    };
    return statement;
  });
  const batch = vi.fn(async (statements: unknown[]) => {
    events.push('batch');
    if (options.batchFails) throw new Error('D1 delete failed');
    return statements.map((_, index) => ({ meta: { changes: index === 3 ? options.deleted ?? 1 : 0 } }));
  });

  return {
    env: {
      DB: { prepare, batch },
      MAIL_BUCKET: {
        delete: bucketDelete
      }
    } as unknown as Env,
    bucketDelete,
    events,
    batch
  };
}

describe('sent mails', () => {
  it('删除发件箱邮件时先删 R2 附件，再删除 D1 记录', async () => {
    const { env, bucketDelete, events } = createDeleteEnv({ deleted: 2 });

    await expect(deleteSentMails(env, ['sent_1'])).resolves.toBe(2);

    expect(events.indexOf('batch')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('r2:sent/sent_1/a.txt')).toBeLessThan(events.indexOf('batch'));
    expect(bucketDelete).toHaveBeenCalledWith('sent/sent_1/a.txt');
  });

  it('删除发件箱邮件时 R2 失败不会删除 D1 记录', async () => {
    const { env, batch } = createDeleteEnv({ r2Fails: true });

    await expect(deleteSentMails(env, ['sent_1'])).rejects.toThrow('R2 delete failed');

    expect(batch).not.toHaveBeenCalled();
  });
});
