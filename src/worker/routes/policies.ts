import { Hono } from 'hono';
import { pageNumber, pageSize } from '../http/query';
import { createPolicy, deletePolicy, listPolicies, updatePolicy } from '../policies';
import type { Env } from '../types';
import { apiOk, jsonFail } from '../utils';

const policyRoutes = new Hono<{ Bindings: Env }>();

policyRoutes.get('/', async (c) => {
  const page = pageNumber(c.req.query('page'));
  const size = pageSize(c.req.query('pageSize'));
  const keyword = (c.req.query('keyword') || '').trim();
  const data = await listPolicies(c.env, { page, pageSize: size, keyword });
  return apiOk(c, data, { page: data.page, pageSize: data.pageSize, total: data.total });
});

policyRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    return apiOk(c, await createPolicy(c.env, body));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '邮件策略保存失败', 400, 'policy_config_invalid');
  }
});

policyRoutes.put('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    return apiOk(c, await updatePolicy(c.env, c.req.param('id'), body));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '邮件策略保存失败', 400, 'policy_config_invalid');
  }
});

policyRoutes.delete('/:id', async (c) => {
  try {
    return apiOk(c, await deletePolicy(c.env, c.req.param('id'), c.req.query('version') || undefined));
  } catch (error) {
    return jsonFail(c, error instanceof Error ? error.message : '邮件策略删除失败', 400, 'policy_not_found');
  }
});

export default policyRoutes;
