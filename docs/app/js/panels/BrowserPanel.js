/**
 * BrowserPanel - 浏览器面板模块
 * 管理浏览器标签页列表的 UI 渲染
 * 
 * 数据获取和业务逻辑委托给 BrowserControlModule
 * 
 * @created 2026-01-16
 * @updated 2026-01-18 - 重构为左右分栏布局，卡片式展示
 * @module panels/BrowserPanel
 */

class BrowserPanel {
  /**
   * 构造函数
   * @param {Object} app 主应用实例引用
   */
  constructor(app) {
    this.app = app;
    
    // 标签页数据
    this.tabs = [];
    
    // 刷新节流
    this._lastTabsRefresh = 0;
    this._tabsRefreshThrottleMs = 2000;
    
    // 分栏布局状态
    this.menuWidth = parseInt(localStorage.getItem('browser-menu-width')) || 180;
    this.isResizing = false;
    this.activeView = 'tabs'; // 当前激活的视图
    
    // Three.js 背景实例
    this.browserBackground = null;
    
    // DOM 元素
    this.elements = {};
  }

  /**
   * 初始化面板
   */
  init() {
    this.bindElements();
    this.bindEvents();
    this.initResizer();
    this.applyMenuWidth();
    
    // 设置初始状态为空状态（但不启动动画，因为面板可能不可见）
    this._setInitialState();
  }
  
  /**
   * 设置初始状态（不启动动画）
   */
  _setInitialState() {
    // 初始状态：隐藏加载和内容，显示空状态，Three.js 背景始终显示
    if (this.elements.loadingOverlay) this.elements.loadingOverlay.style.display = 'none';
    if (this.elements.browserContentContainer) this.elements.browserContentContainer.style.display = 'none';
    if (this.elements.noTabsMessage) this.elements.noTabsMessage.style.display = 'flex';
    if (this.elements.browserThreejsBg) this.elements.browserThreejsBg.style.display = 'block';
  }
  
  /**
   * 面板激活时调用（由 app.js 调用）
   * 延迟初始化 Three.js 背景，确保容器尺寸正确
   */
  onPanelActivate() {
    // 首次激活时初始化 Three.js 背景
    if (!this.browserBackground) {
      this.initBrowserBackground();
    }
    
    // 更新尺寸并始终启动动画（Three.js 背景始终显示）
    if (this.browserBackground) {
      this.browserBackground.onResize();
      this.browserBackground.start();
    }
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 分栏布局元素
      browserSplitContainer: document.getElementById('browser-split-container'),
      browserDisplayPane: document.getElementById('browser-display-pane'),
      browserMenuPane: document.getElementById('browser-menu-pane'),
      browserResizer: document.getElementById('browser-resizer'),
      
      // Three.js 背景
      browserThreejsBg: document.getElementById('browser-threejs-bg'),
      
      // 内容容器
      browserContentContainer: document.getElementById('browser-content-container'),
      tabsGrid: document.getElementById('tabs-grid'),
      
      // 状态元素
      noTabsMessage: document.getElementById('no-tabs-message'),
      loadingOverlay: document.getElementById('loading-overlay'),
      
      // 菜单元素
      refreshBtn: document.getElementById('refresh-tabs-btn'),
      tabsCountBadge: document.getElementById('tabs-count-badge'),
      
      // 菜单项
      menuItems: document.querySelectorAll('.browser-menu-item')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 刷新按钮
    this.elements.refreshBtn?.addEventListener('click', () => this.refreshTabs(true));
    
    // 菜单项点击
    this.elements.menuItems?.forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (view) {
          this.switchView(view);
        }
      });
    });
  }

  /**
   * 初始化拖拽调整宽度
   */
  initResizer() {
    const resizer = this.elements.browserResizer;
    const container = this.elements.browserSplitContainer;
    if (!resizer || !container) return;
    
    let startX = 0;
    let startWidth = 0;
    
    const onMouseDown = (e) => {
      e.preventDefault();
      this.isResizing = true;
      const menuPane = this.elements.browserMenuPane;
      startX = e.clientX;
      startWidth = menuPane?.offsetWidth || 0;
      
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = (e) => {
      if (!this.isResizing) return;
      
      // 由于使用 row-reverse，鼠标向左移动应该增加宽度
      const delta = startX - e.clientX;
      let newWidth = startWidth + delta;
      
      const containerWidth = container.offsetWidth;
      const minWidth = 140;
      const maxWidth = Math.min(280, Math.floor(containerWidth * 0.35));
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      this.menuWidth = newWidth;
      this.applyMenuWidth();
    };
    
    const onMouseUp = () => {
      this.isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      localStorage.setItem('browser-menu-width', this.menuWidth.toString());
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    resizer.addEventListener('mousedown', onMouseDown);
  }

  /**
   * 应用菜单栏宽度
   */
  applyMenuWidth() {
    const menuPane = this.elements.browserMenuPane;
    if (!menuPane) return;
    
    menuPane.style.flex = `0 0 ${this.menuWidth}px`;
  }

  /**
   * 初始化 Three.js 背景
   */
  initBrowserBackground() {
    const container = this.elements.browserThreejsBg;
    if (!container) {
      console.warn('[BrowserPanel] Browser background container not found');
      return;
    }
    
    if (typeof PreviewBackground !== 'undefined') {
      this.browserBackground = new PreviewBackground({ container });
      this.browserBackground.init();
      console.log('[BrowserPanel] Browser background initialized');
    } else {
      console.warn('[BrowserPanel] PreviewBackground class not available');
    }
  }

  /**
   * 切换视图
   * @param {string} view 视图名称
   */
  switchView(view) {
    this.activeView = view;
    
    // 更新菜单项激活状态
    this.elements.menuItems?.forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    
    // 根据视图显示内容
    if (view === 'tabs') {
      this.refreshTabs(false);
    }
  }

  /**
   * 刷新标签页列表
   * @param {boolean} force 是否强制刷新
   */
  async refreshTabs(force = false) {
    // 节流检查：防止频繁切换面板时重复请求
    const now = Date.now();
    if (!force && (now - this._lastTabsRefresh) < this._tabsRefreshThrottleMs) {
      console.log('[BrowserPanel] Throttled, skipping refresh');
      // 节流时确保面板有内容显示（至少显示空状态）
      this._ensureBrowserPanelContent();
      return;
    }
    this._lastTabsRefresh = now;
    
    try {
      if (this.elements.refreshBtn) this.elements.refreshBtn.disabled = true;
      
      // 显示加载状态
      this.showLoadingState();
      
      // 获取标签页列表（通过 BrowserControlModule）
      console.log('[BrowserPanel] Fetching tabs via BrowserControlModule...');
      
      let tabs = [];
      try {
        tabs = await this.app?.browserControlModule?.getTabs?.(force) || [];
      } catch (apiError) {
        console.error('[BrowserPanel] API call error:', apiError);
        throw apiError;
      }
      
      this.tabs = tabs;
      console.log('[BrowserPanel] Received tabs count:', tabs.length);
      
      // 更新标签页数量徽章
      this.updateTabsCountBadge(tabs.length);
      
      if (tabs.length > 0) {
        this.renderBrowserTabs(tabs);
        this.showContentState();
      } else {
        console.log('[BrowserPanel] No tabs found, showing empty message');
        this.showEmptyState();
      }
      
      // 更新扩展连接状态
      await this.app?.browserControlModule?.refreshExtensionConnections?.();
    } catch (error) {
      console.error('[BrowserPanel] Failed to refresh tabs:', error);
      this.showEmptyState();
    } finally {
      setTimeout(() => {
        if (this.elements.refreshBtn) this.elements.refreshBtn.disabled = false;
      }, 500);
    }
  }

  /**
   * 显示加载状态
   */
  showLoadingState() {
    if (this.elements.loadingOverlay) this.elements.loadingOverlay.style.display = 'flex';
    if (this.elements.browserContentContainer) this.elements.browserContentContainer.style.display = 'none';
    if (this.elements.noTabsMessage) this.elements.noTabsMessage.style.display = 'none';
    // Three.js 背景始终显示
    if (this.elements.browserThreejsBg) this.elements.browserThreejsBg.style.display = 'block';
    if (this.browserBackground) this.browserBackground.start();
  }

  /**
   * 显示内容状态
   */
  showContentState() {
    if (this.elements.loadingOverlay) this.elements.loadingOverlay.style.display = 'none';
    if (this.elements.browserContentContainer) this.elements.browserContentContainer.style.display = 'block';
    if (this.elements.noTabsMessage) this.elements.noTabsMessage.style.display = 'none';
    // Three.js 背景始终显示（作为卡片列表的背景）
    if (this.elements.browserThreejsBg) this.elements.browserThreejsBg.style.display = 'block';
    if (this.browserBackground) this.browserBackground.start();
  }

  /**
   * 显示空状态
   */
  showEmptyState() {
    if (this.elements.loadingOverlay) this.elements.loadingOverlay.style.display = 'none';
    if (this.elements.browserContentContainer) this.elements.browserContentContainer.style.display = 'none';
    if (this.elements.noTabsMessage) this.elements.noTabsMessage.style.display = 'flex';
    // Three.js 背景始终显示
    if (this.elements.browserThreejsBg) this.elements.browserThreejsBg.style.display = 'block';
    if (this.browserBackground) this.browserBackground.start();
  }

  /**
   * 更新标签页数量徽章
   * @param {number} count 数量
   */
  updateTabsCountBadge(count) {
    if (this.elements.tabsCountBadge) {
      this.elements.tabsCountBadge.textContent = count;
    }
  }

  /**
   * 确保浏览器面板有内容显示（节流时调用）
   * 如果标签页列表为空且空状态消息未显示，则显示空状态
   */
  _ensureBrowserPanelContent() {
    // 隐藏加载状态
    if (this.elements.loadingOverlay) this.elements.loadingOverlay.style.display = 'none';
    
    // 如果标签页列表为空且空状态未显示，显示空状态
    if (this.tabs.length === 0) {
      this.showEmptyState();
    } else {
      this.showContentState();
    }
  }

  /**
   * 显示浏览器面板空状态（服务器未运行或无标签页时）
   */
  _showBrowserEmptyState() {
    this.showEmptyState();
    console.log('[BrowserPanel] Browser panel showing empty state');
  }

  /**
   * 渲染浏览器标签页列表（卡片式布局）
   * @param {Array} tabs 标签页列表
   */
  renderBrowserTabs(tabs) {
    console.log('[BrowserPanel] Rendering', tabs.length, 'tabs as cards');
    
    if (!this.elements.tabsGrid) {
      console.error('[BrowserPanel] tabs-grid element not found!');
      return;
    }
    
    this.elements.tabsGrid.innerHTML = '';
    
    tabs.forEach((tab) => {
      const isActive = tab.is_active;
      const statusClass = tab.status === 'complete' ? 'complete' : 'loading';
      
      const tabCard = document.createElement('div');
      tabCard.className = `glass-card tab-card${isActive ? ' active' : ''}`;
      tabCard.dataset.tabId = tab.id;
      
      // 使用 i18n 获取翻译
      const t = (key) => window.I18nManager?.t(key) || key;
      
      tabCard.innerHTML = `
        <div class="tab-card-header">
          <div class="tab-card-icon">
            ${tab.favicon_url 
              ? `<img src="${tab.favicon_url}" alt="" onerror="this.parentElement.innerHTML='<span class=\\'tab-icon-fallback\\'>🌐</span>'">`
              : '<span class="tab-icon-fallback">🌐</span>'
            }
            <span class="tab-card-title" title="${this.escapeHtml(tab.title)}">${this.escapeHtml(tab.title || 'Untitled')}</span>
          </div>
          <span class="tab-card-status ${statusClass}" title="${tab.status || 'unknown'}"></span>
        </div>
        
        <div class="tab-card-url" title="${this.escapeHtml(tab.url)}">${this.escapeHtml(tab.url || '')}</div>
        
        <div class="tab-card-info">
          <div class="tab-card-info-item">${t('browser.tabId')}: ${tab.id}</div>
          <div class="tab-card-info-item">${t('browser.tabWindow')}: ${tab.window_id || '-'}</div>
          <div class="tab-card-info-item">${t('browser.tabIndex')}: ${tab.index_in_window ?? '-'}</div>
          <div class="tab-card-info-item">${t('browser.tabStatus')}: ${tab.status || '-'}</div>
        </div>
        
        <div class="tab-card-actions">
          <button class="tab-action-btn danger" data-action="close">${t('browser.closeTab')}</button>
        </div>
      `;
      
      // 绑定关闭按钮事件
      tabCard.querySelector('.tab-action-btn[data-action="close"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
      
      this.elements.tabsGrid.appendChild(tabCard);
    });
    
    console.log('[BrowserPanel] Finished rendering', tabs.length, 'tab cards');
  }

  /**
   * 获取标签页 HTML
   * @param {string|number} tabId 标签页 ID
   */
  async getTabHtml(tabId) {
    const t = (key) => window.I18nManager?.t(key) || key;
    try {
      const result = await (window.apiAdapter || window.browserControlManager)?.getTabHtml?.(tabId);
      if (result?.success) {
        this.app?.showNotification?.(t('browser.htmlRequestSent'), 'success');
      }
    } catch (error) {
      console.error('[BrowserPanel] Failed to get tab HTML:', error);
      this.app?.showNotification?.(t('browser.htmlRequestFailed'), 'error');
    }
  }

  /**
   * 获取标签页 Cookies
   * @param {string|number} tabId 标签页 ID
   */
  async getTabCookies(tabId) {
    const t = (key) => window.I18nManager?.t(key) || key;
    try {
      const result = await (window.apiAdapter || window.browserControlManager)?.getTabCookies?.(tabId);
      if (result?.success) {
        this.app?.showNotification?.(t('browser.cookiesRequestSent'), 'success');
      }
    } catch (error) {
      console.error('[BrowserPanel] Failed to get tab cookies:', error);
      this.app?.showNotification?.(t('browser.cookiesRequestFailed'), 'error');
    }
  }

  /**
   * 关闭标签页
   * @param {string|number} tabId 标签页 ID
   */
  async closeTab(tabId) {
    try {
      await this.app?.browserControlModule?.closeTab?.(tabId);
      await this.refreshTabs(true); // 关闭后强制刷新
    } catch (error) {
      console.error('[BrowserPanel] Failed to close tab:', error);
    }
  }

  /**
   * 保存 Cookies 到数据库
   * @param {string|number} tabId 标签页 ID
   */
  async saveCookies(tabId) {
    const t = (key) => window.I18nManager?.t(key) || key;
    try {
      const result = await (window.apiAdapter || window.browserControlManager)?.saveCookies?.(tabId);
      if (result?.success) {
        this.app?.showNotification?.(t('browser.saveCookiesSuccess'), 'success');
      }
    } catch (error) {
      console.error('[BrowserPanel] Failed to save cookies:', error);
      this.app?.showNotification?.(t('browser.saveCookiesFailed'), 'error');
    }
  }

  /**
   * 显示已保存的 Cookies
   * @param {string|number} tabId 标签页 ID
   */
  async showSavedCookies(tabId) {
    try {
      // 获取标签页信息以获取 URL
      const tab = this.tabs.find(t => t.id == tabId);
      if (!tab) return;
      
      await (window.apiAdapter || window.browserControlManager)?.showSavedCookies?.(tabId, tab.url);
    } catch (error) {
      console.error('[BrowserPanel] Failed to show saved cookies:', error);
    }
  }

  /**
   * 显示注入脚本弹窗
   * @param {string|number} tabId 标签页 ID
   */
  showInjectScriptModal(tabId) {
    try {
      (window.apiAdapter || window.browserControlManager)?.showInjectScriptModal?.(tabId);
    } catch (error) {
      console.error('[BrowserPanel] Failed to show inject script modal:', error);
    }
  }

  /**
   * HTML 转义
   * @param {string} text 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 获取标签页数量
   * @returns {number}
   */
  getTabCount() {
    return this.tabs.length;
  }

  /**
   * 获取所有标签页
   * @returns {Array}
   */
  getTabs() {
    return [...this.tabs];
  }

  /**
   * 销毁面板
   */
  destroy() {
    if (this.browserBackground) {
      this.browserBackground.destroy();
      this.browserBackground = null;
    }
    
    console.log('[BrowserPanel] Destroyed');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.BrowserPanel = BrowserPanel;
}
