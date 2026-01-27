---
title: Browser Control 快速开始
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control 快速开始

本文档提供 Browser Control Manager 常用操作的即用 curl 命令，可直接复制执行。

**基础地址**: `http://localhost:3333`

---

## 1. 检查服务状态

确认 Browser Control Manager 服务是否正常运行。

```bash
curl http://localhost:3333/api/browser/status
```

**期望返回**:

```json
{
  "status": "success",
  "data": {
    "isRunning": true,
    "state": "running",
    "connections": {
      "extensionWebSocket": {
        "activeConnections": 1
      }
    }
  }
}
```

**检查点**:
- `isRunning: true` 表示服务运行中
- `activeConnections >= 1` 表示浏览器扩展已连接

---

## 2. 获取所有标签页

获取已连接浏览器的标签页列表。

```bash
curl http://localhost:3333/api/browser/tabs
```

**期望返回**:

```json
{
  "status": "success",
  "tabs": [
    {
      "id": 123456789,
      "url": "https://example.com",
      "title": "Example Domain",
      "is_active": true
    }
  ]
}
```

**提取 tabId**:

标签页的 `id` 字段用于后续操作。例如上例中 `tabId` 为 `123456789`。

---

## 3. 获取指定标签页 HTML

获取指定标签页的完整 HTML 内容。

```bash
# 替换 123456789 为实际的 tabId
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**注意**: 此操作是异步的。HTML 内容通过 SSE 事件 `tab_html_received` 返回，或使用 `requestId` 轮询获取。

**带 requestId 的方式**:

```bash
# 发送请求
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "html-req-001"}'

# 等待几秒后获取结果
curl http://localhost:3333/api/browser/callback_response/html-req-001
```

---

## 4. 在页面执行 JavaScript

在指定标签页中执行 JavaScript 代码并获取返回值。

### 获取页面标题

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'
```

### 获取所有链接

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent.trim()})).filter(a => a.href)"}'
```

### 点击元素

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button.submit\").click()"}'
```

### 填写表单

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=search]\").value = \"keyword\""}'
```

### 获取页面文本内容

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.body.innerText"}'
```

---

## 5. 获取页面 Cookie

获取指定标签页所在域名的 Cookie。

### 从浏览器实时获取

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "cookie-req-001"}'

# 等待后获取结果
curl http://localhost:3333/api/browser/callback_response/cookie-req-001
```

### 查询已保存的 Cookie

```bash
# 查询所有
curl "http://localhost:3333/api/browser/cookies"

# 按域名过滤
curl "http://localhost:3333/api/browser/cookies?domain=example.com"
```

---

## 6. 打开新 URL

在新标签页或指定标签页中打开 URL。

### 打开新标签页

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com"}'
```

### 在指定标签页中导航

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com", "tabId": 123456789}'
```

---

## 7. 关闭标签页

关闭指定的标签页。

```bash
curl -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

---

## 完整工作流示例

以下是一个完整的工作流：打开页面 → 等待加载 → 获取内容 → 关闭页面

```bash
#!/bin/bash

# 1. 打开新标签页
echo "打开页面..."
curl -s -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 等待页面加载
sleep 3

# 2. 获取标签页列表，找到新打开的标签页
echo "获取标签页列表..."
TABS=$(curl -s http://localhost:3333/api/browser/tabs)
echo "$TABS"

# 3. 假设 tabId 为 123456789，获取页面标题
echo "获取页面标题..."
curl -s -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'

# 4. 关闭标签页
echo "关闭标签页..."
curl -s -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

---

## 下一步

- 查看 [API.md](API.md) 了解所有 API 详细说明
- 查看 [SCENARIOS.md](SCENARIOS.md) 了解更多使用场景
- 遇到问题查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 更新日志

### v1.0.0 (2026-01-10)
- 初始版本
- 7 个常用操作的即用 curl 模板
- 完整工作流示例
