import { describe, expect, it } from 'vitest';
import { resolveIncomingRecipient } from './mail';
import type { Env } from './types';

function createEnv(domains: string[]) {
  const managed = new Set(domains);
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: string[]) => ({
          all: async () => {
            if (!sql.includes('FROM domains')) return { results: [] };
            return { results: values.filter((value) => managed.has(value)).map((name) => ({ name })) };
          }
        })
      })
    }
  } as unknown as Env;
}

describe('forwarded mail recipient', () => {
  it('开关关闭时保持 Cloudflare 投递地址', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: false,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'user@gmail.com',
      headers: {}
    });

    expect(result).toEqual({
      toAddr: 'inbox@mail.example.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: false
    });
  });

  it('识别自动转发后使用原始收件人', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'user@gmail.com',
      headers: {}
    });

    expect(result).toEqual({
      toAddr: 'user@gmail.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('原始收件人仍是系统域名时不标记转发', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'alias@example.com',
      headerTo: 'user@example.com',
      headers: {}
    });

    expect(result).toEqual({
      toAddr: 'alias@example.com',
      receivedByAddr: 'alias@example.com',
      forwarded: false
    });
  });

  it('投递地址和邮件头收件人一致时不标记转发', async () => {
    let queried = false;
    const env = createEnv(['mail.example.com']);
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = ((sql: string) => {
      if (sql.includes('FROM domains')) queried = true;
      return prepare(sql);
    }) as typeof env.DB.prepare;

    const result = await resolveIncomingRecipient({
      env,
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {}
    });

    expect(result).toEqual({
      toAddr: 'inbox@mail.example.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: false
    });
    expect(queried).toBe(false);
  });

  it('识别 Outlook 自动转发的原始收件人头', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        'X-MS-Exchange-Inbox-Rules-Loop': 'user@outlook.com'
      }
    });

    expect(result).toEqual({
      toAddr: 'user@outlook.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('识别 Exchange 编码后的原始收件人头', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        'X-MS-Exchange-Organization-OriginalEnvelopeRecipients': '=?utf-8?B?dXNlckBvdXRsb29rLmNvbQ==?='
      }
    });

    expect(result).toEqual({
      toAddr: 'user@outlook.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('识别 Gmail 常见转发头', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        'X-Gm-Original-To': '<user@gmail.com>'
      }
    });

    expect(result).toEqual({
      toAddr: 'user@gmail.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it.each([
    ['Postfix X-Original-To', { 'X-Original-To': 'user@qq.com' }, 'user@qq.com'],
    ['通用 X-Original-Recipient', { 'X-Original-Recipient': 'user@126.com' }, 'user@126.com'],
    ['RFC Original-Recipient', { 'Original-Recipient': 'rfc822; user@163.com' }, 'user@163.com'],
    ['国际化降级原始收件人', { 'Downgraded-Original-Recipient': 'rfc822; user@example.net' }, 'user@example.net'],
    ['Gmail X-Forwarded-For', { 'X-Forwarded-For': 'user@gmail.com' }, 'user@gmail.com'],
    ['通用 X-Forwarded-To', { 'X-Forwarded-To': 'user@yahoo.com' }, 'user@yahoo.com'],
    ['Dovecot Sieve', { 'X-Sieve-Redirected-From': 'user@aliyun.com' }, 'user@aliyun.com'],
    ['通用 X-Redirected-From', { 'X-Redirected-From': 'user@foxmail.com' }, 'user@foxmail.com'],
    ['国内常见 Delivered-To', { 'Delivered-To': 'user@qq.com' }, 'user@qq.com'],
    ['Envelope-To', { 'Envelope-To': 'user@163.com' }, 'user@163.com']
  ])('识别 %s 的原始收件人头', async (_name, headers, expected) => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers
    });

    expect(result).toEqual({
      toAddr: expected,
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('候选头都缺失时限量使用 Received for 兜底', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        Received: 'from mx.example.net by forwarder.example.net for <user@163.com>; Mon, 04 May 2026 06:00:00 +0000'
      }
    });

    expect(result).toEqual({
      toAddr: 'user@163.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('保留同名 Header 多值，避免后写入值覆盖原始收件人', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        Received: [
          'from mx.example.net by forwarder.example.net for <user@126.com>; Mon, 04 May 2026 06:00:00 +0000',
          'from cloudflare by mx.mail.example.com for <inbox@mail.example.com>; Mon, 04 May 2026 06:00:01 +0000'
        ]
      }
    });

    expect(result).toEqual({
      toAddr: 'user@126.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });

  it('只有自动转发证据但没有外部原始收件人时不误判', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'inbox@mail.example.com',
      headers: {
        'Auto-Submitted': 'auto-forwarded',
        'X-MS-Exchange-Organization-AutoForwarded': 'true',
        'X-Forwarded-To': 'inbox@mail.example.com'
      }
    });

    expect(result).toEqual({
      toAddr: 'inbox@mail.example.com',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: false
    });
  });

  it('Resent 标记只作为转发证据，原始收件人仍取可见外部收件人', async () => {
    const result = await resolveIncomingRecipient({
      env: createEnv(['mail.example.com']),
      acceptForwardedMail: true,
      deliveryTo: 'inbox@mail.example.com',
      headerTo: 'user@proton.me',
      headers: {
        'Resent-To': 'inbox@mail.example.com',
        'Resent-From': 'forwarder@example.net',
        'Resent-Date': 'Mon, 04 May 2026 06:00:00 +0000'
      }
    });

    expect(result).toEqual({
      toAddr: 'user@proton.me',
      receivedByAddr: 'inbox@mail.example.com',
      forwarded: true
    });
  });
});
