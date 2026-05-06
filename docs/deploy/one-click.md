# 一键部署

推荐使用 Cloudflare Deploy Button 一键完成 DoneMail 部署。

## 应用部署

### 1. 点击一键部署

从 DoneMail 仓库或 README 点击 <a class="dm-deploy-button" href="https://deploy.workers.cloudflare.com/?url=https://github.com/lchily/done-mail" target="_blank" rel="noreferrer">Deploy to Cloudflare</a>。

> 截图占位：DoneMail README 中的 Deploy to Cloudflare 按钮。

### 2. 按页面提示完成部署

选择 Git 账号，保持页面默认资源配置，按提示完成部署。

| 资源 | 绑定名 | 说明 |
| --- | --- | --- |
| KV | `KV` | 保存系统配置、管理员 Key 和邮件分享索引 |
| D1 | `DB` | 保存邮件、发信记录、域名、日志和限流计数 |
| R2 | `MAIL_BUCKET` | 保存邮件附件 |

部署配置保持默认：

```txt
Build command   npm run build
Deploy command  npm run deploy
```

> 截图占位：Cloudflare 授权、资源创建和部署页面。

### 3. 初始化后台

部署完成后打开 DoneMail 后台，首次进入时创建管理员 Key。

> 截图占位：DoneMail 初始化管理员 Key 页面。

## 后续更新

Cloudflare 会把部署连接到生成的 Git 仓库。

后续更新只需要更新这个仓库的生产分支，Cloudflare 会自动重新构建并部署。
