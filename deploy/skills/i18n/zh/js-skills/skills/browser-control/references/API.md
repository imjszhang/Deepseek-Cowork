---
title: Browser Control API 参考
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control API 参考

本文档提供 Browser Control Manager 所有 HTTP API 的完整说明。

**基础地址**: `http://localhost:3333`

**API 前缀**: `/api/browser`

---

## 1. 状态查询

### GET /api/browser/status

获取服务运行状态和连接信息。

**参数**: 无

**curl 示例**:

```bash
curl http://localhost:3333/api/browser/status
```

**返回示例**:

```json
{
  "status": "success",
  "data": {
    "isRunning": true,
    "state": "running",
    "startTime": "2026-01-10T10:00:00.000Z",
    "uptime": 3600000,
    "connections": {
      "extensionWebSocket": {
        "enabled": true,
        "activeConnections": 1,
        "port": 8080,
        "baseUrl": "ws://localhost:8080"
      }
    }
  }
}
```

---

### GET /api/browser/config

获取服务配置信息。

**参数**: 无

**curl 示例**:

```bash
curl http://localhost:3333/api/browser/config
```

**返回示例**:

```json
{
  "status": "success",
  "config": {
    "server": {
      "host": "localhost",
      "port": 3333,
      "baseUrl": "http://localhost:3333"
    },
    "extensionWebSocket": {
      "enabled": true,
      "host": "localhost",
      "port": 8080,
      "baseUrl": "ws://localhost:8080"
    }
  }
}
```

---

## 2. 标签页操作

### GET /api/browser/tabs

获取所有已连接浏览器的标签页列表。

**参数**: 无

**curl 示例**:

```bash
curl http://localhost:3333/api/browser/tabs
```

**返回示例**:

```json
{
  "status": "success",
  "tabs": [
    {
      "id": 123456789,
      "url": "https://example.com",
      "title": "Example Domain",
      "is_active": true,
      "window_id": 1,
      "index_in_window": 0,
      "favicon_url": "https://example.com/favicon.ico"
    }
  ],
  "needsCallback": false
}
```

---

### POST /api/browser/open_url

打开新标签页或在指定标签页中导航到 URL。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 要打开的 URL |
| `tabId` | number | 否 | 指定标签页 ID，不传则新建标签页 |
| `windowId` | number | 否 | 指定窗口 ID |
| `requestId` | string | 否 | 请求 ID，用于追踪异步结果 |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
# 打开新标签页
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 在指定标签页中导航
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "tabId": 123456789}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

**注意**: 此操作是异步的，`needsCallback: true` 表示需要等待回调或轮询结果。

---

### POST /api/browser/close_tab

关闭指定标签页。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 要关闭的标签页 ID |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

---

### POST /api/browser/get_html

获取指定标签页的 HTML 内容。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

**注意**: HTML 内容会通过回调或 SSE 事件 `tab_html_received` 返回。

---

## 3. 脚本执行

### POST /api/browser/execute_script

在指定标签页中执行 JavaScript 代码。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `code` | string | 是 | 要执行的 JavaScript 代码 |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
# 获取页面标题
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'

# 点击按钮
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button\").click()"}'

# 获取所有链接
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent}))"}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

**注意**: 脚本执行结果通过回调或 SSE 事件 `script_executed` 返回。

---

### POST /api/browser/inject_css

在指定标签页中注入 CSS 样式。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `css` | string | 是 | 要注入的 CSS 代码 |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/inject_css \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "css": "body { background: #f0f0f0 !important; }"}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

---

## 4. Cookie 操作

### POST /api/browser/get_cookies

从浏览器获取指定标签页的 Cookie（实时获取）。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true,
  "requestId": "abc123"
}
```

**注意**: Cookie 数据通过回调或 SSE 事件 `cookies_received` 返回。

---

### POST /api/browser/save_cookies

将 Cookie 保存到本地数据库。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `cookies` | array | 是 | Cookie 数组 |
| `url` | string | 否 | 页面 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/save_cookies \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "cookies": [
      {
        "name": "session",
        "value": "abc123",
        "domain": ".example.com",
        "path": "/",
        "secure": true,
        "httpOnly": true
      }
    ]
  }'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "成功保存 1 个cookies",
  "saveResult": true,
  "needsCallback": false
}
```

---

### GET /api/browser/cookies

查询数据库中保存的 Cookie。

**参数（Query String）**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `domain` | string | 否 | 按域名过滤（模糊匹配） |
| `name` | string | 否 | 按名称过滤（模糊匹配） |
| `limit` | number | 否 | 返回数量限制，默认 100 |
| `offset` | number | 否 | 偏移量，默认 0 |

**curl 示例**:

```bash
# 获取所有 Cookie
curl "http://localhost:3333/api/browser/cookies"

# 按域名过滤
curl "http://localhost:3333/api/browser/cookies?domain=example.com"

# 分页查询
curl "http://localhost:3333/api/browser/cookies?limit=50&offset=0"
```

**返回示例**:

```json
{
  "status": "success",
  "cookies": [
    {
      "id": 1,
      "name": "session",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax",
      "createdAt": "2026-01-10T10:00:00.000Z"
    }
  ],
  "total": 1,
  "filters": { "domain": null, "name": null },
  "pagination": { "limit": 100, "offset": 0 },
  "needsCallback": false
}
```

---

### GET /api/browser/cookies/:tabId (已废弃)

> **⚠️ 已废弃**: 此 API 已废弃。cookies 表已重构，不再按 tabId 存储。请使用 `GET /api/browser/cookies?domain=xxx` 按域名查询。

~~获取指定标签页保存的 Cookie。~~

**替代方案**:

- `GET /api/browser/cookies` - 获取所有 cookies
- `GET /api/browser/cookies?domain=xxx` - 按域名过滤
- `GET /api/browser/cookies/domain/:domain` - 按域名获取

**返回示例（HTTP 410 Gone）**:

```json
{
  "status": "error",
  "message": "此 API 已废弃。cookies 表已重构，不再按 tabId 存储。请使用 GET /api/browser/cookies?domain=xxx 按域名查询。",
  "needsCallback": false,
  "alternatives": [
    "GET /api/browser/cookies - 获取所有 cookies",
    "GET /api/browser/cookies?domain=xxx - 按域名过滤",
    "GET /api/browser/cookies/domain/:domain - 按域名获取"
  ]
}
```

---

### GET /api/browser/cookies/stats

获取 Cookie 统计信息。

**参数**: 无

**curl 示例**:

```bash
curl http://localhost:3333/api/browser/cookies/stats
```

**返回示例**:

```json
{
  "status": "success",
  "stats": {
    "totalCookies": 150,
    "uniqueDomains": 25,
    "secureCookies": 120,
    "sessionCookies": 30,
    "recentCookies": 10
  },
  "needsCallback": false
}
```

---

## 5. 文件上传

### POST /api/browser/upload_file_to_tab

向页面中的文件输入框上传文件。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `files` | array | 是 | 文件数组 |
| `files[].name` | string | 是 | 文件名 |
| `files[].base64` | string | 是 | Base64 编码的文件内容 |
| `files[].type` | string | 是 | MIME 类型 |
| `files[].size` | number | 否 | 文件大小（字节） |
| `targetSelector` | string | 否 | 目标元素选择器，默认 `input[type="file"]` |
| `requestId` | string | 否 | 请求 ID |
| `callbackUrl` | string | 否 | 回调 URL |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/upload_file_to_tab \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "files": [
      {
        "name": "image.png",
        "base64": "data:image/png;base64,iVBORw0KGgo...",
        "type": "image/png",
        "size": 1024
      }
    ],
    "targetSelector": "input[type=\"file\"]"
  }'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "消息已发送",
  "needsCallback": true
}
```

**支持的文件类型**:
- 图片: jpeg, jpg, png, gif, webp, bmp, svg+xml
- 文档: pdf, txt, csv, doc, docx, xls, xlsx
- 媒体: mp3, wav, mp4, webm

**限制**: 单文件最大 50MB

---

## 6. 事件

### GET /api/browser/events

建立 SSE（Server-Sent Events）连接，接收实时事件。

**参数**: 无

**curl 示例**:

```bash
curl -N http://localhost:3333/api/browser/events
```

**事件类型**:

| 事件 | 说明 |
|------|------|
| `connected` | SSE 连接建立 |
| `tabs_update` | 标签页列表更新 |
| `tab_opened` | 新标签页打开 |
| `tab_closed` | 标签页关闭 |
| `tab_url_changed` | 标签页 URL 变更 |
| `tab_html_received` | 收到页面 HTML |
| `script_executed` | 脚本执行完成 |
| `css_injected` | CSS 注入完成 |
| `cookies_received` | 收到 Cookie 数据 |
| `error` | 错误事件 |
| `custom_event` | 自定义事件 |

**事件格式**:

```
event: tabs_update
data: {"tabs":[...]}

event: script_executed
data: {"tabId":123,"result":"Hello World"}
```

---

### POST /api/browser/emit_event

发送自定义事件到 SSE 客户端。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `eventName` | string | 是 | 事件名称 |
| `data` | object | 否 | 事件数据 |

**curl 示例**:

```bash
curl -X POST http://localhost:3333/api/browser/emit_event \
  -H "Content-Type: application/json" \
  -d '{"eventName": "my_event", "data": {"message": "Hello"}}'
```

**返回示例**:

```json
{
  "status": "success",
  "message": "自定义事件 'my_event' 已发送",
  "eventData": {
    "eventName": "my_event",
    "data": { "message": "Hello" },
    "timestamp": "2026-01-10T10:00:00.000Z"
  }
}
```

---

## 7. 回调

### GET /api/browser/callback_response/:requestId

获取异步操作的结果。

**参数**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `requestId` | string | 是 | 请求 ID（路径参数） |

**curl 示例**:

```bash
curl http://localhost:3333/api/browser/callback_response/abc123
```

**返回示例（成功）**:

```json
{
  "status": "success",
  "requestId": "abc123",
  "data": {
    "html": "<!DOCTYPE html>..."
  }
}
```

**返回示例（未找到）**:

```json
{
  "status": "error",
  "message": "未找到给定请求ID的响应"
}
```

---

## 常见错误

| 错误信息 | HTTP 状态码 | 原因 | 解决方案 |
|----------|-------------|------|----------|
| WebSocket服务器不可用 | 500 | 扩展连接服务未启动 | 检查服务是否正常运行 |
| 标签页管理器不可用 | 500 | 内部服务错误 | 重启服务 |
| 请求中缺少'url'参数 | 400 | 缺少必需参数 | 检查请求参数 |
| 请求中缺少'tabId' | 400 | 缺少必需参数 | 提供有效的 tabId |
| 数据库不可用 | 500 | 数据库连接失败 | 检查数据库文件 |

---

## 更新日志

### v1.0.1 (2026-01-11)
- 修复 `/api/browser/status` 路由缺失问题
- 修复 `/api/browser/cookies/stats` 路由顺序问题
- 废弃 `/api/browser/cookies/:tabId` API（cookies 表已重构，不再关联 tabId）

### v1.0.0 (2026-01-10)
- 初始版本
- 状态查询 API（status, config）
- 标签页操作 API（tabs, open_url, close_tab, get_html）
- 脚本执行 API（execute_script, inject_css）
- Cookie 操作 API（get_cookies, save_cookies, cookies, cookies/:tabId, cookies/stats）
- 文件上传 API（upload_file_to_tab）
- 事件 API（events, emit_event）
- 回调 API（callback_response）
