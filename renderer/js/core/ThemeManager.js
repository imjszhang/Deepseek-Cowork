/**
 * ThemeManager - 主题管理模块
 * 支持浅色/深色/跟随系统三种模式
 * 
 * [暂时修改] 当前强制使用深色模式，其他模式已禁用
 * 
 * @created 2026-01-16
 * @module core/ThemeManager
 */

const ThemeManager = {
  STORAGE_KEY: 'bcm-theme',
  THEMES: ['light', 'dark', 'system'],
  
  // 当前主题模式 ('light' | 'dark' | 'system')
  // [暂时修改] 强制使用深色模式
  currentMode: 'dark',
  
  // 实际应用的主题 ('light' | 'dark')
  // [暂时修改] 强制使用深色模式
  appliedTheme: 'dark',
  
  // 系统主题媒体查询
  mediaQuery: null,
  
  /**
   * 初始化主题管理器
   */
  init() {
    // 设置媒体查询
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // [暂时禁用] 读取保存的主题偏好，强制使用深色模式
    // const saved = localStorage.getItem(this.STORAGE_KEY);
    // if (saved && this.THEMES.includes(saved)) {
    //   this.currentMode = saved;
    // } else {
    //   this.currentMode = 'system';
    // }
    this.currentMode = 'dark';  // 强制深色模式
    
    // 应用主题
    this.applyTheme();
    
    // [暂时禁用] 监听系统主题变化
    // this.watchSystem();
    
    console.log('[ThemeManager] 初始化完成，当前模式:', this.currentMode);
  },
  
  /**
   * 设置主题模式
   * @param {string} mode - 'light' | 'dark' | 'system'
   */
  setMode(mode) {
    if (!this.THEMES.includes(mode)) {
      console.warn('[ThemeManager] 无效的主题模式:', mode);
      return;
    }
    
    this.currentMode = mode;
    localStorage.setItem(this.STORAGE_KEY, mode);
    this.applyTheme();
    
    // 更新 UI 选择器（如果存在）
    const selector = document.getElementById('theme-mode');
    if (selector) {
      selector.value = mode;
    }
    
    console.log('[ThemeManager] 主题模式已切换:', mode);
  },
  
  /**
   * 应用主题到 DOM
   */
  applyTheme() {
    let theme;
    
    if (this.currentMode === 'system') {
      // 跟随系统
      theme = this.mediaQuery.matches ? 'dark' : 'light';
    } else {
      theme = this.currentMode;
    }
    
    this.appliedTheme = theme;
    
    // 更新 body class
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    
    // 更新代码高亮主题
    this.updateCodeHighlightTheme(theme);
    
    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('themechange', { 
      detail: { mode: this.currentMode, theme: theme }
    }));
  },
  
  /**
   * 监听系统主题变化
   */
  watchSystem() {
    this.mediaQuery.addEventListener('change', (e) => {
      if (this.currentMode === 'system') {
        this.applyTheme();
        console.log('[ThemeManager] 系统主题已变化:', e.matches ? 'dark' : 'light');
      }
    });
  },
  
  /**
   * 切换主题（在 light 和 dark 之间）
   */
  toggle() {
    const newMode = this.appliedTheme === 'dark' ? 'light' : 'dark';
    this.setMode(newMode);
  },
  
  /**
   * 更新代码高亮主题
   * @param {string} theme - 'light' | 'dark'
   */
  updateCodeHighlightTheme(theme) {
    const linkId = 'hljs-theme';
    let link = document.getElementById(linkId);
    
    const darkTheme = 'css/highlight-js-atom-one-dark.min.css';
    const lightTheme = 'css/highlight-js-atom-one-light.min.css';
    
    const targetHref = theme === 'dark' ? darkTheme : lightTheme;
    
    if (link) {
      if (link.href !== targetHref) {
        link.href = targetHref;
      }
    } else {
      // 查找现有的 highlight.js 样式链接
      const existingLinks = document.querySelectorAll('link[href*="highlight.js"]');
      existingLinks.forEach(el => {
        if (el.href.includes('styles/')) {
          el.id = linkId;
          el.href = targetHref;
        }
      });
    }
  },
  
  /**
   * 获取当前主题
   * @returns {string} 'light' | 'dark'
   */
  getTheme() {
    return this.appliedTheme;
  },
  
  /**
   * 获取当前模式
   * @returns {string} 'light' | 'dark' | 'system'
   */
  getMode() {
    return this.currentMode;
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.ThemeManager = ThemeManager;
}
