/**
 * Local Service 统一入口
 * 
 * 提供独立于 Electron 的本地服务，支持 CLI 模式运行
 * 
 * 功能：
 * - 初始化所有服务（HappyService, BrowserControl, FileManager）
 * - 启动 HTTP/WebSocket 服务器
 * - 管理服务生命周期
 * 
 * 创建时间: 2026-01-20
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 配置模块
const localConfig = require('./config');
const userSettings = require('./user-settings-cli');
const secureSettings = require('./secure-settings-cli');

// 核心服务
const HappyService = require('../happy-service');
const MessageStore = require('../message-store');

// 日志
function logInfo(...args) {
    console.log('[LocalService]', ...args);
}

function logWarn(...args) {
    console.warn('[LocalService]', ...args);
}

function logError(...args) {
    console.error('[LocalService]', ...args);
}

/**
 * Local Service 主类
 */
class LocalService extends EventEmitter {
    constructor() {
        super();
        
        this._initialized = false;
        this._running = false;
        this._httpServer = null;
        this._wsServer = null;
        this._app = null;
        
        // 服务实例
        this._browserControlService = null;
        this._explorerService = null;
        
        // 配置
        this._config = null;
        this._dataDir = null;
    }

    /**
     * 初始化服务
     * @param {Object} options 配置选项
     * @param {string} [options.dataDir] 自定义数据目录
     * @param {number} [options.httpPort] HTTP 端口
     * @param {number} [options.wsPort] WebSocket 端口
     * @param {string} [options.workDir] 工作目录
     * @returns {Promise<Object>} 初始化结果
     */
    async initialize(options = {}) {
        if (this._initialized) {
            return { success: true, alreadyInitialized: true };
        }

        try {
            logInfo('Initializing Local Service...');
            
            // 1. 初始化目录
            this._dataDir = options.dataDir || localConfig.getDataDir();
            localConfig.initializeDirectories();
            logInfo('Data directory:', this._dataDir);
            
            // 2. 初始化用户设置
            userSettings.initialize(this._dataDir);
            logInfo('User settings initialized:', userSettings.getSettingsPath());
            
            // 3. 初始化安全设置
            await secureSettings.initialize(this._dataDir);
            logInfo('Secure settings initialized');
            
            // 4. 初始化消息存储
            MessageStore.initialize(this._dataDir);
            logInfo('Message store initialized');
            
            // 5. 构建配置
            this._config = this._buildConfig(options);
            logInfo('Configuration built');
            
            // 6. 初始化 HappyService
            await this._initializeHappyService();
            
            this._initialized = true;
            logInfo('Local Service initialized successfully');
            
            return {
                success: true,
                dataDir: this._dataDir,
                config: this._config
            };
            
        } catch (error) {
            logError('Initialization failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 构建配置对象
     * @param {Object} options 用户选项
     * @returns {Object} 配置对象
     * @private
     */
    _buildConfig(options) {
        const savedHttpPort = userSettings.get('server.httpPort');
        const savedWsPort = userSettings.get('server.wsPort');
        
        return {
            server: {
                host: 'localhost',
                port: options.httpPort || savedHttpPort || localConfig.DEFAULT_HTTP_PORT,
                wsPort: options.wsPort || savedWsPort || localConfig.DEFAULT_WS_PORT,
                baseUrl: `http://localhost:${options.httpPort || savedHttpPort || localConfig.DEFAULT_HTTP_PORT}`
            },
            cors: localConfig.defaultConfig.cors,
            browserControl: {
                enabled: true,
                extensionWebSocket: {
                    enabled: true,
                    port: options.wsPort || savedWsPort || localConfig.DEFAULT_WS_PORT
                }
            },
            explorer: {
                enabled: true
            },
            database: {
                directory: path.join(this._dataDir, 'data')
            },
            happy: {
                enabled: true,
                stateDir: localConfig.getHappyStateDir(),
                workDirs: [{
                    name: 'main',
                    path: options.workDir || userSettings.get('happy.workspaceDir') || localConfig.getDefaultWorkspaceDir()
                }]
            }
        };
    }

    /**
     * 初始化 HappyService
     * @private
     */
    async _initializeHappyService() {
        logInfo('Initializing HappyService...');
        
        // 获取配置
        const happySecret = secureSettings.hasSecret('happy.secret')
            ? secureSettings.getSecret('happy.secret')
            : null;
        
        const permissionMode = userSettings.get('happy.permissionMode') || 'default';
        const serverUrl = userSettings.get('happy.serverUrl');
        const workspaceDir = userSettings.get('happy.workspaceDir') || localConfig.getDefaultWorkspaceDir();
        
        // 确保工作目录存在
        localConfig.ensureDir(workspaceDir);
        
        // 设置 Claude Code 环境变量获取器
        HappyService.setClaudeCodeEnvGetter(() => {
            const claudeConfig = userSettings.get('happy.claudeCode') || {};
            const provider = claudeConfig.provider || 'anthropic';
            
            const env = {};
            
            // 始终注入 Happy Server URL
            const happyServerUrl = userSettings.get('happy.serverUrl');
            if (happyServerUrl) {
                env.HAPPY_SERVER_URL = happyServerUrl;
            }
            
            if (provider === 'anthropic') {
                return Object.keys(env).length > 0 ? env : null;
            }
            
            if (claudeConfig.baseUrl) {
                env.ANTHROPIC_BASE_URL = claudeConfig.baseUrl;
            }
            
            if (secureSettings.hasSecret('claude.authToken')) {
                env.ANTHROPIC_AUTH_TOKEN = secureSettings.getSecret('claude.authToken');
            }
            
            if (claudeConfig.model) {
                env.ANTHROPIC_MODEL = claudeConfig.model;
            }
            
            if (claudeConfig.smallFastModel) {
                env.ANTHROPIC_SMALL_FAST_MODEL = claudeConfig.smallFastModel;
            }
            
            if (claudeConfig.timeoutMs) {
                env.API_TIMEOUT_MS = claudeConfig.timeoutMs;
            }
            
            if (claudeConfig.disableNonessential) {
                env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = true;
            }
            
            return env;
        });
        
        // 初始化 HappyService
        const result = await HappyService.initialize({
            stateDir: localConfig.getHappyStateDir(),
            workDirs: [{
                name: 'main',
                path: workspaceDir
            }],
            baseDir: workspaceDir,
            monitorInterval: 30000,
            autoMonitor: userSettings.get('happy.autoMonitor') !== false,
            logLevel: 'INFO',
            happySecret: happySecret,
            permissionMode: permissionMode,
            serverUrl: serverUrl || undefined,
            debug: userSettings.get('happy.debug') || false
        });
        
        if (result.success) {
            logInfo('HappyService initialized');
            logInfo('  Daemon:', result.daemon?.running ? 'Running' : 'Not running');
            logInfo('  Sessions:', Object.keys(result.sessions || {}).length);
        } else {
            logWarn('HappyService initialization failed:', result.error);
        }
        
        return result;
    }

    /**
     * 启动 HTTP/WebSocket 服务器
     * @returns {Promise<Object>} 启动结果
     */
    async start() {
        if (!this._initialized) {
            return { success: false, error: 'Service not initialized' };
        }
        
        if (this._running) {
            return { success: true, alreadyRunning: true };
        }

        try {
            logInfo('Starting Local Service...');
            
            // 动态加载服务器依赖
            const express = require('express');
            const http = require('http');
            const { Server: SocketIO } = require('socket.io');
            const cors = require('cors');
            
            // 创建 Express 应用
            this._app = express();
            this._httpServer = http.createServer(this._app);
            
            // 设置 CORS
            this._app.use(cors({
                origin: (origin, callback) => {
                    // 允许无 origin 的请求（如本地文件）
                    if (!origin) return callback(null, true);
                    
                    // 允许 localhost 和配置的域名
                    const allowed = this._config.cors.origins.some(pattern => {
                        if (pattern.includes('*')) {
                            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                            return regex.test(origin);
                        }
                        return origin === pattern;
                    });
                    
                    callback(null, allowed);
                },
                credentials: true
            }));
            
            // JSON 解析
            this._app.use(express.json({ limit: '10mb' }));
            
            // 创建 Socket.IO 实例
            this._wsServer = new SocketIO(this._httpServer, {
                cors: {
                    origin: this._config.cors.origins,
                    methods: this._config.cors.methods
                }
            });
            
            // 设置全局根目录（server 模块需要）
            global.rootDir = path.join(__dirname, '../..');
            
            // 初始化并启动子服务
            await this._startSubServices();
            
            // 设置 API 路由
            const setupRoutes = require('./routes');
            setupRoutes(this._app, { localService: this });
            logInfo('API routes registered');
            
            // 设置 WebSocket 事件转发
            const { setupEventForwarding } = require('./ws/events');
            this._eventForwarder = setupEventForwarding(this._wsServer, { localService: this });
            logInfo('WebSocket event forwarding configured');
            
            // 启动 HTTP 服务器
            const port = this._config.server.port;
            const host = this._config.server.host;
            
            await new Promise((resolve, reject) => {
                this._httpServer.listen(port, host, () => {
                    resolve();
                });
                
                this._httpServer.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        reject(new Error(`Port ${port} is already in use`));
                    } else {
                        reject(error);
                    }
                });
            });
            
            this._running = true;
            
            logInfo(`Local Service started`);
            logInfo(`  HTTP: http://${host}:${port}`);
            logInfo(`  WebSocket: ws://${host}:${this._config.server.wsPort}`);
            
            // 连接 HappyClient
            await this._connectHappyClient();
            
            this.emit('started', {
                httpPort: port,
                wsPort: this._config.server.wsPort,
                host: host
            });
            
            return {
                success: true,
                httpPort: port,
                wsPort: this._config.server.wsPort,
                host: host
            };
            
        } catch (error) {
            logError('Failed to start:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 启动子服务（BrowserControl, Explorer）
     * @private
     */
    async _startSubServices() {
        // 导入服务器模块
        const { setupBrowserControlService } = require('../../server/modules/browser');
        const { setupExplorerService } = require('../../server/modules/explorer');
        
        // 初始化 BrowserControl 服务
        if (this._config.browserControl?.enabled !== false) {
            logInfo('Starting BrowserControl service...');
            
            this._browserControlService = setupBrowserControlService({
                browserControlConfig: this._config.browserControl,
                serverConfig: {
                    host: this._config.server.host,
                    port: this._config.server.port
                }
            });
            
            await this._browserControlService.init();
            this._browserControlService.setupRoutes(this._app);
            await this._browserControlService.start();
            
            logInfo('BrowserControl service started');
        }
        
        // 初始化 Explorer 服务
        if (this._config.explorer?.enabled !== false) {
            logInfo('Starting Explorer service...');
            
            this._explorerService = setupExplorerService({
                explorerConfig: this._config.explorer,
                serverConfig: {
                    host: this._config.server.host,
                    port: this._config.server.port
                },
                appDir: global.rootDir
            });
            
            await this._explorerService.init();
            this._explorerService.setupRoutes(this._app);
            await this._explorerService.start();
            
            logInfo('Explorer service started');
        }
    }

    /**
     * 连接 HappyClient
     * @private
     */
    async _connectHappyClient() {
        try {
            logInfo('Connecting HappyClient...');
            const result = await HappyService.connectToSession('main');
            
            if (result.success) {
                logInfo('HappyClient connected:', result.sessionId);
            } else {
                logWarn('HappyClient connection failed:', result.error);
            }
            
            return result;
        } catch (error) {
            logWarn('HappyClient connection error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 停止服务
     * @returns {Promise<Object>} 停止结果
     */
    async stop() {
        if (!this._running) {
            return { success: true, alreadyStopped: true };
        }

        try {
            logInfo('Stopping Local Service...');
            
            // 停止子服务
            if (this._browserControlService) {
                await this._browserControlService.stop();
            }
            
            if (this._explorerService) {
                await this._explorerService.stop();
            }
            
            // 断开 HappyClient
            await HappyService.disconnectClient();
            
            // 关闭 WebSocket
            if (this._wsServer) {
                this._wsServer.close();
            }
            
            // 关闭 HTTP 服务器
            if (this._httpServer) {
                await new Promise((resolve) => {
                    this._httpServer.close(resolve);
                });
            }
            
            // 刷新消息存储
            MessageStore.flush();
            
            this._running = false;
            this._httpServer = null;
            this._wsServer = null;
            this._app = null;
            
            logInfo('Local Service stopped');
            
            this.emit('stopped');
            
            return { success: true };
            
        } catch (error) {
            logError('Failed to stop:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取服务状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            initialized: this._initialized,
            running: this._running,
            httpPort: this._config?.server?.port,
            wsPort: this._config?.server?.wsPort,
            dataDir: this._dataDir,
            happy: HappyService.getStatus(),
            browserControl: this._browserControlService ? 'running' : 'stopped',
            explorer: this._explorerService ? 'running' : 'stopped'
        };
    }

    /**
     * 获取 Express 应用实例
     * @returns {Object|null} Express 应用
     */
    getApp() {
        return this._app;
    }

    /**
     * 获取 HTTP 服务器实例
     * @returns {Object|null} HTTP 服务器
     */
    getHttpServer() {
        return this._httpServer;
    }

    /**
     * 获取 WebSocket 服务器实例
     * @returns {Object|null} Socket.IO 实例
     */
    getWsServer() {
        return this._wsServer;
    }

    /**
     * 获取 BrowserControl 服务
     * @returns {Object|null} BrowserControl 服务实例
     */
    getBrowserControlService() {
        return this._browserControlService;
    }

    /**
     * 获取 Explorer 服务
     * @returns {Object|null} Explorer 服务实例
     */
    getExplorerService() {
        return this._explorerService;
    }

    /**
     * 获取配置
     * @returns {Object} 配置对象
     */
    getConfig() {
        return this._config;
    }

    /**
     * 检查服务是否正在运行
     * @returns {boolean}
     */
    isRunning() {
        return this._running;
    }

    /**
     * 检查服务是否已初始化
     * @returns {boolean}
     */
    isInitialized() {
        return this._initialized;
    }
}

// 导出单例
const localService = new LocalService();

module.exports = localService;

// 同时导出类和相关模块
module.exports.LocalService = LocalService;
module.exports.config = localConfig;
module.exports.userSettings = userSettings;
module.exports.secureSettings = secureSettings;
