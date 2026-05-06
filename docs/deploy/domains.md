# 域名管理

DoneMail 通过 Cloudflare Email Routing 接收邮件。

## 域名来源

域名列表来自系统配置中的 Cloudflare Token 和 Account ID。

DoneMail 会读取这个账号下可访问的 Cloudflare Zones，因此页面里能选择的域名取决于当前 Token 的账号和权限。

## 配置主域名

添加主域名后，DoneMail 会自动执行：

| 动作 | 说明 |
| --- | --- |
| 保存域名记录 | 把选中的 Cloudflare Zone 保存到 DoneMail |
| 配置邮件路由 DNS | 调用 Cloudflare Email Routing DNS 接口补齐邮件路由 DNS |
| 启用全收转发 | 开启 Catch-all 规则 |
| 指向当前 Worker | 把 Catch-all 动作设置为当前 DoneMail Worker |
| 验证接入状态 | 检查 Email Routing、DNS、Catch-all 和 Worker 指向是否可用 |

生产配置中的 `wrangler.toml` 不保存账号专属 Zone ID。域名来自用户自己的 Cloudflare 账号，部署后在后台选择并接入。

## 接收范围

主域名接入完成后，DoneMail 可以接收这个域名下的所有地址邮件。

例如接入 `example.com` 后，以下地址都可以进入 DoneMail：

- `admin@example.com`
- `hello@example.com`
- `anything@example.com`

不需要在 DoneMail 里逐个创建邮箱账号。收件地址会随邮件自动记录，后续可用于搜索、策略匹配和公开 API 查询。

## 配置子域名

子域名复用父级 Cloudflare Zone。

添加子域名时，只需要填写子域名前缀，例如在 `example.com` 下添加 `mail`，最终接入的是 `mail.example.com`。

DoneMail 会为子域名配置 Email Routing DNS，并验证子域名状态。子域名依赖主域名已经完成 Email Routing 和 Catch-all 接入。

## 状态说明

域名状态由以下检查组成：

- Email Routing 是否启用。
- DNS 是否配置完成。
- Catch-all 是否启用。
- Catch-all 是否指向当前 Worker。

四项都通过后，域名才算可用。
