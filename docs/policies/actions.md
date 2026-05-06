# 执行动作

策略支持三类对外动作。

## 转发邮件

把收到的邮件转发到已验证的地址。

这个动作使用 Cloudflare Email Runtime 的 `message.forward()`，不是 Resend。它不需要配置 Resend Key，也不受“发送邮件”开关影响。

转发邮件只能在收到邮件并执行策略时触发，不能作为主动发信接口使用。

系统会避免转发到当前收件域名，减少循环投递风险。

## HTTP 请求

向指定 URL 发起请求，适合把邮件事件推送到 Webhook、自动化平台或内部系统。

| 配置项 | 说明 |
| --- | --- |
| 请求方法 | 支持 `GET` 和 `POST` |
| URL | 请求地址，支持内置变量 |
| Query 参数 | 追加到 URL 上，参数名和参数值都支持内置变量 |
| Headers | 自定义请求头，Header 名和值都支持内置变量 |
| Body 类型 | 支持无正文、JSON、表单、文本 |
| Body 内容 | JSON、表单和文本内容都支持内置变量 |

执行规则：

- `GET` 请求不发送 Body。
- JSON Body 渲染后必须是合法 JSON。
- 表单 Body 会以 `application/x-www-form-urlencoded` 发送。
- JSON Body 默认使用 `Content-Type: application/json`。
- 表单 Body 默认使用 `Content-Type: application/x-www-form-urlencoded`。
- 如果手动配置了同名 `Content-Type`，优先使用手动配置。
- 请求超时时间范围是 `1-15` 秒，默认 `8` 秒。
- 只有 HTTP `2xx` 响应会被视为执行成功。

## Telegram 通知

Telegram 通知需要配置 `Bot Token`、`Chat ID` 和消息模板。

| 配置项 | 说明 |
| --- | --- |
| `Bot Token` | 在 Telegram 中通过 `@BotFather` 创建 Bot 后获得 |
| `Chat ID` | Bot 要发送到的个人、群组或频道 ID |
| 消息模板 | 通知内容，支持内置变量 |

获取 `Chat ID` 的常用方式：

- 先给 Bot 发送一条消息，或把 Bot 加入群组后在群里发送一条消息。
- 打开 `https://api.telegram.org/bot<Bot Token>/getUpdates`。
- 在返回结果里找到 `message.chat.id`，填入 DoneMail 的 `Chat ID`。

群组的 `Chat ID` 通常是负数。多个 `Chat ID` 可以每行填写一个，也可以用英文逗号分隔；系统最多保留 10 个。

Telegram 消息使用 HTML 解析模式，模板里的变量会自动做 HTML 转义。

## 内置变量

::: v-pre

HTTP 请求和 Telegram 通知支持模板变量，格式为 `{{变量名}}`。

| 变量 | 说明 |
| --- | --- |
| `{{id}}` | 邮件 ID |
| `{{messageId}}` | 原始邮件 Message-ID |
| `{{from}}` | 发件人展示文本，可能包含名称和邮箱 |
| `{{fromAddr}}` | 发件邮箱 |
| `{{fromName}}` | 发件人名称 |
| `{{to}}` | 收件邮箱 |
| `{{domain}}` | 收件域名 |
| `{{receivedBy}}` | 实际接收地址 |
| `{{subject}}` | 邮件主题 |
| `{{content}}` | 正文内容，优先使用纯文本正文 |
| `{{preview}}` | 正文摘要 |
| `{{textBody}}` | 纯文本正文 |
| `{{htmlBody}}` | HTML 正文 |
| `{{receivedAt}}` | 接收时间 |
| `{{rawSize}}` | 原始邮件大小，单位字节 |
| `{{attachmentCount}}` | 附件数量 |
| `{{hasAttachments}}` | 是否有附件，值为 `true` 或 `false` |
| `{{forwarded}}` | 是否识别为转发邮件，值为 `true` 或 `false` |

新模板建议使用 `{{fromAddr}}` 表示发件邮箱，不建议再用 `{{from}}` 作为发件邮箱字段。

:::
