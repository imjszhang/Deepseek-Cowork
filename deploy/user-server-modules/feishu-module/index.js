/**
 * Feishu Module - 飞书通道模块
 * 
 * 实现飞书消息与 HappyService AI 核心的双向通信
 * 支持私聊和群聊场景
 * 
 * 功能：
 * - WebSocket/Webhook 连接飞书平台
 * - 私聊和群聊消息处理
 * - 权限策略控制（allowlist、requireMention）
 * - 与 HappyService 集成，实现 AI 对话
 * - 管理页面和 API 接口
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// 导入子模块（将在后续步骤创建）
let FeishuClient, FeishuMonitor, MessageHandler, Sender, Policy;

/**
 * 创建飞书模块服务实例
 * @param {Object} options - 配置选项
 * @param {Object} [options.HappyService] - AI 通信服务（通过 modulesManager 注入）
 * @param {Object} [options.MessageStore] - 消息存储服务（通过 modulesManager 注入）
 * @param {Object} [options.secureSettings] - 安全设置服务
 * @param {Object} [options.feishuConfig] - 飞书配置
 * @returns {FeishuModuleService} 服务实例
 */
function setupFeishuModuleService(options = {}) {
    // 获取注入的核心服务
    const HappyService = options.HappyService || null;
    const MessageStore = options.MessageStore || null;
    const secureSettings = options.secureSettings || null;
    const feishuConfig = options.feishuConfig || {};
    
    class FeishuModuleService extends EventEmitter {
        constructor() {
            super();
            this.name = 'feishu-module';
            this.version = '1.0.0';
            this.isRunning = false;
            this.startTime = null;
            this.requestCount = 0;
            this.staticDir = path.join(__dirname, 'static');
            
            // 保存核心服务引用
            this.happyService = HappyService;
            this.messageStore = MessageStore;
            this.secureSettings = secureSettings;
            
            // 飞书配置（合并默认值）
            this.config = {
                enabled: false,
                appId: '',
                appSecret: '',
                domain: 'feishu',           // feishu 或 lark
                connectionMode: 'websocket', // websocket 或 webhook
                dmPolicy: 'open',           // open | allowlist
                allowFrom: [],              // 私聊白名单
                groupPolicy: 'allowlist',   // open | allowlist | disabled
                groupAllowFrom: [],         // 群聊白名单
                requireMention: true,       // 群聊是否需要 @机器人
                ...feishuConfig
            };
            
            // 连接状态
            this.connectionState = {
                connected: false,
                lastConnectedAt: null,
                lastDisconnectedAt: null,
                lastError: null,
                botInfo: null
            };
            
            // 子模块实例（延迟加载）
            this.client = null;
            this.monitor = null;
            this.messageHandler = null;
            this.sender = null;
            this.policy = null;
            
            // 会话历史缓存
            this.chatHistories = new Map();
            
            // AI 响应回调映射
            this.pendingResponses = new Map();
        }
        
        /**
         * 初始化模块
         */
        async init() {
            console.log(`[FeishuModule] Initializing...`);
            
            // 检查静态目录是否存在
            if (!fs.existsSync(this.staticDir)) {
                console.warn(`[FeishuModule] Static directory not found: ${this.staticDir}`);
            }
            
            // 检查核心服务是否可用
            if (this.happyService) {
                console.log(`[FeishuModule] HappyService injected, AI communication available`);
                this._setupHappyServiceListeners();
            } else {
                console.warn(`[FeishuModule] HappyService not injected, AI features unavailable`);
            }
            
            if (this.messageStore) {
                console.log(`[FeishuModule] MessageStore injected, message persistence available`);
            }
            
            // 尝试从 secureSettings 加载敏感配置
            await this._loadSecureConfig();
            
            // 加载子模块
            await this._loadSubModules();
            
            console.log(`[FeishuModule] Initialization complete`);
        }
        
        /**
         * 加载子模块
         */
        async _loadSubModules() {
            try {
                // 延迟加载子模块，避免循环依赖
                FeishuClient = require('./client');
                FeishuMonitor = require('./monitor');
                MessageHandler = require('./message-handler');
                Sender = require('./sender');
                Policy = require('./policy');
                
                // 初始化子模块实例
                this.policy = new Policy(this.config);
                this.client = new FeishuClient(this.config);
                this.sender = new Sender(this.client, this.config);
                this.messageHandler = new MessageHandler({
                    config: this.config,
                    happyService: this.happyService,
                    messageStore: this.messageStore,
                    sender: this.sender,
                    policy: this.policy,
                    pendingResponses: this.pendingResponses,
                    chatHistories: this.chatHistories
                });
                this.monitor = new FeishuMonitor({
                    config: this.config,
                    client: this.client,
                    messageHandler: this.messageHandler,
                    onConnectionChange: (state) => this._handleConnectionChange(state)
                });
                
                console.log(`[FeishuModule] Submodules loaded`);
            } catch (error) {
                console.error(`[FeishuModule] Failed to load submodules:`, error.message);
                // 子模块加载失败不阻止模块启动，但功能会受限
            }
        }
        
        /**
         * 从 secureSettings 加载敏感配置
         */
        async _loadSecureConfig() {
            if (!this.secureSettings) return;
            
            try {
                // 尝试获取飞书配置
                const appId = await this.secureSettings.get?.('feishu.appId');
                const appSecret = await this.secureSettings.get?.('feishu.appSecret');
                
                if (appId) this.config.appId = appId;
                if (appSecret) this.config.appSecret = appSecret;
                
                console.log(`[FeishuModule] Config loaded from secureSettings`);
            } catch (error) {
                console.warn(`[FeishuModule] Failed to load config from secureSettings:`, error.message);
            }
        }
        
        /**
         * 设置 HappyService 事件监听
         */
        _setupHappyServiceListeners() {
            if (!this.happyService) return;
            
            // 监听 AI 消息响应事件
            this.happyService.on('happy:message', (message) => {
                this._handleAIResponse(message);
            });
            
            // 监听连接状态事件
            this.happyService.on('happy:connected', () => {
                console.log(`[FeishuModule] HappyService connected`);
                this.emit('feishu:ai_connected');
            });
            
            this.happyService.on('happy:disconnected', () => {
                console.log(`[FeishuModule] HappyService disconnected`);
                this.emit('feishu:ai_disconnected');
            });
            
                console.log(`[FeishuModule] HappyService event listeners setup`);
        }
        
        /**
         * 处理 AI 响应
         * @param {Object} message - AI 响应消息
         */
        _handleAIResponse(message) {
            // 检查是否有等待此响应的飞书会话
            if (this.messageHandler) {
                this.messageHandler.handleAIResponse(message);
            }
        }
        
        /**
         * 处理连接状态变化
         * @param {Object} state - 连接状态
         */
        _handleConnectionChange(state) {
            this.connectionState = {
                ...this.connectionState,
                ...state
            };
            
            if (state.connected) {
                console.log(`[FeishuModule] Connected to Feishu`);
                this.emit('feishu:connected', state);
            } else {
                console.log(`[FeishuModule] Disconnected from Feishu`);
                this.emit('feishu:disconnected', state);
            }
        }
        
        /**
         * 注册路由
         * @param {Express} app - Express 应用实例
         */
        setupRoutes(app) {
            // 静态页面 - 管理页面
            app.get('/feishu/', (req, res) => {
                this.requestCount++;
                const indexPath = path.join(this.staticDir, 'index.html');
                
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send('Feishu admin page not found');
                }
            });
            
            // API: 获取状态
            app.get('/api/feishu/status', (req, res) => {
                this.requestCount++;
                res.json({
                    success: true,
                    data: {
                        name: this.name,
                        version: this.version,
                        isRunning: this.isRunning,
                        uptime: this.getUptime(),
                        requestCount: this.requestCount,
                        connection: this.connectionState,
                        config: {
                            enabled: this.config.enabled,
                            appId: this.config.appId ? '***' + this.config.appId.slice(-4) : null,
                            domain: this.config.domain,
                            connectionMode: this.config.connectionMode,
                            dmPolicy: this.config.dmPolicy,
                            groupPolicy: this.config.groupPolicy,
                            requireMention: this.config.requireMention
                        },
                        coreServices: {
                            happyService: !!this.happyService,
                            messageStore: !!this.messageStore
                        }
                    }
                });
            });
            
            // API: 获取/更新配置
            app.get('/api/feishu/config', (req, res) => {
                this.requestCount++;
                // 返回配置（隐藏敏感信息）
                res.json({
                    success: true,
                    data: {
                        enabled: this.config.enabled,
                        appId: this.config.appId ? '***' + this.config.appId.slice(-4) : '',
                        hasAppSecret: !!this.config.appSecret,
                        domain: this.config.domain,
                        connectionMode: this.config.connectionMode,
                        dmPolicy: this.config.dmPolicy,
                        allowFrom: this.config.allowFrom,
                        groupPolicy: this.config.groupPolicy,
                        groupAllowFrom: this.config.groupAllowFrom,
                        requireMention: this.config.requireMention
                    }
                });
            });
            
            app.post('/api/feishu/config', async (req, res) => {
                this.requestCount++;
                try {
                    const newConfig = req.body;
                    
                    // 更新配置
                    const updatableFields = [
                        'enabled', 'appId', 'appSecret', 'domain', 
                        'connectionMode', 'dmPolicy', 'allowFrom',
                        'groupPolicy', 'groupAllowFrom', 'requireMention'
                    ];
                    
                    for (const field of updatableFields) {
                        if (newConfig[field] !== undefined) {
                            this.config[field] = newConfig[field];
                        }
                    }
                    
                    // 保存敏感配置到 secureSettings
                    if (this.secureSettings && newConfig.appSecret) {
                        await this.secureSettings.set?.('feishu.appSecret', newConfig.appSecret);
                    }
                    if (this.secureSettings && newConfig.appId) {
                        await this.secureSettings.set?.('feishu.appId', newConfig.appId);
                    }
                    
                    // 更新子模块配置
                    if (this.client) this.client.updateConfig(this.config);
                    if (this.policy) this.policy.updateConfig(this.config);
                    
                    res.json({
                        success: true,
                        message: 'Config updated'
                    });
                    
                    this.emit('feishu:config_updated', this.config);
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
            
            // API: 手动重连
            app.post('/api/feishu/reconnect', async (req, res) => {
                this.requestCount++;
                try {
                    if (this.monitor) {
                        await this.monitor.reconnect();
                        res.json({
                            success: true,
                            message: 'Reconnecting...'
                        });
                    } else {
                        res.status(503).json({
                            success: false,
                            error: 'Monitor not initialized'
                        });
                    }
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
            
            // API: 发送测试消息
            app.post('/api/feishu/test', async (req, res) => {
                this.requestCount++;
                try {
                    const { to, message } = req.body;
                    
                    if (!to || !message) {
                        return res.status(400).json({
                            success: false,
                            error: 'Missing to or message parameter'
                        });
                    }
                    
                    if (!this.sender) {
                        return res.status(503).json({
                            success: false,
                            error: 'Sender not initialized'
                        });
                    }
                    
                    const result = await this.sender.sendText(to, message);
                    res.json({
                        success: true,
                        data: result
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
            
            // API: 获取会话历史
            app.get('/api/feishu/history/:sessionId', (req, res) => {
                this.requestCount++;
                const { sessionId } = req.params;
                const history = this.chatHistories.get(sessionId) || [];
                
                res.json({
                    success: true,
                    data: {
                        sessionId,
                        count: history.length,
                        messages: history.slice(-50) // 最近 50 条
                    }
                });
            });
            
            console.log(`[FeishuModule] Routes registered: /feishu/, /api/feishu/*`);
        }
        
        /**
         * 启动模块
         */
        async start() {
            this.isRunning = true;
            this.startTime = new Date();
            
            // 检查配置是否完整
            if (!this.config.appId || !this.config.appSecret) {
                console.warn(`[FeishuModule] Feishu credentials not configured, please configure via /feishu/ page`);
                this.emit('started', { 
                    name: this.name,
                    version: this.version,
                    startTime: this.startTime,
                    warning: 'Feishu credentials not configured'
                });
                return;
            }
            
            // 启动飞书连接
            if (this.config.enabled && this.monitor) {
                try {
                    await this.monitor.start();
                    console.log(`[FeishuModule] Feishu connection started`);
                } catch (error) {
                    console.error(`[FeishuModule] Failed to start Feishu connection:`, error.message);
                    this.connectionState.lastError = error.message;
                }
            }
            
            console.log(`[FeishuModule] Started`);
            this.emit('started', { 
                name: this.name,
                version: this.version,
                startTime: this.startTime 
            });
        }
        
        /**
         * 停止模块
         */
        async stop() {
            this.isRunning = false;
            const uptime = this.getUptime();
            
            // 停止飞书连接
            if (this.monitor) {
                try {
                    await this.monitor.stop();
                    console.log(`[FeishuModule] Feishu connection stopped`);
                } catch (error) {
                    console.error(`[FeishuModule] Failed to stop Feishu connection:`, error.message);
                }
            }
            
            console.log(`[FeishuModule] Stopped (uptime: ${uptime}s)`);
            this.emit('stopped', { 
                uptime,
                requestCount: this.requestCount 
            });
            
            this.startTime = null;
            this.requestCount = 0;
        }
        
        /**
         * 获取运行时长（秒）
         * @returns {number} 运行时长
         */
        getUptime() {
            if (!this.startTime) return 0;
            return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        }
        
        /**
         * 手动发送消息到飞书
         * @param {string} to - 接收者 ID
         * @param {string} text - 消息内容
         * @returns {Promise<Object>} 发送结果
         */
        async sendMessage(to, text) {
            if (!this.sender) {
                throw new Error('Sender not initialized');
            }
            return await this.sender.sendText(to, text);
        }
    }
    
    return new FeishuModuleService();
}

module.exports = { setupFeishuModuleService };
