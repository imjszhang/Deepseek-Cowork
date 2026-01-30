/**
 * Feishu Sender - 消息发送器
 * 
 * 负责：
 * - 发送文本消息
 * - 发送卡片消息
 * - 回复消息
 * - 更新卡片
 * - 处理消息分块（长消息拆分）
 */

/**
 * ID 类型解析
 * @param {string} id - ID
 * @returns {string} ID 类型
 */
function resolveIdType(id) {
    if (!id) return 'open_id';
    
    // chat: 前缀表示群聊
    if (id.startsWith('chat:') || id.startsWith('oc_')) {
        return 'chat_id';
    }
    
    // user: 前缀表示用户
    if (id.startsWith('user:') || id.startsWith('ou_')) {
        return 'open_id';
    }
    
    // 默认按 open_id 处理
    return 'open_id';
}

/**
 * 规范化目标 ID
 * @param {string} target - 目标
 * @returns {string} 规范化后的 ID
 */
function normalizeTarget(target) {
    if (!target) return '';
    
    // 移除前缀
    return target
        .replace(/^chat:/, '')
        .replace(/^user:/, '')
        .trim();
}

/**
 * 消息发送器类
 */
class Sender {
    /**
     * @param {Object} client - FeishuClient 实例
     * @param {Object} config - 配置对象
     */
    constructor(client, config = {}) {
        this.client = client;
        this.config = {
            textChunkLimit: 4000,  // 单条消息最大字符数
            chunkMode: 'length',   // 分块模式：length 或 newline
            ...config
        };
    }
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
    
    /**
     * 发送文本消息
     * @param {string} to - 接收者 ID
     * @param {string} text - 文本内容
     * @returns {Promise<Object>} 发送结果
     */
    async sendText(to, text) {
        if (!this.client) {
            throw new Error('FeishuClient not initialized');
        }
        
        const receiveId = normalizeTarget(to);
        const receiveIdType = resolveIdType(to);
        
        // 检查是否需要分块
        const chunks = this._splitMessage(text);
        
        const results = [];
        for (const chunk of chunks) {
            const result = await this.client.sendText({
                receiveId,
                receiveIdType,
                text: chunk
            });
            results.push(result);
        }
        
        return {
            success: true,
            messageIds: results.map(r => r.messageId),
            chunks: chunks.length
        };
    }
    
    /**
     * 回复消息
     * @param {string} messageId - 要回复的消息 ID
     * @param {string} text - 文本内容
     * @returns {Promise<Object>} 发送结果
     */
    async replyText(messageId, text) {
        if (!this.client) {
            throw new Error('FeishuClient not initialized');
        }
        
        // 检查是否需要分块
        const chunks = this._splitMessage(text);
        
        const results = [];
        for (let i = 0; i < chunks.length; i++) {
            // 第一条消息使用回复，后续消息直接发送（需要 chatId）
            if (i === 0) {
                const result = await this.client.replyText({
                    messageId,
                    text: chunks[i]
                });
                results.push(result);
            } else {
                // 后续消息需要获取 chatId
                // 暂时跳过，因为需要先获取原消息的 chatId
                console.warn(`[Sender] Chunked message ${i + 1}/${chunks.length} skipped (not yet supported)`);
            }
        }
        
        return {
            success: true,
            messageIds: results.map(r => r.messageId),
            chunks: chunks.length
        };
    }
    
    /**
     * 发送卡片消息
     * @param {string} to - 接收者 ID
     * @param {Object} card - 卡片内容
     * @returns {Promise<Object>} 发送结果
     */
    async sendCard(to, card) {
        if (!this.client) {
            throw new Error('FeishuClient not initialized');
        }
        
        const receiveId = normalizeTarget(to);
        const receiveIdType = resolveIdType(to);
        
        return await this.client.sendCard({
            receiveId,
            receiveIdType,
            card
        });
    }
    
    /**
     * 更新卡片消息
     * @param {string} messageId - 消息 ID
     * @param {Object} card - 新卡片内容
     * @returns {Promise<Object>} 更新结果
     */
    async updateCard(messageId, card) {
        if (!this.client) {
            throw new Error('FeishuClient not initialized');
        }
        
        return await this.client.updateCard({
            messageId,
            card
        });
    }
    
    /**
     * 构建简单文本卡片
     * @param {Object} options - 选项
     * @param {string} options.title - 标题
     * @param {string} options.content - 内容
     * @param {string} options.color - 颜色（blue/green/orange/red/purple）
     * @returns {Object} 卡片内容
     */
    buildTextCard({ title, content, color = 'blue' }) {
        return {
            config: {
                wide_screen_mode: true
            },
            header: title ? {
                title: {
                    tag: 'plain_text',
                    content: title
                },
                template: color
            } : undefined,
            elements: [
                {
                    tag: 'markdown',
                    content: content
                }
            ]
        };
    }
    
    /**
     * 构建带按钮的卡片
     * @param {Object} options - 选项
     * @param {string} options.title - 标题
     * @param {string} options.content - 内容
     * @param {Array} options.buttons - 按钮列表 [{ text, value, type }]
     * @returns {Object} 卡片内容
     */
    buildButtonCard({ title, content, buttons = [] }) {
        const buttonElements = buttons.map(btn => ({
            tag: 'button',
            text: {
                tag: 'plain_text',
                content: btn.text
            },
            value: btn.value || btn.text,
            type: btn.type || 'default'
        }));
        
        return {
            config: {
                wide_screen_mode: true
            },
            header: title ? {
                title: {
                    tag: 'plain_text',
                    content: title
                }
            } : undefined,
            elements: [
                {
                    tag: 'markdown',
                    content: content
                },
                buttonElements.length > 0 ? {
                    tag: 'action',
                    actions: buttonElements
                } : null
            ].filter(Boolean)
        };
    }
    
    /**
     * 拆分长消息
     * @param {string} text - 原始文本
     * @returns {Array<string>} 拆分后的文本数组
     */
    _splitMessage(text) {
        if (!text) return [''];
        
        const limit = this.config.textChunkLimit;
        
        if (text.length <= limit) {
            return [text];
        }
        
        const chunks = [];
        
        if (this.config.chunkMode === 'newline') {
            // 按换行符拆分
            const lines = text.split('\n');
            let currentChunk = '';
            
            for (const line of lines) {
                if ((currentChunk + '\n' + line).length > limit) {
                    if (currentChunk) {
                        chunks.push(currentChunk);
                    }
                    // 单行超长，强制按长度拆分
                    if (line.length > limit) {
                        const lineChunks = this._splitByLength(line, limit);
                        chunks.push(...lineChunks.slice(0, -1));
                        currentChunk = lineChunks[lineChunks.length - 1];
                    } else {
                        currentChunk = line;
                    }
                } else {
                    currentChunk = currentChunk ? currentChunk + '\n' + line : line;
                }
            }
            
            if (currentChunk) {
                chunks.push(currentChunk);
            }
        } else {
            // 按长度拆分
            chunks.push(...this._splitByLength(text, limit));
        }
        
        return chunks.length > 0 ? chunks : [''];
    }
    
    /**
     * 按长度拆分文本
     * @param {string} text - 文本
     * @param {number} limit - 每段最大长度
     * @returns {Array<string>} 拆分后的数组
     */
    _splitByLength(text, limit) {
        const chunks = [];
        let start = 0;
        
        while (start < text.length) {
            let end = start + limit;
            
            // 尝试在空白处断开
            if (end < text.length) {
                const lastSpace = text.lastIndexOf(' ', end);
                if (lastSpace > start + limit / 2) {
                    end = lastSpace;
                }
            }
            
            chunks.push(text.slice(start, end));
            start = end;
            
            // 跳过断开处的空格
            while (text[start] === ' ') start++;
        }
        
        return chunks;
    }
}

module.exports = Sender;
