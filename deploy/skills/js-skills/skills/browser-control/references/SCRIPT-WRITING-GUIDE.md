---
title: Injection Script Writing Guide
version: 1.2.0
created: 2026-01-11
updated: 2026-01-12
author: agent-kaichi
status: stable
---

# Injection Script Writing Guide

This document provides specifications and best practices for writing injection scripts via the `execute_script` API.

---

## Overview

When executing JavaScript through Browser Control's `execute_script` API, scripts run in the browser page environment and results are returned via HTTP/WebSocket. This process involves:

1. **Script transmission**: Sent via HTTP in JSON format
2. **Script execution**: Executed in page context
3. **Result serialization**: Execution results need to be serialized before returning

Each step has considerations to be aware of. **Read this guide before writing scripts**.

---

## 1. Basic Principles

### 1.1 Return Serializable Values

Script return values must be JSON-serializable types.

```javascript
// Serializable: string, number, boolean, null, array, plain object
document.title                    // string
document.querySelectorAll('a').length  // number
{ name: 'test', value: 123 }      // object

// Not serializable: DOM elements, functions, circular references
document.querySelector('.btn')     // HTMLElement -> returns {}
() => {}                          // Function -> cannot serialize
```

### 1.2 Use IIFE for Complex Logic

For multi-line scripts, use Immediately Invoked Function Expression (IIFE) to avoid variable leaks to global scope.

```javascript
// Recommended: IIFE wrapper
(() => {
  const items = document.querySelectorAll('.item');
  return Array.from(items).map(el => el.textContent);
})()

// Avoid: Direct variable declaration
const items = document.querySelectorAll('.item');  // May pollute global
Array.from(items).map(el => el.textContent);
```

### 1.3 Defensive Programming

Assume any DOM operation can fail, use optional chaining and nullish coalescing.

```javascript
// Safe: Use optional chaining
document.querySelector('.title')?.innerText

// Safe: Provide default value
document.querySelector('.title')?.innerText ?? 'Title not found'

// Dangerous: Direct access to potentially non-existent element
document.querySelector('.title').innerText  // Errors if element doesn't exist
```

---

## 2. Encoding Handling (Important)

### 2.1 Problem Description

When scripts contain Chinese or other non-ASCII characters, encoding issues **will** occur:

- **Shell layer**: Different terminals (PowerShell/Bash) handle Chinese differently
- **Transport layer**: JSON string encoding in HTTP requests inconsistent
- **Platform differences**: Different default encodings between Windows and Unix systems

**Embedding Chinese directly in curl commands will almost always fail**, especially in Windows PowerShell.

### 2.2 When Handling is Needed

**Rule**: When script contains any of the following, you **must** use the file transfer method:

- Chinese characters (e.g., `搜索`, `提交`)
- Japanese, Korean, or other non-Latin characters
- Special symbols and emoji
- Complex multi-line scripts

### 2.3 Solutions

#### Method A: File Transfer (Preferred, Strongly Recommended)

**This is the most reliable approach**, completely bypassing Shell encoding issues.

**Principle**: Use Write tool to write request body to JSON file (UTF-8 encoded), then use `curl -d @filename` to read file and send request.

**Standard Process**:

**Step 1**: Use Write tool to create request file `.claude/data/browser-control/workspace/script_request.json` in workspace directory:

```json
{
  "tabId": 123456789,
  "code": "(() => { const title = document.querySelector('h1')?.innerText ?? 'Title not found'; return { success: true, title: title }; })()"
}
```

**Step 2**: Use curl to read file and send request:

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d @.claude/data/browser-control/workspace/script_request.json
```

**Advantages**:
- Write tool ensures correct UTF-8 encoding
- Completely avoids Shell parsing of Chinese
- Complex scripts easier to write, debug, and reuse
- Good cross-platform consistency

**Using Helper Script (Simpler)**:

```bash
# Method 1: Pass complete request JSON file (must be in workspace directory)
node .claude/skills/browser-control/scripts/run_script.js .claude/data/browser-control/workspace/script_request.json

# Method 2: Pass tabId and script file (must be in workspace directory)
node .claude/skills/browser-control/scripts/run_script.js --tabId 123456789 .claude/data/browser-control/workspace/my_script.js
```

#### Method B: Unicode Escape (Alternative)

When file method is not available, convert Chinese characters to `\uXXXX` format Unicode escape sequences.

```javascript
// Original code (contains Chinese)
document.querySelector('input').value = '搜索关键词'

// Escaped (safe)
document.querySelector('input').value = '\u641c\u7d22\u5173\u952e\u8bcd'
```

**Conversion Method**:

```javascript
// Run in Node.js or browser console
function toUnicodeEscape(str) {
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    if (code > 127) {
      return '\\u' + code.toString(16).padStart(4, '0');
    }
    return char;
  }).join('');
}

console.log(toUnicodeEscape('搜索关键词'));
// Output: \u641c\u7d22\u5173\u952e\u8bcd
```

**Limitations**:
- Need to manually convert each Chinese string
- Reduced script readability
- May still have issues in some Shell environments

### 2.4 Method Comparison

| Method | Reliability | Ease of Use | Use Case |
|--------|-------------|-------------|----------|
| File transfer | High | High | All scenarios (recommended) |
| Unicode escape | Medium | Low | Simple scripts, when file writing unavailable |
| Direct embedding | Low | - | ASCII-only scripts |

### 2.5 Platform Notes

#### Windows PowerShell

**Warning**: PowerShell's Chinese encoding handling is very unstable, **must use file transfer method**.

Even with Unicode escape, PowerShell's quote handling may cause issues:

```powershell
# Not recommended: May fail even with escaping
curl -X POST http://localhost:3333/api/browser/execute_script `
  -H "Content-Type: application/json" `
  -d '{"tabId": 123, "code": "document.title"}'

# Recommended: Use file method (file must be in workspace directory)
curl -X POST http://localhost:3333/api/browser/execute_script `
  -H "Content-Type: application/json" `
  -d '@.claude/data/browser-control/workspace/script_request.json'
```

#### Unix Shell (Bash/Zsh)

Generally better UTF-8 support, but **file transfer method is still strongly recommended** for consistency.

```bash
# Recommended: Use file method (file must be in workspace directory)
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d @.claude/data/browser-control/workspace/script_request.json
```

---

## 3. Return Value Handling

### 3.1 Serializable Types

| Type | Example | Notes |
|------|---------|-------|
| string | `"hello"` | Direct return |
| number | `42`, `3.14` | Direct return |
| boolean | `true`, `false` | Direct return |
| null | `null` | Direct return |
| array | `[1, 2, 3]` | Elements must be serializable |
| object | `{a: 1}` | Property values must be serializable |

### 3.2 Non-Serializable Types and Solutions

| Type | Problem | Solution |
|------|---------|----------|
| DOM element | Returns `{}` | Extract needed properties |
| NodeList | Returns `{}` | Convert with `Array.from()` |
| Function | Cannot serialize | Don't return functions |
| Circular reference | Serialization error | Manually construct return object |
| undefined | May be lost | Use `null` instead |

```javascript
// Wrong: Return DOM element
document.querySelector('.user')

// Correct: Extract needed data
(() => {
  const el = document.querySelector('.user');
  if (!el) return null;
  return {
    text: el.innerText,
    href: el.href,
    className: el.className
  };
})()
```

### 3.3 Structured Return Value Pattern

Recommend using unified return value structure for easier caller handling:

```javascript
(() => {
  try {
    // Business logic
    const data = /* ... */;
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
})()
```

---

## 4. Error Handling

### 4.1 try-catch Wrapper

For complex operations, always use try-catch:

```javascript
(() => {
  try {
    const btn = document.querySelector('.submit-btn');
    if (!btn) throw new Error('Submit button not found');
    btn.click();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 4.2 Optional Chaining and Nullish Coalescing

Use ES2020 features to simplify null checks:

```javascript
// Optional chaining (?.) - Safely access potentially non-existent properties
document.querySelector('.title')?.innerText
document.querySelector('.link')?.href

// Nullish coalescing (??) - Provide default value
document.querySelector('.count')?.innerText ?? '0'

// Combined usage
(() => ({
  title: document.querySelector('h1')?.innerText ?? 'No title',
  author: document.querySelector('.author')?.innerText ?? 'Unknown',
  date: document.querySelector('.date')?.innerText ?? null
}))()
```

### 4.3 Unified Error Return Format

```javascript
// Recommended error return format
{
  success: false,
  error: "Error description",
  code: "ERROR_CODE",      // Optional: error code
  details: { /* ... */ }   // Optional: detailed info
}
```

---

## 5. Async Operations

### 5.1 Wait for Element to Appear

Page may have lazy-loaded content, need to wait for element to appear:

```javascript
// Simple element wait function
(() => {
  return new Promise((resolve) => {
    const check = () => {
      const el = document.querySelector('.lazy-content');
      if (el) {
        resolve({ success: true, content: el.innerText });
      } else {
        setTimeout(check, 100);
      }
    };
    check();
    // Timeout handling
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
  });
})()
```

### 5.2 Polling Check Pattern

For scenarios requiring waiting for condition to be met:

```javascript
(() => {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 50;  // Max 50 checks
    const interval = 100;     // Check every 100ms

    const check = () => {
      attempts++;
      const loading = document.querySelector('.loading');
      
      if (!loading) {
        // Loading complete
        resolve({ success: true, data: document.body.innerText });
      } else if (attempts >= maxAttempts) {
        // Timeout
        resolve({ success: false, error: 'Loading timeout' });
      } else {
        setTimeout(check, interval);
      }
    };
    
    check();
  });
})()
```

---

## 6. Common Templates

### 6.1 Safe Data Extraction Template

```javascript
(() => {
  try {
    const items = document.querySelectorAll('.item');
    if (!items.length) {
      return { success: true, data: [], message: 'No items found' };
    }
    
    const data = Array.from(items).map(item => ({
      title: item.querySelector('.title')?.innerText?.trim() ?? '',
      link: item.querySelector('a')?.href ?? '',
      desc: item.querySelector('.desc')?.innerText?.trim() ?? ''
    }));
    
    return { success: true, data: data, count: data.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 6.2 Safe Form Operation Template

```javascript
(() => {
  try {
    // Fill form
    const input = document.querySelector('input[name="search"]');
    if (!input) return { success: false, error: 'Input not found' };
    
    // Use Unicode escape for Chinese
    input.value = '\u641c\u7d22\u5173\u952e\u8bcd';  // "搜索关键词"
    
    // Trigger input event (needed by some frameworks)
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Click submit
    const btn = document.querySelector('button[type="submit"]');
    if (!btn) return { success: false, error: 'Submit button not found' };
    
    btn.click();
    
    return { success: true, message: 'Form submitted' };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 6.3 Scroll Load Template

```javascript
(() => {
  return new Promise((resolve) => {
    const scrollStep = async () => {
      const prevHeight = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      
      // Wait for new content to load
      await new Promise(r => setTimeout(r, 1000));
      
      const newHeight = document.body.scrollHeight;
      if (newHeight === prevHeight) {
        // Reached bottom, collect data
        const items = Array.from(document.querySelectorAll('.item'))
          .map(el => el.innerText);
        resolve({ success: true, data: items, count: items.length });
      } else {
        // Continue scrolling
        scrollStep();
      }
    };
    
    scrollStep();
    
    // Timeout protection
    setTimeout(() => {
      const items = Array.from(document.querySelectorAll('.item'))
        .map(el => el.innerText);
      resolve({ success: true, data: items, count: items.length, partial: true });
    }, 30000);
  });
})()
```

### 6.4 Page Info Extraction Template

```javascript
(() => ({
  url: location.href,
  title: document.title,
  meta: {
    description: document.querySelector('meta[name="description"]')?.content ?? null,
    keywords: document.querySelector('meta[name="keywords"]')?.content ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.content ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.content ?? null
  },
  stats: {
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length,
    forms: document.querySelectorAll('form').length
  }
}))()
```

---

## 7. Common Questions

### Q1: Script Returns Empty Object `{}`

**Cause**: Returned non-serializable value (like DOM element)

**Solution**: Extract needed properties, return plain object

```javascript
// Wrong: Return DOM
document.querySelector('.item')

// Correct: Return data
(() => {
  const el = document.querySelector('.item');
  return el ? { text: el.innerText, html: el.innerHTML } : null;
})()
```

### Q2: Chinese Shows as Garbled or Request Fails

**Cause**: Shell handles Chinese encoding inconsistently

**Solution**: Use file transfer method (strongly recommended)

1. Use Write tool to create JSON request file
2. Use `curl -d @filename` to send request

See "2. Encoding Handling" section in this document.

**Alternative**: Unicode escape

```javascript
// Original: Direct Chinese
'搜索'

// Escaped: Unicode format
'\u641c\u7d22'
```

### Q3: Script Errors Due to Non-Existent Element

**Cause**: Direct access to potentially null element property

**Solution**: Use optional chaining or check first

```javascript
// Dangerous
document.querySelector('.btn').click()

// Safe
document.querySelector('.btn')?.click()
```

### Q4: Cannot Get Async Content

**Cause**: Content is dynamically loaded, not present at execution time

**Solution**: Use wait mechanism (see Section 5)

### Q5: No Change After Form Submission

**Cause**: Modern frameworks need events triggered to recognize value changes

**Solution**: Trigger input event after setting value

```javascript
input.value = 'new value';
input.dispatchEvent(new Event('input', { bubbles: true }));
```

---

## 8. Visual Feedback

### 8.1 Feature Introduction

Visual feedback feature can **highlight page elements being operated on** during script execution, allowing users to visually see the script's operation targets, useful for debugging and confirming script behavior.

**Effect Types**:
- **Border highlight**: Blue border identifies target element
- **Pulse animation**: Dynamic indication during operation
- **Status color change**: Green for success, red for failure
- **Number badge**: Shows element sequence number in batch operations

### 8.2 How to Enable

**Always add `--visual-feedback` parameter (or shorthand `--vf`) when executing scripts**:

```bash
# Script file must be in workspace directory
node .claude/skills/browser-control/scripts/run_script.js --tabId 123456789 .claude/data/browser-control/workspace/my_script.js --visual-feedback
```

> **Important**: Visual feedback is the recommended default behavior. All script execution commands should include this parameter so users can visually see the script's operation targets.

When enabled, scripts can directly use the `__bcHighlight` API.

### 8.3 API Reference

#### Show Highlight

```javascript
__bcHighlight.show(element, options)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| element | HTMLElement | Target DOM element |
| options.label | string | Label text (e.g., "Clicking...") |
| options.pulse | boolean | Whether to use pulse animation |
| options.badge | number | Number badge |

#### Hide Highlight

```javascript
__bcHighlight.hide(element)
```

#### Success/Failure Feedback

```javascript
__bcHighlight.success(element, duration)  // Green feedback
__bcHighlight.fail(element, duration)     // Red feedback
```

`duration` defaults to 1500ms, set to 0 to not auto-hide.

#### Auto-Wrap Operations

```javascript
__bcHighlight.withFeedback(element, fn, options)
```

Auto: Show highlight → Execute operation → Change color based on result → Hide

```javascript
// Example
await __bcHighlight.withFeedback(button, () => {
  button.click();
  return { success: true };
}, { label: 'Click button' });
```

#### Batch Operations

```javascript
__bcHighlight.batch(elements, fn, options)
```

Automatically adds sequence number to each element, executes sequentially and shows progress.

```javascript
// Example
const items = document.querySelectorAll('.item');
const results = await __bcHighlight.batch(items, (el, index) => {
  return el.innerText;
}, { delay: 200 });
```

#### Clear All Highlights

```javascript
__bcHighlight.cleanup()
```

### 8.4 Usage Examples

#### Example 1: Click Button

```javascript
(() => {
  const btn = document.querySelector('.submit-btn');
  if (!btn) return { success: false, error: 'Button not found' };
  
  return __bcHighlight.withFeedback(btn, () => {
    btn.click();
    return { success: true };
  }, { label: 'Click submit' });
})()
```

#### Example 2: Batch Extract Data

```javascript
(() => {
  const items = document.querySelectorAll('.item');
  if (!items.length) return { success: true, data: [] };
  
  return __bcHighlight.batch(items, (item) => ({
    title: item.querySelector('.title')?.innerText ?? '',
    link: item.querySelector('a')?.href ?? ''
  })).then(results => ({
    success: true,
    data: results.map(r => r.result)
  }));
})()
```

#### Example 3: Fill Form

```javascript
(() => {
  const input = document.querySelector('input[name="search"]');
  const btn = document.querySelector('button[type="submit"]');
  
  return (async () => {
    // Fill input
    await __bcHighlight.withFeedback(input, () => {
      input.value = 'search keyword';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, { label: 'Fill search box' });
    
    // Wait a moment
    await new Promise(r => setTimeout(r, 300));
    
    // Click submit
    await __bcHighlight.withFeedback(btn, () => {
      btn.click();
      return true;
    }, { label: 'Click search' });
    
    return { success: true };
  })();
})()
```

### 8.5 Template Files

Script templates with visual feedback are provided:

| Template | Purpose |
|----------|---------|
| `templates/extract_with_feedback.js` | Data extraction (with highlight) |
| `templates/form_with_feedback.js` | Form operations (with highlight) |
| `templates/click_with_feedback.js` | Click operations (with highlight) |

### 8.6 Notes

1. **Doesn't affect page**: Visual feedback uses independent overlay, doesn't modify original page element styles
2. **Auto-cleanup**: All injected DOM and styles are automatically cleaned up after operation completes
3. **Performance overhead**: Visual feedback adds small code overhead, enable only when debugging
4. **Async operations**: `withFeedback` and `batch` return Promise, require `await`

---

## Changelog

### v1.2.0 (2026-01-12)
- Added visual feedback feature section
- Added __bcHighlight API reference
- Added 3 visual feedback usage examples
- Added 3 script templates with visual feedback

### v1.1.0 (2026-01-11)
- Restructured encoding handling section: File transfer method promoted to preferred solution
- Unicode escape demoted to alternative method
- Added method comparison table
- Updated Q2 solution to file transfer method
- Added helper script usage instructions

### v1.0.0 (2026-01-11)
- Initial version
- Basic principles, encoding handling, return value handling, error handling
- Async operations guide
- 4 common templates
- 5 common Q&A
