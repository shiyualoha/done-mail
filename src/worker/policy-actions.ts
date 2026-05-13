import type {
  Env,
  ForwardPolicyAction,
  HttpRequestPolicyAction,
  MailPolicyMatchPayload,
  MailPolicyPayload,
  PolicyAction,
  TelegramPolicyAction
} from './types';
import { extractDomain, safeJsonParse } from './utils';
import { MAX_TELEGRAM_ATTACHMENTS, MAX_TELEGRAM_MESSAGE_LENGTH, TELEGRAM_MAX_FILE_SIZE } from './policy-constants';
import { normalizeKeyValueList } from './policy-normalize';
import { escapeTelegramHtml, renderedKeyValues, renderTelegramTemplate, renderTemplate } from './policy-template';

const TELEGRAM_TIMEOUT_MS = 8000;

export type Forwarder = (to: string) => Promise<unknown>;

export interface PolicyRunInput {
  env: Env;
  matchPayload: MailPolicyMatchPayload;
  fullPayload: () => MailPolicyPayload;
  shareUrl: () => Promise<string>;
  forward?: Forwarder;
  executionCtx?: Pick<ExecutionContext, 'waitUntil'>;
}

export interface PolicyActionResult {
  id: string;
  type: PolicyAction['type'];
  name: string;
  skipped: boolean;
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
}

function appendQuery(url: string, rows: Array<{ key: string; value: string }>) {
  const parsed = new URL(url);
  rows.forEach((row) => {
    if (row.key) parsed.searchParams.set(row.key, row.value);
  });
  return parsed.toString();
}

function buildRequestBody(action: HttpRequestPolicyAction, payload: MailPolicyPayload) {
  if (action.bodyType === 'none') return undefined;
  if (action.bodyType === 'text') return renderTemplate(action.body, payload);
  if (action.bodyType === 'json') {
    const rendered = renderTemplate(action.body || '{}', payload);
    JSON.parse(rendered);
    return rendered;
  }
  const params = new URLSearchParams();
  renderedKeyValues(normalizeKeyValueList(safeJsonParse(action.body, [])), payload).forEach((row) => {
    if (row.key) params.set(row.key, row.value);
  });
  return params.toString();
}

async function runHttpAction(action: HttpRequestPolicyAction, payload: MailPolicyPayload): Promise<PolicyActionResult> {
  try {
    const renderedQuery = renderedKeyValues(action.query, payload);
    const url = appendQuery(renderTemplate(action.url, payload), renderedQuery);
    const headers: Record<string, string> = {};
    renderedKeyValues(action.headers, payload).forEach((row) => {
      if (row.key) headers[row.key] = row.value;
    });
    if (action.bodyType === 'json') headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    if (action.bodyType === 'form') headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
    const body = action.method === 'GET' ? undefined : buildRequestBody(action, payload);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), action.timeoutMs);
    try {
      const response = await fetch(url, {
        method: action.method,
        headers,
        body,
        signal: controller.signal
      });
      return {
        id: action.id,
        type: action.type,
        name: action.name,
        skipped: false,
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        error: response.ok ? '' : `请求失败：${response.status} ${response.statusText}`
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError' ? `请求超时：${action.timeoutMs / 1000} 秒` : error instanceof Error ? error.message : String(error);
    return { id: action.id, type: action.type, name: action.name, skipped: false, success: false, error: message };
  }
}

async function runForwardAction(action: ForwardPolicyAction, payload: MailPolicyMatchPayload, forward?: Forwarder): Promise<PolicyActionResult> {
  if (action.to.some((to) => extractDomain(to) === payload.domain)) {
    return { id: action.id, type: action.type, name: action.name, skipped: true, success: false, error: '不能转发到当前收件域名，避免邮件循环' };
  }
  if (!forward) {
    return { id: action.id, type: action.type, name: action.name, skipped: false, success: false, error: '转发动作只能在 Cloudflare Email Runtime 中执行' };
  }
  try {
    await Promise.all(action.to.map((to) => forward(to)));
    return { id: action.id, type: action.type, name: action.name, skipped: false, success: true };
  } catch (error) {
    return { id: action.id, type: action.type, name: action.name, skipped: false, success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function trimTelegramMessage(message: string) {
  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
}

async function telegramRequest(botToken: string, method: 'sendMessage' | 'sendDocument', body: FormData | Record<string, unknown>) {
  const init: RequestInit =
    body instanceof FormData
      ? { method: 'POST', body }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      ...init,
      signal: controller.signal
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!response.ok || data?.ok !== true) {
      throw new Error(data?.description || `Telegram 请求失败：${response.status}`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Telegram 请求超时：${TELEGRAM_TIMEOUT_MS / 1000} 秒`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function telegramMailButton(shareUrl: string) {
  return {
    inline_keyboard: [[{ text: '查看邮件详情', url: shareUrl }]]
  };
}

async function sendTelegramMessage(action: TelegramPolicyAction, message: string, shareUrl?: string) {
  await Promise.all(
    action.chatIds.map((chatId) =>
      telegramRequest(action.botToken, 'sendMessage', {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(shareUrl ? { reply_markup: telegramMailButton(shareUrl) } : {})
      })
    )
  );
}

// 已注释：不启用 R2 附件存储
// async function telegramAttachmentRows(env: Env, mailId: string) {
//   const rows = await env.DB.prepare(
//     `SELECT id, filename, mime_type AS mimeType, size, object_key AS objectKey
//      FROM mail_attachments
//      WHERE mail_id = ? AND stored = 1 AND object_key <> ''
//      ORDER BY created_at ASC, id ASC`
//   )
//     .bind(mailId)
//     .all<Record<string, unknown>>();
//   return (rows.results || []).map((row) => ({
//     id: String(row.id || ''),
//     filename: String(row.filename || 'attachment'),
//     mimeType: String(row.mimeType || 'application/octet-stream'),
//     size: Number(row.size || 0),
//     objectKey: String(row.objectKey || '')
//   }));
// }
//
// async function sendTelegramDocument(action: TelegramPolicyAction, chatId: string, file: File) {
//   const form = new FormData();
//   form.set('chat_id', chatId);
//   form.set('document', file);
//   await telegramRequest(action.botToken, 'sendDocument', form);
// }
//
// async function sendTelegramAttachments(env: Env, action: TelegramPolicyAction, payload: MailPolicyPayload) {
//   if (!env.MAIL_BUCKET || !payload.hasAttachments) return { sent: 0, skipped: 0 };
//   let sent = 0;
//   const rows = await telegramAttachmentRows(env, payload.id);
//   let skipped = Math.max(rows.length - MAX_TELEGRAM_ATTACHMENTS, 0);
//   const attachments = rows.slice(0, MAX_TELEGRAM_ATTACHMENTS).filter((attachment) => {
//     const ok = attachment.objectKey && attachment.size <= TELEGRAM_MAX_FILE_SIZE;
//     if (!ok) skipped += 1;
//     return ok;
//   });
//
//   for (const attachment of attachments) {
//     const object = await env.MAIL_BUCKET.get(attachment.objectKey);
//     if (!object) {
//       skipped += 1;
//       continue;
//     }
//     const file = new File([await object.arrayBuffer()], attachment.filename || 'attachment', { type: attachment.mimeType || 'application/octet-stream' });
//     await Promise.all(action.chatIds.map((chatId) => sendTelegramDocument(action, chatId, file)));
//     sent += 1;
//   }
//
//   return { sent, skipped };
// }

async function runTelegramAction(action: TelegramPolicyAction, env: Env, payload: MailPolicyPayload, shareUrl: () => Promise<string>): Promise<PolicyActionResult> {
  try {
    const url = await shareUrl();
    const message = trimTelegramMessage(renderTelegramTemplate(action.message, payload));

    await sendTelegramMessage(action, message, url);
    // 已注释：不启用 R2 附件存储
    // const attachments = await sendTelegramAttachments(env, action, payload);
    // if (attachments.skipped > 0) {
    //   const skippedMessage = `有 ${attachments.skipped} 个附件未发送，可能未启用 R2 或超过 Telegram 限制。`;
    //   await sendTelegramMessage(action, escapeTelegramHtml(skippedMessage));
    // }

    return {
      id: action.id,
      type: action.type,
      name: action.name,
      skipped: false,
      success: true
    };
  } catch (error) {
    return { id: action.id, type: action.type, name: action.name, skipped: false, success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runPolicyAction(action: PolicyAction, input: PolicyRunInput, payloadCache: { value?: MailPolicyPayload }) {
  if (action.type === 'forward') return runForwardAction(action, input.matchPayload, input.forward);
  payloadCache.value ||= input.fullPayload();
  if (action.type === 'telegram') return runTelegramAction(action, input.env, payloadCache.value, input.shareUrl);
  return runHttpAction(action, payloadCache.value);
}
