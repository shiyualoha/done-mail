// 已注释：不启用 R2 附件存储
// import { attachmentDownloadResponse } from './http/attachments';
// import type { Env } from './types';
//
// export async function getMailAttachmentResponse(env: Env, mailId: string, attachmentId: string, bucket: R2Bucket) {
//   const row = await env.DB.prepare(
//     `SELECT filename, mime_type AS mimeType, object_key AS objectKey
//      FROM mail_attachments
//      WHERE id = ? AND mail_id = ? AND stored = 1 AND object_key <> ''`
//   )
//     .bind(attachmentId, mailId)
//     .first<Record<string, unknown>>();
//
//   if (!row) return null;
//
//   const object = await bucket.get(String(row.objectKey || ''));
//   return object ? attachmentDownloadResponse(object, row.filename, row.mimeType) : null;
// }
