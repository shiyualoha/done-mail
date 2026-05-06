import { describe, expect, it, vi } from 'vitest';
import { normalizeAttachment, storeSentAttachments } from './resend-attachments';
import type { Env } from './types';

describe('sent attachments', () => {
  it('写入 R2 时统一编码 Content-Disposition 文件名', async () => {
    const put = vi.fn(async () => undefined);
    const env = {
      MAIL_BUCKET: {
        put,
        delete: vi.fn(async () => undefined)
      }
    } as unknown as Env;
    const attachment = normalizeAttachment({
      filename: '报价单.txt',
      mimeType: 'text/plain',
      content: btoa('file body')
    }, 'sent_1');

    await storeSentAttachments(env, [attachment]);

    const metadata = (put as unknown as { mock: { calls: Array<[string, unknown, { httpMetadata: { contentDisposition: string } }]> } }).mock.calls[0]?.[2]?.httpMetadata;
    expect(metadata.contentDisposition).toContain('attachment; filename=".txt"');
    expect(metadata.contentDisposition).toContain("filename*=UTF-8''%E6%8A%A5%E4%BB%B7%E5%8D%95.txt");
  });
});
