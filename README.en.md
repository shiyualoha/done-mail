<div align="center">
  <img src="./public/static/logo-mark.svg" alt="DoneMail" width="96" height="96">

  <h1>DoneMail</h1>

  <p><strong>A high-performance, self-hosted private mail service based on Cloudflare Email Routing.</strong></p>

  <p>
    <a href="./README.md">简体中文</a> |
    English |
    <a href="https://sow.us.kg">Documentation</a>
  </p>

  <p>
    <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-16a34a"></a>
    <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lchily/done-mail"><img alt="Deploy to Cloudflare" src="https://img.shields.io/badge/deploy-Cloudflare-f38020"></a>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6">
    <img alt="Vue" src="https://img.shields.io/badge/Vue-3-42b883">
  </p>

  <p>DoneMail is a high-performance, single-admin mail service running on Cloudflare Workers. It receives messages delivered by Cloudflare Email Routing and provides inbox browsing, search, sending, automation rules, share links, and public APIs.</p>
</div>

---

## Why DoneMail

- **Simple deployment**: click Deploy to Cloudflare, keep the default settings, and create the admin key on first visit.
- **Centralized configuration**: manage Cloudflare Token, account, Worker, entry domain, share domain, and domain status in the console.
- **High-performance service**: full-text body search is backed by FTS, keeping search clear and responsive even over long messages.
- **Complete workflow**: fully covers receiving, searching, sending, attachments, sharing, automation, and public APIs.
- **Multi-domain management**: connect Cloudflare root domains and subdomains, then inspect DNS, Email Routing, and Worker forwarding state.
- **Automation**: trigger forwarding, HTTP requests, and Telegram notifications from mail conditions to reduce repetitive manual work.
- **Long-term self-hosting**: single-admin model with low maintenance, without tenants, complex permissions, or enterprise-suite overhead.

## Quick Deploy

Click Deploy to Cloudflare and follow the prompts. See the [documentation](https://sow.us.kg/deploy/one-click) for details.

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/lchily/done-mail">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
  </a>
</p>

```txt
Build command   npm run build
Deploy command  npm run deploy
```

## Technical Architecture

- **Runtime platform**: [Cloudflare Workers](https://workers.cloudflare.com/)
- **Web framework**: [Hono](https://hono.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Frontend framework**: [Vue 3](https://vuejs.org/)
- **UI framework**: [Element Plus](https://element-plus.org/)
- **Data fetching**: [TanStack Query](https://tanstack.com/query)
- **Mail intake**: [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- **Mail parsing**: [postal-mime](https://github.com/postalsys/postal-mime)
- **Mail sending**: [Resend](https://resend.com/)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/)
- **Config cache**: [Cloudflare KV](https://developers.cloudflare.com/kv/)
- **Attachment storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)

## Contributing

Issues and PRs are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before starting.

## Acknowledgements

Thanks to the [linux.do](https://linux.do) community for the discussions and support.

## License

This project is licensed under [MIT](./LICENSE).
