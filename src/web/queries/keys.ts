export const queryKeys = {
  auth: ['auth'] as const,
  bootstrap: ['bootstrap'] as const,
  settings: ['settings'] as const,
  entryOrigins: ['entryOrigins'] as const,
  mails: (params: Record<string, unknown>) => ['mails', params] as const,
  latestMail: ['latestMail'] as const,
  mailDetail: (id: string) => ['mailDetail', id] as const,
  sent: (params: Record<string, unknown>) => ['sent', params] as const,
  sentDetail: (id: string) => ['sentDetail', id] as const,
  domains: (params: Record<string, unknown>) => ['domains', params] as const,
  subdomains: (parentId: string, params: Record<string, unknown>) => ['subdomains', parentId, params] as const,
  zones: ['zones'] as const,
  policies: (params: Record<string, unknown>) => ['policies', params] as const,
  forwardAddresses: (emails: string[]) => ['forwardAddresses', emails] as const,
  logs: (params: Record<string, unknown>) => ['logs', params] as const
};
