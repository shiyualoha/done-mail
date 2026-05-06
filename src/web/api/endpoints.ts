import api, { apiData, apiResultInfo, type ApiResponse, type AuthState } from './client';
import type {
  BootstrapState as SharedBootstrapState,
  BodyType,
  CloudflareAccountInfo,
  CloudflareInspectResult,
  CloudflareWorkerInfo,
  DomainBatchResult,
  DomainRow,
  EntryOriginOption,
  ForwardPolicyAction,
  ForwardAddressStatus,
  HttpMethod,
  HttpRequestPolicyAction,
  LogRow,
  MailDetail,
  MailRow,
  PolicyActionType,
  PolicyCondition,
  PolicyConditionField,
  PolicyConditionMode,
  PolicyConditionOperator,
  PolicyKeyValue,
  PolicyPage as SharedPolicyPage,
  PublicMailPolicy,
  PublicPolicyAction,
  PublicTelegramPolicyAction,
  SendMailPayload,
  SendSettings,
  SentDetail,
  SentRow,
  SettingsState,
  ZoneInfo
} from '../../shared/types';

export type BootstrapState = SharedBootstrapState<AuthState>;
export type CloudflareAccountOption = CloudflareAccountInfo;
export type CloudflareWorkerOption = CloudflareWorkerInfo;
export type ZoneRow = ZoneInfo;
export type ConditionMode = PolicyConditionMode;
export type ConditionField = PolicyConditionField;
export type ConditionOperator = PolicyConditionOperator;
export type ActionType = PolicyActionType;
export type ForwardAction = ForwardPolicyAction;
export type HttpAction = HttpRequestPolicyAction;
export type TelegramAction = PublicTelegramPolicyAction;
export type PolicyAction = PublicPolicyAction;
export type MailPolicy = PublicMailPolicy;
export type PolicyPage = Omit<SharedPolicyPage, 'items'> & { items: MailPolicy[] };
export type {
  BodyType,
  CloudflareInspectResult,
  DomainBatchResult,
  DomainRow,
  EntryOriginOption,
  ForwardAddressStatus,
  HttpMethod,
  LogRow,
  MailDetail,
  MailRow,
  PolicyCondition,
  PolicyKeyValue,
  SendMailPayload,
  SendSettings,
  SentDetail,
  SentRow,
  SettingsState
};

export interface PageResult<T> {
  items: T;
  info: Record<string, unknown>;
}

export function result<T>(response: { data: ApiResponse<T> }) {
  return apiData(response);
}

export function pageResult<T>(response: { data: ApiResponse<T> }): PageResult<T> {
  return {
    items: apiData(response),
    info: apiResultInfo(response)
  };
}

export const endpoints = {
  bootstrap: async () => result(await api.get<ApiResponse<BootstrapState>>('/bootstrap')),
  settings: async () => result(await api.get<ApiResponse<SettingsState>>('/settings')),
  saveSettings: async (payload: Record<string, unknown>) => result(await api.put<ApiResponse<SettingsState>>('/settings', payload)),
  entryOrigins: async () => result(await api.get<ApiResponse<EntryOriginOption[]>>('/settings/entry-origins')),
  testCloudflare: async (payload: Record<string, unknown>) => result(await api.post<ApiResponse<CloudflareInspectResult>>('/settings/test-cloudflare', payload)),
  sendMail: async (payload: SendMailPayload) => result(await api.post<ApiResponse<{ id: string; resendId?: string }>>('/send', payload)),

  mails: async (params: Record<string, unknown>) => pageResult(await api.get<ApiResponse<MailRow[]>>('/mails', { params })),
  latestMail: async () => result(await api.get<ApiResponse<MailRow | null>>('/mails/latest')),
  mailDetail: async (id: string) => result(await api.get<ApiResponse<MailDetail>>(`/mails/${id}`)),
  deleteMail: async (id: string) => result(await api.delete<ApiResponse<{ id: string; deleted: number }>>(`/mails/${id}`)),
  deleteMails: async (ids: string[]) => result(await api.post<ApiResponse<{ ids: string[]; deleted: number }>>('/mails/batch-delete', { ids })),
  createMailShare: async (id: string) => result(await api.post<ApiResponse<{ url: string }>>(`/mails/${id}/share`)),

  sent: async (params: Record<string, unknown>) => pageResult(await api.get<ApiResponse<SentRow[]>>('/sent-mails', { params })),
  sentDetail: async (id: string) => result(await api.get<ApiResponse<SentDetail>>(`/sent-mails/${id}`)),
  deleteSent: async (id: string) => result(await api.delete<ApiResponse<{ id: string; deleted: number }>>(`/sent-mails/${id}`)),
  deleteSentBatch: async (ids: string[]) => result(await api.post<ApiResponse<{ ids: string[]; deleted: number }>>('/sent-mails/batch-delete', { ids })),

  domains: async (params: Record<string, unknown>) => pageResult(await api.get<ApiResponse<DomainRow[]>>('/domains', { params })),
  subdomains: async (parentId: string, params: Record<string, unknown>) => pageResult(await api.get<ApiResponse<DomainRow[]>>(`/domains/${parentId}/subdomains`, { params })),
  zones: async () => result(await api.get<ApiResponse<ZoneRow[]>>('/domains/zones')),
  addDomains: async (zones: Array<{ id: string; name: string }>) => result(await api.post<ApiResponse<DomainBatchResult>>('/domains', { zones })),
  addSubdomains: async (parentId: string, prefixes: string[]) => result(await api.post<ApiResponse<DomainBatchResult>>(`/domains/${parentId}/subdomains`, { prefixes })),
  refreshDomain: async (id: string) => result(await api.post<ApiResponse<{ success: boolean; record?: DomainRow; error?: string }>>(`/domains/${id}/refresh`)),
  removeLocalDomain: async (id: string) => result(await api.post<ApiResponse<{ removed: number }>>(`/domains/${id}/remove-local`)),

  policies: async (params: Record<string, unknown>) => result(await api.get<ApiResponse<PolicyPage>>('/policies', { params })),
  createPolicy: async (payload: Record<string, unknown>) => result(await api.post<ApiResponse<MailPolicy>>('/policies', payload)),
  updatePolicy: async (id: string, payload: Record<string, unknown>) => result(await api.put<ApiResponse<MailPolicy>>(`/policies/${id}`, payload)),
  deletePolicy: async (id: string, version?: string) => result(await api.delete<ApiResponse<{ id: string; deleted: number }>>(`/policies/${id}`, { params: { version } })),
  forwardAddressStatuses: async (emails: string[]) => result(await api.get<ApiResponse<ForwardAddressStatus[]>>('/settings/forward-addresses', { params: { email: emails.join(',') } })),
  createForwardAddress: async (email: string) => result(await api.post<ApiResponse<ForwardAddressStatus>>('/settings/forward-addresses', { email })),

  logs: async (params: Record<string, unknown>) => pageResult(await api.get<ApiResponse<LogRow[]>>('/logs', { params })),
  clearLogs: async (params: Record<string, unknown>) => result(await api.delete<ApiResponse<{ deleted: number }>>('/logs', { params }))
};
