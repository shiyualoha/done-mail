import { describe, expect, it } from 'vitest';
import { hasRemoteImages, mailHtmlSrcdoc } from './mail-view';

describe('mail view', () => {
  it('默认隐藏远程图片并阻止 HTTPS 图片源', () => {
    const html = '<p>正文</p><img src="https://cdn.example.com/logo.png" alt="Logo"><img src="cid:logo">';
    const srcdoc = mailHtmlSrcdoc({ htmlBody: html });

    expect(hasRemoteImages(html)).toBe(true);
    expect(srcdoc).toContain('img-src data: blob: cid:;');
    expect(srcdoc).toContain('img[src^="https://"]');
    expect(srcdoc).not.toContain('img-src data: blob: cid: https:;');
  });

  it('手动允许后才放开 HTTPS 远程图片源', () => {
    const srcdoc = mailHtmlSrcdoc({
      htmlBody: '<img src="//cdn.example.com/logo.png" alt="Logo">',
      allowRemoteImages: true
    });

    expect(srcdoc).toContain('img-src data: blob: cid: https:;');
    expect(srcdoc).not.toContain('img[src^="https://"]');
  });
});
