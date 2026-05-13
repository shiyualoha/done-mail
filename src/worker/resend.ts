import { getResendConfig } from './config';
import type { Env } from './types';
import { createId, extractDomain, nowIso } from './utils';
import { callResend, validateResendApiKey } from './resend-api';
// import { deleteR2ObjectsBestEffort } from './r2'; // 已注释：不启用 R2
import {
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_RESEND_TOTAL_BYTES,
  MAX_SEND_ATTACHMENTS,
  normalizeAttachment
} from './resend-attachments';
import type { SendMailInput } from './resend-types';
import {
  deleteSentMails,
  getSentAttachmentObject,
  getSentMailDetail,
  insertPendingSentMail,
  listSentMails,
  markSentMailStatus,
  sentMailPageSize
} from './sent-mails';

export {
  deleteSentMails,
  getSentAttachmentObject,
  getSentMailDetail,
  listSentMails,
  sentMailPageSize,
  validateResendApiKey
};
export type { SendMailInput };

function isEmail(value: string) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeDisplayName(value: unknown) {
  return String(value || '').replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatAddress(email: string, name: string) {
  return name ? `${name} <${email}>` : email;
}

async function ensureSenderDomain(env: Env, from: string) {
  const domain = extractDomain(from);
  if (!domain) {
    throw new Error('发件邮箱格式不正确');
  }

  const row = await env.DB.prepare(`SELECT id FROM domains WHERE name = ? LIMIT 1`).bind(domain).first();
  if (!row) {
    throw new Error('发件域名不在本系统域名列表中');
  }
}

export async function sendMailWithResend(env: Env, input: SendMailInput) {
  const config = await getResendConfig(env);
  if (!config.enabled) {
    throw new Error('发送邮件未开启');
  }
  if (!config.apiKey) {
    throw new Error('请先配置 Resend API Key');
  }

  const sentMailId = createId('sent');
  const from = normalizeEmail(input.from);
  const to = normalizeEmail(input.to);
  const fromName = sanitizeDisplayName(input.fromName);
  const toName = sanitizeDisplayName(input.toName);
  const subject = String(input.subject || '').trim();
  const text = String(input.text || '').trim();
  const html = String(input.html || '').trim();
  const inReplyTo = String(input.inReplyTo || '').trim();
  const references = String(input.references || input.inReplyTo || '').trim();

  if (!isEmail(from)) throw new Error('发件邮箱格式不正确');
  if (!isEmail(to)) throw new Error('收件邮箱格式不正确');
  if (!subject) throw new Error('邮件主题不能为空');
  if (!text && !html) throw new Error('邮件正文不能为空');

  await ensureSenderDomain(env, from);

  const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (rawAttachments.length > MAX_SEND_ATTACHMENTS) {
    throw new Error(`单封邮件最多 ${MAX_SEND_ATTACHMENTS} 个附件`);
  }
  const attachments = rawAttachments.map((item) => normalizeAttachment(item, sentMailId));
  const totalBytes = attachments.reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error('附件总大小不能超过 20MB');
  }
  const estimatedPayloadBytes = Math.ceil(totalBytes * 1.37) + text.length + html.length + subject.length;
  if (estimatedPayloadBytes > MAX_RESEND_TOTAL_BYTES) {
    throw new Error('邮件内容和附件超过 Resend 单封大小限制');
  }

  const headers: Record<string, string> = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references) headers.References = references;

  const resendPayload = {
    from: formatAddress(from, fromName),
    to: [formatAddress(to, toName)],
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(attachments.length
      ? {
          attachments: attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content
          }))
        }
      : {})
  };

  const sentAt = nowIso();
  await insertPendingSentMail(env, { id: sentMailId, from, fromName, to, toName, subject, text, html, headers, attachments, storedKeys: [], sentAt });

  let resendId = '';
  try {
    const resendResponse = await callResend(config.apiKey, resendPayload);
    resendId = String(resendResponse.id || '');
    // 已注释：不启用 R2 附件存储
    // try {
    //   storedKeys = await storeSentAttachments(env, attachments);
    //   await markSentAttachmentsStored(env, attachments, storedKeys);
    // } catch (error) {
    //   await deleteR2ObjectsBestEffort(env.MAIL_BUCKET, storedKeys);
    //   console.error('Store sent attachments failed', error);
    // }
    await markSentMailStatus(env, sentMailId, 'sent', resendId, '', resendResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSentMailStatus(env, sentMailId, 'failed', resendId, message);
    throw error;
  }

  return {
    id: sentMailId,
    resendId,
    sentAt,
    storedAttachments: 0
  };
}
