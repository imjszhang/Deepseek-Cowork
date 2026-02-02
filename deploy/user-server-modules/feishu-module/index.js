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
 * - 通过 Channel Bridge 与 AI 集成
 * - 管理页面和 API 接口
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// 导入子模块（将在后续步骤创建）
let FeishuClient, FeishuMonitor, MessageHandler, Sender, Policy;

// 导入 Channel Bridge 和适配器
let channelBridge, createFeishuAdapter;

/**
 * 创建飞书模块服务实例
 * @param {Object} options - 配置选项
 * @param {Object} [options.HappyService] - AI 通信服务（通过 modulesManager 注入）
 * @param {Object} [options.MessageStore] - 消息存储服务（通过 modulesManager 注入）
 * @param {Object} [options.ChannelBridge] - 通道桥接服务（通过 modulesManager 注入）
 * @param {Object} [options.secureSettings] - 安全设置服务
 * @param {Object} [options.feishuConfig] - 飞书配置
 * @returns {FeishuModuleService} 服务实例
 */
function setupFeishuModuleService(options = {}) {
    // 获取注入的核心服务
    const HappyService = options.HappyService || null;
    const MessageStore = options.MessageStore || null;
    const ChannelBridgeService = options.ChannelBridge || null;
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
            // 注意：AI 通信通过 ChannelBridge 间接访问，无需直接持有 HappyService
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
            
            // Channel Bridge 适配器
            this.feishuAdapter = null;
            this.bridgeRegistered = false;
            
            // 会话历史缓存
            this.chatHistories = new Map();
        }
        
        /**
         * 初始化模块
         */
        async init() {
            console.log(`[FeishuModule] 初始化中...`);
            
            // 检查静态目录是否存在
            if (!fs.existsSync(this.staticDir)) {
                console.warn(`[FeishuModule] 静态目录不存在: ${this.staticDir}`);
            }
            
            // 初始化 Channel Bridge（AI 通信通过 bridge 间接访问 HappyService）
            this._initChannelBridge();
            
            if (this.messageStore) {
                console.log(`[FeishuModule] MessageStore 已注入，可用于消息持久化`);
            }
            
            // 尝试从 secureSettings 加载敏感配置
            await this._loadSecureConfig();
            
            // 加载子模块
            await this._loadSubModules();
            
            console.log(`[FeishuModule] 初始化完成`);
        }
        
        /**
         * 初始化 Channel Bridge
         * 注意：ChannelBridge 由主进程初始化（使用 HappyService），
         * feishu-module 只需要获取引用并使用
         */
        _initChannelBridge() {
            // 使用通过 modulesManager 注入的 ChannelBridge
            if (!ChannelBridgeService) {
                console.warn(`[FeishuModule] ChannelBridge 未注入，AI 功能不可用`);
                channelBridge = null;
                return;
            }
            
            channelBridge = ChannelBridgeService;
            
            // ChannelBridge 由主进程初始化，这里只检查状态
            // 注意：模块初始化时 bridge 可能还未初始化，这是正常的
            // bridge 会在 HappyService 初始化后由主进程完成初始化
            if (channelBridge.isInitialized()) {
                console.log(`[FeishuModule] ChannelBridge 已就绪`);
            } else {
                console.log(`[FeishuModule] ChannelBridge 已注入，等待主进程初始化`);
            }
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
                
                // 加载适配器模块
                const { createFeishuAdapter: createAdapter } = require('./adapter');
                createFeishuAdapter = createAdapter;
                
                // 初始化子模块实例
                this.policy = new Policy(this.config);
                this.client = new FeishuClient(this.config);
                this.sender = new Sender(this.client, this.config);
                
                // 创建 Channel Bridge 适配器
                this.feishuAdapter = createFeishuAdapter(this.sender);
                console.log(`[FeishuModule] Feishu adapter created`);
                
                // 初始化消息处理器（传入适配器）
                this.messageHandler = new MessageHandler({
                    config: this.config,
                    messageStore: this.messageStore,
                    sender: this.sender,
                    policy: this.policy,
                    chatHistories: this.chatHistories,
                    // 传入适配器，用于 bridge 集成
                    adapter: this.feishuAdapter,
                    // 传入 bridge 引用
                    channelBridge: channelBridge
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
                // 确保 secureSettings 已初始化
                if (!this.secureSettings.isInitialized || !this.secureSettings.isInitialized()) {
                    // 获取数据目录并初始化
                    const os = require('os');
                    const path = require('path');
                    const APP_NAME = 'deepseek-cowork';
                    let dataDir;
                    
                    if (process.platform === 'win32') {
                        dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
                    } else if (process.platform === 'darwin') {
                        dataDir = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
                    } else {
                        dataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
                    }
                    
                    console.log(`[FeishuModule] Initializing secureSettings with dataDir: ${dataDir}`);
                    await this.secureSettings.initialize?.(dataDir);
                }
                
                // 尝试获取飞书配置（使用 getSecret 方法）
                const appId = this.secureSettings.getSecret?.('feishu.appId');
                const appSecret = this.secureSettings.getSecret?.('feishu.appSecret');
                
                if (appId) this.config.appId = appId;
                if (appSecret) this.config.appSecret = appSecret;
                
                if (appId || appSecret) {
                    console.log(`[FeishuModule] Config loaded from secureSettings`);
                }
            } catch (error) {
                console.warn(`[FeishuModule] Failed to load config from secureSettings:`, error.message);
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
                            channelBridge: !!channelBridge,
                            channelBridgeReady: channelBridge?.isInitialized?.() || false,
                            aiConnected: channelBridge?.isAIConnected?.() || false,
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
                    
                    // 保存敏感配置到 secureSettings（使用 setSecret 方法）
                    if (this.secureSettings) {
                        // 确保 secureSettings 已初始化
                        if (!this.secureSettings.isInitialized || !this.secureSettings.isInitialized()) {
                            const os = require('os');
                            const path = require('path');
                            const APP_NAME = 'deepseek-cowork';
                            let dataDir;
                            
                            if (process.platform === 'win32') {
                                dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
                            } else if (process.platform === 'darwin') {
                                dataDir = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
                            } else {
                                dataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
                            }
                            
                            console.log(`[FeishuModule] Initializing secureSettings for save with dataDir: ${dataDir}`);
                            await this.secureSettings.initialize?.(dataDir);
                        }
                        
                        if (newConfig.appSecret) {
                            this.secureSettings.setSecret?.('feishu.appSecret', newConfig.appSecret);
                            console.log(`[FeishuModule] Saved appSecret to secureSettings`);
                        }
                        if (newConfig.appId) {
                            this.secureSettings.setSecret?.('feishu.appId', newConfig.appId);
                            console.log(`[FeishuModule] Saved appId to secureSettings`);
                        }
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
            
            // API: 模拟对话（无需飞书配置即可测试 AI）
            app.post('/api/feishu/simulate', async (req, res) => {
                this.requestCount++;
                
                try {
                    const { message, sessionId: customSessionId } = req.body;
                    
                    if (!message || typeof message !== 'string' || !message.trim()) {
                        return res.status(400).json({
                            success: false,
                            error: '消息内容不能为空'
                        });
                    }
                    
                    // 检查 Channel Bridge 是否可用
                    if (!channelBridge || !channelBridge.isInitialized()) {
                        return res.status(503).json({
                            success: false,
                            error: 'AI 服务未初始化，请确保 HappyService 已连接'
                        });
                    }
                    
                    // 检查 AI 是否已连接
                    if (!channelBridge.isAIConnected()) {
                        return res.status(503).json({
                            success: false,
                            error: 'AI 服务未连接，请先在主界面连接 AI'
                        });
                    }
                    
                    const sessionId = customSessionId || 'simulator:default';
                    const messageId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    
                    // 创建 SimulatorAdapter - 用于捕获 AI 响应
                    let responseResolve;
                    let responseReject;
                    const responsePromise = new Promise((resolve, reject) => {
                        responseResolve = resolve;
                        responseReject = reject;
                        
                        // 设置超时
                        setTimeout(() => {
                            reject(new Error('AI 响应超时（60秒）'));
                        }, 60000);
                    });
                    
                    const simulatorAdapter = {
                        channelId: 'simulator',
                        
                        async sendText(to, text) {
                            console.log(`[Simulator] sendText to ${to}: ${text.substring(0, 100)}...`);
                            responseResolve(text);
                            return { success: true, messageId: `sim_resp_${Date.now()}` };
                        },
                        
                        async replyText(replyToId, text) {
                            console.log(`[Simulator] replyText to ${replyToId}: ${text.substring(0, 100)}...`);
                            responseResolve(text);
                            return { success: true, messageId: `sim_resp_${Date.now()}` };
                        },
                        
                        async sendTyping(to) {
                            console.log(`[Simulator] sendTyping to ${to}`);
                        }
                    };
                    
                    // 构建消息上下文
                    const context = {
                        channelId: 'simulator',
                        sessionKey: sessionId,
                        messageId: messageId,
                        senderId: 'simulator_user',
                        senderName: '模拟用户',
                        chatType: 'dm',
                        content: message.trim(),
                        replyToId: messageId,
                        timestamp: Date.now(),
                        metadata: {
                            source: 'web_simulator'
                        }
                    };
                    
                    console.log(`[FeishuModule] Simulate: Sending message to AI - ${message.substring(0, 50)}...`);
                    
                    // 通过 Channel Bridge 处理消息
                    const inboundResult = await channelBridge.handleInbound(context, simulatorAdapter);
                    
                    if (!inboundResult.success) {
                        return res.status(500).json({
                            success: false,
                            error: inboundResult.error || '消息处理失败'
                        });
                    }
                    
                    // 等待 AI 响应
                    const aiResponse = await responsePromise;
                    
                    console.log(`[FeishuModule] Simulate: Got AI response - ${aiResponse.substring(0, 50)}...`);
                    
                    // 保存到会话历史
                    if (!this.simulatorHistories) {
                        this.simulatorHistories = new Map();
                    }
                    if (!this.simulatorHistories.has(sessionId)) {
                        this.simulatorHistories.set(sessionId, []);
                    }
                    const history = this.simulatorHistories.get(sessionId);
                    history.push(
                        { role: 'user', content: message.trim(), timestamp: context.timestamp },
                        { role: 'assistant', content: aiResponse, timestamp: Date.now() }
                    );
                    // 限制历史记录数量
                    if (history.length > 100) {
                        history.splice(0, history.length - 100);
                    }
                    
                    res.json({
                        success: true,
                        data: {
                            requestId: inboundResult.requestId,
                            response: aiResponse,
                            sessionId: sessionId
                        }
                    });
                    
                } catch (error) {
                    console.error(`[FeishuModule] Simulate error:`, error.message);
                    res.status(500).json({
                        success: false,
                        error: error.message || '模拟对话失败'
                    });
                }
            });
            
            // API: 获取模拟对话历史
            app.get('/api/feishu/simulate/history', (req, res) => {
                this.requestCount++;
                const sessionId = req.query.sessionId || 'simulator:default';
                
                if (!this.simulatorHistories) {
                    this.simulatorHistories = new Map();
                }
                
                const history = this.simulatorHistories.get(sessionId) || [];
                
                res.json({
                    success: true,
                    data: {
                        sessionId,
                        messages: history
                    }
                });
            });
            
            // API: 清除模拟对话历史
            app.delete('/api/feishu/simulate/history', (req, res) => {
                this.requestCount++;
                const sessionId = req.query.sessionId || 'simulator:default';
                
                if (this.simulatorHistories) {
                    this.simulatorHistories.delete(sessionId);
                }
                
                res.json({
                    success: true,
                    message: '对话历史已清除'
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
            
            // 注册到 Channel Bridge
            if (channelBridge && this.feishuAdapter && !this.bridgeRegistered) {
                const registered = channelBridge.registerChannel('feishu', this.feishuAdapter);
                if (registered) {
                    this.bridgeRegistered = true;
                    console.log(`[FeishuModule] Registered to Channel Bridge`);
                } else {
                    console.warn(`[FeishuModule] Failed to register to Channel Bridge`);
                }
            }
            
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
            
            // 从 Channel Bridge 注销
            if (channelBridge && this.bridgeRegistered) {
                channelBridge.unregisterChannel('feishu');
                this.bridgeRegistered = false;
                console.log(`[FeishuModule] Unregistered from Channel Bridge`);
            }
            
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
