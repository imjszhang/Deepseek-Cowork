---
title: Browser Control Usage Scenarios Guide
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control Usage Scenarios Guide

This document is organized by practical tasks, providing complete operation workflows for common usage scenarios.

---

## Scenario 1: Get Web Content for Analysis

**Goal**: Get complete content of a webpage for subsequent analysis

### Steps

#### 1.1 Get Tab List

First find the tabId of the target page:

```bash
curl http://localhost:3333/api/browser/tabs
```

Find the target page from the response:

```json
{
  "tabs": [
    {
      "id": 123456789,
      "url": "https://example.com/article",
      "title": "Article Title"
    }
  ]
}
```

Record the `id` value (e.g., `123456789`).

#### 1.2 Get Page HTML

```bash
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "get-content-001"}'
```

#### 1.3 Get Result

```bash
curl http://localhost:3333/api/browser/callback_response/get-content-001
```

#### 1.4 Or Get Text Content Directly

If you only need text (without HTML tags):

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.body.innerText"}'
```

---

## Scenario 2: Extract Specific Data from Page

**Goal**: Extract specific information from page such as links, tables, lists, etc.

### Extract All Links

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"a\")).map(a => ({href: a.href, text: a.textContent.trim()})).filter(a => a.href && a.href.startsWith(\"http\"))"
  }'
```

### Extract All Images

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"img\")).map(img => ({src: img.src, alt: img.alt}))"
  }'
```

### Extract Table Data

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "Array.from(document.querySelectorAll(\"table tr\")).map(tr => Array.from(tr.querySelectorAll(\"td, th\")).map(cell => cell.textContent.trim()))"
  }'
```

### Extract Specific Element Content

```bash
# Extract via CSS selector
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "document.querySelector(\".article-content\")?.innerText"
  }'
```

### Extract Meta Information

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "code": "({title: document.title, description: document.querySelector(\"meta[name=description]\")?.content, keywords: document.querySelector(\"meta[name=keywords]\")?.content})"
  }'
```

---

## Scenario 3: Open Multiple URLs in Batch

**Goal**: Open multiple URLs sequentially

### Steps

#### 3.1 Open First URL

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page1"}'
```

Wait 2-3 seconds for page to load.

#### 3.2 Open Second URL

```bash
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/page2"}'
```

#### 3.3 Batch Open Script Example

```bash
#!/bin/bash

URLS=(
  "https://example.com/page1"
  "https://example.com/page2"
  "https://example.com/page3"
)

for url in "${URLS[@]}"; do
  echo "Opening: $url"
  curl -s -X POST http://localhost:3333/api/browser/open_url \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\"}"
  sleep 2  # Wait for page to load
done

echo "Done, getting tab list..."
curl -s http://localhost:3333/api/browser/tabs
```

---

## Scenario 4: Get Login Session Cookies

**Goal**: Get cookies from logged-in website for subsequent automation

### Steps

#### 4.1 Confirm Logged In

Ensure the target website is already logged in within the browser.

#### 4.2 Get Tab

```bash
curl http://localhost:3333/api/browser/tabs
```

Find the tabId of the target website.

#### 4.3 Get Cookies

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "cookie-001"}'
```

#### 4.4 Get Result

```bash
curl http://localhost:3333/api/browser/callback_response/cookie-001
```

#### 4.5 Save Cookies to Database

Save retrieved cookies for later use:

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

#### 4.6 Query Saved Cookies Later

```bash
curl "http://localhost:3333/api/browser/cookies?domain=example.com"
```

---

## Scenario 5: Execute Automation on Pages

**Goal**: Auto-fill forms, click buttons, etc.

### Fill Login Form

```bash
# Fill username
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=username]\").value = \"myuser\""}'

# Fill password
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=password]\").value = \"mypass\""}'

# Click login button
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"button[type=submit]\").click()"}'
```

### Fill Search Box and Submit

```bash
# Fill search keyword
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"input[name=q]\").value = \"search keyword\""}'

# Submit form
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"form\").submit()"}'
```

### Scroll Page

```bash
# Scroll to bottom
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "window.scrollTo(0, document.body.scrollHeight)"}'

# Scroll to specific element
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.querySelector(\"#target-element\").scrollIntoView()"}'
```

### Wait for Element to Appear

```bash
# Check if element exists
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "!!document.querySelector(\".loading-complete\")"}'
```

---

## Scenario 6: Monitor Page Changes

**Goal**: Monitor browser events in real-time

### Establish SSE Connection

```bash
# Continuously listen for events (-N keeps connection open)
curl -N http://localhost:3333/api/browser/events
```

### Event Output Example

```
event: connected
data: {"message":"SSE connection established","timestamp":"2026-01-10T10:00:00.000Z"}

event: tabs_update
data: {"tabs":[...]}

event: tab_url_changed
data: {"tabId":123456789,"url":"https://example.com/new-page"}

event: script_executed
data: {"tabId":123456789,"result":"Hello World"}
```

### Process Events with Script

```bash
#!/bin/bash

# Listen for events and process
curl -N http://localhost:3333/api/browser/events | while read -r line; do
  if [[ $line == data:* ]]; then
    data="${line#data: }"
    echo "Received event data: $data"
    # Add processing logic here
  fi
done
```

### Send Custom Event

```bash
curl -X POST http://localhost:3333/api/browser/emit_event \
  -H "Content-Type: application/json" \
  -d '{"eventName": "task_started", "data": {"taskId": "001", "type": "scrape"}}'
```

---

## Comprehensive Example: Automated Scraping Workflow

Here's a complete scraping workflow example:

```bash
#!/bin/bash

BASE_URL="http://localhost:3333/api/browser"

# 1. Check service status
echo "Checking service status..."
STATUS=$(curl -s "$BASE_URL/status")
echo "$STATUS"

# 2. Open target page
echo "Opening target page..."
curl -s -X POST "$BASE_URL/open_url" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/products"}'

sleep 3

# 3. Get tab list
echo "Getting tabs..."
TABS=$(curl -s "$BASE_URL/tabs")
# Extract newest tab ID (actual use requires JSON parsing)
TAB_ID=$(echo "$TABS" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*')
echo "Tab ID: $TAB_ID"

# 4. Extract page data
echo "Extracting product list..."
curl -s -X POST "$BASE_URL/execute_script" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID, \"code\": \"Array.from(document.querySelectorAll('.product')).map(p => ({name: p.querySelector('.name')?.innerText, price: p.querySelector('.price')?.innerText}))\"}"

# 5. Get cookies
echo "Getting cookies..."
curl -s -X POST "$BASE_URL/get_cookies" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID, \"requestId\": \"cookie-final\"}"

sleep 1

curl -s "$BASE_URL/callback_response/cookie-final"

# 6. Close tab
echo "Closing tab..."
curl -s -X POST "$BASE_URL/close_tab" \
  -H "Content-Type: application/json" \
  -d "{\"tabId\": $TAB_ID}"

echo "Done!"
```

---

## Next Steps

- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for problem resolution
- See [API.md](API.md) for detailed API parameters

---

## Changelog

### v1.0.0 (2026-01-10)
- Initial version
- 6 typical usage scenarios
- Comprehensive example script
