---
title: Browser Control 使用场景指南
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control 使用场景指南

本文档按实际任务组织，提供常见使用场景的完整操作流程。

---

## 场景 1: 获取网页内容进行分析

**目标**: 获取某个网页的完整内容供后续分析

### 步骤

#### 1.1 获取标签页列表

首先找到目标页面的 tabId：

```bash
curl http://localhost:3333/api/browser/tabs
```

从返回结果中找到目标页面：

```json
{
  "tabs": [
    {
      "id": 123456789,
      "url": "https://example.com/article",
      "title": "文章标题"
    }
  ]
}
```

记录 `id` 值（如 `123456789`）。

#### 1.2 获取页面 HTML

```bash
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "get-content-001"}'
```

#### 1.3 获取结果

```bash
curl http://localhost:3333/api/browser/callback_response/get-content-001
```

#### 1.4 或者直接获取文本内容

如果只需要文本（不需要 HTML 标签）：

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.body.innerText"}'
```

---

## 场景 2: 提取页面特定数据

**目标**: 从页面中提取特定信息，如链接、表格、列表等

### 提取所有链接

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent.trim()})).filter(a => a.href && a.href.startsWith(\"http\"))"
  }'
```

### 提取所有图片

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"img\")).map(img => ({src: img.src, alt: img.alt}))"
  }'
```

### 提取表格数据

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"table tr\")).map(tr => Array.from(tr.querySelectorAll(\"td, th\")).map(cell => cell.textContent.trim()))"
  }'
```

### 提取特定元素内容

```bash
# 通过 CSS 选择器提取
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "document.querySelector(\".article-content\")?.innerText"
  }'
```

### 提取 meta 信息

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "({title: document.title, description: document.querySelector(\"meta[name=description]\")?.content, keywords: document.querySelector(\"meta[name=keywords]\")?.content})"
  }'
```

---

## 场景 3: 批量打开多个网址

**目标**: 依次打开多个网址

### 步骤

#### 3.1 打开第一个网址

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page1"}'
```

等待 2-3 秒让页面加载。

#### 3.2 打开第二个网址

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page2"}'
```

#### 3.3 批量打开脚本示例

```bash
#!/bin/bash

URLS=(
  "https://example.com/page1"
  "https://example.com/page2"
  "https://example.com/page3"
)

for url in "${URLS[@]}"; do
  echo "打开: $url"
  curl -s -X POST http://localhost:3333/api/browser/open_url \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  sleep 2  # 等待页面加载
done

echo "完成，获取标签页列表..."
curl -s http://localhost:3333/api/browser/tabs
```

---

## 场景 4: 获取登录态 Cookie

**目标**: 获取已登录网站的 Cookie，用于后续自动化操作

### 步骤

#### 4.1 确认已登录

确保目标网站已在浏览器中登录。

#### 4.2 获取标签页

```bash
curl http://localhost:3333/api/browser/tabs
```

找到目标网站的 tabId。

#### 4.3 获取 Cookie

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "cookie-001"}'
```

#### 4.4 获取结果

```bash
curl http://localhost:3333/api/browser/callback_response/cookie-001
```

#### 4.5 保存 Cookie 到数据库

将获取的 Cookie 保存以便后续使用：

```bash
curl -X POST http://localhost:3333/api/browser/save_cookies \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "cookies": [
      {"name": "session", "value": "xxx", "domain": ".example.com", "path": "/"}
    ]
  }'
```

#### 4.6 后续查询已保存的 Cookie

```bash
curl "http://localhost:3333/api/browser/cookies?domain=example.com"
```

---

## 场景 5: 在页面执行自动化操作

**目标**: 自动填写表单、点击按钮等

### 填写登录表单

```bash
# 填写用户名
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=username]\").value = \"myuser\""}'

# 填写密码
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=password]\").value = \"mypass\""}'

# 点击登录按钮
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button[type=submit]\").click()"}'
```

### 填写搜索框并提交

```bash
# 填写搜索关键词
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=q]\").value = \"搜索关键词\""}'

# 提交表单
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"form\").submit()"}'
```

### 滚动页面

```bash
# 滚动到底部
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "window.scrollTo(0, document.body.scrollHeight)"}'

# 滚动到指定元素
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"#target-element\").scrollIntoView()"}'
```

### 等待元素出现

```bash
# 检查元素是否存在
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "!!document.querySelector(\".loading-complete\")"}'
```

---

## 场景 6: 监听页面变化

**目标**: 实时监听浏览器事件

### 建立 SSE 连接

```bash
# 持续监听事件（-N 保持连接）
curl -N http://localhost:3333/api/browser/events
```

### 事件输出示例

```
event: connected
data: {"message":"SSE连接已建立","timestamp":"2026-01-10T10:00:00.000Z"}

event: tabs_update
data: {"tabs":[...]}

event: tab_url_changed
data: {"tabId":123456789,"url":"https://example.com/new-page"}

event: script_executed
data: {"tabId":123456789,"result":"Hello World"}
```

### 配合脚本处理事件

```bash
#!/bin/bash

# 监听事件并处理
curl -N http://localhost:3333/api/browser/events | while read -r line; do
  if [[ $line == data:* ]]; then
    data="${line#data: }"
    echo "收到事件数据: $data"
    # 在这里添加处理逻辑
  fi
done
```

### 发送自定义事件

```bash
curl -X POST http://localhost:3333/api/browser/emit_event \
  -H "Content-Type: application/json" \
  -d '{"eventName": "task_started", "data": {"taskId": "001", "type": "scrape"}}'
```

---

## 综合示例: 自动化采集流程

以下是一个完整的采集流程示例：

```bash
#!/bin/bash

BASE_URL="http://localhost:3333/api/browser"

# 1. 检查服务状态
echo "检查服务状态..."
STATUS=$(curl -s "$BASE_URL/status")
echo "$STATUS"

# 2. 打开目标页面
echo "打开目标页面..."
curl -s -X POST "$BASE_URL/open_url" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/products"}'

sleep 3

# 3. 获取标签页列表
echo "获取标签页..."
TABS=$(curl -s "$BASE_URL/tabs")
# 提取最新打开的标签页 ID（实际使用时需要解析 JSON）
TAB_ID=$(echo "$TABS" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "标签页 ID: $TAB_ID"

# 4. 提取页面数据
echo "提取产品列表..."
curl -s -X POST "$BASE_URL/execute_script" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID, \"code\": \"Array.from(document.querySelectorAll('.product')).map(p => ({name: p.querySelector('.name')?.innerText, price: p.querySelector('.price')?.innerText}))\"}"

# 5. 获取 Cookie
echo "获取 Cookie..."
curl -s -X POST "$BASE_URL/get_cookies" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID, \"requestId\": \"cookie-final\"}"

sleep 1

curl -s "$BASE_URL/callback_response/cookie-final"

# 6. 关闭标签页
echo "关闭标签页..."
curl -s -X POST "$BASE_URL/close_tab" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID}"

echo "完成!"
```

---

## 下一步

- 遇到问题查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- 查看 [API.md](API.md) 了解所有 API 详细参数

---

## 更新日志

### v1.0.0 (2026-01-10)
- 初始版本
- 6 个典型使用场景
- 综合示例脚本
