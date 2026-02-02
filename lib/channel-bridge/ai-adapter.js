/**
 * AI Adapter - HappyService 适配器
 * 
 * 桥接 HappyService 与 Channel Bridge：
 * - 监听 HappyService 事件
 * - 将 AI 响应分发到正确的通道
 * - 管理请求-响应的关联
 */

const { EventEmitter } = require('events');

/**
 * @typedef {import('./types').ChannelContext} ChannelContext
 * @typedef {import('./types').QueuedRequest} QueuedRequest
 * @typedef {import('./types').AIMessage} AIMessage
 */

class AIAdapter extends EventEmitter {
    constructor() {
        super();
        
        /** @type {Object|null} */
        this._happyService = null;
        
        /** @type {Object|null} */
        this._requestQueue = null;
        
        /** @type {Object|null} */
        this._outbound = null;
        
        /** @type {boolean} */
        this._initialized = false;
        
        /** @type {boolean} */
        this._aiConnected = false;
        
        /** @type {string} */
        this._responseBuffer = '';
        
        /** @type {boolean} */
        this._isStreaming = false;
        
        /** @type {NodeJS.Timeout|null} 响应完成检测定时器 */
        this._responseCompleteTimer = null;
        
        /** @type {number} 等待更多响应的时间（毫秒） */
        this._responseCompleteDelay = 3000;
        
        console.log('[AIAdapter] Created');
    }
    
    /**
     * 初始化适配器
     * @param {Object} options - 配置选项
     * @param {Object} options.happyService - HappyService 实例
     * @param {Object} options.requestQueue - RequestQueue 实例
     * @param {Object} options.outbound - Outbound 模块
     */
    init(options) {
        if (this._initialized) {
            console.warn('[AIAdapter] Already initialized');
            return;
        }
        
        const { happyService, requestQueue, outbound } = options;
        
        if (!happyService) {
            console.error('[AIAdapter] HappyService is required');
            return;
        }
        
        this._happyService = happyService;
        this._requestQueue = requestQueue;
        this._outbound = outbound;
        
        // 设置队列处理回调
        if (this._requestQueue) {
            this._requestQueue.setProcessCallback(this._handleProcessRequest.bind(this));
        }
        
        // 设置 HappyService 事件监听
        this._setupHappyServiceListeners();
        
        this._initialized = true;
        console.log('[AIAdapter] Initialized');
    }
    
    /**
     * 设置 HappyService 事件监听
     * @private
     */
    _setupHappyServiceListeners() {
        if (!this._happyService) return;
        
        // 监听 AI 消息事件
        this._happyService.on('happy:message', (message) => {
            this._handleAIMessage(message);
        });
        
        // 监听连接状态
        this._happyService.on('happy:connected', (data) => {
            this._aiConnected = true;
            console.log('[AIAdapter] AI connected');
            this.emit('ai:connected', data);
        });
        
        this._happyService.on('happy:disconnected', (data) => {
            this._aiConnected = false;
            console.log('[AIAdapter] AI disconnected');
            this.emit('ai:disconnected', data);
            
            // 如果有正在处理的请求，标记失败
            if (this._requestQueue) {
                const currentRequest = this._requestQueue.getCurrentRequest();
                if (currentRequest) {
                    this._requestQueue.failCurrentRequest('AI service disconnected');
                }
            }
        });
        
        // 监听错误事件
        this._happyService.on('happy:error', (error) => {
            console.error('[AIAdapter] AI error:', error.message || error);
            this.emit('ai:error', error);
            
            // 如果有正在处理的请求，标记失败
            if (this._requestQueue) {
                const currentRequest = this._requestQueue.getCurrentRequest();
                if (currentRequest) {
                    this._requestQueue.failCurrentRequest(error.message || 'AI error');
                }
            }
        });
        
        // 监听事件状态变更
        this._happyService.on('happy:eventStatus', (event) => {
            // ready 状态表示 AI 响应结束
            if (event.eventType === 'ready' || event.eventType === 'idle') {
                this._handleResponseComplete();
            }
        });
        
        console.log('[AIAdapter] HappyService event listeners setup');
    }
    
    /**
     * 处理队列请求（被 RequestQueue 调用）
     * @param {QueuedRequest} request - 队列请求
     * @private
     */
    async _handleProcessRequest(request) {
        console.log(`[AIAdapter] Processing request: ${request.id}`);
        
        // 重置响应缓冲
        this._responseBuffer = '';
        this._isStreaming = false;
        
        // 发送到 AI
        await this.sendToAI(request.context);
    }
    
    /**
     * 处理 AI 消息
     * @param {AIMessage} message - AI 消息
     * @private
     */
    _handleAIMessage(message) {
        // 只处理 AI 响应（assistant 或 agent 角色）
        if (message.role !== 'assistant' && message.role !== 'agent') {
            return;
        }
        
        if (!this._requestQueue) return;
        
        const currentRequest = this._requestQueue.getCurrentRequest();
        if (!currentRequest) {
            console.log('[AIAdapter] Received AI message but no active request');
            return;
        }
        
        // 提取消息内容
        const content = this._extractContent(message);
        if (!content) {
            return;
        }
        
        console.log(`[AIAdapter] Received AI response for request ${currentRequest.id}: ${content.substring(0, 100)}...`);
        
        // 累积响应内容（支持流式响应）
        this._responseBuffer += content;
        this._isStreaming = true;
        
        // 发送部分响应事件
        this.emit('ai:partial', {
            requestId: currentRequest.id,
            content: content
        });
        
        // 启动/重置响应完成检测定时器
        // 如果一段时间没有新的响应，认为响应已完成
        this._resetResponseCompleteTimer();
    }
    
    /**
     * 重置响应完成检测定时器
     * @private
     */
    _resetResponseCompleteTimer() {
        // 清除旧定时器
        if (this._responseCompleteTimer) {
            clearTimeout(this._responseCompleteTimer);
        }
        
        // 启动新定时器
        this._responseCompleteTimer = setTimeout(() => {
            console.log('[AIAdapter] Response complete timer triggered');
            this._handleResponseComplete();
        }, this._responseCompleteDelay);
    }
    
    /**
     * 清除响应完成检测定时器
     * @private
     */
    _clearResponseCompleteTimer() {
        if (this._responseCompleteTimer) {
            clearTimeout(this._responseCompleteTimer);
            this._responseCompleteTimer = null;
        }
    }
    
    /**
     * 处理响应完成
     * @private
     */
    _handleResponseComplete() {
        // 清除定时器
        this._clearResponseCompleteTimer();
        
        if (!this._isStreaming || !this._responseBuffer) {
            return;
        }
        
        if (!this._requestQueue) return;
        
        const currentRequest = this._requestQueue.getCurrentRequest();
        if (!currentRequest) {
            return;
        }
        
        const finalResponse = this._responseBuffer.trim();
        
        if (!finalResponse) {
            console.warn('[AIAdapter] Empty response, marking as failed');
            this._requestQueue.failCurrentRequest('Empty AI response');
            this._responseBuffer = '';
            this._isStreaming = false;
            return;
        }
        
        console.log(`[AIAdapter] Response complete for request ${currentRequest.id}, length: ${finalResponse.length}`);
        
        // 通过 outbound 投递响应
        if (this._outbound) {
            this._outbound.deliver(currentRequest.context, currentRequest.adapter, finalResponse)
                .then(() => {
                    console.log(`[AIAdapter] Response delivered for request ${currentRequest.id}`);
                })
                .catch((error) => {
                    console.error(`[AIAdapter] Failed to deliver response: ${error.message}`);
                });
        }
        
        // 标记请求完成
        this._requestQueue.completeCurrentRequest(finalResponse);
        
        // 重置状态
        this._responseBuffer = '';
        this._isStreaming = false;
    }
    
    /**
     * 从消息中提取内容
     * @param {AIMessage} message - AI 消息，格式为 {role, messageId, content, meta}
     * @returns {string} 消息内容
     * @private
     */
    _extractContent(message) {
        const content = message.content;
        
        // 直接字符串内容
        if (typeof content === 'string') {
            return content;
        }
        
        // 处理 HappyService 的 output 格式
        // message.content 格式: {"type":"output","data":{"type":"assistant","message":{"content":[{"type":"text","text":"xxx"}]}}}
        if (content && content.type === 'output' && content.data) {
            const data = content.data;
            
            // 只提取 assistant 类型的文本响应
            if (data.type === 'assistant' && data.message?.content) {
                const contentArray = data.message.content;
                if (Array.isArray(contentArray)) {
                    // 提取所有 text 类型的内容
                    const textParts = contentArray
                        .filter(item => item.type === 'text' && item.text)
                        .map(item => item.text);
                    
                    if (textParts.length > 0) {
                        return textParts.join('\n');
                    }
                }
            }
            
            // 跳过 tool_use、tool_result、summary、user 等类型
            return '';
        }
        
        // 处理复杂内容结构
        if (content && typeof content === 'object') {
            // 尝试从 text 字段提取
            if (content.text) {
                return content.text;
            }
            
            // 处理数组格式 content: [{"type":"text","text":"xxx"}]
            if (Array.isArray(content)) {
                const textParts = content
                    .filter(item => item.type === 'text' && item.text)
                    .map(item => item.text);
                
                if (textParts.length > 0) {
                    return textParts.join('\n');
                }
            }
        }
        
        return '';
    }
    
    /**
     * 发送消息到 AI
     * @param {ChannelContext} context - 消息上下文
     * @returns {Promise<Object>} 发送结果
     */
    async sendToAI(context) {
        if (!this._happyService) {
            throw new Error('HappyService not initialized');
        }
        
        if (!this._aiConnected) {
            // 尝试检查连接状态
            const status = this._happyService.getStatus?.();
            if (status && !status.connected) {
                throw new Error('AI service not connected');
            }
        }
        
        // 共享会话模式：直接发送消息内容
        // 不传递额外参数，因为 HappyService.sendMessage 只接受 text 参数
        const result = await this._happyService.sendMessage(context.content);
        
        return result;
    }
    
    /**
     * 检查 AI 是否已连接
     * @returns {boolean} 是否已连接
     */
    isConnected() {
        return this._aiConnected;
    }
    
    /**
     * 获取适配器状态
     * @returns {Object} 状态对象
     */
    getStatus() {
        return {
            initialized: this._initialized,
            aiConnected: this._aiConnected,
            isStreaming: this._isStreaming,
            responseBufferLength: this._responseBuffer.length
        };
    }
    
    /**
     * 销毁适配器
     */
    destroy() {
        // 清除定时器
        this._clearResponseCompleteTimer();
        
        if (this._happyService) {
            // 移除事件监听器
            this._happyService.removeAllListeners?.('happy:message');
            this._happyService.removeAllListeners?.('happy:connected');
            this._happyService.removeAllListeners?.('happy:disconnected');
            this._happyService.removeAllListeners?.('happy:error');
            this._happyService.removeAllListeners?.('happy:eventStatus');
        }
        
        this._happyService = null;
        this._requestQueue = null;
        this._outbound = null;
        this._initialized = false;
        this._aiConnected = false;
        this._responseBuffer = '';
        this._isStreaming = false;
        
        console.log('[AIAdapter] Destroyed');
    }
}

// 单例
const aiAdapter = new AIAdapter();

module.exports = aiAdapter;
module.exports.AIAdapter = AIAdapter;
