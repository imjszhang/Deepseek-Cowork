---
title: Browser Control API Reference
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control API Reference

This document provides complete documentation for all Browser Control Manager HTTP APIs.

**Base URL**: `http://localhost:3333`

**API Prefix**: `/api/browser`

---

## 1. Status Queries

### GET /api/browser/status

Get service running status and connection information.

**Parameters**: None

**curl Example**:

```bash
curl http://localhost:3333/api/browser/status
```

**Response Example**:

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

Get service configuration information.

**Parameters**: None

**curl Example**:

```bash
curl http://localhost:3333/api/browser/config
```

**Response Example**:

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

## 2. Tab Operations

### GET /api/browser/tabs

Get tab list from all connected browsers.

**Parameters**: None

**curl Example**:

```bash
curl http://localhost:3333/api/browser/tabs
```

**Response Example**:

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

Open a new tab or navigate to URL in a specified tab.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL to open |
| `tabId` | number | No | Specify tab ID; creates new tab if not provided |
| `windowId` | number | No | Specify window ID |
| `requestId` | string | No | Request ID for tracking async results |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
# Open new tab
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Navigate in specified tab
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "tabId": 123456789}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

**Note**: This operation is asynchronous. `needsCallback: true` indicates you need to wait for callback or poll for results.

---

### POST /api/browser/close_tab

Close a specified tab.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID to close |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
curl -X POST http://localhost:3333/api/browser/close_tab \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

---

### POST /api/browser/get_html

Get HTML content of a specified tab.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

**Note**: HTML content is returned via callback or SSE event `tab_html_received`.

---

## 3. Script Execution

### POST /api/browser/execute_script

Execute JavaScript code in a specified tab.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `code` | string | Yes | JavaScript code to execute |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
# Get page title
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.title"}'

# Click button
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button\").click()"}'

# Get all links
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent}))"}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

**Note**: Script execution results are returned via callback or SSE event `script_executed`.

---

### POST /api/browser/inject_css

Inject CSS styles into a specified tab.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `css` | string | Yes | CSS code to inject |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
curl -X POST http://localhost:3333/api/browser/inject_css \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "css": "body { background: #f0f0f0 !important; }"}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

---

## 4. Cookie Operations

### POST /api/browser/get_cookies

Get cookies from browser for a specified tab (real-time retrieval).

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true,
  "requestId": "abc123"
}
```

**Note**: Cookie data is returned via callback or SSE event `cookies_received`.

---

### POST /api/browser/save_cookies

Save cookies to local database.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `cookies` | array | Yes | Cookie array |
| `url` | string | No | Page URL |

**curl Example**:

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

**Response Example**:

```json
{
  "status": "success",
  "message": "Successfully saved 1 cookies",
  "saveResult": true,
  "needsCallback": false
}
```

---

### GET /api/browser/cookies

Query saved cookies from database.

**Parameters (Query String)**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `domain` | string | No | Filter by domain (fuzzy match) |
| `name` | string | No | Filter by name (fuzzy match) |
| `limit` | number | No | Return limit, default 100 |
| `offset` | number | No | Offset, default 0 |

**curl Example**:

```bash
# Get all cookies
curl "http://localhost:3333/api/browser/cookies"

# Filter by domain
curl "http://localhost:3333/api/browser/cookies?domain=example.com"

# Paginated query
curl "http://localhost:3333/api/browser/cookies?limit=50&offset=0"
```

**Response Example**:

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

### GET /api/browser/cookies/:tabId (Deprecated)

> **⚠️ Deprecated**: This API is deprecated. The cookies table has been restructured and no longer stores by tabId. Please use `GET /api/browser/cookies?domain=xxx` to query by domain.

~~Get cookies saved for a specified tab.~~

**Alternatives**:

- `GET /api/browser/cookies` - Get all cookies
- `GET /api/browser/cookies?domain=xxx` - Filter by domain
- `GET /api/browser/cookies/domain/:domain` - Get by domain

**Response Example (HTTP 410 Gone)**:

```json
{
  "status": "error",
  "message": "This API is deprecated. The cookies table has been restructured and no longer stores by tabId. Please use GET /api/browser/cookies?domain=xxx to query by domain.",
  "needsCallback": false,
  "alternatives": [
    "GET /api/browser/cookies - Get all cookies",
    "GET /api/browser/cookies?domain=xxx - Filter by domain",
    "GET /api/browser/cookies/domain/:domain - Get by domain"
  ]
}
```

---

### GET /api/browser/cookies/stats

Get cookie statistics.

**Parameters**: None

**curl Example**:

```bash
curl http://localhost:3333/api/browser/cookies/stats
```

**Response Example**:

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

## 5. File Upload

### POST /api/browser/upload_file_to_tab

Upload files to a file input on the page.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tabId` | number | Yes | Tab ID |
| `files` | array | Yes | File array |
| `files[].name` | string | Yes | File name |
| `files[].base64` | string | Yes | Base64 encoded file content |
| `files[].type` | string | Yes | MIME type |
| `files[].size` | number | No | File size (bytes) |
| `targetSelector` | string | No | Target element selector, default `input[type="file"]` |
| `requestId` | string | No | Request ID |
| `callbackUrl` | string | No | Callback URL |

**curl Example**:

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

**Response Example**:

```json
{
  "status": "success",
  "message": "Message sent",
  "needsCallback": true
}
```

**Supported File Types**:
- Images: jpeg, jpg, png, gif, webp, bmp, svg+xml
- Documents: pdf, txt, csv, doc, docx, xls, xlsx
- Media: mp3, wav, mp4, webm

**Limits**: Maximum 50MB per file

---

## 6. Events

### GET /api/browser/events

Establish SSE (Server-Sent Events) connection to receive real-time events.

**Parameters**: None

**curl Example**:

```bash
curl -N http://localhost:3333/api/browser/events
```

**Event Types**:

| Event | Description |
|-------|-------------|
| `connected` | SSE connection established |
| `tabs_update` | Tab list updated |
| `tab_opened` | New tab opened |
| `tab_closed` | Tab closed |
| `tab_url_changed` | Tab URL changed |
| `tab_html_received` | Page HTML received |
| `script_executed` | Script execution completed |
| `css_injected` | CSS injection completed |
| `cookies_received` | Cookie data received |
| `error` | Error event |
| `custom_event` | Custom event |

**Event Format**:

```
event: tabs_update
data: {"tabs":[...]}

event: script_executed
data: {"tabId":123,"result":"Hello World"}
```

---

### POST /api/browser/emit_event

Send custom event to SSE clients.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventName` | string | Yes | Event name |
| `data` | object | No | Event data |

**curl Example**:

```bash
curl -X POST http://localhost:3333/api/browser/emit_event \
  -H "Content-Type: application/json" \
  -d '{"eventName": "my_event", "data": {"message": "Hello"}}'
```

**Response Example**:

```json
{
  "status": "success",
  "message": "Custom event 'my_event' sent",
  "eventData": {
    "eventName": "my_event",
    "data": { "message": "Hello" },
    "timestamp": "2026-01-10T10:00:00.000Z"
  }
}
```

---

## 7. Callbacks

### GET /api/browser/callback_response/:requestId

Get results of async operations.

**Parameters**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `requestId` | string | Yes | Request ID (path parameter) |

**curl Example**:

```bash
curl http://localhost:3333/api/browser/callback_response/abc123
```

**Response Example (Success)**:

```json
{
  "status": "success",
  "requestId": "abc123",
  "data": {
    "html": "<!DOCTYPE html>..."
  }
}
```

**Response Example (Not Found)**:

```json
{
  "status": "error",
  "message": "No response found for the given request ID"
}
```

---

## Common Errors

| Error Message | HTTP Status | Cause | Solution |
|---------------|-------------|-------|----------|
| WebSocket server unavailable | 500 | Extension connection service not started | Check if service is running properly |
| Tab manager unavailable | 500 | Internal service error | Restart service |
| Missing 'url' parameter | 400 | Missing required parameter | Check request parameters |
| Missing 'tabId' | 400 | Missing required parameter | Provide valid tabId |
| Database unavailable | 500 | Database connection failed | Check database file |

---

## Changelog

### v1.0.1 (2026-01-11)
- Fixed missing `/api/browser/status` route
- Fixed `/api/browser/cookies/stats` route ordering issue
- Deprecated `/api/browser/cookies/:tabId` API (cookies table restructured, no longer associated with tabId)

### v1.0.0 (2026-01-10)
- Initial version
- Status query APIs (status, config)
- Tab operations APIs (tabs, open_url, close_tab, get_html)
- Script execution APIs (execute_script, inject_css)
- Cookie operations APIs (get_cookies, save_cookies, cookies, cookies/:tabId, cookies/stats)
- File upload API (upload_file_to_tab)
- Events APIs (events, emit_event)
- Callback API (callback_response)
