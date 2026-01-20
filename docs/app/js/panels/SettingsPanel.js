/**
 * SettingsPanel - 设置面板模块
 * 管理应用设置的各个分区
 * 
 * @created 2026-01-16
 * @module panels/SettingsPanel
 */

class SettingsPanel {
  /**
   * 构造函数
   * @param {Object} app 主应用实例引用
   */
  constructor(app) {
    this.app = app;
    
    // 当前分区
    this.currentSection = 'environment';
    
    // 分区列表
    this.sections = [
      'environment',
      'claude-code',
      'account',
      'conversation',
      'appearance',
      'server',
      'logs'
    ];
    
    // DOM 元素
    this.elements = {};
  }

  /**
   * 初始化面板
   */
  init() {
    this.bindElements();
    this.bindEvents();
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      navItems: document.querySelectorAll('.settings-nav-item'),
      sections: document.querySelectorAll('.settings-content > .settings-section')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    this.elements.navItems?.forEach(item => {
      item.addEventListener('click', () => {
        const sectionId = item.dataset.section;
        if (sectionId) {
          this.switchSection(sectionId);
        }
      });
    });
  }

  /**
   * 切换设置分区
   * @param {string} sectionId 分区 ID
   */
  switchSection(sectionId) {
    // 更新导航项状态
    this.elements.navItems?.forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });
    
    // 切换内容分区
    this.elements.sections?.forEach(section => {
      section.classList.toggle('active', section.id === `settings-${sectionId}`);
    });
    
    // 记录当前分区
    this.currentSection = sectionId;
    
    // 分区特定的初始化
    this.onSectionChange(sectionId);
  }

  /**
   * 分区切换回调
   * @param {string} sectionId 分区 ID
   */
  onSectionChange(sectionId) {
    // 委托给 app 处理分区特定逻辑
    switch (sectionId) {
      case 'logs':
        this.app.scrollLogsToBottom();
        break;
      case 'environment':
        this.app.loadDependencyStatus();
        this.app.loadDaemonStatus();
        break;
      case 'claude-code':
        this.app.loadClaudeCodeSettings();
        break;
      case 'account':
        this.app.loadAccountInfo();
        break;
      case 'appearance':
        // 外观设置在 ThemeManager 中管理
        break;
    }
  }

  /**
   * 获取当前分区
   * @returns {string}
   */
  getCurrentSection() {
    return this.currentSection;
  }

  /**
   * 判断是否为指定分区
   * @param {string} sectionId 分区 ID
   * @returns {boolean}
   */
  isSection(sectionId) {
    return this.currentSection === sectionId;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.SettingsPanel = SettingsPanel;
}
