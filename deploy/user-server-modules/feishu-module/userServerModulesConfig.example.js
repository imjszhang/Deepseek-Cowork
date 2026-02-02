/**
 * 飞书模块配置示例
 * 
 * 将此文件复制到用户模块配置目录：
 * - Windows: %APPDATA%/deepseek-cowork/userServerModulesConfig.js
 * - macOS: ~/Library/Application Support/deepseek-cowork/userServerModulesConfig.js
 * - Linux: ~/.config/deepseek-cowork/userServerModulesConfig.js
 */

module.exports = {
    // ============================================================
    // 模块业务配置
    // 在此处配置各模块的业务参数（如凭证、策略等）
    // ============================================================
    moduleConfigs: {
        'feishu-module': {
            // 是否启用飞书连接（模块启动后自动连接）
            enabled: true,
            
            // 飞书应用凭证（从飞书开放平台获取）
            appId: 'cli_xxxxxxxxxx',
            appSecret: 'xxxxxxxxxxxxxx',
            
            // 域名：feishu（飞书）或 lark（海外版）
            domain: 'feishu',
            
            // 连接模式：websocket（推荐）或 webhook
            connectionMode: 'websocket',
            
            // 私聊策略：open（允许所有）或 allowlist（白名单）
            dmPolicy: 'open',
            // 私聊白名单（dmPolicy 为 allowlist 时生效）
            allowFrom: [],
            
            // 群聊策略：open | allowlist | disabled
            groupPolicy: 'allowlist',
            // 群聊白名单（groupPolicy 为 allowlist 时生效）
            groupAllowFrom: [],
            
            // 群聊是否需要 @机器人 才触发回复
            requireMention: true
        }
    },
    
    // ============================================================
    // 模块注册配置
    // 定义要加载的用户模块及其初始化方式
    // ============================================================
    modules: [
        {
            name: 'feishu-module',
            module: './feishu-module',
            setupFunction: 'setupFeishuModuleService',
            enabled: true,
            features: {
                hasRoutes: true,
                hasStatic: true,
                emitsEvents: true
            },
            // 注入核心服务和飞书配置
            // 注意：AI 通信通过 ChannelBridge 间接访问 HappyService，无需直接注入
            getOptions: (config, runtimeContext) => ({
                // 核心服务（通过 ChannelBridge 访问 AI）
                ChannelBridge: runtimeContext?.services?.ChannelBridge,
                MessageStore: runtimeContext?.services?.MessageStore,
                secureSettings: runtimeContext?.services?.secureSettings,
                
                // 飞书配置：优先从 moduleConfigs 读取，兼容旧方式从 config.feishu 读取
                feishuConfig: runtimeContext?.userConfig?.moduleConfigs?.['feishu-module'] 
                    || config.feishu 
                    || {}
            }),
            
            // 事件监听（可选）
            events: {
                started: ({ name, version }) => {
                    console.log(`[飞书模块] 已启动: ${name} v${version}`);
                },
                'feishu:connected': (state) => {
                    console.log(`[飞书模块] 已连接`);
                },
                'feishu:disconnected': (state) => {
                    console.log(`[飞书模块] 已断开`);
                }
            }
        }
    ]
};
