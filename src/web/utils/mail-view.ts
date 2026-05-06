export function formatTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' });
  if (date.getTime() >= startToday) return time;
  if (date.getTime() >= startYesterday) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function formatFullTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).replace(/\//g, '-');
  const time = date.toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
  return `${day} ${time}`;
}

export function formatBytes(value: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function plainTextFromHtml(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').trim();
}

export function mailBodyText(mail: { textBody: string; htmlBody: string }) {
  return mail.textBody || plainTextFromHtml(mail.htmlBody) || '无正文';
}

function forceExternalLinks(html: string) {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleanAttrs = String(attrs)
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<a${cleanAttrs} target="_blank" rel="noopener noreferrer">`;
  });
}

const remoteImagePattern = /<img\b[^>]*\s+src\s*=\s*(?:"\s*(?:https?:)?\/\/[^"]*"|'\s*(?:https?:)?\/\/[^']*'|\s*(?:https?:)?\/\/[^\s>]+)/i;

export function hasRemoteImages(html: string) {
  return remoteImagePattern.test(html);
}

export function mailHtmlSrcdoc(mail: { htmlBody: string; allowRemoteImages?: boolean }) {
  const html = mail.htmlBody.trim();
  const imageSources = mail.allowRemoteImages ? 'data: blob: cid: https:' : 'data: blob: cid:';
  const remoteImageStyle = mail.allowRemoteImages
    ? ''
    : `
  img[src^="http://"], img[src^="https://"], img[src^="//"] { display: none !important; }`;
  const shell = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imageSources}; media-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; navigate-to 'none'">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #111827; font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { padding: 18px; overflow-wrap: anywhere; }
  img, video { max-width: 100% !important; height: auto !important; }
  table { width: 100% !important; max-width: 100% !important; min-width: 0 !important; table-layout: fixed; border-collapse: collapse; }
  th, td { min-width: 0 !important; overflow-wrap: anywhere; word-break: break-word; }
  pre, code, p, div { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
  a { color: #005bd1; }
  ${remoteImageStyle}
</style>`;
  const body = forceExternalLinks(html);
  if (/<head[\s>]/i.test(body)) return body.replace(/<head([^>]*)>/i, `<head$1>${shell}`);
  if (/<html[\s>]/i.test(body)) return body.replace(/<html([^>]*)>/i, `<html$1><head>${shell}</head>`);
  return `<!doctype html><html><head>${shell}</head><body>${body}</body></html>`;
}
