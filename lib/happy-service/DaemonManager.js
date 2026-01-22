/**
 * Happy Daemon 管理器
 * 
 * 管理 Happy Daemon 的生命周期：
 * - 检查 daemon 状态
 * - 启动 daemon（带重试）
 * - 获取 daemon 信息
 * 
 * 创建时间: 2026-01-09
 * 基于: happy-service/app.js DaemonManager 类
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const config = require('./config');
const { logDebug, logInfo, logWarn, logError, sleep, isProcessRunning } = require('./utils');

/**
 * 获取本地 happy-cli 的可执行路径
 * @returns {string} happy.mjs 的绝对路径
 */
function getLocalHappyPath() {
    const fs = require('fs');
    
    // 获取应用根目录（处理打包后的路径）
    let appRoot;
    let isPackaged = false;
    try {
        const { app } = require('electron');
        if (app && app.isReady && app.isReady()) {
            const appPath = app.getAppPath();
            isPackaged = app.isPackaged;
            if (!isPackaged) {
                // 开发环境：appPath 是项目根目录
                appRoot = appPath;
            } else {
                // 打包环境：appPath 是 app.asar
                appRoot = appPath;
            }
        } else {
            appRoot = path.join(__dirname, '..', '..');
        }
    } catch (e) {
        // Electron app 不可用，使用 __dirname
        appRoot = path.join(__dirname, '..', '..');
    }
    
    const possiblePaths = [];
    
    // 打包环境：优先使用 app.asar.unpacked 目录（通过 asarUnpack 解压的文件）
    if (isPackaged || appRoot.includes('app.asar')) {
        // app.asar.unpacked 路径（外部 Node.js 可以执行）
        const unpackedPath = appRoot.replace('app.asar', 'app.asar.unpacked');
        possiblePaths.push(
            path.join(unpackedPath, 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
        );
    }
    
    // 标准 node_modules 路径（开发环境或 asar 内部）
    possiblePaths.push(
        path.join(appRoot, 'node_modules', 'happy-coder', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', '..', 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
    );
    
    for (const testPath of possiblePaths) {
        // 注意：对于 app.asar.unpacked 路径，需要检查实际文件系统
        const checkPath = testPath.includes('app.asar.unpacked') ? testPath : testPath;
        try {
            if (fs.existsSync(checkPath)) {
                logInfo(`Found happy-coder at: ${testPath}`);
                return testPath;
            }
        } catch (e) {
            // 忽略检查错误
        }
    }
    
    // 回退：使用 lib/happy-cli
    const libPath = path.join(__dirname, '..', 'happy-cli', 'bin', 'happy.mjs');
    if (fs.existsSync(libPath)) {
        return libPath;
    }
    
    // 最后的回退
    const appLibPath = path.join(appRoot, 'lib', 'happy-cli', 'bin', 'happy.mjs');
    logWarn(`Using fallback happy path: ${appLibPath}`);
    return appLibPath;
}

class DaemonManager extends EventEmitter {
    /**
     * 构造函数
     * @param {Object} options 配置选项
     * @param {string} options.happyHomeDir Happy Home 目录
     * @param {number} options.startTimeout 启动超时（毫秒）
     * @param {number} options.startRetries 启动重试次数
     * @param {Function} options.getClaudeCodeEnv 获取 Claude Code 环境变量的回调
     */
    constructor(options = {}) {
        super();
        this.happyHomeDir = options.happyHomeDir || config.HAPPY_HOME_DIR;
        this.startTimeout = options.startTimeout || config.DAEMON_START_TIMEOUT;
        this.startRetries = options.startRetries || config.DAEMON_START_RETRIES;
        this.happyCommand = options.happyCommand || config.HAPPY_COMMAND;
        
        // Claude Code 环境变量获取回调
        this._getClaudeCodeEnv = options.getClaudeCodeEnv || null;
        
        this.stateFilePath = path.join(this.happyHomeDir, 'daemon.state.json');
        this.startingLockPath = path.join(this.happyHomeDir, 'daemon.starting.lock');
        this.lockTimeout = options.lockTimeout || 30000; // 锁超时时间（毫秒）
        
        logDebug(`DaemonManager initialized, state file: ${this.stateFilePath}`);
    }

    /**
     * 构建 daemon 启动环境变量
     * @returns {Object} 环境变量对象
     */
    _buildDaemonEnv() {
        // 基础环境变量
        const env = { ...process.env };
        
        // 如果没有提供回调，直接返回
        if (!this._getClaudeCodeEnv) {
            return env;
        }
        
        try {
            const claudeEnv = this._getClaudeCodeEnv();
            if (claudeEnv) {
                // 注入 Claude Code 环境变量
                if (claudeEnv.ANTHROPIC_BASE_URL) {
                    env.ANTHROPIC_BASE_URL = claudeEnv.ANTHROPIC_BASE_URL;
                    logDebug(`Injecting ANTHROPIC_BASE_URL: ${claudeEnv.ANTHROPIC_BASE_URL}`);
                }
                if (claudeEnv.ANTHROPIC_AUTH_TOKEN) {
                    env.ANTHROPIC_AUTH_TOKEN = claudeEnv.ANTHROPIC_AUTH_TOKEN;
                    logDebug('Injecting ANTHROPIC_AUTH_TOKEN: ***');
                }
                if (claudeEnv.ANTHROPIC_MODEL) {
                    env.ANTHROPIC_MODEL = claudeEnv.ANTHROPIC_MODEL;
                    logDebug(`Injecting ANTHROPIC_MODEL: ${claudeEnv.ANTHROPIC_MODEL}`);
                }
                if (claudeEnv.ANTHROPIC_SMALL_FAST_MODEL) {
                    env.ANTHROPIC_SMALL_FAST_MODEL = claudeEnv.ANTHROPIC_SMALL_FAST_MODEL;
                    logDebug(`Injecting ANTHROPIC_SMALL_FAST_MODEL: ${claudeEnv.ANTHROPIC_SMALL_FAST_MODEL}`);
                }
                if (claudeEnv.API_TIMEOUT_MS) {
                    env.API_TIMEOUT_MS = String(claudeEnv.API_TIMEOUT_MS);
                    logDebug(`Injecting API_TIMEOUT_MS: ${claudeEnv.API_TIMEOUT_MS}`);
                }
                if (claudeEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
                    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
                    logDebug('Injecting CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1');
                }
                // 注入 Happy Server URL（账号服务器地址）
                if (claudeEnv.HAPPY_SERVER_URL) {
                    env.HAPPY_SERVER_URL = claudeEnv.HAPPY_SERVER_URL;
                    logDebug(`Injecting HAPPY_SERVER_URL: ${claudeEnv.HAPPY_SERVER_URL}`);
                }
            }
        } catch (error) {
            logWarn(`Failed to get Claude Code env vars: ${error.message}`);
        }
        
        return env;
    }

    // ========================================================================
    // 启动锁管理 - 防止并发启动多个 daemon 实例
    // ========================================================================

    /**
     * 尝试获取启动锁
     * @returns {boolean} 是否成功获取锁
     */
    _tryAcquireStartLock() {
        try {
            // 检查锁文件是否存在
            if (fs.existsSync(this.startingLockPath)) {
                const lockStat = fs.statSync(this.startingLockPath);
                const lockAge = Date.now() - lockStat.mtimeMs;
                
                // 如果锁未过期，获取失败
                if (lockAge < this.lockTimeout) {
                    logDebug(`Start lock exists and is fresh (${Math.round(lockAge / 1000)}s old)`);
                    return false;
                }
                
                // 锁已过期，删除旧锁
                logInfo(`Start lock expired (${Math.round(lockAge / 1000)}s old), removing...`);
                fs.unlinkSync(this.startingLockPath);
            }
            
            // 确保目录存在
            const lockDir = path.dirname(this.startingLockPath);
            if (!fs.existsSync(lockDir)) {
                fs.mkdirSync(lockDir, { recursive: true });
            }
            
            // 创建锁文件（排他模式）
            const lockData = {
                pid: process.pid,
                timestamp: Date.now(),
                hostname: require('os').hostname()
            };
            
            fs.writeFileSync(this.startingLockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
            logDebug('Start lock acquired');
            return true;
            
        } catch (error) {
            if (error.code === 'EEXIST') {
                // 文件已存在（竞态条件下另一个进程先创建了锁）
                logDebug('Start lock already exists (race condition)');
                return false;
            }
            logWarn(`Failed to acquire start lock: ${error.message}`);
            return false;
        }
    }

    /**
     * 释放启动锁
     */
    _releaseStartLock() {
        try {
            if (fs.existsSync(this.startingLockPath)) {
                // 验证锁是否是我们创建的
                const lockContent = fs.readFileSync(this.startingLockPath, 'utf8');
                const lockData = JSON.parse(lockContent);
                
                if (lockData.pid === process.pid) {
                    fs.unlinkSync(this.startingLockPath);
                    logDebug('Start lock released');
                } else {
                    logWarn(`Start lock owned by different process (PID: ${lockData.pid}), not releasing`);
                }
            }
        } catch (error) {
            logWarn(`Failed to release start lock: ${error.message}`);
        }
    }

    /**
     * 等待启动锁释放
     * @param {number} maxWait 最大等待时间（毫秒）
     * @returns {Promise<boolean>} 锁是否已释放
     */
    async _waitForStartLock(maxWait = 35000) {
        const startTime = Date.now();
        const checkInterval = 500;
        
        while (Date.now() - startTime < maxWait) {
            if (!fs.existsSync(this.startingLockPath)) {
                return true;
            }
            
            // 检查锁是否过期
            try {
                const lockStat = fs.statSync(this.startingLockPath);
                const lockAge = Date.now() - lockStat.mtimeMs;
                
                if (lockAge >= this.lockTimeout) {
                    logInfo('Start lock expired while waiting');
                    return true;
                }
            } catch (error) {
                // 文件可能已被删除
                return true;
            }
            
            await sleep(checkInterval);
        }
        
        return false;
    }

    /**
     * 获取 daemon 状态
     * @returns {Object|null} 状态对象
     */
    getDaemonState() {
        logDebug(`Checking daemon state file: ${this.stateFilePath}`);
        
        try {
            if (!fs.existsSync(this.stateFilePath)) {
                logDebug('Daemon state file not found');
                return null;
            }
            
            const content = fs.readFileSync(this.stateFilePath, 'utf8');
            const state = JSON.parse(content);
            logDebug(`Daemon state: PID=${state.pid}, Port=${state.httpPort}`);
            return state;
        } catch (error) {
            logDebug(`Failed to read daemon state: ${error.message}`);
            return null;
        }
    }

    /**
     * 检查 daemon 是否运行（同步方法）
     * @returns {boolean} 是否运行
     */
    isDaemonRunning() {
        const state = this.getDaemonState();
        
        if (!state || !state.pid) {
            logDebug('isDaemonRunning: State file invalid or no PID');
            return false;
        }
        
        const running = isProcessRunning(state.pid);
        logDebug(`isDaemonRunning: PID ${state.pid} ${running ? 'is running' : 'not running'}`);
        return running;
    }

    /**
     * 检查 daemon 是否运行（异步方法，通过 HTTP 端口验证）
     * @returns {Promise<boolean>} 是否运行
     */
    async isDaemonRunningAsync() {
        // 首先检查状态文件和进程
        const syncCheck = this.isDaemonRunning();
        if (!syncCheck) {
            return false;
        }
        
        // 进一步验证：尝试访问 daemon 的 HTTP 接口
        const port = this.getHttpPort();
        if (!port) {
            logDebug('isDaemonRunningAsync: Cannot get HTTP port');
            return false;
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`http://127.0.0.1:${port}/list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                logDebug('isDaemonRunningAsync: Daemon HTTP endpoint responding');
                return true;
            }
            
            logWarn(`isDaemonRunningAsync: HTTP response error ${response.status}`);
            return false;
        } catch (e) {
            logDebug(`isDaemonRunningAsync: Daemon HTTP endpoint not responding - ${e.message}`);
            // 如果 HTTP 检查失败但进程存在，仍返回 true（可能 daemon 还在初始化）
            return syncCheck;
        }
    }

    /**
     * 获取 daemon HTTP 端口
     * @returns {number|null} HTTP 端口
     */
    getHttpPort() {
        const state = this.getDaemonState();
        return state?.httpPort || null;
    }

    /**
     * 启动 daemon（单次尝试，带锁机制）
     * @param {number} timeout 超时时间（毫秒）
     * @returns {Promise<boolean>}
     */
    async _startDaemonOnce(timeout = null) {
        timeout = timeout || this.startTimeout;
        
        // 发射进度事件：准备获取锁
        this.emit('startProgress', { 
            stage: 'acquiring_lock', 
            progress: 10, 
            message: 'daemon.startProgress.acquiringLock' 
        });
        
        // 尝试获取启动锁
        if (!this._tryAcquireStartLock()) {
            logInfo('Another process is starting daemon, waiting...');
            
            // 等待锁释放
            const lockReleased = await this._waitForStartLock();
            
            if (!lockReleased) {
                this.emit('startProgress', { 
                    stage: 'error', 
                    progress: 0, 
                    message: 'daemon.startProgress.error' 
                });
                throw new Error('Timeout waiting for daemon start lock');
            }
            
            // 锁释放后检查 daemon 是否已经启动
            if (this.isDaemonRunning()) {
                logInfo('Daemon started by another process');
                return true;
            }
            
            // daemon 未启动，尝试重新获取锁
            if (!this._tryAcquireStartLock()) {
                this.emit('startProgress', { 
                    stage: 'error', 
                    progress: 0, 
                    message: 'daemon.startProgress.error' 
                });
                throw new Error('Failed to acquire start lock after waiting');
            }
        }
        
        // 获取到锁，执行启动流程
        try {
            return await this._doStartDaemon(timeout);
        } finally {
            // 无论成功失败都释放锁
            this._releaseStartLock();
        }
    }

    /**
     * 检查 daemon HTTP 服务是否就绪
     * @param {number} port HTTP 端口
     * @param {number} timeoutMs 超时时间
     * @returns {Promise<boolean>}
     * @private
     */
    async _checkDaemonHttpReady(port, timeoutMs = 2000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            
            const response = await fetch(`http://127.0.0.1:${port}/list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * 实际执行 daemon 启动（内部方法）
     * 使用 HTTP 健康检查确认 daemon 服务就绪
     * @param {number} timeout 超时时间（毫秒）
     * @returns {Promise<boolean>}
     * @private
     */
    async _doStartDaemon(timeout) {
        // 保存 this 引用，供内部回调使用
        const self = this;
        
        return new Promise((resolve, reject) => {
            let spawnError = null;
            let stderrOutput = '';
            let processExited = false;
            let exitCode = null;
            let resolved = false;
            
            const cleanup = (checkInterval) => {
                if (checkInterval) clearInterval(checkInterval);
            };
            
            // 使用本地 happy-cli 路径
            const happyBinPath = getLocalHappyPath();
            logInfo(`Executing: node ${happyBinPath} daemon start`);
            
            // 发射进度事件：正在启动进程
            self.emit('startProgress', { 
                stage: 'spawning', 
                progress: 20, 
                message: 'daemon.startProgress.spawning' 
            });
            
            // 构建环境变量（包含 Claude Code 配置）
            const daemonEnv = this._buildDaemonEnv();
            
            // 使用系统 Node.js 执行本地 happy.mjs
            const daemonProcess = spawn('node', [happyBinPath, 'daemon', 'start'], {
                detached: true,
                stdio: ['ignore', 'pipe', 'pipe'], // 捕获 stdout 和 stderr
                shell: true,
                windowsHide: true,
                env: daemonEnv
            });

            // 捕获 stdout 输出（daemon 可能输出启动信息）
            if (daemonProcess.stdout) {
                daemonProcess.stdout.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        logDebug(`Daemon stdout: ${output}`);
                    }
                });
            }

            // 捕获 stderr 输出（用于诊断错误）
            if (daemonProcess.stderr) {
                daemonProcess.stderr.on('data', (data) => {
                    stderrOutput += data.toString();
                });
            }

            // 监听 spawn 错误
            daemonProcess.on('error', (error) => {
                spawnError = error;
                logError(`Spawn error: ${error.message}`);
                self.emit('startProgress', { 
                    stage: 'error', 
                    progress: 0, 
                    message: 'daemon.startProgress.error' 
                });
            });

            // 监听进程退出 - 关键改进：检测 daemon 是否意外退出
            daemonProcess.on('exit', (code, signal) => {
                processExited = true;
                exitCode = code;
                // 注意：daemon 正常启动后会 detach，父进程会看到 exit
                // 但如果是因为错误退出，code 不会是 0
                if (code !== 0 && code !== null) {
                    logWarn(`Daemon process exited with code ${code}, signal ${signal}`);
                }
            });

            daemonProcess.unref();

            const startTime = Date.now();
            let stateFileFound = false;
            let httpCheckAttempts = 0;
            let waitingStateEmitted = false;
            let httpCheckEmitted = false;
            
            const checkInterval = setInterval(async () => {
                if (resolved) return;
                
                // 检查是否有 spawn 错误
                if (spawnError) {
                    resolved = true;
                    cleanup(checkInterval);
                    reject(new Error(`Daemon start failed: ${spawnError.message}`));
                    return;
                }

                // 阶段 1: 等待状态文件出现
                const state = self.getDaemonState();
                if (!state || !state.pid) {
                    // 发射等待状态文件进度（只发射一次）
                    if (!waitingStateEmitted) {
                        waitingStateEmitted = true;
                        self.emit('startProgress', { 
                            stage: 'waiting_state', 
                            progress: 40, 
                            message: 'daemon.startProgress.waitingState' 
                        });
                    }
                    
                    // 检查超时
                    if (Date.now() - startTime > timeout) {
                        resolved = true;
                        cleanup(checkInterval);
                        self.emit('startProgress', { 
                            stage: 'error', 
                            progress: 0, 
                            message: 'daemon.startProgress.error' 
                        });
                        let errorMsg = 'Daemon start timeout: state file not created';
                        if (stderrOutput) {
                            errorMsg += `\nStderr: ${stderrOutput.trim()}`;
                        }
                        reject(new Error(errorMsg));
                    }
                    return;
                }
                
                if (!stateFileFound) {
                    stateFileFound = true;
                    logDebug(`Daemon state file found: PID=${state.pid}, Port=${state.httpPort}`);
                }

                // 阶段 2: 检查进程是否存活
                if (!isProcessRunning(state.pid)) {
                    // 进程不存在，可能是启动后崩溃了
                    resolved = true;
                    cleanup(checkInterval);
                    self.emit('startProgress', { 
                        stage: 'error', 
                        progress: 0, 
                        message: 'daemon.startProgress.error' 
                    });
                    let errorMsg = `Daemon process ${state.pid} not running (crashed after start)`;
                    if (stderrOutput) {
                        errorMsg += `\nStderr: ${stderrOutput.trim()}`;
                    }
                    reject(new Error(errorMsg));
                    return;
                }

                // 阶段 3: HTTP 健康检查（确认服务真正就绪）
                if (state.httpPort) {
                    // 发射 HTTP 检查进度（只发射一次）
                    if (!httpCheckEmitted) {
                        httpCheckEmitted = true;
                        self.emit('startProgress', { 
                            stage: 'http_check', 
                            progress: 60, 
                            message: 'daemon.startProgress.httpCheck' 
                        });
                    }
                    
                    httpCheckAttempts++;
                    const isReady = await self._checkDaemonHttpReady(state.httpPort);
                    
                    if (isReady) {
                        resolved = true;
                        cleanup(checkInterval);
                        logInfo(`Daemon ready (PID: ${state.pid}, Port: ${state.httpPort}, HTTP OK after ${httpCheckAttempts} attempts)`);
                        resolve(true);
                        return;
                    }
                    
                    logDebug(`HTTP health check attempt ${httpCheckAttempts} - not ready yet`);
                }

                // 检查总体超时
                if (Date.now() - startTime > timeout) {
                    resolved = true;
                    cleanup(checkInterval);
                    self.emit('startProgress', { 
                        stage: 'error', 
                        progress: 0, 
                        message: 'daemon.startProgress.error' 
                    });
                    let errorMsg = `Daemon start timeout: HTTP service not ready after ${httpCheckAttempts} attempts`;
                    if (stderrOutput) {
                        errorMsg += `\nStderr: ${stderrOutput.trim()}`;
                    }
                    reject(new Error(errorMsg));
                }
            }, 500);
        });
    }

    /**
     * 启动 daemon（带重试）
     * @param {number} maxRetries 最大重试次数
     * @returns {Promise<boolean>}
     */
    async startDaemon(maxRetries = null) {
        maxRetries = maxRetries !== null ? maxRetries : this.startRetries;
        
        // 双重检查：先用同步方法
        if (this.isDaemonRunning()) {
            logInfo('Daemon already running (sync check)');
            return true;
        }
        
        // 再用异步方法验证
        if (await this.isDaemonRunningAsync()) {
            logInfo('Daemon already running (async check)');
            return true;
        }

        logInfo('Confirmed Daemon not running, starting...');

        let lastError = null;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    logInfo(`Retry ${attempt + 1} starting Daemon...`);
                    // 重试前等待一段时间
                    await sleep(2000);
                    // 再次清理可能的残留状态
                    this._cleanupStaleState();
                }
                
                await this._startDaemonOnce();
                
                // 发射状态变化事件
                const status = this.getStatus();
                logDebug('Emitting statusChanged event after daemon start');
                this.emit('statusChanged', status);
                
                return true;
            } catch (error) {
                lastError = error;
                logWarn(`Daemon start attempt ${attempt + 1} failed: ${error.message}`);
            }
        }

        throw lastError || new Error('Daemon start failed');
    }

    /**
     * 清理旧的 daemon 状态文件
     */
    _cleanupStaleState() {
        const state = this.getDaemonState();
        
        if (state && state.pid && !isProcessRunning(state.pid)) {
            logInfo(`Found stale daemon state file (PID: ${state.pid} no longer exists), cleaning up...`);
            
            try {
                if (fs.existsSync(this.stateFilePath)) {
                    fs.unlinkSync(this.stateFilePath);
                    logInfo('Stale daemon state file cleaned up');
                }
                
                // 同时清理锁文件
                const lockFilePath = path.join(this.happyHomeDir, 'daemon.lock');
                if (fs.existsSync(lockFilePath)) {
                    fs.unlinkSync(lockFilePath);
                    logInfo('Stale daemon lock file cleaned up');
                }
            } catch (error) {
                logWarn(`Failed to clean up state file: ${error.message}`);
            }
        }
    }

    /**
     * 确保 daemon 运行
     * @returns {Promise<boolean>}
     */
    async ensureDaemonRunning() {
        // 添加随机延迟（0-300ms）避免多实例完全同步检查
        const randomDelay = Math.floor(Math.random() * 300);
        if (randomDelay > 0) {
            logDebug(`ensureDaemonRunning: Random delay ${randomDelay}ms`);
            await sleep(randomDelay);
        }
        
        // 第一次检查：使用异步检查确保更准确
        if (await this.isDaemonRunningAsync()) {
            logInfo('ensureDaemonRunning: Daemon already running (first check)');
            return true;
        }
        
        // 短暂等待后进行双重检查，避免竞态条件
        await sleep(100);
        
        // 第二次检查：再次确认 daemon 状态
        if (await this.isDaemonRunningAsync()) {
            logInfo('ensureDaemonRunning: Daemon already running (double check)');
            return true;
        }
        
        // 确认需要启动
        logInfo('ensureDaemonRunning: Confirmed daemon not running, proceeding to start...');
        return await this.startDaemon();
    }

    /**
     * 在停止 daemon 之前停止所有会话
     * @private
     * @returns {Promise<void>}
     */
    async _stopAllSessionsBeforeShutdown() {
        // 检查 daemon 是否运行
        if (!this.isDaemonRunning()) {
            logDebug('_stopAllSessionsBeforeShutdown: Daemon not running, skipping');
            return;
        }

        const port = this.getHttpPort();
        if (!port) {
            logDebug('_stopAllSessionsBeforeShutdown: Cannot get HTTP port, skipping');
            return;
        }

        try {
            logInfo('_stopAllSessionsBeforeShutdown: Stopping all sessions before daemon shutdown...');
            
            // 获取所有会话列表
            const listResponse = await this.daemonRequest('/list', {}, 5000);
            const children = listResponse?.children || [];
            
            if (children.length === 0) {
                logInfo('_stopAllSessionsBeforeShutdown: No active sessions');
                return;
            }

            logInfo(`_stopAllSessionsBeforeShutdown: Found ${children.length} sessions, stopping...`);

            // 逐个停止会话
            for (const session of children) {
                const sessionId = session.happySessionId;
                if (!sessionId) continue;

                try {
                    logInfo(`_stopAllSessionsBeforeShutdown: Stopping session ${sessionId} (PID: ${session.pid})`);
                    await this.daemonRequest('/stop-session', { sessionId }, 5000);
                } catch (error) {
                    logWarn(`_stopAllSessionsBeforeShutdown: Failed to stop session ${sessionId}: ${error.message}`);
                }
            }

            // 等待会话进程退出
            await sleep(1000);
            logInfo('_stopAllSessionsBeforeShutdown: All sessions stopped');

        } catch (error) {
            logWarn(`_stopAllSessionsBeforeShutdown: Error stopping sessions: ${error.message}`);
            // 不抛出错误，继续停止 daemon
        }
    }

    /**
     * 停止 daemon
     * @param {number} timeout 等待停止超时时间（毫秒）
     * @returns {Promise<boolean>} 是否成功停止
     */
    async stopDaemon(timeout = 10000) {
        // 先停止所有会话
        await this._stopAllSessionsBeforeShutdown();
        
        const state = this.getDaemonState();
        
        if (!state || !state.pid) {
            logInfo('stopDaemon: Daemon not running (no state file)');
            // 发射状态变化事件（即使已停止也通知）
            this.emit('statusChanged', this.getStatus());
            return true;
        }
        
        const pid = state.pid;
        
        // 检查进程是否存在
        if (!isProcessRunning(pid)) {
            logInfo(`stopDaemon: Process ${pid} no longer exists, cleaning up state file`);
            this._cleanupStateFile();
            // 发射状态变化事件
            this.emit('statusChanged', this.getStatus());
            return true;
        }
        
        logInfo(`stopDaemon: Stopping daemon (PID: ${pid})...`);
        
        try {
            // 发送终止信号
            const isWindows = process.platform === 'win32';
            if (isWindows) {
                // Windows 下使用 taskkill，/T 参数终止进程树（包括子进程）
                const { execSync } = require('child_process');
                try {
                    execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
                } catch (e) {
                    // taskkill 可能失败，继续检查
                }
            } else {
                // Unix 下发送 SIGTERM
                process.kill(pid, 'SIGTERM');
            }
            
            // 等待进程退出
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
                if (!isProcessRunning(pid)) {
                    logInfo(`stopDaemon: Process ${pid} stopped`);
                    this._cleanupStateFile();
                    // 发射状态变化事件
                    logDebug('Emitting statusChanged event after daemon stop');
                    this.emit('statusChanged', this.getStatus());
                    return true;
                }
                await sleep(500);
            }
            
            // 超时后强制终止
            logWarn(`stopDaemon: Process ${pid} not responding, force killing...`);
            if (isWindows) {
                const { execSync } = require('child_process');
                try {
                    execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
                } catch (e) {
                    // ignore
                }
            } else {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (e) {
                    // ignore
                }
            }
            
            // 再等待一下
            await sleep(1000);
            
            if (!isProcessRunning(pid)) {
                logInfo(`stopDaemon: Process ${pid} force killed`);
                this._cleanupStateFile();
                // 发射状态变化事件
                logDebug('Emitting statusChanged event after daemon force kill');
                this.emit('statusChanged', this.getStatus());
                return true;
            }
            
            logError(`stopDaemon: Unable to stop process ${pid}`);
            return false;
            
        } catch (error) {
            logError(`stopDaemon: Stop failed - ${error.message}`);
            return false;
        }
    }

    /**
     * 清理状态文件
     * @private
     */
    _cleanupStateFile() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                fs.unlinkSync(this.stateFilePath);
                logDebug('Daemon state file cleaned up');
            }
        } catch (error) {
            logWarn(`Failed to clean up state file: ${error.message}`);
        }
    }

    /**
     * 重启 daemon
     * @returns {Promise<boolean>} 是否成功重启
     */
    async restartDaemon() {
        logInfo('restartDaemon: Restarting daemon...');
        
        // 1. 停止旧进程（stopDaemon 内部会发射 statusChanged 事件）
        const stopped = await this.stopDaemon();
        if (!stopped) {
            logError('restartDaemon: Failed to stop old process');
            return false;
        }
        
        // 等待一小段时间确保端口释放
        await sleep(1000);
        
        // 2. 启动新进程（startDaemon 内部会发射 statusChanged 事件）
        logInfo('restartDaemon: Starting new daemon...');
        const started = await this.startDaemon();
        
        if (started) {
            logInfo('restartDaemon: Daemon restart successful');
            // 额外发射一次事件确保前端收到最新状态
            const status = this.getStatus();
            logDebug('Emitting statusChanged event after daemon restart');
            this.emit('statusChanged', status);
        } else {
            logError('restartDaemon: Failed to start new process');
        }
        
        return started;
    }

    /**
     * 获取 daemon 状态信息
     * @returns {Object} 状态信息
     */
    getStatus() {
        const state = this.getDaemonState();
        const isRunning = this.isDaemonRunning();

        return {
            running: isRunning,
            pid: state?.pid || null,
            httpPort: state?.httpPort || null,
            startTime: state?.startTime || null,
            cliVersion: state?.startedWithCliVersion || null,
            lastHeartbeat: state?.lastHeartbeat || null,
            logPath: state?.daemonLogPath || null,
            stateFilePath: this.stateFilePath
        };
    }

    /**
     * 发送 HTTP 请求到 daemon
     * @param {string} endpoint API 端点
     * @param {Object} body 请求体
     * @param {number} timeout 超时时间（毫秒）
     * @returns {Promise<Object>} 响应对象
     */
    async daemonRequest(endpoint, body = {}, timeout = 60000) {
        const port = this.getHttpPort();
        
        if (!port) {
            throw new Error('Daemon not running or unable to get port');
        }

        const url = `http://127.0.0.1:${port}${endpoint}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                // 尝试读取响应体中的错误信息
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                
                try {
                    const errorBody = await response.text();
                    if (errorBody) {
                        try {
                            const errorJson = JSON.parse(errorBody);
                            if (errorJson.error || errorJson.errorMessage || errorJson.message) {
                                errorMessage += ` - ${errorJson.error || errorJson.errorMessage || errorJson.message}`;
                            } else {
                                errorMessage += ` - ${errorBody}`;
                            }
                        } catch (e) {
                            // 如果不是 JSON，直接使用文本
                            errorMessage += ` - ${errorBody}`;
                        }
                    }
                } catch (e) {
                    // 忽略读取错误体的失败
                }
                
                throw new Error(errorMessage);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout: ${endpoint}`);
            }
            
            throw error;
        }
    }
}

module.exports = DaemonManager;
