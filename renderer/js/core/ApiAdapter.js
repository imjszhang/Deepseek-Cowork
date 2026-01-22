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
    // 首先检查是否是我们创建的 polyfill（polyfill 会有特殊标记）
    if (window.browserControlManager?._isPolyfill === true) {
        return 'web';
    }
    
    // 方法1: 检查 Electron 特有的全局对象
    if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
        return 'electron';
    }
    
    // 方法2: 检查 Electron preload 注入的 API
    if (window.electronAPI || window.__ELECTRON__) {
        return 'electron';
    }
    
    // 方法3: 检查 browserControlManager 是否是真正的 Electron IPC 接口
    // 真正的 Electron IPC 接口会有特定的方法签名
    if (window.browserControlManager && typeof window.browserControlManager === 'object') {
        // 检查是否有多个关键的 IPC 方法（浏览器扩展不会有这些）
        const hasIpcMethods = [
            'getServerStatus',
            'minimizeWindow',
            'maximizeWindow',
            'closeWindow',
            'getAppVersion'
        ].every(method => typeof window.browserControlManager[method] === 'function');
        
        if (hasIpcMethods) {
            return 'electron';
        }
    }
    
    return 'web';
}

/**
 * IPC 方法名到 HTTP 端点的映射
 */
const API_MAPPING = {
    // 服务器状态和控制
    'getServerStatus': { method: 'GET', path: '/api/status' },
    'getDetailedStatus': { method: 'GET', path: '/api/status' },
    'startServer': { method: 'POST', path: '/api/server/start' },
    'stopServer': { method: 'POST', path: '/api/server/stop' },
    'restartServer': { method: 'POST', path: '/api/server/restart' },
    
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
    'setWorkspaceDir': { method: 'PUT', path: '/api/settings/workspace', bodyKey: 'path' },
    'resetWorkspaceDir': { method: 'DELETE', path: '/api/settings/workspace' },
    'selectWorkspaceDir': { method: 'PUT', path: '/api/settings/workspace' },
    'getWorkDirs': { method: 'GET', path: '/api/settings/workdirs' },
    'getClaudeSettings': { method: 'GET', path: '/api/settings/claude' },
    'getClaudeCodeSettings': { method: 'GET', path: '/api/settings/claude' },
    'saveClaudeSettings': { method: 'PUT', path: '/api/settings/claude' },
    'saveClaudeCodeSettings': { method: 'PUT', path: '/api/settings/claude' },
    'getClaudePresets': { method: 'GET', path: '/api/settings/claude/presets' },
    'getClaudeCodePresets': { method: 'GET', path: '/api/settings/claude/presets' },
    'setClaudeAuthToken': { method: 'PUT', path: '/api/settings/claude' },
    'deleteClaudeAuthToken': { method: 'PUT', path: '/api/settings/claude' },
    'getDependencyStatus': { method: 'GET', path: '/api/deps/status' },
    'checkAllDependencies': { method: 'GET', path: '/api/deps/check' },
    'clearLogs': { method: 'DELETE', path: '/api/logs' },
    'getServerLogs': { method: 'GET', path: '/api/logs' },
    
    // 浏览器控制
    'getTabs': { method: 'GET', path: '/api/browser/tabs' },
    'closeTab': { method: 'POST', path: '/api/browser/tab/close' },
    'openUrl': { method: 'POST', path: '/api/browser/tab/open' },
    'getExtensionStatus': { method: 'GET', path: '/api/browser/extension/status' },
    'getExtensionConnections': { method: 'GET', path: '/api/browser/extension/connections' }
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

        // 确保 baseUrl 已设置
        const baseUrl = this._baseUrl || 'http://localhost:3333';
        
        try {
            const response = await fetch(`${baseUrl}/api/ping`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                // 如果连接成功，设置 baseUrl
                if (!this._baseUrl) {
                    this._baseUrl = baseUrl;
                }
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
        
        // 处理非 JSON 响应（如 404 页面返回 HTML）
        let data;
        try {
            const text = await response.text();
            data = text ? JSON.parse(text) : null;
        } catch (parseError) {
            // JSON 解析失败，可能是 404 返回的 HTML
            if (response.status === 404) {
                console.warn(`[ApiAdapter] API not found: ${method} (${path})`);
                return null;
            }
            throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
        
        if (!response.ok) {
            // 404 错误返回 null 而不是抛出异常
            if (response.status === 404) {
                console.warn(`[ApiAdapter] API not found: ${method} (${path})`);
                return null;
            }
            throw new Error(data?.error || `HTTP ${response.status}`);
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

/**
 * Web 模式下的 browserControlManager 兼容层
 * 将 IPC 调用转换为 HTTP/WebSocket 调用
 */
function createBrowserControlManagerPolyfill() {
    const eventHandlers = new Map();
    
    // 创建事件监听方法
    function createEventListener(eventName) {
        return function(callback) {
            if (!eventHandlers.has(eventName)) {
                eventHandlers.set(eventName, new Set());
            }
            eventHandlers.get(eventName).add(callback);
            
            // 通过 WebSocket 监听事件
            if (window.apiAdapter) {
                window.apiAdapter.on(eventName, callback);
            }
            
            // 返回取消订阅函数
            return () => {
                eventHandlers.get(eventName)?.delete(callback);
                if (window.apiAdapter) {
                    window.apiAdapter.off(eventName, callback);
                }
            };
        };
    }
    
    // 未连接时的默认返回值
    const DEFAULT_VALUES = {
        // 返回空数组的方法
        'getServerLogs': [],
        'getTabs': { tabs: [] },
        'getMessages': [],
        'getAllSessions': [],
        // 返回 0 或空对象的方法
        'getExtensionConnections': { connections: 0 },
        'getExtensionStatus': { connected: false, count: 0 },
        'getAiStatus': { connected: false },
        'getServerStatus': { running: false },
        // 返回空设置的方法
        'getAllHappySettings': { workspaceDir: null, permissionMode: 'default' },
        'getWorkspaceSettings': { workspaceDir: null },
        'getClaudeCodeSettings': { provider: 'anthropic' },
        'getAccountInfo': null,
        'getDependencyStatus': { nodejs: { installed: false }, claudeCode: { installed: false } }
    };
    
    // 等待 apiAdapter 连接（最多等待 3 秒）
    async function waitForConnection(maxWait = 3000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            if (window.apiAdapter && window.apiAdapter.isConnected()) {
                return true;
            }
            // 尝试初始化连接
            if (window.apiAdapter && !window.apiAdapter.isConnected()) {
                try {
                    await window.apiAdapter.checkConnection();
                    if (window.apiAdapter.isConnected()) {
                        return true;
                    }
                } catch (e) {
                    // 忽略错误，继续等待
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return false;
    }
    
    // 创建 API 调用方法
    function createApiMethod(methodName) {
        return async function(...args) {
            // 如果未连接，先等待连接
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                const connected = await waitForConnection();
                if (!connected) {
                    // 如果有预定义的默认值，返回它；否则返回 null
                    if (methodName in DEFAULT_VALUES) {
                        console.log(`[Polyfill] ${methodName}: Not connected, returning default value`);
                        return DEFAULT_VALUES[methodName];
                    }
                    console.warn(`[Polyfill] ${methodName}: Not connected`);
                    return null;
                }
            }
            try {
                return await window.apiAdapter.call(methodName, ...args);
            } catch (error) {
                console.error(`[Polyfill] ${methodName} failed:`, error);
                throw error;
            }
        };
    }
    
    return {
        // 标记这是一个 polyfill，用于 detectEnvironment 区分
        _isPolyfill: true,
        
        // ========== 服务器状态 ==========
        getServerStatus: createApiMethod('getServerStatus'),
        getDetailedStatus: createApiMethod('getDetailedStatus'),
        startServer: createApiMethod('startServer'),
        stopServer: createApiMethod('stopServer'),
        restartServer: createApiMethod('restartServer'),
        
        // ========== AI 相关 ==========
        getAiStatus: createApiMethod('getAiStatus'),
        getAIStatus: createApiMethod('getAiStatus'),  // 别名
        connectAi: createApiMethod('connectAi'),
        connectAI: createApiMethod('connectAi'),  // 别名
        disconnectAi: createApiMethod('disconnectAi'),
        disconnectAI: createApiMethod('disconnectAi'),  // 别名
        sendAiMessage: createApiMethod('sendMessage'),
        sendAIMessage: createApiMethod('sendMessage'),  // 别名
        getAiMessages: createApiMethod('getMessages'),
        getAIMessages: createApiMethod('getMessages'),  // 别名
        getHappyMessages: createApiMethod('getMessages'),  // 别名
        clearAiMessages: createApiMethod('clearMessages'),
        clearAIMessages: createApiMethod('clearMessages'),  // 别名
        restoreAiMessages: createApiMethod('restoreMessages'),
        restoreAIMessages: createApiMethod('restoreMessages'),  // 别名
        restoreHappyMessages: createApiMethod('restoreMessages'),  // 别名
        getAiUsage: createApiMethod('getLatestUsage'),
        getLatestUsage: createApiMethod('getLatestUsage'),  // 直接名称
        allowAiPermission: createApiMethod('allowPermission'),
        allowPermission: createApiMethod('allowPermission'),  // 直接名称
        denyAiPermission: createApiMethod('denyPermission'),
        denyPermission: createApiMethod('denyPermission'),  // 直接名称
        abortAi: createApiMethod('abortSession'),
        abortSession: createApiMethod('abortSession'),  // 直接名称
        getAllSessions: createApiMethod('getAllSessions'),
        getSessionId: createApiMethod('getSessionId'),
        reconnectSession: createApiMethod('reconnectSession'),
        
        // ========== 账户相关 ==========
        getAccountInfo: createApiMethod('getAccountInfo'),
        hasSecret: createApiMethod('hasSecret'),
        hasHappySecret: createApiMethod('hasSecret'),  // 别名
        generateSecret: createApiMethod('generateSecret'),
        generateHappySecret: createApiMethod('generateSecret'),  // 别名
        validateSecret: async (secret) => {
            // 等待连接
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                await waitForConnection();
            }
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                return { valid: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/account/validateSecret`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret })
                });
                return await response.json();
            } catch (error) {
                return { valid: false, error: error.message };
            }
        },
        validateHappySecret: async (secret) => window.browserControlManager.validateSecret(secret),
        verifySecret: async (secret) => {
            // 等待连接
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                await waitForConnection();
            }
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                return { success: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/account/verifySecret`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret })
                });
                return await response.json();
            } catch (error) {
                return { success: false, error: error.message };
            }
        },
        verifyHappySecret: async (secret) => window.browserControlManager.verifySecret(secret),
        saveSecret: async (secret, token) => {
            // 等待连接
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                await waitForConnection();
            }
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                console.warn('[Polyfill] saveSecret: Not connected');
                return { success: false, error: 'Not connected' };
            }
            try {
                // 后端期望 { secret, token } 格式
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/account/secret`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret, token })
                });
                return await response.json();
            } catch (error) {
                console.error('[Polyfill] saveSecret failed:', error);
                return { success: false, error: error.message };
            }
        },
        saveHappySecret: async (secret, token) => {
            // 调用 saveSecret
            return window.browserControlManager.saveSecret(secret, token);
        },
        logout: createApiMethod('logout'),
        changeServer: createApiMethod('changeServer'),
        getFormattedSecret: createApiMethod('getFormattedSecret'),
        
        // ========== 文件系统 ==========
        getWorkspaceRoot: createApiMethod('getWorkspaceRoot'),
        listDirectory: createApiMethod('listDirectory'),
        createFolder: createApiMethod('createFolder'),
        deleteItem: createApiMethod('deleteItem'),
        renameItem: async (oldPath, newPath) => {
            // 自定义实现：需要正确构建 { oldPath, newPath } 请求体
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                const connected = await waitForConnection();
                if (!connected) return { success: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/files/rename`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPath, newPath })
                });
                return await response.json();
            } catch (error) {
                console.error('[Polyfill] renameItem failed:', error);
                return { success: false, error: error.message };
            }
        },
        readFileContent: createApiMethod('readFileContent'),
        saveFileContent: async (filePath, content) => {
            // 自定义实现：需要正确构建 { path, content } 请求体
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                const connected = await waitForConnection();
                if (!connected) return { success: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/files/content`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath, content: content })
                });
                return await response.json();
            } catch (error) {
                console.error('[Polyfill] saveFileContent failed:', error);
                return { success: false, error: error.message };
            }
        },
        getItemInfo: createApiMethod('getItemInfo'),
        copyItem: async (sourcePath, destPath) => {
            // 自定义实现：需要正确构建 { sourcePath, destPath } 请求体
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                const connected = await waitForConnection();
                if (!connected) return { success: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/files/copy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourcePath, destPath })
                });
                return await response.json();
            } catch (error) {
                console.error('[Polyfill] copyItem failed:', error);
                return { success: false, error: error.message };
            }
        },
        moveItem: async (sourcePath, destPath) => {
            // 自定义实现：需要正确构建 { sourcePath, destPath } 请求体
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                const connected = await waitForConnection();
                if (!connected) return { success: false, error: 'Not connected' };
            }
            try {
                const response = await fetch(`${window.apiAdapter._baseUrl}/api/files/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourcePath, destPath })
                });
                return await response.json();
            } catch (error) {
                console.error('[Polyfill] moveItem failed:', error);
                return { success: false, error: error.message };
            }
        },
        openFile: createApiMethod('openFile'),
        showInExplorer: createApiMethod('showInExplorer'),
        
        // ========== Daemon 管理 ==========
        getDaemonStatus: createApiMethod('getDaemonStatus'),
        isDaemonRunning: createApiMethod('isDaemonRunning'),
        startDaemon: createApiMethod('startDaemon'),
        stopDaemon: createApiMethod('stopDaemon'),
        restartDaemon: createApiMethod('restartDaemon'),
        
        // ========== 设置 ==========
        getSettings: createApiMethod('getSettings'),
        getSetting: createApiMethod('getSetting'),
        setSetting: createApiMethod('setSetting'),
        getAllHappySettings: createApiMethod('getAllHappySettings'),
        getHappySettings: createApiMethod('getAllHappySettings'),  // 别名
        saveHappySettings: createApiMethod('saveHappySettings'),
        setHappySettings: createApiMethod('saveHappySettings'),  // 别名
        getWorkspaceSettings: createApiMethod('getWorkspaceSettings'),
        setWorkspaceDir: createApiMethod('setWorkspaceDir'),
        resetWorkspaceDir: createApiMethod('resetWorkspaceDir'),
        selectWorkspaceDir: async () => {
            // Web 模式下无法使用原生文件选择对话框
            // 改为弹出输入框让用户输入路径
            // 注意：此方法只返回用户输入的路径，不执行设置操作（与 Electron 版行为一致）
            // 实际设置由调用方（如 app.js 中的 switchWorkDir）完成
            const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
            
            // 获取当前工作目录作为默认值
            let currentDir = '';
            try {
                if (window.apiAdapter?.isConnected()) {
                    const settings = await window.apiAdapter.call('getWorkspaceSettings');
                    currentDir = settings?.workspaceDir || settings?.currentWorkDir || settings?.defaultWorkspaceDir || '';
                }
            } catch (e) {
                console.warn('[Polyfill] Failed to get current workspace dir:', e);
            }
            
            // 使用 DialogManager.prompt 或原生 prompt
            const promptMessage = t('settings.enterWorkspacePath') || 'Enter workspace directory path:';
            const inputPath = window.DialogManager 
                ? await window.DialogManager.prompt(promptMessage, currentDir)
                : window.prompt(promptMessage, currentDir);
            
            if (!inputPath) {
                // 用户取消
                return { success: false, cancelled: true };
            }
            
            // 返回用户输入的路径（与 Electron 版行为一致）
            return { success: true, path: inputPath };
        },
        getWorkDirs: createApiMethod('getWorkDirs'),
        listWorkDirs: createApiMethod('getWorkDirs'),  // 别名
        switchWorkDir: createApiMethod('setWorkspaceDir'),  // 切换工作目录使用 setWorkspaceDir
        getCurrentWorkDir: createApiMethod('getWorkspaceSettings'),  // 获取当前工作目录
        getClaudeSettings: createApiMethod('getClaudeCodeSettings'),  // 别名
        getClaudeCodeSettings: createApiMethod('getClaudeCodeSettings'),
        saveClaudeSettings: createApiMethod('saveClaudeCodeSettings'),  // 别名
        saveClaudeCodeSettings: createApiMethod('saveClaudeCodeSettings'),
        getClaudePresets: createApiMethod('getClaudeCodePresets'),  // 别名
        getClaudeCodePresets: createApiMethod('getClaudeCodePresets'),
        setClaudeAuthToken: createApiMethod('setClaudeAuthToken'),
        hasClaudeAuthToken: async () => false,  // Web 模式下默认没有 Claude Auth Token
        deleteClaudeAuthToken: createApiMethod('deleteClaudeAuthToken'),
        getDependencyStatus: createApiMethod('getDependencyStatus'),
        checkAllDependencies: createApiMethod('checkAllDependencies'),
        
        // ========== 浏览器控制 ==========
        getTabs: createApiMethod('getTabs'),
        closeTab: createApiMethod('closeTab'),
        openUrl: createApiMethod('openUrl'),
        getExtensionStatus: createApiMethod('getExtensionStatus'),
        getExtensionConnections: createApiMethod('getExtensionConnections'),
        
        // ========== 设置向导 ==========
        getSetupRequirements: async () => ({ ready: true, critical: [], recommended: [], platform: 'web' }),
        recheckSetup: async () => ({ ready: true, critical: [], recommended: [], platform: 'web' }),
        completeSetup: async () => ({ success: true }),
        skipSetup: async () => ({ success: true }),
        shouldShowSetup: async () => ({ shouldShow: false, reason: 'web_mode' }),
        resetSetupWizard: async () => ({ success: true }),
        getSetupPlatform: async () => 'web',
        
        // ========== 应用控制 ==========
        getAppVersion: async () => ({ version: 'Web', platform: 'web' }),
        restartApp: () => window.location.reload(),
        quitApp: () => window.close(),
        getServerLogs: createApiMethod('getServerLogs'),
        clearServerLogs: createApiMethod('clearLogs'),
        openNodeJsWebsite: () => window.open('https://nodejs.org/', '_blank'),
        openClaudeCodeDocs: () => window.open('https://docs.anthropic.com/claude-code', '_blank'),
        
        // ========== 自动更新（Web 模式下不支持） ==========
        checkForUpdates: async () => ({ success: false, error: 'Not supported in web mode' }),
        downloadUpdate: async () => ({ success: false, error: 'Not supported in web mode' }),
        getUpdateStatus: async () => ({ status: 'not-available', currentVersion: 'Web' }),
        quitAndInstall: async () => false,
        
        // ========== 事件监听 ==========
        onServerStatusChanged: createEventListener('server:status'),
        onServerLog: createEventListener('server:log'),
        onServerError: createEventListener('server:error'),
        onViewLoaded: createEventListener('view:loaded'),
        onViewLoadFailed: createEventListener('view:loadFailed'),
        onHappyMessage: createEventListener('happy:message'),
        onHappyConnected: createEventListener('happy:connected'),
        onHappyDisconnected: createEventListener('happy:disconnected'),
        onHappyEventStatus: createEventListener('happy:eventStatus'),
        onHappyError: createEventListener('happy:error'),
        onUsageUpdate: createEventListener('happy:usageUpdate'),
        onHappyMessagesRestored: createEventListener('happy:messagesRestored'),
        onHappyServiceStatus: createEventListener('happy:serviceStatus'),
        onDaemonStatusChanged: createEventListener('daemon:statusChanged'),
        onHappyInitialized: createEventListener('happy:initialized'),
        onUpdateChecking: createEventListener('update:checking'),
        onUpdateAvailable: createEventListener('update:available'),
        onUpdateNotAvailable: createEventListener('update:notAvailable'),
        onUpdateDownloadProgress: createEventListener('update:downloadProgress'),
        onUpdateDownloaded: createEventListener('update:downloaded'),
        onUpdateError: createEventListener('update:error'),
        onUpdateStatusChanged: createEventListener('update:statusChanged'),
        onExtensionConnected: createEventListener('extension:connected'),
        onExtensionDisconnected: createEventListener('extension:disconnected'),
        onTabsUpdated: createEventListener('tabs:updated'),
        onTabsUpdate: createEventListener('tabs:updated'),  // 别名
        onTabOpened: createEventListener('tab:opened'),
        onTabClosed: createEventListener('tab:closed'),
        onAIStatusChanged: createEventListener('ai:statusChanged'),
        onAIMessage: createEventListener('ai:message'),
        onAIProgress: createEventListener('ai:progress'),
        onAIError: createEventListener('ai:error'),
        
        // 窗口控制（Web 模式下无效）
        minimizeWindow: () => console.log('[Polyfill] minimizeWindow: Not supported in web mode'),
        maximizeWindow: () => console.log('[Polyfill] maximizeWindow: Not supported in web mode'),
        closeWindow: () => window.close()
    };
}

// 在 Web 模式下创建 polyfill
// 注意：即使浏览器扩展已经创建了 browserControlManager，也需要用 polyfill 覆盖
// 因为扩展创建的对象不包含完整的方法集
if (detectEnvironment() === 'web') {
    console.log('[ApiAdapter] Creating browserControlManager polyfill for Web mode');
    // 保存扩展原有的对象引用（如果存在），以便扩展功能仍可使用
    if (window.browserControlManager) {
        window._extensionBrowserControlManager = window.browserControlManager;
        console.log('[ApiAdapter] Saved extension browserControlManager reference');
    }
    window.browserControlManager = createBrowserControlManagerPolyfill();
}

// 延迟再次检查，防止浏览器扩展在脚本加载后覆盖 polyfill
setTimeout(() => {
    if (detectEnvironment() === 'web') {
        // 检查 polyfill 是否被覆盖
        if (typeof window.browserControlManager?.getAppVersion !== 'function' ||
            typeof window.browserControlManager?.onServerStatusChanged !== 'function') {
            console.log('[ApiAdapter] Polyfill was overwritten, recreating...');
            if (window.browserControlManager && !window._extensionBrowserControlManager) {
                window._extensionBrowserControlManager = window.browserControlManager;
            }
            window.browserControlManager = createBrowserControlManagerPolyfill();
        }
    }
}, 0);
