# 一键部署

DoneMail 使用 Cloudflare Workers 的 GitHub 关联部署。

## 应用部署

<div class="dm-step-title">
  <h3 id="1-fork-仓库">1. Fork 仓库 <a class="header-anchor" href="#1-fork-仓库" aria-label="Permalink to &quot;1. Fork 仓库&quot;">​</a></h3>
  <a href="https://github.com/lchily/done-mail" target="_blank" rel="noreferrer">打开 DoneMail 仓库</a>
</div>

Fork DoneMail 仓库到自己的 GitHub。

> 截图占位：GitHub Fork 仓库按钮。

### 2. 点击一键部署

在 Fork 仓库点击 `Deploy to Cloudflare`。

> 截图占位：Fork 仓库中的 Deploy to Cloudflare 按钮。

### 3. 完成授权和部署

按 Cloudflare 引导完成授权和部署。

部署配置为：

```txt
Build command   npm run build
Deploy command  npm run deploy
```

> 截图占位：Cloudflare 授权和部署页面。

### 4. 初始化后台

部署完成后打开 DoneMail 后台，首次进入时创建管理员 Key。

> 截图占位：DoneMail 初始化管理员 Key 页面。

## 后续更新

后续更新只需要同步自己的 Fork 仓库。

当 DoneMail 发布新版本后，在 GitHub 中把上游仓库的新代码同步到自己的 Fork。同步完成后，Cloudflare 会自动检测到仓库变化，并重新构建部署。
