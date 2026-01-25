/**
 * SessionHub - 会话中心模块
 * 管理和监控所有活动 session，支持快速切换工作目录
 * 
 * @created 2026-01-25
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
    
    // DOM 元素
    this.elements = {};
    
    // 绑定方法上下文
    this.toggle = this.toggle.bind(this);
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * 初始化
   */
  init() {
    this.bindElements();
    this.bindEvents();
    console.log('[SessionHub] Initialized');
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
      list: document.getElementById('session-hub-list')
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
    
    // 加载 session 列表
    await this.loadSessions();
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
   */
  async loadSessions() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.renderLoading();
    
    try {
      // 获取所有 sessions
      const sessions = await window.browserControlManager?.getAllSessions?.();
      
      if (sessions && Array.isArray(sessions)) {
        this.sessions = sessions;
        
        // 获取当前 session ID
        this.currentSessionId = this.app?.currentSessionId || null;
        
        this.renderSessionList();
      } else {
        // 无数据或 API 不支持
        this.sessions = [];
        this.renderEmpty();
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
   * 渲染 session 列表
   */
  renderSessionList() {
    if (!this.elements.list) return;
    
    if (this.sessions.length === 0) {
      this.renderEmpty();
      return;
    }
    
    const t = this.getTranslator();
    const html = this.sessions.map(session => this.renderSessionCard(session, t)).join('');
    this.elements.list.innerHTML = html;
    
    // 绑定卡片点击事件
    this.bindCardEvents();
  }

  /**
   * 渲染单个 session 卡片
   * @param {Object} session session 数据
   * @param {Function} t 翻译函数
   * @returns {string} HTML 字符串
   */
  renderSessionCard(session, t) {
    const isCurrent = session.sessionId === this.currentSessionId || 
                      session.workspaceDir === this.app?.workspaceSettings?.getWorkspaceDir?.();
    const statusClass = this.getStatusClass(session.status);
    const statusText = t(`sessionHub.status.${session.status}`) || session.status || 'idle';
    
    // 格式化路径显示（截取最后两级目录）
    const displayPath = this.formatPath(session.workspaceDir || session.name || 'Unknown');
    
    return `
      <div class="session-card ${isCurrent ? 'current' : ''}" 
           data-session-id="${this.escapeHtml(session.sessionId || '')}"
           data-workspace-dir="${this.escapeHtml(session.workspaceDir || '')}">
        <div class="session-card-header">
          <span class="session-card-path" title="${this.escapeHtml(session.workspaceDir || '')}">${this.escapeHtml(displayPath)}</span>
          <div class="session-card-status">
            <span class="session-card-status-dot ${statusClass}"></span>
            <span class="session-card-status-text">${this.escapeHtml(statusText)}</span>
          </div>
        </div>
        <div class="session-card-body">
          <span class="session-card-info">${this.formatSessionInfo(session)}</span>
          ${isCurrent ? `<span class="session-card-badge">${t('sessionHub.currentSession')}</span>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * 绑定卡片点击事件
   */
  bindCardEvents() {
    const cards = this.elements.list?.querySelectorAll('.session-card');
    cards?.forEach(card => {
      card.addEventListener('click', () => {
        const sessionId = card.dataset.sessionId;
        const workspaceDir = card.dataset.workspaceDir;
        
        // 如果是当前 session，不做任何操作
        if (card.classList.contains('current')) {
          return;
        }
        
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
      const result = await window.browserControlManager?.switchWorkDir?.(workspaceDir);
      
      if (result?.success) {
        // 更新状态栏工作目录显示
        this.app?.updateStatusBarWorkspace?.(workspaceDir);
        
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
      const result = await window.browserControlManager?.selectWorkspaceDir?.();
      
      if (result?.success && result.path) {
        // 显示加载遮罩
        this.app?.showLoadingOverlay?.(t('notifications.switchingWorkDir') || '正在切换工作目录...');
        
        try {
          // 调用 switchWorkDir 来实际切换目录
          const switchResult = await window.browserControlManager?.switchWorkDir?.(result.path);
          
          if (switchResult?.success) {
            // 更新状态栏工作目录显示
            this.app?.updateStatusBarWorkspace?.(result.path);
            
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
   * 格式化路径显示
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
    const parts = [];
    
    if (session.messageCount) {
      parts.push(`${session.messageCount} messages`);
    }
    
    if (session.lastActiveAt) {
      const time = new Date(session.lastActiveAt);
      const now = new Date();
      const diff = now - time;
      
      if (diff < 60000) {
        parts.push('just now');
      } else if (diff < 3600000) {
        parts.push(`${Math.floor(diff / 60000)}m ago`);
      } else if (diff < 86400000) {
        parts.push(`${Math.floor(diff / 3600000)}h ago`);
      } else {
        parts.push(time.toLocaleDateString());
      }
    }
    
    return parts.join(' · ') || '';
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
    this.elements = {};
    this.sessions = [];
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.SessionHub = SessionHub;
}
