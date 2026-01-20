/**
 * API 适配器
 * 
 * 提供统一的 API 调用接口，支持 Electron IPC 和 HTTP 两种模式
 * 
 * 在 Electron 环境下使用 IPC 通信
 * 在 Web 浏览器环境下使用 HTTP/WebSocket 与本地服务通信
 * 
 * 创建时间: 2026-01-20
 */

/**
 * 检测当前运行环境
 * @returns {'electron' | 'web'} 环境类型
 */
function detectEnvironment() {
    // 检查是否有 Electron IPC 接口
    if (window.browserControlManager && typeof window.browserControlManager === 'object') {
        // 进一步检查是否有关键方法
        if (typeof window.browserControlManager.getServerStatus === 'function') {
            return 'electron';
        }
    }
    return 'web';
}

/**
 * IPC 方法名到 HTTP 端点的映射
 */
const API_MAPPING = {
    // 服务器状态
    'getServerStatus': { method: 'GET', path: '/api/status' },
    'getDetailedStatus': { method: 'GET', path: '/api/status' },
    
    // AI 相关
    'getAiStatus': { method: 'GET', path: '/api/ai/status' },
    'connectAi': { method: 'POST', path: '/api/ai/connect' },
    'disconnectAi': { method: 'POST', path: '/api/ai/disconnect' },
    'sendMessage': { method: 'POST', path: '/api/ai/message', bodyKey: 'text' },
    'getMessages': { method: 'GET', path: '/api/ai/messages', queryKey: 'limit' },
    'clearMessages': { method: 'DELETE', path: '/api/ai/messages' },
    'restoreMessages': { method: 'POST', path: '/api/ai/messages/restore', bodyKey: 'messages' },
    'getLatestUsage': { method: 'GET', path: '/api/ai/usage' },
    'allowPermission': { method: 'POST', path: '/api/ai/permission/allow' },
    'denyPermission': { method: 'POST', path: '/api/ai/permission/deny' },
    'abortSession': { method: 'POST', path: '/api/ai/abort' },
    'getAllSessions': { method: 'GET', path: '/api/ai/sessions' },
    'getSessionId': { method: 'GET', path: '/api/ai/session/{name}' },
    'reconnectSession': { method: 'POST', path: '/api/ai/session/reconnect' },
    
    // 账户相关
    'getAccountInfo': { method: 'GET', path: '/api/account' },
    'hasSecret': { method: 'GET', path: '/api/account/hasSecret' },
    'generateSecret': { method: 'POST', path: '/api/account/generateSecret' },
    'validateSecret': { method: 'POST', path: '/api/account/validateSecret' },
    'verifySecret': { method: 'POST', path: '/api/account/verifySecret' },
    'saveSecret': { method: 'POST', path: '/api/account/secret' },
    'logout': { method: 'POST', path: '/api/account/logout' },
    'changeServer': { method: 'POST', path: '/api/account/changeServer' },
    'getFormattedSecret': { method: 'GET', path: '/api/account/formattedSecret' },
    
    // 文件系统
    'getWorkspaceRoot': { method: 'GET', path: '/api/files/workspace' },
    'listDirectory': { method: 'GET', path: '/api/files/list', queryKey: 'path' },
    'createFolder': { method: 'POST', path: '/api/files/folder' },
    'deleteItem': { method: 'DELETE', path: '/api/files/item', queryKey: 'path' },
    'renameItem': { method: 'PUT', path: '/api/files/rename' },
    'readFileContent': { method: 'GET', path: '/api/files/content', queryKey: 'path' },
    'saveFileContent': { method: 'PUT', path: '/api/files/content' },
    'getItemInfo': { method: 'GET', path: '/api/files/info', queryKey: 'path' },
    'copyItem': { method: 'POST', path: '/api/files/copy' },
    'moveItem': { method: 'POST', path: '/api/files/move' },
    'openFile': { method: 'POST', path: '/api/files/open' },
    'showInExplorer': { method: 'POST', path: '/api/files/showInExplorer' },
    
    // Daemon 管理
    'getDaemonStatus': { method: 'GET', path: '/api/daemon/status' },
    'isDaemonRunning': { method: 'GET', path: '/api/daemon/running' },
    'startDaemon': { method: 'POST', path: '/api/daemon/start' },
    'stopDaemon': { method: 'POST', path: '/api/daemon/stop' },
    'restartDaemon': { method: 'POST', path: '/api/daemon/restart' },
    
    // 设置
    'getSettings': { method: 'GET', path: '/api/settings' },
    'getSetting': { method: 'GET', path: '/api/settings/{keyPath}' },
    'setSetting': { method: 'PUT', path: '/api/settings/{keyPath}' },
    'getAllHappySettings': { method: 'GET', path: '/api/settings/happy/all' },
    'saveHappySettings': { method: 'PUT', path: '/api/settings/happy' },
    'getWorkspaceSettings': { method: 'GET', path: '/api/settings/workspace' },
    'setWorkspaceDir': { method: 'PUT', path: '/api/settings/workspace' },
    'resetWorkspaceDir': { method: 'DELETE', path: '/api/settings/workspace' },
    'getWorkDirs': { method: 'GET', path: '/api/settings/workdirs' },
    'getClaudeSettings': { method: 'GET', path: '/api/settings/claude' },
    'saveClaudeSettings': { method: 'PUT', path: '/api/settings/claude' },
    'getClaudePresets': { method: 'GET', path: '/api/settings/claude/presets' },
    
    // 浏览器控制
    'getTabs': { method: 'GET', path: '/api/browser/tabs' },
    'closeTab': { method: 'POST', path: '/api/browser/tab/close' },
    'openUrl': { method: 'POST', path: '/api/browser/tab/open' },
    'getExtensionStatus': { method: 'GET', path: '/api/browser/extension/status' }
};

/**
 * IPC 方法名到适配器方法名的映射（用于兼容现有代码）
 */
const IPC_METHOD_MAPPING = {
    // 从 browserControlManager 的方法名映射
    'getServerStatus': 'getServerStatus',
    'getDetailedStatus': 'getDetailedStatus',
    'getAiStatus': 'getAiStatus',
    'connectAi': 'connectAi',
    'disconnectAi': 'disconnectAi',
    'sendAiMessage': 'sendMessage',
    'getAiMessages': 'getMessages',
    'clearAiMessages': 'clearMessages',
    'restoreAiMessages': 'restoreMessages',
    'getAiUsage': 'getLatestUsage',
    'allowAiPermission': 'allowPermission',
    'denyAiPermission': 'denyPermission',
    'abortAi': 'abortSession'
};

/**
 * API 适配器类
 */
class ApiAdapter {
    constructor() {
        this._mode = null;
        this._baseUrl = null;
        this._wsClient = null;
        this._eventListeners = new Map();
        this._connectionStatus = 'disconnected';
    }

    /**
     * 初始化适配器
     * @param {Object} options 选项
     * @param {string} [options.baseUrl] HTTP 基础 URL（Web 模式）
     * @param {string} [options.wsUrl] WebSocket URL（Web 模式）
     */
    async initialize(options = {}) {
        this._mode = detectEnvironment();
        
        console.log(`[ApiAdapter] Initialized in ${this._mode} mode`);
        
        if (this._mode === 'web') {
            // Web 模式：配置 HTTP 基础 URL
            this._baseUrl = options.baseUrl || 'http://localhost:3333';
            
            // 测试连接
            const connected = await this.checkConnection();
            this._connectionStatus = connected ? 'connected' : 'disconnected';
            
            return {
                mode: this._mode,
                connected: this._connectionStatus === 'connected',
                baseUrl: this._baseUrl
            };
        }
        
        // Electron 模式
        this._connectionStatus = 'connected';
        return {
            mode: this._mode,
            connected: true
        };
    }

    /**
     * 获取当前模式
     * @returns {'electron' | 'web'} 模式
     */
    getMode() {
        return this._mode;
    }

    /**
     * 检查是否已连接
     * @returns {boolean} 是否连接
     */
    isConnected() {
        return this._connectionStatus === 'connected';
    }

    /**
     * 检查本地服务连接
     * @returns {Promise<boolean>} 是否可用
     */
    async checkConnection() {
        if (this._mode === 'electron') {
            return true;
        }

        try {
            const response = await fetch(`${this._baseUrl}/api/ping`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                this._connectionStatus = 'connected';
                return true;
            }
        } catch (error) {
            console.warn('[ApiAdapter] Connection check failed:', error.message);
        }
        
        this._connectionStatus = 'disconnected';
        return false;
    }

    /**
     * 调用 API
     * @param {string} method 方法名
     * @param {...any} args 参数
     * @returns {Promise<any>} 返回结果
     */
    async call(method, ...args) {
        if (this._mode === 'electron') {
            return this._callElectron(method, ...args);
        }
        return this._callHttp(method, ...args);
    }

    /**
     * 通过 Electron IPC 调用
     * @private
     */
    async _callElectron(method, ...args) {
        // 映射方法名
        const ipcMethod = IPC_METHOD_MAPPING[method] || method;
        
        if (typeof window.browserControlManager[ipcMethod] !== 'function') {
            throw new Error(`Method "${ipcMethod}" not found in browserControlManager`);
        }
        
        return window.browserControlManager[ipcMethod](...args);
    }

    /**
     * 通过 HTTP 调用
     * @private
     */
    async _callHttp(method, ...args) {
        const mapping = API_MAPPING[method];
        
        if (!mapping) {
            throw new Error(`No HTTP mapping for method "${method}"`);
        }
        
        let { method: httpMethod, path, queryKey, bodyKey } = mapping;
        
        // 处理路径参数
        if (path.includes('{')) {
            // 替换路径参数
            const paramMatch = path.match(/\{(\w+)\}/);
            if (paramMatch && args[0] !== undefined) {
                path = path.replace(`{${paramMatch[1]}}`, encodeURIComponent(args[0]));
                args = args.slice(1);
            }
        }
        
        // 构建请求选项
        const options = {
            method: httpMethod,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // 构建 URL
        let url = `${this._baseUrl}${path}`;
        
        // 处理查询参数
        if (queryKey && args[0] !== undefined) {
            const params = new URLSearchParams();
            params.set(queryKey, args[0]);
            url += `?${params.toString()}`;
        }
        
        // 处理请求体
        if (httpMethod !== 'GET' && httpMethod !== 'DELETE') {
            if (bodyKey && args[0] !== undefined) {
                // 单个值作为指定键
                options.body = JSON.stringify({ [bodyKey]: args[0] });
            } else if (args[0] !== undefined && typeof args[0] === 'object') {
                // 对象直接作为请求体
                options.body = JSON.stringify(args[0]);
            }
        }
        
        // 发送请求
        const response = await fetch(url, options);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        return data;
    }

    /**
     * 注册事件监听器
     * @param {string} event 事件名
     * @param {Function} callback 回调函数
     */
    on(event, callback) {
        if (!this._eventListeners.has(event)) {
            this._eventListeners.set(event, new Set());
        }
        this._eventListeners.get(event).add(callback);
        
        // 如果是 Electron 模式，直接转发到 IPC 事件
        if (this._mode === 'electron' && window.browserControlManager.on) {
            window.browserControlManager.on(event, callback);
        }
    }

    /**
     * 移除事件监听器
     * @param {string} event 事件名
     * @param {Function} callback 回调函数
     */
    off(event, callback) {
        if (this._eventListeners.has(event)) {
            this._eventListeners.get(event).delete(callback);
        }
        
        if (this._mode === 'electron' && window.browserControlManager.off) {
            window.browserControlManager.off(event, callback);
        }
    }

    /**
     * 触发事件
     * @param {string} event 事件名
     * @param {*} data 事件数据
     */
    emit(event, data) {
        if (this._eventListeners.has(event)) {
            for (const callback of this._eventListeners.get(event)) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[ApiAdapter] Event handler error for "${event}":`, error);
                }
            }
        }
    }

    /**
     * 设置 WebSocket 客户端
     * @param {Object} wsClient WebSocket 客户端实例
     */
    setWebSocketClient(wsClient) {
        this._wsClient = wsClient;
    }

    /**
     * 获取 WebSocket 客户端
     * @returns {Object|null} WebSocket 客户端实例
     */
    getWebSocketClient() {
        return this._wsClient;
    }
}

// 创建单例
const apiAdapter = new ApiAdapter();

// 导出
window.ApiAdapter = ApiAdapter;
window.apiAdapter = apiAdapter;
