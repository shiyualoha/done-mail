import type { Env, MailPolicyConfig, MailPolicyPayload, PolicyAction } from './types';
import { listForwardAddressStatuses } from './forward-addresses';
import { logSystemEvent } from './http/logs';
import { DEFAULT_PAGE_SIZE, defaultPolicyConfig, MAX_POLICIES, POLICIES_KEY, POLICY_CACHE_TTL_MS } from './policy-constants';
import { runPolicyAction, type PolicyRunInput } from './policy-actions';
import { buildMatchFields, policyMatches, policyUsesContent } from './policy-match';
import { comparePolicies, createPolicyVersion, normalizePolicy, normalizePolicyConfig, toPublicPolicy, type PolicyInput } from './policy-normalize';
import { safeJsonParse } from './utils';

interface PolicyListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

let policyCache: { env: Env; config: MailPolicyConfig; expiresAt: number } | null = null;

async function saveConfig(env: Env, config: MailPolicyConfig) {
  policyCache = { env, config, expiresAt: Date.now() + POLICY_CACHE_TTL_MS };
  await env.KV.put(POLICIES_KEY, JSON.stringify(config));
}

async function assertForwardActionsVerified(env: Env, actions: PolicyAction[]) {
  const emails = [...new Set(actions.flatMap((action) => (action.type === 'forward' ? action.to : [])))];
  if (emails.length === 0) return;

  const statuses = await listForwardAddressStatuses(env, emails);
  const statusMap = new Map(statuses.map((status) => [status.email, status]));
  const unverified = emails.find((email) => !statusMap.get(email)?.verified);
  if (unverified) throw new Error(`转发邮箱未验证：${unverified}`);
}

export async function getPolicyConfig(env: Env): Promise<MailPolicyConfig> {
  if (policyCache?.env === env && policyCache.expiresAt > Date.now()) {
    return policyCache.config;
  }
  const stored = safeJsonParse<MailPolicyConfig>(await env.KV.get(POLICIES_KEY), defaultPolicyConfig);
  const config = normalizePolicyConfig(stored, stored);
  policyCache = { env, config, expiresAt: Date.now() + POLICY_CACHE_TTL_MS };
  return config;
}

export async function listPolicies(env: Env, query: PolicyListQuery) {
  const config = await getPolicyConfig(env);
  const keyword = String(query.keyword || '').trim().toLowerCase();
  const page = Math.max(Math.floor(Number(query.page) || 1), 1);
  const pageSize = Math.min(Math.max(Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE), 5), 100);
  const filtered = config.policies.filter((policy) => {
    if (!keyword) return true;
    return [policy.name, policy.conditions.map((item) => item.value).join(' '), policy.actions.map((item) => `${item.name} ${item.type}`).join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize).map(toPublicPolicy),
    total: filtered.length,
    page,
    pageSize
  };
}

export async function createPolicy(env: Env, input: unknown) {
  const current = await getPolicyConfig(env);
  if (current.policies.length >= MAX_POLICIES) {
    throw new Error(`邮件策略最多 ${MAX_POLICIES} 条`);
  }
  const body = (input && typeof input === 'object' ? input : {}) as PolicyInput;
  const policy = normalizePolicy({ ...body, version: createPolicyVersion() }, current.policies.length);
  await assertForwardActionsVerified(env, policy.actions);
  await saveConfig(env, { policies: [...current.policies, policy].sort(comparePolicies) });
  return toPublicPolicy(policy);
}

export async function updatePolicy(env: Env, id: string, input: unknown) {
  const current = await getPolicyConfig(env);
  const index = current.policies.findIndex((policy) => policy.id === id);
  if (index < 0) throw new Error('邮件策略不存在');
  const body = (input && typeof input === 'object' ? input : {}) as PolicyInput;
  if (body.version && body.version !== current.policies[index].version) {
    throw new Error('邮件策略已被更新，请刷新后再保存');
  }

  const policy = normalizePolicy({ ...body, id, version: createPolicyVersion() }, index, current.policies[index]);
  await assertForwardActionsVerified(env, policy.actions);
  current.policies.splice(index, 1, policy);
  await saveConfig(env, { policies: current.policies.sort(comparePolicies) });
  return toPublicPolicy(policy);
}

export async function deletePolicy(env: Env, id: string, version?: string) {
  const current = await getPolicyConfig(env);
  const policy = current.policies.find((item) => item.id === id);
  if (!policy) throw new Error('邮件策略不存在');
  if (version && version !== policy.version) {
    throw new Error('邮件策略已被更新，请刷新后再删除');
  }
  await saveConfig(env, { policies: current.policies.filter((item) => item.id !== id) });
  return { id, deleted: 1 };
}

export async function runMailPolicies(env: Env, input: PolicyRunInput) {
  try {
    const config = await getPolicyConfig(env);
    const runnable = config.policies.filter((policy) => policy.enabled && policy.actions.length > 0).sort(comparePolicies);
    if (runnable.length === 0) return;
    const matchFields = buildMatchFields(input.matchPayload);
    const runInput = {
      ...input,
      shareUrl: once(input.shareUrl)
    };

    for (const policy of runnable) {
      const payloadCache: { value?: MailPolicyPayload } = {};
      const fields = policyUsesContent(policy) ? buildMatchFields((payloadCache.value = runInput.fullPayload())) : matchFields;
      if (!policyMatches(policy, fields)) continue;
      await runPolicyActionsInBackground(runInput, policy.name || policy.id, policy.actions, payloadCache);
      if (policy.stopOnMatch) return;
    }
  } catch (error) {
    console.error('邮件策略处理失败', error);
  }
}

function once<T>(fn: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => {
    promise ||= fn();
    return promise;
  };
}

async function runPolicyActionsInBackground(input: PolicyRunInput, policyName: string, actions: PolicyAction[], payloadCache: { value?: MailPolicyPayload }) {
  if (input.executionCtx) {
    input.executionCtx.waitUntil(Promise.resolve().then(() => runPolicyActions(input, policyName, actions, payloadCache)));
    return;
  }
  await runPolicyActions(input, policyName, actions, payloadCache);
}

async function runPolicyActions(input: PolicyRunInput, policyName: string, actions: PolicyAction[], payloadCache: { value?: MailPolicyPayload }) {
  const results = await Promise.allSettled(actions.map((action) => runPolicyAction(action, input, payloadCache)));
  const failures = results
    .map((result, index) => ({ result, action: actions[index] }))
    .map(({ result, action }) => {
      if (result.status === 'rejected') {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`邮件策略 ${policyName} 动作执行失败`, result.reason);
        return `${action.name || action.id}：${message}`;
      }
      if (!result.value.success) {
        console.error(`邮件策略 ${policyName} 动作 ${action.name || action.id} 执行失败`, result.value.error);
        return `${action.name || action.id}：${result.value.error || '策略动作执行失败'}`;
      }
      return '';
    })
    .filter(Boolean);
  if (failures.length > 0) {
    await logSystemEvent(input.env, 'policy', policyName, 'policy', 'failed', failures.join('；'));
  }
}
