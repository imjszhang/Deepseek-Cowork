/**
 * 浏览器扩展WebSocket服务器类
 * 
 * 负责与浏览器扩展的 WebSocket 通信
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const Logger = require('./logger');
const { browserEventEmitter } = require('./event-emitter');

/**
 * 浏览器扩展WebSocket服务器类
 */
class ExtensionWebSocketServer {
    constructor(database, options = {}) {
        this.host = options.host || process.env.WEBSOCKET_HOST || 'localhost';
        this.port = options.port || 8080;
        this.maxClients = options.maxClients || 1;
        this.database = database;
        this.tabsManager = null;
        this.callbackManager = null;
        this.eventEmitter = null;
        this.server = null;
        this.activeConnections = new Map();
        this.pendingResponses = new Map();  // Map<requestId, { socket, timeoutId, createdAt, operationType }>
        this.isShuttingDown = false;  // 关闭标志，防止关闭过程中写入数据库
        this.securityConfig = null;   // 安全配置
        
        // 请求超时配置
        this.requestTimeout = options.requestTimeout || 60000;  // 默认 60 秒超时
        this.pendingCleanupInterval = null;
        this.pendingCleanupIntervalMs = options.pendingCleanupInterval || 30000;  // 30秒清理一次
        
        // 安全模块
        this.authManager = null;      // 认证管理器
        this.auditLogger = null;      // 审计日志
        this.rateLimiter = null;      // 速率限制器
        
        // 认证相关
        this.pendingAuth = new Map(); // 等待认证的连接：Map<socketId, { socket, request, challenge, timeout }>
        this.authenticatedSockets = new Map(); // 已认证的连接：Map<socketId, { sessionId, clientId, clientType }>
        
        // 请求去重：Map<dedupeKey, { requestId, createdAt }>
        // dedupeKey 格式: "operationType:param1:param2"
        this.activeRequests = new Map();
        this.dedupeWindowMs = options.dedupeWindowMs || 5000;  // 5秒内的重复请求会被去重
        
        // 心跳机制配置
        this.heartbeatInterval = options.heartbeatInterval || 30000;  // 心跳检查间隔，默认 30 秒
        this.heartbeatTimeout = options.heartbeatTimeout || 60000;    // 心跳超时时间，默认 60 秒
        this.heartbeatTimer = null;  // 心跳定时器
        
        // 连接活动追踪超时时间（用于清理长时间不活跃的连接）
        this.connectionIdleTimeout = options.connectionIdleTimeout || 300000;  // 默认 5 分钟
        
        // Round-Robin 索引，用于定向发送消息给单个扩展（而非广播）
        this._extensionRoundRobinIndex = 0;
        
        // 已通过 WS 定向推送的 requestId 集合（防止 pushResponseToWaitingClient 重复广播）
        this._resolvedViaWS = new Set();
    }

    /**
     * 生成去重 key
     * @param {string} operationType 操作类型
     * @param {Object} params 参数
     * @returns {string} 去重 key
     */
    generateDedupeKey(operationType, params) {
        switch (operationType) {
            case 'open_url':
                // URL + tabId 组合去重
                return `open_url:${params.url}:${params.tabId || 'new'}`;
            case 'close_tab':
                return `close_tab:${params.tabId}`;
            case 'execute_script':
                // tabId + 代码哈希去重
                const codeHash = this.simpleHash(params.code || '');
                return `execute_script:${params.tabId}:${codeHash}`;
            case 'get_html':
                return `get_html:${params.tabId}`;
            case 'get_cookies':
                return `get_cookies:${params.tabId}`;
            default:
                return null;  // 不支持去重的操作
        }
    }

    /**
     * 简单字符串哈希
     * @param {string} str 字符串
     * @returns {string} 哈希值
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;  // Convert to 32bit integer
        }
        return hash.toString(16);
    }

    /**
     * 检查是否为重复请求
     * @param {string} operationType 操作类型
     * @param {Object} params 参数
     * @returns {Object} { isDuplicate: boolean, existingRequestId?: string }
     */
    checkDuplicateRequest(operationType, params) {
        const dedupeKey = this.generateDedupeKey(operationType, params);
        
        if (!dedupeKey) {
            return { isDuplicate: false };
        }
        
        const existing = this.activeRequests.get(dedupeKey);
        
        if (existing) {
            const elapsed = Date.now() - existing.createdAt;
            
            // 如果在去重窗口内
            if (elapsed < this.dedupeWindowMs) {
                Logger.info(`[Dedup] Duplicate request detected: ${dedupeKey} (existing: ${existing.requestId})`);
                return {
                    isDuplicate: true,
                    existingRequestId: existing.requestId,
                    elapsed
                };
            }
            
            // 过期了，删除旧记录
            this.activeRequests.delete(dedupeKey);
        }
        
        return { isDuplicate: false };
    }

    /**
     * 注册活动请求（用于去重）
     * @param {string} operationType 操作类型
     * @param {Object} params 参数
     * @param {string} requestId 请求 ID
     */
    registerActiveRequest(operationType, params, requestId) {
        const dedupeKey = this.generateDedupeKey(operationType, params);
        
        if (dedupeKey) {
            this.activeRequests.set(dedupeKey, {
                requestId,
                createdAt: Date.now(),
                operationType
            });
        }
    }

    /**
     * 清除活动请求（请求完成后调用）
     * @param {string} operationType 操作类型
     * @param {Object} params 参数
     */
    clearActiveRequest(operationType, params) {
        const dedupeKey = this.generateDedupeKey(operationType, params);
        
        if (dedupeKey) {
            this.activeRequests.delete(dedupeKey);
        }
    }

    /**
     * 清理过期的活动请求记录
     */
    cleanupActiveRequests() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, info] of this.activeRequests) {
            if (now - info.createdAt > this.dedupeWindowMs * 2) {
                this.activeRequests.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            Logger.debug(`[Dedup] Cleaned ${cleanedCount} expired active requests`);
        }
        
        return cleanedCount;
    }

    /**
     * 设置请求超时时间
     * @param {number} timeout 超时时间（毫秒）
     */
    setRequestTimeout(timeout) {
        this.requestTimeout = timeout;
        Logger.info(`Request timeout set to ${timeout}ms`);
    }

    /**
     * 设置标签页管理器
     * @param {Object} tabsManager 标签页管理器
     */
    setTabsManager(tabsManager) {
        this.tabsManager = tabsManager;
    }

    /**
     * 设置回调管理器
     * @param {Object} callbackManager 回调管理器
     */
    setCallbackManager(callbackManager) {
        this.callbackManager = callbackManager;
    }

    /**
     * 设置事件发射器
     * @param {EventEmitter} eventEmitter 事件发射器
     */
    setEventEmitter(eventEmitter) {
        this.eventEmitter = eventEmitter;
    }

    /**
     * 设置安全配置
     * @param {Object} securityConfig 安全配置对象
     */
    setSecurityConfig(securityConfig) {
        this.securityConfig = securityConfig;
        Logger.info('Security config set for WebSocket server');
    }

    /**
     * 设置认证管理器
     * @param {Object} authManager 认证管理器
     */
    setAuthManager(authManager) {
        this.authManager = authManager;
        Logger.info('AuthManager set for WebSocket server');
    }

    /**
     * 设置审计日志
     * @param {Object} auditLogger 审计日志
     */
    setAuditLogger(auditLogger) {
        this.auditLogger = auditLogger;
        Logger.info('AuditLogger set for WebSocket server');
    }

    /**
     * 设置速率限制器
     * @param {Object} rateLimiter 速率限制器
     */
    setRateLimiter(rateLimiter) {
        this.rateLimiter = rateLimiter;
        Logger.info('RateLimiter set for WebSocket server');
    }

    /**
     * 检查认证是否启用
     * @returns {boolean} 是否启用认证
     */
    isAuthEnabled() {
        return this.authManager && this.securityConfig?.auth?.enabled !== false;
    }

    /**
     * 验证 Origin 是否在白名单中
     * @param {string} origin - 请求的 Origin
     * @returns {boolean} - 是否允许
     */
    validateOrigin(origin) {
        const config = this.securityConfig || {};
        
        // 如果未启用严格检查，允许所有连接
        if (config.strictOriginCheck === false) {
            return true;
        }
        
        const allowedOrigins = config.allowedOrigins || [
            'moz-extension://*',
            'chrome-extension://*',
            'http://localhost:*',
            'http://127.0.0.1:*',
            'https://localhost:*',
            'https://127.0.0.1:*'
        ];
        
        // 处理空 Origin（非浏览器客户端，如 Node.js 脚本）
        if (!origin || origin === 'null' || origin === 'undefined') {
            const allowNull = config.allowNullOrigin !== false;
            if (allowNull) {
                Logger.debug(`Allowing null/undefined origin (non-browser client)`);
            }
            return allowNull;
        }
        
        // 检查白名单
        const isAllowed = allowedOrigins.some(pattern => {
            if (pattern.includes('*')) {
                // 将通配符模式转换为正则表达式
                // 需要转义特殊字符，然后将 * 替换为 .*
                const escapedPattern = pattern
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符（除了 *）
                    .replace(/\*/g, '.*');  // 将 * 替换为 .*
                const regex = new RegExp('^' + escapedPattern + '$');
                return regex.test(origin);
            }
            return origin === pattern;
        });
        
        if (isAllowed) {
            Logger.debug(`Origin validated: ${origin}`);
        }
        
        return isAllowed;
    }

    /**
     * 记录被拒绝的连接
     * @param {Object} request - HTTP 请求对象
     * @param {string} reason - 拒绝原因
     */
    logRejectedConnection(request, reason) {
        const config = this.securityConfig?.securityLogging || {};
        
        if (config.logRejectedConnections === false) {
            return;
        }
        
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        const origin = request.headers.origin || 'null';
        const userAgent = request.headers['user-agent'] || 'unknown';
        const timestamp = new Date().toISOString();
        
        Logger.warn(`[SECURITY] WebSocket connection rejected: ${reason}`);
        Logger.warn(`  - Timestamp: ${timestamp}`);
        Logger.warn(`  - Origin: ${origin}`);
        Logger.warn(`  - Client Address: ${clientAddress}`);
        Logger.warn(`  - User-Agent: ${userAgent}`);
    }

    /**
     * 启动WebSocket服务器
     */
    start() {
        this.server = new WebSocket.Server({
            host: this.host,
            port: this.port
        });

        Logger.info(`Extension WebSocket server starting on ws://${this.host}:${this.port}`);

        this.server.on('connection', async (socket, request) => {
            await this.handleConnection(socket, request);
        });

        this.server.on('error', (error) => {
            Logger.error(`Extension WebSocket server error: ${error.message}`);
        });

        // 定期清理断开的连接
        setInterval(() => this.cleanupDisconnectedClients(), 30000);
        
        // 定期清理超时的 pendingResponses
        this.pendingCleanupInterval = setInterval(() => {
            this.cleanupPendingResponses();
        }, this.pendingCleanupIntervalMs);
        
        Logger.info(`PendingResponses cleanup started (interval: ${this.pendingCleanupIntervalMs}ms)`);
        
        // 启动心跳机制
        this.startHeartbeat();
        Logger.info(`Heartbeat started (interval: ${this.heartbeatInterval}ms, timeout: ${this.heartbeatTimeout}ms)`);
    }

    /**
     * 清理超时的 pendingResponses
     * @returns {number} 清理数量
     */
    cleanupPendingResponses() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [requestId, info] of this.pendingResponses) {
            const elapsed = now - info.createdAt;
            
            // 如果超过 2 倍超时时间还在 pending，说明有问题，强制清理
            if (elapsed > this.requestTimeout * 2) {
                // 清除超时定时器
                if (info.timeoutId) {
                    clearTimeout(info.timeoutId);
                }
                
                this.pendingResponses.delete(requestId);
                cleanedCount++;
                
                Logger.warn(`Force cleaned stale pendingResponse: ${requestId} (age: ${elapsed}ms)`);
            }
        }
        
        // 同时清理 activeRequests
        const activeCleanedCount = this.cleanupActiveRequests();
        
        if (cleanedCount > 0) {
            Logger.info(`Cleaned ${cleanedCount} stale pendingResponses, ${activeCleanedCount} active requests`);
        }
        
        return cleanedCount;
    }

    /**
     * 启动心跳机制
     * 定期向所有活跃连接发送 ping，检测死连接
     */
    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        this.heartbeatTimer = setInterval(() => {
            this.checkHeartbeat();
            this.checkSessionExpiry();
        }, this.heartbeatInterval);
    }

    /**
     * 检查并通知即将过期的会话
     * 在会话过期前 5 分钟发送警告，过期后发送强制重认证通知
     */
    checkSessionExpiry() {
        if (!this.isAuthEnabled() || !this.authManager) {
            return;
        }
        
        const now = Date.now();
        const SESSION_EXPIRY_WARNING_MS = 300000;  // 5 分钟前发出警告
        
        for (const [clientId, connInfo] of this.activeConnections.entries()) {
            if (!connInfo.sessionId) continue;
            
            const session = this.authManager.getSessionInfo(connInfo.sessionId);
            const socket = connInfo.socket || connInfo;
            
            if (!session) {
                // 会话已过期或不存在，通知客户端需要重新认证
                if (socket.readyState === WebSocket.OPEN && !connInfo._sessionExpiredNotified) {
                    connInfo._sessionExpiredNotified = true;
                    try {
                        socket.send(JSON.stringify({
                            type: 'session_expired',
                            reason: 'Session expired or invalidated',
                            action: 'reconnect',
                            timestamp: new Date().toISOString()
                        }));
                        Logger.info(`[Auth] Session expired notification sent to ${clientId}`);
                    } catch (err) {
                        Logger.error(`[Auth] Failed to send session_expired to ${clientId}: ${err.message}`);
                    }
                    
                    // 给客户端 5 秒时间处理，然后关闭连接
                    setTimeout(() => {
                        try {
                            if (socket.readyState === WebSocket.OPEN) {
                                socket.close(4001, 'Session expired');
                            }
                        } catch (err) {
                            // ignore
                        }
                    }, 5000);
                }
                continue;
            }
            
            // 检查是否即将过期
            const timeToExpiry = session.expiresAt.getTime() - now;
            if (timeToExpiry <= SESSION_EXPIRY_WARNING_MS && timeToExpiry > 0 && !connInfo._sessionExpiryWarned) {
                connInfo._sessionExpiryWarned = true;
                
                if (socket.readyState === WebSocket.OPEN) {
                    try {
                        socket.send(JSON.stringify({
                            type: 'session_expiring',
                            expiresIn: Math.floor(timeToExpiry / 1000),
                            action: 'reconnect_soon',
                            timestamp: new Date().toISOString()
                        }));
                        Logger.info(`[Auth] Session expiry warning sent to ${clientId} (expires in ${Math.floor(timeToExpiry / 1000)}s)`);
                    } catch (err) {
                        Logger.error(`[Auth] Failed to send session_expiring to ${clientId}: ${err.message}`);
                    }
                }
            }
        }
    }

    /**
     * 停止心跳机制
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * 执行心跳检查
     * 向所有连接发送 ping，关闭超时未响应的连接
     */
    checkHeartbeat() {
        if (this.isShuttingDown) {
            return;
        }
        
        const now = Date.now();
        let pingCount = 0;
        let closedCount = 0;
        
        for (const [clientId, connInfo] of this.activeConnections.entries()) {
            const socket = connInfo.socket || connInfo;  // 兼容旧格式（直接存 socket）和新格式（存对象）
            
            if (socket.readyState !== WebSocket.OPEN) {
                continue;
            }
            
            // 检查是否超时未收到 pong
            const lastPong = connInfo.lastPong || connInfo.createdAt || now;
            const timeSinceLastPong = now - lastPong;
            
            if (timeSinceLastPong > this.heartbeatTimeout) {
                // 连接超时，关闭它
                Logger.warn(`[Heartbeat] Connection ${clientId} timed out (no pong for ${timeSinceLastPong}ms), closing...`);
                try {
                    socket.close(1001, 'Heartbeat timeout');
                } catch (err) {
                    Logger.error(`[Heartbeat] Error closing connection ${clientId}: ${err.message}`);
                }
                closedCount++;
                continue;
            }
            
            // 发送 ping
            try {
                socket.ping();
                pingCount++;
            } catch (err) {
                Logger.error(`[Heartbeat] Error sending ping to ${clientId}: ${err.message}`);
            }
        }
        
        if (pingCount > 0 || closedCount > 0) {
            Logger.debug(`[Heartbeat] Sent ${pingCount} pings, closed ${closedCount} timed out connections`);
        }
    }

    /**
     * 注册 pending response 并设置超时
     * @param {string} requestId 请求 ID
     * @param {WebSocket} socket WebSocket 连接
     * @param {string} operationType 操作类型
     * @param {number} customTimeout 自定义超时时间（可选）
     */
    registerPendingResponse(requestId, socket, operationType, customTimeout = null) {
        const timeout = customTimeout || this.requestTimeout;
        
        const timeoutId = setTimeout(() => {
            this.handleRequestTimeout(requestId, operationType);
        }, timeout);
        
        this.pendingResponses.set(requestId, {
            socket,
            timeoutId,
            createdAt: Date.now(),
            operationType,
            timeout
        });
        
        Logger.debug(`Registered pending response: ${requestId} (op: ${operationType}, timeout: ${timeout}ms)`);
    }

    /**
     * 清除 pending response（请求完成或失败时调用）
     * @param {string} requestId 请求 ID
     */
    clearPendingResponse(requestId) {
        const info = this.pendingResponses.get(requestId);
        if (info) {
            if (info.timeoutId) {
                clearTimeout(info.timeoutId);
            }
            this.pendingResponses.delete(requestId);
            Logger.debug(`Cleared pending response: ${requestId}`);
        }
    }

    /**
     * 解决 pending response：向发起请求的 automation 客户端回传结果并清理
     * 用于 extension *_complete 消息处理，将回调结果通过 WS 直接回传给 automation 客户端
     * @param {string} requestId 请求 ID
     * @param {Object} responseData 回调结果数据
     */
    resolvePendingResponse(requestId, responseData) {
        const info = this.pendingResponses.get(requestId);
        if (info) {
            let pushed = false;
            // 向发起请求的 automation 客户端 WS 回传结果
            if (info.socket && info.socket.readyState === WebSocket.OPEN) {
                const operationType = info.operationType || 'unknown';
                this.sendToAutomationClient(info.socket, {
                    type: `${operationType}_response`,
                    requestId,
                    ...responseData
                });
                pushed = true;
                // 标记为已通过 WS 推送，防止 pushResponseToWaitingClient 重复广播
                this._resolvedViaWS.add(requestId);
                Logger.debug(`Resolved pending response via WS: ${requestId} (op: ${operationType})`);
            }
            // 清理
            if (info.timeoutId) {
                clearTimeout(info.timeoutId);
            }
            this.pendingResponses.delete(requestId);
            return pushed;
        }
        return false;
    }

    /**
     * 处理请求超时
     * @param {string} requestId 请求 ID
     * @param {string} operationType 操作类型
     */
    async handleRequestTimeout(requestId, operationType) {
        const info = this.pendingResponses.get(requestId);
        if (!info) {
            return;  // 已经被处理过了
        }
        
        Logger.warn(`Request timeout: ${requestId} (operation: ${operationType}, waited: ${info.timeout}ms)`);
        
        // 清理 pending response
        this.pendingResponses.delete(requestId);
        
        // 通知 CallbackManager 写入超时响应
        if (this.callbackManager) {
            await this.callbackManager.postToCallback(requestId, {
                status: 'error',
                type: `${operationType}_timeout`,
                requestId,
                message: `Request timed out after ${info.timeout}ms`,
                operationType,
                timestamp: new Date().toISOString()
            });
        }
        
        // 向等待的客户端发送超时响应
        if (info.socket && info.socket.readyState === WebSocket.OPEN) {
            this.sendToAutomationClient(info.socket, {
                type: `${operationType}_response`,
                requestId,
                status: 'error',
                message: `Request timed out after ${info.timeout}ms`
            });
        }
    }

    /**
     * 获取 pending responses 统计
     * @returns {Object} 统计信息
     */
    getPendingStats() {
        const stats = {
            total: this.pendingResponses.size,
            byType: {}
        };
        
        for (const [, info] of this.pendingResponses) {
            const type = info.operationType || 'unknown';
            stats.byType[type] = (stats.byType[type] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * 处理新的WebSocket连接
     * @param {WebSocket} socket WebSocket连接
     * @param {Object} request HTTP请求
     */
    async handleConnection(socket, request) {
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        
        try {
            // 安全检查：验证 Origin
            const origin = request.headers.origin;
            if (!this.validateOrigin(origin)) {
                this.logRejectedConnection(request, 'Origin not allowed');
                if (this.auditLogger) {
                    await this.auditLogger.logConnection('rejected', clientAddress, { reason: 'Origin not allowed', origin });
                }
                socket.close(1008, 'Origin not allowed');
                return;
            }
            
            // 检查是否被速率限制锁定
            if (this.rateLimiter) {
                const lockStatus = this.rateLimiter.isLocked(clientAddress);
                if (lockStatus.locked) {
                    Logger.warn(`[Auth] Connection rejected - client locked: ${clientAddress}`);
                    if (this.auditLogger) {
                        await this.auditLogger.logConnection('rejected', clientAddress, { reason: 'Client locked', unlockAt: lockStatus.unlockAt });
                    }
                    socket.close(1008, `Too many failed attempts. Retry after ${lockStatus.retryAfter} seconds`);
                    return;
                }
            }
            
            await this.cleanupDisconnectedClients();

            // 检查连接类型 - 通过URL参数或header区分
            const url = new URL(request.url, `ws://${request.headers.host}`);
            const clientType = url.searchParams.get('type') || 'extension';
            
            // 如果启用认证，进入认证流程
            if (this.isAuthEnabled()) {
                await this.initiateAuthHandshake(socket, request, clientType, clientAddress);
            } else {
                // 未启用认证，直接处理连接（向后兼容）
                if (clientType === 'automation') {
                    await this.handleAutomationClient(socket, request, null);
                } else {
                    await this.handleExtensionClient(socket, request, null);
                }
            }
        } catch (err) {
            Logger.error(`Error handling WebSocket connection: ${err.message}`);
            if (this.auditLogger) {
                await this.auditLogger.logConnection('error', clientAddress, { error: err.message });
            }
        }
    }

    /**
     * 发起认证握手
     * @param {WebSocket} socket WebSocket连接
     * @param {Object} request HTTP请求
     * @param {string} clientType 客户端类型
     * @param {string} clientAddress 客户端地址
     */
    async initiateAuthHandshake(socket, request, clientType, clientAddress) {
        const socketId = uuidv4();
        
        // 生成 challenge
        const { challenge, expiresAt } = this.authManager.generateChallenge();
        
        // 存储待认证连接
        const authTimeout = setTimeout(() => {
            // 认证超时
            const pending = this.pendingAuth.get(socketId);
            if (pending) {
                Logger.warn(`[Auth] Authentication timeout for ${clientAddress}`);
                if (this.auditLogger) {
                    this.auditLogger.logAuthFailure('Authentication timeout', clientAddress);
                }
                pending.socket.close(1008, 'Authentication timeout');
                this.pendingAuth.delete(socketId);
            }
        }, (this.securityConfig?.auth?.challengeTimeout || 30) * 1000);
        
        this.pendingAuth.set(socketId, {
            socket,
            request,
            challenge,
            clientType,
            clientAddress,
            timeout: authTimeout,
            createdAt: new Date()
        });
        
        // 添加 socket 属性用于识别
        socket._authSocketId = socketId;
        
        // 定义认证阶段的事件处理器（保存引用以便精确移除）
        const authMessageHandler = async (message) => {
            const pending = this.pendingAuth.get(socketId);
            if (pending) {
                // 仍在认证阶段
                await this.handleAuthMessage(socketId, message);
            }
        };
        
        const authCloseHandler = () => {
            const pending = this.pendingAuth.get(socketId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingAuth.delete(socketId);
            }
        };
        
        const authErrorHandler = (error) => {
            Logger.error(`[Auth] Socket error during auth: ${error.message}`);
            const pending = this.pendingAuth.get(socketId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingAuth.delete(socketId);
            }
        };
        
        // 保存处理器引用到 pendingAuth 和 socket 上，以便认证完成后精确移除
        const pendingEntry = this.pendingAuth.get(socketId);
        pendingEntry._authHandlers = {
            message: authMessageHandler,
            close: authCloseHandler,
            error: authErrorHandler
        };
        
        // 监听认证响应
        socket.on('message', authMessageHandler);
        socket.on('close', authCloseHandler);
        socket.on('error', authErrorHandler);
        
        // 发送 auth_challenge
        socket.send(JSON.stringify({
            type: 'auth_challenge',
            challenge,
            timestamp: new Date().toISOString(),
            serverVersion: '1.0.0'
        }));
        
        Logger.info(`[Auth] Challenge sent to ${clientAddress}`);
    }

    /**
     * 处理认证阶段的消息
     * @param {string} socketId Socket标识
     * @param {string} message 消息内容
     */
    async handleAuthMessage(socketId, message) {
        const pending = this.pendingAuth.get(socketId);
        if (!pending) {
            return;
        }
        
        const { socket, request, challenge, clientType, clientAddress, timeout } = pending;
        
        try {
            const data = JSON.parse(message);
            
            if (data.type !== 'auth_response') {
                // 忽略非认证响应消息
                Logger.debug(`[Auth] Ignoring non-auth message during handshake: ${data.type}`);
                return;
            }
            
            // 清除超时定时器
            clearTimeout(timeout);
            
            // 验证响应
            const result = this.authManager.verifyResponse(challenge, data.response, clientAddress);
            
            if (!result.valid) {
                // 认证失败
                Logger.warn(`[Auth] Authentication failed for ${clientAddress}: ${result.reason}`);
                
                if (this.rateLimiter) {
                    this.rateLimiter.recordAuthFailure(clientAddress);
                }
                
                if (this.auditLogger) {
                    await this.auditLogger.logAuthFailure(result.reason, clientAddress, {
                        clientType,
                        clientId: data.clientId
                    });
                }
                
                // 发送失败响应
                socket.send(JSON.stringify({
                    type: 'auth_result',
                    success: false,
                    error: result.reason,
                    retryAfter: 5
                }));
                
                // 关闭连接
                setTimeout(() => socket.close(1008, 'Authentication failed'), 100);
                this.pendingAuth.delete(socketId);
                return;
            }
            
            // 认证成功，创建会话
            const clientId = data.clientId || uuidv4();
            const session = this.authManager.createSession(clientId, clientType);
            
            // 记录认证成功
            if (this.auditLogger) {
                await this.auditLogger.logAuthSuccess(session.sessionId, clientId, clientType, clientAddress);
            }
            
            // 存储已认证的连接信息
            this.authenticatedSockets.set(socketId, {
                sessionId: session.sessionId,
                clientId,
                clientType,
                clientAddress
            });
            
            // 发送成功响应
            socket.send(JSON.stringify({
                type: 'auth_result',
                success: true,
                sessionId: session.sessionId,
                expiresIn: this.securityConfig?.auth?.sessionTTL || 3600,
                permissions: session.permissions
            }));
            
            Logger.info(`[Auth] Authentication successful for ${clientType}:${clientId} from ${clientAddress}`);
            
            // 精确移除认证阶段的事件处理器（而非 removeAllListeners），
            // 避免破坏 ws 库内部可能的事件处理链
            const authHandlers = pending._authHandlers;
            if (authHandlers) {
                socket.removeListener('message', authHandlers.message);
                socket.removeListener('close', authHandlers.close);
                socket.removeListener('error', authHandlers.error);
            }
            
            // 清理待认证状态
            this.pendingAuth.delete(socketId);
            
            // 继续正常的连接处理
            if (clientType === 'automation') {
                await this.handleAutomationClient(socket, request, session.sessionId);
            } else {
                await this.handleExtensionClient(socket, request, session.sessionId);
            }
            
        } catch (err) {
            Logger.error(`[Auth] Error processing auth message: ${err.message}`);
            clearTimeout(timeout);
            this.pendingAuth.delete(socketId);
            socket.close(1008, 'Invalid authentication message');
        }
    }

    /**
     * 验证请求中的 sessionId
     * @param {string} sessionId 会话ID
     * @returns {Object|null} 会话信息或 null
     */
    validateRequestSession(sessionId) {
        if (!this.isAuthEnabled()) {
            return { valid: true }; // 未启用认证时直接通过
        }
        
        if (!sessionId) {
            return null;
        }
        
        return this.authManager.validateSession(sessionId);
    }

    /**
     * 获取 socket 的认证信息
     * @param {string} clientId 客户端ID
     * @returns {Object|null} 认证信息
     */
    getSocketAuthInfo(clientId) {
        for (const [socketId, authInfo] of this.authenticatedSockets) {
            if (authInfo.clientId === clientId) {
                return authInfo;
            }
        }
        return null;
    }

    /**
     * 处理浏览器扩展客户端连接
     * @param {WebSocket} socket WebSocket连接
     * @param {Object} request HTTP请求
     * @param {string|null} sessionId 会话ID（认证后传入）
     */
    async handleExtensionClient(socket, request, sessionId) {
        // 检查扩展客户端连接数限制
        if (this.activeConnections.size >= this.maxClients) {
            // 达到上限时，先尝试清理一轮死连接
            Logger.info('Connection limit reached, attempting cleanup before rejecting...');
            await this.cleanupDisconnectedClients();
            
            // 清理后再检查
            if (this.activeConnections.size >= this.maxClients) {
                Logger.warning('Maximum extension client connections reached after cleanup.');
                socket.close(1013, 'Maximum extension client connections reached.');
                return;
            }
        }

        const clientId = uuidv4();
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        const now = Date.now();
        
        Logger.info(`Browser extension connected: ${clientAddress} (ID: ${clientId})${sessionId ? ' [authenticated]' : ''}`);
        
        // 存储连接信息（包含元数据）
        const connectionInfo = {
            socket,
            clientId,
            clientAddress,
            clientType: 'extension',
            sessionId,
            createdAt: now,
            lastActivity: now,
            lastPong: now,  // 初始化为当前时间
            messageCount: 0
        };
        this.activeConnections.set(clientId, connectionInfo);
        
        // 存储 socket 的 sessionId 关联
        socket._sessionId = sessionId;
        socket._clientId = clientId;

        // 【重要】先注册所有事件处理器，再执行异步操作（如 DB 写入）
        // 避免认证成功后到处理器注册之间的事件丢失窗口

        // 监听 pong 响应（用于心跳检测）
        socket.on('pong', () => {
            const connInfo = this.activeConnections.get(clientId);
            if (connInfo) {
                connInfo.lastPong = Date.now();
                connInfo.lastActivity = Date.now();
            }
        });

        socket.on('message', async (message) => {
            // 更新最后活动时间
            const connInfo = this.activeConnections.get(clientId);
            if (connInfo) {
                connInfo.lastActivity = Date.now();
                connInfo.messageCount++;
            }
            await this.handleMessage(message, clientId, sessionId);
        });

        socket.on('close', async (code, reason) => {
            const connInfo = this.activeConnections.get(clientId);
            const aliveMs = connInfo ? Date.now() - connInfo.createdAt : 0;
            const msgCount = connInfo ? connInfo.messageCount : 0;
            const reasonStr = reason ? reason.toString() : '';
            Logger.info(`Browser extension disconnected: ${clientAddress} (ID: ${clientId}), code=${code}, reason=${reasonStr}, alive=${aliveMs}ms, messages=${msgCount}`);
            
            // 先同步删除内存中的状态，再执行异步 DB 操作
            this.activeConnections.delete(clientId);
            this.cleanupAuthenticatedSocket(clientId);
            
            await this.updateClientDisconnected(clientId);
            
            // 记录会话结束
            if (sessionId && this.auditLogger) {
                const session = this.authManager?.getSessionInfo(sessionId);
                if (session) {
                    const duration = Math.floor((Date.now() - session.createdAt.getTime()) / 1000);
                    await this.auditLogger.logSessionEnd(sessionId, duration, 'disconnected');
                }
            }
        });

        socket.on('error', async (error) => {
            const connInfo = this.activeConnections.get(clientId);
            const aliveMs = connInfo ? Date.now() - connInfo.createdAt : 0;
            Logger.error(`Browser extension error for ${clientId}: ${error.message}, alive=${aliveMs}ms`);
            
            // 先同步删除内存中的状态，再执行异步 DB 操作
            this.activeConnections.delete(clientId);
            this.cleanupAuthenticatedSocket(clientId);
            
            await this.updateClientDisconnected(clientId);
        });

        // 异步操作放在事件处理器注册之后，确保不会丢失事件
        await this.storeClient(clientId, clientAddress, 'extension');
    }

    /**
     * 处理automation客户端连接
     * @param {WebSocket} socket WebSocket连接
     * @param {Object} request HTTP请求
     * @param {string|null} sessionId 会话ID（认证后传入）
     */
    async handleAutomationClient(socket, request, sessionId) {
        const clientId = uuidv4();
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        const now = Date.now();
        
        Logger.info(`Automation client connected: ${clientAddress} (ID: ${clientId})${sessionId ? ' [authenticated]' : ''}`);
        
        // 存储连接信息（包含元数据）
        const connectionInfo = {
            socket,
            clientId,
            clientAddress,
            clientType: 'automation',
            sessionId,
            createdAt: now,
            lastActivity: now,
            lastPong: now,  // 初始化为当前时间
            messageCount: 0
        };
        this.activeConnections.set(clientId, connectionInfo);
        
        // 存储 socket 的 sessionId 关联
        socket._sessionId = sessionId;
        socket._clientId = clientId;

        // 【重要】先注册所有事件处理器，再执行异步操作
        
        // 监听 pong 响应（用于心跳检测）
        socket.on('pong', () => {
            const connInfo = this.activeConnections.get(clientId);
            if (connInfo) {
                connInfo.lastPong = Date.now();
                connInfo.lastActivity = Date.now();
            }
        });

        socket.on('message', async (message) => {
            // 更新最后活动时间
            const connInfo = this.activeConnections.get(clientId);
            if (connInfo) {
                connInfo.lastActivity = Date.now();
                connInfo.messageCount++;
            }
            await this.handleAutomationMessage(message, clientId, socket, sessionId);
        });

        socket.on('close', async () => {
            Logger.info(`Automation client disconnected: ${clientAddress} (ID: ${clientId})`);
            
            // 先同步删除内存中的状态，再执行异步 DB 操作
            this.activeConnections.delete(clientId);
            this.cleanupAuthenticatedSocket(clientId);
            
            await this.updateClientDisconnected(clientId);
            
            // 记录会话结束
            if (sessionId && this.auditLogger) {
                const session = this.authManager?.getSessionInfo(sessionId);
                if (session) {
                    const duration = Math.floor((Date.now() - session.createdAt.getTime()) / 1000);
                    await this.auditLogger.logSessionEnd(sessionId, duration, 'disconnected');
                }
            }
        });

        socket.on('error', async (error) => {
            Logger.error(`Automation client error for ${clientId}: ${error.message}`);
            
            // 先同步删除内存中的状态，再执行异步 DB 操作
            this.activeConnections.delete(clientId);
            this.cleanupAuthenticatedSocket(clientId);
            
            await this.updateClientDisconnected(clientId);
        });

        // 异步操作放在事件处理器注册之后
        await this.storeClient(clientId, clientAddress, 'automation_client');

        // 发送欢迎消息
        this.sendToAutomationClient(socket, {
            type: 'connection_established',
            clientId: clientId,
            sessionId: sessionId,
            authenticated: !!sessionId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理automation客户端消息
     */
    /**
     * 处理automation客户端消息
     * @param {string} message 消息内容
     * @param {string} clientId 客户端ID
     * @param {WebSocket} socket WebSocket连接
     * @param {string|null} sessionId 会话ID
     */
    async handleAutomationMessage(message, clientId, socket, sessionId = null) {
        const startTime = Date.now();
        
        try {
            const data = JSON.parse(message);
            const { type, requestId } = data;
            
            // 支持新的消息格式（带 sessionId 和 action）
            const action = data.action || type;
            const messageSessionId = data.sessionId || sessionId;

            Logger.info(`Received automation message: ${action} from ${clientId}`);
            
            // 验证会话（如果启用认证）
            if (this.isAuthEnabled()) {
                const session = this.validateRequestSession(messageSessionId);
                if (!session) {
                    this.sendToAutomationClient(socket, {
                        type: 'error',
                        requestId,
                        code: 'AUTH_REQUIRED',
                        message: 'Authentication required or session expired'
                    });
                    return;
                }
            }
            
            // 检查速率限制
            if (this.rateLimiter) {
                const limitResult = this.rateLimiter.checkLimit(clientId, action);
                if (!limitResult.allowed) {
                    if (this.auditLogger) {
                        await this.auditLogger.logRateLimited(clientId, limitResult.limitType, socket._clientAddress);
                    }
                    this.sendToAutomationClient(socket, {
                        type: 'error',
                        requestId,
                        code: 'RATE_LIMITED',
                        message: `Rate limit exceeded. Retry after ${limitResult.retryAfter} seconds`,
                        retryAfter: limitResult.retryAfter
                    });
                    return;
                }
                // 记录请求
                this.rateLimiter.recordRequest(clientId, action);
            }

            switch (action) {
                case 'get_tabs':
                    await this.handleGetTabsRequest(data, socket);
                    break;
                case 'open_url':
                    await this.handleOpenUrlRequest(data, socket);
                    break;
                case 'close_tab':
                    await this.handleCloseTabRequest(data, socket);
                    break;
                case 'get_html':
                    await this.handleGetHtmlRequest(data, socket);
                    break;
                case 'execute_script':
                    await this.handleExecuteScriptRequest(data, socket);
                    // 记录敏感操作审计日志
                    if (this.auditLogger) {
                        const duration = Date.now() - startTime;
                        await this.auditLogger.logSensitiveOp(
                            messageSessionId, action, data.tabId, null, 'success', duration, requestId,
                            { clientId, clientType: 'automation' }
                        );
                    }
                    break;
                case 'inject_css':
                    await this.handleInjectCssRequest(data, socket);
                    break;
                case 'get_cookies':
                    await this.handleGetCookiesRequest(data, socket);
                    // 记录敏感操作审计日志
                    if (this.auditLogger) {
                        const duration = Date.now() - startTime;
                        await this.auditLogger.logSensitiveOp(
                            messageSessionId, action, data.tabId, null, 'success', duration, requestId,
                            { clientId, clientType: 'automation' }
                        );
                    }
                    break;
                case 'subscribe_events':
                    await this.handleSubscribeEventsRequest(data, socket, clientId);
                    break;
                case 'unsubscribe_events':
                    await this.handleUnsubscribeEventsRequest(data, socket, clientId);
                    break;
                default:
                    this.sendToAutomationClient(socket, {
                        type: 'error',
                        requestId,
                        message: `Unknown message type: ${action}`
                    });
                    break;
            }
        } catch (err) {
            Logger.error(`Error handling automation message: ${err.message}`);
            this.sendToAutomationClient(socket, {
                type: 'error',
                message: `Invalid message format: ${err.message}`
            });
        }
    }

    /**
     * 处理获取标签页请求
     */
    async handleGetTabsRequest(data, socket) {
        try {
            if (!this.tabsManager) {
                throw new Error('标签页管理器不可用');
            }

            const tabsData = await this.tabsManager.getTabs();
            this.sendToAutomationClient(socket, {
                type: 'get_tabs_response',
                requestId: data.requestId,
                status: 'success',
                data: tabsData
            });
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_tabs_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理打开URL请求
     */
    async handleOpenUrlRequest(data, socket) {
        try {
            const { url, tabId, windowId, requestId } = data;
            
            if (!url) {
                throw new Error("缺少'url'参数");
            }

            // 检查重复请求
            const dedupeCheck = this.checkDuplicateRequest('open_url', { url, tabId });
            if (dedupeCheck.isDuplicate) {
                Logger.info(`[Dedup] Returning existing request for open_url: ${dedupeCheck.existingRequestId}`);
                this.sendToAutomationClient(socket, {
                    type: 'open_url_response',
                    requestId: data.requestId,
                    status: 'pending',
                    message: '相同请求正在处理中',
                    existingRequestId: dedupeCheck.existingRequestId,
                    deduplicated: true
                });
                return;
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'open_url'
                });
            }

            // 注册活动请求（用于去重）
            this.registerActiveRequest('open_url', { url, tabId }, requestId);

            // 注册 pending response 并设置超时
            this.registerPendingResponse(requestId, socket, 'open_url');

            const result = await this.sendToExtensions({
                type: 'open_url',
                url: url,
                tabId: tabId,
                windowId: windowId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                this.clearActiveRequest('open_url', { url, tabId });
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'open_url_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理关闭标签页请求
     */
    async handleCloseTabRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'close_tab'
                });
            }

            this.registerPendingResponse(requestId, socket, 'close_tab');

            const result = await this.sendToExtensions({
                type: 'close_tab',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'close_tab_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理获取HTML请求
     */
    async handleGetHtmlRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'get_html'
                });
            }

            this.registerPendingResponse(requestId, socket, 'get_html');

            const result = await this.sendToExtensions({
                type: 'get_html',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                throw new Error(result.message);
            }

            // 启动轮询等待CallbackManager响应
            this.waitForCallbackResponse(requestId, socket);
            
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_html_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理执行脚本请求
     */
    async handleExecuteScriptRequest(data, socket) {
        try {
            const { tabId, code, requestId } = data;
            
            if (!tabId || !code) {
                throw new Error("缺少'tabId'或'code'参数");
            }

            // 检查重复请求
            const dedupeCheck = this.checkDuplicateRequest('execute_script', { tabId, code });
            if (dedupeCheck.isDuplicate) {
                Logger.info(`[Dedup] Returning existing request for execute_script: ${dedupeCheck.existingRequestId}`);
                this.sendToAutomationClient(socket, {
                    type: 'execute_script_response',
                    requestId: data.requestId,
                    status: 'pending',
                    message: '相同脚本正在执行中',
                    existingRequestId: dedupeCheck.existingRequestId,
                    deduplicated: true
                });
                return;
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'execute_script'
                });
            }

            // 注册活动请求（用于去重）
            this.registerActiveRequest('execute_script', { tabId, code }, requestId);

            this.registerPendingResponse(requestId, socket, 'execute_script');

            const result = await this.sendToExtensions({
                type: 'execute_script',
                tabId: tabId,
                code: code,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                this.clearActiveRequest('execute_script', { tabId, code });
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'execute_script_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理注入CSS请求
     */
    async handleInjectCssRequest(data, socket) {
        try {
            const { tabId, css, requestId } = data;
            
            if (!tabId || !css) {
                throw new Error("缺少'tabId'或'css'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'inject_css'
                });
            }

            this.registerPendingResponse(requestId, socket, 'inject_css');

            const result = await this.sendToExtensions({
                type: 'inject_css',
                tabId: tabId,
                css: css,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'inject_css_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理获取Cookies请求
     */
    async handleGetCookiesRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal', {
                    operationType: 'get_cookies'
                });
            }

            this.registerPendingResponse(requestId, socket, 'get_cookies');

            const result = await this.sendToExtensions({
                type: 'get_cookies',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.clearPendingResponse(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_cookies_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理事件订阅请求
     */
    async handleSubscribeEventsRequest(data, socket, clientId) {
        const { events = [], requestId } = data;
        
        // 为客户端注册事件监听器
        if (!socket.eventListeners) {
            socket.eventListeners = new Map();
        }

        events.forEach(eventType => {
            if (!socket.eventListeners.has(eventType)) {
                const listener = (eventData) => {
                    this.sendToAutomationClient(socket, {
                        type: 'event',
                        event: eventType,
                        data: eventData
                    });
                };
                
                socket.eventListeners.set(eventType, listener);
                if (this.eventEmitter) {
                    this.eventEmitter.on(eventType, listener);
                }
            }
        });

        this.sendToAutomationClient(socket, {
            type: 'subscribe_events_response',
            requestId: requestId,
            status: 'success',
            subscribedEvents: events
        });
    }

    /**
     * 处理事件取消订阅请求
     */
    async handleUnsubscribeEventsRequest(data, socket, clientId) {
        const { events = [], requestId } = data;
        
        if (socket.eventListeners) {
            events.forEach(eventType => {
                const listener = socket.eventListeners.get(eventType);
                if (listener && this.eventEmitter) {
                    this.eventEmitter.removeListener(eventType, listener);
                    socket.eventListeners.delete(eventType);
                }
            });
        }

        this.sendToAutomationClient(socket, {
            type: 'unsubscribe_events_response',
            requestId: requestId,
            status: 'success',
            unsubscribedEvents: events
        });
    }

    /**
     * 等待回调响应并转发给 WebSocket 客户端
     */
    waitForCallbackResponse(requestId, socket) {
        const maxWaitTime = 60000; // 60秒超时
        const checkInterval = 100; // 每100ms检查一次
        let elapsedTime = 0;

        const checkResponse = async () => {
            if (elapsedTime >= maxWaitTime) {
                this.pendingResponses.delete(requestId);
                this.sendToAutomationClient(socket, {
                    type: 'get_html_response',
                    requestId: requestId,
                    status: 'error',
                    message: '请求超时'
                });
                return;
            }

            if (this.callbackManager) {
                const response = await this.callbackManager.getCallbackResponse(requestId);
                if (response) {
                    this.pendingResponses.delete(requestId);
                    this.sendToAutomationClient(socket, {
                        type: 'get_html_response',
                        requestId: requestId,
                        status: 'success',
                        data: response
                    });
                    return;
                }
            }

            elapsedTime += checkInterval;
            setTimeout(checkResponse, checkInterval);
        };

        checkResponse();
    }

    /**
     * 向automation客户端发送消息
     */
    sendToAutomationClient(socket, message) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    /**
     * 向所有automation客户端广播消息
     */
    broadcastToAutomationClients(message) {
        this.activeConnections.forEach((connInfo, clientId) => {
            // 兼容旧格式（直接存 socket）和新格式（存对象）
            const socket = connInfo.socket || connInfo;
            if (socket.readyState === WebSocket.OPEN) {
                this.sendToAutomationClient(socket, message);
            }
        });
    }

    /**
     * 向浏览器扩展发送消息（仅发送给 extension 类型客户端，不发给 automation）
     */
    async sendToExtensions(message) {
        try {
            if (this.activeConnections.size === 0) {
                return { 
                    status: 'error', 
                    message: 'No active browser extension connections' 
                };
            }

            // 收集所有活跃的 extension 连接
            const extensionClients = [];
            for (const [clientId, connInfo] of this.activeConnections.entries()) {
                const socket = connInfo.socket || connInfo;
                const clientType = connInfo.clientType || 'extension';
                
                if (clientType === 'automation') {
                    continue;
                }
                
                if (socket.readyState === WebSocket.OPEN) {
                    extensionClients.push({ clientId, socket });
                }
            }

            if (extensionClients.length === 0) {
                return { 
                    status: 'error', 
                    message: 'No active browser extension connections (only automation clients found or all disconnected)' 
                };
            }

            // Round-Robin 定向发送：选择一个扩展连接
            // 如果选中的连接发送失败，尝试下一个
            let sentCount = 0;
            const startIndex = this._extensionRoundRobinIndex % extensionClients.length;
            
            for (let i = 0; i < extensionClients.length; i++) {
                const idx = (startIndex + i) % extensionClients.length;
                const { clientId, socket } = extensionClients[idx];
                
                try {
                    socket.send(JSON.stringify(message));
                    sentCount = 1;
                    // 推进 Round-Robin 索引到下一个
                    this._extensionRoundRobinIndex = idx + 1;
                    Logger.debug(`[sendToExtensions] Targeted message to extension ${clientId} (RR index: ${idx}/${extensionClients.length})`);
                    break;  // 成功发送到一个扩展即可
                } catch (sendErr) {
                    Logger.warn(`[sendToExtensions] Failed to send to extension ${clientId}: ${sendErr.message}, trying next`);
                    continue;
                }
            }

            if (sentCount === 0) {
                return { 
                    status: 'error', 
                    message: 'Failed to send message to any extension' 
                };
            }

            return { 
                status: 'success', 
                message: `Message sent to 1 extension (Round-Robin)`,
                requestId: message.requestId,
                needsCallback: true
            };
        } catch (err) {
            Logger.error(`Error sending message to extensions: ${err.message}`);
            return { 
                status: 'error', 
                message: `Failed to send message: ${err.message}`,
                needsCallback: false
            };
        }
    }

    /**
     * 处理浏览器扩展消息
     * @param {string} message 接收到的消息
     * @param {string} clientId 客户端ID
     * @param {string|null} sessionId 会话ID
     */
    async handleMessage(message, clientId, sessionId = null) {
        try {
            let data = JSON.parse(message);
            
            // 支持新协议格式：type: 'request' 包装的消息
            // 解包后按原有逻辑处理
            if (data.type === 'request') {
                const messageSessionId = data.sessionId || sessionId;
                
                // 验证会话（如果启用认证）
                if (this.isAuthEnabled()) {
                    const session = this.validateRequestSession(messageSessionId);
                    if (!session) {
                        Logger.warn(`[Auth] Invalid session for extension request from ${clientId}`);
                        // 发送错误响应通知客户端会话已过期，而不是静默丢弃
                        const connInfo = this.activeConnections.get(clientId);
                        if (connInfo) {
                            const socket = connInfo.socket || connInfo;
                            if (socket.readyState === WebSocket.OPEN) {
                                socket.send(JSON.stringify({
                                    type: 'error',
                                    code: 'SESSION_EXPIRED',
                                    message: 'Session expired or invalid. Please reconnect.',
                                    requestId: data.requestId,
                                    timestamp: new Date().toISOString()
                                }));
                            }
                        }
                        return;
                    }
                }
                
                // 解包消息：将 action 作为 type，payload 作为主体
                const action = data.action;
                const payload = data.payload || {};
                const requestId = data.requestId || payload.requestId;
                
                // 重构消息为旧格式以便后续处理
                data = {
                    type: action,
                    requestId: requestId,
                    ...payload
                };
                
                Logger.debug(`[Extension] Unwrapped request: action=${action}, requestId=${requestId}`);
            }
            
            // 支持通知型消息：type: 'notification'（不需要响应，无 requestId）
            if (data.type === 'notification') {
                const messageSessionId = data.sessionId || sessionId;
                
                // 验证会话（如果启用认证）
                if (this.isAuthEnabled()) {
                    const session = this.validateRequestSession(messageSessionId);
                    if (!session) {
                        Logger.warn(`[Auth] Invalid session for extension notification from ${clientId}`);
                        // 发送会话过期通知
                        const connInfo = this.activeConnections.get(clientId);
                        if (connInfo) {
                            const socket = connInfo.socket || connInfo;
                            if (socket.readyState === WebSocket.OPEN) {
                                socket.send(JSON.stringify({
                                    type: 'session_expired',
                                    reason: 'Session expired or invalid',
                                    action: 'reconnect',
                                    timestamp: new Date().toISOString()
                                }));
                            }
                        }
                        return;
                    }
                }
                
                // 解包通知消息
                const action = data.action;
                const payload = data.payload || {};
                
                data = {
                    type: action,
                    ...payload
                };
                
                Logger.debug(`[Extension] Unwrapped notification: action=${action}`);
            }
            
            // 处理应用层心跳
            if (data.type === 'ping') {
                const connInfo = this.activeConnections.get(clientId);
                if (connInfo) {
                    connInfo.lastActivity = Date.now();
                    const socket = connInfo.socket || connInfo;
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'pong',
                            timestamp: new Date().toISOString()
                        }));
                    }
                }
                return;
            }
            
            // 验证会话（如果启用认证，针对非 request 格式的消息）
            if (this.isAuthEnabled() && sessionId && data.type !== 'request') {
                const session = this.validateRequestSession(sessionId);
                if (!session) {
                    Logger.warn(`[Auth] Invalid session for extension message from ${clientId}, type=${data.type}`);
                    // 对于操作完成类响应（*_complete）仍然处理，避免阻塞请求链路
                    // 但对于其他消息类型，发送会话过期通知
                    if (!data.type?.endsWith('_complete') && data.type !== 'data' && data.type !== 'error') {
                        const connInfo = this.activeConnections.get(clientId);
                        if (connInfo) {
                            const socket = connInfo.socket || connInfo;
                            if (socket.readyState === WebSocket.OPEN) {
                                socket.send(JSON.stringify({
                                    type: 'session_expired',
                                    reason: 'Session expired or invalid',
                                    action: 'reconnect',
                                    timestamp: new Date().toISOString()
                                }));
                            }
                        }
                    }
                }
            }

            // 处理错误消息
            if (data.type === 'error') {
                const requestId = data.requestId;
                const errorMessage = data.message || 'Unknown error';
                Logger.error(`Received error message from extension ${clientId}: ${errorMessage}`);
                
                // 转发错误给发起请求的 automation 客户端（而非仅清理 pending 状态）
                if (requestId) {
                    this.resolvePendingResponse(requestId, {
                        status: 'error',
                        type: 'error',
                        message: errorMessage,
                        code: data.code || 'EXTENSION_ERROR',
                        requestId
                    });
                }
                
                if (requestId && this.callbackManager) {
                    await this.callbackManager.postToCallback(requestId, {
                        status: 'error',
                        type: 'error',
                        message: errorMessage,
                        requestId
                    });
                }
                
                // 广播错误事件
                if (this.eventEmitter) {
                    this.eventEmitter.emit('error', {
                        message: errorMessage,
                        requestId
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('error', {
                    message: errorMessage,
                    requestId
                });
                
                return;
            }

            // 处理初始化消息
            if (data.type === 'init') {
                Logger.info('Received init message from extension.');
                
                if (this.eventEmitter) {
                    this.eventEmitter.emit('init', {
                        timestamp: new Date().toISOString()
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('init', {
                    timestamp: new Date().toISOString()
                });
                
                // 发送 init_ack 响应，包含服务端配置信息
                const connInfo = this.activeConnections.get(clientId);
                if (connInfo) {
                    const socket = connInfo.socket || connInfo;
                    if (socket.readyState === WebSocket.OPEN) {
                        const serverConfig = {
                            request: {
                                defaultTimeout: this.requestTimeout
                            },
                            heartbeat: {
                                interval: this.heartbeatInterval,
                                timeout: this.heartbeatTimeout
                            },
                            rateLimit: this.securityConfig?.rateLimit || null,
                            // 扩展端命令处理限流（独立于 HTTP 回调查询限流）
                            extensionRateLimit: {
                                maxRequestsPerSecond: 10,
                                blockDuration: 5000
                            },
                            resourceMonitor: this.securityConfig?.resourceMonitor || null
                        };
                        socket.send(JSON.stringify({
                            type: 'init_ack',
                            status: 'ok',
                            serverConfig: serverConfig,
                            timestamp: new Date().toISOString()
                        }));
                        Logger.info(`Sent init_ack to extension ${clientId}`);
                    }
                }
                
                return;
            }

            // 处理标签页数据更新
            if (data.type === 'data' && this.tabsManager) {
                // 兼容两种格式：notification 解包后 tabs 在顶层，旧格式在 payload 内
                const tabs = data.tabs || data.payload?.tabs || [];
                const active_tab_id = data.active_tab_id || data.payload?.active_tab_id;
                
                await this.tabsManager.updateTabs(tabs, active_tab_id);
                
                if (this.eventEmitter) {
                    this.eventEmitter.emit('tabs_update', {
                        tabs: tabs,
                        active_tab_id: active_tab_id,
                        timestamp: new Date().toISOString()
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('tabs_update', {
                    tabs: tabs,
                    active_tab_id: active_tab_id,
                    timestamp: new Date().toISOString()
                });
                
                return;
            }

            // 其他消息必须包含requestId
            if (!data.requestId) {
                Logger.warning(`Message from extension ${clientId} does not contain requestId: ${JSON.stringify(data)}`);
                return;
            }

            const requestId = data.requestId;

            // 根据消息类型处理和转发
            switch (data.type) {
                case 'open_url_complete': {
                    const openUrlResponse = {
                        status: 'success',
                        type: 'open_url_complete',
                        tabId: data.tabId,
                        url: data.url,
                        cookies: data.cookies || [],
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, openUrlResponse);
                    // 清除活动请求（去重）
                    this.clearActiveRequest('open_url', { url: data.url, tabId: data.originalTabId });
                    
                    if (data.cookies && this.tabsManager) {
                        await this.tabsManager.saveCookies(data.tabId, data.cookies);
                    }
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, openUrlResponse);
                    }

                    const isNewTab = data.isNewTab !== undefined ? data.isNewTab : !data.originalTabId;
                    const eventType = isNewTab ? 'tab_opened' : 'tab_url_changed';
                    
                    if (this.eventEmitter) {
                        this.eventEmitter.emit(eventType, {
                            tabId: data.tabId,
                            url: data.url,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent(eventType, {
                        tabId: data.tabId,
                        url: data.url,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'tab_html_chunk':
                    if (this.tabsManager) {
                        await this.tabsManager.handleHtmlChunk(data, requestId);
                    }
                    break;

                case 'close_tab_complete': {
                    const closeTabResponse = {
                        status: 'success',
                        type: 'close_tab_complete',
                        tabId: data.tabId,
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, closeTabResponse);
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, closeTabResponse);
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('tab_closed', {
                            tabId: data.tabId,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('tab_closed', {
                        tabId: data.tabId,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'tab_html_complete': {
                    // get_html 的最终响应
                    const htmlCompleteResponse = {
                        status: 'success',
                        type: 'tab_html_complete',
                        tabId: data.tabId,
                        html: data.html,
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, htmlCompleteResponse);
                    
                    if (this.tabsManager) {
                        await this.tabsManager.handleTabHtmlComplete(data, requestId);
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('tab_html_received', {
                            tabId: data.tabId,
                            htmlLength: data.html ? data.html.length : 0,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('tab_html_received', {
                        tabId: data.tabId,
                        htmlLength: data.html ? data.html.length : 0,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'execute_script_complete': {
                    const execScriptResponse = {
                        status: 'success',
                        type: 'execute_script_complete',
                        tabId: data.tabId,
                        result: data.result,
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    const wsPushed = this.resolvePendingResponse(requestId, execScriptResponse);
                    // 清除活动请求（去重）- 注意：这里没有原始的 code，所以只清理 tabId 相关的
                    // 实际上脚本执行完成后，activeRequests 会因为超时自动清理
                    
                    // 仍然写入 DB（保留审计日志），但如果 WS 已成功推送则标记 _wsPushed
                    // 以便 pushResponseToWaitingClient 跳过重复广播
                    if (this.callbackManager) {
                        execScriptResponse._wsPushed = wsPushed;
                        await this.callbackManager.postToCallback(requestId, execScriptResponse);
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('script_executed', {
                            tabId: data.tabId,
                            result: data.result,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('script_executed', {
                        tabId: data.tabId,
                        result: data.result,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'inject_css_complete': {
                    const injectCssResponse = {
                        status: 'success',
                        type: 'inject_css_complete',
                        tabId: data.tabId,
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, injectCssResponse);
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, injectCssResponse);
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('css_injected', {
                            tabId: data.tabId,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('css_injected', {
                        tabId: data.tabId,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'get_cookies_complete': {
                    Logger.info(`Received get_cookies_complete message: tabId=${data.tabId}, cookies count=${data.cookies ? data.cookies.length : 0}`);
                    
                    let cookieAnalysis = null;
                    if (data.cookies && data.cookies.length > 0) {
                        cookieAnalysis = this.analyzeCookieCompleteness(data.cookies, data.url);
                        Logger.info(`[Cookie分析] 标签页 ${data.tabId} 获取到 ${data.cookies.length} 个cookies`);
                    }
                    
                    const getCookiesResponse = {
                        status: 'success',
                        type: 'get_cookies_complete',
                        tabId: data.tabId,
                        url: data.url,
                        cookies: data.cookies || [],
                        analysis: cookieAnalysis,
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, getCookiesResponse);
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, getCookiesResponse);
                    }

                    browserEventEmitter.emitBrowserEvent('cookies_received', {
                        tabId: data.tabId,
                        url: data.url,
                        cookies: data.cookies || [],
                        analysis: cookieAnalysis,
                        requestId: requestId,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                case 'upload_file_to_tab_complete': {
                    Logger.info(`Received upload_file_to_tab_complete message: tabId=${data.tabId}, uploaded files=${data.uploadedFiles ? data.uploadedFiles.length : 0}`);
                    
                    const uploadResponse = {
                        status: 'success',
                        type: 'upload_file_to_tab_complete',
                        tabId: data.tabId,
                        uploadedFiles: data.uploadedFiles || [],
                        targetSelector: data.targetSelector,
                        message: data.message || '文件上传完成',
                        requestId
                    };
                    // 通过 WS 回传结果给 automation 客户端，并清理 pending
                    this.resolvePendingResponse(requestId, uploadResponse);
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, uploadResponse);
                    }
                    
                    if (this.eventEmitter) {
                        this.eventEmitter.emit('file_uploaded', {
                            tabId: data.tabId,
                            uploadedFiles: data.uploadedFiles || [],
                            timestamp: new Date().toISOString()
                        });
                    }
                    
                    browserEventEmitter.emitBrowserEvent('file_uploaded', {
                        tabId: data.tabId,
                        uploadedFiles: data.uploadedFiles || [],
                        requestId: requestId,
                        timestamp: new Date().toISOString()
                    });
                    break;
                }

                default:
                    Logger.warning(`Unknown message type from extension ${clientId}: ${data.type}`);
                    break;
            }

            // 向等待的 WebSocket 客户端推送响应（仅当 resolvePendingResponse 未成功推送时）
            // resolvePendingResponse 已通过定向 WS 推送给了发起请求的 automation 客户端，
            // 此处的广播会导致重复响应，因此在已推送的情况下跳过
            if (data.requestId && !this._resolvedViaWS.has(data.requestId)) {
                await this.pushResponseToWaitingClient(data.requestId, data);
            } else if (data.requestId) {
                this._resolvedViaWS.delete(data.requestId);
            }
        } catch (err) {
            Logger.error(`Error handling extension message from ${clientId}: ${err.message}`);
        }
    }

    /**
     * 向等待响应的 WebSocket 客户端推送结果
     * @param {string} requestId 请求 ID
     * @param {Object} data 响应数据
     */
    async pushResponseToWaitingClient(requestId, data) {
        // 检查是否有客户端在等待这个 requestId 的响应
        // 注意：pendingResponses 在收到响应后已被清除，所以这里需要在清除前获取 socket
        // 或者使用另一种机制来追踪等待的客户端
        
        // 检查 callbackUrl 是否指示需要 WebSocket 推送
        if (this.callbackManager) {
            const callbackUrl = await this.callbackManager.getCallbackUrl(requestId);
            if (callbackUrl === '_internal' || callbackUrl === '_websocket_internal') {
                // 向所有 automation 客户端广播结果
                const responseType = data.type ? data.type.replace('_complete', '_response') : 'response';
                this.broadcastToAutomationClients({
                    type: responseType,
                    requestId: requestId,
                    status: data.status || 'success',
                    data: data,
                    timestamp: new Date().toISOString()
                });
                
                Logger.debug(`Pushed response to automation clients: ${requestId} (${responseType})`);
            }
        }
    }

    /**
     * 向所有活动连接发送消息
     * @param {Object} message 要发送的消息
     * @returns {Object} 操作结果
     */
    async sendMessage(message) {
        try {
            if (this.activeConnections.size === 0) {
                return { 
                    status: 'error', 
                    message: 'No active WebSocket connections' 
                };
            }

            let sentCount = 0;
            for (const [clientId, connInfo] of this.activeConnections.entries()) {
                // 兼容旧格式（直接存 socket）和新格式（存对象）
                const socket = connInfo.socket || connInfo;
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(message));
                    sentCount++;
                } else {
                    Logger.warning(`Skipping client ${clientId} - Socket not in OPEN state.`);
                }
            }

            return { 
                status: 'success', 
                message: `Message sent to ${sentCount} clients`,
                requestId: message.requestId,
                needsCallback: true
            };
        } catch (err) {
            Logger.error(`Error sending WebSocket message: ${err.message}`);
            return { 
                status: 'error', 
                message: `Failed to send message: ${err.message}`,
                needsCallback: false
            };
        }
    }

    /**
     * 获取活动客户端连接数
     * @returns {number} 活动连接数
     */
    getActiveClients() {
        return this.activeConnections.size;
    }

    /**
     * 将客户端信息存储到数据库
     * @param {string} clientId 客户端ID
     * @param {string} address 客户端地址
     * @param {string} clientType 客户端类型 (extension, automation)
     */
    async storeClient(clientId, address, clientType = 'extension') {
        // 如果正在关闭，跳过数据库写入
        if (this.isShuttingDown) {
            Logger.debug(`Skipping client store for ${clientId} - server is shutting down`);
            return;
        }
        
        try {
            await this.database.run(
                'INSERT INTO websocket_clients (client_id, address, client_type) VALUES (?, ?, ?)',
                [clientId, address, clientType]
            );
            Logger.info(`Stored ${clientType} client ${clientId} in database.`);
        } catch (err) {
            Logger.error(`Error storing ${clientType} client ${clientId} in database: ${err.message}`);
        }
    }

    /**
     * 更新客户端断开连接时间
     * @param {string} clientId 客户端ID
     */
    async updateClientDisconnected(clientId) {
        // 如果正在关闭，跳过数据库更新以避免写入已关闭的数据库
        if (this.isShuttingDown) {
            Logger.debug(`Skipping disconnect update for client ${clientId} - server is shutting down`);
            return;
        }
        
        try {
            await this.database.run(
                'UPDATE websocket_clients SET disconnected_at = CURRENT_TIMESTAMP WHERE client_id = ?',
                [clientId]
            );
            Logger.info(`Updated disconnect time for client ${clientId} in database.`);
        } catch (err) {
            Logger.error(`Error updating disconnect time for client ${clientId}: ${err.message}`);
        }
    }

    /**
     * 清理指定客户端在 authenticatedSockets 中的关联条目
     * @param {string} clientId 客户端ID
     */
    cleanupAuthenticatedSocket(clientId) {
        for (const [socketId, authInfo] of this.authenticatedSockets.entries()) {
            if (authInfo.clientId === clientId) {
                this.authenticatedSockets.delete(socketId);
                Logger.debug(`Cleaned up authenticated socket for client ${clientId}`);
                break;
            }
        }
    }

    /**
     * 清理 pendingAuth 中的过期条目
     */
    cleanupPendingAuth() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [socketId, authInfo] of this.pendingAuth.entries()) {
            const age = now - (authInfo.createdAt?.getTime() || now);
            // 如果认证挂起超过 2 分钟，强制清理
            if (age > 120000) {
                if (authInfo.timeout) {
                    clearTimeout(authInfo.timeout);
                }
                try {
                    if (authInfo.socket && authInfo.socket.readyState === WebSocket.OPEN) {
                        authInfo.socket.close(1008, 'Authentication timeout');
                    }
                } catch (err) {
                    // ignore
                }
                this.pendingAuth.delete(socketId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            Logger.info(`Cleaned up ${cleanedCount} stale pending auth entries`);
        }
        
        return cleanedCount;
    }

    /**
     * 清理断开连接的客户端
     * 检查 readyState 和 lastActivity 时间
     */
    async cleanupDisconnectedClients() {
        // 如果正在关闭，跳过清理
        if (this.isShuttingDown) {
            return;
        }
        
        const now = Date.now();
        let cleanedCount = 0;
        
        try {
            for (const [clientId, connInfo] of this.activeConnections.entries()) {
                // 兼容旧格式（直接存 socket）和新格式（存对象）
                const socket = connInfo.socket || connInfo;
                const lastActivity = connInfo.lastActivity || now;
                const idleTime = now - lastActivity;
                
                let shouldRemove = false;
                let reason = '';
                
                // 检查 1：socket 状态不是 OPEN
                if (socket.readyState !== WebSocket.OPEN) {
                    shouldRemove = true;
                    reason = `socket state is ${socket.readyState}`;
                }
                // 检查 2：连接空闲时间超过阈值
                else if (idleTime > this.connectionIdleTimeout) {
                    shouldRemove = true;
                    reason = `idle for ${idleTime}ms`;
                    // 主动关闭长时间空闲的连接
                    try {
                        socket.close(1000, 'Connection idle timeout');
                    } catch (err) {
                        // ignore
                    }
                }
                
                if (shouldRemove) {
                    this.activeConnections.delete(clientId);
                    await this.updateClientDisconnected(clientId);
                    this.cleanupAuthenticatedSocket(clientId);
                    cleanedCount++;
                    Logger.info(`Removed disconnected client ${clientId} from connection map (${reason})`);
                }
            }
            
            // 同时清理 pendingAuth 中的过期条目
            this.cleanupPendingAuth();
            
        } catch (err) {
            Logger.error(`Error cleaning up disconnected clients: ${err.message}`);
        }
        
        return cleanedCount;
    }

    /**
     * 停止WebSocket服务器
     */
    stop() {
        // 设置关闭标志，防止 close 事件回调写入已关闭的数据库
        this.isShuttingDown = true;
        
        // 清理 pendingResponses 清理定时器
        if (this.pendingCleanupInterval) {
            clearInterval(this.pendingCleanupInterval);
            this.pendingCleanupInterval = null;
        }
        
        // 清理所有 pending responses 的超时定时器
        for (const [requestId, info] of this.pendingResponses) {
            if (info.timeoutId) {
                clearTimeout(info.timeoutId);
            }
        }
        this.pendingResponses.clear();
        
        // 清理 activeRequests
        this.activeRequests.clear();
        
        // 停止心跳机制
        this.stopHeartbeat();
        
        if (this.server) {
            this.server.close();
            this.server = null;

            for (const [clientId, connInfo] of this.activeConnections.entries()) {
                try {
                    // 兼容旧格式（直接存 socket）和新格式（存对象）
                    const socket = connInfo.socket || connInfo;
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.close(1000, 'Server shutting down');
                    }
                } catch (err) {
                    Logger.error(`Error closing WebSocket connection for client ${clientId}: ${err.message}`);
                }
            }
            
            this.activeConnections.clear();
            this.pendingAuth.clear();
            this.authenticatedSockets.clear();
            Logger.info('WebSocket server stopped.');
        }
    }

    /**
     * 分析Cookie完整性和质量
     * @param {Array} cookies Cookie数组
     * @param {string} url 页面URL
     * @returns {Object} 分析结果
     */
    analyzeCookieCompleteness(cookies, url) {
        const analysis = {
            domainStats: {},
            typeStats: {
                secure: 0,
                httpOnly: 0,
                session: 0,
                persistent: 0,
                sameSiteStrict: 0,
                sameSiteLax: 0,
                sameSiteNone: 0,
                thirdParty: 0,
                firstParty: 0
            },
            warnings: [],
            recommendations: []
        };

        if (!cookies || cookies.length === 0) {
            analysis.warnings.push('未获取到任何cookies');
            return analysis;
        }

        try {
            const urlObj = new URL(url);
            const mainDomain = urlObj.hostname;
            const parentDomain = mainDomain.split('.').slice(-2).join('.');

            cookies.forEach(cookie => {
                const domain = cookie.domain || 'unknown';
                
                analysis.domainStats[domain] = (analysis.domainStats[domain] || 0) + 1;
                
                if (cookie.secure) analysis.typeStats.secure++;
                if (cookie.httpOnly) analysis.typeStats.httpOnly++;
                if (cookie.session) analysis.typeStats.session++;
                else analysis.typeStats.persistent++;
                
                switch (cookie.sameSite) {
                    case 'strict':
                        analysis.typeStats.sameSiteStrict++;
                        break;
                    case 'lax':
                        analysis.typeStats.sameSiteLax++;
                        break;
                    case 'none':
                        analysis.typeStats.sameSiteNone++;
                        break;
                }
                
                if (domain === mainDomain || domain === `.${parentDomain}` || domain.endsWith(`.${parentDomain}`)) {
                    analysis.typeStats.firstParty++;
                } else {
                    analysis.typeStats.thirdParty++;
                }
            });

            const totalCookies = cookies.length;
            
            const hasFirstPartyCookies = analysis.typeStats.firstParty > 0;
            if (!hasFirstPartyCookies) {
                analysis.warnings.push('未检测到第一方cookies，可能存在获取不完整的问题');
            }
            
            if (totalCookies < 3) {
                analysis.warnings.push(`Cookie数量较少(${totalCookies}个)，可能未完全获取`);
            }
            
            const secureRatio = analysis.typeStats.secure / totalCookies;
            if (secureRatio < 0.5 && url.startsWith('https://')) {
                analysis.warnings.push(`HTTPS网站的安全cookies比例较低(${(secureRatio * 100).toFixed(1)}%)`);
            }

        } catch (error) {
            analysis.warnings.push(`Cookie分析时出错: ${error.message}`);
        }

        return analysis;
    }
}

module.exports = ExtensionWebSocketServer;
