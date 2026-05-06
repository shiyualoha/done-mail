import { Hono, type Context } from 'hono';
import { attachmentDownloadResponse } from '../http/attachments';
import { publicFail, publicOk } from '../http/public-response';
import { sanitizeMailHtml } from '../mail-content';
import {
  deleteSentMails,
  getSentAttachmentObject,
  getSentMailDetail,
  listSentMails,
  sendMailWithResend,
  sentMailPageSize,
  type SendMailInput
} from '../resend';
import { maxBatchDeleteSize, normalizeSearchKeyword, parseBatchIds } from '../http/query';
import type { Env } from '../types';
import { apiOk, jsonFail } from '../utils';

const sendRoutes = new Hono<{ Bindings: Env }>();
export const publicSendRoutes = new Hono<{ Bindings: Env }>();
type AppContext = Context<{ Bindings: Env }>;

async function sendMail(c: AppContext) {
  const body = await c.req.json().catch(() => ({}));
  try {
    return apiOk(c, await sendMailWithResend(c.env, body as SendMailInput));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '邮件发送失败', 400, 'send_failed');
  }
}

async function publicSendMail(c: AppContext) {
  const body = await c.req.json().catch(() => ({}));
  try {
    const result = await sendMailWithResend(c.env, body as SendMailInput);
    return publicOk(c, { id: result.id, status: 'sent' });
  } catch (error) {
    return publicFail(c, error instanceof Error ? error.message : '邮件发送失败', 400, 'send_failed');
  }
}

async function listSent(c: AppContext) {
  const perPage = sentMailPageSize(c.req.query('per_page') || c.req.query('pageSize'));
  const cursor = (c.req.query('cursor') || '').trim();
  const keyword = normalizeSearchKeyword(c.req.query('keyword') || '');
  const from = (c.req.query('from') || '').trim();
  const to = (c.req.query('to') || '').trim();
  const page = await listSentMails(c.env, { perPage, cursor, keyword, from, to });

  return apiOk(c, page.items, {
    per_page: perPage,
    next_cursor: page.nextCursor,
    has_more: page.hasMore
  });
}

async function getSent(c: AppContext) {
  const row = await getSentMailDetail(c.env, c.req.param('id') || '');
  if (!row) return jsonFail(c, '邮件不存在', 404, 'sent_mail_not_found');
  return apiOk(c, {
    ...row,
    htmlBody: sanitizeMailHtml(row.htmlBody)
  });
}

async function downloadSentAttachment(c: AppContext) {
  try {
    const attachment = await getSentAttachmentObject(c.env, c.req.param('id') || '', c.req.param('attachmentId') || '');
    if (!attachment) return jsonFail(c, '附件不存在或未保存内容', 404, 'sent_attachment_not_found');
    return attachmentDownloadResponse(attachment.object, attachment.filename, attachment.mimeType);
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '附件下载失败', 404, 'sent_attachment_download_failed');
  }
}

sendRoutes.post('/send', sendMail);
sendRoutes.get('/sent-mails', listSent);
sendRoutes.get('/sent-mails/:id', getSent);

sendRoutes.post('/sent-mails/batch-delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = parseBatchIds(body);

  if (ids.length === 0) return jsonFail(c, '请选择要删除的发送邮件', 400);
  if (ids.length > maxBatchDeleteSize) return jsonFail(c, `单次最多删除 ${maxBatchDeleteSize} 封发送邮件`, 400, 'batch_too_large');

  return apiOk(c, { ids, deleted: await deleteSentMails(c.env, ids) });
});

sendRoutes.delete('/sent-mails/:id', async (c) => {
  const id = c.req.param('id');
  return apiOk(c, { id, deleted: await deleteSentMails(c.env, [id]) });
});

sendRoutes.get('/sent-mails/:id/attachments/:attachmentId', downloadSentAttachment);

publicSendRoutes.post('/send', publicSendMail);

export default sendRoutes;
