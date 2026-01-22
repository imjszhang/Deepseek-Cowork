/**
 * 对话管理器 - 处理多轮 WebSocket 交互
 */
const EventEmitter = require('events');
const crypto = require('crypto');
const CryptoUtils = require('../utils/CryptoUtils');
const MessageExtractor = require('./MessageExtractor');

class ConversationManager extends EventEmitter {
  constructor(socket, encryption, sessionId, options = {}) {
    super();
    this.socket = socket;
    this.encryption = encryption;
    this.sessionId = sessionId;
    
    // 配置选项
    this.options = {
      strategy: options.strategy || 'auto',
      timeout: options.timeout || 60000,
      permissionMode: options.permissionMode || 'default', // 默认权限模式
      onTimeout: options.onTimeout || null,  // 超时回调（用于软中止等操作）
      ...options
    };
    
    // 活跃的对话上下文
    this.activeConversations = new Map(); // conversationId -> ConversationContext
    
    // 消息队列（用于调试和重放）
    this.messageHistory = [];
    
    // 设置 WebSocket 监听
    this._setupWebSocketListeners();
  }
  
  /**
   * 设置 WebSocket 消息监听
   */
  _setupWebSocketListeners() {
    console.log('[ConversationManager] Setting up WebSocket listeners');
    this.socket.on('update', (data) => {
      console.log('[ConversationManager] Received update event');
      this._handleWebSocketUpdate(data);
    });
  }
  
  /**
   * 处理 WebSocket 更新
   */
  _handleWebSocketUpdate(data) {
    try {
      const body = data.body;
      
      // 调试：打印收到的消息类型（临时强制启用）
      // 安全地处理 session ID，避免 undefined 导致的日志问题
      const sessionDisplay = body?.sid ? `${body.sid.substring(0, 8)}...` : (body?.sid === undefined ? 'undefined' : 'null');
      console.log(`[ConversationManager] Update: type=${body?.t}, session=${sessionDisplay}`);
      
      // 调试日志（仅在启用 debug 选项时输出）
      if (this.options.debug) {
        console.log(`[WS] Update: type=${body?.t}, session=${sessionDisplay}`);
      }
      
      // 对于 update-session 类型的事件，只记录日志，不处理
      if (!body || body.t === 'update-session') {
        return;
      }
      
      // 只处理 new-message 类型的事件
      if (body.t !== 'new-message') {
        return;
      }
      
      const sessionId = body.sid || body.id;
      if (sessionId !== this.sessionId) {
        if (this.options.debug) {
          console.log(`[WS] Message not for current session: ${sessionId?.substring(0, 8)} vs ${this.sessionId?.substring(0, 8)}`);
        }
        return; // 不是当前 session
      }
      
      const message = body.message;
      if (!message || message.content?.t !== 'encrypted') {
        if (this.options.debug) {
          console.log(`[WS] Invalid message format: content.t = ${message?.content?.t}`);
        }
        return;
      }
      
      // 解密消息
      const enc = this.encryption.getSessionEncryption(sessionId);
      if (!enc) {
        if (this.options.debug) {
          console.log(`[WS] Session encryption not found`);
        }
        return;
      }
      
      const encryptedData = CryptoUtils.decodeBase64(message.content.c, 'base64');
      const decrypted = this.encryption.decrypt(enc, encryptedData);
      
      if (!decrypted) {
        if (this.options.debug) {
          console.log(`[WS] Decryption failed`);
        }
        return;
      }
      
      // 检查是否是 event 类型消息
      const content = decrypted.content;
      if (content?.type === 'event') {
        const eventType = content.data?.type || 'unknown';
        
        // 判断事件是否来自外部（不是当前活跃对话）
        const isExternal = !this._isFromActiveConversation(message);
        
        // 发出 eventStatus 事件，让上层知道当前状态
        // 添加 isExternal 标记，方便外部判断是否需要同步显示
        this._emitEventStatus(eventType, { ...content.data, isExternal });
        
        // 如果是 "ready" 事件，表示 Agent 完成处理
        if (eventType === 'ready') {
          if (this.options.debug) {
            console.log(`[WS] Agent Ready event received, isExternal=${isExternal}`);
          }
          // 始终发出 ready 状态事件，让上层知道 Agent 已就绪
          if (!isExternal) {
            this._handleAgentReady();
          } else {
            // 外部 ready 事件也应该发出状态更新，确保状态能恢复
            this._emitEventStatus('ready', { isExternal: true, reason: 'external_ready' });
          }
        }
        return;
      }
      
      // 跳过其他元数据消息（非 event 类型）
      if (MessageExtractor.isEventMessage(decrypted)) {
        if (this.options.debug) {
          console.log(`[WS] Skipping metadata message: ${decrypted.content?.type}`);
        }
        return;
      }
      
      // 提取消息文本
      const text = MessageExtractor.extractMessageText(decrypted);
      const role = decrypted.role;
      
      if (this.options.debug) {
        console.log(`[WS] Message received: role=${role}, text=${text?.substring(0, 50)}...`);
      }
      
      // ====== 同步消息事件（用于转发所有消息，包括来自其他客户端的） ======
      // 无论消息是否属于活跃对话，都发出 syncMessage 事件
      // 这样外部代码可以监听并同步显示来自其他客户端的消息
      const syncMessageData = {
        sessionId,
        role,
        text,
        content: decrypted.content,
        meta: decrypted.meta,
        messageId: message.id,
        createdAt: message.createdAt || new Date().toISOString(),
        // 判断消息是否来自当前客户端发起的活跃对话
        isExternal: !this._isFromActiveConversation(message)
      };
      this.emit('syncMessage', syncMessageData);
      // ====== 同步消息事件结束 ======
      
      // 只处理 agent 的消息
      if (role === 'agent') {
        // 发出 processing 状态，表示正在处理
        this._emitEventStatus('processing', { text: text?.substring(0, 50) });
        this._processAgentMessage(text, decrypted, message);
      }
    } catch (error) {
      console.error('Failed to process WebSocket message:', error);
    }
  }
  
  /**
   * 判断消息是否来自当前活跃对话
   * @param {Object} message - 原始消息对象
   * @returns {boolean} 是否来自活跃对话
   */
  _isFromActiveConversation(message) {
    // 如果没有活跃对话，则消息一定是外部的
    if (this.activeConversations.size === 0) {
      return false;
    }
    
    // 检查消息时间是否在任何活跃对话的时间窗口内
    const messageTime = message.createdAt ? new Date(message.createdAt).getTime() : Date.now();
    
    // 网络延迟缓冲时间（2 秒）
    const networkBuffer = 2000;
    
    for (const conv of this.activeConversations.values()) {
      // 排除已完成或超时的对话
      if (conv.status === 'completed' || conv.status === 'timeout') {
        continue;
      }
      
      // 检查消息是否在对话开始之后（含缓冲）、超时之前
      // 添加缓冲时间处理网络延迟，允许消息比对话创建时间稍早
      const startTimeWithBuffer = conv.createdAt - networkBuffer;
      const endTime = conv.createdAt + conv.timeout;
      
      if (messageTime >= startTimeWithBuffer && messageTime < endTime) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 处理 Agent 消息
   */
  _processAgentMessage(text, decrypted, rawMessage) {
    // 记录消息
    this.messageHistory.push({
      timestamp: new Date(),
      text,
      role: 'agent',
      raw: decrypted
    });
    
    // 查找匹配的对话上下文
    const conversations = Array.from(this.activeConversations.values())
      .filter(conv => conv.status === 'waiting' || conv.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);
    
    for (const conv of conversations) {
      // 检查消息是否属于这个对话
      if (this._isMessageForConversation(text, conv)) {
        this._handleConversationMessage(conv, text, decrypted);
        break;
      }
    }
  }
  
  /**
   * 判断消息是否属于某个对话
   */
  _isMessageForConversation(text, conversation) {
    // 策略1：检查时间窗口（消息在对话开始后的一定时间内）
    const timeSinceStart = Date.now() - conversation.createdAt;
    if (timeSinceStart > conversation.timeout) {
      return false; // 超时
    }
    
    // 策略2：检查消息内容是否相关（可以改进）
    // 这里简化处理：最近的活跃对话都接收消息
    return true;
  }
  
  /**
   * 处理对话消息
   */
  _handleConversationMessage(conversation, text, decrypted) {
    // 更新对话状态
    conversation.status = 'active';
    
    // 保存消息到对话上下文
    conversation.messages.push({
      timestamp: new Date(),
      text,
      role: 'agent',
      raw: decrypted
    });
    
    // 更新最后活动时间
    conversation.lastActivityAt = Date.now();
    
    // 清除之前的静默检查定时器
    if (conversation.silenceCheckerId) {
      clearTimeout(conversation.silenceCheckerId);
    }
    
    // 检查是否完成
    const isComplete = this._checkConversationComplete(text, conversation);
    
    if (isComplete) {
      // 发出消息流结束事件
      this._emitStreamEnded(conversation);
      this._completeConversation(conversation);
    } else {
      // 对话未完成，继续等待下一条消息
      // 调用进度回调（如果有）
      if (conversation.onProgress) {
        conversation.onProgress({
          text,
          messageCount: conversation.messages.length,
          elapsed: Date.now() - conversation.createdAt
        });
      }
      
      // 触发进度事件（如果有监听器）
      this.emit('message', {
        conversationId: conversation.id,
        text,
        messageCount: conversation.messages.length
      });
      
      // 注意：不再使用静默检查定时器
      // 对话完成信号完全依赖 Agent Ready 事件（event.type === 'ready'）
    }
  }
  
  /**
   * 完成对话
   */
  _completeConversation(conversation) {
    // 清除所有定时器
    if (conversation.timeoutId) {
      clearTimeout(conversation.timeoutId);
    }
    if (conversation.silenceCheckerId) {
      clearTimeout(conversation.silenceCheckerId);
    }
    
    // 发出 ready 状态，表示对话完成
    this._emitEventStatus('ready', { conversationId: conversation.id });
    
    // 对话完成！
    conversation.status = 'completed';
    conversation.completedAt = new Date();
    
    // 提取最终结果
    const result = this._extractResult(conversation);
    
    // 调用 resolve，完成 Promise！
    if (conversation.resolve) {
      conversation.resolve(result);
    }
    
    // 清理
    this.activeConversations.delete(conversation.id);
  }
  
  /**
   * 处理 Agent Ready 事件（明确的消息流结束信号）
   */
  _handleAgentReady() {
    // 查找当前活跃的对话
    const conversation = this._findActiveConversation();
    if (!conversation) {
      return;
    }
    
    // 处理 waiting 或 active 状态的对话
    // waiting 状态：对话刚创建，可能还没收到 agent 消息（快速响应场景）
    // active 状态：已经收到 agent 消息
    if (conversation.status !== 'active' && conversation.status !== 'waiting') {
      if (this.options.debug) {
        console.log(`[Agent Ready] Conversation ${conversation.id} status is ${conversation.status}, skipping`);
      }
      return;
    }
    
    // 清除静默检查定时器
    if (conversation.silenceCheckerId) {
      clearTimeout(conversation.silenceCheckerId);
      conversation.silenceCheckerId = null;
    }
    
    // 处理空消息情况：即使没有消息，也发出 ready 状态让上层知道
    if (conversation.messages.length === 0) {
      if (this.options.debug) {
        console.log(`[Agent Ready] Conversation ${conversation.id} has no messages, emitting ready anyway`);
      }
      // 发出 ready 状态事件，确保上层状态能恢复
      this._emitEventStatus('ready', { conversationId: conversation.id, reason: 'no_messages' });
      return;
    }
    
    if (this.options.debug) {
      console.log(`[Agent Ready] Conversation ${conversation.id} received ready signal, triggering stream end`);
    }
    
    // 发出消息流结束事件
    this._emitStreamEnded(conversation);
    
    // 完成对话
    this._completeConversation(conversation);
  }
  
  /**
   * 发出事件状态变更
   * @param {string} eventType - 事件类型 (ready, switch, processing, message 等)
   * @param {Object} eventData - 事件附加数据
   */
  _emitEventStatus(eventType, eventData = {}) {
    this.emit('eventStatus', {
      eventType,
      eventData,
      timestamp: Date.now()
    });
  }
  
  /**
   * 发出消息流结束事件
   * 添加 streamEndedEmitted 标记防止重复触发
   */
  _emitStreamEnded(conversation) {
    // 检查是否已经发送过 streamEnded 事件
    if (conversation.streamEndedEmitted) {
      if (this.options.debug) {
        console.log(`[StreamEnded] Conversation ${conversation.id} already emitted streamEnded, skipping`);
      }
      return;
    }
    
    // 设置标记，防止重复触发
    conversation.streamEndedEmitted = true;
    
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    this.emit('streamEnded', {
      conversationId: conversation.id,
      lastMessage: lastMsg?.text || '',
      conversation
    });
  }
  
  /**
   * 检查对话是否完成
   * 注意：主要完成信号来自 Agent Ready 事件（event.type === 'ready'）
   * 此方法作为备用机制，处理没有收到 ready 事件的异常情况
   */
  _checkConversationComplete(text, conversation) {
    // 1. 检查是否是工具调用消息（说明还在执行中）
    if (/^\[工具调用:/.test(text) || /^\[工具结果\]$/.test(text)) {
      conversation.waitingForSkill = true;
      return false;
    }
    
    // 2. 检查消息数量（防止无限等待）
    if (conversation.messages.length > 100) {
      console.warn('Too many messages in conversation, force completing');
      return true;
    }
    
    // 3. 清除执行中标记
    conversation.waitingForSkill = false;
    
    // 4. 不立即完成，等待 Agent Ready 事件或静默检测
    return false;
  }
  
  /**
   * 提取对话结果
   */
  _extractResult(conversation) {
    const allText = conversation.messages.map(m => m.text).join('\n');
    
    // 尝试提取 JSON
    const jsonMatch = allText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        return {
          success: true,
          type: 'json',
          data: JSON.parse(jsonMatch[1]),
          messages: conversation.messages
        };
      } catch (e) {
        console.warn('JSON parsing failed:', e);
      }
    }
    
    // 提取计划文件路径
    const planFilePattern = /\d{4}-\d{2}-\d{2}_\w+_plan\.json/g;
    const planFiles = allText.match(planFilePattern) || [];
    
    return {
      success: true,
      type: 'text',
      planFiles: [...new Set(planFiles)], // 去重
      messages: conversation.messages,
      rawText: allText
    };
  }
  
  /**
   * 发送消息并等待响应
   * @param {string} message - 消息文本
   * @param {object} options - 选项
   * @param {number} options.timeout - 超时时间 (ms)
   * @param {string} options.permissionMode - 权限模式
   * @param {function} options.onProgress - 进度回调
   */
  async sendAndWait(message, options = {}) {
    const conversationId = this._generateConversationId();
    const timeout = options.timeout || this.options.timeout || 60000;
    const permissionMode = options.permissionMode || this.options.permissionMode || 'default';
    
    // 创建对话上下文
    const conversation = {
      id: conversationId,
      status: 'waiting',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      timeout: timeout,
      permissionMode: permissionMode,
      messages: [],
      resolve: null,
      reject: null,
      promise: null,
      timeoutId: null,
      streamEndedEmitted: false  // 标记是否已发送 streamEnded 事件，防止重复触发
    };
    
    // 创建 Promise
    const promise = new Promise((resolve, reject) => {
      conversation.resolve = resolve;
      conversation.reject = reject;
      
      // 设置超时
      const timeoutId = setTimeout(async () => {
        if (conversation.status !== 'completed') {
          conversation.status = 'timeout';
          
          // 如果有超时回调，先执行（用于软中止等操作）
          if (this.options.onTimeout) {
            try {
              console.log(`[ConversationManager] Conversation ${conversationId} timeout, executing callback...`);
              await this.options.onTimeout(conversationId, conversation);
            } catch (e) {
              console.warn('Timeout callback failed:', e.message);
            }
          }
          
          // 触发 streamEnded 事件，让上层可以分析已收到的消息
          if (conversation.messages.length > 0 && !conversation.streamEndedEmitted) {
            this._emitStreamEnded(conversation);
          }
          
          this.activeConversations.delete(conversationId);
          reject(new Error(`Conversation timeout (${timeout}ms)`));
        }
      }, timeout);
      
      conversation.timeoutId = timeoutId;
    });
    
    conversation.promise = promise;
    
    // 设置进度回调
    if (options.onProgress) {
      conversation.onProgress = options.onProgress;
    }
    
    // 注册对话
    this.activeConversations.set(conversationId, conversation);
    
    // 发送消息（传递权限模式）
    try {
      await this._sendMessage(message, permissionMode);
      
      // 更新状态
      conversation.status = 'active';
      
      // 返回 Promise
      return promise;
    } catch (error) {
      // 发送失败，清理
      this.activeConversations.delete(conversationId);
      if (conversation.timeoutId) {
        clearTimeout(conversation.timeoutId);
      }
      throw error;
    }
  }
  
  /**
   * 发送消息到 Happy
   * @param {string} text - 消息文本
   * @param {string} permissionMode - 权限模式 (可选，默认使用构造时的配置)
   */
  async _sendMessage(text, permissionMode = null) {
    const enc = this.encryption.getSessionEncryption(this.sessionId);
    if (!enc) {
      throw new Error('Session encryption not initialized');
    }
    
    // 使用传入的模式，或使用配置的默认模式
    const mode = permissionMode || this.options.permissionMode || 'default';
    
    // 构建消息内容（与项目源码一致）
    const content = {
      role: 'user',
      content: {
        type: 'text',
        text: text
      },
      meta: {
        sentFrom: 'happy-client-module',
        permissionMode: mode
      }
    };
    
    // 加密消息
    const encrypted = this.encryption.encrypt(enc, content);
    const encryptedBase64 = CryptoUtils.encodeBase64(encrypted, 'base64');
    
    // 生成本地 ID
    const localId = crypto.randomUUID();
    
    // 发送消息（同时在 WebSocket 层面也传递 permissionMode）
    this.socket.emit('message', {
      sid: this.sessionId,
      message: encryptedBase64,
      localId: localId,
      sentFrom: 'happy-client-module',
      permissionMode: mode
    });
    
    // 记录发送的消息
    this.messageHistory.push({
      timestamp: new Date(),
      text,
      role: 'user',
      permissionMode: mode
    });
  }
  
  /**
   * 生成对话 ID
   */
  _generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 查找活跃对话
   */
  _findActiveConversation() {
    const conversations = Array.from(this.activeConversations.values())
      .filter(conv => conv.status === 'waiting' || conv.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);
    
    return conversations[0] || null;
  }
  
  /**
   * 清理所有对话
   */
  cleanup() {
    for (const [id, conv] of this.activeConversations) {
      if (conv.timeoutId) {
        clearTimeout(conv.timeoutId);
      }
      if (conv.silenceCheckerId) {
        clearTimeout(conv.silenceCheckerId);
      }
      if (conv.reject) {
        conv.reject(new Error('Conversation manager has been cleaned up'));
      }
    }
    this.activeConversations.clear();
  }
}

module.exports = ConversationManager;
