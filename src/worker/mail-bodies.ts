import { restoreMailBodyChunks, sanitizeMailHtml } from './mail-content';
import type { Env } from './types';

export async function getMailBody(env: Env, mailId: string) {
  const [meta, chunks] = await Promise.all([
    env.DB.prepare(
      `SELECT headers_json AS headersJson
       FROM mail_bodies
       WHERE mail_id = ?`
    )
      .bind(mailId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT kind, chunk_index AS chunkIndex, content
       FROM mail_body_chunks
       WHERE mail_id = ?
       ORDER BY kind, chunk_index ASC`
    )
      .bind(mailId)
      .all<Record<string, unknown>>()
  ]);
  const body = restoreMailBodyChunks(chunks.results || []);
  return {
    textBody: body.textBody,
    htmlBody: sanitizeMailHtml(body.htmlBody),
    headersJson: String(meta?.headersJson || '{}')
  };
}

export async function listMailBodies(env: Env, mailIds: string[]) {
  if (mailIds.length === 0) return new Map<string, { textBody: string; htmlBody: string }>();
  const placeholders = mailIds.map(() => '?').join(', ');
  const rows = await env.DB.prepare(
    `SELECT mail_id AS mailId, kind, chunk_index AS chunkIndex, content
     FROM mail_body_chunks
     WHERE mail_id IN (${placeholders})
     ORDER BY mail_id, kind, chunk_index ASC`
  )
    .bind(...mailIds)
    .all<Record<string, unknown>>();

  const rowsByMail = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows.results || []) {
    const mailId = String(row.mailId || '');
    const current = rowsByMail.get(mailId) || [];
    current.push(row);
    rowsByMail.set(mailId, current);
  }

  const bodies = new Map<string, { textBody: string; htmlBody: string }>();
  for (const mailId of mailIds) {
    const body = restoreMailBodyChunks(rowsByMail.get(mailId) || []);
    bodies.set(mailId, {
      textBody: body.textBody,
      htmlBody: sanitizeMailHtml(body.htmlBody)
    });
  }
  return bodies;
}
