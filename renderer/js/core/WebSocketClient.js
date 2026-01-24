/**
 * WebSocket 客户端
 * 
 * 用于 Web 模式下连接本地服务的 WebSocket，接收实时事件
 * 
 * 创建时间: 2026-01-20
 */

/**
 * WebSocket 客户端类
 */
class WebSocketClient {
    constructor(options = {}) {
        this._url = options.url || 'ws://localhost:3333';
        this._socket = null;
        this._connected = false;
        this._reconnecting = false;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this._reconnectDelay = options.reconnectDelay || 1000;
        this._maxReconnectDelay = options.maxReconnectDelay || 30000;
        this._eventListeners = new Map();
        this._pingInterval = null;
        this._lastPong = 0;
        
        // 绑定方法
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._onMessage = this._onMessage.bind(this);
    }

    /**
     * 连接到 WebSocket 服务器
     * @returns {Promise<boolean>} 是否连接成功
     */
    async connect() {
        return new Promise((resolve, reject) => {
            if (this._connected) {
                resolve(true);
                return;
            }

            try {
                console.log('[WebSocketClient] Connecting to', this._url);
                
                // 使用 Socket.IO 客户端连接（如果服务端使用 Socket.IO）
                if (window.io) {
                    this._socket = window.io(this._url.replace('ws://', 'http://').replace('wss://', 'https://'), {
                        transports: ['websocket', 'polling'],
                        reconnection: false // 我们自己处理重连
                    });
                    
                    this._socket.on('connect', () => {
                        this._onOpen();
                        resolve(true);
                    });
                    
                    this._socket.on('disconnect', this._onClose);
                    this._socket.on('connect_error', (error) => {
                        this._onError(error);
                        if (!this._connected) {
                            reject(error);
                        }
                    });
                    
                    // 监听所有 happy: 事件
                    this._setupSocketIOListeners();
                    
                } else {
                    // 使用原生 WebSocket
                    this._socket = new WebSocket(this._url);
                    
                    this._socket.onopen = () => {
                        this._onOpen();
                        resolve(true);
                    };
                    
                    this._socket.onclose = this._onClose;
                    this._socket.onerror = (error) => {
                        this._onError(error);
                        if (!this._connected) {
                            reject(new Error('WebSocket connection failed'));
                        }
                    };
                    this._socket.onmessage = this._onMessage;
                }
                
                // 设置连接超时
                setTimeout(() => {
                    if (!this._connected) {
                        this.disconnect();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 设置 Socket.IO 事件监听
     * @private
     */
    _setupSocketIOListeners() {
        if (!this._socket || !window.io) return;
        
        // 监听所有需要转发的事件（与后端 ws/events.js 保持一致）
        const events = [
            'happy:status',        // 初始状态（连接时发送）
            'happy:connected',
            'happy:disconnected',
            'happy:message',
            'happy:error',
            'happy:eventStatus',
            'happy:usage',
            'happy:messagesRestored',
            'happy:secretChanged',
            'happy:workDirSwitched',
            'happy:initialized',
            'daemon:statusChanged',
            'daemon:startProgress'
        ];
        
        events.forEach(event => {
            this._socket.on(event, (data) => {
                this._emit(event, data);
            });
        });
    }

    /**
     * 断开连接
     */
    disconnect() {
        this._reconnecting = false;
        this._reconnectAttempts = 0;
        
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }
        
        if (this._socket) {
            if (window.io && this._socket.disconnect) {
                this._socket.disconnect();
            } else if (this._socket.close) {
                this._socket.close();
            }
            this._socket = null;
        }
        
        this._connected = false;
    }

    /**
     * 重新连接
     */
    async reconnect() {
        if (this._reconnecting) return;
        
        this._reconnecting = true;
        this._reconnectAttempts++;
        
        if (this._reconnectAttempts > this._maxReconnectAttempts) {
            console.error('[WebSocketClient] Max reconnect attempts reached');
            this._reconnecting = false;
            this._emit('reconnect_failed');
            return;
        }
        
        // 计算延迟（指数退避）
        const delay = Math.min(
            this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1),
            this._maxReconnectDelay
        );
        
        console.log(`[WebSocketClient] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            await this.connect();
            this._reconnecting = false;
            this._reconnectAttempts = 0;
        } catch (error) {
            this._reconnecting = false;
            this.reconnect();
        }
    }

    /**
     * 连接打开回调
     * @private
     */
    _onOpen() {
        console.log('[WebSocketClient] Connected');
        this._connected = true;
        this._reconnectAttempts = 0;
        
        // 启动心跳
        this._startPing();
        
        this._emit('connect');
    }

    /**
     * 连接关闭回调
     * @private
     */
    _onClose(event) {
        console.log('[WebSocketClient] Disconnected');
        this._connected = false;
        
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }
        
        this._emit('disconnect', event);
        
        // 自动重连
        if (!this._reconnecting) {
            this.reconnect();
        }
    }

    /**
     * 错误回调
     * @private
     */
    _onError(error) {
        console.error('[WebSocketClient] Error:', error);
        this._emit('error', error);
    }

    /**
     * 消息回调（原生 WebSocket）
     * @private
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'pong') {
                this._lastPong = Date.now();
                return;
            }
            
            // 触发对应事件
            if (data.type) {
                this._emit(data.type, data.data);
            }
        } catch (error) {
            console.error('[WebSocketClient] Failed to parse message:', error);
        }
    }

    /**
     * 启动心跳
     * @private
     */
    _startPing() {
        if (this._pingInterval) {
            clearInterval(this._pingInterval);
        }
        
        this._lastPong = Date.now();
        
        this._pingInterval = setInterval(() => {
            if (!this._connected) return;
            
            // 检查上次 pong 时间
            if (Date.now() - this._lastPong > 60000) {
                console.warn('[WebSocketClient] Ping timeout, reconnecting...');
                this.disconnect();
                this.reconnect();
                return;
            }
            
            // 发送 ping
            this._send({ type: 'ping' });
        }, 30000);
    }

    /**
     * 发送消息
     * @private
     */
    _send(data) {
        if (!this._connected || !this._socket) return;
        
        if (window.io && this._socket.emit) {
            this._socket.emit(data.type, data.data);
        } else if (this._socket.send) {
            this._socket.send(JSON.stringify(data));
        }
    }

    /**
     * 触发事件
     * @private
     */
    _emit(event, data) {
        if (this._eventListeners.has(event)) {
            for (const callback of this._eventListeners.get(event)) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[WebSocketClient] Event handler error for "${event}":`, error);
                }
            }
        }
        
        // 同时通知 ApiAdapter
        if (window.apiAdapter) {
            window.apiAdapter.emit(event, data);
        }
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
    }

    /**
     * 移除事件监听器
     * @param {string} event 事件名
     * @param {Function} callback 回调函数
     */
    off(event, callback) {
        if (this._eventListeners.has(event)) {
            if (callback) {
                this._eventListeners.get(event).delete(callback);
            } else {
                this._eventListeners.delete(event);
            }
        }
    }

    /**
     * 检查是否已连接
     * @returns {boolean} 是否连接
     */
    isConnected() {
        return this._connected;
    }

    /**
     * 获取连接状态
     * @returns {string} 状态
     */
    getStatus() {
        if (this._connected) return 'connected';
        if (this._reconnecting) return 'reconnecting';
        return 'disconnected';
    }
}

// 导出
window.WebSocketClient = WebSocketClient;
