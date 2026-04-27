/**
 * DependencyChecker - 依赖检测模块
 * 检测和显示 Node.js、Claude Code 等依赖状态
 * 
 * @created 2026-01-16
 * @module features/settings/DependencyChecker
 */

class DependencyChecker {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 依赖状态
    this.nodejs = null;
    this.happyCoder = null;
    this.claudeCode = null;
    this.claudeActionInProgress = null;
    
    // DOM 元素
    this.elements = {};
  }

  /**
   * 初始化
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
      // 刷新按钮
      refreshBtn: document.getElementById('btn-refresh-deps'),
      
      // Node.js 相关
      nodejsBadge: document.getElementById('nodejs-badge'),
      nodejsVersion: document.getElementById('nodejs-version'),
      npmVersion: document.getElementById('npm-version'),
      electronNodeVersion: document.getElementById('electron-node-version'),
      nodejsActions: document.getElementById('nodejs-actions'),
      installNodejsBtn: document.getElementById('btn-install-nodejs'),
      
      // Claude Code 相关
      claudeCodeBadge: document.getElementById('claude-code-badge'),
      claudeCodeVersion: document.getElementById('claude-code-version'),
      claudeCodeSource: document.getElementById('claude-code-source'),
      claudeCodePath: document.getElementById('claude-code-path'),
      claudeCodeActions: document.getElementById('claude-code-actions'),
      autoInstallClaudeCodeBtn: document.getElementById('btn-auto-install-claude-code'),
      installClaudeCodeBtn: document.getElementById('btn-install-claude-code'),
      upgradeClaudeCodeBtn: document.getElementById('btn-upgrade-claude-code')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    this.elements.refreshBtn?.addEventListener('click', () => this.refresh());
    this.elements.installNodejsBtn?.addEventListener('click', () => this.openNodeJsGuide());
    this.elements.autoInstallClaudeCodeBtn?.addEventListener('click', () => this.installClaudeCode());
    this.elements.upgradeClaudeCodeBtn?.addEventListener('click', () => this.upgradeClaudeCode());
    this.elements.installClaudeCodeBtn?.addEventListener('click', () => this.openClaudeCodeGuide());
  }

  getTranslator() {
    return typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
  }

  applyDependencyStatus(result) {
    const status = result?.status || result;
    this.nodejs = status?.nodejs;
    this.happyCoder = status?.happyCoder;
    this.claudeCode = status?.claudeCode;
    this.updateNodeJsUI(this.nodejs);
    this.updateHappyCoderUI(this.happyCoder);
    this.updateClaudeCodeUI(this.claudeCode);
  }

  /**
   * 加载依赖状态
   */
  async load() {
    try {
      console.log('[DependencyChecker] Loading...');
      const result = await window.browserControlManager.getDependencyStatus();
      console.log('[DependencyChecker] Result:', result);
      this.applyDependencyStatus(result);
    } catch (error) {
      console.error('[DependencyChecker] Load error:', error);
    }
  }

  /**
   * 刷新依赖状态
   */
  async refresh() {
    const t = this.getTranslator();
    
    try {
      if (this.elements.refreshBtn) {
        this.elements.refreshBtn.textContent = '⏳';
        this.elements.refreshBtn.disabled = true;
      }
      
      const result = await window.browserControlManager.checkAllDependencies();
      console.log('[DependencyChecker] Refresh result:', result);
      this.applyDependencyStatus(result);
      
      this.app?.showNotification?.(t('notifications.dependencyRefreshed'), 'success');
    } catch (error) {
      console.error('[DependencyChecker] Refresh error:', error);
      this.app?.showNotification?.(t('notifications.refreshFailed') + ': ' + error.message, 'error');
    } finally {
      if (this.elements.refreshBtn) {
        this.elements.refreshBtn.textContent = '↻';
        this.elements.refreshBtn.disabled = false;
      }
    }
  }

  /**
   * 更新 Node.js UI
   * @param {Object} nodejs Node.js 状态
   */
  updateNodeJsUI(nodejs) {
    if (!nodejs) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (nodejs.installed) {
      if (this.elements.nodejsBadge) {
        this.elements.nodejsBadge.textContent = `v${nodejs.version}`;
        this.elements.nodejsBadge.className = 'env-badge installed';
      }
      if (this.elements.nodejsVersion) {
        this.elements.nodejsVersion.textContent = `v${nodejs.version}`;
      }
      if (this.elements.npmVersion) {
        this.elements.npmVersion.textContent = nodejs.npm?.version ? `v${nodejs.npm.version}` : t('settings.notInstalled');
      }
      if (this.elements.nodejsActions) {
        this.elements.nodejsActions.style.display = 'none';
      }
    } else {
      if (this.elements.nodejsBadge) {
        this.elements.nodejsBadge.textContent = t('settings.notInstalled');
        this.elements.nodejsBadge.className = 'env-badge warning';
      }
      if (this.elements.nodejsVersion) {
        this.elements.nodejsVersion.textContent = t('settings.notInstalledOptional');
      }
      if (this.elements.npmVersion) {
        this.elements.npmVersion.textContent = '-';
      }
      if (this.elements.nodejsActions) {
        this.elements.nodejsActions.style.display = 'flex';
      }
    }
    
    if (this.elements.electronNodeVersion) {
      this.elements.electronNodeVersion.textContent = `v${nodejs.electronBuiltin?.version || '-'}`;
    }
  }

  /**
   * 更新 Happy Coder UI（仅更新 daemon 状态）
   * @param {Object} happyCoder Happy Coder 状态
   */
  updateHappyCoderUI(happyCoder) {
    // Happy Coder UI 已移除，仅通过 app 更新 daemon 状态
    if (happyCoder?.daemon) {
      this.app?.updateDaemonUI?.(happyCoder.daemon);
    } else if (happyCoder?.installed === false) {
      this.app?.updateDaemonUI?.({ running: false });
    }
  }

  /**
   * 更新 Claude Code UI
   * @param {Object} claudeCode Claude Code 状态
   */
  updateClaudeCodeUI(claudeCode) {
    if (!claudeCode) return;
    
    const t = this.getTranslator();
    
    if (claudeCode.installed) {
      if (this.elements.claudeCodeBadge) {
        this.elements.claudeCodeBadge.textContent = `v${claudeCode.version || 'unknown'}`;
        this.elements.claudeCodeBadge.className = 'env-badge installed';
      }
      if (this.elements.claudeCodeVersion) {
        this.elements.claudeCodeVersion.textContent = claudeCode.version || '未知';
      }
      if (this.elements.claudeCodeSource) {
        this.elements.claudeCodeSource.textContent = this.formatSource(claudeCode.source);
      }
      if (this.elements.claudeCodePath) {
        this.elements.claudeCodePath.textContent = this.shortenPath(claudeCode.path);
        this.elements.claudeCodePath.title = claudeCode.path || '';
      }
    } else {
      if (this.elements.claudeCodeBadge) {
        this.elements.claudeCodeBadge.textContent = t('settings.notInstalled');
        this.elements.claudeCodeBadge.className = 'env-badge warning';
      }
      if (this.elements.claudeCodeVersion) {
        this.elements.claudeCodeVersion.textContent = '-';
      }
      if (this.elements.claudeCodeSource) {
        this.elements.claudeCodeSource.textContent = '-';
      }
      if (this.elements.claudeCodePath) {
        this.elements.claudeCodePath.textContent = t('notifications.partialLimited');
        this.elements.claudeCodePath.title = '';
      }
    }

    this.updateClaudeCodeActionButtons(claudeCode);
  }

  /**
   * 格式化来源显示
   * @param {string} source 来源
   * @returns {string}
   */
  formatSource(source) {
    const sourceMap = {
      'npm': 'npm 全局',
      'Homebrew': 'Homebrew',
      'native': '原生安装器'
    };
    return sourceMap[source] || source || '-';
  }

  /**
   * 缩短路径显示
   * @param {string} path 路径
   * @returns {string}
   */
  shortenPath(path) {
    if (!path) return '-';
    if (path.length <= 40) return path;
    
    // 保留前 15 和后 20 个字符
    return path.substring(0, 15) + '...' + path.substring(path.length - 20);
  }

  getClaudeCodeActionMode(claudeCode = this.claudeCode) {
    if (!claudeCode?.installed) return 'install';
    if (claudeCode.source === 'npm') return 'upgrade';
    return 'guide';
  }

  updateClaudeCodeActionButtons(claudeCode = this.claudeCode) {
    const t = this.getTranslator();
    const mode = this.getClaudeCodeActionMode(claudeCode);
    const isInstalling = this.claudeActionInProgress === 'install';
    const isUpgrading = this.claudeActionInProgress === 'upgrade';

    if (this.elements.claudeCodeActions) {
      this.elements.claudeCodeActions.style.display = mode === null ? 'none' : 'flex';
    }

    if (this.elements.autoInstallClaudeCodeBtn) {
      this.elements.autoInstallClaudeCodeBtn.style.display = mode === 'install' ? 'inline-flex' : 'none';
      this.elements.autoInstallClaudeCodeBtn.disabled = !!this.claudeActionInProgress;
      this.elements.autoInstallClaudeCodeBtn.textContent = isInstalling
        ? t('settings.installing')
        : t('settings.installNow');
    }

    if (this.elements.upgradeClaudeCodeBtn) {
      this.elements.upgradeClaudeCodeBtn.style.display = mode === 'upgrade' ? 'inline-flex' : 'none';
      this.elements.upgradeClaudeCodeBtn.disabled = !!this.claudeActionInProgress;
      this.elements.upgradeClaudeCodeBtn.textContent = isUpgrading
        ? t('settings.upgrading')
        : t('settings.upgradeNow');
    }

    if (this.elements.installClaudeCodeBtn) {
      this.elements.installClaudeCodeBtn.style.display = mode === 'guide' || mode === 'install' ? 'inline-flex' : 'none';
      this.elements.installClaudeCodeBtn.disabled = !!this.claudeActionInProgress;
    }
  }

  getClaudeCodeActionErrorMessage(result, action) {
    const t = this.getTranslator();
    switch (result?.errorCode) {
      case 'npm_not_found':
        return t('notifications.npmRequiredForClaudeCode');
      case 'permission_denied':
        return t('notifications.claudeCodePermissionDenied');
      case 'unsupported_source':
        return t('notifications.claudeCodeUpgradeUnsupported');
      default: {
        const fallback = action === 'upgrade'
          ? t('notifications.claudeCodeUpgradeFailed')
          : t('notifications.claudeCodeInstallFailed');
        return result?.error ? `${fallback}: ${result.error}` : fallback;
      }
    }
  }

  async runClaudeCodeAction(action) {
    const t = this.getTranslator();
    const methodName = action === 'upgrade' ? 'upgradeClaudeCode' : 'installClaudeCode';

    try {
      this.claudeActionInProgress = action;
      this.updateClaudeCodeActionButtons();

      const result = await window.browserControlManager?.[methodName]?.();
      if (result?.success) {
        if (result.status) {
          this.claudeCode = result.status;
          this.updateClaudeCodeUI(this.claudeCode);
        }

        const successMessage = action === 'upgrade'
          ? t('notifications.claudeCodeUpgraded')
          : t('notifications.claudeCodeInstalled');
        const versionSuffix = result?.status?.version ? ` (v${result.status.version})` : '';
        this.app?.showNotification?.(successMessage + versionSuffix, 'success');
        return;
      }

      if (result?.status) {
        this.claudeCode = result.status;
        this.updateClaudeCodeUI(this.claudeCode);
      }
      this.app?.showNotification?.(this.getClaudeCodeActionErrorMessage(result, action), 'error');
    } catch (error) {
      console.error(`[DependencyChecker] Claude Code ${action} error:`, error);
      const fallback = action === 'upgrade'
        ? t('notifications.claudeCodeUpgradeFailed')
        : t('notifications.claudeCodeInstallFailed');
      this.app?.showNotification?.(`${fallback}: ${error.message}`, 'error');
    } finally {
      this.claudeActionInProgress = null;
      this.updateClaudeCodeActionButtons();
    }
  }

  async installClaudeCode() {
    await this.runClaudeCodeAction('install');
  }

  async upgradeClaudeCode() {
    await this.runClaudeCodeAction('upgrade');
  }

  /**
   * 打开 Node.js 安装指南
   */
  async openNodeJsGuide() {
    try {
      await window.browserControlManager.openNodeJsWebsite();
    } catch (error) {
      console.error('[DependencyChecker] Open Node.js guide error:', error);
    }
  }

  /**
   * 打开 Claude Code 安装指南
   */
  async openClaudeCodeGuide() {
    try {
      await window.browserControlManager.openClaudeCodeDocs();
    } catch (error) {
      console.error('[DependencyChecker] Open Claude Code guide error:', error);
    }
  }

  /**
   * 获取 Node.js 状态
   * @returns {Object|null}
   */
  getNodeJsStatus() {
    return this.nodejs;
  }

  /**
   * 获取 Claude Code 状态
   * @returns {Object|null}
   */
  getClaudeCodeStatus() {
    return this.claudeCode;
  }

  /**
   * 检查是否已安装 Node.js
   * @returns {boolean}
   */
  hasNodeJs() {
    return this.nodejs?.installed || false;
  }

  /**
   * 检查是否已安装 Claude Code
   * @returns {boolean}
   */
  hasClaudeCode() {
    return this.claudeCode?.installed || false;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.DependencyChecker = DependencyChecker;
}
