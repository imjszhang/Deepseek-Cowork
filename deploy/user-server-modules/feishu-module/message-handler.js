/**
 * Feishu Message Handler - 消息处理器
 * 
 * 负责：
 * - 解析飞书消息内容
 * - 权限检查（私聊/群聊策略）
 * - @提及检测
 * - 与 HappyService 集成
 * - 管理会话和响应
 */

const { EventEmitter } = require('events');

/**
 * 消息处理器类
 */
class MessageHandler extends EventEmitter {
    /**
     * @param {Object} options - 配置选项
     * @param {Object} options.config - 飞书配置
     * @param {Object} options.happyService - HappyService 实例
     * @param {Object} options.messageStore - MessageStore 实例
     * @param {Object} options.sender - Sender 实例
     * @param {Object} options.policy - Policy 实例
     * @param {Map} options.pendingResponses - 等待响应的映射
     * @param {Map} options.chatHistories - 会话历史映射
     */
    constructor(options = {}) {
        super();
        
        this.config = options.config || {};
        this.happyService = options.happyService;
        this.messageStore = options.messageStore;
        this.sender = options.sender;
        this.policy = options.policy;
        this.pendingResponses = options.pendingResponses || new Map();
        this.chatHistories = options.chatHistories || new Map();
        
        // 响应缓冲（用于流式响应聚合）
        this.responseBuffers = new Map();
        
        // 响应超时（毫秒）
        this.responseTimeout = 60000; // 60 秒
    }
    
    /**
     * 处理传入消息
     * @param {Object} event - 消息事件
     * @param {string} botOpenId - 机器人 Open ID
     */
    async handleIncomingMessage(event, botOpenId) {
        console.log(`[MessageHandler] Message received: ${event.chatType} - ${event.senderOpenId}`);
        
        // 解析消息内容
        const context = this._parseMessageContext(event, botOpenId);
        
        // 权限检查
        const policyResult = this._checkPolicy(context);
        if (!policyResult.allowed) {
            console.log(`[MessageHandler] Message rejected by policy: ${policyResult.reason}`);
            
            // 群聊中未@机器人的消息，记录到历史但不响应
            if (policyResult.reason === 'not_mentioned' && context.isGroup) {
                this._recordToHistory(context);
            }
            return;
        }
        
        // 发送到 AI
        await this._sendToAI(context);
    }
    
    /**
     * 解析消息上下文
     * @param {Object} event - 消息事件
     * @param {string} botOpenId - 机器人 Open ID
     * @returns {Object} 消息上下文
     */
    _parseMessageContext(event, botOpenId) {
        // 解析消息内容
        let textContent = '';
        try {
            const parsed = JSON.parse(event.content);
            if (event.messageType === 'text') {
                textContent = parsed.text || '';
            } else {
                textContent = event.content;
            }
        } catch {
            textContent = event.content;
        }
        
        // 检测是否@机器人
        const mentionedBot = this._checkBotMentioned(event.mentions, botOpenId);
        
        // 移除@机器人的文本
        const cleanContent = this._stripBotMention(textContent, event.mentions);
        
        // 构造会话 ID
        const isGroup = event.chatType === 'group';
        const sessionId = isGroup 
            ? `feishu:group:${event.chatId}`
            : `feishu:dm:${event.senderOpenId}`;
        
        return {
            // 原始事件
            event,
            
            // 消息内容
            rawContent: textContent,
            content: cleanContent,
            
            // 会话信息
            sessionId,
            chatId: event.chatId,
            messageId: event.messageId,
            isGroup,
            
            // 发送者信息
            senderId: event.senderId,
            senderOpenId: event.senderOpenId,
            
            // @提及
            mentionedBot,
            mentions: event.mentions,
            
            // 回复信息
            rootId: event.rootId,
            parentId: event.parentId,
            
            // 时间戳
            timestamp: Date.now()
        };
    }
    
    /**
     * 检测是否@机器人
     * @param {Array} mentions - @提及列表
     * @param {string} botOpenId - 机器人 Open ID
     * @returns {boolean} 是否@机器人
     */
    _checkBotMentioned(mentions, botOpenId) {
        if (!mentions || mentions.length === 0) return false;
        if (!botOpenId) return mentions.length > 0;
        
        return mentions.some(m => 
            m.id?.open_id === botOpenId || 
            m.id?.user_id === botOpenId
        );
    }
    
    /**
     * 移除@机器人的文本
     * @param {string} text - 原始文本
     * @param {Array} mentions - @提及列表
     * @returns {string} 清理后的文本
     */
    _stripBotMention(text, mentions) {
        if (!mentions || mentions.length === 0) return text;
        
        let result = text;
        for (const mention of mentions) {
            // 移除 @name 格式
            if (mention.name) {
                result = result.replace(new RegExp(`@${mention.name}\\s*`, 'g'), '').trim();
            }
            // 移除 mention key
            if (mention.key) {
                result = result.replace(new RegExp(mention.key, 'g'), '').trim();
            }
        }
        
        return result;
    }
    
    /**
     * 检查权限策略
     * @param {Object} context - 消息上下文
     * @returns {Object} 检查结果 { allowed, reason }
     */
    _checkPolicy(context) {
        if (!this.policy) {
            return { allowed: true };
        }
        
        if (context.isGroup) {
            // 群聊策略
            const groupResult = this.policy.checkGroup({
                chatId: context.chatId,
                senderId: context.senderOpenId
            });
            
            if (!groupResult.allowed) {
                return groupResult;
            }
            
            // 检查是否需要@提及
            if (this.config.requireMention && !context.mentionedBot) {
                return { allowed: false, reason: 'not_mentioned' };
            }
            
            return { allowed: true };
        } else {
            // 私聊策略
            return this.policy.checkDM({
                senderId: context.senderOpenId
            });
        }
    }
    
    /**
     * 记录消息到历史
     * @param {Object} context - 消息上下文
     */
    _recordToHistory(context) {
        const historyKey = context.chatId;
        
        if (!this.chatHistories.has(historyKey)) {
            this.chatHistories.set(historyKey, []);
        }
        
        const history = this.chatHistories.get(historyKey);
        history.push({
            sender: context.senderOpenId,
            body: context.content,
            timestamp: context.timestamp,
            messageId: context.messageId
        });
        
        // 限制历史记录数量
        const maxHistory = 50;
        if (history.length > maxHistory) {
            history.splice(0, history.length - maxHistory);
        }
        
        console.log(`[MessageHandler] Recorded to history: ${historyKey} (${history.length} messages)`);
    }
    
    /**
     * 发送消息到 AI
     * @param {Object} context - 消息上下文
     */
    async _sendToAI(context) {
        if (!this.happyService) {
            console.error('[MessageHandler] HappyService not initialized');
            return;
        }
        
        // 构建上下文历史（用于群聊）
        let messageBody = context.content;
        if (context.isGroup) {
            const historyKey = context.chatId;
            const history = this.chatHistories.get(historyKey) || [];
            
            if (history.length > 0) {
                // 构建历史上下文
                const historyText = history
                    .slice(-10) // 最近 10 条
                    .map(h => `[${h.sender}]: ${h.body}`)
                    .join('\n');
                
                messageBody = `[群聊上下文]\n${historyText}\n\n[当前消息]\n${context.content}`;
            }
        }
        
        // 注册响应回调
        const responseId = `${context.sessionId}:${context.messageId}`;
        this.pendingResponses.set(responseId, {
            context,
            timestamp: Date.now(),
            responseBuffer: ''
        });
        
        // 设置响应超时
        setTimeout(() => {
            if (this.pendingResponses.has(responseId)) {
                console.warn(`[MessageHandler] Response timeout: ${responseId}`);
                this.pendingResponses.delete(responseId);
            }
        }, this.responseTimeout);
        
        try {
            console.log(`[MessageHandler] Sending to AI: ${messageBody.substring(0, 100)}...`);
            
            // 调用 HappyService 发送消息
            // 注意：实际的响应通过 happy:message 事件返回
            if (typeof this.happyService.sendMessage === 'function') {
                await this.happyService.sendMessage(messageBody, {
                    sessionId: context.sessionId,
                    metadata: {
                        source: 'feishu',
                        chatId: context.chatId,
                        messageId: context.messageId,
                        responseId
                    }
                });
            } else {
                // 如果 sendMessage 不可用，尝试其他方法
                console.warn('[MessageHandler] HappyService.sendMessage not available');
            }
            
            // 保存消息到 MessageStore
            if (this.messageStore) {
                try {
                    this.messageStore.addMessage?.(context.sessionId, {
                        role: 'user',
                        content: context.content,
                        timestamp: context.timestamp,
                        metadata: {
                            source: 'feishu',
                            chatId: context.chatId,
                            messageId: context.messageId,
                            senderOpenId: context.senderOpenId
                        }
                    });
                } catch (e) {
                    console.warn('[MessageHandler] Failed to save message:', e.message);
                }
            }
            
        } catch (error) {
            console.error('[MessageHandler] Failed to send to AI:', error.message);
            this.pendingResponses.delete(responseId);
            
            // 发送错误消息到用户
            if (this.sender) {
                try {
                    await this.sender.replyText(context.messageId, 
                        `Sorry, an error occurred while processing the message: ${error.message}`);
                } catch (e) {
                    console.error('[MessageHandler] Failed to send error message:', e.message);
                }
            }
        }
    }
    
    /**
     * 处理 AI 响应
     * @param {Object} message - AI 响应消息
     */
    async handleAIResponse(message) {
        // 检查消息元数据中是否包含飞书相关信息
        const metadata = message.metadata || {};
        const responseId = metadata.responseId;
        
        // 如果有明确的 responseId，使用它
        if (responseId && this.pendingResponses.has(responseId)) {
            await this._processResponse(responseId, message);
            return;
        }
        
        // 否则，尝试根据 sessionId 匹配
        const sessionId = metadata.sessionId || message.sessionId;
        if (sessionId && sessionId.startsWith('feishu:')) {
            // 查找匹配的等待响应
            for (const [id, pending] of this.pendingResponses.entries()) {
                if (pending.context.sessionId === sessionId) {
                    await this._processResponse(id, message);
                    return;
                }
            }
        }
        
        // 没有匹配的等待响应，可能是主动推送
        console.log('[MessageHandler] Received AI response with no matching request');
    }
    
    /**
     * 处理响应
     * @param {string} responseId - 响应 ID
     * @param {Object} message - AI 消息
     */
    async _processResponse(responseId, message) {
        const pending = this.pendingResponses.get(responseId);
        if (!pending) return;
        
        const { context } = pending;
        const content = message.content || '';
        
        // 检查是否是流式响应的结束
        const isComplete = message.done || message.role === 'assistant';
        
        if (!isComplete) {
            // 流式响应，缓冲内容
            pending.responseBuffer += content;
            return;
        }
        
        // 响应完成，发送到飞书
        const finalContent = pending.responseBuffer + content;
        this.pendingResponses.delete(responseId);
        
        if (!finalContent.trim()) {
            console.warn('[MessageHandler] AI response is empty');
            return;
        }
        
        console.log(`[MessageHandler] Sending AI response to Feishu: ${finalContent.substring(0, 100)}...`);
        
        if (this.sender) {
            try {
                await this.sender.replyText(context.messageId, finalContent);
                
                // 保存 AI 响应到 MessageStore
                if (this.messageStore) {
                    this.messageStore.addMessage?.(context.sessionId, {
                        role: 'assistant',
                        content: finalContent,
                        timestamp: Date.now(),
                        metadata: {
                            source: 'feishu',
                            chatId: context.chatId,
                            replyToMessageId: context.messageId
                        }
                    });
                }
                
                // 清理群聊历史
                if (context.isGroup) {
                    this.chatHistories.delete(context.chatId);
                }
                
            } catch (error) {
                console.error('[MessageHandler] Failed to send response to Feishu:', error.message);
            }
        }
    }
}

module.exports = MessageHandler;
