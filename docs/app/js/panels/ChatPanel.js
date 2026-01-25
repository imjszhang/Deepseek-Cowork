/**
 * ChatPanel - AI 聊天面板模块
 * 管理 AI 连接状态、消息发送和显示
 * 使用 Reducer 架构处理消息
 * 
 * @created 2026-01-16
 * @updated 2026-01-16
 * @module panels/ChatPanel
 */

class ChatPanel {
  /**
   * 构造函数
   * @param {Object} app 主应用实例引用
   */
  constructor(app) {
    this.app = app;
    
    // 连接状态
    this.aiConnected = false;
    this.currentSessionId = null;
    
    // 已渲染消息 ID 集合（用于防止重复渲染）
    this.renderedMessageIds = new Set();
    
    // 状态
    this.happyEventStatus = 'idle'; // idle, processing, ready
    this.happyStatusTimeoutId = null;
    this.happyStatusTimeoutMs = 120000; // 2 分钟超时
    
    // 滚动状态
    this.isUserScrolling = false;
    this.scrollTimeout = null;
    
    // 使用量数据
    this.usageData = null;
    
    // 命令建议状态
    this.commandSuggestionsVisible = false;
    this.commandSuggestionsIndex = -1;
    this.commandSuggestions = [];
    
    // 不展示的工具调用列表
    this.hiddenTools = ['mcp__happy__change_title'];
    
    // Three.js 背景实例
    this.chatBackground = null;
    
    // 是否处于对话模式（只有对话模式下才显示独立层）
    this.isChatMode = false;
    
    // 打字机效果相关
    this.typewriterTimer = null;
    this.typewriterText = '';  // 原始文本（从 i18n 获取）
    this.typewriterPlayed = false;  // 是否已播放过打字机效果
    
    // DOM 元素
    this.elements = {};
  }

  /**
   * 初始化面板
   */
  init() {
    this.bindElements();
    this.bindEvents();
    
    // 初始状态：如果没有消息，准备显示背景（但不启动动画，等待面板激活）
    this._setInitialBackgroundState();
  }

  /**
   * 设置初始背景状态
   */
  _setInitialBackgroundState() {
    // 检查是否有消息
    const hasMessages = this.renderedMessageIds.size > 0;
    const hasWelcome = this.elements.aiMessages?.querySelector('.ai-welcome');
    
    // 如果只有欢迎消息或没有消息，准备显示背景
    if (!hasMessages && hasWelcome) {
      // 背景容器存在但先不添加 visible 类，等面板激活时再添加
      if (this.elements.chatHome) {
        this.elements.chatHome.style.display = 'block';
      }
    }
  }

  /**
   * 面板激活时调用（由 app.js 在切换到聊天面板时调用）
   * 只有在对话模式下才会显示独立层
   */
  onPanelActivate() {
    // 标记为对话模式
    this.isChatMode = true;
    
    // 首次激活时初始化 Three.js 背景
    if (!this.chatBackground) {
      this.initChatBackground();
    }
    
    // 检查是否应该显示背景（只在对话模式且无消息时显示）
    const hasMessages = this.renderedMessageIds.size > 0;
    const hasWelcome = this.elements.aiMessages?.querySelector('.ai-welcome');
    
    if (!hasMessages && hasWelcome) {
      this.showChatBackground();
    } else {
      this.hideChatBackground();
    }
    
    // 更新尺寸并启动动画（如果背景可见）
    if (this.chatBackground && this.elements.chatHome?.classList.contains('visible')) {
      this.chatBackground.onResize();
      this.chatBackground.start();
    }
  }

  /**
   * 面板取消激活时调用（切换到其他模式）
   */
  onPanelDeactivate() {
    // 标记为非对话模式
    this.isChatMode = false;
    
    // 隐藏独立层（非对话模式下不显示）
    this.hideChatBackground();
  }

  /**
   * 初始化 Three.js 背景
   */
  initChatBackground() {
    const container = this.elements.chatHome;
    if (!container) {
      console.warn('[ChatPanel] Chat home container not found');
      return;
    }
    
    if (typeof PreviewBackground !== 'undefined') {
      this.chatBackground = new PreviewBackground({ container });
      this.chatBackground.init();
      console.log('[ChatPanel] Chat background initialized');
    } else {
      console.warn('[ChatPanel] PreviewBackground class not available');
    }
  }

  /**
   * 显示对话首页（只在对话模式下有效）
   */
  showChatBackground() {
    // 只在对话模式下显示独立层
    if (!this.isChatMode) {
      return;
    }
    
    if (this.elements.chatHome) {
      this.elements.chatHome.classList.add('visible');
      
      // 如果背景已初始化，启动动画
      if (this.chatBackground) {
        this.chatBackground.onResize();
        this.chatBackground.start();
      }
      
      // 启动打字机效果（每次显示都播放）
      this.startTypewriter();
    }
  }

  /**
   * 隐藏对话首页
   */
  hideChatBackground() {
    if (this.elements.chatHome) {
      this.elements.chatHome.classList.remove('visible');
      
      // 停止动画以节省资源
      if (this.chatBackground) {
        this.chatBackground.stop();
      }
      
      // 停止打字机效果
      this.stopTypewriter();
    }
  }

  /**
   * 启动打字机效果
   */
  startTypewriter() {
    const titleEl = this.elements.chatHomeTitle;
    if (!titleEl) return;
    
    // 停止之前的打字机效果
    this.stopTypewriter();
    
    // 获取原始文本（从 i18n key 获取或使用默认文本）
    if (!this.typewriterText) {
      // 尝试从 i18n 获取文本
      const i18nKey = titleEl.getAttribute('data-i18n');
      if (i18nKey && window.i18n?.t) {
        this.typewriterText = window.i18n.t(i18nKey);
      } else {
        // 使用默认文本
        this.typewriterText = titleEl.textContent || 'What can I help you with?';
      }
    }
    
    // 清空标题并添加光标
    titleEl.innerHTML = '<span class="typewriter-cursor"></span>';
    
    // 逐字显示
    let charIndex = 0;
    const text = this.typewriterText;
    const speed = 60; // 每个字符的打字速度（毫秒）
    
    const type = () => {
      if (charIndex < text.length) {
        // 获取光标元素
        const cursor = titleEl.querySelector('.typewriter-cursor');
        // 在光标前插入字符
        if (cursor) {
          cursor.insertAdjacentText('beforebegin', text.charAt(charIndex));
        } else {
          titleEl.textContent += text.charAt(charIndex);
        }
        charIndex++;
        this.typewriterTimer = setTimeout(type, speed);
      } else {
        // 打字完成，保留光标继续闪烁
        this.typewriterPlayed = true;
      }
    };
    
    // 延迟开始打字，让背景动画先出现
    this.typewriterTimer = setTimeout(type, 300);
  }

  /**
   * 停止打字机效果
   */
  stopTypewriter() {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  /**
   * 重置打字机效果（重新显示首页时调用）
   */
  resetTypewriter() {
    this.typewriterPlayed = false;
    const titleEl = this.elements.chatHomeTitle;
    if (titleEl && this.typewriterText) {
      titleEl.textContent = this.typewriterText;
    }
  }

  /**
   * 更新首页发送按钮状态
   */
  updateHomeSendButton() {
    const hasText = this.elements.chatHomeInput?.value?.trim().length > 0;
    if (this.elements.chatHomeSendBtn) {
      this.elements.chatHomeSendBtn.disabled = !hasText;
    }
  }

  /**
   * 从首页发送消息
   */
  async sendFromHomePage() {
    const text = this.elements.chatHomeInput?.value?.trim();
    if (!text) return;

    // 清空首页输入框
    if (this.elements.chatHomeInput) {
      this.elements.chatHomeInput.value = '';
    }
    this.updateHomeSendButton();

    // 隐藏首页独立层
    this.hideChatBackground();

    // 如果尚未连接 AI，先尝试连接
    if (!this.aiConnected) {
      await this.autoConnectAI();
    }

    // 将文本复制到主输入框并发送
    if (this.elements.aiInput) {
      this.elements.aiInput.value = text;
    }
    this.updateAISendButton();
    
    // 发送消息
    await this.sendAIMessage();
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 状态栏 - AI 状态
      aiStatusItem: document.getElementById('ai-indicator'),
      aiDot: document.getElementById('ai-status-dot'),
      aiStatusText: document.getElementById('ai-status-text'),
      // AI 面板
      aiMessages: document.getElementById('ai-messages'),
      aiInput: document.getElementById('ai-input'),
      aiSendBtn: document.getElementById('ai-send-btn'),
      aiAbortBtn: document.getElementById('ai-abort-btn'),
      // 状态栏 - Agent 事件状态
      agentStatusItem: document.getElementById('agent-status'),
      happyEventDot: document.getElementById('happy-event-dot'),
      happyEventText: document.getElementById('happy-event-text'),
      // 对话首页独立层
      chatHome: document.getElementById('chat-home'),
      // 对话首页元素
      chatHomeTitle: document.querySelector('.chat-home-title'),
      chatHomeInput: document.getElementById('chat-home-input'),
      chatHomeSendBtn: document.getElementById('chat-home-send-btn')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 发送按钮
    this.elements.aiSendBtn?.addEventListener('click', () => this.sendAIMessage());
    
    // 中止按钮
    this.elements.aiAbortBtn?.addEventListener('click', () => this.abortAISession());
    
    // 首页发送按钮
    this.elements.chatHomeSendBtn?.addEventListener('click', () => this.sendFromHomePage());
    
    // 首页输入框事件
    this.elements.chatHomeInput?.addEventListener('keydown', (e) => {
      // Ctrl+Enter 或 Cmd+Enter 发送
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.sendFromHomePage();
      }
    });
    this.elements.chatHomeInput?.addEventListener('input', () => {
      this.updateHomeSendButton();
    });
    
    // 输入框事件
    this.elements.aiInput?.addEventListener('keydown', (e) => {
      // 命令建议键盘导航
      if (this.commandSuggestionsVisible) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateCommandSuggestions(-1);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateCommandSuggestions(1);
          return;
        }
        if (e.key === 'Enter' && this.commandSuggestionsIndex >= 0) {
          e.preventDefault();
          this.selectCommandSuggestion(this.commandSuggestionsIndex);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.hideCommandSuggestions();
          return;
        }
        if (e.key === 'Tab' && this.commandSuggestions.length > 0) {
          e.preventDefault();
          // Tab 选择第一个或当前选中的建议
          const index = this.commandSuggestionsIndex >= 0 ? this.commandSuggestionsIndex : 0;
          this.selectCommandSuggestion(index);
          return;
        }
      }
      
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendAIMessage();
      }
      if (e.key === 'Escape' && this.happyEventStatus === 'processing') {
        e.preventDefault();
        this.abortAISession();
      }
    });
    this.elements.aiInput?.addEventListener('input', (e) => {
      this.updateAISendButton();
      this.handleInputChange(e);
    });
    
    // 消息列表滚动
    this.elements.aiMessages?.addEventListener('scroll', () => this.handleMessagesScroll());
  }

  /**
   * 检查 AI 状态，如果未连接则自动尝试连接
   */
  async checkAIStatus() {
    try {
      // 首先加载模型配置（用于正确计算上下文大小）
      if (this.app?.loadModelConfig) {
        await this.app.loadModelConfig();
      }
      
      const status = await window.browserControlManager?.getAIStatus?.();
      console.log('[ChatPanel] AI status:', status);
      
      if (status) {
        this.updateAIStatus(status);
        
        // 如果已连接，加载历史消息（如果尚未加载）
        if (status.isConnected) {
          // 检查是否已经通过 WebSocket 事件加载了历史（避免重复加载清空消息）
          if (!this.app?._historyLoaded) {
            await this.loadHappyMessageHistory();
            if (this.app) this.app._historyLoaded = true;
          }
        } else {
          // 如果未连接，自动尝试连接
          console.log('[ChatPanel] AI not connected, attempting auto-connect...');
          await this.autoConnectAI();
        }
      }
    } catch (error) {
      console.error('[ChatPanel] Failed to get AI status:', error);
    }
  }
  
  /**
   * 自动连接 AI
   */
  async autoConnectAI() {
    try {
      const result = await window.browserControlManager?.connectAI?.();
      console.log('[ChatPanel] Auto-connect result:', result);
      
      if (result?.success) {
        // 重新获取状态并更新 UI
        const status = await window.browserControlManager?.getAIStatus?.();
        if (status) {
          this.updateAIStatus(status);
          if (status.isConnected) {
            await this.loadHappyMessageHistory();
          }
        }
      }
    } catch (error) {
      console.error('[ChatPanel] Auto-connect failed:', error);
    }
  }
  
  /**
   * 加载 Happy AI 历史消息
   */
  async loadHappyMessageHistory() {
    try {
      const result = await window.browserControlManager?.getHappyMessages?.(100);
      
      // 先清空显示
      this.renderedMessageIds.clear();
      if (this.elements.aiMessages) {
        this.elements.aiMessages.innerHTML = '';
      }
      
      // 解析返回值：可能是 { success, messages } 对象或直接是数组
      const messages = Array.isArray(result) ? result : (result?.messages || []);
      
      // 使用 HappyMessageHandler 处理历史消息
      if (messages && messages.length > 0 && this.app?.happyMessageHandler) {
        console.log(`[ChatPanel] Loading ${messages.length} history messages via Reducer`);
        this.app.happyMessageHandler.handleHistoryMessages(messages);
      } else {
        // 没有历史消息，恢复欢迎信息
        this.restoreWelcomeMessage();
      }
    } catch (error) {
      console.error('[ChatPanel] Load history failed:', error);
    }
  }

  /**
   * 清空对话框消息
   */
  clearAIMessages() {
    // 清空已渲染 ID 集合
    this.renderedMessageIds.clear();
    
    // 清空消息显示区域
    if (this.elements.aiMessages) {
      this.elements.aiMessages.innerHTML = '';
    }
    
    // 重置 Reducer
    if (this.app?.happyMessageHandler) {
      this.app.happyMessageHandler.clearMessages();
    }
    
    // 恢复欢迎信息
    this.restoreWelcomeMessage();
  }

  /**
   * 恢复欢迎信息
   */
  restoreWelcomeMessage() {
    const container = this.elements.aiMessages;
    if (!container) return;
    
    // 如果已有欢迎信息，不重复添加
    if (container.querySelector('.ai-welcome')) {
      // 但仍然显示背景
      this.showChatBackground();
      return;
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'ai-welcome';
    welcomeDiv.innerHTML = `
      <h3>${t('chat.welcomeTitle')}</h3>
      <p>${t('chat.welcomeDesc')}</p>
    `;
    
    container.appendChild(welcomeDiv);
    
    // 显示 Three.js 背景
    this.showChatBackground();
  }

  /**
   * 更新 AI 状态显示
   * @param {Object} status 状态对象
   */
  updateAIStatus(status) {
    this.aiConnected = status.isConnected || status.state === 'connected';
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 更新状态栏 - 使用统一的 status-dot + state-xxx 类名
    if (this.elements.aiDot) {
      this.elements.aiDot.className = 'status-dot';
      this.elements.aiDot.classList.add(this.aiConnected ? 'state-connected' : 'state-disconnected');
    }
    if (this.elements.aiStatusText) {
      const statusValue = this.aiConnected ? t('chat.connected') : t('chat.disconnected');
      this.elements.aiStatusText.textContent = statusValue;
    }
    
    // 更新事件状态（idle/processing/ready）
    if (status.eventStatus) {
      this.updateHappyEventStatus(status.eventStatus);
    } else if (this.aiConnected) {
      // 如果已连接但没有 eventStatus，默认设为 ready
      this.updateHappyEventStatus('ready');
    } else {
      this.updateHappyEventStatus('disconnected');
    }
    
    this.updateAISendButton();
    
    // 更新上下文使用量显示
    if (this.aiConnected) {
      this.loadLatestUsage();
    } else {
      this.hideUsageDisplay();
    }
    
    // 同步状态到 app（兼容性）
    if (this.app) {
      this.app.aiConnected = this.aiConnected;
    }
  }
  
  /**
   * 加载最新的使用量数据
   */
  async loadLatestUsage() {
    try {
      const result = await window.browserControlManager?.getLatestUsage?.();
      // 解析返回值：可能是 { success, usage } 对象或直接是 usage 数据
      const usage = result?.usage || result;
      if (usage && typeof usage === 'object') {
        this.usageData = usage;
        if (this.app?.updateUsageDisplay) {
          this.app.updateUsageDisplay(usage);
        }
      }
    } catch (error) {
      console.error('[ChatPanel] loadLatestUsage error:', error);
    }
  }

  /**
   * 更新使用量显示
   * @param {Object} usage 使用量数据
   */
  updateUsageDisplay(usage) {
    this.usageData = usage;
    if (this.app?.updateUsageDisplay) {
      this.app.updateUsageDisplay(usage);
    }
  }

  /**
   * 隐藏使用量显示
   */
  hideUsageDisplay() {
    if (this.app?.hideUsageDisplay) {
      this.app.hideUsageDisplay();
    }
  }

  /**
   * 切换 AI 连接
   */
  async toggleAIConnection() {
    try {
      if (this.aiConnected) {
        await window.browserControlManager?.disconnectAI?.();
      } else {
        await window.browserControlManager?.connectAI?.();
      }
      
      await this.checkAIStatus();
      
    } catch (error) {
      console.error('[ChatPanel] Failed to toggle AI connection:', error);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.renderSystemMessage(`${t('chat.connectionFailed')} ${error.message}`);
    }
  }

  /**
   * 更新发送按钮状态
   */
  updateAISendButton() {
    const hasText = this.elements.aiInput?.value?.trim().length > 0;
    if (this.elements.aiSendBtn) {
      this.elements.aiSendBtn.disabled = !this.aiConnected || !hasText;
    }
  }

  /**
   * 发送 AI 消息
   */
  async sendAIMessage() {
    const text = this.elements.aiInput?.value?.trim();
    if (!text || !this.aiConnected) return;

    // 隐藏命令建议
    this.hideCommandSuggestions();

    // 清空输入
    if (this.elements.aiInput) this.elements.aiInput.value = '';
    this.updateAISendButton();
    
    // 检查是否是纯前端命令
    if (window.CommandSuggestions?.isCommand(text)) {
      const parsed = window.CommandSuggestions.parseCommand(text);
      if (parsed && window.CommandSuggestions.isFrontendOnlyCommand(parsed.command)) {
        this.handleFrontendCommand(parsed.command, parsed.args);
        return;
      }
    }
    
    // 检测 /clear 命令，提前清空 usage 显示（乐观更新）
    if (text === '/clear') {
      this.hideUsageDisplay();
      this.usageData = null;
      // 显示确认消息
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      setTimeout(() => {
        this.renderSystemMessage(t('chat.contextCleared'));
        this.updateHappyEventStatus('ready');
      }, 500);
    }

    // 创建用户消息对象（使用新的消息类型）
    const { MessageTypes } = window;
    const userMessage = MessageTypes.createUserTextMessage({
      id: `local-${Date.now()}`,
      localId: `local-${Date.now()}`,
      createdAt: Date.now(),
      text
    });

    // 显示用户消息（乐观更新）
    this.renderMessage(userMessage);
    
    // 更新状态为 processing
    this.updateHappyEventStatus('processing');
    
    // 设置状态超时恢复
    if (this.happyStatusTimeoutId) {
      clearTimeout(this.happyStatusTimeoutId);
    }
    this.happyStatusTimeoutId = setTimeout(() => {
      if (this.happyEventStatus === 'processing') {
        console.warn('[ChatPanel] 状态超时，自动恢复为 ready');
        this.updateHappyEventStatus('ready');
      }
    }, this.happyStatusTimeoutMs);

    try {
      const result = await window.browserControlManager?.sendAIMessage?.(text);
      
      if (!result?.success) {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.renderSystemMessage(`${t('chat.sendFailed')} ${result?.error || t('chat.unknownError')}`);
        this.updateHappyEventStatus('ready');
      }
    } catch (error) {
      console.error('[ChatPanel] Failed to send AI message:', error);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.renderSystemMessage(`${t('chat.sendFailed')} ${error.message}`);
      this.updateHappyEventStatus('ready');
    }
  }

  /**
   * 中止 AI 会话
   */
  async abortAISession() {
    if (this.happyEventStatus !== 'processing' && this.happyEventStatus !== 'thinking') {
      return;
    }
    
    try {
      const sessionId = this.currentSessionId || this.app?.currentSessionId;
      if (sessionId) {
        await window.browserControlManager?.abortAISession?.(sessionId);
      }
      this.updateHappyEventStatus('ready');
    } catch (error) {
      console.error('[ChatPanel] Failed to abort session:', error);
    }
  }

  // ============ 新的消息渲染方法（基于 message.kind 分发）============

  /**
   * 渲染消息（根据 kind 分发）
   * @param {Message} message 消息对象
   */
  renderMessage(message) {
    const container = this.elements.aiMessages;
    if (!container) return;

    // 检查是否已渲染
    if (this.renderedMessageIds.has(message.id)) {
      // 工具消息可能需要更新状态
      if (message.kind === 'tool-call') {
        this.updateToolCallMessage(message);
      }
      return;
    }

    // 根据消息类型分发渲染
    const { MessageKind } = window.MessageTypes;
    
    // 只有历史消息（用户消息、Agent消息、工具调用）才移除欢迎信息
    // 系统消息和事件消息不算历史消息，不移除欢迎信息
    const isHistoryMessage = message.kind === MessageKind.USER_TEXT || 
                             message.kind === MessageKind.AGENT_TEXT || 
                             message.kind === MessageKind.TOOL_CALL;
    if (isHistoryMessage) {
      const welcome = container.querySelector('.ai-welcome');
      if (welcome) welcome.remove();
      
      // 隐藏 Three.js 背景（有消息时不显示背景）
      this.hideChatBackground();
    }
    
    switch (message.kind) {
      case MessageKind.USER_TEXT:
        this.renderUserText(message);
        break;
      case MessageKind.AGENT_TEXT:
        this.renderAgentText(message);
        break;
      case MessageKind.TOOL_CALL:
        this.renderToolCall(message);
        break;
      case MessageKind.AGENT_EVENT:
        this.renderAgentEvent(message);
        break;
      default:
        console.warn('[ChatPanel] Unknown message kind:', message.kind);
    }

    // 记录已渲染
    this.renderedMessageIds.add(message.id);
    
    // 滚动到底部
    this.smartScrollToBottom();
  }

  /**
   * 渲染用户文本消息
   * @param {UserTextMessage} message
   */
  renderUserText(message) {
    const container = this.elements.aiMessages;
    if (!container) return;

    // 跳过空文本消息
    const text = message.displayText || message.text;
    if (!text || text.trim() === '') {
      console.log('[ChatPanel] Skipping empty user message:', message.id);
      return;
    }

    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message user';
    msgDiv.dataset.messageId = message.id;
    msgDiv.textContent = text;

    container.appendChild(msgDiv);
  }

  /**
   * 渲染 Agent 文本消息
   * @param {AgentTextMessage} message
   */
  renderAgentText(message) {
    const container = this.elements.aiMessages;
    if (!container) return;

    const text = message.text || '';
    
    // 跳过空文本消息
    if (!text.trim()) {
      console.log('[ChatPanel] Skipping empty agent message:', message.id);
      return;
    }

    // 解析选项块
    const { cleanText, options } = window.OptionsParser?.parseOptions(text) || { cleanText: text, options: [] };

    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message assistant';
    msgDiv.dataset.messageId = message.id;
    
    if (typeof marked !== 'undefined') {
      // 长消息处理（基于干净文本，使用智能截断）
      const maxPreviewLength = 800;
      const isLongMessage = cleanText.length > maxPreviewLength;
      const displayContent = isLongMessage 
        ? this.findSafeTruncationPoint(cleanText, maxPreviewLength) 
        : cleanText;
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'markdown-content';
      // 存储原始文本用于复制
      contentDiv.dataset.rawText = cleanText;
      contentDiv.innerHTML = this.renderMarkdown(displayContent);
      msgDiv.appendChild(contentDiv);
      
      if (isLongMessage) {
        // 添加截断提示
        const truncatedIndicator = document.createElement('span');
        truncatedIndicator.className = 'truncated-indicator';
        truncatedIndicator.textContent = '...';
        contentDiv.appendChild(truncatedIndicator);
        
        const expandBtn = document.createElement('span');
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        expandBtn.className = 'message-expand-btn';
        expandBtn.textContent = t('common.expandAllArrow');
        expandBtn.dataset.expanded = 'false';
        
        expandBtn.addEventListener('click', () => {
          const isExpanded = expandBtn.dataset.expanded === 'true';
          if (isExpanded) {
            contentDiv.innerHTML = this.renderMarkdown(displayContent);
            // 重新添加截断提示
            const indicator = document.createElement('span');
            indicator.className = 'truncated-indicator';
            indicator.textContent = '...';
            contentDiv.appendChild(indicator);
            expandBtn.textContent = t('common.expandAllArrow');
            expandBtn.dataset.expanded = 'false';
          } else {
            contentDiv.innerHTML = this.renderMarkdown(cleanText);
            expandBtn.textContent = t('common.collapseArrow');
            expandBtn.dataset.expanded = 'true';
          }
          this.highlightCodeBlocks(contentDiv);
          this.addCopyButtons(contentDiv);
        });
        
        msgDiv.appendChild(expandBtn);
      }
      
      this.highlightCodeBlocks(contentDiv);
      this.addCopyButtons(contentDiv);
    } else {
      msgDiv.textContent = cleanText;
    }

    // 渲染选项块（如果有）
    if (options.length > 0) {
      this.renderOptionsBlock(msgDiv, options);
    }

    // 添加消息复制按钮
    this.addMessageCopyButton(msgDiv, cleanText);

    container.appendChild(msgDiv);
  }

  /**
   * 渲染选项块
   * @param {HTMLElement} msgDiv - 消息容器
   * @param {string[]} options - 选项数组
   */
  renderOptionsBlock(msgDiv, options) {
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'options-container';

    options.forEach((optionText) => {
      const optionItem = document.createElement('div');
      optionItem.className = 'option-item';
      optionItem.textContent = optionText;
      
      // 点击选项发送消息
      optionItem.addEventListener('click', () => {
        this.sendAIMessageWithText(optionText);
      });

      optionsContainer.appendChild(optionItem);
    });

    msgDiv.appendChild(optionsContainer);
  }

  /**
   * 直接以指定文本发送 AI 消息（跳过输入框）
   * 用于选项点击场景
   * @param {string} text - 要发送的文本
   */
  async sendAIMessageWithText(text) {
    if (!text || !this.aiConnected) return;

    // 创建用户消息对象
    const { MessageTypes } = window;
    const userMessage = MessageTypes.createUserTextMessage({
      id: `local-${Date.now()}`,
      localId: `local-${Date.now()}`,
      createdAt: Date.now(),
      text
    });

    // 显示用户消息（乐观更新）
    this.renderMessage(userMessage);
    
    // 更新状态为 processing
    this.updateHappyEventStatus('processing');
    
    // 设置状态超时恢复
    if (this.happyStatusTimeoutId) {
      clearTimeout(this.happyStatusTimeoutId);
    }
    this.happyStatusTimeoutId = setTimeout(() => {
      if (this.happyEventStatus === 'processing') {
        console.warn('[ChatPanel] 状态超时，自动恢复为 ready');
        this.updateHappyEventStatus('ready');
      }
    }, this.happyStatusTimeoutMs);

    try {
      const result = await window.browserControlManager?.sendAIMessage?.(text);
      
      if (!result?.success) {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.renderSystemMessage(`${t('chat.sendFailed')} ${result?.error || t('chat.unknownError')}`);
        this.updateHappyEventStatus('ready');
      }
    } catch (error) {
      console.error('[ChatPanel] Failed to send AI message:', error);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.renderSystemMessage(`${t('chat.sendFailed')} ${error.message}`);
      this.updateHappyEventStatus('ready');
    }
  }

  /**
   * 渲染工具调用消息
   * @param {ToolCallMessage} message
   */
  renderToolCall(message) {
    if (!message.tool) return;

    // 过滤不需要展示的工具调用
    if (this.isHiddenTool(message.tool.name)) {
      console.log('[ChatPanel] Skipping hidden tool:', message.tool.name);
      return;
    }

    // 使用 ToolCallRenderer 渲染
    // 注意：将 message.id 设置到 tool.id，以便 ToolCallRenderer 正确追踪
    if (this.app?.toolCallRenderer) {
      const toolWithId = {
        ...message.tool,
        id: message.tool.id || message.id
      };
      this.app.toolCallRenderer.addToolCallMessage({
        tool: toolWithId,
        id: message.id,
        children: message.children
      });
    }
  }

  /**
   * 更新工具调用消息
   * @param {ToolCallMessage} message
   */
  updateToolCallMessage(message) {
    if (!message.tool) return;

    // 过滤不需要展示的工具调用
    if (this.isHiddenTool(message.tool.name)) {
      return;
    }

    if (this.app?.toolCallRenderer) {
      // 使用 tool.id 作为 key 查找（与 renderToolCall 一致）
      const toolId = message.tool.id || message.id;
      const toolCard = this.app.toolCallRenderer.getElement(toolId);
      
      console.log('[ChatPanel] updateToolCallMessage:', {
        messageId: message.id,
        toolId,
        hasCard: !!toolCard,
        state: message.tool.state
      });
      
      if (toolCard) {
        this.app.toolCallRenderer.updateToolCard(toolCard, message.tool);
      } else {
        // 如果找不到卡片，可能需要创建新的
        console.warn('[ChatPanel] Tool card not found for update, re-rendering:', toolId);
        this.renderToolCall(message);
      }
    }
  }

  /**
   * 渲染 Agent 事件消息
   * @param {AgentEventMessage} message
   */
  renderAgentEvent(message) {
    const container = this.elements.aiMessages;
    if (!container || !message.event) return;

    const event = message.event;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message system-event';
    msgDiv.dataset.messageId = message.id;

    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;

    let text = '';
    switch (event.type) {
      case 'switch':
        text = t('message.switchedToMode', { mode: event.mode }) || `已切换到 ${event.mode} 模式`;
        break;
      case 'message':
        text = event.message;
        break;
      case 'limit-reached':
        const time = event.endsAt ? new Date(event.endsAt * 1000).toLocaleTimeString() : '未知';
        text = t('message.usageLimitUntil', { time }) || `使用限制将在 ${time} 结束`;
        break;
      default:
        text = `[事件: ${event.type}]`;
    }

    msgDiv.textContent = text;
    container.appendChild(msgDiv);
  }

  /**
   * 渲染系统消息
   * @param {string} text 消息文本
   */
  renderSystemMessage(text) {
    const container = this.elements.aiMessages;
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message system';
    msgDiv.textContent = text;

    container.appendChild(msgDiv);
    this.smartScrollToBottom();
  }

  // ============ 兼容方法（保留旧 API）============

  /**
   * 添加 AI 消息到界面（兼容旧 API）
   * @param {string} role 角色 (user, assistant, system)
   * @param {string} content 内容
   * @param {Object} data 额外数据（可选）
   * @deprecated 请使用 renderMessage
   */
  addAIMessage(role, content, data = {}) {
    // 对于系统消息，直接渲染
    if (role === 'system') {
      this.renderSystemMessage(content);
      return;
    }

    // 如果有 kind 字段，说明已经是新格式，直接渲染
    if (data.kind) {
      this.renderMessage(data);
      return;
    }

    // 如果是工具调用消息，使用工具卡片渲染
    if (data.tool) {
      const { MessageTypes } = window;
      const toolMessage = MessageTypes.createToolCallMessage({
        id: data.messageId || `tool-${Date.now()}`,
        createdAt: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
        tool: data.tool,
        children: []
      });
      this.renderMessage(toolMessage);
      return;
    }

    // 转换为新格式
    const { MessageTypes } = window;
    const id = data.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();

    let message;
    if (role === 'user') {
      message = MessageTypes.createUserTextMessage({ id, createdAt, text: content });
    } else {
      message = MessageTypes.createAgentTextMessage({ id, createdAt, text: content });
    }

    this.renderMessage(message);
  }

  /**
   * 生成消息去重 key（兼容旧 API）
   * @deprecated
   */
  generateMessageKey(data) {
    if (data.role === 'user') {
      return `user-${data.text?.substring(0, 100) || ''}`;
    }
    if (data.messageId) {
      return data.messageId;
    }
    const timestamp = data.timestamp || '';
    return `${data.role || 'unknown'}-${data.text?.substring(0, 50) || ''}-${timestamp}`;
  }

  /**
   * 更新 Happy AI 事件状态
   * @param {string} status 状态 (idle, processing, ready)
   */
  updateHappyEventStatus(status) {
    this.happyEventStatus = status;
    
    if (status !== 'processing' && this.happyStatusTimeoutId) {
      clearTimeout(this.happyStatusTimeoutId);
      this.happyStatusTimeoutId = null;
    }
    
    const statusDot = this.elements.happyEventDot;
    const statusText = this.elements.happyEventText;
    
    // 使用统一的 status-dot + state-xxx 类名
    if (statusDot) {
      statusDot.className = 'status-dot';
      statusDot.classList.add(`state-${status}`);
    }
    
    if (statusText) {
      const statusLabels = {
        'idle': 'idle',
        'processing': 'processing...',
        'ready': 'ready',
        'disconnected': 'disconnected',
        'thinking': 'thinking...',
        'waiting': 'waiting...'
      };
      statusText.textContent = statusLabels[status] || status;
    }
    
    this.updateAbortButton(status);
    this.updateAISendButton();
    
    if (this.app) {
      this.app.happyEventStatus = status;
    }
  }

  /**
   * 更新中止按钮显示状态
   * @param {string} status 当前状态
   */
  updateAbortButton(status) {
    if (!this.elements.aiAbortBtn) return;
    
    const showAbort = status === 'processing' || status === 'thinking' || status === 'waiting';
    this.elements.aiAbortBtn.style.display = showAbort ? 'flex' : 'none';
  }

  /**
   * 处理消息列表滚动
   */
  handleMessagesScroll() {
    const container = this.elements.aiMessages;
    if (!container) return;
    
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    
    if (!isNearBottom) {
      this.isUserScrolling = true;
      
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }
      this.scrollTimeout = setTimeout(() => {
        this.isUserScrolling = false;
      }, 5000);
    } else {
      this.isUserScrolling = false;
    }
  }

  /**
   * 智能滚动到底部
   */
  smartScrollToBottom() {
    const container = this.elements.aiMessages;
    if (!container) return;
    
    if (this.isUserScrolling) return;
    
    container.scrollTop = container.scrollHeight;
  }

  /**
   * 查找安全的截断位置，避免破坏 Markdown 结构
   * @param {string} text 原始文本
   * @param {number} maxLength 最大长度
   * @returns {string} 截断后的文本
   */
  findSafeTruncationPoint(text, maxLength) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // 检查是否在代码块内
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }

    // 检查 maxLength 位置是否在代码块内
    const inCodeBlock = codeBlocks.find(block => 
      maxLength > block.start && maxLength < block.end
    );

    let truncateAt = maxLength;

    if (inCodeBlock) {
      // 如果在代码块内，截断到代码块开始之前
      truncateAt = inCodeBlock.start;
    }

    // 在截断位置附近寻找更好的断点
    const searchStart = Math.max(0, truncateAt - 200);
    const searchText = text.substring(searchStart, truncateAt);

    // 优先级：段落边界 > 列表项结束 > 句子结束 > 换行
    const breakpoints = [
      { pattern: /\n\n/g, priority: 4 },           // 段落边界
      { pattern: /\n[-*+] /g, priority: 3 },       // 无序列表项开始
      { pattern: /\n\d+\. /g, priority: 3 },       // 有序列表项开始
      { pattern: /[.!?。！？]\s/g, priority: 2 },  // 句子结束
      { pattern: /\n/g, priority: 1 }              // 普通换行
    ];

    let bestBreak = { pos: truncateAt, priority: 0 };

    for (const bp of breakpoints) {
      let m;
      while ((m = bp.pattern.exec(searchText)) !== null) {
        const absPos = searchStart + m.index + m[0].length;
        if (absPos <= truncateAt && bp.priority > bestBreak.priority) {
          bestBreak = { pos: absPos, priority: bp.priority };
        }
      }
    }

    // 如果找到了更好的断点，使用它
    if (bestBreak.priority > 0 && bestBreak.pos > maxLength * 0.5) {
      truncateAt = bestBreak.pos;
    }

    // 确保不会在单词中间截断
    const truncated = text.substring(0, truncateAt).trimEnd();
    
    return truncated;
  }

  /**
   * 渲染 Markdown
   * @param {string} text Markdown 文本
   * @returns {string} HTML
   */
  renderMarkdown(text) {
    if (!text) return '';
    
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(text);
      } catch (error) {
        console.error('[ChatPanel] Markdown parse error:', error);
        return this.escapeHtml(text);
      }
    }
    
    return this.escapeHtml(text);
  }

  /**
   * HTML 转义
   * @param {string} text 原始文本
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 高亮代码块
   * @param {HTMLElement} container 容器元素
   */
  highlightCodeBlocks(container) {
    if (typeof hljs === 'undefined') return;
    
    container.querySelectorAll('pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  }

  /**
   * 添加代码复制按钮
   * @param {HTMLElement} container 容器元素
   */
  addCopyButtons(container) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    container.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.copy-code-btn')) return;
      
      const code = pre.querySelector('code');
      if (!code) return;
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-code-btn';
      copyBtn.textContent = t('common.copy');
      copyBtn.title = t('chat.copyCode');
      
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); // 防止触发消息复制
        try {
          await navigator.clipboard.writeText(code.textContent);
          copyBtn.textContent = t('common.copied');
          setTimeout(() => {
            copyBtn.textContent = t('common.copy');
          }, 2000);
        } catch (error) {
          console.error('[ChatPanel] Copy failed:', error);
        }
      });
      
      pre.style.position = 'relative';
      pre.appendChild(copyBtn);
    });
  }

  /**
   * 为消息添加复制按钮
   * @param {HTMLElement} msgDiv 消息容器元素
   * @param {string} rawText 原始文本内容
   */
  addMessageCopyButton(msgDiv, rawText) {
    // 检查是否已存在复制按钮
    if (msgDiv.querySelector('.message-copy-btn')) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'message-copy-btn';
    copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
    copyBtn.title = t('chat.copyMessage');
    
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(rawText);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>`;
        }, 2000);
      } catch (error) {
        console.error('[ChatPanel] Message copy failed:', error);
      }
    });
    
    // 设置消息容器为相对定位
    msgDiv.style.position = 'relative';
    msgDiv.appendChild(copyBtn);
  }

  /**
   * 获取连接状态
   * @returns {boolean}
   */
  isConnected() {
    return this.aiConnected;
  }

  /**
   * 获取当前事件状态
   * @returns {string}
   */
  getEventStatus() {
    return this.happyEventStatus;
  }

  /**
   * 检查工具是否应该隐藏
   * @param {string} toolName 工具名称
   * @returns {boolean}
   */
  isHiddenTool(toolName) {
    return this.hiddenTools.includes(toolName);
  }

  // ===== 命令建议功能 =====

  /**
   * 处理输入变化
   * @param {Event} e 输入事件
   */
  handleInputChange(e) {
    const text = e.target.value;
    
    // 检测斜杠命令
    if (text.startsWith('/')) {
      this.showCommandSuggestions(text);
    } else {
      this.hideCommandSuggestions();
    }
  }

  /**
   * 显示命令建议
   * @param {string} query 查询文本
   */
  showCommandSuggestions(query) {
    if (!window.CommandSuggestions) {
      return;
    }
    
    const commands = window.CommandSuggestions.searchCommands(query, { limit: 5 });
    this.commandSuggestions = commands;
    
    if (commands.length === 0) {
      this.hideCommandSuggestions();
      return;
    }
    
    this.renderCommandSuggestions(commands);
    this.commandSuggestionsVisible = true;
    this.commandSuggestionsIndex = 0;
    this.updateCommandSuggestionsSelection();
  }

  /**
   * 隐藏命令建议
   */
  hideCommandSuggestions() {
    const container = document.getElementById('command-suggestions');
    if (container) {
      container.remove();
    }
    this.commandSuggestionsVisible = false;
    this.commandSuggestionsIndex = -1;
    this.commandSuggestions = [];
  }

  /**
   * 渲染命令建议下拉框
   * @param {Array} commands 命令列表
   */
  renderCommandSuggestions(commands) {
    // 移除已有的建议框
    let container = document.getElementById('command-suggestions');
    if (container) {
      container.remove();
    }
    
    // 创建建议框
    container = document.createElement('div');
    container.id = 'command-suggestions';
    container.className = 'command-suggestions';
    
    commands.forEach((cmd, index) => {
      const item = document.createElement('div');
      // 第一项默认选中
      item.className = index === 0 ? 'command-item selected' : 'command-item';
      item.dataset.index = index;
      
      item.innerHTML = `
        <span class="command-name">/${this.escapeHtml(cmd.command)}</span>
        <span class="command-desc">${this.escapeHtml(cmd.description || '')}</span>
      `;
      
      // 点击选择
      item.addEventListener('click', () => {
        this.selectCommandSuggestion(index);
      });
      
      // 鼠标悬停高亮
      item.addEventListener('mouseenter', () => {
        this.commandSuggestionsIndex = index;
        this.updateCommandSuggestionsSelection();
      });
      
      container.appendChild(item);
    });
    
    // 插入到输入框上方
    const inputContainer = this.elements.aiInput?.parentElement;
    if (inputContainer) {
      inputContainer.style.position = 'relative';
      inputContainer.appendChild(container);
    }
  }

  /**
   * 更新命令建议选中状态
   */
  updateCommandSuggestionsSelection() {
    const container = document.getElementById('command-suggestions');
    if (!container) {
      console.warn('[ChatPanel] command-suggestions container not found');
      return;
    }
    
    const items = container.querySelectorAll('.command-item');
    console.log('[ChatPanel] updateCommandSuggestionsSelection:', {
      index: this.commandSuggestionsIndex,
      itemCount: items.length
    });
    
    items.forEach((item, index) => {
      const shouldSelect = index === this.commandSuggestionsIndex;
      item.classList.toggle('selected', shouldSelect);
      if (shouldSelect) {
        console.log('[ChatPanel] Selected item:', index, item.className);
      }
    });
  }

  /**
   * 键盘导航命令建议
   * @param {number} direction 方向 (-1 上, 1 下)
   */
  navigateCommandSuggestions(direction) {
    if (this.commandSuggestions.length === 0) return;
    
    this.commandSuggestionsIndex += direction;
    
    // 循环导航
    if (this.commandSuggestionsIndex < 0) {
      this.commandSuggestionsIndex = this.commandSuggestions.length - 1;
    } else if (this.commandSuggestionsIndex >= this.commandSuggestions.length) {
      this.commandSuggestionsIndex = 0;
    }
    
    this.updateCommandSuggestionsSelection();
  }

  /**
   * 选择命令建议
   * @param {number} index 索引
   */
  selectCommandSuggestion(index) {
    const cmd = this.commandSuggestions[index];
    if (!cmd) return;
    
    // 设置输入框内容
    if (this.elements.aiInput) {
      this.elements.aiInput.value = `/${cmd.command}`;
      this.elements.aiInput.focus();
    }
    
    this.hideCommandSuggestions();
    this.updateAISendButton();
  }

  /**
   * 处理纯前端命令
   * @param {string} command 命令名
   * @param {string[]} args 参数
   */
  handleFrontendCommand(command, args) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    switch (command) {
      case 'help':
        this.showHelpMessage();
        break;
      default:
        this.renderSystemMessage(`${t('chat.unknownCommand')} /${command}`);
    }
  }

  /**
   * 显示帮助信息
   */
  showHelpMessage() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const commands = window.CommandSuggestions?.getAllCommands() || [];
    
    let helpText = `${t('chat.availableCommands')}\n\n`;
    commands.forEach(cmd => {
      helpText += `/${cmd.command} - ${cmd.description || t('chat.noDescription')}\n`;
    });
    
    this.renderSystemMessage(helpText);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ChatPanel = ChatPanel;
}
