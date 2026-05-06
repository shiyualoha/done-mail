import type {
  MailPolicy,
  MailPolicyMatchPayload,
  MailPolicyPayload,
  PolicyConditionField,
  PolicyConditionOperator
} from './types';
import { extractDomain } from './utils';

export interface PolicyConditionResult {
  id: string;
  field: PolicyConditionField;
  operator: PolicyConditionOperator;
  value: string;
  matched: boolean;
  actual: string;
}

type MatchFields = Record<PolicyConditionField, string>;

export function buildMatchFields(payload: MailPolicyPayload | MailPolicyMatchPayload): MatchFields {
  return {
    from: `${payload.fromName} ${payload.fromAddr}`.trim(),
    fromDomain: extractDomain(payload.fromAddr),
    subject: payload.subject,
    content: `${payload.textBody || ''} ${payload.htmlBody || ''} ${payload.preview || ''}`.trim(),
    to: payload.to,
    domain: payload.domain,
    hasAttachments: payload.hasAttachments ? 'true' : 'false',
    forwarded: payload.forwarded ? 'true' : 'false'
  };
}

function matchOne(source: string, operator: PolicyConditionOperator, expected: string) {
  const left = source.toLowerCase();
  const right = expected.toLowerCase();
  if (operator === 'equals') return left === right;
  if (operator === 'startsWith') return left.startsWith(right);
  if (operator === 'endsWith') return left.endsWith(right);
  return left.includes(right);
}

export function conditionResults(policy: MailPolicy, fields: MatchFields): PolicyConditionResult[] {
  return policy.conditions.map((condition) => {
    const actual = fields[condition.field] || '';
    return {
      ...condition,
      actual,
      matched: matchOne(actual, condition.operator, condition.value)
    };
  });
}

export function policyUsesContent(policy: MailPolicy) {
  return policy.conditions.some((condition) => condition.field === 'content');
}

export function policyMatches(policy: MailPolicy, fields: MatchFields) {
  if (!policy.enabled) return false;
  if (policy.conditions.length === 0) return true;
  const results = conditionResults(policy, fields);
  return policy.conditionMode === 'any' ? results.some((item) => item.matched) : results.every((item) => item.matched);
}
