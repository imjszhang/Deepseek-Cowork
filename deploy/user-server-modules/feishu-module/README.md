# Feishu Module - 飞书通道模块

飞书/Lark 消息通道模块，实现飞书消息与 deepseek-cowork AI 核心的双向通信。

## 功能

- **WebSocket 连接**: 使用飞书官方 SDK 建立 WebSocket 长连接
- **私聊和群聊**: 支持私聊和群聊消息处理
- **权限策略**: 支持白名单、@提及要求等策略控制
- **AI 集成**: 与 HappyService 无缝集成
- **管理页面**: 提供 Web 界面进行配置和监控

## 部署

```bash
# 使用部署脚本（会自动安装依赖）
deepseek-cowork module deploy feishu-module

# 或手动复制到用户模块目录
cp -r deploy/user-server-modules/feishu-module ~/.deepseek-cowork/modules/
cd ~/.deepseek-cowork/modules/feishu-module
npm install
```

### 依赖管理

模块目录中包含 `package.json` 文件，列出了所需的依赖包：
- `@larksuiteoapi/node-sdk` - 飞书官方 SDK

**自动安装**：使用 `deepseek-cowork module deploy` 命令部署时，会自动检测 `package.json` 并执行 `npm install` 安装依赖。

**手动安装**：如果自动安装失败，可以手动进入模块目录执行：
```bash
cd ~/.deepseek-cowork/user-server-modules/feishu-module
npm install
```

## 配置

### 飞书开放平台设置

1. 前往 [飞书开放平台](https://open.feishu.cn) 创建企业自建应用
2. 获取 App ID 和 App Secret
3. 配置必要权限：
   - `contact:user.base:readonly` - 获取用户信息
   - `im:message` - 发送和接收消息
   - `im:message.p2p_msg:readonly` - 读取私聊消息
   - `im:message.group_at_msg:readonly` - 接收群聊@消息
   - `im:message:send_as_bot` - 以机器人身份发送消息
4. 启用机器人能力

### 模块配置

在 `userServerModulesConfig.js` 的 `moduleConfigs` 中配置飞书凭证和策略：

**配置文件路径**：
- Windows: `%APPDATA%\deepseek-cowork\userServerModulesConfig.js`
- macOS: `~/Library/Application Support/deepseek-cowork/userServerModulesConfig.js`
- Linux: `~/.config/deepseek-cowork/userServerModulesConfig.js`

```javascript
module.exports = {
    // 模块业务配置
    moduleConfigs: {
        'feishu-module': {
            enabled: true,
            appId: 'cli_xxxx',           // 飞书应用 App ID
            appSecret: 'xxxx',           // 飞书应用 App Secret
            domain: 'feishu',            // feishu 或 lark（海外版）
            connectionMode: 'websocket', // 推荐使用 websocket
            
            // 私聊策略
            dmPolicy: 'open',            // open | allowlist
            allowFrom: [],               // 白名单用户 ID
            
            // 群聊策略
            groupPolicy: 'allowlist',    // open | allowlist | disabled
            groupAllowFrom: [],          // 白名单群聊 ID
            requireMention: true         // 群聊是否需要 @机器人
        }
    },
    
    // 模块注册（参见 userServerModulesConfig.example.js）
    modules: [...]
};
```

完整配置示例请参考模块目录中的 `userServerModulesConfig.example.js` 文件。

### 其他配置方式

**方式二：环境变量**（适用于敏感信息）

```bash
# Linux/macOS
export FEISHU_APP_ID=cli_xxxx
export FEISHU_APP_SECRET=xxxx

# Windows PowerShell
$env:FEISHU_APP_ID = "cli_xxxx"
$env:FEISHU_APP_SECRET = "xxxx"
```

**方式三：管理页面**

启动服务后访问 `http://localhost:3333/feishu/`，通过 Web 界面配置凭证。

## 使用

### 访问管理页面

启动服务后访问：`http://localhost:3333/feishu/`

### API 接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/feishu/` | GET | 管理页面 |
| `/api/feishu/status` | GET | 获取连接状态 |
| `/api/feishu/config` | GET/POST | 获取/更新配置 |
| `/api/feishu/reconnect` | POST | 手动重连 |
| `/api/feishu/test` | POST | 发送测试消息 |
| `/api/feishu/history/:sessionId` | GET | 获取会话历史 |

### 消息发送示例

```bash
# 发送私聊消息
curl -X POST http://localhost:3333/api/feishu/test \
  -H "Content-Type: application/json" \
  -d '{"to": "user:ou_xxxx", "message": "Hello!"}'

# 发送群聊消息
curl -X POST http://localhost:3333/api/feishu/test \
  -H "Content-Type: application/json" \
  -d '{"to": "chat:oc_xxxx", "message": "Hello Group!"}'
```

## 文件结构

```
feishu-module/
├── index.js              # 模块入口
├── client.js             # 飞书 SDK 客户端封装
├── monitor.js            # WebSocket 连接管理
├── message-handler.js    # 消息处理器
├── sender.js             # 消息发送器
├── policy.js             # 权限策略
├── static/
│   └── index.html        # 管理页面
└── README.md             # 本文件
```

## 权限策略说明

### 私聊策略 (dmPolicy)

- **open**: 允许所有用户私聊
- **allowlist**: 仅允许 `allowFrom` 中的用户

### 群聊策略 (groupPolicy)

- **open**: 允许所有群聊
- **allowlist**: 仅允许 `groupAllowFrom` 中的群聊
- **disabled**: 禁用群聊功能

### @提及要求 (requireMention)

- `true`: 群聊中只有@机器人的消息才会触发回复
- `false`: 群聊中所有消息都会触发回复

## 核心服务集成

模块通过 `runtimeContext.services` 获取核心服务：

- **HappyService**: 用于发送消息到 AI、监听 AI 响应
- **MessageStore**: 用于持久化会话消息
- **secureSettings**: 用于安全存储 App Secret

## 故障排除

### 常见问题

1. **连接失败**
   - 检查 App ID 和 App Secret 是否正确
   - 确认已安装 `@larksuiteoapi/node-sdk`
   - 检查网络是否能访问飞书服务器

2. **消息无响应**
   - 检查权限策略配置
   - 群聊中确认是否需要@机器人
   - 查看控制台日志排查问题

3. **HappyService 不可用**
   - 确认 HappyService 已正确配置
   - 检查 AI 连接状态

### 日志查看

模块日志以 `[FeishuModule]` 前缀输出到控制台。

## 开发说明

此模块可作为开发飞书集成的参考。关键文件：

- `client.js`: 飞书 SDK 封装，参考官方 SDK 文档
- `monitor.js`: WebSocket 连接管理，处理重连逻辑
- `message-handler.js`: 消息处理流程，包含与 AI 集成逻辑
- `policy.js`: 权限策略实现

## License

MIT
