# 发送邮件

发送邮件需要先在系统设置中开启 Resend，并配置 Resend API Key。

```http
POST /api/send
Content-Type: application/json
X-Admin-Key: your-admin-key
```

## 请求体

```json
{
  "from": "sender@example.com",
  "fromName": "DoneMail",
  "to": "receiver@example.com",
  "toName": "Receiver",
  "subject": "Hello",
  "text": "Plain text body",
  "html": "<p>HTML body</p>",
  "inReplyTo": "<source-message-id@example.com>",
  "references": "<source-message-id@example.com>",
  "attachments": [
    {
      "filename": "report.pdf",
      "mimeType": "application/pdf",
      "content": "base64-content"
    }
  ]
}
```

## 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `from` | string | 是 | 发件邮箱，域名必须已添加到 DoneMail 域名列表 |
| `fromName` | string | 否 | 发件人显示名 |
| `to` | string | 是 | 收件邮箱 |
| `toName` | string | 否 | 收件人显示名 |
| `subject` | string | 是 | 邮件主题 |
| `text` | string | 条件必填 | 纯文本正文，`text` 和 `html` 至少传一个 |
| `html` | string | 条件必填 | HTML 正文，`text` 和 `html` 至少传一个 |
| `inReplyTo` | string | 否 | 回复邮件时写入 `In-Reply-To` 头 |
| `references` | string | 否 | 回复邮件时写入 `References` 头；不传时默认使用 `inReplyTo` |
| `attachments` | array | 否 | 附件列表，最多 `10` 个 |

## 附件字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `filename` | string | 是 | 附件文件名 |
| `mimeType` | string | 否 | MIME 类型，默认 `application/octet-stream` |
| `content` | string | 是 | Base64 内容，可带 `data:*/*;base64,` 前缀 |

## 附件限制

| 限制 | 说明 |
| --- | --- |
| 单个附件 | 最大 `8MB` |
| 单封附件总大小 | 最大 `20MB` |
| Resend 请求总大小 | 最大 `40MB` |
| 禁止类型 | `.exe`、`.bat`、`.js`、`.vbs`、`.ps1` 等高风险附件 |

## 成功返回

```json
{
  "ok": true,
  "data": {
    "id": "sent_abc123",
    "status": "sent"
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | DoneMail 发送记录 ID |
| `status` | string | 固定为 `sent` |

## 失败返回

```json
{
  "ok": false,
  "error": {
    "code": "send_failed",
    "message": "发件域名不在本系统域名列表中"
  }
}
```

| 状态码 | code | 典型原因 |
| --- | --- | --- |
| `400` | `send_failed` | Resend 未开启、API Key 未配置、邮箱格式错误、主题为空、正文为空、附件超限、发件域名未添加 |
