---
title: Browser Control Quick Start
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control Quick Start

This document provides ready-to-use curl commands for common Browser Control Manager operations.

**Base URL**: `http://localhost:3333`

---

## 1. Check Service Status

Verify that Browser Control Manager service is running properly.

```bash
curl http://localhost:3333/api/browser/status
```

**Expected Response**:

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

**Checkpoints**:
- `isRunning: true` indicates service is running
- `activeConnections >= 1` indicates browser extension is connected

---

## 2. Get All Tabs

Get tab list from connected browsers.

```bash
curl http://localhost:3333/api/browser/tabs
```

**Expected Response**:

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

**Extract tabId**:

The `id` field of a tab is used for subsequent operations. For example, in the above response, `tabId` is `123456789`.

---

## 3. Get Tab HTML

Get complete HTML content of a specified tab.

```bash
# Replace 123456789 with actual tabId
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**Note**: This operation is asynchronous. HTML content is returned via SSE event `tab_html_received`, or use `requestId` to poll for results.

**Using requestId**:

```bash
# Send request
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "html-req-001"}'

# Wait a few seconds then get result
curl http://localhost:3333/api/browser/callback_response/html-req-001
```

---

## 4. Execute JavaScript on Page

Execute JavaScript code in a specified tab and get return value.

### Get Page Title

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'
```

### Get All Links

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent.trim()})).filter(a => a.href)"}'
```

### Click Element

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button.submit\").click()"}'
```

### Fill Form

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=search]\").value = \"keyword\""}'
```

### Get Page Text Content

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.body.innerText"}'
```

---

## 5. Get Page Cookies

Get cookies for the domain of a specified tab.

### Real-time Retrieval from Browser

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "cookie-req-001"}'

# Wait then get result
curl http://localhost:3333/api/browser/callback_response/cookie-req-001
```

### Query Saved Cookies

```bash
# Query all
curl "http://localhost:3333/api/browser/cookies"

# Filter by domain
curl "http://localhost:3333/api/browser/cookies?domain=example.com"
```

---

## 6. Open New URL

Open URL in a new tab or specified tab.

### Open New Tab

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com"}'
```

### Navigate in Specified Tab

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.google.com", "tabId": 123456789}'
```

---

## 7. Close Tab

Close a specified tab.

```bash
curl -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

---

## Complete Workflow Example

Here's a complete workflow: open page → wait for load → get content → close page

```bash
#!/bin/bash

# 1. Open new tab
echo "Opening page..."
curl -s -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Wait for page to load
sleep 3

# 2. Get tab list, find newly opened tab
echo "Getting tab list..."
TABS=$(curl -s http://localhost:3333/api/browser/tabs)
echo "$TABS"

# 3. Assuming tabId is 123456789, get page title
echo "Getting page title..."
curl -s -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'

# 4. Close tab
echo "Closing tab..."
curl -s -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

---

## Next Steps

- See [API.md](API.md) for detailed API documentation
- See [SCENARIOS.md](SCENARIOS.md) for more usage scenarios
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for problem resolution

---

## Changelog

### v1.0.0 (2026-01-10)
- Initial version
- 7 ready-to-use curl templates for common operations
- Complete workflow example
