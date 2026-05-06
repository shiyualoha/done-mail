import { defineConfig } from 'vitepress';
import pkg from '../../package.json';

export default defineConfig({
  lang: 'zh-CN',
  title: 'DoneMail',
  description: '高性能、自托管的 Cloudflare 邮箱控制台',
  cleanUrls: true,
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo-mark.svg' }]],
  themeConfig: {
    logo: '/logo-mark.svg',
    siteTitle: 'DoneMail',
    nav: [
      { text: '简介', link: '/intro/project' },
      { text: '部署与配置', link: '/deploy/one-click' },
      { text: '公开 API', link: '/api/overview' },
      { text: `版本 ${pkg.version}`, link: 'https://github.com/lchily/done-mail/releases' }
    ],
    sidebar: [
      {
        text: 'DoneMail简介',
        collapsed: false,
        items: [
          { text: '项目介绍', link: '/intro/project' },
          { text: '更新日志', link: 'https://github.com/lchily/done-mail/releases' }
        ]
      },
      {
        text: '部署与配置',
        collapsed: false,
        items: [
          { text: '一键部署', link: '/deploy/one-click' },
          { text: '系统配置', link: '/deploy/settings' },
          { text: '域名管理', link: '/deploy/domains' }
        ]
      },
      {
        text: '邮件策略',
        collapsed: false,
        items: [
          { text: '功能说明', link: '/policies/overview' },
          { text: '匹配规则', link: '/policies/matching' },
          { text: '执行动作', link: '/policies/actions' }
        ]
      },
      {
        text: '公开API接口',
        collapsed: false,
        items: [
          { text: '接口说明', link: '/api/overview' },
          { text: '查看邮件列表', link: '/api/view-mails' },
          { text: '查看附件', link: '/api/attachments' },
          { text: '发送邮件', link: '/api/send-mail' },
          { text: '创建共享链接', link: '/api/share-link' }
        ]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/lchily/done-mail' }],
    editLink: {
      pattern: 'https://github.com/lchily/done-mail/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页面'
    },
    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 DoneMail'
    }
  }
});
