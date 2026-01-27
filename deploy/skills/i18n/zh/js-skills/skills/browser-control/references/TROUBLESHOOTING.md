---
title: Browser Control 故障排查
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control 故障排查

本文档提供常见问题的诊断方法和解决方案。

---

## 1. 服务不可用

### 症状

```bash
curl http://localhost:3333/api/browser/status
# 返回: curl: (7) Failed to connect to localhost port 3333
```

### 诊断步骤

#### 1.1 检查端口是否被占用

**Windows**:

```bash
netstat -ano | findstr :3333
```

**macOS/Linux**:

```bash
lsof -i :3333
```

如果端口被占用，查看占用进程的 PID 并决定是否结束。

#### 1.2 检查服务进程是否运行

**Windows**:

```bash
tasklist | findstr "electron"
tasklist | findstr "node"
```

**macOS/Linux**:

```bash
ps aux | grep -E "electron|node"
```

#### 1.3 检查日志

查看 Browser Control Manager 应用的日志面板，或检查控制台输出。

### 解决方案

1. **端口被占用**: 结束占用进程或修改配置使用其他端口
2. **服务未启动**: 启动 Browser Control Manager 应用
3. **服务崩溃**: 重启应用，检查错误日志

---

## 2. 无标签页数据

### 症状

```bash
curl http://localhost:3333/api/browser/tabs
# 返回: {"status":"success","tabs":[],"needsCallback":false}
```

标签页列表为空，但浏览器中明明有打开的页面。

### 诊断步骤

#### 2.1 检查扩展连接状态

```bash
curl http://localhost:3333/api/browser/status
```

查看返回中的 `activeConnections`：

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

如果 `activeConnections: 0`，说明浏览器扩展未连接。

#### 2.2 检查浏览器扩展是否安装

1. 打开浏览器的扩展管理页面
2. 确认 Browser Control 扩展已安装
3. 确认扩展已启用

#### 2.3 检查扩展是否正确配置

扩展需要配置正确的 WebSocket 地址（默认 `ws://localhost:8080`）。

### 解决方案

1. **扩展未安装**: 安装浏览器扩展
2. **扩展已禁用**: 启用扩展
3. **连接地址错误**: 在扩展设置中配置正确的 WebSocket 地址
4. **连接断开**: 刷新扩展或重启浏览器

---

## 3. 脚本执行失败

### 症状

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123, "code": "document.title"}'
# 返回成功，但回调结果中有错误
```

### 诊断步骤

#### 3.1 检查 tabId 是否有效

```bash
curl http://localhost:3333/api/browser/tabs
```

确认使用的 tabId 存在于返回的标签页列表中。

#### 3.2 检查页面是否加载完成

某些页面可能还在加载中。可以先获取页面状态：

```bash
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "code": "document.readyState"}'
```

期望返回 `"complete"`。

#### 3.3 检查脚本语法

在浏览器开发者工具控制台中测试脚本是否有语法错误。

### 常见错误原因

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 元素不存在 | CSS 选择器错误或元素未加载 | 检查选择器，等待元素加载 |
| 权限被拒绝 | 页面有 CSP 限制 | 部分操作可能受限 |
| 跨域错误 | 访问 iframe 内容 | 无法直接访问跨域 iframe |

### 解决方案

1. **tabId 无效**: 重新获取标签页列表
2. **页面未加载**: 等待几秒后重试
3. **语法错误**: 修正 JavaScript 代码
4. **元素不存在**: 使用可选链 `?.` 避免报错

```javascript
// 使用可选链避免元素不存在时报错
document.querySelector(".not-exist")?.innerText
```

---

## 4. Cookie 获取失败

### 症状

```bash
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
# 返回空 Cookie 或错误
```

### 诊断步骤

#### 4.1 确认页面有 Cookie

在浏览器开发者工具 → Application → Cookies 中确认页面确实有 Cookie。

#### 4.2 检查 tabId

确保 tabId 对应的标签页确实是目标网站。

#### 4.3 检查域名限制

某些 Cookie 可能设置了特定的域名或路径限制。

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| Cookie 为空 | 网站未设置 Cookie | 正常情况，无 Cookie 可获取 |
| HttpOnly Cookie | 脚本无法读取 | 通过扩展 API 可以获取 |
| SameSite 限制 | Cookie 有 SameSite 策略 | 确保在正确的上下文获取 |

### 解决方案

1. **确认网站已登录**: 某些 Cookie 只在登录后存在
2. **等待页面加载**: Cookie 可能在页面加载后才设置
3. **检查 Cookie 域名**: 确保获取的是正确域名的 Cookie

---

## 5. 异步操作超时

### 症状

发送请求后，无法获取回调结果：

```bash
curl http://localhost:3333/api/browser/callback_response/my-request-id
# 返回: {"status":"error","message":"未找到给定请求ID的响应"}
```

### 诊断步骤

#### 5.1 理解异步操作机制

以下操作是异步的，需要等待回调：

- `open_url`
- `close_tab`
- `get_html`
- `execute_script`
- `inject_css`
- `get_cookies`
- `upload_file_to_tab`

这些 API 返回 `needsCallback: true` 表示结果需要通过回调获取。

#### 5.2 检查请求 ID

确保使用了正确的 `requestId`。如果没有指定，系统会自动生成，但你需要记录返回的 ID。

```bash
# 指定自定义 requestId
curl -X POST http://localhost:3333/api/browser/get_html \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "requestId": "my-custom-id"}'

# 使用相同的 ID 获取结果
curl http://localhost:3333/api/browser/callback_response/my-custom-id
```

#### 5.3 使用 SSE 监听

更可靠的方式是使用 SSE 实时接收结果：

```bash
curl -N http://localhost:3333/api/browser/events
```

监听对应的事件（如 `tab_html_received`、`script_executed`）。

### 常见原因

| 原因 | 说明 | 解决方案 |
|------|------|----------|
| 请求 ID 错误 | 使用了不存在的 ID | 确保使用正确的 requestId |
| 等待时间不足 | 操作还未完成 | 增加等待时间 |
| 扩展断开 | 浏览器扩展断开连接 | 检查扩展状态，重新连接 |
| 回调已过期 | 回调结果有存活时间 | 及时获取结果 |

### 解决方案

1. **使用自定义 requestId**: 便于追踪
2. **增加等待时间**: 复杂操作可能需要更长时间
3. **使用 SSE**: 实时接收结果，更可靠
4. **检查扩展连接**: 确保扩展保持连接

---

## 快速诊断检查清单

遇到问题时，按以下顺序检查：

### 1. 服务层

```bash
# 检查服务是否运行
curl http://localhost:3333/api/browser/status
```

- [ ] 服务是否响应？
- [ ] `isRunning` 是否为 `true`？

### 2. 连接层

```bash
# 检查扩展连接
curl http://localhost:3333/api/browser/status | grep activeConnections
```

- [ ] `activeConnections` 是否 >= 1？
- [ ] 浏览器扩展是否已安装并启用？

### 3. 数据层

```bash
# 检查是否能获取标签页
curl http://localhost:3333/api/browser/tabs
```

- [ ] 是否返回标签页列表？
- [ ] tabId 是否有效？

### 4. 操作层

```bash
# 测试简单操作
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d '{"tabId": YOUR_TAB_ID, "code": "1+1"}'
```

- [ ] 操作是否成功发送？
- [ ] 是否能获取回调结果？

---

## 获取帮助

如果以上方法都无法解决问题：

1. 查看应用日志面板获取详细错误信息
2. 检查浏览器控制台是否有错误
3. 尝试重启 Browser Control Manager 应用
4. 尝试重启浏览器

---

## 更新日志

### v1.0.0 (2026-01-10)
- 初始版本
- 5 类常见问题的诊断方法
- 快速诊断检查清单
