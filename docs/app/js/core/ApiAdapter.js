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
    'getDependencyStatus': { method: 'GET', path: '/api/status' },
    'checkAllDependencies': { method: 'GET', path: '/api/status' },
    'clearLogs': { method: 'DELETE', path: '/api/logs' },
    
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
    
    // 创建 API 调用方法
    function createApiMethod(methodName) {
        return async function(...args) {
            if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
                console.warn(`[Polyfill] ${methodName}: Not connected`);
                return null;
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
        
        // ========== AI 相关 ==========
        getAiStatus: createApiMethod('getAiStatus'),
        connectAi: createApiMethod('connectAi'),
        disconnectAi: createApiMethod('disconnectAi'),
        sendAiMessage: createApiMethod('sendMessage'),
        getAiMessages: createApiMethod('getMessages'),
        clearAiMessages: createApiMethod('clearMessages'),
        restoreAiMessages: createApiMethod('restoreMessages'),
        getAiUsage: createApiMethod('getLatestUsage'),
        allowAiPermission: createApiMethod('allowPermission'),
        denyAiPermission: createApiMethod('denyPermission'),
        abortAi: createApiMethod('abortSession'),
        getAllSessions: createApiMethod('getAllSessions'),
        getSessionId: createApiMethod('getSessionId'),
        reconnectSession: createApiMethod('reconnectSession'),
        
        // ========== 账户相关 ==========
        getAccountInfo: createApiMethod('getAccountInfo'),
        hasSecret: createApiMethod('hasSecret'),
        generateSecret: createApiMethod('generateSecret'),
        validateSecret: createApiMethod('validateSecret'),
        verifySecret: createApiMethod('verifySecret'),
        saveSecret: createApiMethod('saveSecret'),
        logout: createApiMethod('logout'),
        changeServer: createApiMethod('changeServer'),
        getFormattedSecret: createApiMethod('getFormattedSecret'),
        
        // ========== 文件系统 ==========
        getWorkspaceRoot: createApiMethod('getWorkspaceRoot'),
        listDirectory: createApiMethod('listDirectory'),
        createFolder: createApiMethod('createFolder'),
        deleteItem: createApiMethod('deleteItem'),
        renameItem: createApiMethod('renameItem'),
        readFileContent: createApiMethod('readFileContent'),
        saveFileContent: createApiMethod('saveFileContent'),
        getItemInfo: createApiMethod('getItemInfo'),
        copyItem: createApiMethod('copyItem'),
        moveItem: createApiMethod('moveItem'),
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
        saveHappySettings: createApiMethod('saveHappySettings'),
        getWorkspaceSettings: createApiMethod('getWorkspaceSettings'),
        setWorkspaceDir: createApiMethod('setWorkspaceDir'),
        resetWorkspaceDir: createApiMethod('resetWorkspaceDir'),
        selectWorkspaceDir: createApiMethod('selectWorkspaceDir'),
        getWorkDirs: createApiMethod('getWorkDirs'),
        getClaudeCodeSettings: createApiMethod('getClaudeCodeSettings'),
        saveClaudeCodeSettings: createApiMethod('saveClaudeCodeSettings'),
        getClaudeCodePresets: createApiMethod('getClaudeCodePresets'),
        setClaudeAuthToken: createApiMethod('setClaudeAuthToken'),
        deleteClaudeAuthToken: createApiMethod('deleteClaudeAuthToken'),
        getDependencyStatus: createApiMethod('getDependencyStatus'),
        checkAllDependencies: createApiMethod('checkAllDependencies'),
        
        // ========== 浏览器控制 ==========
        getTabs: createApiMethod('getTabs'),
        closeTab: createApiMethod('closeTab'),
        openUrl: createApiMethod('openUrl'),
        getExtensionStatus: createApiMethod('getExtensionStatus'),
        
        // ========== 应用控制 ==========
        getAppVersion: async () => ({ version: 'Web', platform: 'web' }),
        restartApp: () => window.location.reload(),
        clearServerLogs: createApiMethod('clearLogs'),
        openNodeJsWebsite: () => window.open('https://nodejs.org/', '_blank'),
        openClaudeCodeDocs: () => window.open('https://docs.anthropic.com/claude-code', '_blank'),
        
        // ========== 事件监听 ==========
        onServerStatusChanged: createEventListener('server:status'),
        onServerLog: createEventListener('server:log'),
        onViewLoaded: createEventListener('view:loaded'),
        onViewLoadFailed: createEventListener('view:loadFailed'),
        onHappyMessage: createEventListener('happy:message'),
        onHappyConnected: createEventListener('happy:connected'),
        onHappyDisconnected: createEventListener('happy:disconnected'),
        onHappyEventStatus: createEventListener('happy:eventStatus'),
        onHappyError: createEventListener('happy:error'),
        onUsageUpdate: createEventListener('happy:usageUpdate'),
        onHappyMessagesRestored: createEventListener('happy:messagesRestored'),
        onDaemonStatusChanged: createEventListener('daemon:statusChanged'),
        onHappyInitialized: createEventListener('happy:initialized'),
        onUpdateChecking: createEventListener('update:checking'),
        onUpdateAvailable: createEventListener('update:available'),
        onUpdateNotAvailable: createEventListener('update:notAvailable'),
        onUpdateDownloadProgress: createEventListener('update:downloadProgress'),
        onUpdateDownloaded: createEventListener('update:downloaded'),
        onUpdateError: createEventListener('update:error'),
        onExtensionConnected: createEventListener('extension:connected'),
        onExtensionDisconnected: createEventListener('extension:disconnected'),
        onTabsUpdated: createEventListener('tabs:updated'),
        
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
