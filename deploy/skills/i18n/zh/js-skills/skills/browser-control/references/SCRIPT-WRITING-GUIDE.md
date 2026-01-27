---
title: 注入脚本编写指南
version: 1.2.0
created: 2026-01-11
updated: 2026-01-12
author: agent-kaichi
status: stable
---

# 注入脚本编写指南

本文档提供通过 `execute_script` API 编写注入脚本的规范和最佳实践。

---

## 概述

通过 Browser Control 的 `execute_script` API 执行 JavaScript 时，脚本会在浏览器页面环境中运行，结果通过 HTTP/WebSocket 返回。这个过程涉及：

1. **脚本传输**：JSON 格式通过 HTTP 发送
2. **脚本执行**：在页面上下文中执行
3. **结果序列化**：执行结果需要序列化后返回

每个环节都有需要注意的问题。**编写脚本前，务必阅读本指南**。

---

## 1. 基本原则

### 1.1 返回可序列化的值

脚本的返回值必须是可 JSON 序列化的类型。

```javascript
// 可序列化：string, number, boolean, null, array, plain object
document.title                    // string
document.querySelectorAll('a').length  // number
{ name: 'test', value: 123 }      // object

// 不可序列化：DOM 元素、函数、循环引用
document.querySelector('.btn')     // HTMLElement -> 返回 {}
() => {}                          // Function -> 无法序列化
```

### 1.2 使用 IIFE 封装复杂逻辑

对于多行脚本，使用立即执行函数表达式（IIFE）封装，避免变量泄露到全局作用域。

```javascript
// 推荐：IIFE 封装
(() => {
  const items = document.querySelectorAll('.item');
  return Array.from(items).map(el => el.textContent);
})()

// 避免：直接声明变量
const items = document.querySelectorAll('.item');  // 可能污染全局
Array.from(items).map(el => el.textContent);
```

### 1.3 防御性编程

假设任何 DOM 操作都可能失败，使用可选链和空值合并。

```javascript
// 安全：使用可选链
document.querySelector('.title')?.innerText

// 安全：提供默认值
document.querySelector('.title')?.innerText ?? '未找到标题'

// 危险：直接访问可能不存在的元素
document.querySelector('.title').innerText  // 元素不存在时报错
```

---

## 2. 编码处理（重要）

### 2.1 问题描述

当脚本包含中文或其他非 ASCII 字符时，**必然**会出现编码问题：

- **Shell 层面**：不同终端（PowerShell/Bash）对中文处理不同
- **传输层面**：HTTP 请求中的 JSON 字符串编码不一致
- **平台差异**：Windows 和 Unix 系统的默认编码不同

**直接在 curl 命令中嵌入中文脚本几乎总是会失败**，特别是在 Windows PowerShell 中。

### 2.2 何时需要处理

**规则**：脚本中包含以下内容时，**必须**使用文件中转法：

- 中文字符（如：`搜索`、`提交`）
- 日文、韩文等非拉丁字符
- 特殊符号和 emoji
- 复杂的多行脚本

### 2.3 处理方案

#### 方案 A：文件中转法（首选，强烈推荐）

**这是最可靠的方式**，完全绕过 Shell 编码问题。

**原理**：使用 Write 工具将请求体写入 JSON 文件（UTF-8 编码），然后用 `curl -d @filename` 读取文件发送请求。

**标准流程**：

**步骤 1**：使用 Write 工具在 workspace 目录创建请求文件 `.claude/data/browser-control/workspace/script_request.json`：

```json
{
  "tabId": 123456789,
  "code": "(() => { const title = document.querySelector('h1')?.innerText ?? '未找到标题'; return { success: true, title: title }; })()"
}
```

**步骤 2**：使用 curl 读取文件发送请求：

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d @.claude/data/browser-control/workspace/script_request.json
```

**优势**：
- Write 工具保证 UTF-8 编码正确
- 完全避免 Shell 对中文的解析
- 复杂脚本更易编写、调试和复用
- 跨平台一致性好

**使用辅助脚本（更简单）**：

```bash
# 方式 1：传入完整的请求 JSON 文件（必须在 workspace 目录下）
node .claude/skills/browser-control/scripts/run_script.js .claude/data/browser-control/workspace/script_request.json

# 方式 2：传入 tabId 和脚本文件（必须在 workspace 目录下）
node .claude/skills/browser-control/scripts/run_script.js --tabId 123456789 .claude/data/browser-control/workspace/my_script.js
```

#### 方案 B：Unicode 转义（备选）

当无法使用文件方式时，可将中文字符转换为 `\uXXXX` 格式的 Unicode 转义序列。

```javascript
// 原始代码（包含中文）
document.querySelector('input').value = '搜索关键词'

// 转义后（安全）
document.querySelector('input').value = '\u641c\u7d22\u5173\u952e\u8bcd'
```

**转换方法**：

```javascript
// 在 Node.js 或浏览器控制台中运行
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
// 输出: \u641c\u7d22\u5173\u952e\u8bcd
```

**局限性**：
- 需要手动转换每个中文字符串
- 脚本可读性变差
- 在某些 Shell 环境下仍可能有问题

### 2.4 方案对比

| 方案 | 可靠性 | 易用性 | 适用场景 |
|------|--------|--------|----------|
| 文件中转法 | 高 | 高 | 所有场景（推荐） |
| Unicode 转义 | 中 | 低 | 简单脚本、无法写文件时 |
| 直接嵌入 | 低 | - | 仅纯 ASCII 脚本 |

### 2.5 平台注意事项

#### Windows PowerShell

**警告**：PowerShell 对中文编码处理非常不稳定，**必须使用文件中转法**。

即使使用 Unicode 转义，PowerShell 的引号处理也可能导致问题：

```powershell
# 不推荐：即使转义也可能失败
curl -X POST http://localhost:3333/api/browser/execute_script `
  -H "Content-Type: application/json" `
  -d '{"tabId": 123, "code": "document.title"}'

# 推荐：使用文件方式（文件必须在 workspace 目录下）
curl -X POST http://localhost:3333/api/browser/execute_script `
  -H "Content-Type: application/json" `
  -d '@.claude/data/browser-control/workspace/script_request.json'
```

#### Unix Shell (Bash/Zsh)

通常对 UTF-8 支持较好，但**仍强烈建议使用文件中转法**以确保一致性。

```bash
# 推荐：使用文件方式（文件必须在 workspace 目录下）
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d @.claude/data/browser-control/workspace/script_request.json
```

---

## 3. 返回值处理

### 3.1 可序列化类型

| 类型 | 示例 | 说明 |
|------|------|------|
| string | `"hello"` | 直接返回 |
| number | `42`, `3.14` | 直接返回 |
| boolean | `true`, `false` | 直接返回 |
| null | `null` | 直接返回 |
| array | `[1, 2, 3]` | 元素必须可序列化 |
| object | `{a: 1}` | 属性值必须可序列化 |

### 3.2 不可序列化类型及解决方案

| 类型 | 问题 | 解决方案 |
|------|------|----------|
| DOM 元素 | 返回 `{}` | 提取需要的属性 |
| NodeList | 返回 `{}` | 使用 `Array.from()` 转换 |
| Function | 无法序列化 | 不要返回函数 |
| 循环引用 | 序列化报错 | 手动构建返回对象 |
| undefined | 可能丢失 | 使用 `null` 替代 |

```javascript
// 错误：返回 DOM 元素
document.querySelector('.user')

// 正确：提取需要的数据
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

### 3.3 结构化返回值模式

推荐使用统一的返回值结构，便于调用方处理：

```javascript
(() => {
  try {
    // 业务逻辑
    const data = /* ... */;
    return { success: true, data: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
})()
```

---

## 4. 错误处理

### 4.1 try-catch 包裹

对于复杂操作，始终使用 try-catch：

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

### 4.2 可选链和空值合并

善用 ES2020 特性简化空值检查：

```javascript
// 可选链 (?.) - 安全访问可能不存在的属性
document.querySelector('.title')?.innerText
document.querySelector('.link')?.href

// 空值合并 (??) - 提供默认值
document.querySelector('.count')?.innerText ?? '0'

// 组合使用
(() => ({
  title: document.querySelector('h1')?.innerText ?? 'No title',
  author: document.querySelector('.author')?.innerText ?? 'Unknown',
  date: document.querySelector('.date')?.innerText ?? null
}))()
```

### 4.3 统一错误返回格式

```javascript
// 推荐的错误返回格式
{
  success: false,
  error: "错误描述",
  code: "ERROR_CODE",      // 可选：错误代码
  details: { /* ... */ }   // 可选：详细信息
}
```

---

## 5. 异步操作

### 5.1 等待元素出现

页面可能有延迟加载的内容，需要等待元素出现：

```javascript
// 简单的元素等待函数
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
    // 超时处理
    setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000);
  });
})()
```

### 5.2 轮询检查模式

对于需要等待某个条件成立的场景：

```javascript
(() => {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 50;  // 最多检查 50 次
    const interval = 100;     // 每 100ms 检查一次

    const check = () => {
      attempts++;
      const loading = document.querySelector('.loading');
      
      if (!loading) {
        // 加载完成
        resolve({ success: true, data: document.body.innerText });
      } else if (attempts >= maxAttempts) {
        // 超时
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

## 6. 常用模板

### 6.1 安全提取数据模板

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

### 6.2 安全表单操作模板

```javascript
(() => {
  try {
    // 填写表单
    const input = document.querySelector('input[name="search"]');
    if (!input) return { success: false, error: 'Input not found' };
    
    // 使用 Unicode 转义处理中文
    input.value = '\u641c\u7d22\u5173\u952e\u8bcd';  // "搜索关键词"
    
    // 触发 input 事件（某些框架需要）
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 点击提交
    const btn = document.querySelector('button[type="submit"]');
    if (!btn) return { success: false, error: 'Submit button not found' };
    
    btn.click();
    
    return { success: true, message: 'Form submitted' };
  } catch (e) {
    return { success: false, error: e.message };
  }
})()
```

### 6.3 滚动加载模板

```javascript
(() => {
  return new Promise((resolve) => {
    const scrollStep = async () => {
      const prevHeight = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      
      // 等待新内容加载
      await new Promise(r => setTimeout(r, 1000));
      
      const newHeight = document.body.scrollHeight;
      if (newHeight === prevHeight) {
        // 已到底部，收集数据
        const items = Array.from(document.querySelectorAll('.item'))
          .map(el => el.innerText);
        resolve({ success: true, data: items, count: items.length });
      } else {
        // 继续滚动
        scrollStep();
      }
    };
    
    scrollStep();
    
    // 超时保护
    setTimeout(() => {
      const items = Array.from(document.querySelectorAll('.item'))
        .map(el => el.innerText);
      resolve({ success: true, data: items, count: items.length, partial: true });
    }, 30000);
  });
})()
```

### 6.4 页面信息提取模板

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

## 7. 常见问题

### Q1: 脚本执行后返回空对象 `{}`

**原因**：返回了不可序列化的值（如 DOM 元素）

**解决**：提取需要的属性，返回普通对象

```javascript
// 错误：返回 DOM
document.querySelector('.item')

// 正确：返回数据
(() => {
  const el = document.querySelector('.item');
  return el ? { text: el.innerText, html: el.innerHTML } : null;
})()
```

### Q2: 中文显示为乱码或请求失败

**原因**：Shell 对中文编码处理不一致

**解决**：使用文件中转法（强烈推荐）

1. 使用 Write 工具创建 JSON 请求文件
2. 使用 `curl -d @filename` 发送请求

详见本文档「2. 编码处理」章节。

**备选方案**：Unicode 转义

```javascript
// 原始：直接使用中文
'搜索'

// 转义：Unicode 格式
'\u641c\u7d22'
```

### Q3: 元素不存在导致脚本报错

**原因**：直接访问可能为 null 的元素属性

**解决**：使用可选链或先检查

```javascript
// 危险
document.querySelector('.btn').click()

// 安全
document.querySelector('.btn')?.click()
```

### Q4: 异步内容获取不到

**原因**：内容是动态加载的，执行时还未出现

**解决**：使用等待机制（参考第 5 节）

### Q5: 表单提交后数据没变化

**原因**：现代框架需要触发事件才能识别值变化

**解决**：设置值后触发 input 事件

```javascript
input.value = 'new value';
input.dispatchEvent(new Event('input', { bubbles: true }));
```

---

## 8. 视觉反馈

### 8.1 功能介绍

视觉反馈功能可以在脚本执行时**高亮显示正在操作的页面元素**，让用户直观看到脚本的操作目标，便于调试和确认脚本行为。

**效果类型**：
- **边框高亮**：蓝色边框标识目标元素
- **脉冲动画**：操作进行中的动态提示
- **状态变色**：成功显示绿色，失败显示红色
- **序号角标**：批量操作时显示元素序号

### 8.2 启用方式

**执行脚本时始终添加 `--visual-feedback` 参数**（或简写 `--vf`）：

```bash
# 脚本文件必须在 workspace 目录下
node .claude/skills/browser-control/scripts/run_script.js --tabId 123456789 .claude/data/browser-control/workspace/my_script.js --visual-feedback
```

> **重要**：视觉反馈是推荐的默认行为，所有脚本执行命令都应包含此参数，让用户能直观看到脚本的操作目标。

启用后，脚本中可以直接使用 `__bcHighlight` API。

### 8.3 API 参考

#### 显示高亮

```javascript
__bcHighlight.show(element, options)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| element | HTMLElement | 目标 DOM 元素 |
| options.label | string | 标签文字（如 "正在点击..."） |
| options.pulse | boolean | 是否使用脉冲动画 |
| options.badge | number | 序号角标 |

#### 隐藏高亮

```javascript
__bcHighlight.hide(element)
```

#### 成功/失败反馈

```javascript
__bcHighlight.success(element, duration)  // 绿色反馈
__bcHighlight.fail(element, duration)     // 红色反馈
```

`duration` 默认 1500ms，设为 0 则不自动隐藏。

#### 自动包装操作

```javascript
__bcHighlight.withFeedback(element, fn, options)
```

自动：显示高亮 → 执行操作 → 根据结果变色 → 隐藏

```javascript
// 示例
await __bcHighlight.withFeedback(button, () => {
  button.click();
  return { success: true };
}, { label: '点击按钮' });
```

#### 批量操作

```javascript
__bcHighlight.batch(elements, fn, options)
```

自动为每个元素添加序号，逐个执行并显示进度。

```javascript
// 示例
const items = document.querySelectorAll('.item');
const results = await __bcHighlight.batch(items, (el, index) => {
  return el.innerText;
}, { delay: 200 });
```

#### 清理所有高亮

```javascript
__bcHighlight.cleanup()
```

### 8.4 使用示例

#### 示例 1：点击按钮

```javascript
(() => {
  const btn = document.querySelector('.submit-btn');
  if (!btn) return { success: false, error: 'Button not found' };
  
  return __bcHighlight.withFeedback(btn, () => {
    btn.click();
    return { success: true };
  }, { label: '点击提交' });
})()
```

#### 示例 2：批量提取数据

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

#### 示例 3：表单填写

```javascript
(() => {
  const input = document.querySelector('input[name="search"]');
  const btn = document.querySelector('button[type="submit"]');
  
  return (async () => {
    // 填写输入框
    await __bcHighlight.withFeedback(input, () => {
      input.value = '搜索关键词';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, { label: '填写搜索框' });
    
    // 等待一下
    await new Promise(r => setTimeout(r, 300));
    
    // 点击提交
    await __bcHighlight.withFeedback(btn, () => {
      btn.click();
      return true;
    }, { label: '点击搜索' });
    
    return { success: true };
  })();
})()
```

### 8.5 模板文件

提供了带视觉反馈的脚本模板：

| 模板 | 用途 |
|------|------|
| `templates/extract_with_feedback.js` | 数据提取（带高亮） |
| `templates/form_with_feedback.js` | 表单操作（带高亮） |
| `templates/click_with_feedback.js` | 点击操作（带高亮） |

### 8.6 注意事项

1. **不影响页面**：视觉反馈使用独立的覆盖层，不会修改原页面元素样式
2. **自动清理**：操作完成后会自动清理所有注入的 DOM 和样式
3. **性能开销**：视觉反馈会增加少量代码体积，仅在需要调试时启用
4. **异步操作**：`withFeedback` 和 `batch` 返回 Promise，需要使用 `await`

---

## 更新日志

### v1.2.0 (2026-01-12)
- 新增视觉反馈功能章节
- 新增 __bcHighlight API 参考
- 新增 3 个视觉反馈使用示例
- 新增 3 个带视觉反馈的脚本模板

### v1.1.0 (2026-01-11)
- 重构编码处理章节：文件中转法提升为首选方案
- Unicode 转义降为备选方案
- 新增方案对比表格
- 更新 Q2 解决方案为文件中转法
- 增加辅助脚本使用说明

### v1.0.0 (2026-01-11)
- 初始版本
- 基本原则、编码处理、返回值处理、错误处理
- 异步操作指南
- 4 个常用模板
- 5 个常见问题解答
