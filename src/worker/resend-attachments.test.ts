import { describe, expect, it, vi } from 'vitest';
import { normalizeAttachment, storeSentAttachments } from './resend-attachments';
import type { Env } from './types';

describe('sent attachments', () => {
  // 已注释：不启用 R2 附件存储
  // it('写入 R2 时统一编码 Content-Disposition 文件名', async () => {
  //   const put = vi.fn(async () => undefined);
  //   const env = {
  //     MAIL_BUCKET: {
  //       put,
  //       delete: vi.fn(async () => undefined)
  //     }
  //   } as unknown as Env;
  //   const attachment = normalizeAttachment({
  //     filename: '报价单.txt',
  //     mimeType: 'text/plain',
  //     content: btoa('file body')
  //   }, 'sent_1');
  //   await storeSentAttachments(env, [attachment]);
  //   const metadata = (put as unknown as { mock: { calls: Array<[string, unknown, { httpMetadata: { contentDisposition: string } }]> } }).mock.calls[0]?.[2]?.httpMetadata;
  //   expect(metadata.contentDisposition).toContain('attachment; filename=".txt"');
  //   expect(metadata.contentDisposition).toContain("filename*=UTF-8''%E6%8A%A5%E4%BB%B7%E5%8D%95.txt");
  // });

  it('storeSentAttachments 返回空数组（已注释 R2）', async () => {
    const result = await storeSentAttachments({} as Env, []);
    expect(result).toEqual([]);
  });
});
