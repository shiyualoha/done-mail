function encodeRfc5987(value: string) {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function fallbackFilename(value: string) {
  const fallback = value
    .replace(/[\r\n"\\]/g, ' ')
    .replace(/[;]/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return fallback || 'attachment';
}

export function fileContentDisposition(filename: unknown, disposition: 'attachment' | 'inline' = 'attachment') {
  const value = String(filename || 'attachment').replace(/[\r\n]/g, ' ').trim() || 'attachment';
  return `${disposition}; filename="${fallbackFilename(value)}"; filename*=UTF-8''${encodeRfc5987(value)}`;
}

export function attachmentContentDisposition(filename: unknown) {
  return fileContentDisposition(filename, 'attachment');
}
