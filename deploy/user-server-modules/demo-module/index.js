/**
 * Demo Module - 演示模块
 * 
 * 展示自定义模块的完整功能和开发模式
 * 
 * 功能：
 * - 静态页面服务（介绍自定义模块功能）
 * - API 接口示例（状态查询、Echo）
 * - 标准模块生命周期实现
 * - 核心服务调用演示（HappyService、MessageStore）
 */

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

/**
 * 创建演示模块服务实例
 * @param {Object} options - 配置选项
 * @param {Object} [options.HappyService] - AI 通信服务（通过 modulesManager 注入）
 * @param {Object} [options.MessageStore] - 消息存储服务（通过 modulesManager 注入）
 * @returns {DemoModuleService} 服务实例
 */
function setupDemoModuleService(options = {}) {
    // 获取注入的核心服务
    const HappyService = options.HappyService || null;
    const MessageStore = options.MessageStore || null;
    
    class DemoModuleService extends EventEmitter {
        constructor() {
            super();
            this.name = 'demo-module';
            this.version = '2.0.0';
            this.isRunning = false;
            this.startTime = null;
            this.requestCount = 0;
            this.staticDir = path.join(__dirname, 'static');
            
            // 保存核心服务引用
            this.happyService = HappyService;
            this.messageStore = MessageStore;
            
            // 缓存收到的消息（用于演示事件监听）
            this.recentMessages = [];
            this.maxRecentMessages = 10;
        }
        
        /**
         * 初始化模块
         */
        async init() {
            console.log(`[DemoModule] Initializing...`);
            
            // 检查静态目录是否存在
            if (!fs.existsSync(this.staticDir)) {
                console.warn(`[DemoModule] Static directory not found: ${this.staticDir}`);
            }
            
            // 检查核心服务是否可用
            if (this.happyService) {
                console.log(`[DemoModule] HappyService injected, AI communication available`);
                
                // 演示：监听 HappyService 事件
                this._setupHappyServiceListeners();
            } else {
                console.warn(`[DemoModule] HappyService not injected, AI features unavailable`);
            }
            
            if (this.messageStore) {
                console.log(`[DemoModule] MessageStore injected, message persistence available`);
            } else {
                console.warn(`[DemoModule] MessageStore not injected, message persistence unavailable`);
            }
            
            console.log(`[DemoModule] Initialization complete`);
        }
        
        /**
         * 设置 HappyService 事件监听
         * 演示如何监听核心服务的事件
         */
        _setupHappyServiceListeners() {
            if (!this.happyService) return;
            
            // 监听新消息事件
            this.happyService.on('happy:message', (message) => {
                console.log(`[DemoModule] Message received: ${message.role} - ${message.content?.substring(0, 50)}...`);
                
                // 缓存最近的消息
                this.recentMessages.push({
                    timestamp: new Date().toISOString(),
                    role: message.role,
                    contentPreview: message.content?.substring(0, 100) || ''
                });
                
                // 保持缓存大小
                if (this.recentMessages.length > this.maxRecentMessages) {
                    this.recentMessages.shift();
                }
                
                // 发射自定义事件
                this.emit('demo:messageReceived', { message });
            });
            
            // 监听连接状态事件
            this.happyService.on('happy:connected', () => {
                console.log(`[DemoModule] HappyService connected`);
                this.emit('demo:connected');
            });
            
            this.happyService.on('happy:disconnected', () => {
                console.log(`[DemoModule] HappyService disconnected`);
                this.emit('demo:disconnected');
            });
            
            console.log(`[DemoModule] HappyService event listeners setup`);
        }
        
        /**
         * 注册路由
         * @param {Express} app - Express 应用实例
         */
        setupRoutes(app) {
            // 静态页面 - 介绍页面
            app.get('/demo/', (req, res) => {
                this.requestCount++;
                const indexPath = path.join(this.staticDir, 'index.html');
                
                if (fs.existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send('Demo page not found');
                }
            });
            
            // API: 状态查询
            app.get('/api/demo/status', (req, res) => {
                this.requestCount++;
                res.json({
                    success: true,
                    data: {
                        name: this.name,
                        version: this.version,
                        isRunning: this.isRunning,
                        uptime: this.getUptime(),
                        requestCount: this.requestCount,
                        startTime: this.startTime ? this.startTime.toISOString() : null,
                        // 核心服务可用性
                        coreServices: {
                            happyService: !!this.happyService,
                            messageStore: !!this.messageStore
                        }
                    }
                });
            });
            
            // API: Echo 接口
            app.post('/api/demo/echo', (req, res) => {
                this.requestCount++;
                res.json({
                    success: true,
                    data: {
                        echo: req.body,
                        timestamp: new Date().toISOString(),
                        headers: {
                            'content-type': req.headers['content-type'],
                            'user-agent': req.headers['user-agent']
                        }
                    }
                });
            });
            
            // API: 模块信息
            app.get('/api/demo/info', (req, res) => {
                this.requestCount++;
                res.json({
                    success: true,
                    data: {
                        name: this.name,
                        version: this.version,
                        description: '演示模块 - 展示自定义模块的完整功能和核心服务集成',
                        author: 'deepseek-cowork',
                        features: [
                            '静态页面服务',
                            'RESTful API 接口',
                            '标准模块生命周期',
                            '事件驱动架构',
                            '核心服务集成（HappyService、MessageStore）'
                        ],
                        endpoints: [
                            { method: 'GET', path: '/demo/', description: '介绍页面' },
                            { method: 'GET', path: '/api/demo/status', description: '状态查询' },
                            { method: 'POST', path: '/api/demo/echo', description: 'Echo 请求体' },
                            { method: 'GET', path: '/api/demo/info', description: '模块信息' },
                            { method: 'GET', path: '/api/demo/services', description: '核心服务状态' },
                            { method: 'GET', path: '/api/demo/messages', description: '获取消息历史（通过 MessageStore）' },
                            { method: 'GET', path: '/api/demo/recent', description: '最近收到的消息（事件监听演示）' },
                            { method: 'POST', path: '/api/demo/send', description: '发送消息到 AI（通过 HappyService）' }
                        ],
                        coreServices: {
                            happyService: !!this.happyService,
                            messageStore: !!this.messageStore
                        }
                    }
                });
            });
            
            // ============================================================
            // 核心服务调用演示 API
            // ============================================================
            
            // API: 核心服务状态
            app.get('/api/demo/services', (req, res) => {
                this.requestCount++;
                
                const servicesStatus = {
                    happyService: {
                        available: !!this.happyService,
                        status: null
                    },
                    messageStore: {
                        available: !!this.messageStore,
                        status: null
                    }
                };
                
                // 获取 HappyService 状态
                if (this.happyService && typeof this.happyService.getStatus === 'function') {
                    try {
                        servicesStatus.happyService.status = this.happyService.getStatus();
                    } catch (e) {
                        servicesStatus.happyService.error = e.message;
                    }
                }
                
                res.json({
                    success: true,
                    data: servicesStatus
                });
            });
            
            // API: 获取消息历史（演示 MessageStore 调用）
            app.get('/api/demo/messages', (req, res) => {
                this.requestCount++;
                const { sessionId, limit = 20 } = req.query;
                
                if (!this.messageStore) {
                    return res.status(503).json({
                        success: false,
                        error: 'MessageStore service unavailable'
                    });
                }
                
                try {
                    // 演示：调用 MessageStore.getMessages()
                    const messages = this.messageStore.getMessages(sessionId);
                    const limitedMessages = messages ? messages.slice(-parseInt(limit)) : [];
                    
                    res.json({
                        success: true,
                        data: {
                            sessionId: sessionId || 'default',
                            total: messages?.length || 0,
                            returned: limitedMessages.length,
                            messages: limitedMessages
                        }
                    });
                } catch (error) {
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
            
            // API: 获取最近收到的消息（演示事件监听）
            app.get('/api/demo/recent', (req, res) => {
                this.requestCount++;
                
                res.json({
                    success: true,
                    data: {
                        description: '通过监听 HappyService 的 happy:message 事件收集的最近消息',
                        happyServiceAvailable: !!this.happyService,
                        count: this.recentMessages.length,
                        messages: this.recentMessages
                    }
                });
            });
            
            // API: 发送消息到 AI（演示 HappyService 调用）
            app.post('/api/demo/send', async (req, res) => {
                this.requestCount++;
                const { message } = req.body;
                
                if (!message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing message parameter'
                    });
                }
                
                if (!this.happyService) {
                    return res.status(503).json({
                        success: false,
                        error: 'HappyService unavailable'
                    });
                }
                
                try {
                    console.log(`[DemoModule] Sending message to AI: ${message.substring(0, 50)}...`);
                    
                    // 演示：调用 HappyService.sendMessage()
                    // 注意：这是异步的，会触发流式响应
                    const result = await this.happyService.sendMessage(message);
                    
                    res.json({
                        success: true,
                        data: {
                            messageSent: message,
                            result: result,
                            note: '消息已发送，响应将通过 happy:message 事件流式返回'
                        }
                    });
                } catch (error) {
                    console.error(`[DemoModule] Failed to send message:`, error);
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
            
            console.log(`[DemoModule] Routes registered: /demo/, /api/demo/*`);
        }
        
        /**
         * 启动模块
         */
        async start() {
            this.isRunning = true;
            this.startTime = new Date();
            
            console.log(`[DemoModule] Started`);
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
            
            console.log(`[DemoModule] Stopped (uptime: ${uptime}s)`);
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
    }
    
    return new DemoModuleService();
}

module.exports = { setupDemoModuleService };
