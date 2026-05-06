import { type Ref } from 'vue';
import { endpoints, type ForwardAddressStatus, type MailPolicy, type PolicyPage } from '../api/endpoints';
import { queryClient as globalQueryClient } from '../queryClient';
import { queryKeys } from './keys';

export function policyParams(query: { page: number; pageSize: number; keyword: string }) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword.trim() || undefined
  };
}

export function loadPoliciesPage(params: Record<string, unknown>, force = false) {
  const options = {
    queryKey: queryKeys.policies(params),
    queryFn: () => endpoints.policies(params),
    staleTime: 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<PolicyPage>(options);
}

function forwardAddressEmails(emails: string[]) {
  return [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))].sort();
}

export function loadForwardAddressStatuses(emails: string[], force = false) {
  const normalized = forwardAddressEmails(emails);
  const options = {
    queryKey: queryKeys.forwardAddresses(normalized),
    queryFn: () => endpoints.forwardAddressStatuses(normalized),
    staleTime: 10 * 60_000
  };
  return force ? globalQueryClient.fetchQuery({ ...options, staleTime: 0 }) : globalQueryClient.ensureQueryData<ForwardAddressStatus[]>(options);
}

export function setForwardAddressStatuses(statuses: ForwardAddressStatus[]) {
  for (const status of statuses) {
    globalQueryClient.setQueryData(queryKeys.forwardAddresses([status.email]), [status]);
  }
}

export async function createForwardAddress(email: string) {
  const status = await endpoints.createForwardAddress(email);
  setForwardAddressStatuses([status]);
  return status;
}

function sortPolicies(items: MailPolicy[]) {
  return [...items].sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function setPolicyPage(activeParams: Ref<Record<string, unknown>>, updater: (page: PolicyPage) => PolicyPage | null) {
  const key = queryKeys.policies(activeParams.value);
  const page = globalQueryClient.getQueryData<PolicyPage>(key);
  if (!page) return null;
  const next = updater(page);
  if (!next) return null;
  globalQueryClient.setQueryData<PolicyPage>(key, next);
  return next;
}

function upsertPolicyPage(activeParams: Ref<Record<string, unknown>>, policy: MailPolicy, creating = false) {
  return setPolicyPage(activeParams, (page) => {
    const existing = page.items.some((item) => item.id === policy.id);
    return {
      ...page,
      total: creating && !existing ? page.total + 1 : page.total,
      items: sortPolicies(existing ? page.items.map((item) => (item.id === policy.id ? policy : item)) : [...page.items, policy])
    };
  });
}

function removePolicyPage(activeParams: Ref<Record<string, unknown>>, policy: MailPolicy) {
  return setPolicyPage(activeParams, (page) => ({
    ...page,
    total: Math.max(page.total - 1, 0),
    items: page.items.filter((item) => item.id !== policy.id)
  }));
}

export async function savePolicyAndUpdatePage(activeParams: Ref<Record<string, unknown>>, payload: Record<string, unknown>, policyId = '') {
  const creating = !policyId;
  const policy = creating ? await endpoints.createPolicy(payload) : await endpoints.updatePolicy(policyId, payload);
  const page = upsertPolicyPage(activeParams, policy, creating);
  return { policy, page };
}

export async function deletePolicyAndUpdatePage(activeParams: Ref<Record<string, unknown>>, policy: MailPolicy) {
  await endpoints.deletePolicy(policy.id, policy.version);
  return removePolicyPage(activeParams, policy);
}
