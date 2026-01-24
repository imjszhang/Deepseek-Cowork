/**
 * WorkspaceSettings - 工作区设置模块
 * 管理工作区目录、Secret、权限模式等配置
 * 
 * @created 2026-01-16
 * @updated 2026-01-16 - 增强版，添加权限模式和 Happy 设置功能
 * @module features/settings/WorkspaceSettings
 */

class WorkspaceSettings {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 当前设置
    this.workspaceDir = null;
    this.defaultWorkspaceDir = null;
    this.hasSecret = false;
    this.secretVisible = false;
    this.permissionMode = 'default';
    
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
      // 工作目录
      workspaceDirInput: document.getElementById('workspace-dir'),
      defaultWorkspaceDirInput: document.getElementById('default-workspace-dir'),
      selectWorkspaceBtn: document.getElementById('btn-select-workspace'),
      resetWorkspaceBtn: document.getElementById('btn-reset-workspace'),
      
      // 权限模式
      permissionModeSelect: document.getElementById('happy-permission-mode'),
      permissionModeHint: document.getElementById('permission-mode-hint')
    };
    
    // 注意: Secret 相关的 DOM 元素已迁移到 AccountSetup 模块处理
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    this.elements.selectWorkspaceBtn?.addEventListener('click', () => this.selectWorkspaceDir());
    this.elements.resetWorkspaceBtn?.addEventListener('click', () => this.resetWorkspaceDir());
    this.elements.permissionModeSelect?.addEventListener('change', () => this.onPermissionModeChange());
    // 注意: Secret 相关的事件已迁移到 AccountSetup 模块处理
  }

  /**
   * 加载所有 Happy AI 设置
   */
  async load() {
    try {
      console.log('[WorkspaceSettings] Loading...');
      const settings = await window.browserControlManager.getAllHappySettings();
      console.log('[WorkspaceSettings] Settings:', settings);

      // 工作目录（优先使用当前 session 实际的目录，而不是用户设置）
      this.workspaceDir = settings.currentWorkDir || settings.workspaceDir || settings.defaultWorkspaceDir || null;
      this.defaultWorkspaceDir = settings.defaultWorkspaceDir || null;
      
      if (this.elements.workspaceDirInput) {
        this.elements.workspaceDirInput.value = this.workspaceDir || '未设置';
      }
      if (this.elements.defaultWorkspaceDirInput) {
        this.elements.defaultWorkspaceDirInput.value = this.defaultWorkspaceDir || '未知';
      }

      // Secret 状态
      this.hasSecret = settings.hasSecret;
      this.updateSecretStatus(settings.hasSecret);

      // 权限模式
      this.permissionMode = settings.permissionMode || 'default';
      if (this.elements.permissionModeSelect) {
        this.elements.permissionModeSelect.value = this.permissionMode;
        this.updatePermissionModeHint(this.permissionMode);
      }

    } catch (error) {
      console.error('[WorkspaceSettings] Load error:', error);
      if (this.elements.workspaceDirInput) {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.elements.workspaceDirInput.value = t('errors.loadFailed');
      }
    }
  }

  /**
   * 更新 Secret 状态显示
   * 注意：此功能已迁移到 AccountSetup 模块处理
   * @param {boolean} hasSecret 是否已配置
   */
  updateSecretStatus(hasSecret) {
    this.hasSecret = hasSecret;
    // Secret 状态显示由 AccountSetup 模块处理
  }

  /**
   * 切换 Secret 显示/隐藏
   * 注意：此功能已迁移到 AccountSetup 模块处理
   */
  toggleSecretVisibility() {
    // Secret 显示切换由 AccountSetup 模块处理
  }

  /**
   * 保存 Happy Secret
   * 注意：此功能已迁移到 AccountSetup 模块处理
   */
  async saveHappySecret() {
    // Secret 保存由 AccountSetup 模块处理
    console.log('[WorkspaceSettings] saveHappySecret called but handled by AccountSetup');
  }

  /**
   * 权限模式变更处理
   */
  async onPermissionModeChange() {
    const mode = this.elements.permissionModeSelect?.value || 'default';
    this.permissionMode = mode;
    this.updatePermissionModeHint(mode);
    await this.saveHappySettings();
  }

  /**
   * 更新权限模式提示
   * @param {string} mode 权限模式
   */
  updatePermissionModeHint(mode) {
    if (!this.elements.permissionModeHint) return;

    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;

    const hints = {
      'default': t('settings.permissionHintDefault'),
      'acceptEdits': t('settings.permissionHintAcceptEdits'),
      'plan': t('settings.permissionHintPlan'),
      'bypassPermissions': t('settings.permissionHintYolo')
    };

    this.elements.permissionModeHint.textContent = hints[mode] || '';

    // YOLO mode shows warning style
    if (mode === 'bypassPermissions') {
      this.elements.permissionModeHint.classList.add('warning');
    } else {
      this.elements.permissionModeHint.classList.remove('warning');
    }
  }

  /**
   * 保存 Happy AI 设置（非敏感配置）
   */
  async saveHappySettings() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      const settings = {
        permissionMode: this.elements.permissionModeSelect?.value
      };

      const result = await window.browserControlManager.saveHappySettings(settings);
      
      if (result.success) {
        if (result.needsRestart) {
          this.app?.showRestartPrompt?.();
        } else {
          // 热切换成功，显示成功提示
          this.app?.showNotification?.(t('notifications.settingsSavedAndApplied'), 'success');
        }
        console.log('[WorkspaceSettings] Settings saved');
      } else {
        this.app?.showNotification?.(t('notifications.saveSettingsFailed'), 'error');
      }
    } catch (error) {
      console.error('[WorkspaceSettings] Save settings error:', error);
      this.app?.showNotification?.(t('notifications.saveSettingsFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 选择工作区目录
   */
  async selectWorkspaceDir() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      // selectWorkspaceDir 只返回用户选择的路径
      const result = await window.browserControlManager.selectWorkspaceDir();
      
      if (result?.success && result.path) {
        // 显示加载遮罩，阻止用户操作
        this.app?.showLoadingOverlay?.(t('notifications.switchingWorkDir') || '正在切换工作目录...');
        
        try {
          // 调用 switchWorkDir 来实际切换目录
          const switchResult = await window.browserControlManager.switchWorkDir?.(result.path);
          
          if (switchResult?.success) {
            this.workspaceDir = result.path;
            
            if (this.elements.workspaceDirInput) {
              this.elements.workspaceDirInput.value = result.path;
            }
            
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
          } else {
            this.app?.showNotification?.(switchResult?.error || t('notifications.operationFailed'), 'error');
          }
        } finally {
          // 隐藏加载遮罩
          this.app?.hideLoadingOverlay?.();
        }
      } else if (result?.cancelled) {
        // 用户取消，不做任何处理
      } else {
        this.app?.showNotification?.(result?.error || t('notifications.operationFailed'), 'error');
      }
    } catch (error) {
      console.error('[WorkspaceSettings] Select dir error:', error);
      this.app?.hideLoadingOverlay?.();
      this.app?.showNotification?.(t('notifications.operationFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 重置工作区目录
   */
  async resetWorkspaceDir() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 显示加载遮罩，阻止用户操作
    this.app?.showLoadingOverlay?.(t('notifications.resettingToDefault') || '正在重置为默认目录...');
    
    try {
      const result = await window.browserControlManager.resetWorkspaceDir();
      
      if (result?.success) {
        this.workspaceDir = result.path;
        
        if (this.elements.workspaceDirInput) {
          this.elements.workspaceDirInput.value = result.path;
        }
        
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
        
        this.app?.showNotification?.(t('notifications.workspaceDirReset'), 'success');
      } else {
        this.app?.showNotification?.(result?.error || t('notifications.operationFailed'), 'error');
      }
    } catch (error) {
      console.error('[WorkspaceSettings] Reset dir error:', error);
      this.app?.showNotification?.(t('notifications.operationFailed') + ': ' + error.message, 'error');
    } finally {
      // 隐藏加载遮罩
      this.app?.hideLoadingOverlay?.();
    }
  }

  /**
   * 获取工作区目录
   * @returns {string|null}
   */
  getWorkspaceDir() {
    return this.workspaceDir;
  }

  /**
   * 获取默认工作区目录
   * @returns {string|null}
   */
  getDefaultWorkspaceDir() {
    return this.defaultWorkspaceDir;
  }

  /**
   * 检查是否有密钥
   * @returns {boolean}
   */
  hasSecretKey() {
    return this.hasSecret;
  }

  /**
   * 获取当前权限模式
   * @returns {string}
   */
  getPermissionMode() {
    return this.permissionMode;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.WorkspaceSettings = WorkspaceSettings;
}
