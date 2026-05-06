import { describe, expect, it } from 'vitest';
import { normalizeSubdomainPrefix } from './domain-common';

describe('domain-common', () => {
  it('规范化子域名前缀', () => {
    expect(normalizeSubdomainPrefix('  Mail.Dev. ')).toBe('mail.dev');
    expect(() => normalizeSubdomainPrefix('a@example.com')).toThrow('不要填写邮箱地址或 URL');
    expect(() => normalizeSubdomainPrefix('-bad')).toThrow('格式不正确');
  });
});
