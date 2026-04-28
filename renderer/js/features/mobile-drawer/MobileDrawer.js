/**
 * MobileDrawer - 移动版侧边栏抽屉管理器
 * 用于在移动端展开/收起各面板的侧边栏内容
 * 创建时间: 2026-01-25
 */

class MobileDrawer {
  constructor(options = {}) {
    this.app = options.app || null;
    this.isVisible = false;
    this.currentDrawer = null; // 当前打开的抽屉 ID
    this.currentSide = 'right'; // 当前抽屉方向
    
    // 抽屉配置
    this.drawerConfigs = {
      files: {
        title: 'sidebar.files',
        side: 'right',
        contentSelector: '#files-list-pane',
        icon: '<svg viewBox="0 0 24 24"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>'
      },
      settings: {
        title: 'settings.title',
        side: 'right',
        contentSelector: '.settings-nav',
        icon: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
      }
    };
    
    // DOM 元素
    this.elements = {
      overlay: null,
      drawer: null,
      header: null,
      content: null,
      closeBtn: null
    };
    
    // 初始化
    this.init();
  }

  /**
   * 初始化
   */
  init() {
    this.createDrawerElements();
    this.bindEvents();
  }

  /**
   * 创建抽屉 DOM 元素
   */
  createDrawerElements() {
    // 创建遮罩层
    this.elements.overlay = document.createElement('div');
    this.elements.overlay.className = 'mobile-drawer-overlay';
    this.elements.overlay.id = 'mobile-drawer-overlay';
    
    // 创建抽屉容器
    this.elements.drawer = document.createElement('div');
    this.elements.drawer.className = 'mobile-drawer drawer-right';
    this.elements.drawer.id = 'mobile-drawer';
    
    // 创建抽屉头部
    this.elements.header = document.createElement('div');
    this.elements.header.className = 'mobile-drawer-header';
    this.elements.header.innerHTML = `
      <h3 class="mobile-drawer-title"></h3>
      <button class="mobile-drawer-close" id="mobile-drawer-close">&times;</button>
    `;
    
    // 创建内容区
    this.elements.content = document.createElement('div');
    this.elements.content.className = 'mobile-drawer-content';
    this.elements.content.id = 'mobile-drawer-content';
    
    // 组装抽屉
    this.elements.drawer.appendChild(this.elements.header);
    this.elements.drawer.appendChild(this.elements.content);
    
    // 添加到页面
    document.body.appendChild(this.elements.overlay);
    document.body.appendChild(this.elements.drawer);
    
    // 缓存关闭按钮
    this.elements.closeBtn = this.elements.header.querySelector('.mobile-drawer-close');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 遮罩点击关闭
    this.elements.overlay?.addEventListener('click', () => this.hide());
    
    // 关闭按钮点击
    this.elements.closeBtn?.addEventListener('click', () => this.hide());
    
    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
    
    // 绑定所有抽屉切换按钮
    document.querySelectorAll('.mobile-drawer-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawerId = btn.dataset.drawer;
        const side = btn.dataset.drawerSide || 'right';
        this.toggle(drawerId, side);
      });
    });
  }

  /**
   * 显示抽屉
   * @param {string} drawerId - 抽屉 ID (files, settings)
   * @param {string} [side='right'] - 抽屉方向
   */
  show(drawerId, side = 'right') {
    const config = this.drawerConfigs[drawerId];
    if (!config) {
      console.warn(`[MobileDrawer] Unknown drawer: ${drawerId}`);
      return;
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 更新抽屉方向
    this.currentSide = config.side || side;
    this.elements.drawer.classList.remove('drawer-left', 'drawer-right');
    this.elements.drawer.classList.add(`drawer-${this.currentSide}`);
    
    // 更新标题
    const titleEl = this.elements.header.querySelector('.mobile-drawer-title');
    if (titleEl) {
      titleEl.textContent = t(config.title);
    }
    
    // 克隆并插入内容
    this.populateContent(config.contentSelector);
    
    // 显示遮罩和抽屉
    this.elements.overlay.classList.add('visible');
    
    // 使用 requestAnimationFrame 确保过渡动画生效
    requestAnimationFrame(() => {
      this.elements.drawer.classList.add('open');
    });
    
    this.isVisible = true;
    this.currentDrawer = drawerId;
    
    // 更新切换按钮状态
    this.updateToggleButtonState(drawerId, true);
  }

  /**
   * 隐藏抽屉
   */
  hide() {
    if (!this.isVisible) return;
    
    // 移除打开状态
    this.elements.drawer.classList.remove('open');
    
    // 等待动画完成后隐藏遮罩
    setTimeout(() => {
      this.elements.overlay.classList.remove('visible');
      // 清空内容
      this.elements.content.innerHTML = '';
      this.isVisible = false;
      
      // 更新切换按钮状态
      if (this.currentDrawer) {
        this.updateToggleButtonState(this.currentDrawer, false);
      }
      this.currentDrawer = null;
    }, 300);
  }

  /**
   * 切换抽屉状态
   * @param {string} drawerId - 抽屉 ID
   * @param {string} [side='right'] - 抽屉方向
   */
  toggle(drawerId, side = 'right') {
    if (this.isVisible && this.currentDrawer === drawerId) {
      this.hide();
    } else {
      // 如果打开了其他抽屉，先关闭
      if (this.isVisible) {
        this.hide();
        setTimeout(() => this.show(drawerId, side), 350);
      } else {
        this.show(drawerId, side);
      }
    }
  }

  /**
   * 填充抽屉内容
   * @param {string} selector - 源内容选择器
   */
  populateContent(selector) {
    const sourceEl = document.querySelector(selector);
    if (!sourceEl) {
      console.warn(`[MobileDrawer] Source element not found: ${selector}`);
      return;
    }
    
    // 克隆内容
    const clone = sourceEl.cloneNode(true);
    
    // 移除 ID 避免重复（保留原始元素用于桌面版）
    clone.removeAttribute('id');
    
    // 添加抽屉内容类，用于覆盖移动端的隐藏样式
    clone.classList.add('mobile-drawer-cloned-content');
    
    // 设置内联样式确保显示（使用 cssText 来覆盖 CSS 规则）
    clone.style.cssText = 'display: flex !important; flex-direction: column; width: 100%; height: 100%; border: none; background: transparent; overflow-y: auto;';
    
    // 清空并添加内容
    this.elements.content.innerHTML = '';
    this.elements.content.appendChild(clone);
    
    // 为克隆的导航项重新绑定点击事件
    this.rebindContentEvents(clone, selector);
  }

  /**
   * 为抽屉内容重新绑定事件
   * @param {HTMLElement} container - 内容容器
   * @param {string} sourceSelector - 源选择器
   */
  rebindContentEvents(container, sourceSelector) {
    // 设置面板导航项
    if (sourceSelector === '.settings-nav') {
      container.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          const sectionId = item.dataset.section;
          if (sectionId && this.app) {
            // 更新原始导航项状态
            document.querySelectorAll('.settings-nav-item').forEach(navItem => {
              navItem.classList.toggle('active', navItem.dataset.section === sectionId);
            });
            // 也更新克隆的导航项状态
            container.querySelectorAll('.settings-nav-item').forEach(navItem => {
              navItem.classList.toggle('active', navItem.dataset.section === sectionId);
            });
            // 切换设置分区
            this.app.switchSettingsSection(sectionId);
            // 关闭抽屉
            this.hide();
          }
        });
      });
    }
    
    // 文件列表项
    if (sourceSelector === '#files-list-pane') {
      // 文件列表的事件会由 FilesPanel 处理
      // 这里主要处理面包屑导航等
      container.querySelectorAll('.breadcrumb-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const path = item.dataset.path;
          if (path && this.app) {
            this.app.loadFiles(path);
            this.hide();
          }
        });
      });
      
      // 文件项点击
      container.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
          const path = item.dataset.path;
          const isDir = item.dataset.isDir === 'true';
          if (this.app) {
            if (isDir) {
              this.app.loadFiles(path);
            } else {
              // 使用正确的方法打开文件预览
              this.app.openFilePreview(path);
            }
            this.hide();
          }
        });
      });
    }
    
  }

  /**
   * 更新切换按钮状态
   * @param {string} drawerId - 抽屉 ID
   * @param {boolean} active - 是否激活
   */
  updateToggleButtonState(drawerId, active) {
    document.querySelectorAll(`.mobile-drawer-toggle[data-drawer="${drawerId}"]`).forEach(btn => {
      btn.classList.toggle('active', active);
    });
  }

  /**
   * 销毁抽屉
   */
  destroy() {
    this.elements.overlay?.remove();
    this.elements.drawer?.remove();
    this.elements = {};
    this.isVisible = false;
    this.currentDrawer = null;
  }
}

// 导出到全局
window.MobileDrawer = MobileDrawer;
