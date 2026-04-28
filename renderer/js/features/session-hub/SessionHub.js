/**
 * SessionHub - 会话中心模块
 * 管理和监控所有活动 session，支持快速切换工作目录
 * 
 * @created 2026-01-25
 * @updated 2026-01-25 (UI升级：网格布局、终端风格预览、统计栏)
 * @module features/session-hub/SessionHub
 */

class SessionHub {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 状态
    this.isVisible = false;
    this.isLoading = false;
    this.sessions = [];
    this.currentSessionId = null;
    
    // 看板消息缓存 { sessionId: [{ role, text, timestamp }, ...] }
    this.sessionMessages = {};
    this.maxMessagesPerSession = 5;
    
    // DOM 元素
    this.elements = {};
    
    // 绑定方法上下文
    this.toggle = this.toggle.bind(this);
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleMessageAdded = this.handleMessageAdded.bind(this);
  }

  /**
   * 初始化
   */
  init() {
    this.bindElements();
    this.bindEvents();
    this.subscribeToStateUpdates();
    this.subscribeToMessageUpdates();
    this.subscribeToEventStatusUpdates();
    this.preloadSessionState();
    console.log('[SessionHub] Initialized');
  }

  /**
   * 预加载 session 状态
   * Electron: 直接调用 IPC 获取（瞬间）
   * Web: 通过 WebSocket 连接时推送获取，或降级到 HTTP API
   */
  async preloadSessionState() {
    try {
      if (window.appBridge?.getFormattedSessionState) {
        // Electron 版本：直接调用 IPC 获取
        console.log('[SessionHub] Preloading state (Electron IPC)...');
        const state = await window.appBridge.getFormattedSessionState();
        if (state?.sessions) {
          this.handleStateUpdated(state);
          this.isStateReady = true;
          console.log('[SessionHub] State preloaded (Electron):', state.sessions.length, 'sessions');
          
          // 预加载消息（看板用）
          await this.preloadSessionMessages(state.sessions);
        }
      }
      // Web 版本：依赖 WebSocket 连接时推送，无需额外操作
      // 如果 WebSocket 已连接，状态会通过 handleStateUpdated 自动更新
    } catch (error) {
      console.warn('[SessionHub] Preload failed:', error.message);
      // 预加载失败不影响后续操作，用户打开面板时会重新加载
    }
  }

  /**
   * 预加载各 session 的消息（看板用）
   * @param {Array} sessions session 列表
   */
  async preloadSessionMessages(sessions) {
    if (!sessions || sessions.length === 0) return;
    
    try {
      // 提取所有 session ID
      const sessionIds = sessions.map(s => s.sessionId).filter(Boolean);
      if (sessionIds.length === 0) return;
      
      let messagesData = null;
      
      if (window.appBridge?.getMultiSessionMessages) {
        // Electron 版本
        messagesData = await window.appBridge.getMultiSessionMessages(sessionIds, this.maxMessagesPerSession);
      } else if (window.apiAdapter?.request) {
        // Web 版本
        const response = await window.apiAdapter.request('getMultiSessionMessages', {
          sessionIds,
          limit: this.maxMessagesPerSession
        });
        if (response?.success) {
          messagesData = response.messages;
        }
      }
      
      if (messagesData) {
        // 缓存消息
        for (const [sessionId, data] of Object.entries(messagesData)) {
          if (data?.messages) {
            this.sessionMessages[sessionId] = data.messages;
          }
        }
        console.log('[SessionHub] Messages preloaded for', Object.keys(messagesData).length, 'sessions');
      }
    } catch (error) {
      console.warn('[SessionHub] Preload messages failed:', error.message);
    }
  }

  /**
   * 订阅 session 状态更新事件
   * 兼容 Electron 和 Web 版本
   */
  subscribeToStateUpdates() {
    // 绑定方法上下文
    this.handleStateUpdated = this.handleStateUpdated.bind(this);
    
    if (window.appBridge?.onSessionStateUpdated) {
      // Electron 版本：通过 IPC 监听
      this._unsubscribeState = window.appBridge.onSessionStateUpdated(this.handleStateUpdated);
      console.log('[SessionHub] Subscribed to state updates (Electron)');
    } else if (window.apiAdapter?.on) {
      // Web 版本：通过 WebSocket 监听
      window.apiAdapter.on('session:stateUpdated', this.handleStateUpdated);
      console.log('[SessionHub] Subscribed to state updates (Web)');
    }
  }

  /**
   * 订阅消息添加事件（看板实时更新）
   * 兼容 Electron 和 Web 版本
   */
  subscribeToMessageUpdates() {
    if (window.appBridge?.onMessageAdded) {
      // Electron 版本：通过 IPC 监听
      this._unsubscribeMessage = window.appBridge.onMessageAdded(this.handleMessageAdded);
      console.log('[SessionHub] Subscribed to message updates (Electron)');
    } else if (window.apiAdapter?.on) {
      // Web 版本：通过 WebSocket 监听
      window.apiAdapter.on('message:added', this.handleMessageAdded);
      console.log('[SessionHub] Subscribed to message updates (Web)');
    }
  }

  /**
   * 订阅 Happy AI 事件状态更新（processing/ready）
   * 用于实时更新当前 session 卡片的状态
   */
  subscribeToEventStatusUpdates() {
    // 绑定方法上下文
    this.handleEventStatusUpdated = this.handleEventStatusUpdated.bind(this);
    this.handleSessionStatusChanged = this.handleSessionStatusChanged.bind(this);
    
    if (window.appBridge?.onHappyEventStatus) {
      // Electron 版本：通过 IPC 监听 happy:eventStatus（当前 session 的状态）
      this._unsubscribeEventStatus = window.appBridge.onHappyEventStatus(this.handleEventStatusUpdated);
      console.log('[SessionHub] Subscribed to event status updates (Electron)');
    } else if (window.apiAdapter?.on) {
      // Web 版本：通过 WebSocket 监听
      window.apiAdapter.on('happy:eventStatus', this.handleEventStatusUpdated);
      console.log('[SessionHub] Subscribed to event status updates (Web)');
    }
    
    // 订阅单个 session 状态变化事件（所有 session，包括非当前的）
    if (window.appBridge?.onSessionStatusChanged) {
      // Electron 版本
      this._unsubscribeSessionStatus = window.appBridge.onSessionStatusChanged(this.handleSessionStatusChanged);
      console.log('[SessionHub] Subscribed to session status changes (Electron)');
    } else if (window.apiAdapter?.on) {
      // Web 版本
      window.apiAdapter.on('session:statusChanged', this.handleSessionStatusChanged);
      console.log('[SessionHub] Subscribed to session status changes (Web)');
    }
  }

  /**
   * 处理 Happy AI 事件状态变更（当前 session）
   * @param {Object} data { eventType, timestamp }
   */
  handleEventStatusUpdated(data) {
    if (!data?.eventType) return;
    
    const eventType = data.eventType;
    
    // 将事件类型映射为 session 状态
    let newStatus;
    if (eventType === 'processing' || eventType === 'thinking' || eventType === 'waiting') {
      newStatus = 'processing';
    } else if (eventType === 'ready' || eventType === 'idle') {
      newStatus = 'idle';
    } else {
      newStatus = eventType;
    }
    
    // 更新当前 session 的状态
    const currentSession = this.sessions.find(s => s.isCurrent);
    if (currentSession) {
      const oldStatus = currentSession.status;
      currentSession.status = newStatus;
      
      // 如果面板可见且状态变化了，更新 UI
      if (this.isVisible && oldStatus !== newStatus) {
        this.updateSessionCardStatus(currentSession.sessionId, newStatus);
      }
    }
  }

  /**
   * 处理单个 session 状态变化（所有 session，包括非当前的）
   * @param {Object} data { sessionId, name, status, timestamp }
   */
  handleSessionStatusChanged(data) {
    if (!data?.sessionId || !data?.status) return;
    
    const { sessionId, status } = data;
    
    // 更新 sessions 数组中对应 session 的状态
    const session = this.sessions.find(s => s.sessionId === sessionId);
    if (session) {
      const oldStatus = session.status;
      session.status = status;
      
      // 如果面板可见且状态变化了，更新 UI
      if (this.isVisible && oldStatus !== status) {
        this.updateSessionCardStatus(sessionId, status);
      }
    }
  }

  /**
   * 增量更新指定 session 卡片的状态（避免重新渲染整个列表）
   * @param {string} sessionId session ID
   * @param {string} newStatus 新状态
   */
  updateSessionCardStatus(sessionId, newStatus) {
    const card = this.elements.list?.querySelector(`.session-card[data-session-id="${sessionId}"]`);
    if (!card) return;
    
    const t = this.getTranslator();
    const statusClass = this.getStatusClass(newStatus);
    const statusText = t(`sessionHub.status.${newStatus}`) || newStatus;
    const isProcessing = statusClass === 'processing';
    
    // 更新状态点样式
    const statusDot = card.querySelector('.session-card-status-dot');
    if (statusDot) {
      statusDot.className = `session-card-status-dot ${statusClass}`;
    }
    
    // 更新状态文本
    const statusTextEl = card.querySelector('.session-card-status-text');
    if (statusTextEl) {
      statusTextEl.textContent = statusText;
    }
    
    // 更新 footer 的"AI 正在回复"提示
    const footer = card.querySelector('.session-card-footer');
    if (footer) {
      const existingTyping = footer.querySelector('.session-card-typing');
      if (isProcessing && !existingTyping) {
        // 添加"AI 正在回复"提示
        const typingHtml = `
          <span class="session-card-typing">
            <span class="session-card-typing-dot"></span>
            ${t('sessionHub.aiReplying')}
          </span>
        `;
        footer.insertAdjacentHTML('beforeend', typingHtml);
      } else if (!isProcessing && existingTyping) {
        // 移除"AI 正在回复"提示
        existingTyping.remove();
      }
    }
    
    // 更新统计栏
    this.updateStats();
  }

  /**
   * 处理消息添加事件
   * @param {Object} data { sessionId, message: { role, text, timestamp } }
   */
  handleMessageAdded(data) {
    if (!data?.sessionId || !data?.message) return;
    
    const { sessionId, message } = data;
    
    // 初始化该 session 的消息数组
    if (!this.sessionMessages[sessionId]) {
      this.sessionMessages[sessionId] = [];
    }
    
    // 追加消息
    this.sessionMessages[sessionId].push(message);
    
    // 限制消息数量
    if (this.sessionMessages[sessionId].length > this.maxMessagesPerSession) {
      this.sessionMessages[sessionId] = this.sessionMessages[sessionId].slice(-this.maxMessagesPerSession);
    }
    
    // 如果面板可见，增量更新对应卡片的消息区
    if (this.isVisible) {
      this.updateCardMessages(sessionId);
    }
  }

  /**
   * 增量更新指定卡片的消息区（终端风格）
   * @param {string} sessionId session ID
   */
  updateCardMessages(sessionId) {
    const card = this.elements.list?.querySelector(`.session-card[data-session-id="${sessionId}"]`);
    if (!card) return;
    
    const terminalBody = card.querySelector('.terminal-body');
    if (!terminalBody) return;
    
    const messages = this.sessionMessages[sessionId] || [];
    const t = this.getTranslator();
    
    if (messages.length === 0) {
      terminalBody.innerHTML = `<div class="terminal-empty">$ ${t('sessionHub.noMessages')}</div>`;
    } else {
      terminalBody.innerHTML = messages.map(msg => this.renderTerminalLine(msg)).join('');
      // 滚动到底部
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  /**
   * 处理实时状态更新
   * @param {Object} state 状态数据 { currentSession, sessions, updatedAt }
   */
  handleStateUpdated(state) {
    if (!state?.sessions) return;
    
    console.log('[SessionHub] State updated:', state.sessions.length, 'sessions');
    
    // 更新内部状态
    this.sessions = state.sessions;
    this.currentSessionId = state.currentSession;
    this.isStateReady = true;
    
    // 如果面板可见，立即刷新 UI
    if (this.isVisible) {
      this.renderSessionList();
    }
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      toggleBtn: document.getElementById('session-hub-btn'),
      panel: document.getElementById('session-hub-panel'),
      closeBtn: document.getElementById('session-hub-close-btn'),
      newDirBtn: document.getElementById('session-hub-new-dir-btn'),
      list: document.getElementById('session-hub-list'),
      // 新增元素
      stats: document.getElementById('session-hub-stats'),
      footer: document.getElementById('session-hub-footer'),
      totalCount: document.getElementById('session-hub-total-count'),
      searchInput: document.getElementById('session-hub-search-input'),
      statIdle: document.getElementById('stat-idle'),
      statProcessing: document.getElementById('stat-processing')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 切换按钮
    this.elements.toggleBtn?.addEventListener('click', this.toggle);
    
    // 关闭按钮
    this.elements.closeBtn?.addEventListener('click', this.hide);
    
    // 新目录按钮
    this.elements.newDirBtn?.addEventListener('click', () => this.openNewDirectory());
    
    // ESC 键关闭
    document.addEventListener('keydown', this.handleKeyDown);
    
    // 视图切换按钮
    const viewToggleBtns = this.elements.panel?.querySelectorAll('.view-toggle-btn');
    viewToggleBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        viewToggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // 视图切换功能暂不实现，仅切换样式
      });
    });
    
    // 搜索功能（暂不实现）
    // this.elements.searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
  }

  /**
   * 处理键盘事件
   * @param {KeyboardEvent} e 
   */
  handleKeyDown(e) {
    if (e.key === 'Escape' && this.isVisible) {
      e.preventDefault();
      this.hide();
    }
  }

  /**
   * 切换面板显示状态
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 显示面板
   */
  async show() {
    if (this.isVisible || !this.elements.panel) return;
    
    this.isVisible = true;
    this.elements.panel.style.display = 'flex';
    this.elements.panel.classList.remove('closing');
    this.elements.toggleBtn?.classList.add('active');
    
    // 优先使用缓存数据（瞬间显示）
    if (this.isStateReady && this.sessions.length > 0) {
      console.log('[SessionHub] Using cached state, rendering immediately');
      this.renderSessionList();
    } else {
      // 缓存为空，通过 API 加载（降级方案）
      console.log('[SessionHub] No cached state, loading via API');
      await this.loadSessions();
    }
  }

  /**
   * 隐藏面板
   */
  hide() {
    if (!this.isVisible || !this.elements.panel) return;
    
    this.elements.panel.classList.add('closing');
    this.elements.toggleBtn?.classList.remove('active');
    
    // 等待动画完成后隐藏
    setTimeout(() => {
      if (this.elements.panel) {
        this.elements.panel.style.display = 'none';
        this.elements.panel.classList.remove('closing');
      }
      this.isVisible = false;
    }, 200);
  }

  /**
   * 加载 session 列表
   * 首次加载或手动刷新时调用，通过 HTTP API 获取数据
   */
  async loadSessions() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.renderLoading();
    
    try {
      // 获取所有 sessions（API 返回 { success, sessions: { name: {...} } }）
      const response = await window.appBridge?.getAllSessions?.();
      
      // 处理响应数据
      let sessions = [];
      let currentSession = null;
      
      if (response) {
        // 如果已经是数组格式（实时更新推送的格式）
        if (Array.isArray(response)) {
          sessions = response;
        } 
        // 如果是 API 响应格式 { success, sessions: {...} }
        else if (response.sessions) {
          const sessionsObj = response.sessions;
          currentSession = response.currentSession;
          
          // 转换对象为数组格式
          sessions = Object.entries(sessionsObj).map(([name, session]) => ({
            name,
            sessionId: session.sessionId,
            workspaceDir: session.workDir,
            status: this.mapStatus(session.status),
            createdAt: session.createdAt,
            pid: session.pid,
            isCurrent: name === currentSession
          }));
        }
      }
      
      if (sessions.length > 0) {
        this.sessions = sessions;
        this.currentSessionId = currentSession || this.app?.currentSessionId || null;
        this.renderSessionList();
      } else {
        this.sessions = [];
        this.renderEmpty();
        this.updateStats();
        this.updateFooter();
      }
    } catch (error) {
      console.error('[SessionHub] Load sessions failed:', error);
      this.sessions = [];
      this.renderError(error.message);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 映射 session 状态为前端友好的状态值
   * @param {string} status 原始状态
   * @returns {string} 映射后的状态
   */
  mapStatus(status) {
    const statusMap = {
      'active': 'idle',
      'processing': 'processing',
      'connected': 'connected',
      'disconnected': 'disconnected'
    };
    return statusMap[status] || status || 'idle';
  }

  /**
   * 渲染加载状态
   */
  renderLoading() {
    const t = this.getTranslator();
    
    if (this.elements.list) {
      this.elements.list.innerHTML = `
        <div class="session-hub-loading">
          <div class="loading-spinner"></div>
          <p>${t('sessionHub.loading')}</p>
        </div>
      `;
    }
  }

  /**
   * 渲染空状态
   */
  renderEmpty() {
    const t = this.getTranslator();
    
    if (this.elements.list) {
      this.elements.list.innerHTML = `
        <div class="session-hub-empty">
          <span class="session-hub-empty-icon">
            <svg viewBox="0 0 24 24">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
            </svg>
          </span>
          <p>${t('sessionHub.noSessions')}</p>
        </div>
      `;
    }
  }

  /**
   * 渲染错误状态
   * @param {string} message 错误信息
   */
  renderError(message) {
    const t = this.getTranslator();
    
    if (this.elements.list) {
      this.elements.list.innerHTML = `
        <div class="session-hub-empty">
          <span class="session-hub-empty-icon">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" x2="12" y1="8" y2="12"/>
              <line x1="12" x2="12.01" y1="16" y2="16"/>
            </svg>
          </span>
          <p>${message || t('errors.loadFailed')}</p>
        </div>
      `;
    }
  }

  /**
   * 更新统计栏
   */
  updateStats() {
    if (!this.elements.stats) return;
    
    // 统计各状态数量（只统计空闲和处理中）
    const counts = {
      idle: 0,
      processing: 0
    };
    
    this.sessions.forEach(session => {
      const status = this.getStatusClass(session.status);
      if (status === 'processing') {
        counts.processing++;
      } else {
        // 其他状态（idle, connected, disconnected）都归为空闲
        counts.idle++;
      }
    });
    
    // 更新 DOM
    if (this.elements.statIdle) {
      const countEl = this.elements.statIdle.querySelector('.count');
      if (countEl) countEl.textContent = counts.idle;
    }
    if (this.elements.statProcessing) {
      const countEl = this.elements.statProcessing.querySelector('.count');
      if (countEl) countEl.textContent = counts.processing;
    }
  }

  /**
   * 更新 Footer
   */
  updateFooter() {
    if (this.elements.totalCount) {
      this.elements.totalCount.textContent = this.sessions.length;
    }
  }

  /**
   * 渲染 session 列表
   */
  renderSessionList() {
    if (!this.elements.list) return;
    
    // 更新统计栏和 Footer
    this.updateStats();
    this.updateFooter();
    
    if (this.sessions.length === 0) {
      this.renderEmpty();
      return;
    }
    
    const t = this.getTranslator();
    const html = this.sessions.map((session, index) => this.renderSessionCard(session, t, index)).join('');
    this.elements.list.innerHTML = html;
    
    // 绑定卡片点击事件
    this.bindCardEvents();
  }

  /**
   * 渲染单个 session 卡片（看板模式 - 终端风格）
   * @param {Object} session session 数据
   * @param {Function} t 翻译函数
   * @param {number} index 索引，用于动画延迟
   * @returns {string} HTML 字符串
   */
  renderSessionCard(session, t, index = 0) {
    // 优先使用后端提供的 isCurrent 字段（权威数据）
    const isCurrent = session.isCurrent !== undefined 
        ? session.isCurrent 
        : (session.name === this.currentSessionId || 
           session.workspaceDir === this.app?.workspaceSettings?.getWorkspaceDir?.());
    const statusClass = this.getStatusClass(session.status);
    const normalizedStatus = session.status || 'idle';
    const statusText = t(`sessionHub.status.${normalizedStatus}`) || normalizedStatus;
    const isProcessing = statusClass === 'processing';
    
    // 格式化路径显示
    const displayName = this.getDisplayName(session.workspaceDir || session.name || 'Unknown');
    const fullPath = session.workspaceDir || session.name || '';
    
    // 获取该 session 的消息预览
    const messages = this.sessionMessages[session.sessionId] || [];
    const msgCount = messages.length;
    
    // 终端内容
    const terminalContent = messages.length > 0 
      ? messages.map(msg => this.renderTerminalLine(msg, isProcessing)).join('')
      : `<div class="terminal-empty">$ ${t('sessionHub.noMessages')}</div>`;
    
    // 动画延迟
    const animDelay = (index * 0.05).toFixed(2);
    
    return `
      <div class="session-card ${isCurrent ? 'current' : ''}" 
           data-session-id="${this.escapeHtml(session.sessionId || '')}"
           data-workspace-dir="${this.escapeHtml(fullPath)}"
           style="animation-delay: ${animDelay}s;">
        <!-- Card Header -->
        <div class="session-card-header">
          <div class="session-card-title">
            <div class="session-card-meta">
              ${isCurrent ? `<span class="session-card-current-badge">${t('sessionHub.currentSession')}</span>` : ''}
              <div class="session-card-status">
                <span class="session-card-status-dot ${statusClass}"></span>
                <span class="session-card-status-text">${this.escapeHtml(statusText)}</span>
              </div>
            </div>
            <h3 class="session-card-path" title="${this.escapeHtml(fullPath)}">${this.escapeHtml(displayName)}</h3>
            <p class="session-card-fullpath" title="${this.escapeHtml(fullPath)}">${this.escapeHtml(fullPath)}</p>
          </div>
          <div class="session-card-actions">
            ${!isCurrent ? `
              <button class="switch-btn" title="${t('sessionHub.switchTo')}">
                <svg viewBox="0 0 24 24"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                ${t('sessionHub.switchTo')}
              </button>
            ` : ''}
          </div>
        </div>
        
        <!-- Terminal Preview -->
        <div class="terminal-preview">
          <div class="terminal-header">
            <div class="terminal-dot red"></div>
            <div class="terminal-dot yellow"></div>
            <div class="terminal-dot green"></div>
            <span class="terminal-title">${t('sessionHub.terminalTitle')}</span>
          </div>
          <div class="terminal-body">
            ${terminalContent}
          </div>
        </div>
        
        <!-- Card Footer -->
        <div class="session-card-footer">
          <span class="session-card-msg-count">${msgCount} ${t('sessionHub.messagesUnit')}</span>
          ${isProcessing ? `
            <span class="session-card-typing">
              <span class="session-card-typing-dot"></span>
              ${t('sessionHub.aiReplying')}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 渲染终端行（消息预览）
   * @param {Object} msg 消息对象 { role, text, timestamp }
   * @param {boolean} isLastProcessing 是否是最后一条且正在处理
   * @returns {string} HTML 字符串
   */
  renderTerminalLine(msg, isLastProcessing = false) {
    const isUser = msg.role === 'user';
    const roleClass = isUser ? 'user' : 'assistant';
    // 用户消息用 →，AI 完成消息用 ✓，AI 处理中用 ⋯
    let prefix = '→';
    if (!isUser) {
      prefix = isLastProcessing ? '⋯' : '✓';
    }
    const text = this.escapeHtml(msg.text || '');
    
    return `
      <div class="terminal-line ${roleClass}">
        <span class="prefix">${prefix}</span>
        <span class="content">${text}</span>
      </div>
    `;
  }

  /**
   * 获取显示名称（目录名）
   * @param {string} fullPath 完整路径
   * @returns {string}
   */
  getDisplayName(fullPath) {
    if (!fullPath) return 'Unknown';
    
    // 统一路径分隔符
    const normalized = fullPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(p => p);
    
    // 取最后一级目录名
    return parts[parts.length - 1] || 'Unknown';
  }

  /**
   * 绑定卡片事件（切换按钮）
   */
  bindCardEvents() {
    // 绑定切换按钮点击事件
    const switchBtns = this.elements.list?.querySelectorAll('.switch-btn');
    switchBtns?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const card = btn.closest('.session-card');
        if (!card) return;
        
        const sessionId = card.dataset.sessionId;
        const workspaceDir = card.dataset.workspaceDir;
        
        this.switchToSession(sessionId, workspaceDir);
      });
    });
  }

  /**
   * 切换到指定 session
   * @param {string} sessionId session ID
   * @param {string} workspaceDir 工作目录路径
   */
  async switchToSession(sessionId, workspaceDir) {
    if (!workspaceDir) {
      console.warn('[SessionHub] No workspace dir for session:', sessionId);
      return;
    }
    
    const t = this.getTranslator();
    
    // 显示加载遮罩
    this.app?.showLoadingOverlay?.(t('notifications.switchingWorkDir') || '正在切换工作目录...');
    
    try {
      // 调用 switchWorkDir 来切换目录
      const result = await window.appBridge?.switchWorkDir?.(workspaceDir);
      
      if (result?.success) {
        // 更新状态栏工作目录显示
        this.app?.updateStatusBarWorkspace?.(workspaceDir);
        
        // 同步更新 WorkspaceSettings 模块的状态和 UI
        if (this.app?.workspaceSettings) {
          this.app.workspaceSettings.workspaceDir = workspaceDir;
          if (this.app.workspaceSettings.elements?.workspaceDirInput) {
            this.app.workspaceSettings.elements.workspaceDirInput.value = workspaceDir;
          }
        }
        
        // 重置文件面板状态并刷新
        if (this.app) {
          this.app.workspaceRoot = null;
          this.app.currentFilePath = null;
          this.app.filePathHistory = [];
          await this.app.initFilesPanel?.();
        }
        
        // 清空对话框并重新加载新目录的对话历史
        this.app?.clearAIMessages?.();
        await this.app?.loadHappyMessageHistory?.();
        
        this.app?.showNotification?.(t('notifications.workspaceDirSet'), 'success');
        
        // 展开展示区（保持对话模式）
        this.app?.expandDisplayPanel?.();
        
        // 关闭面板
        this.hide();
      } else {
        this.app?.showNotification?.(result?.error || t('notifications.operationFailed'), 'error');
      }
    } catch (error) {
      console.error('[SessionHub] Switch session failed:', error);
      this.app?.showNotification?.(t('notifications.operationFailed') + ': ' + error.message, 'error');
    } finally {
      this.app?.hideLoadingOverlay?.();
    }
  }

  /**
   * 打开新工作目录
   */
  async openNewDirectory() {
    const t = this.getTranslator();
    
    try {
      // 调用选择目录对话框
      const result = await window.appBridge?.selectWorkspaceDir?.();
      
      if (result?.success && result.path) {
        // 显示加载遮罩
        this.app?.showLoadingOverlay?.(t('notifications.switchingWorkDir') || '正在切换工作目录...');
        
        try {
          // 调用 switchWorkDir 来实际切换目录
          const switchResult = await window.appBridge?.switchWorkDir?.(result.path);
          
          if (switchResult?.success) {
            // 更新状态栏工作目录显示
            this.app?.updateStatusBarWorkspace?.(result.path);
            
            // 同步更新 WorkspaceSettings 模块的状态和 UI
            if (this.app?.workspaceSettings) {
              this.app.workspaceSettings.workspaceDir = result.path;
              if (this.app.workspaceSettings.elements?.workspaceDirInput) {
                this.app.workspaceSettings.elements.workspaceDirInput.value = result.path;
              }
            }
            
            // 重置文件面板状态并刷新
            if (this.app) {
              this.app.workspaceRoot = null;
              this.app.currentFilePath = null;
              this.app.filePathHistory = [];
              await this.app.initFilesPanel?.();
            }
            
            // 清空对话框并重新加载新目录的对话历史
            this.app?.clearAIMessages?.();
            await this.app?.loadHappyMessageHistory?.();
            
            this.app?.showNotification?.(t('notifications.workspaceDirSet'), 'success');
            
            // 展开展示区（保持对话模式）
            this.app?.expandDisplayPanel?.();
            
            // 关闭面板
            this.hide();
          } else {
            this.app?.showNotification?.(switchResult?.error || t('notifications.operationFailed'), 'error');
          }
        } finally {
          this.app?.hideLoadingOverlay?.();
        }
      } else if (result?.cancelled) {
        // 用户取消，不做任何处理
      } else {
        this.app?.showNotification?.(result?.error || t('notifications.operationFailed'), 'error');
      }
    } catch (error) {
      console.error('[SessionHub] Open new directory failed:', error);
      this.app?.hideLoadingOverlay?.();
      this.app?.showNotification?.(t('notifications.operationFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 获取状态 CSS 类名
   * @param {string} status 状态
   * @returns {string}
   */
  getStatusClass(status) {
    const statusMap = {
      'idle': 'idle',
      'processing': 'processing',
      'connected': 'connected',
      'disconnected': 'disconnected',
      'thinking': 'processing',
      'waiting': 'processing'
    };
    return statusMap[status] || 'idle';
  }

  /**
   * 格式化路径显示（兼容方法）
   * @param {string} fullPath 完整路径
   * @returns {string}
   */
  formatPath(fullPath) {
    if (!fullPath) return 'Unknown';
    
    // 统一路径分隔符
    const normalized = fullPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(p => p);
    
    // 取最后两级
    if (parts.length <= 2) {
      return parts.join('/');
    }
    return '.../' + parts.slice(-2).join('/');
  }

  /**
   * 格式化 session 信息
   * @param {Object} session session 数据
   * @returns {string}
   */
  formatSessionInfo(session) {
    const t = this.getTranslator();
    const parts = [];
    
    if (session.messageCount) {
      parts.push(`${session.messageCount} ${t('sessionHub.messagesUnit')}`);
    }
    
    if (session.lastActiveAt) {
      const time = new Date(session.lastActiveAt);
      const now = new Date();
      const diff = now - time;
      
      if (diff < 60000) {
        parts.push(t('sessionHub.time.justNow'));
      } else if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        parts.push(t('sessionHub.time.minutesAgo').replace('{count}', mins));
      } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        parts.push(t('sessionHub.time.hoursAgo').replace('{count}', hours));
      } else {
        parts.push(time.toLocaleDateString());
      }
    }
    
    return parts.join(' · ') || '';
  }

  /**
   * 渲染消息预览条目（兼容旧方法）
   * @param {Object} msg 消息对象 { role, text, timestamp }
   * @returns {string} HTML 字符串
   */
  renderPreviewMessage(msg) {
    return this.renderTerminalLine(msg);
  }

  /**
   * 获取翻译函数
   * @returns {Function}
   */
  getTranslator() {
    return typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
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
   * 销毁模块
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);
    
    // 取消订阅状态更新事件
    if (this._unsubscribeState) {
      this._unsubscribeState();
      this._unsubscribeState = null;
    }
    
    // 取消订阅消息更新事件
    if (this._unsubscribeMessage) {
      this._unsubscribeMessage();
      this._unsubscribeMessage = null;
    }
    
    // 取消订阅事件状态更新
    if (this._unsubscribeEventStatus) {
      this._unsubscribeEventStatus();
      this._unsubscribeEventStatus = null;
    }
    
    // 取消订阅单个 session 状态变化
    if (this._unsubscribeSessionStatus) {
      this._unsubscribeSessionStatus();
      this._unsubscribeSessionStatus = null;
    }
    
    this.elements = {};
    this.sessions = [];
    this.sessionMessages = {};
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.SessionHub = SessionHub;
}
