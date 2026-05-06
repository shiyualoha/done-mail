<div align="center">
  <img src="./public/static/logo-mark.svg" alt="DoneMail" width="96" height="96">

  <h1>DoneMail</h1>

  <p><strong>基于 Cloudflare Email Routing 的高性能、可自托管的私有邮箱服务</strong></p>

  <p>
    简体中文 |
    <a href="./README.en.md">English</a> |
    <a href="https://sow.us.kg">使用文档</a>
  </p>

  <p>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-16a34a"></a>
    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lchily/done-mail"><img alt="Deploy to Cloudflare" src="https://img.shields.io/badge/deploy-Cloudflare-f38020"></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6">
    <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  </p>

  <p>DoneMail 是运行在 Cloudflare Workers 上的单管理员高性能邮箱服务，接收 Cloudflare Email Routing 投递的邮件，并提供后台收信、检索、发信、自动化策略、分享链接和公开 API。</p>
</div>

---

## 为什么是 DoneMail

- **部署简单**：点击 Deploy to Cloudflare 后按默认配置完成部署，首次打开页面创建管理员 Key。
- **配置集中**：Cloudflare Token、账号、Worker、入口域名、分享域名和域名状态都在控制台里处理。
- **高性能服务**：正文全文检索由 FTS 索引支撑，长正文也能保持清晰、快速的搜索体验。
- **完整工作流**：功能完整覆盖收信、搜索、发信、附件、分享、自动化和公开 API。
- **多域名管理**：接入 Cloudflare 主域名和子域名，并检查 DNS、Email Routing 和 Worker 转发状态。
- **自动化能力**：按邮件条件触发转发、HTTP 请求和 Telegram 推送，减少重复人工处理。
- **长期自托管**：单管理员模型，维护成本低，不引入多租户、复杂权限和企业套件式负担。

## 快速部署

点击 Deploy to Cloudflare，按页面提示完成部署。详细步骤见 [使用文档](https://sow.us.kg/deploy/one-click)。

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lchily/done-mail">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
  </a>
</p>

```txt
Build command   npm run build
Deploy command  npm run deploy
```

## 技术架构

- **运行平台**：[Cloudflare Workers](https://workers.cloudflare.com/)
- **Web 框架**：[Hono](https://hono.dev/)
- **开发语言**：[TypeScript](https://www.typescriptlang.org/)
- **前端框架**：[Vue 3](https://vuejs.org/)
- **UI 框架**：[Element Plus](https://element-plus.org/)
- **数据查询**：[TanStack Query](https://tanstack.com/query)
- **邮件接收**：[Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- **邮件解析**：[postal-mime](https://github.com/postalsys/postal-mime)
- **邮件发送**：[Resend](https://resend.com/)
- **数据库**：[Cloudflare D1](https://developers.cloudflare.com/d1/)
- **配置缓存**：[Cloudflare KV](https://developers.cloudflare.com/kv/)
- **附件存储**：[Cloudflare R2](https://developers.cloudflare.com/r2/)

## 贡献

欢迎提交 issue 和 PR。开始前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 致谢

感谢 [linux.do](https://linux.do) 社区的交流与支持。

## License

本项目采用 [MIT](./LICENSE) 许可证。
