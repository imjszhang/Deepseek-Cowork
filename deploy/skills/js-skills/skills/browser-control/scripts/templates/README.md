# 请求模板

本目录包含 Browser Control API 的请求模板文件，用于避免 Shell 编码问题。

## 使用方法

1. 复制需要的模板文件
2. 修改 `tabId` 为实际的标签页 ID
3. 根据需要修改其他参数
4. 使用 `curl -d @filename.json` 发送请求

## 模板列表

| 文件 | API | 说明 |
|------|-----|------|
| `execute_script.json` | `POST /api/browser/execute_script` | 执行 JavaScript 脚本 |
| `get_cookies.json` | `POST /api/browser/get_cookies` | 获取页面 Cookie |
| `get_html.json` | `POST /api/browser/get_html` | 获取页面 HTML |

## 示例

### 执行脚本

```bash
# 1. 复制并修改模板
cp execute_script.json my_request.json
# 编辑 my_request.json，修改 tabId 和 code

# 2. 发送请求
curl -X POST http://localhost:3333/api/browser/execute_script \
  -H "Content-Type: application/json" \
  -d @my_request.json
```

### 获取 Cookie（异步操作）

```bash
# 1. 发送请求
curl -X POST http://localhost:3333/api/browser/get_cookies \
  -H "Content-Type: application/json" \
  -d @get_cookies.json

# 2. 轮询获取结果
curl http://localhost:3333/api/browser/callback_response/cookie-request-001
```

## 注意事项

- `_comment` 和 `_usage` 字段会被 API 忽略，仅用于说明
- 模板中的 `tabId` 值 `123456789` 是示例，需要替换为实际值
- 异步操作（get_cookies, get_html）需要使用 `requestId` 轮询获取结果
