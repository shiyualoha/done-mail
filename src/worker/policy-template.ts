import type { MailPolicyMatchPayload, MailPolicyPayload, PolicyKeyValue } from './types';
import { readableBodyText } from './mail-content';

export function templateValues(payload: MailPolicyPayload | MailPolicyMatchPayload): Record<string, string> {
  return {
    id: payload.id,
    messageId: payload.messageId,
    from: payload.from,
    fromAddr: payload.fromAddr,
    fromName: payload.fromName,
    to: payload.to,
    domain: payload.domain,
    receivedBy: payload.receivedBy,
    subject: payload.subject,
    content: readableBodyText(payload.textBody, payload.htmlBody),
    preview: payload.preview,
    textBody: payload.textBody,
    htmlBody: payload.htmlBody,
    receivedAt: payload.receivedAt,
    rawSize: String(payload.rawSize),
    attachmentCount: String(payload.attachmentCount),
    hasAttachments: payload.hasAttachments ? 'true' : 'false',
    forwarded: payload.forwarded ? 'true' : 'false'
  };
}

export function renderTemplate(input: string, payload: MailPolicyPayload | MailPolicyMatchPayload) {
  const values = templateValues(payload);
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}

export function renderedKeyValues(rows: PolicyKeyValue[], payload: MailPolicyPayload | MailPolicyMatchPayload) {
  return rows.map((row) => ({
    key: renderTemplate(row.key, payload),
    value: renderTemplate(row.value, payload)
  }));
}

export function escapeTelegramHtml(value: string) {
  return value.replace(/[<>&]/g, (char) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    return '&amp;';
  });
}

export function renderTelegramTemplate(input: string, payload: MailPolicyPayload) {
  const values = Object.fromEntries(Object.entries(templateValues(payload)).map(([key, value]) => [key, escapeTelegramHtml(value)]));
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}
