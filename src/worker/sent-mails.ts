import { buildBodyPreview, buildFtsQuery, buildMailSearchText } from './mail-content';
import { encodeSentCursor, normalizeSearchKeyword, parseSentCursor, pageSize } from './http/query';
import { deleteR2Objects } from './r2';
import type { Env } from './types';
import type { InsertPendingSentMailInput, PreparedAttachment } from './resend-types';
import { safeJsonParse } from './utils';

function mapSentRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ''),
    resendId: String(row.resendId || ''),
    fromAddr: String(row.fromAddr || ''),
    fromName: String(row.fromName || ''),
    toAddr: String(row.toAddr || ''),
    toName: String(row.toName || ''),
    subject: String(row.subject || ''),
    bodyPreview: String(row.bodyPreview || ''),
    hasAttachments: Number(row.hasAttachments || 0) === 1,
    attachmentCount: Number(row.attachmentCount || 0),
    status: String(row.status || ''),
    error: String(row.error || ''),
    sentAt: String(row.sentAt || ''),
    createdAt: String(row.createdAt || '')
  };
}

export async function insertPendingSentMail(env: Env, input: InsertPendingSentMailInput) {
  const preview = buildBodyPreview(input.text, input.html);
  const searchValue = buildMailSearchText({
    fromAddr: input.from,
    fromName: input.fromName,
    toAddr: input.to,
    toName: input.toName,
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sent_mails_fts (sent_mail_id, search_text) VALUES (?, ?)`).bind(input.id, searchValue),
    env.DB.prepare(
      `INSERT INTO sent_mails (
         id, resend_id, from_addr, from_name, to_addr, to_name, subject, body_preview,
         has_attachments, attachment_count, status, error, sent_at
       ) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, 'sending', '', ?)`
    ).bind(
      input.id,
      input.from,
      input.fromName,
      input.to,
      input.toName,
      input.subject,
      preview,
      input.attachments.length > 0 ? 1 : 0,
      input.attachments.length,
      input.sentAt
    ),
    env.DB.prepare(
      `INSERT INTO sent_mail_bodies (sent_mail_id, text_body, html_body, headers_json, resend_response_json)
       VALUES (?, ?, ?, ?, '')`
    ).bind(input.id, input.text, input.html, JSON.stringify(input.headers)),
    ...input.attachments.map((attachment) =>
      env.DB.prepare(
        `INSERT INTO sent_mail_attachments (id, sent_mail_id, filename, mime_type, size, stored, object_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        attachment.id,
        input.id,
        attachment.filename,
        attachment.mimeType,
        attachment.size,
        input.storedKeys.includes(attachment.objectKey) ? 1 : 0,
        input.storedKeys.includes(attachment.objectKey) ? attachment.objectKey : ''
      )
    )
  ]);
}

export async function markSentMailStatus(env: Env, sentMailId: string, status: 'sent' | 'failed', resendId: string, error: string, resendResponse: unknown = {}) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE sent_mails SET status = ?, resend_id = ?, error = ? WHERE id = ?`).bind(status, resendId, error, sentMailId),
    env.DB.prepare(`UPDATE sent_mail_bodies SET resend_response_json = ? WHERE sent_mail_id = ?`).bind(JSON.stringify(resendResponse), sentMailId)
  ]);
}

export async function markSentAttachmentsStored(env: Env, attachments: PreparedAttachment[], storedKeys: string[]) {
  if (attachments.length === 0) return;
  const stored = new Set(storedKeys);
  await env.DB.batch(
    attachments.map((attachment) =>
      env.DB.prepare(`UPDATE sent_mail_attachments SET stored = ?, object_key = ? WHERE id = ?`).bind(
        stored.has(attachment.objectKey) ? 1 : 0,
        stored.has(attachment.objectKey) ? attachment.objectKey : '',
        attachment.id
      )
    )
  );
}

export async function listSentMails(env: Env, query: { perPage: number; cursor?: string; keyword?: string; from?: string; to?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const cursor = parseSentCursor(query.cursor || '');

  if (query.from) {
    where.push(`sent_mails.from_addr = ?`);
    params.push(query.from.toLowerCase());
  }
  if (query.to) {
    where.push(`sent_mails.to_addr = ?`);
    params.push(query.to.toLowerCase());
  }
  const keyword = normalizeSearchKeyword(query.keyword || '');
  if (cursor) {
    where.push(`(sent_mails.sent_at < ? OR (sent_mails.sent_at = ? AND sent_mails.id < ?))`);
    params.push(cursor.sentAt, cursor.sentAt, cursor.id);
  }

  const limit = query.perPage + 1;
  const ftsQuery = keyword ? buildFtsQuery(keyword) : '';
  const sql = ftsQuery
    ? `WITH matched AS (
         SELECT sent_mail_id FROM sent_mails_fts WHERE sent_mails_fts MATCH ?
       )
       SELECT sent_mails.id, sent_mails.resend_id AS resendId, sent_mails.from_addr AS fromAddr, sent_mails.from_name AS fromName,
              sent_mails.to_addr AS toAddr, sent_mails.to_name AS toName, sent_mails.subject, sent_mails.body_preview AS bodyPreview,
              sent_mails.has_attachments AS hasAttachments, sent_mails.attachment_count AS attachmentCount,
              sent_mails.status, sent_mails.error, sent_mails.sent_at AS sentAt, sent_mails.created_at AS createdAt
       FROM matched
       JOIN sent_mails ON sent_mails.id = matched.sent_mail_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY sent_mails.sent_at DESC, sent_mails.id DESC
       LIMIT ?`
    : `SELECT sent_mails.id, sent_mails.resend_id AS resendId, sent_mails.from_addr AS fromAddr, sent_mails.from_name AS fromName,
              sent_mails.to_addr AS toAddr, sent_mails.to_name AS toName, sent_mails.subject, sent_mails.body_preview AS bodyPreview,
              sent_mails.has_attachments AS hasAttachments, sent_mails.attachment_count AS attachmentCount,
              sent_mails.status, sent_mails.error, sent_mails.sent_at AS sentAt, sent_mails.created_at AS createdAt
       FROM sent_mails
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY sent_mails.sent_at DESC, sent_mails.id DESC
       LIMIT ?`;
  const bindParams = ftsQuery ? [ftsQuery, ...params, limit] : [...params, limit];
  const rows = await env.DB.prepare(sql)
    .bind(...bindParams)
    .all<Record<string, unknown>>();

  const rawItems = rows.results || [];
  const hasMore = rawItems.length > query.perPage;
  const pageItems = rawItems.slice(0, query.perPage).map(mapSentRow);
  return {
    items: pageItems,
    hasMore,
    nextCursor: hasMore ? encodeSentCursor(pageItems[pageItems.length - 1]) : ''
  };
}

export function sentMailPageSize(value: string | undefined) {
  return pageSize(value);
}

export async function getSentMailDetail(env: Env, id: string) {
  const row = await env.DB.prepare(
    `SELECT id, resend_id AS resendId, from_addr AS fromAddr, from_name AS fromName,
            to_addr AS toAddr, to_name AS toName, subject, body_preview AS bodyPreview,
            has_attachments AS hasAttachments, attachment_count AS attachmentCount,
            status, error, sent_at AS sentAt, created_at AS createdAt
     FROM sent_mails
     WHERE id = ?`
  )
    .bind(id)
    .first<Record<string, unknown>>();

  if (!row) return null;

  const body = await env.DB.prepare(
    `SELECT text_body AS textBody, html_body AS htmlBody, headers_json AS headersJson
     FROM sent_mail_bodies
     WHERE sent_mail_id = ?`
  )
    .bind(id)
    .first<Record<string, unknown>>();

  const attachments = await env.DB.prepare(
    `SELECT id, filename, mime_type AS mimeType, size, stored, object_key AS objectKey
     FROM sent_mail_attachments
     WHERE sent_mail_id = ?
     ORDER BY created_at ASC, id ASC`
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return {
    ...mapSentRow(row),
    textBody: String(body?.textBody || ''),
    htmlBody: String(body?.htmlBody || ''),
    headers: safeJsonParse<Record<string, string>>(String(body?.headersJson || '{}'), {}),
    attachments: (attachments.results || []).map((attachment) => ({
      id: String(attachment.id || ''),
      filename: String(attachment.filename || ''),
      mimeType: String(attachment.mimeType || ''),
      size: Number(attachment.size || 0),
      stored: Number(attachment.stored || 0) === 1
    }))
  };
}

export async function getSentAttachmentObject(env: Env, sentMailId: string, attachmentId: string) {
  if (!env.MAIL_BUCKET) {
    throw new Error('未启用附件保存');
  }

  const row = await env.DB.prepare(
    `SELECT filename, mime_type AS mimeType, object_key AS objectKey
     FROM sent_mail_attachments
     WHERE id = ? AND sent_mail_id = ? AND stored = 1 AND object_key <> ''`
  )
    .bind(attachmentId, sentMailId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  const object = await env.MAIL_BUCKET.get(String(row.objectKey || ''));
  if (!object) return null;

  return {
    object,
    filename: String(row.filename || 'attachment'),
    mimeType: String(row.mimeType || 'application/octet-stream')
  };
}

export async function deleteSentMails(env: Env, ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return 0;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const attachments = await env.DB.prepare(
    `SELECT object_key AS objectKey
     FROM sent_mail_attachments
     WHERE sent_mail_id IN (${placeholders}) AND stored = 1 AND object_key <> ''`
  )
    .bind(...uniqueIds)
    .all<{ objectKey: string }>();

  await deleteR2Objects(env.MAIL_BUCKET, (attachments.results || []).map((item) => item.objectKey));

  const result = await env.DB.batch([
    env.DB.prepare(`DELETE FROM sent_mails_fts WHERE sent_mail_id IN (${placeholders})`).bind(...uniqueIds),
    env.DB.prepare(`DELETE FROM sent_mail_attachments WHERE sent_mail_id IN (${placeholders})`).bind(...uniqueIds),
    env.DB.prepare(`DELETE FROM sent_mail_bodies WHERE sent_mail_id IN (${placeholders})`).bind(...uniqueIds),
    env.DB.prepare(`DELETE FROM sent_mails WHERE id IN (${placeholders})`).bind(...uniqueIds)
  ]);

  return Number(result[3]?.meta.changes || 0);
}
