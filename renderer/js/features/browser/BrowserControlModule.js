/**
 * BrowserControlModule - 浏览器控制主模块
 * 管理服务器状态、扩展连接和浏览器标签页
 * 
 * @created 2026-01-16
 * @module features/browser/BrowserControlModule
 */

class BrowserControlModule {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {Object} options.app 主应用实例引用
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 服务实例
    this.extensionService = new ExtensionService(this);
    this.serverService = new ServerService(this);
    
    // 标签页数据
    this.tabs = [];
    
    // 节流控制
    this._lastTabsRefresh = 0;
    this._tabsRefreshThrottleMs = 2000;
    
    // 事件取消订阅函数
    this.unsubscribers = [];
    
    // DOM 元素引用
    this.elements = {};
  }

  /**
   * 初始化模块
   */
  async init() {
    this.bindElements();
    this.setupEventListeners();
    
    // 启动扩展轮询
    this.extensionService.startPoll();
    
    console.log('[BrowserControlModule] Initialized');
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 状态栏元素
      serverStatus: document.getElementById('server-status'),
      serverStatusDot: document.getElementById('server-status-dot'),
      serverStatusValue: document.getElementById('server-status-value'),
      
      // 设置面板 - 服务器状态区块
      serverPanelBadge: document.getElementById('server-panel-badge'),
      serverHttpPort: document.getElementById('server-http-port'),
      serverWsPort: document.getElementById('server-ws-port'),
      serverExtCount: document.getElementById('server-ext-count')
    };
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 检查运行模式 - 使用更可靠的检测方法
    // 1. 如果 apiAdapter 已初始化且是 web 模式
    // 2. 或者 browserControlManager 不存在
    // 3. 或者 browserControlManager.onServerStatusChanged 不是函数（polyfill 不完整）
    const isWebMode = window.apiAdapter?.getMode() === 'web' ||
                      typeof window.browserControlManager === 'undefined' ||
                      typeof window.browserControlManager?.onServerStatusChanged !== 'function';
    
    if (isWebMode) {
      console.log('[BrowserControlModule] Running in Web mode, using ApiAdapter');
      this.setupWebModeListeners();
      return;
    }

    // Electron 模式：监听服务器状态变化
    const unsubStatus = window.browserControlManager.onServerStatusChanged((data) => {
      console.log('[BrowserControlModule] Server status changed:', data);
      this.handleServerStatusChanged(data);
    });
    this.unsubscribers.push(unsubStatus);

    // 监听服务器日志
    const unsubLog = window.browserControlManager.onServerLog((log) => {
      // 委托给 app 层处理日志显示
      this.app?.appendLog?.(log);
    });
    this.unsubscribers.push(unsubLog);

    // 监听视图加载完成
    const unsubViewLoaded = window.browserControlManager.onViewLoaded?.((data) => {
      console.log('[BrowserControlModule] Management UI loaded:', data);
      this.app?.hideLoadingOverlay?.();
    });
    if (unsubViewLoaded) this.unsubscribers.push(unsubViewLoaded);

    // 监听视图加载失败
    const unsubViewFailed = window.browserControlManager.onViewLoadFailed?.((data) => {
      console.error('[BrowserControlModule] Management UI load failed:', data);
      this.app?.showLoadingError?.(data.errorDescription);
    });
    if (unsubViewFailed) this.unsubscribers.push(unsubViewFailed);
  }

  /**
   * Web 模式下的事件监听设置
   */
  setupWebModeListeners() {
    // 初始获取服务器状态
    this.fetchWebModeStatus();
    
    // 定期轮询状态（每 5 秒）
    this._webModeStatusInterval = setInterval(() => {
      this.fetchWebModeStatus();
    }, 5000);
    
    // 监听 WebSocket 事件（如果可用）
    if (window.apiAdapter) {
      window.apiAdapter.on('server:status', (data) => {
        console.log('[BrowserControlModule] WebSocket status update:', data);
        this.handleServerStatusChanged(data);
      });
    }
  }

  /**
   * Web 模式下获取服务器状态
   */
  async fetchWebModeStatus() {
    if (!window.apiAdapter || !window.apiAdapter.isConnected()) {
      // 未连接时显示停止状态
      this.updateServerStatusDisplay({ running: false });
      return;
    }
    
    try {
      const result = await window.apiAdapter.call('getServerStatus');
      console.log('[BrowserControlModule] Web mode status result:', result);
      
      // 处理 API 响应格式：{ success: true, status: {...} }
      const status = result?.status || result;
      
      if (status) {
        this.handleServerStatusChanged({
          running: status.running !== undefined ? status.running : true,
          httpPort: status.httpPort || 3333,
          wsPort: status.wsPort || 8080,
          extensionConnections: status.extensionConnections || 0
        });
      }
    } catch (error) {
      console.warn('[BrowserControlModule] Failed to fetch status:', error);
      this.updateServerStatusDisplay({ running: false, error: true });
    }
  }

  /**
   * 处理服务器状态变化
   * @param {Object} status 状态数据
   */
  handleServerStatusChanged(status) {
    // 更新服务状态
    this.serverService.updateStatus(status);
    
    // 更新 UI
    this.updateServerStatusDisplay(status);
    
    // 如果状态中包含扩展连接数，同步更新
    if (status.extensionConnections !== undefined) {
      this.extensionService.setCount(status.extensionConnections);
      this.updateExtensionDisplay();
    }
  }

  /**
   * 更新服务器状态显示
   * @param {Object} status 状态数据
   */
  updateServerStatusDisplay(status) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const dotEl = this.elements.serverStatusDot;
    const valueEl = this.elements.serverStatusValue;
    const panelBadge = this.elements.serverPanelBadge;
    
    // 重置状态圆点类
    if (dotEl) {
      dotEl.className = 'status-dot';
    }
    
    // 如果 status 为 null 或 undefined，显示停止状态
    if (!status) {
      if (valueEl) {
        valueEl.textContent = t('status.stopped');
        valueEl.className = 'status-value';
      }
      if (dotEl) dotEl.classList.add('state-stopped');
      if (panelBadge) {
        panelBadge.textContent = t('settings.stopped');
        panelBadge.className = 'env-badge error';
      }
      return;
    }
    
    // 更新底部状态栏 + 设置面板服务器状态
    if (status.restarting) {
      if (valueEl) {
        valueEl.textContent = t('status.restarting');
        valueEl.className = 'status-value';
      }
      if (dotEl) dotEl.classList.add('state-starting');
      // 更新设置面板徽章
      if (panelBadge) {
        panelBadge.textContent = t('status.restarting');
        panelBadge.className = 'env-badge warning';
      }
    } else if (status.running) {
      if (valueEl) {
        valueEl.textContent = t('status.running');
        valueEl.className = 'status-value';
      }
      if (dotEl) dotEl.classList.add('state-running');
      this.app?.hideLoadingOverlay?.();
      // 更新设置面板徽章
      if (panelBadge) {
        panelBadge.textContent = t('settings.running');
        panelBadge.className = 'env-badge installed';
      }
      // 更新端口信息
      this.updateServerPortsDisplay(status);
    } else if (status.error) {
      if (valueEl) {
        valueEl.textContent = t('status.error');
        valueEl.className = 'status-value';
      }
      if (dotEl) dotEl.classList.add('state-error');
      // 更新设置面板徽章
      if (panelBadge) {
        panelBadge.textContent = t('status.error');
        panelBadge.className = 'env-badge error';
      }
    } else {
      if (valueEl) {
        valueEl.textContent = t('status.stopped');
        valueEl.className = 'status-value';
      }
      if (dotEl) dotEl.classList.add('state-stopped');
      // 更新设置面板徽章
      if (panelBadge) {
        panelBadge.textContent = t('settings.stopped');
        panelBadge.className = 'env-badge error';
      }
    }
  }
  
  /**
   * 更新服务器端口显示
   * @param {Object} status 状态数据
   */
  updateServerPortsDisplay(status) {
    // 从配置或状态中获取端口
    const httpPort = status.httpPort || 3333;
    const wsPort = status.wsPort || 8080;
    
    if (this.elements.serverHttpPort) {
      this.elements.serverHttpPort.textContent = `:${httpPort}`;
    }
    if (this.elements.serverWsPort) {
      this.elements.serverWsPort.textContent = `:${wsPort}`;
    }
  }

  /**
   * 扩展连接数变化回调（由 ExtensionService 调用）
   * @param {number} connections 连接数
   */
  onExtensionConnectionsChanged(connections) {
    this.updateExtensionDisplay();
  }

  /**
   * 更新扩展连接显示
   */
  updateExtensionDisplay() {
    const connections = this.extensionService.getCount();
    
    // 更新设置面板中的扩展连接数
    if (this.elements.serverExtCount) {
      this.elements.serverExtCount.textContent = connections;
      // 根据连接数更新样式
      if (connections > 0) {
        this.elements.serverExtCount.classList.add('running');
        this.elements.serverExtCount.classList.remove('stopped');
      } else {
        this.elements.serverExtCount.classList.remove('running');
        this.elements.serverExtCount.classList.add('stopped');
      }
    }
  }

  // ============ 对外 API ============

  /**
   * 获取服务器状态
   * @returns {Object}
   */
  getServerStatus() {
    return this.serverService.getCurrentStatus();
  }

  /**
   * 检查服务器是否运行中
   * @returns {boolean}
   */
  isServerRunning() {
    return this.serverService.isRunning();
  }

  /**
   * 获取扩展连接数
   * @returns {number}
   */
  getExtensionCount() {
    return this.extensionService.getCount();
  }

  /**
   * 刷新扩展连接数
   * @returns {Promise<number>}
   */
  async refreshExtensionConnections() {
    return await this.extensionService.fetchConnections();
  }

  /**
   * 重启服务器
   * @returns {Promise<void>}
   */
  async restartServer() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      this.app?.showLoadingOverlay?.(t('notifications.restartingServer'));
      await this.serverService.restart();
    } catch (error) {
      this.app?.showLoadingError?.(t('notifications.restartFailed') + ': ' + error.message);
      throw error;
    }
  }

  /**
   * 刷新管理视图
   * @returns {Promise<void>}
   */
  async refreshView() {
    await this.serverService.refreshView();
  }

  /**
   * 切换开发者工具
   * @returns {Promise<void>}
   */
  async toggleDevTools() {
    await this.serverService.toggleDevTools();
  }

  /**
   * 获取服务器日志
   * @param {number} count 日志数量
   * @returns {Promise<Array>}
   */
  async getServerLogs(count = 100) {
    return await this.serverService.getLogs(count);
  }

  /**
   * 检查初始状态
   * @returns {Promise<Object>} 状态对象
   */
  async checkInitialStatus() {
    const status = await this.serverService.getStatus();
    this.updateServerStatusDisplay(status);
    
    // 加载历史日志
    const logs = await this.getServerLogs(100);
    // 确保 logs 是数组
    if (Array.isArray(logs)) {
      logs.forEach(log => this.app?.appendLog?.(log, false));
      this.app?.scrollLogsToBottom?.();
    }
    
    // 获取扩展连接数
    await this.refreshExtensionConnections();
    
    return status;
  }

  // ============ 标签页管理 ============

  /**
   * 获取浏览器标签页列表
   * @param {boolean} force 是否强制刷新
   * @returns {Promise<Array>}
   */
  async getTabs(force = false) {
    // 节流检查
    const now = Date.now();
    if (!force && (now - this._lastTabsRefresh) < this._tabsRefreshThrottleMs) {
      console.log('[BrowserControlModule] getTabs throttled');
      return this.tabs;
    }
    this._lastTabsRefresh = now;
    
    try {
      const result = await window.browserControlManager?.getTabs?.();
      
      // 兼容多种返回格式
      let tabs = [];
      if (result) {
        if (result.tabs && Array.isArray(result.tabs)) {
          tabs = result.tabs;
        } else if (Array.isArray(result)) {
          tabs = result;
        }
      }
      
      this.tabs = tabs;
      return tabs;
    } catch (error) {
      console.error('[BrowserControlModule] Failed to get tabs:', error);
      return this.tabs;
    }
  }

  /**
   * 关闭标签页
   * @param {string|number} tabId 标签页 ID
   * @returns {Promise<void>}
   */
  async closeTab(tabId) {
    try {
      await window.browserControlManager?.closeTab?.(tabId);
    } catch (error) {
      console.error('[BrowserControlModule] Failed to close tab:', error);
      throw error;
    }
  }

  /**
   * 获取缓存的标签页列表（同步）
   * @returns {Array}
   */
  getCachedTabs() {
    return [...this.tabs];
  }

  /**
   * 销毁模块
   */
  destroy() {
    // 停止扩展轮询
    this.extensionService.destroy();
    this.serverService.destroy();
    
    // 取消所有事件订阅
    this.unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    this.unsubscribers = [];
    
    console.log('[BrowserControlModule] Destroyed');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.BrowserControlModule = BrowserControlModule;
}
