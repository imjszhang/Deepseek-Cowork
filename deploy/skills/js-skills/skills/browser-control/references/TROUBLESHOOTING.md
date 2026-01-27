---
title: Browser Control Troubleshooting
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control Troubleshooting

This document provides diagnostic methods and solutions for common problems.

---

## 1. Service Unavailable

### Symptoms

```bash
curl http://localhost:3333/api/browser/status
# Returns: curl: (7) Failed to connect to localhost port 3333
```

### Diagnostic Steps

#### 1.1 Check if Port is Occupied

**Windows**:

```bash
netstat -ano | findstr :3333
```

**macOS/Linux**:

```bash
lsof -i :3333
```

If the port is occupied, check the PID of the occupying process and decide whether to terminate it.

#### 1.2 Check if Service Process is Running

**Windows**:

```bash
tasklist | findstr "electron"
tasklist | findstr "node"
```

**macOS/Linux**:

```bash
ps aux | grep -E "electron|node"
```

#### 1.3 Check Logs

View the Browser Control Manager application's log panel or check console output.

### Solutions

1. **Port occupied**: Terminate the occupying process or modify configuration to use a different port
2. **Service not started**: Start the Browser Control Manager application
3. **Service crashed**: Restart the application, check error logs

---

## 2. No Tab Data

### Symptoms

```bash
curl http://localhost:3333/api/browser/tabs
# Returns: {"status":"success","tabs":[],"needsCallback":false}
```

Tab list is empty, but pages are clearly open in the browser.

### Diagnostic Steps

#### 2.1 Check Extension Connection Status

```bash
curl http://localhost:3333/api/browser/status
```

Check `activeConnections` in the response:

```json
{
  "data": {
    "connections": {
      "extensionWebSocket": {
        "activeConnections": 0
      }
    }
  }
}
```

If `activeConnections: 0`, the browser extension is not connected.

#### 2.2 Check if Browser Extension is Installed

1. Open browser's extension management page
2. Confirm Browser Control extension is installed
3. Confirm extension is enabled

#### 2.3 Check if Extension is Configured Correctly

Extension needs to be configured with the correct WebSocket address (default `ws://localhost:8080`).

### Solutions

1. **Extension not installed**: Install the browser extension
2. **Extension disabled**: Enable the extension
3. **Wrong connection address**: Configure correct WebSocket address in extension settings
4. **Connection dropped**: Refresh the extension or restart browser

---

## 3. Script Execution Failed

### Symptoms

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123, "code": "document.title"}'
# Returns success, but callback result contains error
```

### Diagnostic Steps

#### 3.1 Check if tabId is Valid

```bash
curl http://localhost:3333/api/browser/tabs
```

Confirm the tabId you're using exists in the returned tab list.

#### 3.2 Check if Page has Finished Loading

Some pages may still be loading. First get page status:

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.readyState"}'
```

Expected return: `"complete"`.

#### 3.3 Check Script Syntax

Test the script in browser developer tools console for syntax errors.

### Common Error Causes

| Error | Cause | Solution |
|-------|-------|----------|
| Element doesn't exist | Wrong CSS selector or element not loaded | Check selector, wait for element to load |
| Permission denied | Page has CSP restrictions | Some operations may be restricted |
| Cross-origin error | Accessing iframe content | Cannot directly access cross-origin iframes |

### Solutions

1. **Invalid tabId**: Re-fetch tab list
2. **Page not loaded**: Wait a few seconds and retry
3. **Syntax error**: Fix JavaScript code
4. **Element doesn't exist**: Use optional chaining `?.` to avoid errors

```javascript
// Use optional chaining to avoid errors when element doesn't exist
document.querySelector(".not-exist")?.innerText
```

---

## 4. Cookie Retrieval Failed

### Symptoms

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
# Returns empty cookies or error
```

### Diagnostic Steps

#### 4.1 Confirm Page has Cookies

In browser developer tools → Application → Cookies, confirm the page actually has cookies.

#### 4.2 Check tabId

Ensure the tabId corresponds to the target website.

#### 4.3 Check Domain Restrictions

Some cookies may have specific domain or path restrictions.

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty cookies | Website didn't set cookies | Normal situation, no cookies to retrieve |
| HttpOnly cookies | Scripts cannot read | Can be retrieved via extension API |
| SameSite restriction | Cookie has SameSite policy | Ensure retrieval in correct context |

### Solutions

1. **Confirm logged in**: Some cookies only exist after login
2. **Wait for page load**: Cookies may be set after page loads
3. **Check cookie domain**: Ensure you're getting cookies for the correct domain

---

## 5. Async Operation Timeout

### Symptoms

After sending request, unable to get callback result:

```bash
curl http://localhost:3333/api/browser/callback_response/my-request-id
# Returns: {"status":"error","message":"No response found for the given request ID"}
```

### Diagnostic Steps

#### 5.1 Understand Async Operation Mechanism

The following operations are asynchronous and require waiting for callback:

- `open_url`
- `close_tab`
- `get_html`
- `execute_script`
- `inject_css`
- `get_cookies`
- `upload_file_to_tab`

These APIs return `needsCallback: true` indicating results need to be obtained via callback.

#### 5.2 Check Request ID

Ensure you're using the correct `requestId`. If not specified, system generates one automatically, but you need to record the returned ID.

```bash
# Specify custom requestId
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "my-custom-id"}'

# Use same ID to get result
curl http://localhost:3333/api/browser/callback_response/my-custom-id
```

#### 5.3 Use SSE to Listen

A more reliable way is to use SSE for real-time results:

```bash
curl -N http://localhost:3333/api/browser/events
```

Listen for corresponding events (like `tab_html_received`, `script_executed`).

### Common Causes

| Cause | Description | Solution |
|-------|-------------|----------|
| Wrong request ID | Using non-existent ID | Ensure using correct requestId |
| Insufficient wait time | Operation not completed yet | Increase wait time |
| Extension disconnected | Browser extension disconnected | Check extension status, reconnect |
| Callback expired | Callback results have TTL | Get results promptly |

### Solutions

1. **Use custom requestId**: Easier to track
2. **Increase wait time**: Complex operations may need more time
3. **Use SSE**: Real-time result reception, more reliable
4. **Check extension connection**: Ensure extension stays connected

---

## Quick Diagnostic Checklist

When encountering issues, check in this order:

### 1. Service Layer

```bash
# Check if service is running
curl http://localhost:3333/api/browser/status
```

- [ ] Is service responding?
- [ ] Is `isRunning` `true`?

### 2. Connection Layer

```bash
# Check extension connection
curl http://localhost:3333/api/browser/status | grep activeConnections
```

- [ ] Is `activeConnections` >= 1?
- [ ] Is browser extension installed and enabled?

### 3. Data Layer

```bash
# Check if tabs can be retrieved
curl http://localhost:3333/api/browser/tabs
```

- [ ] Does it return tab list?
- [ ] Is tabId valid?

### 4. Operation Layer

```bash
# Test simple operation
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": YOUR_TAB_ID, "code": "1+1"}'
```

- [ ] Is operation sent successfully?
- [ ] Can callback result be retrieved?

---

## Getting Help

If none of the above methods solve the problem:

1. View application log panel for detailed error information
2. Check browser console for errors
3. Try restarting Browser Control Manager application
4. Try restarting browser

---

## Changelog

### v1.0.0 (2026-01-10)
- Initial version
- Diagnostic methods for 5 common problem types
- Quick diagnostic checklist
