/**
 * Happy Daemon 客户端
 * 
 * 封装与 Happy Daemon 的 HTTP API 交互
 * 
 * 功能：
 * - 检查 daemon 运行状态
 * - 启动/停止 daemon
 * - 创建/管理 session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

/**
 * 获取本地 happy-cli 的可执行路径
 * @returns {string} happy.mjs 的绝对路径
 */
function getLocalHappyPath() {
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
            appRoot = path.join(__dirname, '..', '..', '..');
        }
    } catch (e) {
        // Electron app 不可用，使用 __dirname
        appRoot = path.join(__dirname, '..', '..', '..');
    }
    
    const possiblePaths = [];
    
    // 打包环境：优先使用 app.asar.unpacked 目录（通过 asarUnpack 解压的文件）
    if (isPackaged || appRoot.includes('app.asar')) {
        // app.asar.unpacked 路径（外部 Node.js 可以执行）
        const unpackedPath = appRoot.replace('app.asar', 'app.asar.unpacked');
        possiblePaths.push(
            path.join(unpackedPath, 'lib', 'happy-cli', 'bin', 'happy.mjs'),
            path.join(unpackedPath, 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
        );
    }
    
    // 开发环境优先直接使用仓库内置的 lib/happy-cli
    possiblePaths.push(
        path.join(appRoot, 'lib', 'happy-cli', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', '..', 'happy-cli', 'bin', 'happy.mjs'),
        path.join(appRoot, 'node_modules', 'happy-coder', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', '..', '..', 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
    );
    
    for (const testPath of possiblePaths) {
        // 注意：对于 app.asar.unpacked 路径，需要检查实际文件系统
        try {
            if (fs.existsSync(testPath)) {
                return testPath;
            }
        } catch (e) {
            // 忽略检查错误
        }
    }
    
    // 最后的回退
    const appLibPath = path.join(appRoot, 'lib', 'happy-cli', 'bin', 'happy.mjs');
    return appLibPath;
}

class DaemonClient {
    constructor(options = {}) {
        this.options = {
            happyHomeDir: options.happyHomeDir || process.env.HAPPY_HOME_DIR || path.join(os.homedir(), '.happy'),
            httpTimeout: options.httpTimeout || 15000,
            daemonStartTimeout: options.daemonStartTimeout || 10000,
            ...options
        };
        
        this.stateFilePath = path.join(this.options.happyHomeDir, 'daemon.state.json');
    }

    /**
     * 获取 daemon 状态文件内容
     * @returns {Object|null} 状态对象或 null
     */
    getDaemonState() {
        try {
            if (!fs.existsSync(this.stateFilePath)) {
                return null;
            }
            const content = fs.readFileSync(this.stateFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    /**
     * 检查进程是否在运行
     * @param {number} pid - 进程 ID
     * @returns {boolean}
     */
    isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * 检查 daemon 是否在运行
     * @returns {boolean}
     */
    isDaemonRunning() {
        const state = this.getDaemonState();
        if (!state || !state.pid) {
            return false;
        }
        return this.isProcessRunning(state.pid);
    }

    /**
     * 获取 daemon HTTP 端口
     * @returns {number|null} HTTP 端口或 null
     */
    getHttpPort() {
        const state = this.getDaemonState();
        return state?.httpPort || null;
    }

    /**
     * 获取 daemon 基础 URL
     * @returns {string|null}
     */
    getBaseUrl() {
        const port = this.getHttpPort();
        if (!port) return null;
        return `http://127.0.0.1:${port}`;
    }

    /**
     * 发送 HTTP 请求到 daemon
     * @param {string} endpoint - API 端点
     * @param {Object} body - 请求体
     * @returns {Promise<Object>} 响应数据
     */
    async request(endpoint, body = {}) {
        const baseUrl = this.getBaseUrl();
        if (!baseUrl) {
            throw new Error('Daemon not running or unable to get port');
        }

        const url = `${baseUrl}${endpoint}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.httpTimeout);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

    /**
     * 启动 daemon
     * @returns {Promise<boolean>} 是否成功启动
     */
    async startDaemon() {
        if (this.isDaemonRunning()) {
            console.log('[DaemonClient] Daemon already running');
            return true;
        }

        console.log('[DaemonClient] Starting Happy Daemon...');

        return new Promise((resolve, reject) => {
            // 使用项目内的 happy-cli 路径，避免依赖全局命令
            const happyBinPath = getLocalHappyPath();
            console.log(`[DaemonClient] Using happy path: ${happyBinPath}`);
            
            // 使用 node 执行本地 happy.mjs，不使用 shell 避免 Windows 打开新命令行窗口
            const daemonProcess = spawn('node', [happyBinPath, 'daemon', 'start'], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });

            daemonProcess.unref();

            // 等待 daemon 启动
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (this.isDaemonRunning()) {
                    clearInterval(checkInterval);
                    console.log('[DaemonClient] Daemon started successfully');
                    resolve(true);
                } else if (Date.now() - startTime > this.options.daemonStartTimeout) {
                    clearInterval(checkInterval);
                    reject(new Error('Daemon start timeout'));
                }
            }, 500);
        });
    }

    /**
     * 停止 daemon
     * @returns {Promise<Object>} 响应数据
     */
    async stopDaemon() {
        if (!this.isDaemonRunning()) {
            console.log('[DaemonClient] Daemon not running');
            return { type: 'success', message: 'Daemon not running' };
        }

        try {
            const result = await this.request('/stop', {});
            console.log('[DaemonClient] Daemon stopped');
            return result;
        } catch (error) {
            // daemon 停止后连接会断开，这是正常的
            if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
                return { type: 'success', message: 'Daemon stopped' };
            }
            throw error;
        }
    }

    /**
     * 确保 daemon 运行
     * @returns {Promise<boolean>}
     */
    async ensureDaemonRunning() {
        if (this.isDaemonRunning()) {
            return true;
        }
        return await this.startDaemon();
    }

    /**
     * 通过 daemon 创建 session
     * @param {string} directory - 工作目录
     * @returns {Promise<Object>} 包含 sessionId 的响应
     */
    async spawnSession(directory) {
        // 确保 daemon 运行
        await this.ensureDaemonRunning();

        console.log(`[DaemonClient] Creating session, workDir: ${directory}`);

        const result = await this.request('/spawn-session', { directory });

        if (result.type === 'error') {
            throw new Error(result.errorMessage || 'spawn-session failed');
        }

        console.log(`[DaemonClient] Session created: ${result.sessionId}`);
        return result;
    }

    /**
     * 列出所有 session
     * @returns {Promise<Array>} session 列表
     */
    async listSessions() {
        if (!this.isDaemonRunning()) {
            return [];
        }

        const result = await this.request('/list', {});
        return result.children || [];
    }

    /**
     * 停止指定 session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} 响应数据
     */
    async stopSession(sessionId) {
        if (!this.isDaemonRunning()) {
            throw new Error('Daemon not running');
        }

        console.log(`[DaemonClient] Stopping session: ${sessionId}`);
        return await this.request('/stop-session', { sessionId });
    }

    /**
     * 通过 PID 查找 session ID
     * @param {number} pid - 进程 ID
     * @returns {Promise<string|null>} Session ID 或 null
     */
    async findSessionByPid(pid) {
        const sessions = await this.listSessions();
        const session = sessions.find(s => s.pid === pid);
        return session?.happySessionId || null;
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
            logPath: state?.daemonLogPath || null
        };
    }
}

module.exports = DaemonClient;

