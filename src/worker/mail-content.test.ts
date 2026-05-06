import { describe, expect, it } from 'vitest';
import {
  buildBodyPreview,
  buildFtsQuery,
  buildFtsTerms,
  buildMailBodyChunks,
  buildMailContentSearchChunks,
  buildMailSearchFields,
  buildMailSearchText,
  buildSearchText,
  normalizePreviewText,
  readableBodyText,
  restoreMailBodyChunks,
  sanitizeMailHtml,
  textFromHtml
} from './mail-content';

describe('mail-content', () => {
  it('从 HTML 提取可读正文并生成摘要', () => {
    const html = '<style>.x{}</style><p>订单 <b>已支付</b></p><script>alert(1)</script>';
    expect(normalizePreviewText(textFromHtml(html))).toBe('订单 已支付');
    expect(buildBodyPreview('', html)).toBe('订单 已支付');
  });

  it('从 HTML 提取正文时保留段落换行', () => {
    const html = '<p>第一行</p><p><b>第二行</b></p><div>第三行<br>第四行</div>';
    expect(readableBodyText('', html)).toBe('第一行\n第二行\n第三行\n第四行');
    expect(buildBodyPreview('', html)).toBe('第一行 第二行 第三行 第四行');
  });

  it('清理邮件 HTML 中的危险标签和跳转协议', () => {
    const html = '<a href="javascript:alert(1)" onclick="x()">打开</a><iframe src="https://x.test"></iframe>';
    const clean = sanitizeMailHtml(html);
    expect(clean).toContain('href="#"');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('<iframe');
  });

  it('生成受控长度的搜索文本和 FTS 查询', () => {
    expect(buildSearchText(['  Hello', '世界  '])).toBe('hello 世界');
    expect(buildFtsQuery('Billing "Stripe"')).toBe('"billing"* AND "stripe"*');
    expect(buildFtsQuery('支付', 'subject')).toBe('subject : "支付"*');
  });

  it('正文搜索索引覆盖超长正文末尾并对重复词去重', () => {
    const chunks = buildMailContentSearchChunks(`${'订单已支付 '.repeat(6000)}末尾验证码`, '<p>末尾验证码</p>');
    const searchText = chunks.join(' ');

    expect(searchText).toContain('支付');
    expect(searchText).toContain('末尾');
    expect(searchText).toContain('验证');
    expect(searchText).toContain('证码');
    expect(searchText.match(/验证/g)).toHaveLength(1);
  });

  it('正文按字节分块保存并可恢复', () => {
    const text = `${'中'.repeat(180000)}末尾`;
    const chunks = buildMailBodyChunks(text, '<p>HTML</p>');
    const restored = restoreMailBodyChunks(chunks.map((chunk) => ({ kind: chunk.kind, chunkIndex: chunk.index, content: chunk.content })));

    expect(chunks.filter((chunk) => chunk.kind === 'text').length).toBeGreaterThan(1);
    expect(restored.textBody).toBe(text);
    expect(restored.htmlBody).toBe('<p>HTML</p>');
  });

  it('搜索查询限制输入长度和 term 数', () => {
    const terms = buildFtsTerms(Array.from({ length: 20 }, (_, index) => `term${index}`).join(' '));

    expect(terms).toHaveLength(12);
    expect(terms[0]).toBe('"term0"*');
  });

  it('邮件搜索文本包含发件人、收件人、主题、完整内容和中文补充分词', () => {
    const searchText = buildMailSearchText({
      fromAddr: 'billing@stripe.example',
      fromName: 'Stripe 账单',
      toAddr: 'team@done-mail.dev',
      subject: '订阅账单',
      text: '这段正文不会出现在摘要里，但必须可以被搜索到',
      html: '<p>HTML 正文里的发票编号 INV-2026-0503</p>'
    });

    expect(searchText).toContain('billing@stripe.example');
    expect(searchText).toContain('team@done-mail.dev');
    expect(searchText).toContain('订阅账单');
    expect(searchText).toContain('不会出现在摘要里');
    expect(searchText).toContain('inv-2026-0503');
    expect(searchText).toContain('账单');
  });

  it('邮件搜索字段分开写入 FTS，公开 API 可以按主题和正文搜索', () => {
    const fields = buildMailSearchFields({
      fromAddr: 'billing@stripe.example',
      toAddr: 'team@done-mail.dev',
      subject: '订单已支付',
      text: '正文包含验证码 123456',
      html: ''
    });

    expect(fields.subject).toContain('订单已支付');
    expect(fields.subject).toContain('支付');
    expect(fields.addresses).toContain('billing@stripe.example');
    expect(fields).not.toHaveProperty('content');
  });
});
