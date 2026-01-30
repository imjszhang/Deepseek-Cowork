/**
 * Feishu Monitor - 飞书 WebSocket 连接管理
 * 
 * 负责：
 * - WebSocket 连接的建立和维护
 * - 事件监听和分发
 * - 自动重连机制
 * - 连接状态管理
 */

const { EventEmitter } = require('events');

/**
 * 飞书监听器类
 */
class FeishuMonitor extends EventEmitter {
    /**
     * @param {Object} options - 配置选项
     * @param {Object} options.config - 飞书配置
     * @param {Object} options.client - FeishuClient 实例
     * @param {Object} options.messageHandler - 消息处理器实例
     * @param {Function} options.onConnectionChange - 连接状态变化回调
     */
    constructor(options = {}) {
        super();
        
        this.config = options.config || {};
        this.client = options.client;
        this.messageHandler = options.messageHandler;
        this.onConnectionChange = options.onConnectionChange || (() => {});
        
        this._wsClient = null;
        this._eventDispatcher = null;
        this._isRunning = false;
        this._botOpenId = null;
        this._reconnectAttempts = 0;
        this._maxReconnectAttempts = 5;
        this._reconnectDelay = 5000; // 5 秒
    }
    
    /**
     * 启动监听
     */
    async start() {
        if (this._isRunning) {
            console.log('[FeishuMonitor] Already running');
            return;
        }
        
        if (!this.client) {
            throw new Error('FeishuClient not initialized');
        }
        
        // 获取机器人 Open ID
        this._botOpenId = await this.client.getBotOpenId();
        console.log(`[FeishuMonitor] Bot Open ID: ${this._botOpenId || 'unknown'}`);
        
        const connectionMode = this.config.connectionMode || 'websocket';
        
        if (connectionMode === 'websocket') {
            await this._startWebSocket();
        } else {
            console.warn('[FeishuMonitor] Webhook mode requires external HTTP server configuration');
        }
        
        this._isRunning = true;
    }
    
    /**
     * 停止监听
     */
    async stop() {
        if (!this._isRunning) {
            return;
        }
        
        this._isRunning = false;
        
        if (this._wsClient) {
            // WebSocket 客户端没有显式的 stop 方法
            // 设置为 null 让 GC 处理
            this._wsClient = null;
        }
        
        this.onConnectionChange({
            connected: false,
            lastDisconnectedAt: new Date().toISOString()
        });
        
        console.log('[FeishuMonitor] Stopped');
    }
    
    /**
     * 重新连接
     */
    async reconnect() {
        console.log('[FeishuMonitor] Reconnecting...');
        await this.stop();
        await this.start();
    }
    
    /**
     * 启动 WebSocket 连接
     */
    async _startWebSocket() {
        console.log('[FeishuMonitor] Establishing WebSocket connection...');
        
        try {
            // 创建 WebSocket 客户端
            this._wsClient = this.client.createWSClient();
            
            // 创建事件分发器
            this._eventDispatcher = this.client.createEventDispatcher();
            
            // 注册事件处理器
            this._registerEventHandlers();
            
            // 启动 WebSocket 客户端
            this._wsClient.start({
                eventDispatcher: this._eventDispatcher
            });
            
            this._reconnectAttempts = 0;
            
            this.onConnectionChange({
                connected: true,
                lastConnectedAt: new Date().toISOString(),
                lastError: null,
                botInfo: this.client.getBotInfo()
            });
            
            console.log('[FeishuMonitor] WebSocket connection established');
            
        } catch (error) {
            console.error('[FeishuMonitor] WebSocket connection failed:', error.message);
            
            this.onConnectionChange({
                connected: false,
                lastError: error.message
            });
            
            // 尝试重连
            await this._handleReconnect();
        }
    }
    
    /**
     * 注册事件处理器
     */
    _registerEventHandlers() {
        if (!this._eventDispatcher) return;
        
        // 消息接收事件
        this._eventDispatcher.register({
            'im.message.receive_v1': async (data) => {
                try {
                    await this._handleMessageEvent(data);
                } catch (error) {
                    console.error('[FeishuMonitor] Failed to process message event:', error.message);
                }
            },
            
            // 消息已读事件（忽略）
            'im.message.message_read_v1': async () => {
                // 忽略已读回执
            },
            
            // 机器人被添加到群聊
            'im.chat.member.bot.added_v1': async (data) => {
                console.log(`[FeishuMonitor] Bot added to chat: ${data?.chat_id || 'unknown'}`);
                this.emit('bot_added', data);
            },
            
            // 机器人被移出群聊
            'im.chat.member.bot.deleted_v1': async (data) => {
                console.log(`[FeishuMonitor] Bot removed from chat: ${data?.chat_id || 'unknown'}`);
                this.emit('bot_removed', data);
            }
        });
        
        console.log('[FeishuMonitor] Event handlers registered');
    }
    
    /**
     * 处理消息事件
     * @param {Object} data - 消息事件数据
     */
    async _handleMessageEvent(data) {
        if (!this.messageHandler) {
            console.warn('[FeishuMonitor] Message handler not initialized');
            return;
        }
        
        // 解析消息事件
        const event = this._parseMessageEvent(data);
        if (!event) {
            console.warn('[FeishuMonitor] Unable to parse message event');
            return;
        }
        
        // 交给消息处理器处理
        await this.messageHandler.handleIncomingMessage(event, this._botOpenId);
    }
    
    /**
     * 解析消息事件
     * @param {Object} data - 原始事件数据
     * @returns {Object|null} 解析后的事件对象
     */
    _parseMessageEvent(data) {
        try {
            // 飞书消息事件结构
            // data.sender.sender_id.open_id - 发送者 Open ID
            // data.message.chat_id - 会话 ID
            // data.message.chat_type - 会话类型（p2p/group）
            // data.message.message_id - 消息 ID
            // data.message.content - 消息内容（JSON 字符串）
            // data.message.mentions - @提及列表
            
            const sender = data?.sender || {};
            const message = data?.message || {};
            
            return {
                // 发送者信息
                senderId: sender.sender_id?.user_id || sender.sender_id?.open_id || '',
                senderOpenId: sender.sender_id?.open_id || '',
                senderType: sender.sender_type || '',
                
                // 消息信息
                messageId: message.message_id || '',
                chatId: message.chat_id || '',
                chatType: message.chat_type || 'p2p', // p2p 或 group
                messageType: message.message_type || 'text',
                content: message.content || '',
                
                // 回复信息
                rootId: message.root_id || undefined,
                parentId: message.parent_id || undefined,
                
                // @提及
                mentions: message.mentions || [],
                
                // 原始数据
                raw: data
            };
        } catch (error) {
            console.error('[FeishuMonitor] Failed to parse message event:', error.message);
            return null;
        }
    }
    
    /**
     * 处理重连
     */
    async _handleReconnect() {
        if (!this._isRunning) return;
        
        this._reconnectAttempts++;
        
        if (this._reconnectAttempts > this._maxReconnectAttempts) {
            console.error(`[FeishuMonitor] Reconnection failed, max attempts reached (${this._maxReconnectAttempts})`);
            this.onConnectionChange({
                connected: false,
                lastError: `Reconnection failed after ${this._reconnectAttempts} attempts`
            });
            return;
        }
        
        const delay = this._reconnectDelay * this._reconnectAttempts;
        console.log(`[FeishuMonitor] Attempting reconnection #${this._reconnectAttempts} in ${delay / 1000}s...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (this._isRunning) {
            await this._startWebSocket();
        }
    }
    
    /**
     * 获取连接状态
     * @returns {Object} 连接状态
     */
    getStatus() {
        return {
            isRunning: this._isRunning,
            connected: !!this._wsClient,
            botOpenId: this._botOpenId,
            reconnectAttempts: this._reconnectAttempts
        };
    }
}

module.exports = FeishuMonitor;
