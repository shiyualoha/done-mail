export interface RateLimitConfig {
  login: number;
  publicApi: number;
  publicShare: number;
}

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
  workerName: string;
}

export interface PublicCloudflareConfig {
  accountId: string;
  workerName: string;
  apiTokenConfigured: boolean;
  apiTokenMasked: string;
}

export interface ResendConfig {
  enabled: boolean;
  apiKey: string;
}

export interface PublicResendConfig {
  enabled: boolean;
  apiKeyConfigured: boolean;
  apiKeyMasked: string;
}

export interface SystemConfig {
  cleanupEnabled: boolean;
  mailRetentionDays: number;
  acceptForwardedMail: boolean;
  adminBaseUrl: string;
  shareBaseUrl: string;
  mailShareTtlHours: number;
  rateLimit: RateLimitConfig;
}

export interface AppConfig {
  cloudflare: CloudflareConfig;
  system: SystemConfig;
  resend: ResendConfig;
}

export interface SettingsState {
  cloudflare: PublicCloudflareConfig;
  system: SystemConfig;
  resend: PublicResendConfig;
}

export interface SendSettings {
  enabled: boolean;
  apiKeyConfigured: boolean;
}

export interface BootstrapState<AuthState = unknown> {
  auth: AuthState;
  settings: SettingsState;
}

export interface CloudflareAccountInfo {
  id: string;
  name: string;
}

export interface CloudflareWorkerInfo {
  id: string;
  name: string;
  routes?: Array<{ pattern?: string; script?: string }>;
}

export interface ZoneInfo {
  id: string;
  name: string;
  status?: string;
}

export interface EntryOriginOption {
  label: string;
  value: string;
  source: 'workers_dev' | 'custom_domain' | 'route' | 'current_site';
}

export interface CloudflareInspectResult {
  ok: boolean;
  accounts: CloudflareAccountInfo[];
  workers: CloudflareWorkerInfo[];
  zones: number;
  accountId: string;
  workerName: string;
  errors: string[];
}

export interface SendMailPayload {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo: string;
  references: string;
  attachments: Array<{ filename: string; mimeType: string; content: string }>;
}

export interface MailRow {
  id: string;
  messageId?: string;
  fromAddr: string;
  fromName: string;
  toAddr: string;
  domain: string;
  receivedByAddr: string;
  forwarded: boolean;
  subject: string;
  bodyPreview: string;
  hasAttachments: boolean;
  attachmentCount: number;
  rawSize?: number;
  receivedAt: string;
}

export interface MailDetail extends MailRow {
  textBody: string;
  htmlBody: string;
  headers: Record<string, string>;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; contentId?: string; disposition?: string; stored: boolean }>;
}

export interface SentRow {
  id: string;
  resendId?: string;
  fromAddr: string;
  fromName: string;
  toAddr: string;
  toName: string;
  subject: string;
  bodyPreview: string;
  hasAttachments: boolean;
  attachmentCount: number;
  status: string;
  error?: string;
  sentAt: string;
}

export interface SentDetail extends SentRow {
  textBody: string;
  htmlBody: string;
  headers: Record<string, string>;
  attachments: Array<{ id: string; filename: string; mimeType: string; size: number; stored: boolean }>;
}

export interface DomainRow {
  id: string;
  zone_id: string;
  zone_name: string;
  name: string;
  parent_domain_id: string | null;
  is_subdomain: number;
  setup_status: 'configuring' | 'ready' | 'failed';
  email_routing_enabled: number;
  dns_configured: number;
  catchall_enabled: number;
  worker_action_enabled: number;
  last_checked_at: string | null;
  last_error: string | null;
  child_count?: number;
}

export interface DomainRecord extends DomainRow {
  created_at: string;
  updated_at: string;
}

export interface DomainBatchItem {
  input: string;
  name: string;
  record: DomainRow | null;
  setup: { success: boolean; error?: string } | null;
  success: boolean;
  error?: string;
}

export interface DomainBatchResult {
  items: DomainBatchItem[];
  success: number;
  failed: number;
}

export interface SetupResult {
  id: string;
  zoneId: string;
  domain: string;
  success: boolean;
  record?: DomainRecord;
  error?: string;
}

export type PolicyConditionMode = 'all' | 'any';
export type PolicyConditionField = 'from' | 'fromDomain' | 'subject' | 'content' | 'to' | 'domain' | 'hasAttachments' | 'forwarded';
export type PolicyConditionOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith';
export type PolicyActionType = 'forward' | 'httpRequest' | 'telegram';
export type HttpMethod = 'GET' | 'POST';
export type BodyType = 'none' | 'json' | 'form' | 'text';

export interface PolicyCondition {
  id: string;
  field: PolicyConditionField;
  operator: PolicyConditionOperator;
  value: string;
}

export interface PolicyKeyValue {
  id: string;
  key: string;
  value: string;
}

export interface ForwardPolicyAction {
  id: string;
  type: 'forward';
  name: string;
  to: string[];
}

export interface HttpRequestPolicyAction {
  id: string;
  type: 'httpRequest';
  name: string;
  method: HttpMethod;
  url: string;
  headers: PolicyKeyValue[];
  query: PolicyKeyValue[];
  bodyType: BodyType;
  body: string;
  timeoutMs: number;
}

export interface TelegramPolicyAction {
  id: string;
  type: 'telegram';
  name: string;
  botToken: string;
  botTokenConfigured?: boolean;
  botTokenMasked?: string;
  chatIds: string[];
  message: string;
}

export type PolicyAction = ForwardPolicyAction | HttpRequestPolicyAction | TelegramPolicyAction;

export interface PublicTelegramPolicyAction extends Omit<TelegramPolicyAction, 'botToken'> {
  botToken: '';
  botTokenConfigured: boolean;
  botTokenMasked: string;
}

export type PublicPolicyAction =
  | ForwardPolicyAction
  | HttpRequestPolicyAction
  | PublicTelegramPolicyAction;

export interface MailPolicy {
  id: string;
  version: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditionMode: PolicyConditionMode;
  stopOnMatch: boolean;
  conditions: PolicyCondition[];
  actions: PolicyAction[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicMailPolicy extends Omit<MailPolicy, 'actions'> {
  actions: PublicPolicyAction[];
}

export interface MailPolicyConfig {
  policies: MailPolicy[];
}

export interface PolicyPage {
  items: PublicMailPolicy[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MailPolicyAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId: string;
  disposition: string;
  stored: boolean;
  downloadApiPath: string;
}

export interface MailPolicyMatchPayload {
  event: 'mail.received';
  id: string;
  messageId: string;
  from: string;
  fromAddr: string;
  fromName: string;
  to: string;
  domain: string;
  forwarded: boolean;
  receivedBy: string;
  subject: string;
  preview: string;
  receivedAt: string;
  rawSize: number;
  hasAttachments: boolean;
  attachmentCount: number;
  textBody: string;
  htmlBody: string;
}

export interface MailPolicyPayload extends MailPolicyMatchPayload {
  headers: Record<string, string>;
  attachments: MailPolicyAttachment[];
}

export interface ForwardAddressStatus {
  email: string;
  id: string;
  exists: boolean;
  verified: boolean;
  verifiedAt: string;
  createdAt: string;
  modifiedAt: string;
}

export interface LogRow {
  id: string;
  module: string;
  target: string;
  action: string;
  status: string;
  message: string;
  createdAt: string;
}
