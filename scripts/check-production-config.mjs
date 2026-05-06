import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const forbidden = [
  /done-mail-local\b/,
  /\blocal\b/,
  /^\s*(database_id|id)\s*=/m
];

const failed = forbidden.some((pattern) => pattern.test(config));
if (failed) {
  console.error('wrangler.toml 只能用于正式部署，不能包含 local 资源或账号专属 ID。');
  process.exit(1);
}

const required = [
  'name = "done-mail"',
  'database_name = "done-mail-d1"',
  'bucket_name = "done-mail-r2"'
];

const missing = required.filter((item) => !config.includes(item));
if (missing.length) {
  console.error(`wrangler.toml 缺少正式配置：${missing.join(', ')}`);
  process.exit(1);
}
