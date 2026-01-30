/**
 * Feishu Client - 飞书 SDK 客户端封装
 * 
 * 封装 @larksuiteoapi/node-sdk，提供：
 * - 客户端初始化和认证
 * - WebSocket 客户端创建
 * - 事件分发器创建
 * - API 调用封装
 */

let Lark;

// 尝试加载飞书 SDK
try {
    Lark = require('@larksuiteoapi/node-sdk');
} catch (error) {
    console.warn('[FeishuClient] @larksuiteoapi/node-sdk not installed, please run: npm install @larksuiteoapi/node-sdk');
    Lark = null;
}

/**
 * 飞书域名映射
 */
const DOMAIN_MAP = {
    feishu: Lark?.Domain?.Feishu,
    lark: Lark?.Domain?.Lark
};

/**
 * 飞书客户端类
 */
class FeishuClient {
    /**
     * @param {Object} config - 配置对象
     * @param {string} config.appId - 应用 ID
     * @param {string} config.appSecret - 应用密钥
     * @param {string} config.domain - 域名（feishu/lark）
     * @param {string} config.encryptKey - 加密密钥（可选）
     * @param {string} config.verificationToken - 验证令牌（可选）
     */
    constructor(config = {}) {
        this.config = {
            appId: '',
            appSecret: '',
            domain: 'feishu',
            encryptKey: '',
            verificationToken: '',
            ...config
        };
        
        this._client = null;
        this._wsClient = null;
        this._eventDispatcher = null;
        this._botInfo = null;
    }
    
    /**
     * 检查 SDK 是否可用
     */
    checkSDK() {
        if (!Lark) {
            throw new Error('@larksuiteoapi/node-sdk 未安装');
        }
    }
    
    /**
     * 检查凭证是否配置
     */
    checkCredentials() {
        if (!this.config.appId || !this.config.appSecret) {
            throw new Error('Feishu credentials not configured (appId, appSecret)');
        }
    }
    
    /**
     * 获取域名配置
     */
    getDomain() {
        return DOMAIN_MAP[this.config.domain] || DOMAIN_MAP.feishu;
    }
    
    /**
     * 获取或创建 API 客户端
     * @returns {Lark.Client} 飞书 API 客户端
     */
    getClient() {
        this.checkSDK();
        this.checkCredentials();
        
        if (!this._client) {
            this._client = new Lark.Client({
                appId: this.config.appId,
                appSecret: this.config.appSecret,
                appType: Lark.AppType.SelfBuild,
                domain: this.getDomain()
            });
        }
        
        return this._client;
    }
    
    /**
     * 创建 WebSocket 客户端
     * @returns {Lark.WSClient} WebSocket 客户端
     */
    createWSClient() {
        this.checkSDK();
        this.checkCredentials();
        
        return new Lark.WSClient({
            appId: this.config.appId,
            appSecret: this.config.appSecret,
            domain: this.getDomain(),
            loggerLevel: Lark.LoggerLevel.info
        });
    }
    
    /**
     * 创建事件分发器
     * @returns {Lark.EventDispatcher} 事件分发器
     */
    createEventDispatcher() {
        this.checkSDK();
        
        return new Lark.EventDispatcher({
            encryptKey: this.config.encryptKey || undefined,
            verificationToken: this.config.verificationToken || undefined
        });
    }
    
    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        const needRecreate = 
            newConfig.appId !== this.config.appId ||
            newConfig.appSecret !== this.config.appSecret ||
            newConfig.domain !== this.config.domain;
        
        this.config = { ...this.config, ...newConfig };
        
        if (needRecreate) {
            // 凭证变化，需要重新创建客户端
            this._client = null;
            this._wsClient = null;
            this._botInfo = null;
        }
    }
    
    /**
     * 探测机器人信息
     * @returns {Promise<Object>} 机器人信息
     */
    async probe() {
        try {
            const client = this.getClient();
            
            // 获取机器人信息
            const response = await client.im.bot.get();
            
            if (response.code !== 0) {
                return {
                    ok: false,
                    error: response.msg || `Error code: ${response.code}`
                };
            }
            
            this._botInfo = {
                appId: this.config.appId,
                botName: response.data?.bot?.app_name || '',
                botOpenId: response.data?.bot?.open_id || ''
            };
            
            return {
                ok: true,
                ...this._botInfo
            };
        } catch (error) {
            return {
                ok: false,
                error: error.message
            };
        }
    }
    
    /**
     * 获取缓存的机器人信息
     * @returns {Object|null} 机器人信息
     */
    getBotInfo() {
        return this._botInfo;
    }
    
    /**
     * 获取机器人 Open ID
     * @returns {string|undefined} 机器人 Open ID
     */
    async getBotOpenId() {
        if (this._botInfo?.botOpenId) {
            return this._botInfo.botOpenId;
        }
        
        const probeResult = await this.probe();
        return probeResult.ok ? probeResult.botOpenId : undefined;
    }
    
    // ============================================================
    // 消息 API
    // ============================================================
    
    /**
     * 发送文本消息
     * @param {Object} params - 参数
     * @param {string} params.receiveId - 接收者 ID
     * @param {string} params.receiveIdType - ID 类型（open_id/user_id/chat_id）
     * @param {string} params.text - 文本内容
     * @returns {Promise<Object>} 发送结果
     */
    async sendText({ receiveId, receiveIdType, text }) {
        const client = this.getClient();
        const content = JSON.stringify({ text });
        
        const response = await client.im.message.create({
            params: { receive_id_type: receiveIdType },
            data: {
                receive_id: receiveId,
                content,
                msg_type: 'text'
            }
        });
        
        if (response.code !== 0) {
            throw new Error(`Send failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return {
            messageId: response.data?.message_id,
            success: true
        };
    }
    
    /**
     * 回复消息
     * @param {Object} params - 参数
     * @param {string} params.messageId - 要回复的消息 ID
     * @param {string} params.text - 文本内容
     * @returns {Promise<Object>} 发送结果
     */
    async replyText({ messageId, text }) {
        const client = this.getClient();
        const content = JSON.stringify({ text });
        
        const response = await client.im.message.reply({
            path: { message_id: messageId },
            data: {
                content,
                msg_type: 'text'
            }
        });
        
        if (response.code !== 0) {
            throw new Error(`Reply failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return {
            messageId: response.data?.message_id,
            success: true
        };
    }
    
    /**
     * 发送卡片消息
     * @param {Object} params - 参数
     * @param {string} params.receiveId - 接收者 ID
     * @param {string} params.receiveIdType - ID 类型
     * @param {Object} params.card - 卡片内容
     * @returns {Promise<Object>} 发送结果
     */
    async sendCard({ receiveId, receiveIdType, card }) {
        const client = this.getClient();
        const content = JSON.stringify(card);
        
        const response = await client.im.message.create({
            params: { receive_id_type: receiveIdType },
            data: {
                receive_id: receiveId,
                content,
                msg_type: 'interactive'
            }
        });
        
        if (response.code !== 0) {
            throw new Error(`Send card failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return {
            messageId: response.data?.message_id,
            success: true
        };
    }
    
    /**
     * 更新卡片消息
     * @param {Object} params - 参数
     * @param {string} params.messageId - 消息 ID
     * @param {Object} params.card - 新卡片内容
     * @returns {Promise<Object>} 更新结果
     */
    async updateCard({ messageId, card }) {
        const client = this.getClient();
        const content = JSON.stringify(card);
        
        const response = await client.im.message.patch({
            path: { message_id: messageId },
            data: { content }
        });
        
        if (response.code !== 0) {
            throw new Error(`Update card failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return { success: true };
    }
    
    /**
     * 获取消息内容
     * @param {string} messageId - 消息 ID
     * @returns {Promise<Object|null>} 消息内容
     */
    async getMessage(messageId) {
        const client = this.getClient();
        
        try {
            const response = await client.im.message.get({
                path: { message_id: messageId }
            });
            
            if (response.code !== 0) {
                return null;
            }
            
            const item = response.data?.items?.[0];
            if (!item) return null;
            
            // 解析消息内容
            let content = item.body?.content || '';
            try {
                const parsed = JSON.parse(content);
                if (item.msg_type === 'text' && parsed.text) {
                    content = parsed.text;
                }
            } catch {
                // 保持原始内容
            }
            
            return {
                messageId: item.message_id,
                chatId: item.chat_id,
                senderId: item.sender?.id,
                content,
                contentType: item.msg_type,
                createTime: item.create_time ? parseInt(item.create_time, 10) : undefined
            };
        } catch (error) {
            console.error(`[FeishuClient] Failed to get message:`, error.message);
            return null;
        }
    }
    
    // ============================================================
    // 表情 API
    // ============================================================
    
    /**
     * 添加表情反应
     * @param {Object} params - 参数
     * @param {string} params.messageId - 消息 ID
     * @param {string} params.emojiType - 表情类型
     * @returns {Promise<Object>} 结果
     */
    async addReaction({ messageId, emojiType }) {
        const client = this.getClient();
        
        const response = await client.im.messageReaction.create({
            path: { message_id: messageId },
            data: {
                reaction_type: { emoji_type: emojiType }
            }
        });
        
        if (response.code !== 0) {
            throw new Error(`Add reaction failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return { success: true };
    }
    
    /**
     * 移除表情反应
     * @param {Object} params - 参数
     * @param {string} params.messageId - 消息 ID
     * @param {string} params.reactionId - 反应 ID
     * @returns {Promise<Object>} 结果
     */
    async removeReaction({ messageId, reactionId }) {
        const client = this.getClient();
        
        const response = await client.im.messageReaction.delete({
            path: { 
                message_id: messageId,
                reaction_id: reactionId
            }
        });
        
        if (response.code !== 0) {
            throw new Error(`Remove reaction failed: ${response.msg || `code ${response.code}`}`);
        }
        
        return { success: true };
    }
}

module.exports = FeishuClient;
