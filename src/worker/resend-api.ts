import type { ResendFailure, ResendSuccess } from './resend-types';
import { safeJsonParse } from './utils';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 8000;

async function fetchResend(init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    return await fetch(RESEND_EMAILS_URL, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Resend 请求超时：${RESEND_TIMEOUT_MS / 1000} 秒`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callResend(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetchResend({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = safeJsonParse<ResendSuccess | ResendFailure>(await response.text(), {});
  if (!response.ok) {
    const message = String((data as ResendFailure).message || 'Resend 发信失败');
    throw new Error(message);
  }
  return data as ResendSuccess;
}

export async function validateResendApiKey(apiKey: string) {
  const key = apiKey.trim();
  if (!key) {
    throw new Error('请填写 Resend Key');
  }

  const response = await fetchResend({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  if (response.ok) return;
  if (response.status === 400 || response.status === 422) return;
  if (response.status === 401 || response.status === 403) {
    throw new Error('Resend Key 无效或没有发信权限');
  }
  if (response.status === 429) {
    throw new Error('Resend 请求过于频繁，请稍后再试');
  }
  throw new Error('Resend 服务暂时不可用，请稍后再试');
}
