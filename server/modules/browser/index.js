/**
 * 浏览器控制服务模块
 * 
 * 提供浏览器标签页控制功能，遵循标准服务模块接口
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

// 导入模块内部组件
const Database = require('./database');
const TabsManager = require('./tabs-manager');
const CallbackManager = require('./callback-manager');
const Logger = require('./logger');
const { browserEventEmitter } = require('./event-emitter');
const { browserControlServerConfig } = require('./config');
const ExtensionWebSocketServer = require('./ExtensionWebSocketServer');

// 导入安全模块
const AuthManager = require('./auth-manager');
const AuditLogger = require('./audit-logger');
const RateLimiter = require('./rate-limiter');
const ResourceMonitor = require('./resource-monitor');

/**
 * 设置浏览器控制服务
 * @param {Object} options 配置选项
 * @returns {BrowserControlService} 浏览器控制服务实例
 */
function setupBrowserControlService(options = {}) {
  /**
   * 浏览器控制服务类
   */
  class BrowserControlService extends EventEmitter {
    constructor() {
      super();
      this.database = null;
      this.extensionWebSocketServer = null;
      this.tabsManager = null;
      this.callbackManager = null;
      this.config = null;
      this.isRunning = false;
      
      // 安全模块
      this.authManager = null;
      this.auditLogger = null;
      this.rateLimiter = null;
      this.resourceMonitor = null;
    }

    /**
     * 初始化服务
     */
    async init() {
      try {
        // 初始化配置系统
        this.config = browserControlServerConfig.initialize({
          browserControlConfig: options.browserControlConfig,
          serverConfig: options.serverConfig
        });
        
        // 设置日志级别
        const logLevel = this.config.logging?.level || 'INFO';
        Logger.setLogLevel(logLevel);
        
        Logger.info('Browser control server config initialized:', browserControlServerConfig.getSummary());
        
        // 确保数据库目录存在
        const dbDir = path.isAbsolute(this.config.database.directory) 
          ? this.config.database.directory 
          : path.join(global.rootDir || process.cwd(), this.config.database.directory);
        
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // 初始化数据库
        const dbPath = path.isAbsolute(this.config.database.path)
          ? this.config.database.path
          : path.join(global.rootDir || process.cwd(), this.config.database.path);
        
        this.database = new Database(dbPath);
        await this.database.initDb();
        
        // 创建回调管理器（带生命周期管理配置）
        const requestConfig = this.config.request || {};
        this.callbackManager = new CallbackManager(this.database, {
          requestTTL: requestConfig.defaultTimeout || 60000,
          responseRetention: requestConfig.responseRetention || 300000,
          timeoutCheckInterval: requestConfig.timeoutCheckInterval || 5000,
          cleanupInterval: requestConfig.cleanupInterval || 30000
        });
        
        // 连接 CallbackManager 事件到服务事件
        this.setupCallbackManagerEvents();
        
        // 创建标签页管理器
        this.tabsManager = new TabsManager(this.database, this.callbackManager);
        
        // 创建浏览器扩展WebSocket服务器
        if (this.config.extensionWebSocket.enabled) {
          this.extensionWebSocketServer = new ExtensionWebSocketServer(this.database, {
            host: this.config.extensionWebSocket.host,
            port: this.config.extensionWebSocket.port,
            maxClients: this.config.extensionWebSocket.maxClients
          });
          this.extensionWebSocketServer.setTabsManager(this.tabsManager);
          this.extensionWebSocketServer.setCallbackManager(this.callbackManager);
          this.extensionWebSocketServer.setEventEmitter(this);
          // 设置安全配置（用于 Origin 验证）
          this.extensionWebSocketServer.setSecurityConfig(this.config.security);
        }

        // 初始化安全模块
        await this.initSecurityModules();

        // 初始化资源监控
        await this.initResourceMonitor();

        // Cookie管理改为完全手动模式
        Logger.info('Cookie retrieval in manual mode');
        
        // 连接browserEventEmitter事件到当前实例
        this.setupEventBridge();
        
        // 添加扩展连接检测
        this.setupExtensionConnectionMonitor();
        
        return true;
      } catch (error) {
        Logger.error(`Failed to initialize browser control server: ${error.message}`);
        this.emit('error', { type: 'initError', error });
        throw error;
      }
    }

    /**
     * 设置 CallbackManager 事件桥接
     */
    setupCallbackManagerEvents() {
      if (!this.callbackManager) return;
      
      // Forward callback_result events for SSE/WebSocket push
      this.callbackManager.on('callback_result', (data) => {
        this.emit('callback_result', data);
        Logger.debug(`Callback result event: ${data.requestId} - ${data.status}`);
      });
      
      // Forward timeout events
      this.callbackManager.on('request_timeout', (data) => {
        this.emit('request_timeout', data);
        Logger.warn(`Request timeout event: ${data.requestId}`);
      });
      
      Logger.info('CallbackManager event bridge setup complete');
    }

    /**
     * 设置事件桥接
     */
    setupEventBridge() {
      Logger.info('Setting up browserEventEmitter event bridge');
      
      browserEventEmitter.on('browser_event', (event) => {
        try {
          this.emit(event.type, event.data);
          Logger.debug(`Event bridge: ${event.type}`);
        } catch (error) {
          Logger.error(`Event bridge failed: ${error.message}`);
        }
      });
      
      Logger.info('Event bridge setup complete');
    }

    /**
     * 设置扩展连接监控
     */
    setupExtensionConnectionMonitor() {
      if (!this.config.monitoring.enableConnectionMonitor) {
        return;
      }
      
      setInterval(() => {
        const extensionConnections = this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0;
        
        if (extensionConnections === 0) {
          if (this.config.extensionWebSocket.enabled) {
            Logger.warning(`No browser extension connected to WebSocket server (${this.config.extensionWebSocket.baseUrl})`);
          }
        } else {
          Logger.debug(`Detected ${extensionConnections} extension connection(s)`);
        }
      }, this.config.monitoring.connectionCheckInterval);
    }

    /**
     * 初始化安全模块
     */
    async initSecurityModules() {
      const securityConfig = this.config.security || {};
      
      // 调试日志
      Logger.info('[initSecurityModules] securityConfig:', JSON.stringify(securityConfig, null, 2));
      Logger.info('[initSecurityModules] auth config:', JSON.stringify(securityConfig.auth, null, 2));
      Logger.info('[initSecurityModules] auth.enabled:', securityConfig.auth?.enabled);
      Logger.info('[initSecurityModules] auth.enabled !== false:', securityConfig.auth?.enabled !== false);
      
      // 初始化认证管理器
      if (securityConfig.auth?.enabled !== false) {
        try {
          this.authManager = new AuthManager(securityConfig.auth);
          Logger.info('AuthManager initialized');
          
          // 注入到 WebSocket 服务器
          if (this.extensionWebSocketServer) {
            this.extensionWebSocketServer.setAuthManager(this.authManager);
          }
        } catch (error) {
          Logger.error(`Failed to initialize AuthManager: ${error.message}`);
          // 认证初始化失败不应阻止服务启动，但需要记录
        }
      } else {
        Logger.warn('Authentication is DISABLED - all connections will be accepted without verification');
      }
      
      // 初始化审计日志
      if (securityConfig.audit?.enabled !== false) {
        try {
          this.auditLogger = new AuditLogger(securityConfig.audit, this.database);
          Logger.info('AuditLogger initialized');
          
          // 注入到 WebSocket 服务器
          if (this.extensionWebSocketServer) {
            this.extensionWebSocketServer.setAuditLogger(this.auditLogger);
          }
        } catch (error) {
          Logger.error(`Failed to initialize AuditLogger: ${error.message}`);
        }
      }
      
      // 初始化速率限制器
      if (securityConfig.rateLimit?.enabled !== false) {
        try {
          this.rateLimiter = new RateLimiter(securityConfig.rateLimit);
          Logger.info('RateLimiter initialized');
          
          // 注入到 WebSocket 服务器
          if (this.extensionWebSocketServer) {
            this.extensionWebSocketServer.setRateLimiter(this.rateLimiter);
          }
        } catch (error) {
          Logger.error(`Failed to initialize RateLimiter: ${error.message}`);
        }
      }
      
      // 输出安全模块状态摘要
      Logger.info('Security modules status:', {
        auth: this.authManager ? 'enabled' : 'disabled',
        audit: this.auditLogger ? 'enabled' : 'disabled',
        rateLimit: this.rateLimiter ? 'enabled' : 'disabled'
      });
    }

    /**
     * 初始化资源监控
     */
    async initResourceMonitor() {
      const monitorConfig = this.config.resourceMonitor || {};
      
      if (monitorConfig.enabled !== false) {
        try {
          this.resourceMonitor = new ResourceMonitor(monitorConfig);
          
          // 注入依赖
          this.resourceMonitor.setDependencies({
            extensionWebSocketServer: this.extensionWebSocketServer,
            callbackManager: this.callbackManager,
            database: this.database
          });
          
          Logger.info('ResourceMonitor initialized');
        } catch (error) {
          Logger.error(`Failed to initialize ResourceMonitor: ${error.message}`);
        }
      }
    }

    /**
     * 启动服务
     */
    async start() {
      try {
        Logger.info("Starting browser control server...");
        
        // 启动 CallbackManager 的超时检查和清理
        if (this.callbackManager) {
          this.callbackManager.start();
          Logger.info('CallbackManager started');
        }
        
        // 启动浏览器扩展WebSocket服务器
        if (this.extensionWebSocketServer && this.config.extensionWebSocket.enabled) {
          this.extensionWebSocketServer.start();
          Logger.info(`Browser extension WebSocket server started: ${this.config.extensionWebSocket.baseUrl}`);
        }
        
        // 启动资源监控
        if (this.resourceMonitor) {
          this.resourceMonitor.start();
          Logger.info('ResourceMonitor started');
        }
        
        this.isRunning = true;
        this.emit('started', { serverInfo: this.getStatus() });
        return true;
      } catch (error) {
        Logger.error('Failed to start browser control service:', error);
        this.emit('error', { type: 'startError', error });
        throw error;
      }
    }

    /**
     * 停止服务
     */
    async stop() {
      try {
        if (!this.extensionWebSocketServer) {
          Logger.info('Browser control server not started, no need to stop');
          return true;
        }
        
        Logger.info("Closing browser control server...");
        
        // 停止WebSocket服务器
        if (this.extensionWebSocketServer) {
          this.extensionWebSocketServer.stop();
          Logger.info('Browser extension WebSocket server stopped');
        }
        
        // 停止 CallbackManager
        if (this.callbackManager) {
          this.callbackManager.stop();
          Logger.info('CallbackManager stopped');
        }
        
        // 停止资源监控
        if (this.resourceMonitor) {
          this.resourceMonitor.stop();
          Logger.info('ResourceMonitor stopped');
        }
        
        // 停止安全模块
        if (this.authManager) {
          this.authManager.stop();
          Logger.info('AuthManager stopped');
        }
        
        if (this.auditLogger) {
          this.auditLogger.stop();
          Logger.info('AuditLogger stopped');
        }
        
        if (this.rateLimiter) {
          this.rateLimiter.stop();
          Logger.info('RateLimiter stopped');
        }
        
        // 清理TabsManager资源
        if (this.tabsManager && typeof this.tabsManager.destroy === 'function') {
          this.tabsManager.destroy();
        }
        
        // 关闭数据库连接
        if (this.database) {
          await this.database.close();
        }
        
        this.isRunning = false;
        this.emit('stopped');
        return true;
      } catch (error) {
        Logger.error('Failed to stop browser control service:', error);
        this.emit('error', { type: 'stopError', error });
        throw error;
      }
    }
    
    /**
     * 验证 Origin 是否在白名单中（用于 CORS）
     * @param {string} origin - 请求的 Origin
     * @returns {boolean} - 是否允许
     */
    validateOrigin(origin) {
      const securityConfig = this.config?.security || {};
      
      // 如果未启用严格检查，允许所有请求
      if (securityConfig.strictOriginCheck === false) {
        return true;
      }
      
      const allowedOrigins = securityConfig.allowedOrigins || [
        'moz-extension://*',
        'chrome-extension://*',
        'http://localhost:*',
        'http://127.0.0.1:*',
        'https://localhost:*',
        'https://127.0.0.1:*'
      ];
      
      // 处理空 Origin（同源请求或非浏览器客户端）
      if (!origin || origin === 'null' || origin === 'undefined') {
        return securityConfig.allowNullOrigin !== false;
      }
      
      // 检查白名单
      return allowedOrigins.some(pattern => {
        if (pattern.includes('*')) {
          // 将通配符模式转换为正则表达式
          const escapedPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
          const regex = new RegExp('^' + escapedPattern + '$');
          return regex.test(origin);
        }
        return origin === pattern;
      });
    }

    /**
     * 设置路由
     * @param {Object} app Express 应用实例
     */
    setupRoutes(app) {
      // 设置静态文件服务
      app.use('/browser-assets', express.static(path.join(__dirname, './html')));
      
      // 主页/控制面板
      app.get('/browser', (req, res) => {
        res.removeHeader('Content-Type');
        res.sendFile(path.join(__dirname, './html/index.html'));
      });
      
      // API路由前缀
      const apiRouter = express.Router();
      
      // 启用 CORS（使用白名单验证）
      const self = this;
      apiRouter.use(cors({
        origin: function(requestOrigin, callback) {
          // 验证 Origin 是否在白名单中
          if (self.validateOrigin(requestOrigin)) {
            callback(null, true);
          } else {
            Logger.warn(`[SECURITY] CORS rejected request from origin: ${requestOrigin || 'null'}`);
            callback(new Error('Origin not allowed by CORS policy'));
          }
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept'],
        credentials: false  // 不允许凭证，与 origin 动态验证配合使用
      }));
      
      app.use('/api/browser', apiRouter);
      
      // 获取服务器配置信息
      apiRouter.get('/config', (req, res) => {
        res.json({
          status: 'success',
          config: {
            server: {
              host: this.config.server.host,
              port: this.config.server.port,
              baseUrl: this.config.server.baseUrl
            },
            extensionWebSocket: {
              enabled: this.config.extensionWebSocket.enabled,
              host: this.config.extensionWebSocket.host,
              port: this.config.extensionWebSocket.port,
              baseUrl: this.config.extensionWebSocket.baseUrl
            },
            websocketAddress: this.config.extensionWebSocket.baseUrl,
            host: this.config.extensionWebSocket.host,
            extensionPort: this.config.extensionWebSocket.port
          }
        });
      });
      
      // 获取服务状态
      apiRouter.get('/status', (req, res) => {
        res.json({
          status: 'success',
          data: this.getStatus()
        });
      });
      
      // 健康检查端点
      apiRouter.get('/health', async (req, res) => {
        try {
          let health;
          
          if (this.resourceMonitor) {
            health = await this.resourceMonitor.performHealthCheck();
          } else {
            // 基本健康检查
            health = {
              timestamp: new Date().toISOString(),
              status: 'healthy',
              message: 'ResourceMonitor not enabled'
            };
          }
          
          // 根据状态返回不同的 HTTP 状态码
          const statusCode = health.status === 'healthy' ? 200 : 
                            health.status === 'warning' ? 200 : 
                            health.status === 'critical' ? 503 : 500;
          
          res.status(statusCode).json(health);
        } catch (err) {
          Logger.error(`Health check failed: ${err.message}`);
          res.status(500).json({
            status: 'error',
            message: err.message
          });
        }
      });
      
      // 管理端点：手动清理（仅限本地访问）
      apiRouter.post('/admin/cleanup', async (req, res) => {
        // 安全检查：仅允许本地请求
        const clientIP = req.ip || req.connection.remoteAddress || '';
        const isLocalRequest = clientIP === '127.0.0.1' || 
                               clientIP === '::1' || 
                               clientIP === 'localhost' ||
                               clientIP === '::ffff:127.0.0.1';
        
        if (!isLocalRequest) {
          Logger.warn(`[Security] Rejected admin/cleanup request from non-local IP: ${clientIP}`);
          return res.status(403).json({
            status: 'error',
            message: 'Access denied: This endpoint is only available from localhost'
          });
        }
        
        try {
          let result;
          
          if (this.resourceMonitor) {
            result = await this.resourceMonitor.manualCleanup();
          } else {
            // 手动执行清理
            result = {
              timestamp: new Date().toISOString(),
              cleanedCallbacks: 0,
              cleanedResponses: 0,
              cleanedPending: 0
            };
            
            if (this.callbackManager) {
              result.cleanedCallbacks = await this.callbackManager.cleanupExpiredCallbacks();
              result.cleanedResponses = await this.callbackManager.cleanupExpiredResponses();
            }
            
            if (this.extensionWebSocketServer) {
              result.cleanedPending = this.extensionWebSocketServer.cleanupPendingResponses();
            }
          }
          
          res.json({
            status: 'success',
            result
          });
        } catch (err) {
          Logger.error(`Manual cleanup failed: ${err.message}`);
          res.status(500).json({
            status: 'error',
            message: err.message
          });
        }
      });
      
      // 获取认证密钥（仅限本地请求）
      apiRouter.get('/auth/secret', (req, res) => {
        // 安全检查：仅允许本地请求
        const clientIP = req.ip || req.connection.remoteAddress || '';
        const isLocalRequest = clientIP === '127.0.0.1' || 
                               clientIP === '::1' || 
                               clientIP === 'localhost' ||
                               clientIP === '::ffff:127.0.0.1';
        
        if (!isLocalRequest) {
          Logger.warn(`[Security] Rejected auth/secret request from non-local IP: ${clientIP}`);
          return res.status(403).json({
            success: false,
            error: 'Access denied: This endpoint is only available from localhost'
          });
        }
        
        // 检查认证管理器是否可用
        if (!this.authManager) {
          return res.json({
            success: true,
            secretKey: null,
            source: null,
            authEnabled: false,
            message: 'Authentication is not enabled'
          });
        }
        
        try {
          const secretInfo = this.authManager.getSecretInfo();
          res.json({
            success: true,
            secretKey: secretInfo.secretKey,
            source: secretInfo.source,
            keyFile: secretInfo.keyFile,
            authEnabled: true
          });
        } catch (err) {
          Logger.error(`Failed to get auth secret: ${err.message}`);
          res.status(500).json({
            success: false,
            error: 'Failed to retrieve authentication secret'
          });
        }
      });
      
      // 获取所有标签页
      apiRouter.get('/tabs', async (req, res) => {
        try {
          if (!this.tabsManager) {
            return res.status(500).json({ 
              status: 'error', 
              message: '标签页管理器不可用',
              needsCallback: false
            });
          }
          
          const tabsData = await this.tabsManager.getTabs();
          res.json({
            ...tabsData,
            status: 'success',
            needsCallback: false
          });
        } catch (err) {
          Logger.error(`Failed to get tabs: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '无法获取标签页数据',
            needsCallback: false
          });
        }
      });
      
      // SSE 事件接口（支持 callback_result 推送）
      // 可选参数：?requestId=xxx 只接收指定 requestId 的回调结果
      apiRouter.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // 获取可选的 requestId 过滤参数
        const filterRequestId = req.query.requestId;
        
        res.write(':\n\n');
        
        const createEventHandler = (eventType) => {
          return (data) => {
            try {
              res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
            } catch (err) {
              Logger.error(`Error sending ${eventType} event: ${err.message}`);
            }
          };
        };
        
        // 创建 callback_result 事件处理器（支持 requestId 过滤）
        const createCallbackResultHandler = () => {
          return (data) => {
            try {
              // 如果设置了过滤，只发送匹配的 requestId
              if (filterRequestId && data.requestId !== filterRequestId) {
                return;
              }
              res.write(`event: callback_result\ndata: ${JSON.stringify(data)}\n\n`);
            } catch (err) {
              Logger.error(`Error sending callback_result event: ${err.message}`);
            }
          };
        };
        
        const eventTypes = [
          'tabs_update', 'tab_opened', 'tab_closed', 'tab_url_changed',
          'tab_html_received', 'script_executed', 'css_injected',
          'cookies_received', 'error', 'init', 'custom_event', 'request_timeout'
        ];
        
        const eventHandlers = {};
        
        eventTypes.forEach(type => {
          eventHandlers[type] = createEventHandler(type);
          this.on(type, eventHandlers[type]);
        });
        
        // 添加 callback_result 事件监听（支持过滤）
        eventHandlers['callback_result'] = createCallbackResultHandler();
        this.on('callback_result', eventHandlers['callback_result']);
        
        res.write(`event: connected\ndata: ${JSON.stringify({
          message: 'SSE连接已建立',
          filterRequestId: filterRequestId || null,
          timestamp: new Date().toISOString()
        })}\n\n`);
        
        const heartbeatInterval = setInterval(() => {
          res.write(':\n\n');
        }, 30000);
        
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          // 清理所有事件监听
          eventTypes.forEach(type => {
            if (eventHandlers[type]) {
              this.removeListener(type, eventHandlers[type]);
            }
          });
          if (eventHandlers['callback_result']) {
            this.removeListener('callback_result', eventHandlers['callback_result']);
          }
          Logger.info('SSE client disconnected');
        });
      });
      
      // 打开或更改标签页URL
      apiRouter.post('/open_url', async (req, res) => {
        const { url, tabId, requestId, callbackUrl, windowId } = req.body;
        
        if (!url) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'url'参数" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'open_url',
          url: url,
          tabId: tabId,
          windowId: windowId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 关闭标签页
      apiRouter.post('/close_tab', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'close_tab',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 获取标签页HTML
      apiRouter.post('/get_html', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'get_html',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 执行脚本
      apiRouter.post('/execute_script', async (req, res) => {
        const { tabId, code, requestId, callbackUrl } = req.body;
        
        if (!tabId || !code) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'或'code'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'execute_script',
          tabId: tabId,
          code: code,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 注入CSS
      apiRouter.post('/inject_css', async (req, res) => {
        const { tabId, css, requestId, callbackUrl } = req.body;
        
        if (!tabId || !css) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'或'css'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'inject_css',
          tabId: tabId,
          css: css,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 获取cookies
      apiRouter.post('/get_cookies', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'get_cookies',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        result.requestId = finalRequestId;
        res.json(result);
      });
      
      // 保存cookies
      apiRouter.post('/save_cookies', async (req, res) => {
        const { tabId, cookies, url } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: '缺少必需的参数: tabId',
            needsCallback: false
          });
        }
        
        if (!Array.isArray(cookies)) {
          return res.status(400).json({ 
            status: 'error', 
            message: '缺少必需的参数: cookies (必须是数组)',
            needsCallback: false
          });
        }
        
        try {
          if (!this.tabsManager) {
            return res.status(500).json({ 
              status: 'error', 
              message: '标签页管理器不可用',
              needsCallback: false
            });
          }
          
          const saveResult = await this.tabsManager.saveCookies(tabId, cookies);
          
          if (!saveResult) {
            return res.status(500).json({
              status: 'error',
              message: 'Cookie保存到数据库失败',
              needsCallback: false
            });
          }
          
          res.json({
            status: 'success',
            message: `成功保存 ${cookies.length} 个cookies`,
            needsCallback: false
          });
          
        } catch (error) {
          Logger.error(`Error saving cookies: ${error.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: error.message,
            needsCallback: false
          });
        }
      });

      // 获取所有cookies
      apiRouter.get('/cookies', async (req, res) => {
        const { domain, name, limit = 100, offset = 0 } = req.query;
        
        if (!this.database) {
          return res.status(500).json({ 
            status: 'error', 
            message: '数据库不可用',
            needsCallback: false
          });
        }
        
        try {
          let query = 'SELECT * FROM cookies';
          let params = [];
          const conditions = [];
          
          if (domain) {
            conditions.push('domain LIKE ?');
            params.push(`%${domain}%`);
          }
          
          if (name) {
            conditions.push('name LIKE ?');
            params.push(`%${name}%`);
          }
          
          if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
          }
          
          query += ' ORDER BY domain, name';
          query += ' LIMIT ? OFFSET ?';
          params.push(parseInt(limit), parseInt(offset));
          
          const cookies = await this.database.all(query, params);
          
          const formattedCookies = cookies.map(cookie => ({
            id: cookie.id,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.http_only),
            sameSite: cookie.same_site,
            expirationDate: cookie.expiration_date,
            session: Boolean(cookie.session),
            storeId: cookie.store_id,
            createdAt: cookie.created_at,
            updatedAt: cookie.updated_at
          }));
          
          res.json({
            status: 'success',
            cookies: formattedCookies,
            total: formattedCookies.length,
            pagination: { limit: parseInt(limit), offset: parseInt(offset) },
            needsCallback: false
          });
        } catch (err) {
          Logger.error(`Failed to get all cookies: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '获取cookies失败',
            needsCallback: false
          });
        }
      });
      
      // 获取回调响应（支持长轮询）
      // 可选参数：?wait=30 服务器最多等待 30 秒
      apiRouter.get('/callback_response/:requestId', async (req, res) => {
        const { requestId } = req.params;
        const waitParam = req.query.wait;
        
        if (!requestId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "缺少请求ID参数" 
          });
        }
        
        if (!this.callbackManager) {
          return res.status(500).json({ 
            status: 'error', 
            message: '回调管理器不可用' 
          });
        }
        
        // 获取客户端标识（使用 IP 或其他标识）
        const clientId = req.ip || req.connection.remoteAddress || 'unknown';
        
        // 检查回调查询限制
        if (this.rateLimiter) {
          const limitResult = this.rateLimiter.checkCallbackQueryLimit(clientId, requestId);
          if (!limitResult.allowed) {
            const retryAfter = limitResult.retryAfter || 5;
            res.set('Retry-After', retryAfter.toString());
            return res.status(429).json({
              status: 'error',
              code: 'RATE_LIMITED',
              message: limitResult.reason || '回调查询频率超限',
              limitType: limitResult.limitType,
              retryAfter,
              queryCount: this.rateLimiter.getRequestIdQueryCount(requestId)
            });
          }
          
          // 记录查询
          this.rateLimiter.recordCallbackQuery(clientId, requestId);
        }
        
        // 解析等待时间
        const longPollingConfig = this.config.longPolling || {};
        const maxWaitTime = longPollingConfig.maxWaitTime || 30000;
        const pollInterval = longPollingConfig.pollInterval || 100;
        let waitTime = 0;
        
        if (waitParam && longPollingConfig.enabled !== false) {
          waitTime = Math.min(parseInt(waitParam) * 1000 || 0, maxWaitTime);
        }
        
        try {
          // 首先检查是否已有响应
          let response = await this.callbackManager.getCallbackResponse(requestId);
          
          // 如果启用了长轮询且没有响应，进入等待循环
          if (!response && waitTime > 0) {
            const startTime = Date.now();
            
            // 监听 callback_result 事件以便提前返回
            let eventReceived = false;
            const callbackHandler = (data) => {
              if (data.requestId === requestId) {
                eventReceived = true;
              }
            };
            this.on('callback_result', callbackHandler);
            
            // 等待循环
            while (!response && (Date.now() - startTime) < waitTime && !eventReceived) {
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              response = await this.callbackManager.getCallbackResponse(requestId);
            }
            
            // 清理事件监听
            this.removeListener('callback_result', callbackHandler);
          }
          
          if (response) {
            // 如果响应已完成，清除 requestId 的查询计数
            if (this.rateLimiter && (response.status === 'success' || response.status === 'error' || response.type === 'timeout')) {
              this.rateLimiter.clearRequestIdCount(requestId);
            }
            res.json(response);
          } else {
            // 返回 202 表示请求仍在处理中
            res.status(202).json({ 
              status: 'pending', 
              message: '请求正在处理中',
              requestId,
              queryCount: this.rateLimiter ? this.rateLimiter.getRequestIdQueryCount(requestId) : undefined,
              longPolling: waitTime > 0 ? { waited: waitTime, maxWait: maxWaitTime } : undefined
            });
          }
        } catch (err) {
          Logger.error(`获取回调响应出错: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '获取回调响应失败' 
          });
        }
      });
      
      this.emit('routesSetup', { app });
      return app;
    }
    
    /**
     * 获取服务状态
     */
    getStatus() {
      return {
        isRunning: this.isRunning,
        config: browserControlServerConfig.getSummary(),
        connections: {
          extensionWebSocket: {
            enabled: this.config?.extensionWebSocket?.enabled || false,
            activeConnections: this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0,
            port: this.config?.extensionWebSocket?.port,
            baseUrl: this.config?.extensionWebSocket?.baseUrl
          },
        },
        security: {
          authEnabled: this.authManager ? true : false,
          auditEnabled: this.auditLogger ? true : false,
          rateLimitEnabled: this.rateLimiter ? true : false,
          activeSessions: this.authManager ? this.authManager.getActiveSessionCount() : 0
        },
        extensionWsPort: this.config?.extensionWebSocket?.port,
        activeExtensionConnections: this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0
      };
    }
    
    /**
     * 获取标签页管理器
     */
    getTabsManager() {
      return this.tabsManager;
    }
    
    /**
     * 获取 ExtensionWebSocketServer 实例
     */
    getExtensionWebSocketServer() {
      return this.extensionWebSocketServer;
    }
    
    /**
     * 获取数据库实例
     */
    getDatabase() {
      return this.database;
    }
    
    /**
     * 获取配置
     */
    getConfig() {
      return this.config;
    }
  }

  return new BrowserControlService();
}

// 导出模块
module.exports = { 
    setupBrowserControlService,
    ExtensionWebSocketServer
};
