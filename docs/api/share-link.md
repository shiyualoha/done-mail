# 创建共享链接

创建共享链接会为指定邮件生成一个可浏览的分享页地址。

使用前需要先在系统设置中配置分享地址；链接有效期由系统设置中的邮件分享有效期决定。

```http
POST /api/mails/:id/share
X-Admin-Key: your-admin-key
```

| 路径参数 | 说明 |
| --- | --- |
| `id` | 邮件 ID，对应 `GET /api/mails` 返回的 `data[].id` |

请求体为空。

## 成功返回

```json
{
  "ok": true,
  "data": {
    "token": "share_abc123",
    "url": "https://mail.example.com/mail/share_abc123",
    "expiresAt": "2026-05-09T10:00:00.000Z",
    "ttlHours": 72
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `token` | string | 分享令牌 |
| `url` | string | 可直接打开的分享页地址 |
| `expiresAt` | string | 过期时间，ISO 8601 |
| `ttlHours` | number | 有效期小时数 |

同一封邮件重复创建分享链接时，会生成新链接并清理旧链接。

## 失败返回

```json
{
  "ok": false,
  "error": {
    "code": "mail_share_failed",
    "message": "请先在系统设置中选择分享地址"
  }
}
```

| 状态码 | code | 典型原因 |
| --- | --- | --- |
| `400` | `mail_share_failed` | 未配置分享地址，或邮件不存在 |

## 限流说明

创建共享链接属于公开 API，鉴权成功不计入限流。

分享访问限流只作用于：

| 路径 | 说明 |
| --- | --- |
| `/mail/:token` | 打开分享页 |
| `/mail/:token/attachments/:attachmentId` | 下载分享页附件 |

分享页默认不加载远程图片，访问者可以在页面中手动显示。
