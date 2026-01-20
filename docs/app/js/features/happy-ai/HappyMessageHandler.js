/**
 * HappyMessageHandler - Happy AI 消息处理模块
 * 使用 Reducer 架构处理 AI 消息
 * 
 * @created 2026-01-16
 * @updated 2026-01-16
 * @module features/happy-ai/HappyMessageHandler
 */

class HappyMessageHandler {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // Reducer 状态
    this.reducerState = null;
    
    // 状态
    this.eventStatus = 'idle'; // idle, processing, ready
    this.statusTimeoutId = null;
    this.statusTimeoutMs = options.statusTimeoutMs || 120000; // 2 分钟
    
    // 初始化 Reducer
    this.initReducer();
  }

  /**
   * 初始化 Reducer
   */
  initReducer() {
    if (window.MessageReducer) {
      this.reducerState = window.MessageReducer.createReducer();
      console.log('[HappyMessageHandler] Reducer initialized');
    } else {
      console.warn('[HappyMessageHandler] MessageReducer not available, waiting...');
      // 延迟初始化
      setTimeout(() => this.initReducer(), 100);
    }
  }

  /**
   * 处理收到的原始消息
   * @param {Object} rawMessage 原始消息数据
   */
  handleMessage(rawMessage) {
    if (!this.reducerState) {
      console.warn('[HappyMessageHandler] Reducer not ready, message dropped');
      return;
    }

    // 调试日志
    console.log('[HappyMessageHandler] Raw message received:', {
      role: rawMessage.role,
      messageId: rawMessage.messageId,
      hasContent: !!rawMessage.content,
      contentType: rawMessage.content?.type,
      contentMessage: rawMessage.content?.message,
      fullContent: JSON.stringify(rawMessage.content)?.substring(0, 200)
    });

    // 规范化消息（实时消息处理时跳过乐观更新的用户消息，避免重复）
    const normalizedMessages = window.MessageNormalizer.normalizeMessages([rawMessage], { 
      skipOptimisticUserMessages: true 
    });
    
    if (normalizedMessages.length === 0) {
      console.log('[HappyMessageHandler] Message normalized to empty, skipping');
      return;
    }

    // 通过 Reducer 处理
    const result = window.MessageReducer.reducer(
      this.reducerState, 
      normalizedMessages,
      null // agentState - 暂不传入
    );

    // 处理结果
    if (result.messages && result.messages.length > 0) {
      console.log(`[HappyMessageHandler] Reducer produced ${result.messages.length} messages`);
      
      for (const message of result.messages) {
        this.dispatchMessage(message);
      }
    }

    // 处理 ready 事件
    if (result.hasReadyEvent) {
      this.updateEventStatus('ready');
    }

    // 更新 usage 数据
    if (result.usage && this.app?.chatPanel?.updateUsageDisplay) {
      this.app.chatPanel.updateUsageDisplay(result.usage);
    }
  }

  /**
   * 批量处理历史消息
   * @param {Array} rawMessages 原始消息数组
   */
  handleHistoryMessages(rawMessages) {
    if (!this.reducerState) {
      console.warn('[HappyMessageHandler] Reducer not ready');
      return;
    }

    console.log(`[HappyMessageHandler] Processing ${rawMessages.length} history messages`);

    // 规范化所有消息
    const normalizedMessages = window.MessageNormalizer.normalizeMessages(rawMessages);
    
    if (normalizedMessages.length === 0) {
      console.log('[HappyMessageHandler] No messages after normalization');
      return;
    }

    // 通过 Reducer 处理
    const result = window.MessageReducer.reducer(
      this.reducerState,
      normalizedMessages,
      null
    );

    // 获取所有消息并分发
    const allMessages = window.MessageReducer.getAllMessages(this.reducerState);
    console.log(`[HappyMessageHandler] Total ${allMessages.length} messages after history load`);

    for (const message of allMessages) {
      this.dispatchMessage(message);
    }

    // 更新 usage
    if (result.usage && this.app?.chatPanel?.updateUsageDisplay) {
      this.app.chatPanel.updateUsageDisplay(result.usage);
    }
  }

  /**
   * 分发消息到渲染层
   * @param {Message} message 消息对象
   */
  dispatchMessage(message) {
    if (!this.app?.chatPanel) {
      console.warn('[HappyMessageHandler] ChatPanel not available');
      return;
    }

    // 使用 ChatPanel 的新渲染方法
    this.app.chatPanel.renderMessage(message);
  }

  /**
   * 更新事件状态
   * @param {string} status 状态
   */
  updateEventStatus(status) {
    this.eventStatus = status;
    
    // 当状态不是 processing 时，清除超时定时器
    if (status !== 'processing' && this.statusTimeoutId) {
      clearTimeout(this.statusTimeoutId);
      this.statusTimeoutId = null;
    }
    
    const dot = document.getElementById('happy-event-dot');
    const text = document.getElementById('happy-event-text');
    
    // 使用统一的 status-dot + state-xxx 类名格式
    if (dot) {
      dot.className = 'status-dot';
      dot.classList.add(`state-${status}`);
    }
    
    if (text) {
      const statusLabels = {
        'idle': 'idle',
        'processing': 'processing...',
        'ready': 'ready',
        'disconnected': 'disconnected',
        'thinking': 'thinking...',
        'waiting': 'waiting...'
      };
      text.textContent = statusLabels[status] || status;
    }
    
    // 更新中止按钮
    this.updateAbortButton(status);
    
    // 更新发送按钮状态（通过 app）
    if (this.app?.updateAISendButton) {
      this.app.updateAISendButton();
    }
  }

  /**
   * 更新中止按钮状态
   * @param {string} status 状态
   */
  updateAbortButton(status) {
    const abortBtn = this.app?.aiAbortBtn || document.getElementById('ai-abort-btn');
    if (!abortBtn) return;
    
    // 仅在 processing 或 thinking 状态时显示中止按钮
    const showAbort = status === 'processing' || status === 'thinking' || status === 'waiting';
    abortBtn.style.display = showAbort ? 'flex' : 'none';
  }

  /**
   * 设置状态超时恢复
   */
  setStatusTimeout() {
    if (this.statusTimeoutId) {
      clearTimeout(this.statusTimeoutId);
    }
    this.statusTimeoutId = setTimeout(() => {
      if (this.eventStatus === 'processing') {
        console.warn('[HappyMessageHandler] Status timeout, restoring to ready');
        this.updateEventStatus('ready');
      }
    }, this.statusTimeoutMs);
  }

  /**
   * 清除状态超时
   */
  clearStatusTimeout() {
    if (this.statusTimeoutId) {
      clearTimeout(this.statusTimeoutId);
      this.statusTimeoutId = null;
    }
  }

  /**
   * 清空消息记录和重置 Reducer
   */
  clearMessages() {
    if (this.reducerState && window.MessageReducer) {
      window.MessageReducer.resetReducer(this.reducerState);
    }
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getStatus() {
    return this.eventStatus;
  }

  /**
   * 获取所有消息
   * @returns {Message[]}
   */
  getAllMessages() {
    if (!this.reducerState || !window.MessageReducer) {
      return [];
    }
    return window.MessageReducer.getAllMessages(this.reducerState);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.HappyMessageHandler = HappyMessageHandler;
}
