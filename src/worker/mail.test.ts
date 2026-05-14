import { describe, expect, it, vi } from 'vitest';
import { deleteMails, handleIncomingEmail } from './mail';
import type { Env } from './types';

interface BoundStatement {
  sql: string;
  params: unknown[];
  all: <T>() => Promise<{ results: T[] }>;
}

function createEnv() {
  const statements: BoundStatement[] = [];
  const prepare = vi.fn((sql: string) => ({
    bind: vi.fn((...params: unknown[]) => {
      const statement = {
        sql,
        params,
        all: async <T>() => ({
          results: sql.includes('FROM domains') ? (params.map((name) => ({ name })) as T[]) : []
        })
      };
      statements.push(statement);
      return statement;
    })
  }));

  return {
    env: {
      KV: {
        get: vi.fn(async () => null)
      },
      DB: {
        prepare,
        batch: vi.fn(async () => statements.map(() => ({ meta: { changes: 1 } })))
      }
    } as unknown as Env,
    statements
  };
}

function createEnvWithBucket() {
  const base = createEnv();
  const put = vi.fn(async () => undefined);
  return {
    ...base,
    env: {
      ...base.env,
      MAIL_BUCKET: {
        put,
        delete: vi.fn(async () => undefined)
      }
    } as unknown as Env,
    put
  };
}

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
        results: sql.includes('FROM mail_attachments') ? ([{ objectKey: 'mail/mail_1/a.txt' }] as T[]) : []
      }))
    };
    return statement;
  });
  const batch = vi.fn(async (statements: unknown[]) => {
    events.push('batch');
    if (options.batchFails) throw new Error('D1 delete failed');
    return statements.map((_, index) => ({ meta: { changes: index === 5 ? options.deleted ?? 1 : 0 } }));
  });

  return {
    env: {
      DB: { prepare, batch },
      KV: {
        get: vi.fn(async () => null),
        delete: vi.fn(async () => undefined)
      },
      MAIL_BUCKET: {
        delete: bucketDelete
      }
    } as unknown as Env,
    bucketDelete,
    events,
    batch
  };
}

function rawMailWithAttachment() {
  return [
    'From: 验证中心 <notice@service.cn>',
    'To: pay@example.com',
    'Subject: 登录验证码',
    'Message-ID: <msg-1@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="mail-boundary"',
    '',
    '--mail-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    '您的登录验证码为 123456，5 分钟内有效。',
    '--mail-boundary',
    'Content-Type: text/plain; name="invoice.txt"',
    'Content-Disposition: attachment; filename="invoice.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa('invoice file body'),
    '--mail-boundary--',
    ''
  ].join('\r\n');
}

describe('incoming mail', () => {
  it('中文验证码邮件会正常接收', async () => {
    const { env } = createEnv();
    const raw = [
      'From: 验证中心 <notice@service.cn>',
      'To: pay@example.com',
      'Subject: 登录验证码',
      'Message-ID: <msg-code@example.com>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '您的登录验证码为 123456，请在 5 分钟内完成验证。',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '验证中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '登录验证码'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('非验证码邮件会在收件阶段直接拒收并记录日志', async () => {
    const { env, statements } = createEnv();
    const raw = [
      'From: 通知中心 <notice@service.cn>',
      'To: pay@example.com',
      'Subject: 账单通知',
      'Message-ID: <msg-plain@example.com>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '您的账单已生成，请及时查看。',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '通知中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '账单通知'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(message.setReject).toHaveBeenCalledWith('仅接收中文验证码邮件');
    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(statements.some((item) => item.sql.includes('INSERT INTO mails ('))).toBe(false);
    expect(statements.some((item) => item.sql.includes('INSERT INTO system_logs'))).toBe(true);
  });

  it('未配置 R2 时仍保存中文验证码邮件、正文、附件信息和搜索索引，附件标记为未存储', async () => {
    const { env, statements } = createEnv();
    const raw = rawMailWithAttachment();
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '验证中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '登录验证码'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(message.setReject).not.toHaveBeenCalled();

    const mailStatement = statements.find((item) => item.sql.includes('INSERT INTO mails ('));
    expect(mailStatement?.params[2]).toBe('notice@service.cn');
    expect(mailStatement?.params[4]).toBe('pay@example.com');
    expect(mailStatement?.params[5]).toBe('example.com');
    expect(mailStatement?.params[8]).toBe('登录验证码');
    expect(mailStatement?.params[10]).toBe(1);
    expect(mailStatement?.params[11]).toBe(1);

    const bodyStatement = statements.find((item) => item.sql.includes('INSERT INTO mail_bodies'));
    expect(bodyStatement?.params[1]).toContain('from');

    const bodyChunkStatement = statements.find((item) => item.sql.includes('INSERT INTO mail_body_chunks') && item.params[1] === 'text');
    expect(bodyChunkStatement?.params[3]).toContain('您的登录验证码为 123456');

    const attachmentStatement = statements.find((item) => item.sql.includes('INSERT INTO mail_attachments'));
    expect(attachmentStatement?.params[2]).toBe('invoice.txt');
    expect(attachmentStatement?.params[7]).toBe(0);
    expect(attachmentStatement?.params[8]).toBe('');

    const ftsStatement = statements.find((item) => item.sql.includes('INSERT INTO mails_fts'));
    expect(ftsStatement?.sql).toContain('mail_id, subject, addresses');
    expect(String(ftsStatement?.params[1])).toContain('登录验证码');
    expect(String(ftsStatement?.params[2])).toContain('notice@service.cn');

    const contentFtsStatement = statements.find((item) => item.sql.includes('INSERT INTO mail_content_fts'));
    expect(String(contentFtsStatement?.params[2])).toContain('123456');
    expect(String(contentFtsStatement?.params[2])).toContain('登录');
  });

  it('仅有验证码关键词但没有验证码值时会拒收', async () => {
    const { env, statements } = createEnv();
    const raw = [
      'From: 验证中心 <notice@service.cn>',
      'To: pay@example.com',
      'Subject: 登录验证码',
      'Message-ID: <msg-keyword@example.com>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '本次登录需要短信验证码，请返回 App 查看。',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '验证中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '登录验证码'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(message.setReject).toHaveBeenCalledWith('仅接收中文验证码邮件');
    expect(statements.some((item) => item.sql.includes('INSERT INTO mails ('))).toBe(false);
  });

  it('字母数字混合验证码邮件会正常接收', async () => {
    const { env } = createEnv();
    const raw = [
      'From: 验证中心 <notice@service.cn>',
      'To: pay@example.com',
      'Subject: 邮箱确认码',
      'Message-ID: <msg-mixed@example.com>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '您的确认码为 u0JUzh，请在页面中输入完成验证。',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '验证中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '邮箱确认码'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('中文 HTML 验证码邮件也会正常接收', async () => {
    const { env } = createEnv();
    const raw = [
      'From: 验证中心 <notice@service.cn>',
      'To: pay@example.com',
      'Subject: 安全验证',
      'Message-ID: <msg-html@example.com>',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><body><p>您的安全验证码是 <b>654321</b>，请勿泄露给他人。</p></body></html>',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: '验证中心 <notice@service.cn>',
        to: 'pay@example.com',
        subject: '安全验证'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    expect(env.DB.batch).toHaveBeenCalledTimes(1);
    expect(message.setReject).not.toHaveBeenCalled();
  });

  // 已注释：不启用 R2 附件存储
  // it('写入 R2 附件时统一编码 Content-Disposition 文件名', async () => {
  //   ...
  // });
  it.skip('写入 R2 附件时统一编码 Content-Disposition 文件名', async () => {
    const { env, put } = createEnvWithBucket();
    const raw = [
      'From: Stripe <billing@stripe.example>',
      'To: pay@example.com',
      'Subject: Invoice May',
      'Message-ID: <msg-1@example.com>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="mail-boundary"',
      '',
      '--mail-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Your invoice is ready.',
      '--mail-boundary',
      'Content-Type: text/plain; name="报价单.txt"',
      'Content-Disposition: attachment; filename="报价单.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa('invoice file body'),
      '--mail-boundary--',
      ''
    ].join('\r\n');
    const message = {
      rawSize: raw.length,
      raw: new TextEncoder().encode(raw),
      headers: {
        from: 'Stripe <billing@stripe.example>',
        to: 'pay@example.com',
        subject: 'Invoice May'
      },
      to: 'pay@example.com',
      forward: vi.fn(),
      setReject: vi.fn()
    } as unknown as ForwardableEmailMessage;

    await handleIncomingEmail(message, env);

    const metadata = (put as unknown as { mock: { calls: Array<[string, unknown, { httpMetadata: { contentDisposition: string } }]> } }).mock.calls[0]?.[2]?.httpMetadata;
    expect(metadata.contentDisposition).toContain('attachment; filename=".txt"');
    expect(metadata.contentDisposition).toContain("filename*=UTF-8''%E6%8A%A5%E4%BB%B7%E5%8D%95.txt");
  });

  it('删除邮件时直接删除 D1 记录（已注释 R2）', async () => {
    const { env, events } = createDeleteEnv({ deleted: 2 });

    await expect(deleteMails(env, ['mail_1'])).resolves.toBe(2);

    expect(events.indexOf('batch')).toBeGreaterThanOrEqual(0);
  });

  it('删除邮件时始终成功（已注释 R2）', async () => {
    const { env, batch } = createDeleteEnv({ r2Fails: true });

    await expect(deleteMails(env, ['mail_1'])).resolves.toBe(1);

    expect(batch).toHaveBeenCalled();
  });
});
