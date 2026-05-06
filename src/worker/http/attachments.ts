import { attachmentContentDisposition } from './content-disposition';

export interface DownloadObject {
  body: ReadableStream | null;
  writeHttpMetadata(headers: Headers): void;
}

export function attachmentDownloadResponse(object: DownloadObject, filename: unknown, mimeType?: unknown) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', String(mimeType || headers.get('Content-Type') || 'application/octet-stream'));
  headers.set('Content-Disposition', attachmentContentDisposition(filename));
  return new Response(object.body, { headers });
}
