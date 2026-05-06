import type { HttpRequestPolicyAction, MailPolicyConfig, PolicyConditionField, PolicyConditionOperator } from './types';

export const POLICIES_KEY = 'config:mail_policies';
export const MAX_POLICIES = 50;
export const MAX_CONDITIONS = 20;
export const MAX_ACTIONS = 10;
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_HTTP_TIMEOUT_MS = 8000;
export const MAX_HTTP_TIMEOUT_MS = 15000;
export const MAX_TEMPLATE_LENGTH = 20000;
export const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;
export const TELEGRAM_MAX_FILE_SIZE = 50 * 1024 * 1024;
export const POLICY_CACHE_TTL_MS = 5000;
export const MAX_TELEGRAM_ATTACHMENTS = 5;

export const defaultPolicyConfig: MailPolicyConfig = {
  policies: []
};

export const conditionFields = new Set<PolicyConditionField>(['from', 'fromDomain', 'subject', 'content', 'to', 'domain', 'hasAttachments', 'forwarded']);
export const conditionOperators = new Set<PolicyConditionOperator>(['contains', 'equals', 'startsWith', 'endsWith']);
export const httpMethods = new Set<HttpRequestPolicyAction['method']>(['GET', 'POST']);
export const bodyTypes = new Set<HttpRequestPolicyAction['bodyType']>(['none', 'json', 'form', 'text']);
