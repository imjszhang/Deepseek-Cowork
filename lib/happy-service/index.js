/**
 * Happy Service 统一入口
 * 
 * 提供简洁的 API 来初始化和管理 Happy Service
 * 
 * 功能：
 * - 检查 happy 命令
 * - 启动/确保 Happy Daemon 运行
 * - 创建和管理 Session
 * - 监控 Session 状态
 * - 消息通信（通过 HappyClient）
 * - 清理资源
 * 
 * 创建时间: 2026-01-09
 * 更新时间: 2026-01-09 - 集成 HappyClient 实现消息通信
 */

const EventEmitter = require('events');
const path = require('path');
const config = require('./config');
const DaemonManager = require('./DaemonManager');
const SessionManager = require('./SessionManager');
const { HappyClient } = require('../happy-client');
const MessageStore = require('../message-store');
const CryptoUtils = require('../happy-client/utils/CryptoUtils');
const KeyUtils = require('../happy-client/utils/KeyUtils');
const { systemPrompt } = require('../happy-client/prompt/systemPrompt');
const { 
    ensureHappyCommand, 
    checkCommandAvailable,
    logInfo, 
    logWarn, 
    logError,
    logDebug,
    setLogLevel 
} = require('./utils');

/**
 * Happy Service 单例（继承 EventEmitter 以支持事件转发）
 */
class HappyServiceClass extends EventEmitter {
    constructor() {
        super();
        
        // 内部状态
        this._initialized = false;
        this._initializing = false;
        this._initError = null;
        
        // 管理器实例
        this.daemonManager = null;
        this.sessionManager = null;
        
        // HappyClient 实例（用于消息通信）
        this.happyClient = null;
        
        // Claude Code 环境变量获取回调
        this._getClaudeCodeEnv = null;
        this._clientConnected = false;
        
        // 消息历史缓存
        this._messageHistory = [];
        this._maxMessages = 200;
        
        // 当前事件状态
        this._eventStatus = 'idle';
        
        // 上下文使用量数据
        this._latestUsage = null;
        this._totalOutputTokens = 0;  // 累计输出 tokens
        
        // Secret 变更检测
        this._currentAnonId = null;
        
        // 配置
        this._options = {};
        
        // /clear 命令标志（用于跳过 usage 更新）
        this._isClearCommand = false;
    }
    
    /**
     * 重置 HappyService 内部状态
     * 用于账户切换时清理旧配置
     */
    reset() {
        logInfo('HappyService: Resetting internal state...');
        
        // 停止 SessionManager 监控（防止自动重启 daemon）
        if (this.sessionManager) {
            this.sessionManager.stopMonitoring();
        }
        
        // 重置初始化状态
        this._initialized = false;
        this._initializing = false;
        this._initError = null;
        
        // 标记需要登录（避免频繁检查 daemon 状态文件）
        this._needsLogin = true;
        
        // 清除配置（下次初始化时会使用新配置）
        this._options = {};
        
        // 清除账户相关状态
        this._currentAnonId = null;
        
        // 清除客户端连接状态
        this._clientConnected = false;
        this.happyClient = null;
        
        // 清除消息历史
        this._messageHistory = [];
        
        // 重置事件状态
        this._eventStatus = 'idle';
        
        // 重置使用量数据
        this._latestUsage = null;
        this._totalOutputTokens = 0;
        
        // 清除 SessionManager 状态
        if (this.sessionManager) {
            this.sessionManager.clearSessions();
            this.sessionManager.anonId = null;
            this.sessionManager.workDirIndex = {};
            this.sessionManager.currentSession = null;
            this.sessionManager.removeStateFile();
            // 标记账户变更，下次 createAllSessions 时会清理 daemon sessions
            this.sessionManager._accountChanged = true;
        }
        
        logInfo('HappyService: Internal state reset complete');
    }
    
    /**
     * 清理 ~/.happy/settings.json 中的 machineId
     * 用于账号切换时，确保新账号注册新的 machine
     * @private
     */
    _clearMachineId() {
        const fs = require('fs');
        const os = require('os');
        const settingsPath = path.join(os.homedir(), '.happy', 'settings.json');
        
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                if (settings.machineId) {
                    delete settings.machineId;
                    delete settings.machineIdConfirmedByServer;
                    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                    logInfo('HappyService: machineId cleared from settings.json');
                }
            } catch (e) {
                logWarn(`HappyService: Failed to clear machineId: ${e.message}`);
            }
        }
    }
    
    /**
     * 重新初始化 HappyService（热切换，无需重启应用）
     * 用于账号切换失败时的回退方案
     * @param {Object} options 新的配置选项
     * @returns {Promise<Object>} 初始化结果 { success: boolean, error?: string, ... }
     */
    async reinitialize(options = {}) {
        try {
            logInfo('HappyService: Reinitializing (hot restart)...');
            
            // 1. 断开现有客户端连接
            await this.disconnectClient();
            
            // 2. 停止监控
            if (this.sessionManager) {
                this.sessionManager.stopMonitoring();
            }
            
            // 3. 停止 daemon（强制清理所有 sessions）
            if (this.daemonManager) {
                try {
                    await this.daemonManager.stopDaemon();
                    logInfo('HappyService: Old daemon stopped');
                } catch (e) {
                    logWarn(`HappyService: Failed to stop old daemon: ${e.message}`);
                }
            }
            
            // 4. 重置内部状态
            this.reset();
            
            // 5. 重新初始化
            logInfo('HappyService: Starting fresh initialization...');
            const result = await this.initialize(options);
            
            if (result.success) {
                logInfo('HappyService: Reinitialization successful');
            } else {
                logError(`HappyService: Reinitialization failed: ${result.error}`);
            }
            
            return result;
        } catch (error) {
            logError(`HappyService: Reinitialization error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 初始化 Happy Service
     * @param {Object} options 配置选项
     * @param {string} options.stateDir 状态文件目录
     * @param {Array} options.workDirs 工作目录配置
     * @param {string} options.baseDir 基础目录（相对路径基于此解析）
     * @param {number} options.monitorInterval 监控间隔（毫秒）
     * @param {boolean} options.autoMonitor 是否自动启动监控
     * @param {boolean} options.skipCommandCheck 是否跳过命令检查
     * @param {string} options.logLevel 日志级别
     * @param {string} options.happySecret Happy AI secret（用于消息通信）
     * @returns {Promise<Object>} 初始化结果
     */
    async initialize(options = {}) {
        // 防止重复初始化
        if (this._initialized) {
            logInfo('HappyService already initialized, skipping');
            return { success: true, alreadyInitialized: true };
        }
        
        if (this._initializing) {
            logWarn('HappyService is initializing, please wait');
            return { success: false, error: 'Initializing' };
        }
        
        this._initializing = true;
        this._initError = null;
        this._options = options;
        
        try {
            logInfo('Initializing HappyService...');
            
            // 设置日志级别
            if (options.logLevel) {
                setLogLevel(options.logLevel);
            }
            
            // 1. 检查 happy 命令是否可用
            if (!options.skipCommandCheck) {
                logInfo('Step 1/4: Checking happy command...');
                await ensureHappyCommand(config.HAPPY_COMMAND);
            } else {
                logInfo('Step 1/4: Skipping happy command check');
            }
            
            // 2. 初始化 DaemonManager
            logInfo('Step 2/4: Initializing DaemonManager...');
            this.daemonManager = new DaemonManager({
                happyHomeDir: options.happyHomeDir || config.HAPPY_HOME_DIR,
                startTimeout: options.daemonStartTimeout || config.DAEMON_START_TIMEOUT,
                startRetries: options.daemonStartRetries || config.DAEMON_START_RETRIES,
                getClaudeCodeEnv: this._getClaudeCodeEnv
            });
            
            // 设置 DaemonManager 事件转发
            this._setupDaemonEventForwarding();
            
            // 检查是否有 happySecret（用户是否已登录）
            const hasSecret = !!options.happySecret;
            
            // 如果没有 secret，跳过 daemon 启动，让用户先登录
            if (!hasSecret) {
                logInfo('Step 3/5: No secret configured, skipping daemon startup');
                logInfo('Step 4/5: Skipped (waiting for user login)');
                logInfo('Step 5/5: Skipped (waiting for user login)');
                
                // 初始化 SessionManager（但不创建 sessions）
                this.sessionManager = new SessionManager({
                    stateDir: options.stateDir,
                    stateFileName: options.stateFileName,
                    workDirs: options.workDirs,
                    baseDir: options.baseDir || process.cwd(),
                    monitorInterval: options.monitorInterval || config.MONITOR_INTERVAL,
                    daemonManager: this.daemonManager
                });
                
                // 转发 SessionManager 的状态更新事件
                this.sessionManager.on('session:stateUpdated', (state) => {
                    this.emit('session:stateUpdated', state);
                });
                
                this._initialized = true;
                this._initializing = false;
                this._needsLogin = true;
                
                logInfo('HappyService initialization complete (pending login)');
                
                return {
                    success: true,
                    needsLogin: true,
                    daemon: { running: false },
                    sessions: {}
                };
            }
            
            // 3. 检测 daemon 是否已在运行（在启动之前检测，用于判断冷/热启动）
            logInfo('Step 3/5: Checking daemon status...');
            const wasDaemonRunning = await this.daemonManager.isDaemonRunningAsync();
            logInfo(`  Daemon was running: ${wasDaemonRunning}`);
            
            // 4. 确保 daemon 运行
            logInfo('Step 4/5: Ensuring Happy Daemon running...');
            await this.daemonManager.ensureDaemonRunning();
            
            // 5. 初始化 SessionManager 并创建 sessions
            logInfo('Step 5/5: Initializing SessionManager...');
            this.sessionManager = new SessionManager({
                stateDir: options.stateDir,
                stateFileName: options.stateFileName,
                workDirs: options.workDirs,
                baseDir: options.baseDir || process.cwd(),
                monitorInterval: options.monitorInterval || config.MONITOR_INTERVAL,
                daemonManager: this.daemonManager
            });
            
            // 计算 anonId 并设置到 SessionManager
            try {
                const normalized = KeyUtils.normalizeSecretKey(options.happySecret);
                const secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
                const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
                const anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
                this._currentAnonId = anonId;
                this.sessionManager.setAnonId(anonId);
                logInfo(`[HappyService] AnonId set: ${anonId}`);
            } catch (e) {
                logWarn(`[HappyService] Failed to derive anonId: ${e.message}`);
            }
            
            // 创建所有 sessions（传入冷/热启动标志）
            logInfo('Creating Sessions...');
            const sessionResults = await this.sessionManager.createAllSessions({ wasDaemonRunning });
            
            // 转发 SessionManager 的状态更新事件
            this.sessionManager.on('session:stateUpdated', (state) => {
                this.emit('session:stateUpdated', state);
            });
            
            // 启动监控（如果配置了自动监控）
            if (options.autoMonitor !== false) {
                logInfo('Starting Session monitoring...');
                this.sessionManager.startMonitoring();
            }
            
            this._initialized = true;
            this._initializing = false;
            this._needsLogin = false;
            
            logInfo('HappyService initialization complete');
            
            return {
                success: true,
                needsLogin: false,
                daemon: this.daemonManager.getStatus(),
                sessions: sessionResults
            };
            
        } catch (error) {
            this._initError = error;
            this._initializing = false;
            
            logError(`HappyService initialization failed: ${error.message}`);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 获取 session ID
     * @param {string} name session 名称（默认 'main'）
     * @returns {string|null} session ID
     */
    getSessionId(name = 'main') {
        if (!this.sessionManager) {
            return null;
        }
        return this.sessionManager.getSessionId(name);
    }
    
    /**
     * 获取所有 sessions
     * @returns {Object} sessions 映射
     */
    getAllSessions() {
        if (!this.sessionManager) {
            return {};
        }
        return this.sessionManager.getAllSessions();
    }
    
    /**
     * 获取格式化后的 session 状态（供前端使用）
     * @returns {Object} 格式化后的状态 { currentSession, sessions: [], updatedAt }
     */
    getFormattedSessionState() {
        if (!this.sessionManager) {
            return { currentSession: null, sessions: [], updatedAt: new Date().toISOString() };
        }
        return this.sessionManager.getFormattedState();
    }
    
    /**
     * 获取服务状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        // 如果需要登录，返回简化状态，避免频繁检查 daemon 状态文件
        if (this._needsLogin) {
            return {
                initialized: this._initialized,
                initializing: this._initializing,
                initError: this._initError?.message || null,
                needsLogin: true,
                daemon: { running: false, needsLogin: true },
                // 简化 session 状态，避免调用 sessionManager.getStatus() 触发 daemon 状态检查
                session: this.sessionManager ? {
                    sessionCount: 0,
                    sessions: {},
                    isMonitoring: false,
                    needsLogin: true
                } : null,
                clientConnected: this._clientConnected,
                eventStatus: this._eventStatus
            };
        }
        
        return {
            initialized: this._initialized,
            initializing: this._initializing,
            initError: this._initError?.message || null,
            needsLogin: false,
            daemon: this.daemonManager ? this.daemonManager.getStatus() : null,
            session: this.sessionManager ? this.sessionManager.getStatus() : null,
            clientConnected: this._clientConnected,
            eventStatus: this._eventStatus
        };
    }
    
    /**
     * 检查是否已初始化
     * @returns {boolean} 是否已初始化
     */
    isInitialized() {
        return this._initialized;
    }
    
    /**
     * 检查 daemon 是否运行
     * @returns {Promise<boolean>} 是否运行
     */
    async isDaemonRunning() {
        // 如果需要登录，daemon 肯定没有运行
        if (this._needsLogin) {
            return false;
        }
        if (!this.daemonManager) {
            return false;
        }
        return await this.daemonManager.isDaemonRunningAsync();
    }

    // ============ HappyClient 消息通信相关方法 ============

    /**
     * 处理 Secret 变更
     * 清除旧的 session 状态和消息历史，并清理 daemon 中的旧 sessions
     * @param {string} newAnonId 新的 anonId
     */
    async onSecretChanged(newAnonId) {
        logInfo(`[HappyService] Secret changed, clearing old state. New anonId: ${newAnonId}`);
        
        // 1. 断开 HappyClient
        await this.disconnectClient();
        
        // 2. 清除 session 状态文件和内存状态
        if (this.sessionManager) {
            this.sessionManager.removeStateFile();
            this.sessionManager.clearSessions();
            this.sessionManager.workDirIndex = {};
            this.sessionManager.currentSession = null;
            
            // 关键：清理 daemon 中的所有旧 sessions
            // 这确保旧账户的 session 进程不会被新账户复用
            try {
                await this.sessionManager.cleanupAllSessions();
                logInfo('[HappyService] Daemon sessions cleaned up due to secret change');
            } catch (e) {
                logWarn(`[HappyService] Failed to cleanup daemon sessions: ${e.message}`);
            }
            
            logInfo('[HappyService] Session state cleared due to secret change');
        }
        
        // 3. 清除消息历史
        this.clearMessages();
        
        // 4. 重置 usage 数据
        this.resetUsage();
        
        // 5. 更新当前 anonId
        this._currentAnonId = newAnonId;
        if (this.sessionManager) {
            this.sessionManager.anonId = newAnonId;
        }
        
        // 6. 发送事件通知
        this.emit('happy:secretChanged', { anonId: newAnonId });
    }

    /**
     * 检测 Secret 是否变更
     * @param {string} anonId 当前的 anonId
     * @returns {boolean} 是否变更
     */
    isSecretChanged(anonId) {
        if (!this._currentAnonId) {
            // 首次设置，不算变更
            return false;
        }
        return this._currentAnonId !== anonId;
    }

    /**
     * 连接到 Happy Session 进行消息通信
     * @param {string} sessionName session 名称（默认 'main'）
     * @param {Object} options 连接选项
     * @param {string} options.anonId 当前 Secret 的 anonId（用于变更检测）
     * @returns {Promise<Object>} 连接结果
     */
    async connectToSession(sessionName = 'main', options = {}) {
        if (!this._initialized) {
            return { success: false, error: 'HappyService not initialized' };
        }
        
        // Secret 变更检测
        const { anonId } = options;
        let secretChanged = false;
        if (anonId && this.isSecretChanged(anonId)) {
            logInfo('[HappyService] Secret change detected, clearing old state...');
            await this.onSecretChanged(anonId);
            secretChanged = true;
        } else if (anonId && !this._currentAnonId) {
            // 首次设置 anonId
            this._currentAnonId = anonId;
            logInfo(`[HappyService] Initial anonId set: ${anonId}`);
        }
        
        let sessionId = this.getSessionId(sessionName);
        const sessionInfo = this.sessionManager.sessions[sessionName];
        
        // 验证 session 是否在 daemon 中仍然有效（解决热启动时动态 session 丢失问题）
        if (sessionId && sessionInfo) {
            const isValid = await this.sessionManager.findSessionById(sessionId);
            if (!isValid) {
                logInfo(`[HappyService] Session "${sessionName}" (${sessionId}) no longer valid in daemon, will recreate...`);
                sessionId = null; // 标记为需要重建
            }
        }
        
        // 如果 session 不存在或已失效，尝试重新创建
        if (!sessionId) {
            // 优先使用状态文件中保存的 workDir（支持动态创建的 session）
            const workDir = sessionInfo?.workDir || 
                            this.sessionManager.getWorkDirsFromConfig().find(w => w.name === sessionName)?.path ||
                            this._options.baseDir || 
                            process.cwd();
            
            logInfo(`[HappyService] Session "${sessionName}" not found or invalid, creating for workDir: ${workDir}`);
            try {
                const newSessionInfo = await this.sessionManager.createSession(sessionName, workDir, { allowReuse: false });
                sessionId = newSessionInfo?.sessionId;
                
                if (sessionId) {
                    logInfo(`[HappyService] Created new session: ${sessionId}`);
                    await this.sessionManager.saveStateFile();
                }
            } catch (e) {
                logError(`[HappyService] Failed to create session: ${e.message}`);
            }
        }
        
        if (!sessionId) {
            return { success: false, error: `Session "${sessionName}" does not exist and could not be created` };
        }
        
        // 如果已连接到相同 session，跳过
        if (this.happyClient && this._clientConnected && 
            this.happyClient.currentSessionId === sessionId) {
            logInfo('HappyClient already connected to target session, skipping');
            return { success: true, alreadyConnected: true, sessionId };
        }
        
        // 断开旧连接
        if (this.happyClient) {
            await this.disconnectClient();
        }
        
        try {
            logInfo(`Connecting HappyClient to session: ${sessionName} (${sessionId})`);
            
            // 发射进度事件：正在连接 Agent
            this.emit('daemon:startProgress', { 
                stage: 'connecting', 
                progress: 90, 
                message: 'daemon.startProgress.connecting' 
            });
            
            const secret = this._options.happySecret || process.env.HAPPY_SECRET;
            if (!secret) {
                logWarn('HAPPY_SECRET not configured, messaging disabled');
                return { success: false, error: 'HAPPY_SECRET not configured' };
            }
            
            this.happyClient = new HappyClient({
                secret,
                sessionId,
                workDir: this._options.baseDir || process.cwd(),
                autoSpawnSession: false,
                // 使用配置的权限模式，默认为 yolo
                permissionMode: this._options.permissionMode || 'yolo',
                // 使用配置的服务器地址
                serverUrl: this._options.serverUrl || undefined,
                conversation: {
                    autoConfirm: false,
                    historyLimit: this._maxMessages,
                    debug: this._options.debug || false
                }
            });
            
            // 设置事件转发
            this._setupClientEventForwarding();
            
            // 初始化连接
            await this.happyClient.initialize();
            
            this._clientConnected = true;
            this._updateEventStatus('ready');
            
            // 从持久化存储恢复历史数据
            const connectedSessionId = this.happyClient.currentSessionId;
            this._loadPersistedData(connectedSessionId);
            
            // 写入当前 session 信息到文件（供脚本读取）
            MessageStore.writeCurrentSession(connectedSessionId);
            
            logInfo(`HappyClient connected: ${connectedSessionId}`);
            
            this.emit('happy:connected', {
                sessionId: connectedSessionId,
                sessionName
            });
            
            return { success: true, sessionId: connectedSessionId };
            
        } catch (error) {
            logError(`HappyClient connection failed: ${error.message}`);
            this._clientConnected = false;
            
            this.emit('happy:error', {
                type: 'connect_failed',
                message: error.message
            });
            
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 设置 DaemonManager 事件转发
     * @private
     */
    _setupDaemonEventForwarding() {
        if (!this.daemonManager) return;
        
        // 转发 daemon 启动进度事件
        this.daemonManager.on('startProgress', (data) => {
            logDebug(`[HappyService] Forwarding daemon:startProgress: ${data.stage} (${data.progress}%)`);
            this.emit('daemon:startProgress', data);
        });
        
        // 转发 daemon 状态变化事件
        this.daemonManager.on('statusChanged', (data) => {
            logDebug('[HappyService] Forwarding daemon:statusChanged');
            this.emit('daemon:statusChanged', data);
        });
    }
    
    /**
     * 设置 HappyClient 事件转发
     * @private
     */
    _setupClientEventForwarding() {
        if (!this.happyClient) return;
        
        // WebSocket 连接事件
        this.happyClient.on('ws:connect', () => {
            this._clientConnected = true;
            this._updateEventStatus('ready');
            this.emit('happy:connected', {
                sessionId: this.happyClient.currentSessionId
            });
        });
        
        this.happyClient.on('ws:disconnect', (reason) => {
            this._clientConnected = false;
            this._updateEventStatus('disconnected');
            // 清空当前 session 文件
            MessageStore.clearCurrentSession();
            this.emit('happy:disconnected', { reason });
        });
        
        // 同步消息事件（来自同一 session 的所有消息）
        this.happyClient.on('conversation:syncMessage', (event) => {
            this._handleSyncMessage(event);
        });
        
        // 其他 session 的消息事件（用于多 session 消息同步）
        this.happyClient.on('otherSessionMessage', (event) => {
            this._handleOtherSessionMessage(event);
        });
        
        // 错误事件
        this.happyClient.on('error', (error) => {
            this.emit('happy:error', {
                type: 'runtime_error',
                message: error.message || String(error)
            });
        });
        
        // 流事件 - 开始
        this.happyClient.on('stream:start', () => {
            this._updateEventStatus('processing');
        });
        
        // 流事件 - 结束
        this.happyClient.on('conversation:streamEnded', () => {
            this._updateEventStatus('ready');
        });
        
        // 事件状态变更（ready, processing 等）- 来自 ConversationManager
        this.happyClient.on('conversation:eventStatus', (event) => {
            // 防抖机制：收到 ready 事件后，短时间内忽略 processing 事件
            // 这是因为 ready 事件和最后一条消息可能几乎同时到达，导致状态竞态
            if (event.eventType === 'ready') {
                this._lastReadyTime = Date.now();
                this._updateEventStatus('ready');
                
                // 重置 /clear 命令标志
                if (this._isClearCommand) {
                    this._isClearCommand = false;
                    logInfo('[HappyService] Clear command completed, flag reset');
                }
            } else if (event.eventType === 'processing') {
                const timeSinceReady = Date.now() - (this._lastReadyTime || 0);
                if (timeSinceReady < 500) {
                    return; // 忽略 ready 后 500ms 内的 processing 事件
                }
                this._updateEventStatus('processing');
            } else {
                this._updateEventStatus(event.eventType);
            }
        });
        
        // Daemon 创建 session 事件 - 同步更新 SessionManager 映射
        this.happyClient.on('daemon:sessionSpawned', async (event) => {
            const { sessionId, workDir } = event;
            if (!sessionId || !workDir || !this.sessionManager) {
                return;
            }
            
            logInfo(`[HappyService] Daemon spawned session: ${sessionId}, workDir: ${workDir}`);
            
            // 检查是否已存在该目录的映射
            const existingName = this.sessionManager.findSessionByWorkDir(workDir);
            
            // 生成或使用已有的 session 名称
            const sessionName = existingName || this.sessionManager.generateSessionName(workDir);
            
            // 使用统一的 _setSession 方法更新 sessions 和 workDirIndex
            this.sessionManager._setSession(sessionName, {
                sessionId,
                workDir: this.sessionManager.resolveWorkDir(workDir),
                status: 'active',
                createdAt: new Date().toISOString()
            });
            
            // 持久化状态
            await this.sessionManager.saveStateFile();
            
            logInfo(`[HappyService] Session mapping updated: ${sessionName} -> ${sessionId}`);
        });
    }
    
    /**
     * 处理同步消息
     * 发送原始消息给前端，由前端 Reducer 处理消息规范化和渲染
     * @param {Object} event 消息事件
     * @private
     */
    _handleSyncMessage(event) {
        const { role, messageId, createdAt, content, meta } = event;
        
        // 如果是 /clear 命令期间的消息，不发送到前端，不更新 usage
        if (this._isClearCommand) {
            logDebug(`[SyncMessage] Suppressed (clear command): role=${role}`);
            return;
        }
        
        // 调试日志：输出消息内容结构
        logInfo(`[SyncMessage] role=${role}, contentType=${content?.type || typeof content}`);
        if (content?.type === 'codex') {
            logInfo(`[SyncMessage] codex.data.type=${content.data?.type}, name=${content.data?.name}`);
        }
        if (content?.type === 'output') {
            logInfo(`[SyncMessage] output.data.type=${content.data?.type}`);
            if (content.data?.message?.content && Array.isArray(content.data.message.content)) {
                const types = content.data.message.content.map(p => p.type).join(', ');
                logInfo(`[SyncMessage] output.data.message.content types=[${types}]`);
            }
        }
        if (Array.isArray(content)) {
            const types = content.map(p => p.type).join(', ');
            logInfo(`[SyncMessage] content is array, types=[${types}]`);
        }
        
        // 构建原始消息对象（由前端 Reducer 处理规范化）
        // 注意：不再提取 text 和 tool，保持原始格式
        const messageData = {
            role: role === 'agent' ? 'assistant' : role,
            messageId,
            // 使用时间戳格式，便于前端处理
            createdAt: createdAt ? new Date(createdAt).getTime() : Date.now(),
            // 保留原始内容，前端 Normalizer 会处理
            content,
            meta
        };
        
        // 添加到历史记录
        this._addToHistory(messageData);
        
        // 发送原始消息事件（前端 Reducer 处理）
        this.emit('happy:message', messageData);
        
        // 根据角色更新状态
        if (role === 'user') {
            this._updateEventStatus('processing');
        } else if (role === 'agent' || role === 'assistant') {
            // AI 消息后等待更多输出或恢复 ready
            // 注：实际的 ready 状态由 stream:end 事件触发
        }
        
        // 提取并更新 usage 数据（上下文窗口使用量）
        // 如果是 /clear 命令期间，跳过 usage 更新（避免旧值覆盖）
        if (!this._isClearCommand) {
            const usageData = this._extractUsageData(content, meta);
            if (usageData) {
                this._latestUsage = usageData;
                this.emit('happy:usage', usageData);
                
                // 持久化 usage 数据
                const sessionId = this.happyClient?.currentSessionId;
                if (sessionId) {
                    MessageStore.saveUsage(sessionId, usageData, this._totalOutputTokens);
                }
                
                if (this._options.debug) {
                    logDebug(`[SyncMessage] Usage updated: contextSize=${usageData.contextSize}, input=${usageData.inputTokens}, output=${usageData.outputTokens}`);
                }
            }
        }
    }
    
    /**
     * 处理其他 Session 的消息
     * 将消息存储到 MessageStore，实现多 session 消息同步
     * @param {Object} event 消息事件
     * @private
     */
    _handleOtherSessionMessage(event) {
        const { sessionId, role, content, meta, messageId, createdAt } = event;
        
        if (!sessionId) {
            logWarn('[HappyService] Other session message missing sessionId');
            return;
        }
        
        // 构建消息对象
        const message = {
            role: role === 'agent' ? 'assistant' : role,
            messageId,
            timestamp: typeof createdAt === 'number' ? new Date(createdAt).toISOString() : createdAt,
            content,
            meta
        };
        
        // 存储到 MessageStore
        MessageStore.addMessage(sessionId, message);
        
        logDebug(`[HappyService] Stored message from other session: ${sessionId.substring(0, 8)}..., role=${message.role}`);
    }
    
    /**
     * 从消息内容中提取可读文本
     * 支持纯文本、文本块、工具调用等多种格式
     * @param {*} content 消息内容
     * @returns {string} 提取的文本
     * @private
     */
    _extractMessageText(content) {
        if (!content) return '';
        
        // 纯字符串
        if (typeof content === 'string') {
            return content;
        }
        
        // 单个文本块
        if (content.type === 'text') {
            return content.text || '';
        }
        
        // 工具调用（codex 格式）
        if (content.type === 'codex' && content.data) {
            if (content.data.type === 'tool-call') {
                return `[工具调用: ${content.data.name || 'unknown'}]`;
            }
            if (content.data.type === 'tool-result') {
                return `[工具结果: ${content.data.name || 'unknown'}]`;
            }
        }
        
        // output 格式（包含 message）
        if (content.type === 'output' && content.data?.message?.content) {
            return this._extractMessageText(content.data.message.content);
        }
        
        // 数组格式（多个内容块）
        if (Array.isArray(content)) {
            const parts = [];
            for (const item of content) {
                if (item.type === 'text' && item.text) {
                    parts.push(item.text);
                } else if (item.type === 'tool_use') {
                    parts.push(`[工具调用: ${item.name || 'unknown'}]`);
                } else if (item.type === 'tool_result') {
                    parts.push(`[工具结果]`);
                }
            }
            return parts.join('\n');
        }
        
        return '';
    }
    
    /**
     * 从消息内容中提取 usage 数据（上下文窗口使用量）
     * @param {Object} content 消息内容
     * @param {Object} meta 消息元数据
     * @returns {Object|null} usage 数据或 null
     * @private
     */
    _extractUsageData(content, meta) {
        let usage = null;
        
        // 尝试从多个位置提取 usage 数据
        // 1. 直接在 content.usage 中
        if (content?.usage) {
            usage = content.usage;
        }
        // 2. 在 content.data.usage 中 (output 格式)
        else if (content?.data?.usage) {
            usage = content.data.usage;
        }
        // 3. 在 content.data.message.usage 中
        else if (content?.data?.message?.usage) {
            usage = content.data.message.usage;
        }
        // 4. 在 meta.usage 中
        else if (meta?.usage) {
            usage = meta.usage;
        }
        
        if (!usage) return null;
        
        // 标准化 usage 数据结构
        const inputTokens = usage.input_tokens || usage.inputTokens || 0;
        const outputTokens = usage.output_tokens || usage.outputTokens || 0;
        const cacheCreation = usage.cache_creation_input_tokens || usage.cacheCreation || 0;
        const cacheRead = usage.cache_read_input_tokens || usage.cacheRead || 0;
        
        // 累加输出 tokens（整个 session 的累计）
        this._totalOutputTokens += outputTokens;
        
        // 计算上下文大小
        const contextSize = cacheCreation + cacheRead + inputTokens;
        
        return {
            inputTokens,
            outputTokens: this._totalOutputTokens,  // 返回累计值
            currentOutputTokens: outputTokens,       // 保留当前轮次值（调试用）
            cacheCreation,
            cacheRead,
            contextSize,
            timestamp: Date.now()
        };
    }
    
    /**
     * 获取最新的 usage 数据
     * @returns {Object|null} 最新的 usage 数据
     */
    getLatestUsage() {
        return this._latestUsage;
    }
    
    /**
     * 从消息内容中提取工具调用信息
     * @param {Object|Array} content 消息内容
     * @returns {Object|null} 工具信息或 null
     * @private
     */
    _extractToolInfo(content) {
        if (!content) return null;
        
        // 调试日志
        if (this._options.debug) {
            logDebug(`[_extractToolInfo] content type: ${typeof content}, isArray: ${Array.isArray(content)}`);
            if (typeof content === 'object' && !Array.isArray(content)) {
                logDebug(`[_extractToolInfo] content.type: ${content.type}`);
            }
        }
        
        // Codex 格式: content.type === 'codex' && content.data.type === 'tool-call'
        if (content.type === 'codex' && content.data) {
            if (content.data.type === 'tool-call') {
                return {
                    id: content.data.id || `tool-${Date.now()}`,
                    name: content.data.name || 'Unknown Tool',
                    input: content.data.input || content.data.arguments,
                    state: 'running',
                    createdAt: Date.now()
                };
            }
            if (content.data.type === 'tool-call-result') {
                return {
                    id: content.data.id || content.data.tool_call_id || `tool-${Date.now()}`,
                    name: content.data.name || 'Unknown Tool',
                    result: content.data.result || content.data.output,
                    state: content.data.error ? 'error' : 'completed'
                };
            }
        }
        
        // Output 格式: content.type === 'output' && data.message.content 包含 tool_use
        if (content.type === 'output' && content.data?.message?.content) {
            const parts = content.data.message.content;
            if (Array.isArray(parts)) {
                for (const part of parts) {
                    if (part.type === 'tool_use') {
                        return {
                            id: part.id || `tool-${Date.now()}`,
                            name: part.name,
                            input: part.input,
                            state: 'running',
                            createdAt: Date.now()
                        };
                    }
                    if (part.type === 'tool_result') {
                        return {
                            id: part.tool_use_id || `tool-${Date.now()}`,
                            name: 'Tool Result',
                            result: part.content,
                            state: part.is_error ? 'error' : 'completed'
                        };
                    }
                }
            }
        }
        
        // Output 格式变体: content.type === 'output' && data.type === 'assistant'
        if (content.type === 'output' && content.data?.type === 'assistant' && content.data?.message?.content) {
            const parts = content.data.message.content;
            if (Array.isArray(parts)) {
                for (const part of parts) {
                    if (part.type === 'tool_use') {
                        return {
                            id: part.id || `tool-${Date.now()}`,
                            name: part.name,
                            input: part.input,
                            state: 'running',
                            createdAt: Date.now()
                        };
                    }
                }
            }
        }
        
        // 数组格式: content 直接是数组，包含 tool_use / tool_result
        if (Array.isArray(content)) {
            for (const part of content) {
                if (part.type === 'tool_use') {
                    return {
                        id: part.id || `tool-${Date.now()}`,
                        name: part.name,
                        input: part.input,
                        state: 'running',
                        createdAt: Date.now()
                    };
                }
                if (part.type === 'tool_result') {
                    return {
                        id: part.tool_use_id || `tool-${Date.now()}`,
                        name: 'Tool Result',
                        result: part.content,
                        state: part.is_error ? 'error' : 'completed'
                    };
                }
            }
        }
        
        // 直接的工具字段
        if (content.tool) {
            return content.tool;
        }
        
        // 尝试从文本中检测工具调用（作为后备方案）
        // 如果文本包含 "[工具调用: ToolName]" 格式，提取工具名称
        if (typeof content === 'string' && content.includes('[工具调用:')) {
            const match = content.match(/\[工具调用:\s*(\w+)\]/);
            if (match) {
                logDebug(`[_extractToolInfo] Detected tool call from text: ${match[1]}`);
                // 注意：这种情况下我们没有完整的工具数据，只是一个提示
                // 不返回工具对象，因为我们没有 input 数据
            }
        }
        
        return null;
    }
    
    /**
     * 更新事件状态
     * @param {string} status 状态
     * @private
     */
    _updateEventStatus(status) {
        if (this._eventStatus !== status) {
            this._eventStatus = status;
            this.emit('happy:eventStatus', {
                eventType: status,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * 从持久化存储加载历史数据
     * @param {string} sessionId Session ID
     * @private
     */
    _loadPersistedData(sessionId) {
        if (!sessionId) return;
        
        try {
            // 加载消息历史
            const messages = MessageStore.getMessages(sessionId, this._maxMessages);
            if (messages && messages.length > 0) {
                this._messageHistory = messages;
                logInfo(`[HappyService] Loaded ${messages.length} messages from storage for session: ${sessionId.substring(0, 8)}...`);
            } else {
                this._messageHistory = [];
            }
            
            // 加载 usage 数据
            const savedUsage = MessageStore.getUsage(sessionId);
            if (savedUsage) {
                this._latestUsage = savedUsage.usage;
                this._totalOutputTokens = savedUsage.totalOutputTokens || 0;
                if (savedUsage.usage) {
                    logInfo(`[HappyService] Loaded usage data: contextSize=${savedUsage.usage.contextSize}, output=${this._totalOutputTokens}`);
                    // 发送 usage 事件，让 UI 更新显示
                    this.emit('happy:usage', savedUsage.usage);
                }
            }
        } catch (error) {
            logWarn(`[HappyService] Failed to load persisted data: ${error.message}`);
            this._messageHistory = [];
        }
    }
    
    /**
     * 添加消息到历史记录
     * @param {Object} message 消息对象
     * @private
     */
    _addToHistory(message) {
        this._messageHistory.push(message);
        
        // 限制历史记录数量
        if (this._messageHistory.length > this._maxMessages) {
            this._messageHistory = this._messageHistory.slice(-this._maxMessages);
        }
        
        // 持久化到存储
        const sessionId = this.happyClient?.currentSessionId;
        if (sessionId) {
            MessageStore.addMessage(sessionId, message);
        }
    }
    
    /**
     * 发送消息到 Happy AI
     * @param {string} text 消息内容
     * @returns {Promise<Object>} 发送结果
     */
    async sendMessage(text) {
        logInfo(`[HappyService] sendMessage called, text: ${text?.substring(0, 50)}`);
        logInfo(`[HappyService] happyClient: ${!!this.happyClient}, _clientConnected: ${this._clientConnected}`);
        
        if (!this.happyClient || !this._clientConnected) {
            logError('[HappyService] HappyClient not connected');
            return { success: false, error: 'HappyClient not connected' };
        }
        
        if (!text || typeof text !== 'string') {
            logError('[HappyService] Invalid message content');
            return { success: false, error: 'Invalid message content' };
        }
        
        try {
            logInfo('[HappyService] Processing message...');
            this._updateEventStatus('processing');
            
            // 检测 /clear 命令，重置 usage 数据和记忆内容区
            const isClearCommand = text.trim() === '/clear';
            if (isClearCommand) {
                // 设置标志，用于跳过 /clear 响应中的 usage 更新
                this._isClearCommand = true;
                // 清空消息历史和 usage 数据（内部会重置 conversationId）
                this.clearMessages();
                // 更新 current-session.json（此时 conversationId 为 null）
                const sessionId = this.happyClient?.currentSessionId;
                if (sessionId) {
                    MessageStore.writeCurrentSession(sessionId);
                }
            }
            
            // 创建用户消息对象
            const userMessage = {
                role: 'user',
                text,
                timestamp: new Date().toISOString()
            };
            
            // 添加到历史并发送事件（乐观更新）
            // /clear 命令不记录到历史中
            if (!isClearCommand) {
                this._addToHistory(userMessage);
                // 确保 conversationId 存在并更新 current-session.json
                const sessionId = this.happyClient?.currentSessionId;
                if (sessionId) {
                    // getCurrentConversationId 会自动生成新的（如果是 /clear 后的第一条消息）
                    MessageStore.getCurrentConversationId(sessionId);
                    MessageStore.writeCurrentSession(sessionId);
                }
            }
            this.emit('happy:message', userMessage);
            
            // 发送消息（附加系统提示词）
            const result = await this.happyClient.sendMessage(text, {
                appendSystemPrompt: systemPrompt
            });
            
            return { success: true, result };
            
        } catch (error) {
            logError(`Failed to send message: ${error.message}`);
            this._updateEventStatus('ready');
            
            this.emit('happy:error', {
                type: 'send_failed',
                message: error.message
            });
            
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 获取消息历史
     * @param {number} limit 限制数量
     * @returns {Array} 消息列表
     */
    getMessages(limit = 50) {
        if (limit <= 0) return [];
        return this._messageHistory.slice(-limit);
    }
    
    /**
     * 清空消息历史
     */
    clearMessages() {
        this._messageHistory = [];
        
        // 清空持久化存储
        const sessionId = this.happyClient?.currentSessionId;
        if (sessionId) {
            MessageStore.clearSession(sessionId);
            logInfo(`[HappyService] Cleared persisted messages for session: ${sessionId.substring(0, 8)}...`);
        }
    }
    
    /**
     * 恢复消息历史（从记忆系统恢复）
     * @param {Array} messages 消息数组 [{ role, text, messageId, timestamp, ... }]
     * @returns {Object} { success, count, error }
     */
    restoreMessages(messages) {
        if (!Array.isArray(messages)) {
            return { success: false, error: 'Messages must be an array' };
        }
        
        const sessionId = this.happyClient?.currentSessionId;
        if (!sessionId) {
            return { success: false, error: 'No active session' };
        }
        
        try {
            // 更新内存中的消息历史
            this._messageHistory = messages.map(msg => ({
                role: msg.role,
                text: msg.text,
                messageId: msg.messageId || `restored-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                timestamp: msg.timestamp || new Date().toISOString(),
                // 保留其他可选字段
                ...(msg.tool && { tool: msg.tool }),
                ...(msg.kind && { kind: msg.kind }),
                ...(msg.content && { content: msg.content }),
                ...(msg.meta && { meta: msg.meta })
            }));
            
            // 更新持久化存储
            MessageStore.setMessages(sessionId, this._messageHistory);
            
            logInfo(`[HappyService] Restored ${messages.length} messages for session: ${sessionId.substring(0, 8)}...`);
            
            // 发送恢复完成事件，通知前端刷新
            this.emit('happy:messagesRestored', { 
                count: messages.length,
                sessionId 
            });
            
            return { success: true, count: messages.length };
        } catch (error) {
            logError(`[HappyService] Failed to restore messages: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 重置上下文使用量数据（通常在 /clear 命令后调用）
     */
    resetUsage() {
        this._latestUsage = null;
        this._totalOutputTokens = 0;  // 重置累计输出
        this.emit('happy:usage', null);
        
        // 重置持久化存储中的 usage 数据
        const sessionId = this.happyClient?.currentSessionId;
        if (sessionId) {
            MessageStore.saveUsage(sessionId, null, 0);
        }
        
        logInfo('[HappyService] Usage data reset (context cleared)');
    }
    
    /**
     * 允许权限请求
     * @param {string} sessionId 会话 ID（可选，默认使用当前 session）
     * @param {string} permissionId 权限请求 ID
     * @param {string} mode 可选的模式 ('acceptEdits')
     * @param {Array} allowedTools 可选的允许工具列表
     * @returns {Promise<Object>} 结果
     */
    async allowPermission(sessionId, permissionId, mode, allowedTools) {
        if (!this.happyClient) {
            return { success: false, error: 'HappyClient not connected' };
        }
        
        const targetSessionId = sessionId || this.happyClient.currentSessionId;
        if (!targetSessionId) {
            return { success: false, error: 'No session ID' };
        }
        
        try {
            logInfo(`Allowing permission ${permissionId} for session ${targetSessionId}`);
            
            const request = {
                id: permissionId,
                approved: true,
                mode: mode || undefined,
                allowTools: allowedTools || undefined
            };
            
            await this.happyClient.sessionRPC(targetSessionId, 'permission', request);
            
            return { success: true };
        } catch (error) {
            logError(`Failed to allow permission: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 拒绝权限请求
     * @param {string} sessionId 会话 ID（可选，默认使用当前 session）
     * @param {string} permissionId 权限请求 ID
     * @returns {Promise<Object>} 结果
     */
    async denyPermission(sessionId, permissionId) {
        if (!this.happyClient) {
            return { success: false, error: 'HappyClient not connected' };
        }
        
        const targetSessionId = sessionId || this.happyClient.currentSessionId;
        if (!targetSessionId) {
            return { success: false, error: 'No session ID' };
        }
        
        try {
            logInfo(`Denying permission ${permissionId} for session ${targetSessionId}`);
            
            const request = {
                id: permissionId,
                approved: false
            };
            
            await this.happyClient.sessionRPC(targetSessionId, 'permission', request);
            
            return { success: true };
        } catch (error) {
            logError(`Failed to deny permission: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 中止当前会话任务
     * @param {string} sessionId 会话 ID（可选，默认使用当前 session）
     * @returns {Promise<Object>} 结果
     */
    async abortSession(sessionId) {
        if (!this.happyClient) {
            return { success: false, error: 'HappyClient not connected' };
        }
        
        const targetSessionId = sessionId || this.happyClient.currentSessionId;
        if (!targetSessionId) {
            return { success: false, error: 'No session ID' };
        }
        
        try {
            logInfo(`Aborting session ${targetSessionId}`);
            
            await this.happyClient.abortSession(targetSessionId);
            this._updateEventStatus('ready');
            
            return { success: true };
        } catch (error) {
            logError(`Failed to abort session: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 检查 HappyClient 是否已连接
     * @returns {boolean} 是否已连接
     */
    isClientConnected() {
        return this._clientConnected && this.happyClient?.isConnected;
    }
    
    /**
     * 设置权限模式（热切换，无需重启）
     * @param {string} mode 权限模式 (default, acceptEdits, plan, bypassPermissions, yolo 等)
     * @returns {Object} 结果 { success: boolean, error?: string }
     */
    setPermissionMode(mode) {
        try {
            logInfo(`[HappyService] Setting permission mode to: ${mode}`);
            
            // 1. 更新内部配置
            this._options.permissionMode = mode;
            
            // 2. 如果 HappyClient 已连接，同步更新
            if (this.happyClient && this._clientConnected) {
                this.happyClient.setPermissionMode(mode);
                logInfo(`[HappyService] HappyClient permission mode updated to: ${mode}`);
            }
            
            return { success: true };
        } catch (error) {
            logError(`[HappyService] Failed to set permission mode: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 获取当前权限模式
     * @returns {string} 当前权限模式
     */
    getPermissionMode() {
        if (this.happyClient && this._clientConnected) {
            return this.happyClient.getPermissionMode();
        }
        return this._options.permissionMode || 'default';
    }
    
    /**
     * 断开 HappyClient 连接
     * @returns {Promise<void>}
     */
    async disconnectClient() {
        if (this.happyClient) {
            try {
                // 移除所有事件监听器
                this.happyClient.removeAllListeners();
                
                // 断开连接
                if (this.happyClient.isConnected) {
                    await this.happyClient.disconnect();
                }
            } catch (error) {
                logWarn(`Error disconnecting HappyClient: ${error.message}`);
            }
            
            this.happyClient = null;
            this._clientConnected = false;
            this._updateEventStatus('disconnected');
        }
    }

    // ============================================================================
    // 工作目录切换相关方法
    // ============================================================================

    /**
     * 热切换工作目录
     * @param {string} newPath 新的工作目录路径
     * @param {string} anonId 当前账户的 anonId（用于账户变更检测）
     * @returns {Promise<Object>} { success, sessionName, sessionId, error }
     */
    async switchWorkDir(newPath, anonId = null) {
        if (!this._initialized) {
            return { success: false, error: 'HappyService not initialized' };
        }
        
        if (!newPath) {
            return { success: false, error: 'Work directory path is required' };
        }
        
        try {
            logInfo(`[HappyService] Switching work directory to: ${newPath}`);
            
            // 1. 断开当前 HappyClient
            await this.disconnectClient();
            
            // 2. 如果提供了 anonId，设置到 SessionManager（会自动检测账户变更）
            if (anonId && this.sessionManager) {
                this.sessionManager.setAnonId(anonId);
            }
            
            // 3. 为新目录创建或获取 session
            const { name: sessionName, sessionInfo } = await this.sessionManager.createSessionForWorkDir(newPath);
            
            if (!sessionInfo || !sessionInfo.sessionId) {
                return { success: false, error: 'Failed to create session for directory' };
            }
            
            // 4. 切换当前 session
            await this.sessionManager.switchSession(sessionName);
            
            // 5. 更新 _options.baseDir
            this._options.baseDir = newPath;
            
            // 6. 重新连接 HappyClient
            const secret = this._options.happySecret || process.env.HAPPY_SECRET;
            if (!secret) {
                logWarn('HAPPY_SECRET not configured, client connection skipped');
                return { 
                    success: true, 
                    sessionName, 
                    sessionId: sessionInfo.sessionId,
                    connected: false 
                };
            }
            
            this.happyClient = new HappyClient({
                secret,
                sessionId: sessionInfo.sessionId,
                workDir: newPath,
                // 启用 daemon 和 autoSpawnSession，以便在指定 sessionId 不存在时创建新 session
                useDaemon: true,
                autoSpawnSession: true,
                daemonClient: this.daemonManager?.daemonClient,
                permissionMode: this._options.permissionMode || 'yolo',
                serverUrl: this._options.serverUrl || undefined,
                conversation: {
                    autoConfirm: false,
                    historyLimit: this._maxMessages,
                    debug: this._options.debug || false
                }
            });
            
            // 7. 设置事件转发
            this._setupClientEventForwarding();
            
            // 8. 初始化连接
            await this.happyClient.initialize();
            
            this._clientConnected = true;
            this._updateEventStatus('ready');
            
            // 9. 加载对应的消息历史
            this._loadPersistedData(sessionInfo.sessionId);
            
            // 10. 更新当前 session 文件
            MessageStore.writeCurrentSession(sessionInfo.sessionId);
            
            logInfo(`[HappyService] Work directory switched successfully: ${sessionName} (${sessionInfo.sessionId})`);
            
            this.emit('happy:workDirSwitched', {
                sessionName,
                sessionId: sessionInfo.sessionId,
                workDir: newPath
            });
            
            // 发送连接成功事件（带正确的 sessionId）
            this.emit('happy:connected', {
                sessionId: sessionInfo.sessionId,
                sessionName
            });
            
            return { 
                success: true, 
                sessionName, 
                sessionId: sessionInfo.sessionId,
                connected: true 
            };
            
        } catch (error) {
            logError(`[HappyService] Failed to switch work directory: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 获取当前工作目录
     * @returns {string|null} 当前工作目录路径
     */
    getCurrentWorkDir() {
        const currentSession = this.sessionManager?.getCurrentSession();
        return currentSession?.workDir || this._options.baseDir || null;
    }

    /**
     * 获取所有已映射的工作目录
     * @returns {Array<{name: string, workDir: string, sessionId: string, isCurrent: boolean}>}
     */
    listWorkDirs() {
        if (!this.sessionManager) {
            return [];
        }
        return this.sessionManager.listWorkDirs();
    }
    
    /**
     * 清理资源（退出时调用）
     * 轻量级清理：只断开连接，保留 daemon 和 session
     * @returns {Promise<void>}
     */
    async cleanup() {
        logInfo('Starting HappyService cleanup (preserving daemon/sessions)...');
        
        try {
            // 1. 断开 HappyClient
            await this.disconnectClient();
            
            // 2. 停止监控
            if (this.sessionManager) {
                this.sessionManager.stopMonitoring();
            }
            
            // 3. 不清理 daemon 和 session（保留供下次启动复用）
            // 4. 不删除状态文件
            
            // 5. 清理 SessionManager 内存引用
            if (this.sessionManager) {
                this.sessionManager.cleanup();
                this.sessionManager = null;
            }
            
            // 6. 清理 DaemonManager 内存引用
            this.daemonManager = null;
            
            // 7. 清空消息历史
            this._messageHistory = [];
            
            // 重置状态
            this._initialized = false;
            this._initializing = false;
            this._initError = null;
            
            logInfo('HappyService cleanup complete (daemon/sessions preserved)');
            
        } catch (error) {
            logError(`HappyService cleanup failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 重新初始化
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 初始化结果
     */
    async reinitialize(options = {}) {
        await this.cleanup();
        return await this.initialize(options || this._options);
    }

    /**
     * 终止孤儿会话进程（备用清理方法）
     * 直接通过系统命令查找并终止 --started-by daemon 的进程
     * @private
     * @returns {Promise<void>}
     */
    async _killOrphanedSessionProcesses() {
        const isWindows = process.platform === 'win32';
        
        try {
            logInfo('HappyService: Checking for orphaned session processes...');
            
            if (isWindows) {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                
                // 使用 WMIC 查找包含 --started-by daemon 的进程
                try {
                    const { stdout } = await execAsync(
                        'wmic process where "commandline like \'%--started-by daemon%\'" get processid',
                        { timeout: 10000 }
                    );
                    
                    // 解析 PID 列表
                    const pids = stdout
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => /^\d+$/.test(line));
                    
                    if (pids.length === 0) {
                        logInfo('HappyService: No orphaned session processes found');
                        return;
                    }
                    
                    logInfo(`HappyService: Found ${pids.length} orphaned session processes, terminating...`);
                    
                    // 逐个终止
                    for (const pid of pids) {
                        try {
                            await execAsync(`taskkill /PID ${pid} /F /T`, { timeout: 5000 });
                            logInfo(`HappyService: Terminated orphaned process PID: ${pid}`);
                        } catch (e) {
                            logWarn(`HappyService: Failed to terminate PID ${pid}: ${e.message}`);
                        }
                    }
                    
                    logInfo('HappyService: Orphaned session cleanup complete');
                    
                } catch (wmicError) {
                    // WMIC 命令可能失败，不影响主流程
                    logDebug(`HappyService: WMIC query failed: ${wmicError.message}`);
                }
                
            } else {
                // Unix/Mac: 使用 pkill 或 pgrep
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                
                try {
                    // 查找进程
                    const { stdout } = await execAsync(
                        "pgrep -f '\\-\\-started-by daemon'",
                        { timeout: 5000 }
                    );
                    
                    const pids = stdout.trim().split('\n').filter(Boolean);
                    
                    if (pids.length === 0) {
                        logInfo('HappyService: No orphaned session processes found');
                        return;
                    }
                    
                    logInfo(`HappyService: Found ${pids.length} orphaned session processes, terminating...`);
                    
                    // 逐个终止
                    for (const pid of pids) {
                        try {
                            process.kill(parseInt(pid), 'SIGTERM');
                            logInfo(`HappyService: Terminated orphaned process PID: ${pid}`);
                        } catch (e) {
                            logWarn(`HappyService: Failed to terminate PID ${pid}: ${e.message}`);
                        }
                    }
                    
                    logInfo('HappyService: Orphaned session cleanup complete');
                    
                } catch (pgrepError) {
                    // pgrep 找不到进程时会返回非零退出码
                    if (pgrepError.code === 1) {
                        logInfo('HappyService: No orphaned session processes found');
                    } else {
                        logDebug(`HappyService: pgrep failed: ${pgrepError.message}`);
                    }
                }
            }
            
        } catch (error) {
            logWarn(`HappyService: Error checking orphaned processes: ${error.message}`);
        }
    }

    /**
     * daemon 停止后的处理
     * 清理本地状态，断开连接，终止孤儿进程
     * @returns {Promise<void>}
     */
    async onDaemonStopped() {
        logInfo('HappyService: Handling daemon stopped...');
        
        try {
            // 1. 断开 HappyClient
            await this.disconnectClient();
            
            // 2. 清理本地状态文件
            if (this.sessionManager) {
                this.sessionManager.removeStateFile();
                this.sessionManager.clearSessions();
            }
            
            // 3. 备用清理：终止可能残留的孤儿会话进程
            await this._killOrphanedSessionProcesses();
            
            logInfo('HappyService: Daemon stopped handling complete');
        } catch (error) {
            logError(`HappyService: onDaemonStopped failed - ${error.message}`);
        }
    }

    /**
     * 设置 Claude Code 环境变量获取回调
     * 应该在 initialize 之前调用
     * @param {Function} getter 获取环境变量的回调函数，返回 { ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ... }
     */
    setClaudeCodeEnvGetter(getter) {
        this._getClaudeCodeEnv = getter;
        logInfo('Claude Code env getter configured');
    }

    /**
     * 重启 daemon（使新配置生效）
     * 重启后会重新创建/复用 session
     * @param {Object} newOptions 可选的新配置（如新的 happySecret、anonId）
     * @returns {Promise<Object>} 重启结果 { success: boolean, error?: string, sessions?: Object }
     */
    async restartDaemon(newOptions = {}) {
        if (!this.daemonManager) {
            return { success: false, error: 'HappyService not initialized' };
        }
        
        try {
            logInfo('HappyService: Restarting daemon...');
            
            // 更新配置（如果提供了新的配置）
            if (newOptions && Object.keys(newOptions).length > 0) {
                logInfo('HappyService: Updating options with new config');
                this._options = { ...this._options, ...newOptions };
                
                // 如果提供了新的 anonId，检测是否是账号切换
                if (newOptions.anonId) {
                    const isAccountSwitch = this._currentAnonId && this._currentAnonId !== newOptions.anonId;
                    
                    if (isAccountSwitch) {
                        logInfo(`HappyService: Account switch detected (${this._currentAnonId} -> ${newOptions.anonId}), clearing machineId...`);
                        // 清理 ~/.happy/settings.json 中的 machineId（新账号应该注册新的 machine）
                        this._clearMachineId();
                    }
                    
                    this._currentAnonId = newOptions.anonId;
                    if (this.sessionManager) {
                        this.sessionManager.anonId = newOptions.anonId;
                    }
                    logInfo(`HappyService: Updated anonId to ${newOptions.anonId}`);
                }
            }
            
            // 1. 断开 HappyClient
            await this.disconnectClient();
            
            // 2. 重启 daemon
            const result = await this.daemonManager.restartDaemon();
            
            if (!result) {
                logError('HappyService: Daemon restart failed');
                return { success: false, error: 'Daemon restart failed' };
            }
            
            logInfo('HappyService: Daemon restart successful');
            
            // 3. 重新创建 session（daemon 刚重启，是冷启动场景）
            let sessions = {};
            if (this.sessionManager) {
                logInfo('HappyService: Recreating sessions after daemon restart...');
                sessions = await this.sessionManager.createAllSessions({ wasDaemonRunning: false });
            }
            
            return { success: true, sessions };
            
        } catch (error) {
            logError(`HappyService: Daemon restart error - ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 登录后启动 daemon
     * 用于用户首次登录或重新登录后，完成 daemon 启动流程
     * @param {Object} options 配置选项
     * @param {string} options.happySecret Happy AI secret
     * @returns {Promise<Object>} 启动结果 { success: boolean, error?: string, daemon?: Object, sessions?: Object }
     */
    async startDaemonAfterLogin(options = {}) {
        // 检查必要的组件是否存在（登出后 reset 会设置 _initialized = false，但组件仍然存在）
        if (!this.daemonManager || !this.sessionManager) {
            return { success: false, error: 'HappyService not initialized (missing components)' };
        }
        
        if (!this._needsLogin) {
            // 已经登录过，不需要重新启动
            logInfo('HappyService: Already logged in, daemon should be running');
            return {
                success: true,
                daemon: this.daemonManager?.getStatus(),
                sessions: this.sessionManager?.getAllSessions() || {}
            };
        }
        
        if (!options.happySecret) {
            return { success: false, error: 'happySecret is required' };
        }
        
        try {
            logInfo('HappyService: Starting daemon after login...');
            
            // 更新配置
            this._options.happySecret = options.happySecret;
            
            // 检测 daemon 是否已在运行
            logInfo('Checking daemon status...');
            const wasDaemonRunning = await this.daemonManager.isDaemonRunningAsync();
            logInfo(`  Daemon was running: ${wasDaemonRunning}`);
            
            // 启动 daemon
            logInfo('Ensuring Happy Daemon running...');
            await this.daemonManager.ensureDaemonRunning();
            
            // 计算 anonId 并设置到 SessionManager
            try {
                const normalized = KeyUtils.normalizeSecretKey(options.happySecret);
                const secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
                const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
                const anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
                this._currentAnonId = anonId;
                if (this.sessionManager) {
                    this.sessionManager.setAnonId(anonId);
                }
                logInfo(`[HappyService] AnonId set: ${anonId}`);
            } catch (e) {
                logWarn(`[HappyService] Failed to derive anonId: ${e.message}`);
            }
            
            // 创建 sessions
            logInfo('Creating Sessions...');
            // 发射进度事件：正在创建会话
            this.emit('daemon:startProgress', { 
                stage: 'creating_session', 
                progress: 80, 
                message: 'daemon.startProgress.creatingSession' 
            });
            
            const sessionResults = this.sessionManager 
                ? await this.sessionManager.createAllSessions({ wasDaemonRunning })
                : {};
            
            // 启动监控
            if (this.sessionManager && this._options.autoMonitor !== false) {
                logInfo('Starting Session monitoring...');
                this.sessionManager.startMonitoring();
            }
            
            this._needsLogin = false;
            this._initialized = true;  // 标记为已初始化（登出后重新登录场景）
            
            logInfo('HappyService: Daemon started after login');
            
            return {
                success: true,
                daemon: this.daemonManager.getStatus(),
                sessions: sessionResults
            };
            
        } catch (error) {
            logError(`HappyService: startDaemonAfterLogin failed - ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 检查是否需要登录
     * @returns {boolean}
     */
    needsLogin() {
        return this._needsLogin === true;
    }
}

// 创建单例
const HappyService = new HappyServiceClass();

// 导出
module.exports = HappyService;

// 同时导出内部类以便高级用法
module.exports.DaemonManager = DaemonManager;
module.exports.SessionManager = SessionManager;
module.exports.HappyServiceClass = HappyServiceClass;
module.exports.config = config;
module.exports.utils = require('./utils');
