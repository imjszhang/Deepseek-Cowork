/**
 * Happy Session 管理器
 * 
 * 管理 Happy Session 的生命周期：
 * - 为每个 workDir 创建 session
 * - 将 session 映射写入状态文件
 * - 监控 session 状态，自动重连
 * 
 * 创建时间: 2026-01-09
 * 基于: happy-service/SessionManager.js
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const config = require('./config');
const DaemonManager = require('./DaemonManager');
const { logDebug, logInfo, logWarn, logError, sleep, isProcessRunning, resolvePath } = require('./utils');

class SessionManager extends EventEmitter {
    /**
     * 构造函数
     * @param {Object} options 配置选项
     * @param {string} options.stateDir 状态文件目录
     * @param {string} options.stateFileName 状态文件名
     * @param {Array} options.workDirs 工作目录配置
     * @param {string} options.baseDir 基础目录（相对路径基于此解析）
     * @param {number} options.httpTimeout HTTP 请求超时
     * @param {number} options.monitorInterval 监控间隔
     * @param {DaemonManager} options.daemonManager 已有的 DaemonManager 实例
     */
    constructor(options = {}) {
        super();
        
        // 基础目录（相对路径基于此解析）
        this.baseDir = options.baseDir || process.cwd();
        
        // 解析 stateDir
        const stateDir = this._resolveStateDir(options.stateDir);
        
        this.options = {
            stateDir: stateDir,
            stateFileName: options.stateFileName || config.STATE_FILE_NAME,
            happyHomeDir: options.happyHomeDir || config.HAPPY_HOME_DIR,
            httpTimeout: options.httpTimeout || config.HTTP_TIMEOUT,
            monitorInterval: options.monitorInterval || config.MONITOR_INTERVAL,
            sessionCreateTimeout: options.sessionCreateTimeout || config.SESSION_CREATE_TIMEOUT,
            processingReuseMaxAgeMs: options.processingReuseMaxAgeMs || 5 * 60 * 1000,
            workDirs: this._resolveWorkDirs(options.workDirs)
        };
        
        // 状态文件路径
        this.stateFilePath = path.join(this.options.stateDir, this.options.stateFileName);
        
        // 失败日志文件路径
        this.failureLogPath = path.join(this.options.stateDir, config.FAILURE_LOG_FILE_NAME || '.happy-failures.json');
        this.failureLogMaxEntries = config.FAILURE_LOG_MAX_ENTRIES || 100;
        
        // 使用外部传入的 DaemonManager 或创建新的
        this.daemonManager = options.daemonManager || new DaemonManager({
            happyHomeDir: this.options.happyHomeDir
        });
        
        // 内存中的 session 状态
        this.sessions = {};
        this.stateCreatedAt = null;
        
        // 新增：账户标识和目录索引
        this.anonId = null;           // 当前账户的 anonId
        this.currentSession = null;   // 当前激活的 session 名称
        this.workDirIndex = {};       // 目录路径 -> session 名称的索引
        this._accountChanged = false; // 账户变更标志，用于强制清理旧 sessions
        
        // 监控定时器
        this.monitorTimer = null;
        this.isMonitoring = false;
        
        logInfo('SessionManager initialized');
        logInfo(`State file: ${this.stateFilePath}`);
        logInfo(`workDirs: ${JSON.stringify(this.options.workDirs)}`);
    }

    /**
     * 解析 stateDir 配置
     * @param {string} optionsStateDir 构造函数参数中的 stateDir
     * @returns {string} 解析后的 stateDir 绝对路径
     */
    _resolveStateDir(optionsStateDir) {
        // 1. 环境变量优先
        if (process.env.HAPPY_STATE_DIR) {
            const envStateDir = process.env.HAPPY_STATE_DIR;
            if (path.isAbsolute(envStateDir)) {
                return envStateDir;
            }
            return path.resolve(this.baseDir, envStateDir);
        }
        
        // 2. 构造函数参数
        if (optionsStateDir) {
            if (path.isAbsolute(optionsStateDir)) {
                return optionsStateDir;
            }
            return path.resolve(this.baseDir, optionsStateDir);
        }
        
        // 3. 配置默认值
        if (config.STATE_DIR) {
            if (path.isAbsolute(config.STATE_DIR)) {
                return config.STATE_DIR;
            }
            return path.resolve(this.baseDir, config.STATE_DIR);
        }
        
        // 4. 默认值：baseDir/happy-state
        return path.join(this.baseDir, 'happy-state');
    }

    /**
     * 解析 workDirs 配置
     * @param {Array} optionsWorkDirs 构造函数参数中的 workDirs
     * @returns {Array} workDirs 数组
     */
    _resolveWorkDirs(optionsWorkDirs) {
        // 1. 环境变量优先（JSON 格式）
        if (process.env.HAPPY_WORK_DIRS) {
            try {
                const envWorkDirs = JSON.parse(process.env.HAPPY_WORK_DIRS);
                if (Array.isArray(envWorkDirs) && envWorkDirs.length > 0) {
                    logInfo('Using HAPPY_WORK_DIRS env config');
                    return envWorkDirs;
                }
            } catch (error) {
                logWarn(`Failed to parse HAPPY_WORK_DIRS env: ${error.message}`);
            }
        }
        
        // 2. 构造函数参数
        if (optionsWorkDirs && Array.isArray(optionsWorkDirs) && optionsWorkDirs.length > 0) {
            logInfo('Using constructor workDirs config');
            return optionsWorkDirs;
        }
        
        // 3. 配置默认值
        if (config.WORK_DIRS && Array.isArray(config.WORK_DIRS) && config.WORK_DIRS.length > 0) {
            logInfo('Using config file workDirs');
            return config.WORK_DIRS;
        }
        
        // 4. 默认值：监控当前目录
        logInfo('Using default workDirs config');
        return [{ name: 'main', path: '.' }];
    }

    /**
     * 获取 workDirs 配置
     * @returns {Array} workDirs 数组
     */
    getWorkDirsFromConfig() {
        return this.options.workDirs || [];
    }

    // ============================================================================
    // Daemon 交互（代理到 DaemonManager）
    // ============================================================================

    /**
     * 获取 daemon HTTP 端口
     * @returns {number|null} HTTP 端口
     */
    getDaemonPort() {
        return this.daemonManager.getHttpPort();
    }

    /**
     * 检查 daemon 是否运行
     * @returns {boolean} 是否运行
     */
    isDaemonRunning() {
        return this.daemonManager.isDaemonRunning();
    }

    /**
     * 检查 daemon 是否运行（异步）
     * @returns {Promise<boolean>} 是否运行
     */
    async isDaemonRunningAsync() {
        return await this.daemonManager.isDaemonRunningAsync();
    }

    /**
     * 确保 daemon 运行
     * @returns {Promise<boolean>}
     */
    async ensureDaemonRunning() {
        return await this.daemonManager.ensureDaemonRunning();
    }

    /**
     * 发送 HTTP 请求到 daemon
     * @param {string} endpoint API 端点
     * @param {Object} body 请求体
     * @returns {Promise<Object>} 响应对象
     */
    async daemonRequest(endpoint, body = {}) {
        return await this.daemonManager.daemonRequest(endpoint, body, this.options.httpTimeout);
    }

    // ============================================================================
    // Session 管理
    // ============================================================================

    /**
     * 解析工作目录路径
     * @param {string} workDirPath 工作目录路径
     * @returns {string} 绝对路径
     */
    resolveWorkDir(workDirPath) {
        if (path.isAbsolute(workDirPath)) {
            return workDirPath;
        }
        return path.resolve(this.baseDir, workDirPath);
    }

    /**
     * 标准化路径以便跨平台比较
     * @param {string} p 路径
     * @returns {string} 标准化后的路径
     */
    _normalizePath(p) {
        if (!p) return '';
        let normalized = path.resolve(p);
        // Windows 不区分大小写
        if (process.platform === 'win32') {
            normalized = normalized.toLowerCase();
        }
        // 移除尾部斜杠
        return normalized.replace(/[\\/]+$/, '');
    }

    /**
     * 通过 sessionId 精确查找 daemon 中的 session
     * @param {string} sessionId session ID
     * @returns {Promise<Object|null>} session 信息或 null
     */
    async findSessionById(sessionId) {
        if (!sessionId) return null;
        
        try {
            const listResult = await this.daemonRequest('/list', {});
            const children = listResult.children || [];
            
            const session = children.find(s => s.happySessionId === sessionId);
            if (session) {
                return {
                    sessionId: session.happySessionId,
                    pid: session.pid,
                    directory: session.directory || session.path
                };
            }
            
            return null;
        } catch (e) {
            logWarn(`findSessionById failed: ${e.message}`);
            return null;
        }
    }

    /**
     * 通过目录路径查找 daemon 中已有的 session
     * @param {string} directory 目录路径
     * @returns {Promise<Object|null>} session 信息或 null
     */
    async findSessionByDirectory(directory) {
        if (!directory) return null;
        
        const normalizedDir = this._normalizePath(directory);
        
        try {
            const listResult = await this.daemonRequest('/list', {});
            const children = listResult.children || [];
            
            for (const session of children) {
                const sessionDir = this._normalizePath(session.directory || session.path);
                if (sessionDir === normalizedDir) {
                    return {
                        sessionId: session.happySessionId,
                        pid: session.pid,
                        directory: sessionDir
                    };
                }
            }
            
            return null;
        } catch (e) {
            logWarn(`findSessionByDirectory failed: ${e.message}`);
            return null;
        }
    }

    /**
     * 清理 daemon 中的所有历史 session
     * @returns {Promise<void>}
     */
    async cleanupAllSessions() {
        // 确保 daemon 运行
        if (!(await this.isDaemonRunningAsync())) {
            logInfo('Daemon not running, skipping cleanup');
            return;
        }

        try {
            logInfo('Starting cleanup of all daemon sessions...');
            const listResult = await this.daemonRequest('/list', {});
            const children = listResult.children || [];
            
            if (children.length === 0) {
                logInfo('No sessions to clean up');
                return;
            }

            logInfo(`Found ${children.length} sessions, cleaning up...`);
            
            const cleanupPromises = children.map(async (session) => {
                const sessionId = session.happySessionId;
                if (!sessionId) {
                    return;
                }
                
                try {
                    logInfo(`Stopping session: ${sessionId} (PID: ${session.pid})`);
                    await this.daemonRequest('/stop-session', { sessionId });
                    logInfo(`Session ${sessionId} stopped`);
                } catch (error) {
                    // 某些 session 可能已经停止，忽略错误
                    logWarn(`Failed to stop session ${sessionId}: ${error.message}`);
                }
            });

            await Promise.all(cleanupPromises);
            logInfo('All sessions cleanup complete');
            
            // 等待一小段时间确保清理完成
            await sleep(1000);
        } catch (error) {
            logError(`Error cleaning up sessions: ${error.message}`);
            // 不抛出错误，允许继续执行
        }
    }

    /**
     * 为单个 workDir 创建 session
     * @param {string} name session 名称
     * @param {string} workDirPath 工作目录路径
     * @param {Object} options 选项
     * @param {boolean} options.allowReuse 是否允许复用已有 session（默认 true）
     * @returns {Promise<Object>} session 信息
     */
    async createSession(name, workDirPath, options = {}) {
        const { allowReuse = true } = options;
        const resolvedPath = this.resolveWorkDir(workDirPath);
        
        logInfo(`Creating session "${name}", workDir: ${resolvedPath}, allowReuse: ${allowReuse}`);
        
        // 检查内存中是否已有该 name 的 session（通过 sessionId 验证是否仍有效）
        const existingSessionInfo = this.sessions[name];
        if (allowReuse && existingSessionInfo?.sessionId) {
            const existingSession = await this.findSessionById(existingSessionInfo.sessionId);
            if (existingSession) {
                if (this._isStaleProcessingSession(existingSessionInfo)) {
                    logWarn(`Existing session "${name}" is stale processing, recreating: ${existingSessionInfo.sessionId}`);
                    try {
                        await this.daemonRequest('/stop-session', { sessionId: existingSessionInfo.sessionId });
                    } catch (error) {
                        logWarn(`Failed to stop stale session ${existingSessionInfo.sessionId}: ${error.message}`);
                    }
                } else {
                    logInfo(`Found existing valid session by sessionId: ${existingSession.sessionId}`);
                    existingSessionInfo.status = 'active';
                    existingSessionInfo.pid = existingSession.pid;
                    existingSessionInfo.statusUpdatedAt = new Date().toISOString();
                    
                    // 使用 _setSession 确保 workDirIndex 映射存在
                    this._setSession(name, existingSessionInfo);
                    
                    this.emit('session:created', { name, ...existingSessionInfo });
                    return existingSessionInfo;
                }
            }
            // session 不再有效，清理旧记录
            logInfo(`Old session ${existingSessionInfo.sessionId} no longer valid`);
        } else if (!allowReuse && existingSessionInfo?.sessionId) {
            logInfo(`Reuse disabled for session "${name}", creating a fresh session`);
        }
        
        // 保存旧的 workDir（用于清理 workDirIndex）
        const oldWorkDir = existingSessionInfo?.workDir;
        
        // 创建新 session
        try {
            const result = await this.daemonRequest('/spawn-session', { directory: resolvedPath });
            
            // 处理不同的响应格式
            if (result.type === 'error' || (result.success === false)) {
                throw new Error(result.errorMessage || result.error || 'spawn-session 失败');
            }
            
            // 检查是否有 sessionId
            const sessionId = result.sessionId;
            if (!sessionId) {
                throw new Error('spawn-session 响应中没有 sessionId');
            }
            
            const sessionInfo = {
                sessionId: sessionId,
                workDir: resolvedPath,
                status: 'active',
                createdAt: new Date().toISOString(),
                statusUpdatedAt: new Date().toISOString()
            };
            
            // 尝试获取 PID（使用 sessionId 精确匹配）
            const sessionEntry = await this.findSessionById(sessionId);
            if (sessionEntry) {
                sessionInfo.pid = sessionEntry.pid;
            }
            
            // 使用统一的 _setSession 方法（自动维护 workDirIndex）
            this._setSession(name, sessionInfo, oldWorkDir);
            
            logInfo(`Session "${name}" created: ${sessionId}`);
            
            this.emit('session:created', { name, ...sessionInfo });
            
            return sessionInfo;
        } catch (error) {
            logWarn(`Spawn request failed: ${error.message}`);
            
            // 检查错误响应中是否有 sessionId
            if (error.sessionId) {
                logInfo(`Got sessionId from error response: ${error.sessionId}, polling for verification...`);
                const pollResult = await this._pollForSessionById(error.sessionId);
                
                if (pollResult) {
                    logInfo(`Polling confirmed session started: ${pollResult.sessionId}`);
                    const sessionInfo = {
                        sessionId: pollResult.sessionId,
                        workDir: resolvedPath,
                        pid: pollResult.pid,
                        status: 'active',
                        createdAt: new Date().toISOString(),
                        statusUpdatedAt: new Date().toISOString()
                    };
                    
                    // 使用统一的 _setSession 方法（自动维护 workDirIndex）
                    this._setSession(name, sessionInfo, oldWorkDir);
                    
                    this.emit('session:created', { name, ...sessionInfo });
                    return sessionInfo;
                }
            }
            
            logError(`Failed to create session "${name}": ${error.message}`);
            
            // 记录失败到单独的日志文件（不写入 sessions）
            this._logFailure(name, resolvedPath, error.message, 'createSession');
            
            // 清理可能的 workDirIndex 残留映射
            if (oldWorkDir) {
                const oldNormalizedPath = this._normalizePathForIndex(oldWorkDir);
                if (this.workDirIndex[oldNormalizedPath] === name) {
                    delete this.workDirIndex[oldNormalizedPath];
                }
            }
            
            this.emit('session:error', { name, error: error.message });
            
            throw error;
        }
    }

    /**
     * 判断持久化 session 是否是长期卡住的 processing 状态。
     * 旧状态文件没有时间戳时，保守地认为不应复用 processing session。
     * @param {Object} sessionInfo session 信息
     * @returns {boolean} 是否应跳过复用并重建
     * @private
     */
    _isStaleProcessingSession(sessionInfo) {
        if (!sessionInfo || sessionInfo.status !== 'processing') {
            return false;
        }
        
        const updatedAt = sessionInfo.statusUpdatedAt || sessionInfo.eventStatusUpdatedAt;
        if (!updatedAt) {
            return true;
        }
        
        const updatedAtMs = new Date(updatedAt).getTime();
        if (!Number.isFinite(updatedAtMs)) {
            return true;
        }
        
        return Date.now() - updatedAtMs > this.options.processingReuseMaxAgeMs;
    }

    /**
     * 通过 sessionId 轮询检查 session 是否已启动
     * @param {string} sessionId session ID
     * @param {number} maxAttempts 最大尝试次数
     * @param {number} interval 轮询间隔(ms)
     * @returns {Promise<Object|null>} session 信息或 null
     */
    async _pollForSessionById(sessionId, maxAttempts = 12, interval = 5000) {
        if (!sessionId) {
            logWarn('No sessionId provided, cannot poll');
            return null;
        }
        
        logInfo(`Polling for session ${sessionId}, max ${maxAttempts} attempts, interval ${interval}ms`);
        
        for (let i = 0; i < maxAttempts; i++) {
            await sleep(interval);
            
            const session = await this.findSessionById(sessionId);
            if (session) {
                return session;
            }
            
            logDebug(`Poll ${i + 1}/${maxAttempts}, session ${sessionId} not ready yet`);
        }
        
        return null;
    }

    /**
     * 创建所有配置的 session
     * 区分冷启动（daemon 不存在）和热启动（daemon 已存在）
     * @param {Object} options 选项
     * @param {boolean} options.wasDaemonRunning 调用前 daemon 是否已在运行（由 HappyService 传入）
     * @returns {Promise<Object>} 创建结果
     */
    async createAllSessions(options = {}) {
        const workDirs = this.getWorkDirsFromConfig();
        
        if (workDirs.length === 0) {
            logWarn('No workDirs in config, skipping session creation');
            return {};
        }
        
        logInfo(`Preparing to create/reuse ${workDirs.length} sessions`);
        
        // 使用传入的标志，如果没有传入则自行检测
        const wasDaemonRunning = options.wasDaemonRunning !== undefined 
            ? options.wasDaemonRunning 
            : await this.isDaemonRunningAsync();
        
        logInfo(`Cold/Warm start detection: wasDaemonRunning = ${wasDaemonRunning}`);
        
        // 检查是否需要强制清理（账户变更场景）
        const needsCleanup = this._accountChanged;
        if (needsCleanup) {
            logInfo('Account changed flag detected, will force cleanup all sessions');
            this._accountChanged = false; // 重置标志
        }
        
        if (!wasDaemonRunning) {
            // 冷启动：清理旧状态，启动 daemon，清理残留 session
            logInfo('Cold start: daemon not running, will start fresh');
            this.removeStateFile();
            this.clearSessions();
            
            await this.ensureDaemonRunning();
            
            // 清理可能残留的 session
            await this.cleanupAllSessions();
        } else {
            // 热启动：daemon 已存在
            
            // 如果账户已变更，强制清理所有旧 sessions
            if (needsCleanup) {
                logInfo('Hot start with account change: cleaning up all old sessions in daemon');
                this.clearSessions();
                await this.cleanupAllSessions();
            } else {
                // 热启动：从状态文件加载 session 信息以便复用
                logInfo('Warm start: daemon already running, loading state for reuse');
                // 传入当前 anonId 用于账户变更检测
                const existingState = this.loadStateFile(this.anonId);
                if (existingState) {
                    logInfo(`Loaded ${Object.keys(this.sessions).length} sessions from state file`);
                    
                    // 验证已加载的 sessions 是否仍然有效（与 daemon 实际状态对账）
                    // validateSessions 会自动移除无效的 session
                    const validation = await this.validateSessions();
                    if (validation.removed.length > 0) {
                        logInfo(`Removed ${validation.removed.length} invalid sessions, will recreate them`);
                    }
                } else {
                    // 状态文件不存在或账户已变更，需要清理旧状态
                    logInfo('No valid state file found (possibly account changed), cleaning up old sessions');
                    this.clearSessions();
                    
                    // 关键修复：热启动且账户变更时，也需要清理 daemon 中的旧 sessions
                    // 否则旧账户的 session 进程会继续运行，新账户连接时可能复用到旧 session
                    await this.cleanupAllSessions();
                }
            }
        }
        
        const results = {};
        
        for (const workDir of workDirs) {
            const name = workDir.name;
            const workDirPath = workDir.path;
            
            try {
                // 热启动时允许复用，冷启动时不复用（已清理）
                results[name] = await this.createSession(name, workDirPath, {
                    allowReuse: wasDaemonRunning
                });
                // 等待一小段时间让 session 初始化
                await sleep(1000);
            } catch (error) {
                results[name] = { status: 'failed', error: error.message };
            }
        }
        
        // 如果 currentSession 为空，自动设置第一个成功的 session 为当前 session
        if (!this.currentSession) {
            // 优先选择 'main'，否则选择第一个成功创建的 session
            if (this.sessions['main']?.sessionId) {
                this.currentSession = 'main';
                logInfo(`Auto-selected current session: main`);
            } else {
                // 找到第一个有 sessionId 的 session
                const firstActive = Object.entries(this.sessions).find(([_, info]) => info.sessionId);
                if (firstActive) {
                    this.currentSession = firstActive[0];
                    logInfo(`Auto-selected current session: ${firstActive[0]}`);
                }
            }
        }
        
        // 保存状态文件（跳过同步，因为之前已经调用过 validateSessions）
        await this.saveStateFile({ skipSync: true });
        
        return results;
    }

    /**
     * 获取 session ID
     * @param {string} name session 名称
     * @returns {string|null} session ID
     */
    getSessionId(name) {
        const session = this.sessions[name];
        return session?.sessionId || null;
    }

    /**
     * 获取所有 session
     * @returns {Object} sessions 映射
     */
    getAllSessions() {
        return { ...this.sessions };
    }

    // ============================================================================
    // 目录与 Session 映射管理
    // ============================================================================

    /**
     * 标准化路径用于索引（小写、统一斜杠）
     * @param {string} workDir 工作目录路径
     * @returns {string} 标准化后的路径
     * @private
     */
    _normalizePathForIndex(workDir) {
        if (!workDir) return '';
        let normalized = path.resolve(workDir);
        // Windows 不区分大小写，统一小写
        if (process.platform === 'win32') {
            normalized = normalized.toLowerCase();
        }
        // 统一使用正斜杠
        normalized = normalized.replace(/\\/g, '/');
        // 移除尾部斜杠
        return normalized.replace(/\/+$/, '');
    }

    /**
     * 通过工作目录查找 session 名称
     * @param {string} workDir 工作目录路径
     * @returns {string|null} session 名称或 null
     */
    findSessionByWorkDir(workDir) {
        const normalizedPath = this._normalizePathForIndex(workDir);
        return this.workDirIndex[normalizedPath] || null;
    }

    /**
     * 基于目录名生成唯一的 session 名称
     * @param {string} workDir 工作目录路径
     * @returns {string} 唯一的 session 名称
     */
    generateSessionName(workDir) {
        // 获取目录名
        const dirName = path.basename(workDir) || 'workspace';
        
        // 清理名称（只保留字母、数字、连字符、下划线）
        let baseName = dirName.toLowerCase().replace(/[^a-z0-9\-_]/g, '-').replace(/-+/g, '-');
        if (!baseName || baseName === '-') {
            baseName = 'workspace';
        }
        
        // 检查是否已存在，如果存在则加后缀
        let finalName = baseName;
        let counter = 2;
        while (this.sessions[finalName]) {
            finalName = `${baseName}-${counter}`;
            counter++;
        }
        
        return finalName;
    }

    /**
     * 为工作目录创建或获取 session
     * @param {string} workDir 工作目录路径
     * @returns {Promise<Object>} { name, sessionInfo }
     */
    async createSessionForWorkDir(workDir) {
        const resolvedPath = this.resolveWorkDir(workDir);
        
        // 1. 先检查是否已有该目录的映射
        const existingName = this.findSessionByWorkDir(resolvedPath);
        if (existingName && this.sessions[existingName]) {
            const existingSession = this.sessions[existingName];
            
            // 如果 session 有 sessionId，验证是否仍然有效
            if (existingSession.sessionId) {
                const serverSession = await this.findSessionById(existingSession.sessionId);
                if (serverSession) {
                    logInfo(`Found existing session for workDir: ${existingName}`);
                    existingSession.status = 'active';
                    existingSession.pid = serverSession.pid;
                    return { name: existingName, sessionInfo: existingSession };
                }
                // session 不再有效
                logInfo(`Old session ${existingSession.sessionId} no longer valid in daemon, will recreate`);
            }
        }
        
        // 2. 生成新的 session 名称
        const sessionName = existingName || this.generateSessionName(resolvedPath);
        
        // 3. 创建新 session（createSession 内部会自动更新 workDirIndex）
        const sessionInfo = await this.createSession(sessionName, resolvedPath, { allowReuse: true });
        
        // 4. 保存状态
        await this.saveStateFile();
        
        return { name: sessionName, sessionInfo };
    }

    /**
     * 切换当前激活的 session
     * @param {string} name session 名称
     * @returns {Promise<boolean>} 是否成功
     */
    async switchSession(name) {
        if (!this.sessions[name]) {
            logWarn(`Cannot switch to non-existent session: ${name}`);
            return false;
        }
        
        this.currentSession = name;
        await this.saveStateFile();
        
        logInfo(`Switched to session: ${name}`);
        this.emit('session:switched', { name, session: this.sessions[name] });
        
        return true;
    }

    /**
     * 删除单个 session
     * @param {string} name session 名称
     * @param {Object} options 选项
     * @param {boolean} options.stopDaemon 是否同时停止 daemon 中的进程（默认 false）
     * @returns {Promise<Object>} { success, deleted, error }
     */
    async deleteSession(name, options = {}) {
        const { stopDaemon = false } = options;
        
        const session = this.sessions[name];
        if (!session) {
            logWarn(`Cannot delete non-existent session: ${name}`);
            return { success: false, error: `Session "${name}" not found` };
        }
        
        logInfo(`Deleting session "${name}", stopDaemon: ${stopDaemon}`);
        
        // 可选：停止 daemon 中的进程
        if (stopDaemon && session.sessionId) {
            try {
                await this.daemonRequest('/stop-session', { sessionId: session.sessionId });
                logInfo(`Stopped daemon session: ${session.sessionId}`);
            } catch (error) {
                // 忽略停止失败（进程可能已经不存在）
                logWarn(`Failed to stop daemon session ${session.sessionId}: ${error.message}`);
            }
        }
        
        // 使用 _removeSession 移除（自动处理 workDirIndex 和 currentSession）
        const deleted = this._removeSession(name);
        
        // 保存状态
        await this.saveStateFile();
        
        logInfo(`Session "${name}" deleted`);
        this.emit('session:deleted', { name, session: deleted });
        
        return { success: true, deleted };
    }

    /**
     * 验证所有 sessions 的有效性，并与 daemon 进行双向对账
     * - 正向：验证本地 sessions 在 daemon 中是否有效，无效的直接移除
     * - 反向：发现 daemon 中存在但本地没有的孤儿 session，冲突则清理，不冲突则补充
     * @returns {Promise<Object>} { valid, removed, orphans: { added, removed } }
     */
    async validateSessions() {
        const result = {
            valid: [],    // 在 daemon 中存在的 session
            removed: [],  // 从本地移除的无效 session
            orphans: {
                added: [],   // 补充到本地的孤儿 session
                removed: []  // 因冲突被清理的孤儿 session
            }
        };
        
        // 1. 一次性获取 daemon 中所有 session 列表
        let daemonSessions = [];
        try {
            const listResult = await this.daemonRequest('/list', {});
            daemonSessions = listResult.children || [];
            logInfo(`Found ${daemonSessions.length} sessions in daemon`);
        } catch (error) {
            logWarn(`Failed to get daemon session list: ${error.message}, skipping validation`);
            return result;
        }
        
        // 2. 构建 daemon sessionId -> session 的 Map
        const daemonSessionMap = new Map();
        for (const ds of daemonSessions) {
            if (ds.happySessionId) {
                daemonSessionMap.set(ds.happySessionId, {
                    sessionId: ds.happySessionId,
                    pid: ds.pid,
                    directory: ds.directory || ds.path
                });
            }
        }
        
        // 3. 收集本地已知的 sessionIds
        const localSessionIds = new Set();
        for (const session of Object.values(this.sessions)) {
            if (session.sessionId) {
                localSessionIds.add(session.sessionId);
            }
        }
        
        // 4. 正向验证：检查本地 sessions 在 daemon 中是否有效
        const localSessionCount = Object.keys(this.sessions).length;
        const sessionsToRemove = [];
        
        if (localSessionCount > 0) {
            logInfo(`Validating ${localSessionCount} local sessions...`);
            
            for (const [name, session] of Object.entries(this.sessions)) {
                // 检查是否有 sessionId
                if (!session.sessionId) {
                    sessionsToRemove.push({ name, reason: 'no sessionId' });
                    continue;
                }
                
                // 在 daemon Map 中查找
                const daemonSession = daemonSessionMap.get(session.sessionId);
                if (daemonSession) {
                    result.valid.push({ name, session });
                    // 更新状态
                    session.status = 'active';
                    session.pid = daemonSession.pid;
                } else {
                    sessionsToRemove.push({ name, reason: 'not found in daemon' });
                }
            }
        }
        
        // 5. 移除无效的 sessions
        for (const { name, reason } of sessionsToRemove) {
            const removed = this._removeSession(name);
            if (removed) {
                result.removed.push({ name, reason });
                logInfo(`Removed invalid session: ${name} (${reason})`);
            }
        }
        
        // 6. 反向对账：找出 daemon 中的孤儿 session（daemon 有但本地没有）
        const orphanSessions = [];
        for (const [sessionId, daemonSession] of daemonSessionMap) {
            if (!localSessionIds.has(sessionId)) {
                orphanSessions.push(daemonSession);
            }
        }
        
        if (orphanSessions.length > 0) {
            logInfo(`Found ${orphanSessions.length} orphan sessions in daemon`);
            
            // 7. 处理每个孤儿 session
            for (const orphan of orphanSessions) {
                const orphanDir = orphan.directory;
                
                // 处理没有 directory 的 orphan session：清理它
                if (!orphanDir) {
                    logWarn(`Orphan session ${orphan.sessionId} has no directory, cleaning it up`);
                    try {
                        await this.daemonRequest('/stop-session', { sessionId: orphan.sessionId });
                        result.orphans.removed.push({
                            sessionId: orphan.sessionId,
                            directory: null,
                            reason: 'no directory (invalid session)'
                        });
                        logInfo(`Stopped orphan session without directory: ${orphan.sessionId}`);
                    } catch (error) {
                        logWarn(`Failed to stop orphan session ${orphan.sessionId}: ${error.message}`);
                    }
                    continue;
                }
                
                // 检查目录是否与本地已有 session 冲突
                const existingName = this.findSessionByWorkDir(orphanDir);
                
                if (existingName) {
                    // 冲突：本地已有该目录的 session，停止 daemon 中的孤儿
                    logInfo(`Orphan session ${orphan.sessionId} conflicts with local session "${existingName}", stopping it`);
                    try {
                        await this.daemonRequest('/stop-session', { sessionId: orphan.sessionId });
                        result.orphans.removed.push({
                            sessionId: orphan.sessionId,
                            directory: orphanDir,
                            reason: `conflicts with local session "${existingName}"`
                        });
                        logInfo(`Stopped conflicting orphan session: ${orphan.sessionId}`);
                    } catch (error) {
                        logWarn(`Failed to stop orphan session ${orphan.sessionId}: ${error.message}`);
                    }
                } else {
                    // 不冲突：补充到本地状态
                    const newName = this.generateSessionName(orphanDir);
                    const sessionInfo = {
                        sessionId: orphan.sessionId,
                        workDir: orphanDir,
                        pid: orphan.pid,
                        status: 'active',
                        createdAt: new Date().toISOString(),
                        adoptedAt: new Date().toISOString()  // 标记为收养的 session
                    };
                    
                    this._setSession(newName, sessionInfo);
                    result.orphans.added.push({
                        name: newName,
                        sessionId: orphan.sessionId,
                        directory: orphanDir
                    });
                    logInfo(`Adopted orphan session as "${newName}": ${orphan.sessionId}`);
                }
            }
        }
        
        logInfo(`Validation complete: ${result.valid.length} valid, ${result.removed.length} removed, ${result.orphans.added.length} adopted, ${result.orphans.removed.length} orphans removed`);
        
        return result;
    }

    /**
     * 获取当前 session 名称
     * @returns {string|null} 当前 session 名称
     */
    getCurrentSessionName() {
        return this.currentSession;
    }

    /**
     * 获取当前 session 信息
     * @returns {Object|null} 当前 session 信息
     */
    getCurrentSession() {
        if (!this.currentSession) return null;
        return this.sessions[this.currentSession] || null;
    }

    /**
     * 获取所有已映射的工作目录
     * @returns {Array<{name: string, workDir: string, sessionId: string}>} 工作目录列表
     */
    listWorkDirs() {
        const result = [];
        for (const [name, session] of Object.entries(this.sessions)) {
            if (session.workDir) {
                result.push({
                    name,
                    workDir: session.workDir,
                    sessionId: session.sessionId,
                    status: session.status,
                    isCurrent: name === this.currentSession
                });
            }
        }
        return result;
    }

    // ============================================================================
    // 状态文件管理
    // ============================================================================

    /**
     * 保存状态到文件
     * 保存前会自动与 daemon 进行状态同步（除非 skipSync=true）
     * 注意：workDirIndex 不再持久化，它是从 sessions 派生的运行时缓存
     * @param {Object} options 选项
     * @param {boolean} options.skipSync 是否跳过同步检查（默认 false）
     * @param {boolean} options.silent 是否静默保存，不触发事件（默认 false）
     */
    async saveStateFile(options = {}) {
        const { skipSync = false, silent = false } = options;
        
        // 保存前与 daemon 同步状态（确保本地状态是 daemon 的镜像）
        if (!skipSync) {
            try {
                await this.validateSessions();
            } catch (error) {
                logWarn(`Failed to sync with daemon before save: ${error.message}`);
                // 同步失败不阻塞保存
            }
        }
        
        const state = {
            createdAt: this.stateCreatedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            anonId: this.anonId,
            currentSession: this.currentSession,
            sessions: this.sessions
            // workDirIndex 不再持久化，加载时从 sessions 重建
        };
        
        if (!this.stateCreatedAt) {
            this.stateCreatedAt = state.createdAt;
        }
        
        // 确保目录存在
        const stateDir = path.dirname(this.stateFilePath);
        if (!fs.existsSync(stateDir)) {
            fs.mkdirSync(stateDir, { recursive: true });
        }
        
        fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
        logDebug(`State file saved: ${this.stateFilePath}`);
        
        // 触发状态更新事件（携带格式化后的数据供前端使用）
        // 静默模式下不触发事件（如监控循环中的定期保存）
        if (!silent) {
            this.emit('session:stateUpdated', this.getFormattedState());
        }
    }

    /**
     * 获取格式化后的状态数据（供前端使用）
     * 将 sessions 对象转换为数组格式，并统一字段名
     * @returns {Object} 格式化后的状态
     */
    getFormattedState() {
        const sessionsArray = Object.entries(this.sessions).map(([name, session]) => ({
            name,
            sessionId: session.sessionId,
            workspaceDir: session.workDir,  // 字段名映射: workDir → workspaceDir
            status: this._mapStatus(session.status),
            createdAt: session.createdAt,
            pid: session.pid,
            isCurrent: name === this.currentSession
        }));
        
        return {
            currentSession: this.currentSession,
            sessions: sessionsArray,
            updatedAt: new Date().toISOString()
        };
    }

    /**
     * 映射 session 状态为前端友好的状态值
     * @param {string} status 原始状态
     * @returns {string} 映射后的状态
     * @private
     */
    _mapStatus(status) {
        const statusMap = {
            'active': 'idle',       // 活跃但空闲
            'processing': 'processing',
            'connected': 'connected',
            'disconnected': 'disconnected'
        };
        return statusMap[status] || status || 'idle';
    }

    /**
     * 从文件加载状态
     * @param {string} currentAnonId 当前账户的 anonId（用于检测账户变更）
     * @returns {Object|null} 状态对象
     */
    loadStateFile(currentAnonId = null) {
        if (!fs.existsSync(this.stateFilePath)) {
            return null;
        }
        
        try {
            const content = fs.readFileSync(this.stateFilePath, 'utf8');
            const state = JSON.parse(content);
            
            // 检测账户变更：如果 anonId 不同，清除旧状态
            if (currentAnonId && state.anonId && state.anonId !== currentAnonId) {
                logInfo(`Account changed (old: ${state.anonId}, new: ${currentAnonId}), clearing old state`);
                this.removeStateFile();
                return null;
            }
            
            // 加载状态，过滤掉旧数据中没有 sessionId 的记录（兼容旧格式）
            const rawSessions = state.sessions || {};
            this.sessions = {};
            let filteredCount = 0;
            
            for (const [name, session] of Object.entries(rawSessions)) {
                // 只加载有 sessionId 的有效 session
                if (session.sessionId) {
                    this.sessions[name] = session;
                } else {
                    filteredCount++;
                    logDebug(`Filtered out invalid session from state file: ${name} (no sessionId)`);
                }
            }
            
            if (filteredCount > 0) {
                logInfo(`Filtered ${filteredCount} invalid sessions from state file`);
            }
            
            this.stateCreatedAt = state.createdAt;
            this.anonId = state.anonId || currentAnonId;
            this.currentSession = state.currentSession || null;
            
            // 如果 currentSession 被过滤掉了，重置它
            if (this.currentSession && !this.sessions[this.currentSession]) {
                const firstValid = Object.keys(this.sessions)[0];
                this.currentSession = firstValid || null;
                if (firstValid) {
                    logInfo(`Current session was invalid, auto-switched to: ${firstValid}`);
                }
            }
            
            // workDirIndex 始终从 sessions 重建（不再从文件加载）
            // 这确保了 workDirIndex 始终与 sessions 保持一致
            this._rebuildWorkDirIndex();
            
            return state;
        } catch (error) {
            logError(`Failed to read state file: ${error.message}`);
            return null;
        }
    }

    /**
     * 从 sessions 重建 workDirIndex（兼容旧格式）
     * @private
     */
    _rebuildWorkDirIndex() {
        this.workDirIndex = {};
        for (const [name, session] of Object.entries(this.sessions)) {
            if (session.workDir) {
                const normalizedPath = this._normalizePathForIndex(session.workDir);
                // 检测冲突：同一目录映射到多个 session
                if (this.workDirIndex[normalizedPath] && this.workDirIndex[normalizedPath] !== name) {
                    logWarn(`workDirIndex conflict: ${normalizedPath} already mapped to ${this.workDirIndex[normalizedPath]}, overwriting with ${name}`);
                }
                this.workDirIndex[normalizedPath] = name;
            }
        }
        logInfo(`Rebuilt workDirIndex with ${Object.keys(this.workDirIndex).length} entries`);
    }

    /**
     * 统一的 session 设置方法（自动维护 workDirIndex）
     * @param {string} name session 名称
     * @param {Object} sessionInfo session 信息
     * @param {string} oldWorkDir 旧的 workDir（用于清理旧索引）
     * @private
     */
    _setSession(name, sessionInfo, oldWorkDir = null) {
        // 更新 sessions
        this.sessions[name] = sessionInfo;
        
        // 更新 workDirIndex
        if (sessionInfo.workDir) {
            const normalizedPath = this._normalizePathForIndex(sessionInfo.workDir);
            this.workDirIndex[normalizedPath] = name;
            
            // 清理旧的索引条目（如果 workDir 发生变化）
            if (oldWorkDir) {
                const oldNormalizedPath = this._normalizePathForIndex(oldWorkDir);
                if (oldNormalizedPath !== normalizedPath && this.workDirIndex[oldNormalizedPath] === name) {
                    delete this.workDirIndex[oldNormalizedPath];
                    logDebug(`Cleaned up old workDirIndex entry: ${oldNormalizedPath}`);
                }
            }
        }
    }

    /**
     * 更新指定 session 的事件状态（processing/idle）
     * 用于实时更新 SessionHub 中卡片的状态显示
     * 触发轻量级的 session:statusChanged 事件（只传递单个 session 的变化）
     * @param {string} sessionId session ID
     * @param {string} eventStatus 事件状态 (processing, idle, ready)
     */
    updateSessionEventStatus(sessionId, eventStatus) {
        if (!sessionId) return;
        
        // 将 eventStatus 映射为 session status
        let status;
        if (eventStatus === 'processing' || eventStatus === 'thinking' || eventStatus === 'waiting') {
            status = 'processing';
        } else if (eventStatus === 'ready' || eventStatus === 'idle') {
            status = 'active';  // 恢复为 active（前端会映射为 idle）
        } else {
            status = eventStatus;
        }
        
        // 查找并更新 session
        for (const [name, session] of Object.entries(this.sessions)) {
            if (session.sessionId === sessionId) {
                const oldStatus = session.status;
                if (oldStatus !== status) {
                    session.status = status;
                    session.statusUpdatedAt = new Date().toISOString();
                    logDebug(`[SessionManager] Session "${name}" status updated: ${oldStatus} -> ${status}`);
                    
                    // 触发轻量级的状态变化事件（只传递单个 session 的变化，避免全量刷新）
                    this.emit('session:statusChanged', {
                        sessionId,
                        name,
                        status: this._mapStatus(status),  // 使用映射后的状态（processing/idle）
                        timestamp: new Date().toISOString()
                    });
                }
                if (oldStatus === status) {
                    session.statusUpdatedAt = new Date().toISOString();
                }
                break;
            }
        }
    }

    /**
     * 统一的 session 移除方法（自动清理 workDirIndex）
     * @param {string} name session 名称
     * @returns {Object|null} 被移除的 session 信息，如果不存在则返回 null
     * @private
     */
    _removeSession(name) {
        const session = this.sessions[name];
        if (!session) {
            return null;
        }
        
        // 清理 workDirIndex
        if (session.workDir) {
            const normalizedPath = this._normalizePathForIndex(session.workDir);
            if (this.workDirIndex[normalizedPath] === name) {
                delete this.workDirIndex[normalizedPath];
            }
        }
        
        // 移除 session
        delete this.sessions[name];
        
        // 如果删除的是当前 session，需要重置 currentSession
        if (this.currentSession === name) {
            this.currentSession = null;
            // 尝试切换到另一个有效的 session
            const remaining = Object.entries(this.sessions).find(([_, info]) => info.sessionId);
            if (remaining) {
                this.currentSession = remaining[0];
                logInfo(`Current session deleted, auto-switched to: ${remaining[0]}`);
            }
        }
        
        return session;
    }

    /**
     * 删除状态文件
     */
    removeStateFile() {
        if (fs.existsSync(this.stateFilePath)) {
            fs.unlinkSync(this.stateFilePath);
            logInfo(`State file deleted: ${this.stateFilePath}`);
        }
    }

    // ============================================================================
    // 失败日志管理
    // ============================================================================

    /**
     * 记录创建失败到日志文件
     * @param {string} name session 名称
     * @param {string} workDir 工作目录
     * @param {string} error 错误信息
     * @param {string} context 上下文（如 'createSession'）
     * @private
     */
    _logFailure(name, workDir, error, context = 'createSession') {
        try {
            // 读取现有日志
            let log = { entries: [] };
            if (fs.existsSync(this.failureLogPath)) {
                try {
                    const content = fs.readFileSync(this.failureLogPath, 'utf8');
                    log = JSON.parse(content);
                    if (!Array.isArray(log.entries)) {
                        log.entries = [];
                    }
                } catch (e) {
                    logWarn(`Failed to parse failure log, resetting: ${e.message}`);
                    log = { entries: [] };
                }
            }
            
            // 添加新条目
            log.entries.push({
                name,
                workDir,
                error,
                context,
                failedAt: new Date().toISOString()
            });
            
            // 限制条目数量
            if (log.entries.length > this.failureLogMaxEntries) {
                log.entries = log.entries.slice(-this.failureLogMaxEntries);
            }
            
            // 确保目录存在
            const logDir = path.dirname(this.failureLogPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // 写入文件
            fs.writeFileSync(this.failureLogPath, JSON.stringify(log, null, 2), 'utf8');
            logDebug(`Failure logged: ${name} - ${error}`);
        } catch (e) {
            logWarn(`Failed to write failure log: ${e.message}`);
        }
    }

    /**
     * 获取失败日志
     * @returns {Array} 失败记录数组
     */
    getFailureLog() {
        if (!fs.existsSync(this.failureLogPath)) {
            return [];
        }
        
        try {
            const content = fs.readFileSync(this.failureLogPath, 'utf8');
            const log = JSON.parse(content);
            return log.entries || [];
        } catch (e) {
            logWarn(`Failed to read failure log: ${e.message}`);
            return [];
        }
    }

    /**
     * 清空失败日志
     */
    clearFailureLog() {
        if (fs.existsSync(this.failureLogPath)) {
            fs.unlinkSync(this.failureLogPath);
            logInfo(`Failure log cleared: ${this.failureLogPath}`);
        }
    }
    
    /**
     * 设置当前账户的 anonId
     * @param {string} anonId 账户标识
     */
    setAnonId(anonId) {
        if (this.anonId && this.anonId !== anonId) {
            logInfo(`Account changed (${this.anonId} -> ${anonId}), marking for cleanup`);
            this.clearSessions();  // 已包含清空 workDirIndex 和 currentSession
            this.removeStateFile();
            // 标记账户变更，createAllSessions 会检查此标志并清理 daemon 中的旧 sessions
            this._accountChanged = true;
        }
        this.anonId = anonId;
    }

    // ============================================================================
    // Session 监控
    // ============================================================================

    /**
     * 检查单个 session 状态
     * @param {string} name session 名称
     * @returns {Promise<string>} 状态
     */
    async checkSessionStatus(name) {
        const session = this.sessions[name];
        if (!session || !session.sessionId) {
            return 'unknown';
        }
        
        try {
            const found = await this.findSessionById(session.sessionId);
            
            if (found) {
                session.status = 'active';
                session.pid = found.pid;
            } else {
                session.status = 'disconnected';
            }
            
            return session.status;
        } catch (error) {
            session.status = 'error';
            session.error = error.message;
            return 'error';
        }
    }

    /**
     * 检查所有 session 状态
     * @returns {Promise<Object>} 状态映射
     */
    async checkAllSessionsStatus() {
        const results = {};
        
        for (const name of Object.keys(this.sessions)) {
            results[name] = await this.checkSessionStatus(name);
        }
        
        return results;
    }

    /**
     * 启动监控循环
     */
    startMonitoring() {
        if (this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = true;
        logInfo(`Starting session monitoring, interval: ${this.options.monitorInterval}ms`);
        
        this.monitorTimer = setInterval(async () => {
            await this._monitorLoop();
        }, this.options.monitorInterval);
        
        this.emit('monitor:started');
    }

    /**
     * 停止监控
     */
    stopMonitoring() {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = null;
        }
        this.isMonitoring = false;
        logInfo('Monitoring stopped');
        this.emit('monitor:stopped');
    }

    /**
     * 监控循环
     * 验证 session 状态，移除无效的 session
     */
    async _monitorLoop() {
        // 使用异步检查确保更准确
        if (!(await this.isDaemonRunningAsync())) {
            logWarn('Daemon not running, attempting to start...');
            try {
                await this.ensureDaemonRunning();
            } catch (error) {
                logError(`Daemon start failed: ${error.message}`);
                return;
            }
        }
        
        // 验证 sessions 状态，自动移除无效的 session
        const validation = await this.validateSessions();
        
        // 只有当 session 列表发生变化时才触发事件
        const hasChanges = validation.removed.length > 0;
        
        if (hasChanges) {
            logInfo(`Monitor: removed ${validation.removed.length} invalid sessions`);
        }
        
        // 更新状态文件
        // skipSync=true 因为 validateSessions 已经做过验证了
        // silent=true 如果没有变化，避免频繁触发前端刷新
        await this.saveStateFile({ skipSync: true, silent: !hasChanges });
    }

    /**
     * 清理资源
     */
    cleanup() {
        this.stopMonitoring();
        this.removeAllListeners();
    }

    /**
     * 清理内存中的所有 session 状态
     * 同时清空 sessions、workDirIndex 和 currentSession
     */
    clearSessions() {
        this.sessions = {};
        this.workDirIndex = {};
        this.currentSession = null;
        this.stateCreatedAt = null;
        logInfo('Memory session state cleared (sessions, workDirIndex, currentSession)');
    }

    /**
     * 获取状态信息
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            stateFilePath: this.stateFilePath,
            baseDir: this.baseDir,
            workDirs: this.options.workDirs,
            isMonitoring: this.isMonitoring,
            sessionCount: Object.keys(this.sessions).length,
            sessions: this.getAllSessions(),
            daemon: this.daemonManager.getStatus()
        };
    }
}

module.exports = SessionManager;
