import { getCloudflareConfig } from './config';
import type { CloudflareAccountInfo, CloudflareWorkerInfo, Env, ZoneInfo } from './types';

interface ApiEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result_info?: {
    page: number;
    per_page: number;
    total_pages: number;
    total_count: number;
  };
}

interface TokenVerifyResult {
  id?: string;
  status?: string;
}

export interface EmailRoutingDnsRecord {
  type?: string;
  name?: string;
  content?: string;
  priority?: number;
  value?: string;
}

export interface EmailRoutingDnsStatus {
  records: EmailRoutingDnsRecord[];
  errors: Array<{ code?: number; message?: string }>;
}

export interface EmailRoutingSettings {
  enabled?: boolean;
  status?: string;
  name?: string;
}

export interface WorkerDomainCandidate {
  label: string;
  value: string;
  source: 'workers_dev' | 'custom_domain' | 'route' | 'current_site';
}

interface WorkersDevAccountSubdomain {
  subdomain?: string;
}

interface WorkerSubdomainStatus {
  enabled?: boolean;
  previews_enabled?: boolean;
}

export interface EmailRoutingAddress {
  id?: string;
  created?: string;
  email?: string;
  modified?: string;
  tag?: string;
  verified?: string | null;
}

export class CloudflareService {
  private readonly baseUrl = 'https://api.cloudflare.com/client/v4';
  private readonly timeoutMs = 8000;

  private constructor(
    private readonly accountId: string,
    private readonly apiToken: string
  ) {}

  static async fromEnv(env: Env) {
    const config = await getCloudflareConfig(env);
    if (!config.accountId) throw new Error('Cloudflare 账号 ID 未配置');
    if (!config.apiToken) throw new Error('Cloudflare 接口令牌未配置');
    return new CloudflareService(config.accountId, config.apiToken);
  }

  static fromToken(apiToken: string, accountId = '') {
    if (!apiToken) throw new Error('Cloudflare 接口令牌未配置');
    return new CloudflareService(accountId, apiToken);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          ...(init.headers || {})
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Cloudflare API 请求超时：${this.timeoutMs / 1000} 秒`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!res.ok || !data || data.success !== true) {
      const message =
        data?.errors?.map((item) => item.message || item.code).filter(Boolean).join('; ') ||
        `Cloudflare API 请求失败：${res.status}`;
      throw new Error(message);
    }

    return data;
  }

  async getAccounts(): Promise<CloudflareAccountInfo[]> {
    const accounts: CloudflareAccountInfo[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        page: String(page),
        per_page: '50'
      });
      const data = await this.request<Array<{ id: string; name: string }>>(`/accounts?${query.toString()}`);
      accounts.push(...data.result.map((account) => ({ id: account.id, name: account.name })));
      totalPages = data.result_info?.total_pages || 1;
      page += 1;
    } while (page <= totalPages);

    return accounts;
  }

  async getZones(accountId = this.accountId): Promise<ZoneInfo[]> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');

    const zones: ZoneInfo[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        'account.id': accountId,
        page: String(page),
        per_page: '50'
      });
      const data = await this.request<Array<{ id: string; name: string; status?: string }>>(`/zones?${query.toString()}`);
      zones.push(...data.result.map((zone) => ({ id: zone.id, name: zone.name, status: zone.status })));
      totalPages = data.result_info?.total_pages || 1;
      page += 1;
    } while (page <= totalPages);

    return zones;
  }

  async getWorkers(accountId = this.accountId): Promise<CloudflareWorkerInfo[]> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');

    const data = await this.request<Array<{ id?: string; name?: string; script_name?: string; routes?: Array<{ pattern?: string; script?: string }> }>>(`/accounts/${accountId}/workers/scripts`);
    return data.result
      .map((worker) => {
        const name = worker.id || worker.name || worker.script_name || '';
        return name ? { id: name, name, routes: worker.routes || [] } : null;
      })
      .filter(Boolean) as CloudflareWorkerInfo[];
  }

  private async getWorkersDevHost(accountId = this.accountId) {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');

    const data = await this.request<WorkersDevAccountSubdomain>(`/accounts/${accountId}/workers/subdomain`);
    const subdomain = String(data.result?.subdomain || '').trim().toLowerCase();
    if (!subdomain) return '';
    return subdomain.endsWith('.workers.dev') ? subdomain : `${subdomain}.workers.dev`;
  }

  private async getWorkerSubdomainStatus(accountId = this.accountId, workerName: string): Promise<WorkerSubdomainStatus> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');
    if (!workerName) throw new Error('Worker 名称未配置');

    const data = await this.request<WorkerSubdomainStatus>(`/accounts/${accountId}/workers/scripts/${encodeURIComponent(workerName)}/subdomain`);
    return data.result || {};
  }

  async getWorkerEntryOrigins(accountId = this.accountId, workerName: string): Promise<WorkerDomainCandidate[]> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');
    if (!workerName) throw new Error('Worker 名称未配置');

    const candidates: WorkerDomainCandidate[] = [];
    const seen = new Set<string>();
    const addCandidate = (hostname: string, source: WorkerDomainCandidate['source']) => {
      const clean = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^\*\.?/, '').replace(/\/+$/, '');
      if (!clean || clean.includes('*')) return;
      const value = `https://${clean}`;
      if (seen.has(value)) return;
      seen.add(value);
      candidates.push({
        label: clean,
        value,
        source
      });
    };

    const [workersDevHostResult, subdomainStatusResult, domainsResult, workersResult] = await Promise.allSettled([
      this.getWorkersDevHost(accountId),
      this.getWorkerSubdomainStatus(accountId, workerName),
      this.request<Array<{ hostname?: string; service?: string; zone_name?: string }>>(`/accounts/${accountId}/workers/domains`),
      this.getWorkers(accountId)
    ]);

    if (
      workersDevHostResult.status === 'fulfilled' &&
      subdomainStatusResult.status === 'fulfilled' &&
      subdomainStatusResult.value.enabled &&
      workersDevHostResult.value
    ) {
      addCandidate(`${workerName}.${workersDevHostResult.value}`, 'workers_dev');
    }

    if (domainsResult.status === 'fulfilled') {
      for (const domain of domainsResult.value.result || []) {
        if (domain.service === workerName && domain.hostname) {
          addCandidate(domain.hostname, 'custom_domain');
        }
      }
    }

    if (workersResult.status === 'fulfilled') {
      const worker = workersResult.value.find((item) => item.name === workerName) as (CloudflareWorkerInfo & { routes?: Array<{ pattern?: string; script?: string }> }) | undefined;
      for (const route of worker?.routes || []) {
        if (route.script && route.script !== workerName) continue;
        const pattern = String(route.pattern || '').trim();
        if (!pattern.endsWith('/*')) continue;
        addCandidate(pattern.slice(0, -2), 'route');
      }
    }

    const errors = [workersDevHostResult, subdomainStatusResult, domainsResult, workersResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)));
    if (!candidates.length && errors.length) {
      throw new Error(errors[0]);
    }

    return candidates;
  }

  async listDestinationAddresses(accountId = this.accountId): Promise<EmailRoutingAddress[]> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');

    const addresses: EmailRoutingAddress[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const query = new URLSearchParams({
        page: String(page),
        per_page: '50'
      });
      const data = await this.request<EmailRoutingAddress[]>(`/accounts/${accountId}/email/routing/addresses?${query.toString()}`);
      addresses.push(...(data.result || []));
      totalPages = data.result_info?.total_pages || 1;
      page += 1;
    } while (page <= totalPages);

    return addresses;
  }

  async createDestinationAddress(email: string, accountId = this.accountId): Promise<EmailRoutingAddress> {
    if (!accountId) throw new Error('Cloudflare 账号 ID 未配置');
    const clean = email.trim().toLowerCase();
    if (!clean) throw new Error('转发邮箱不能为空');

    const data = await this.request<EmailRoutingAddress>(`/accounts/${accountId}/email/routing/addresses`, {
      method: 'POST',
      body: JSON.stringify({ email: clean })
    });
    return data.result || { email: clean };
  }

  async verifyToken() {
    const data = await this.request<TokenVerifyResult>('/user/tokens/verify');
    return data.result;
  }

  async inspect() {
    const errors: string[] = [];
    let accounts: CloudflareAccountInfo[] = [];
    let workers: CloudflareWorkerInfo[] = [];
    let zones: ZoneInfo[] = [];

    try {
      const token = await this.verifyToken();
      if (token.status && token.status !== 'active') {
        errors.push(`Cloudflare 接口令牌状态异常：${token.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '令牌权限详情读取失败';
      errors.push(message);
    }

    try {
      accounts = await this.getAccounts();
    } catch (error) {
      const message = error instanceof Error ? error.message : '账号列表读取失败';
      errors.push(message);
    }

    const accountId = this.accountId || (accounts.length === 1 ? accounts[0].id : '');

    if (accountId) {
      const [zoneResult, workerResult] = await Promise.allSettled([
        this.getZones(accountId),
        this.getWorkers(accountId)
      ]);

      if (zoneResult.status === 'fulfilled') {
        zones = zoneResult.value;
      } else {
        errors.push(zoneResult.reason instanceof Error ? zoneResult.reason.message : '域名列表读取失败');
      }

      if (workerResult.status === 'fulfilled') {
        workers = workerResult.value;
      } else {
        errors.push(workerResult.reason instanceof Error ? workerResult.reason.message : 'Worker 列表读取失败');
      }
    }

    if (!accounts.length && !accountId) {
      throw new Error(errors[0] || '无法读取 Cloudflare 账号，请检查令牌权限');
    }

    return {
      ok: true,
      accounts,
      workers,
      zones: zones.length,
      accountId,
      workerName: workers.length === 1 ? workers[0].name : '',
      errors
    };
  }

  async getEmailRoutingStatus(zoneId: string) {
    const data = await this.request<EmailRoutingSettings>(`/zones/${zoneId}/email/routing`);
    return data.result;
  }

  async ensureEmailDnsRecords(zoneId: string, domainName?: string) {
    const data = await this.request<unknown>(`/zones/${zoneId}/email/routing/dns`, {
      method: 'POST',
      body: domainName ? JSON.stringify({ name: domainName }) : '{}'
    });
    return data.result;
  }

  async getEmailRoutingDnsStatus(zoneId: string, domainName?: string): Promise<EmailRoutingDnsStatus> {
    const query = new URLSearchParams();
    if (domainName) query.set('subdomain', domainName);

    const data = await this.request<unknown>(`/zones/${zoneId}/email/routing/dns${query.size ? `?${query.toString()}` : ''}`);
    const result = data.result as
      | { record?: EmailRoutingDnsRecord[]; records?: EmailRoutingDnsRecord[]; errors?: Array<{ code?: number; message?: string }> }
      | EmailRoutingDnsRecord[];

    if (Array.isArray(result)) return { records: result, errors: [] };
    return {
      records: Array.isArray(result.record) ? result.record : Array.isArray(result.records) ? result.records : [],
      errors: Array.isArray(result.errors) ? result.errors : []
    };
  }

  async getCatchAll(zoneId: string) {
    const data = await this.request<{
      enabled?: boolean;
      actions?: Array<{ type?: string; value?: string[] }>;
      matchers?: Array<{ type?: string; field?: string; value?: string }>;
      name?: string;
    }>(`/zones/${zoneId}/email/routing/rules/catch_all`);
    return data.result;
  }

  async updateCatchAllToWorker(zoneId: string, workerName: string) {
    if (!workerName) throw new Error('Worker 名称未配置');

    try {
      const data = await this.request<{
        enabled?: boolean;
        actions?: Array<{ type?: string; value?: string[] }>;
      }>(`/zones/${zoneId}/email/routing/rules/catch_all`, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'done-mail catch-all to worker',
          enabled: true,
          matchers: [{ type: 'all' }],
          actions: [{ type: 'worker', value: [workerName] }]
        })
      });
      return data.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authentication/i.test(message)) {
        throw new Error('Cloudflare 拒绝写入全收转发，请使用包含 Worker 脚本写入和邮件路由规则写入权限的令牌');
      }
      throw error;
    }
  }
}
