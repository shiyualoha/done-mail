import type { Env } from './types';
// import { attachmentContentDisposition } from './http/content-disposition'; // 已注释：不启用 R2
// import { deleteR2ObjectsBestEffort } from './r2'; // 已注释：不启用 R2
import type { PreparedAttachment, SendAttachmentInput } from './resend-types';
import { createId } from './utils';

export const MAX_SEND_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_RESEND_TOTAL_BYTES = 40 * 1024 * 1024;

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
// const R2_ATTACHMENT_CONCURRENCY = 3; // 已注释：不启用 R2

const blockedAttachmentExts = new Set([
  'ade', 'adp', 'app', 'asp', 'bas', 'bat', 'cer', 'chm', 'cmd', 'com', 'cpl', 'crt', 'csh', 'der', 'exe', 'fxp',
  'gadget', 'hlp', 'hta', 'inf', 'ins', 'isp', 'its', 'js', 'jse', 'ksh', 'lib', 'lnk', 'mad', 'maf', 'mag', 'mam',
  'maq', 'mar', 'mas', 'mat', 'mau', 'mav', 'maw', 'mda', 'mdb', 'mde', 'mdt', 'mdw', 'mdz', 'msc', 'msh', 'msh1',
  'msh2', 'mshxml', 'msh1xml', 'msh2xml', 'msi', 'msp', 'mst', 'ops', 'pcd', 'pif', 'plg', 'prf', 'prg', 'ps1',
  'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'reg', 'scf', 'scr', 'sct', 'shb', 'shs', 'sys', 'tmp', 'url', 'vb',
  'vbe', 'vbs', 'vps', 'vsmacros', 'vss', 'vst', 'vsw', 'ws', 'wsc', 'wsf', 'wsh', 'xnk'
]);

function fileExt(filename: string) {
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index + 1).toLowerCase() : '';
}

function attachmentObjectKey(sentMailId: string, attachmentId: string, filename: string) {
  const cleanName = filename.trim().replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'attachment';
  return `sent-attachments/${sentMailId}/${attachmentId}-${cleanName}`;
}

// function base64Bytes(value: string) { // 已注释：不启用 R2
//   const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
//   const binary = atob(clean);
//   const bytes = new Uint8Array(binary.length);
//   for (let index = 0; index < binary.length; index += 1) {
//     bytes[index] = binary.charCodeAt(index);
//   }
//   return bytes;
// }

function base64ByteLength(value: string) {
  const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const normalized = clean.replace(/\s+/g, '');
  if (!normalized) return 0;
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(Math.floor((normalized.length * 3) / 4) - padding, 0);
}

export function normalizeAttachment(item: SendAttachmentInput, sentMailId: string): PreparedAttachment {
  const id = createId('satt');
  const filename = String(item.filename || '').trim();
  if (!filename) throw new Error('附件名称不能为空');
  if (blockedAttachmentExts.has(fileExt(filename))) throw new Error(`不支持发送此附件类型：${filename}`);

  const rawContent = String(item.content || '').trim();
  const content = rawContent.includes(',') ? rawContent.slice(rawContent.indexOf(',') + 1) : rawContent;
  if (!content) throw new Error(`附件内容不能为空：${filename}`);

  const size = base64ByteLength(content);
  if (size <= 0) throw new Error(`附件为空：${filename}`);
  if (size > MAX_ATTACHMENT_BYTES) throw new Error(`单个附件不能超过 8MB：${filename}`);

  return {
    id,
    filename,
    mimeType: String(item.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
    size,
    content,
    objectKey: attachmentObjectKey(sentMailId, id, filename)
  };
}

// 已注释：不启用 R2 附件存储
// export async function storeSentAttachments(env: Env, attachments: PreparedAttachment[]) {
//   const bucket = env.MAIL_BUCKET;
//   if (!bucket || attachments.length === 0) return [];
//
//   const storedKeys: string[] = [];
//   let nextIndex = 0;
//   try {
//     const mailBucket = bucket;
//     async function worker() {
//       for (;;) {
//         const index = nextIndex;
//         nextIndex += 1;
//         const attachment = attachments[index];
//         if (!attachment) return;
//         await mailBucket.put(attachment.objectKey, base64Bytes(attachment.content), {
//           httpMetadata: {
//             contentType: attachment.mimeType,
//             contentDisposition: attachmentContentDisposition(attachment.filename)
//           }
//         });
//         storedKeys.push(attachment.objectKey);
//       }
//     }
//     await Promise.all(Array.from({ length: Math.min(R2_ATTACHMENT_CONCURRENCY, attachments.length) }, () => worker()));
//     return storedKeys;
//   } catch (error) {
//     await deleteR2ObjectsBestEffort(env.MAIL_BUCKET, storedKeys);
//     throw error;
//   }
// }
export async function storeSentAttachments(_env: Env, _attachments: PreparedAttachment[]) {
  return [] as string[];
}
