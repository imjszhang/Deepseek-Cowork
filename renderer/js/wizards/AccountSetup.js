/**
 * AccountSetup - 账户设置向导模块
 * 处理账户创建、导入和管理流程
 * 
 * @created 2026-01-16
 * @updated 2026-01-16 - 从 app.js 迁移所有账户管理方法
 * @module wizards/AccountSetup
 */

class AccountSetup {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 当前账户信息
    this.accountInfo = null;
    
    // 临时数据
    this.pendingSecret = null;
    this._lastSaveResult = null;
    
    // 状态
    this.isSecretDisplayed = false;
    
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
      // 账户状态容器
      accountLoggedIn: document.getElementById('account-logged-in'),
      accountNotLoggedIn: document.getElementById('account-not-logged-in'),
      accountStatusDot: document.getElementById('account-status-dot'),
      accountStatusText: document.getElementById('account-status-text'),
      accountAnonId: document.getElementById('account-anon-id'),
      accountServer: document.getElementById('account-server'),
      accountSecretDisplay: document.getElementById('account-secret-display'),
      accountBackupSection: document.getElementById('account-backup-section'),
      accountActionsSection: document.getElementById('account-actions-section'),
      secretDisplaySection: document.getElementById('secret-display-section'),
      secretToggleIcon: document.getElementById('secret-toggle-icon'),
      secretToggleText: document.getElementById('secret-toggle-text'),
      secretCopyHint: document.getElementById('secret-copy-hint'),
      restartSection: document.getElementById('restart-section'),
      
      // 未登录状态按钮
      btnAccountCreate: document.getElementById('btn-account-create'),
      btnAccountImport: document.getElementById('btn-account-import'),
      
      // 已登录状态按钮
      btnCopyAnonId: document.getElementById('btn-copy-anon-id'),
      btnToggleSecretDisplay: document.getElementById('btn-toggle-secret-display'),
      btnCopySecretKey: document.getElementById('btn-copy-secret-key'),
      btnSwitchAccount: document.getElementById('btn-switch-account'),
      btnChangeServer: document.getElementById('btn-change-server'),
      btnLogout: document.getElementById('btn-logout'),
      
      // 欢迎设置对话框
      welcomeSetupDialog: document.getElementById('welcome-setup-dialog'),
      btnCreateAccount: document.getElementById('btn-create-account'),
      btnImportSecret: document.getElementById('btn-import-secret'),
      btnSkipSetup: document.getElementById('btn-skip-setup'),
      
      // 密钥备份对话框
      secretBackupDialog: document.getElementById('secret-backup-dialog'),
      secretDisplay: document.getElementById('secret-display'),
      copyStatus: document.getElementById('copy-status'),
      btnCopySecret: document.getElementById('btn-copy-secret'),
      backupConfirmedCheckbox: document.getElementById('backup-confirmed'),
      btnBackupCancel: document.getElementById('btn-backup-cancel'),
      btnBackupContinue: document.getElementById('btn-backup-continue'),
      
      // 密钥输入对话框
      secretInputDialog: document.getElementById('secret-input-dialog'),
      secretInputField: document.getElementById('secret-input-field'),
      secretInputStatus: document.getElementById('secret-input-status'),
      secretInputCloseBtn: document.querySelector('#secret-input-dialog .dialog-close'),
      btnSecretInputCancel: document.getElementById('btn-secret-input-cancel'),
      btnSecretInputVerify: document.getElementById('btn-secret-input-verify'),
      
      // 设置完成对话框
      setupCompleteDialog: document.getElementById('setup-complete-dialog'),
      btnSetupComplete: document.getElementById('btn-setup-complete'),
      
      // 修改服务器对话框
      changeServerDialog: document.getElementById('change-server-dialog'),
      currentServerDisplay: document.getElementById('current-server-display'),
      newServerInput: document.getElementById('new-server-input'),
      btnChangeServerCancel: document.getElementById('btn-change-server-cancel'),
      btnChangeServerConfirm: document.getElementById('btn-change-server-confirm')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 欢迎对话框事件
    this.elements.btnCreateAccount?.addEventListener('click', () => this.handleCreateAccount());
    this.elements.btnImportSecret?.addEventListener('click', () => this.handleImportSecret());
    this.elements.btnSkipSetup?.addEventListener('click', (e) => {
      e.preventDefault();
      this.hideWelcomeSetupDialog();
    });
    
    // 备份对话框事件
    this.elements.btnCopySecret?.addEventListener('click', () => this.copySecretToClipboard());
    this.elements.backupConfirmedCheckbox?.addEventListener('change', () => {
      if (this.elements.btnBackupContinue) {
        this.elements.btnBackupContinue.disabled = !this.elements.backupConfirmedCheckbox.checked;
      }
    });
    this.elements.btnBackupCancel?.addEventListener('click', () => this.cancelBackupDialog());
    this.elements.btnBackupContinue?.addEventListener('click', () => this.confirmBackupAndSave());
    
    // 输入对话框事件
    this.elements.secretInputField?.addEventListener('input', () => this.validateSecretInput());
    this.elements.btnSecretInputCancel?.addEventListener('click', () => this.hideSecretInputDialog());
    this.elements.secretInputCloseBtn?.addEventListener('click', () => this.hideSecretInputDialog());
    this.elements.btnSecretInputVerify?.addEventListener('click', () => this.verifyAndSaveSecret());
    
    // 完成对话框事件
    this.elements.btnSetupComplete?.addEventListener('click', () => this.hideSetupCompleteDialog());
    
    // 未登录状态按钮
    this.elements.btnAccountCreate?.addEventListener('click', () => this.handleCreateAccount());
    this.elements.btnAccountImport?.addEventListener('click', () => this.handleImportSecret());
    
    // 已登录状态按钮
    this.elements.btnCopyAnonId?.addEventListener('click', () => this.copyAnonId());
    this.elements.btnToggleSecretDisplay?.addEventListener('click', () => this.toggleSecretKeyDisplay());
    this.elements.btnCopySecretKey?.addEventListener('click', () => this.copySecretKey());
    this.elements.btnSwitchAccount?.addEventListener('click', () => this.handleSwitchAccount());
    this.elements.btnChangeServer?.addEventListener('click', () => this.showChangeServerDialog());
    this.elements.btnChangeServerCancel?.addEventListener('click', () => this.hideChangeServerDialog());
    this.elements.btnChangeServerConfirm?.addEventListener('click', () => this.confirmChangeServer());
    this.elements.btnLogout?.addEventListener('click', () => this.handleLogout());
  }

  // ============================================================================
  // 账户加载和状态管理
  // ============================================================================

  /**
   * 加载账户信息
   */
  async loadAccountInfo() {
    try {
      const accountInfo = await window.browserControlManager?.getAccountInfo?.();
      console.log('[AccountSetup] Account info:', accountInfo);
      
      this.accountInfo = accountInfo;
      
      if (accountInfo?.hasSecret) {
        // 已登录状态
        this.renderLoggedInState(accountInfo);
      } else {
        // 未登录状态 - 自动注册新账户
        this.renderNotLoggedInState();
        await this.autoRegisterAndLogin();
      }
    } catch (error) {
      console.error('[AccountSetup] loadAccountInfo error:', error);
      this.renderNotLoggedInState();
    }
  }

  /**
   * 自动注册并登录
   * 首次启动时自动生成 Secret 并完成登录，无需用户操作
   * 失败时回退到欢迎对话框让用户手动处理
   */
  async autoRegisterAndLogin() {
    console.log('[AccountSetup] Starting auto registration...');
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      // 1. 显示加载状态
      this.showNotification(t('notifications.initializingAccount'), 'info');
      
      // 2. 生成新的 Secret
      console.log('[AccountSetup] Generating new secret...');
      const generateResult = await window.browserControlManager?.generateHappySecret?.();
      
      if (!generateResult?.success) {
        throw new Error(generateResult?.error || '生成 Secret 失败');
      }
      
      console.log('[AccountSetup] Secret generated successfully');
      
      // 3. 验证 Secret（连接服务器）
      console.log('[AccountSetup] Verifying secret with server...');
      const verifyResult = await window.browserControlManager?.verifyHappySecret?.(generateResult.base64url);
      
      if (!verifyResult?.success) {
        throw new Error(verifyResult?.error || '验证 Secret 失败');
      }
      
      console.log('[AccountSetup] Secret verified successfully');
      
      // 4. 保存 Secret
      console.log('[AccountSetup] Saving secret...');
      const saveResult = await window.browserControlManager?.saveHappySecret?.(
        generateResult.base64url,
        verifyResult.token
      );
      
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || '保存 Secret 失败');
      }
      
      console.log('[AccountSetup] Secret saved successfully');
      
      // 5. 刷新账户信息并渲染已登录状态
      const newAccountInfo = await window.browserControlManager?.getAccountInfo?.();
      this.accountInfo = newAccountInfo;
      this.renderLoggedInState(newAccountInfo);
      
      // 6. 显示成功通知，提醒备份
      this.showNotification(t('notifications.accountAutoCreated'), 'success');
      
      console.log('[AccountSetup] Auto registration completed successfully');
      
      // 7. 如果需要重启（热切换失败等情况）
      if (saveResult.needsRestart) {
        this.showRestartPrompt();
      }
      
    } catch (error) {
      console.error('[AccountSetup] Auto registration failed:', error);
      
      // 自动注册失败，回退到欢迎对话框让用户手动处理
      this.showNotification(t('notifications.autoCreateFailed'), 'warning');
      
      // 延迟显示欢迎对话框
      setTimeout(() => {
        this.showWelcomeSetupDialog();
      }, 500);
    }
  }

  /**
   * 渲染已登录状态
   * @param {Object} accountInfo - 账户信息
   */
  renderLoggedInState(accountInfo) {
    // 隐藏未登录状态，显示已登录状态
    if (this.elements.accountNotLoggedIn) {
      this.elements.accountNotLoggedIn.style.display = 'none';
    }
    if (this.elements.accountLoggedIn) {
      this.elements.accountLoggedIn.style.display = 'flex';
    }
    
    // 更新状态指示器
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (this.elements.accountStatusDot) {
      this.elements.accountStatusDot.className = 'status-dot-sm ' + (accountInfo.isConnected ? 'connected' : 'pending');
    }
    if (this.elements.accountStatusText) {
      this.elements.accountStatusText.textContent = accountInfo.isConnected ? t('settings.connected') : t('settings.configured');
    }
    
    // 更新匿名 ID
    if (this.elements.accountAnonId) {
      this.elements.accountAnonId.textContent = accountInfo.anonId || '-';
    }
    
    // 更新服务器地址
    if (this.elements.accountServer) {
      this.elements.accountServer.textContent = accountInfo.serverUrl || '-';
    }
    
    // 显示备份和操作区域
    if (this.elements.accountBackupSection) {
      this.elements.accountBackupSection.style.display = 'block';
    }
    if (this.elements.accountActionsSection) {
      this.elements.accountActionsSection.style.display = 'block';
    }
    
    // 重置 Secret 显示状态
    this.isSecretDisplayed = false;
    if (this.elements.secretDisplaySection) {
      this.elements.secretDisplaySection.style.display = 'none';
    }
    if (this.elements.secretToggleIcon) {
      this.elements.secretToggleIcon.textContent = '👁';
    }
    if (this.elements.secretToggleText) {
      this.elements.secretToggleText.textContent = t('settings.show');
    }
  }

  /**
   * 渲染未登录状态
   */
  renderNotLoggedInState() {
    // 显示未登录状态，隐藏已登录状态
    if (this.elements.accountLoggedIn) {
      this.elements.accountLoggedIn.style.display = 'none';
    }
    if (this.elements.accountNotLoggedIn) {
      this.elements.accountNotLoggedIn.style.display = 'block';
    }
    
    // 隐藏备份和操作区域
    if (this.elements.accountBackupSection) {
      this.elements.accountBackupSection.style.display = 'none';
    }
    if (this.elements.accountActionsSection) {
      this.elements.accountActionsSection.style.display = 'none';
    }
  }

  // ============================================================================
  // 账户操作方法
  // ============================================================================

  /**
   * 复制匿名 ID
   */
  async copyAnonId() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      const anonId = this.elements.accountAnonId?.textContent;
      if (!anonId || anonId === '-') {
        this.showNotification(t('notifications.noAnonIdToCopy'), 'warning');
        return;
      }
      
      await navigator.clipboard.writeText(anonId);
      this.showNotification(t('notifications.anonIdCopied'), 'success');
    } catch (error) {
      console.error('[AccountSetup] copyAnonId error:', error);
      this.showNotification(t('notifications.copyFailed'), 'error');
    }
  }

  /**
   * 切换 Secret Key 显示/隐藏
   */
  async toggleSecretKeyDisplay() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (this.isSecretDisplayed) {
      // 隐藏 Secret
      if (this.elements.secretDisplaySection) {
        this.elements.secretDisplaySection.style.display = 'none';
      }
      if (this.elements.secretToggleIcon) {
        this.elements.secretToggleIcon.textContent = '👁';
      }
      if (this.elements.secretToggleText) {
        this.elements.secretToggleText.textContent = t('settings.show');
      }
      this.isSecretDisplayed = false;
    } else {
      // 显示 Secret
      try {
        const result = await window.browserControlManager?.getFormattedSecret?.();
        
        if (result?.success) {
          if (this.elements.accountSecretDisplay) {
            this.elements.accountSecretDisplay.textContent = result.formatted;
          }
          if (this.elements.secretDisplaySection) {
            this.elements.secretDisplaySection.style.display = 'block';
          }
          if (this.elements.secretToggleIcon) {
            this.elements.secretToggleIcon.textContent = '🙈';
          }
          if (this.elements.secretToggleText) {
            this.elements.secretToggleText.textContent = t('settings.hide');
          }
          this.isSecretDisplayed = true;
        } else {
          this.showNotification(t('notifications.cannotGetSecret') + ': ' + (result?.error || t('errors.unknownError')), 'error');
        }
      } catch (error) {
        console.error('[AccountSetup] toggleSecretKeyDisplay error:', error);
        this.showNotification(t('notifications.getSecretFailed'), 'error');
      }
    }
  }

  /**
   * 复制 Secret Key
   */
  async copySecretKey() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      const secret = this.elements.accountSecretDisplay?.textContent;
      if (!secret || secret === '-') {
        this.showNotification(t('notifications.noSecretToCopy'), 'warning');
        return;
      }
      
      await navigator.clipboard.writeText(secret);
      
      // 更新按钮状态
      if (this.elements.btnCopySecretKey) {
        this.elements.btnCopySecretKey.classList.add('copied');
        this.elements.btnCopySecretKey.innerHTML = '<span>✓</span> ' + t('common.copied');
      }
      
      // 显示提示
      if (this.elements.secretCopyHint) {
        this.elements.secretCopyHint.textContent = '✓ Secret Key ' + t('common.copied');
        this.elements.secretCopyHint.className = 'copy-hint success';
        this.elements.secretCopyHint.style.display = 'block';
      }
      
      // 3 秒后恢复
      setTimeout(() => {
        if (this.elements.btnCopySecretKey) {
          this.elements.btnCopySecretKey.classList.remove('copied');
          this.elements.btnCopySecretKey.innerHTML = '<span>📋</span> ' + t('common.copy');
        }
        if (this.elements.secretCopyHint) {
          this.elements.secretCopyHint.style.display = 'none';
        }
      }, 3000);
    } catch (error) {
      console.error('[AccountSetup] copySecretKey error:', error);
      if (this.elements.secretCopyHint) {
        this.elements.secretCopyHint.textContent = '✗ ' + t('notifications.copyFailed');
        this.elements.secretCopyHint.className = 'copy-hint error';
        this.elements.secretCopyHint.style.display = 'block';
      }
    }
  }

  /**
   * 处理切换账户
   */
  handleSwitchAccount() {
    // 直接显示欢迎设置对话框
    this.showWelcomeSetupDialog();
  }

  /**
   * 显示修改服务器对话框
   */
  showChangeServerDialog() {
    // 获取当前服务器地址
    const currentServer = this.elements.accountServer?.textContent || 'api.deepseek-cowork.com';
    
    if (this.elements.currentServerDisplay) {
      this.elements.currentServerDisplay.value = currentServer;
    }
    if (this.elements.newServerInput) {
      this.elements.newServerInput.value = '';
    }
    if (this.elements.changeServerDialog) {
      this.elements.changeServerDialog.style.display = 'flex';
    }
  }

  /**
   * 隐藏修改服务器对话框
   */
  hideChangeServerDialog() {
    if (this.elements.changeServerDialog) {
      this.elements.changeServerDialog.style.display = 'none';
    }
  }

  /**
   * 确认修改服务器
   */
  async confirmChangeServer() {
    const newServer = this.elements.newServerInput?.value?.trim() || null;
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      // 禁用按钮
      if (this.elements.btnChangeServerConfirm) {
        this.elements.btnChangeServerConfirm.disabled = true;
        this.elements.btnChangeServerConfirm.textContent = t('common.processing');
      }
      
      const result = await window.browserControlManager?.changeServer?.(newServer);
      
      if (result?.success) {
        this.hideChangeServerDialog();
        this.showNotification(t('notifications.serverChanged'), 'success');
        
        // 更新 UI 状态为未登录
        this.renderNotLoggedInState();
        
        // 自动显示首次设置对话框
        setTimeout(() => {
          this.showWelcomeSetupDialog();
        }, 500);
      } else {
        this.showNotification(t('notifications.changeServerFailed') + ': ' + (result?.error || t('errors.unknownError')), 'error');
      }
    } catch (error) {
      console.error('[AccountSetup] confirmChangeServer error:', error);
      this.showNotification(t('notifications.changeServerFailed'), 'error');
    } finally {
      // 恢复按钮状态
      if (this.elements.btnChangeServerConfirm) {
        this.elements.btnChangeServerConfirm.disabled = false;
        this.elements.btnChangeServerConfirm.textContent = t('common.confirmChange');
      }
    }
  }

  /**
   * 处理退出登录
   */
  async handleLogout() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    // 显示确认对话框
    const confirmed = await this.showLogoutConfirmDialog();
    if (!confirmed) {
      return;
    }
    
    try {
      const result = await window.browserControlManager?.logout?.();
      
      if (result?.success) {
        this.showNotification(t('notifications.loggedOut'), 'success');
        
        // 更新 UI 状态
        this.renderNotLoggedInState();
        
        // 如果需要重启
        if (result.needsRestart) {
          this.showRestartPrompt();
        }
      } else {
        this.showNotification(t('notifications.logoutFailed') + ': ' + (result?.error || t('errors.unknownError')), 'error');
      }
    } catch (error) {
      console.error('[AccountSetup] handleLogout error:', error);
      this.showNotification(t('notifications.logoutFailed'), 'error');
    }
  }

  /**
   * 显示退出登录确认对话框
   * @returns {Promise<boolean>} 是否确认
   */
  showLogoutConfirmDialog() {
    return new Promise((resolve) => {
      // 简单使用 confirm 对话框
      const confirmed = window.confirm('确定要退出登录吗？\n\n退出后需要重新配置账户才能使用 Agent 功能。\n请确保您已备份 Secret Key！');
      resolve(confirmed);
    });
  }

  // ============================================================================
  // 欢迎设置对话框相关方法
  // ============================================================================

  /**
   * 显示欢迎设置对话框
   */
  showWelcomeSetupDialog() {
    if (this.elements.welcomeSetupDialog) {
      this.elements.welcomeSetupDialog.style.display = 'flex';
    }
  }

  /**
   * 隐藏欢迎设置对话框
   */
  hideWelcomeSetupDialog() {
    if (this.elements.welcomeSetupDialog) {
      this.elements.welcomeSetupDialog.style.display = 'none';
    }
  }

  /**
   * 处理创建新账户
   */
  async handleCreateAccount() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      console.log('[AccountSetup] Generating new secret...');
      
      const result = await window.browserControlManager?.generateHappySecret?.();
      
      if (result?.success) {
        // 保存生成的 secret 信息用于后续保存
        this.pendingSecret = {
          formatted: result.formatted,
          base64url: result.base64url
        };
        
        // 隐藏欢迎对话框，显示备份对话框
        this.hideWelcomeSetupDialog();
        this.showSecretBackupDialog(result.formatted);
      } else {
        this.showNotification(t('notifications.generateSecretFailed') + ': ' + (result?.error || t('errors.unknownError')), 'error');
      }
    } catch (error) {
      console.error('[AccountSetup] handleCreateAccount error:', error);
      this.showNotification(t('notifications.createAccountFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 处理导入已有 Secret
   */
  handleImportSecret() {
    this.hideWelcomeSetupDialog();
    this.showSecretInputDialog();
  }

  // ============================================================================
  // Secret 备份对话框相关方法
  // ============================================================================

  /**
   * 显示 Secret 备份对话框
   * @param {string} formattedSecret - 格式化的 Secret
   */
  showSecretBackupDialog(formattedSecret) {
    if (this.elements.secretBackupDialog) {
      // 设置 Secret 显示
      if (this.elements.secretDisplay) {
        this.elements.secretDisplay.textContent = formattedSecret;
      }
      
      // 重置状态
      if (this.elements.copyStatus) {
        this.elements.copyStatus.style.display = 'none';
      }
      if (this.elements.backupConfirmedCheckbox) {
        this.elements.backupConfirmedCheckbox.checked = false;
      }
      if (this.elements.btnBackupContinue) {
        this.elements.btnBackupContinue.disabled = true;
      }
      if (this.elements.btnCopySecret) {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.elements.btnCopySecret.classList.remove('copied');
        this.elements.btnCopySecret.innerHTML = '<span>📋</span> ' + t('common.copy');
      }
      
      this.elements.secretBackupDialog.style.display = 'flex';
    }
  }

  /**
   * 隐藏备份对话框
   */
  hideSecretBackupDialog() {
    if (this.elements.secretBackupDialog) {
      this.elements.secretBackupDialog.style.display = 'none';
    }
    this.pendingSecret = null;
  }

  /**
   * 复制 Secret 到剪贴板
   */
  async copySecretToClipboard() {
    try {
      const secret = this.elements.secretDisplay?.textContent;
      if (!secret) return;
      
      await navigator.clipboard.writeText(secret);
      
      // 更新按钮状态
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      if (this.elements.btnCopySecret) {
        this.elements.btnCopySecret.classList.add('copied');
        this.elements.btnCopySecret.innerHTML = '<span>✓</span> ' + t('common.copied');
      }
      
      // 显示状态
      if (this.elements.copyStatus) {
        this.elements.copyStatus.textContent = '✓ ' + t('notifications.secretCopied');
        this.elements.copyStatus.className = 'copy-status success';
        this.elements.copyStatus.style.display = 'block';
      }
      
      // 3 秒后恢复按钮状态
      setTimeout(() => {
        if (this.elements.btnCopySecret) {
          const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
          this.elements.btnCopySecret.classList.remove('copied');
          this.elements.btnCopySecret.innerHTML = '<span>📋</span> ' + t('common.copy');
        }
      }, 3000);
    } catch (error) {
      console.error('[AccountSetup] copySecretToClipboard error:', error);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      if (this.elements.copyStatus) {
        this.elements.copyStatus.textContent = '✗ ' + t('notifications.copyFailedManual');
        this.elements.copyStatus.className = 'copy-status error';
        this.elements.copyStatus.style.display = 'block';
      }
    }
  }

  /**
   * 取消备份对话框
   */
  cancelBackupDialog() {
    this.hideSecretBackupDialog();
    this.showWelcomeSetupDialog();
  }

  /**
   * 确认备份并保存 Secret
   */
  async confirmBackupAndSave() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (!this.pendingSecret) {
      this.showNotification(t('notifications.noPendingSecret'), 'error');
      return;
    }
    
    try {
      console.log('[AccountSetup] Saving secret...');
      
      // 显示 loading 状态：禁用所有按钮
      if (this.elements.btnBackupContinue) {
        this.elements.btnBackupContinue.disabled = true;
        this.elements.btnBackupContinue.textContent = t('notifications.initializingAccount');
      }
      if (this.elements.btnBackupCancel) {
        this.elements.btnBackupCancel.disabled = true;
      }
      // 显示通知提示用户正在处理
      this.showNotification(t('notifications.initializingAccount'), 'info');
      
      const result = await window.browserControlManager?.saveHappySecret?.(this.pendingSecret.base64url);
      
      if (result?.success) {
        this.hideSecretBackupDialog();
        this.showSetupCompleteDialog(result);
        
        // 刷新账户 UI 状态
        await this.loadAccountInfo();
      } else {
        this.showNotification(t('notifications.saveSecretFailed') + ': ' + (result?.error || t('errors.unknownError')), 'error');
      }
    } catch (error) {
      console.error('[AccountSetup] confirmBackupAndSave error:', error);
      this.showNotification(t('notifications.saveFailed') + ': ' + error.message, 'error');
    } finally {
      // 恢复按钮状态
      if (this.elements.btnBackupContinue) {
        this.elements.btnBackupContinue.disabled = false;
        this.elements.btnBackupContinue.textContent = t('dialogs.secretBackup.confirmContinue');
      }
      if (this.elements.btnBackupCancel) {
        this.elements.btnBackupCancel.disabled = false;
      }
    }
  }

  // ============================================================================
  // Secret 输入对话框相关方法
  // ============================================================================

  /**
   * 显示 Secret 输入对话框
   */
  showSecretInputDialog() {
    if (this.elements.secretInputDialog) {
      // 重置输入
      if (this.elements.secretInputField) {
        this.elements.secretInputField.value = '';
      }
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = '';
        this.elements.secretInputStatus.className = 'input-status';
      }
      if (this.elements.btnSecretInputVerify) {
        this.elements.btnSecretInputVerify.disabled = true;
      }
      
      this.elements.secretInputDialog.style.display = 'flex';
      this.elements.secretInputField?.focus();
    }
  }

  /**
   * 隐藏 Secret 输入对话框
   */
  hideSecretInputDialog() {
    if (this.elements.secretInputDialog) {
      this.elements.secretInputDialog.style.display = 'none';
    }
  }

  /**
   * 验证 Secret 输入
   */
  async validateSecretInput() {
    const input = this.elements.secretInputField?.value?.trim();
    
    if (!input) {
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = '';
        this.elements.secretInputStatus.className = 'input-status';
      }
      if (this.elements.btnSecretInputVerify) {
        this.elements.btnSecretInputVerify.disabled = true;
      }
      return;
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      // 显示验证中状态
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = t('notifications.validatingFormat');
        this.elements.secretInputStatus.className = 'input-status validating';
      }
      
      const result = await window.browserControlManager?.validateHappySecret?.(input);
      
      if (result?.valid) {
        if (this.elements.secretInputStatus) {
          this.elements.secretInputStatus.textContent = '✓ ' + t('notifications.formatValid');
          this.elements.secretInputStatus.className = 'input-status valid';
        }
        if (this.elements.btnSecretInputVerify) {
          this.elements.btnSecretInputVerify.disabled = false;
        }
      } else {
        if (this.elements.secretInputStatus) {
          this.elements.secretInputStatus.textContent = '✗ ' + (result?.error || t('notifications.invalidSecret'));
          this.elements.secretInputStatus.className = 'input-status invalid';
        }
        if (this.elements.btnSecretInputVerify) {
          this.elements.btnSecretInputVerify.disabled = true;
        }
      }
    } catch (error) {
      console.error('[AccountSetup] validateSecretInput error:', error);
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = '✗ ' + t('notifications.validationFailed');
        this.elements.secretInputStatus.className = 'input-status invalid';
      }
      if (this.elements.btnSecretInputVerify) {
        this.elements.btnSecretInputVerify.disabled = true;
      }
    }
  }

  /**
   * 验证并保存 Secret
   */
  async verifyAndSaveSecret() {
    const input = this.elements.secretInputField?.value?.trim();
    if (!input) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      // 显示验证中状态，禁用所有按钮
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = t('notifications.connectingServer');
        this.elements.secretInputStatus.className = 'input-status validating';
      }
      if (this.elements.btnSecretInputVerify) {
        this.elements.btnSecretInputVerify.disabled = true;
        this.elements.btnSecretInputVerify.textContent = t('common.verifying');
      }
      if (this.elements.btnSecretInputCancel) {
        this.elements.btnSecretInputCancel.disabled = true;
      }
      if (this.elements.secretInputCloseBtn) {
        this.elements.secretInputCloseBtn.disabled = true;
      }
      
      // 验证 Secret 有效性（连接服务器）
      const verifyResult = await window.browserControlManager?.verifyHappySecret?.(input);
      
      if (verifyResult?.success) {
        // 更新状态：正在初始化账户（服务启动阶段）
        if (this.elements.secretInputStatus) {
          this.elements.secretInputStatus.textContent = t('notifications.initializingAccount');
          this.elements.secretInputStatus.className = 'input-status validating';
        }
        
        // 保存 Secret（传递 token 以便同步到 ~/.happy/access.key）
        const saveResult = await window.browserControlManager?.saveHappySecret?.(verifyResult.normalized, verifyResult.token);
        
        if (saveResult?.success) {
          this.hideSecretInputDialog();
          // 传递保存结果以便后续判断是否需要重启
          this.showSetupCompleteDialog(saveResult);
          
          // 刷新账户 UI 状态
          await this.loadAccountInfo();
        } else {
          if (this.elements.secretInputStatus) {
            this.elements.secretInputStatus.textContent = '✗ ' + t('notifications.saveFailed') + ': ' + (saveResult?.error || t('errors.unknownError'));
            this.elements.secretInputStatus.className = 'input-status invalid';
          }
        }
      } else {
        if (this.elements.secretInputStatus) {
          this.elements.secretInputStatus.textContent = '✗ ' + (verifyResult?.error || t('notifications.validationFailed'));
          this.elements.secretInputStatus.className = 'input-status invalid';
        }
      }
    } catch (error) {
      console.error('[AccountSetup] verifyAndSaveSecret error:', error);
      if (this.elements.secretInputStatus) {
        this.elements.secretInputStatus.textContent = '✗ ' + t('notifications.validationFailed') + ': ' + error.message;
        this.elements.secretInputStatus.className = 'input-status invalid';
      }
    } finally {
      // 恢复所有按钮状态
      if (this.elements.btnSecretInputVerify) {
        this.elements.btnSecretInputVerify.disabled = false;
        this.elements.btnSecretInputVerify.textContent = t('notifications.verifyAndLogin');
      }
      if (this.elements.btnSecretInputCancel) {
        this.elements.btnSecretInputCancel.disabled = false;
      }
      if (this.elements.secretInputCloseBtn) {
        this.elements.secretInputCloseBtn.disabled = false;
      }
    }
  }

  // ============================================================================
  // 设置完成对话框相关方法
  // ============================================================================

  /**
   * 显示设置完成对话框
   * @param {Object} saveResult 保存结果（可选）
   */
  showSetupCompleteDialog(saveResult = null) {
    // 保存结果供 hideSetupCompleteDialog 使用
    this._lastSaveResult = saveResult;
    if (this.elements.setupCompleteDialog) {
      this.elements.setupCompleteDialog.style.display = 'flex';
    }
  }

  /**
   * 隐藏设置完成对话框
   */
  hideSetupCompleteDialog() {
    if (this.elements.setupCompleteDialog) {
      this.elements.setupCompleteDialog.style.display = 'none';
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    // 根据保存结果决定是否显示重启提示
    const saveResult = this._lastSaveResult;
    if (saveResult?.hotSwitched) {
      // 热切换成功，无需重启
      this.showNotification(t('notifications.accountSwitched'), 'success');
    } else if (saveResult?.needsRestart) {
      // 需要重启
      this.showRestartPrompt();
    }
    // 清除保存的结果
    this._lastSaveResult = null;
  }

  /**
   * 显示重启提示
   */
  showRestartPrompt() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (this.elements.restartSection) {
      this.elements.restartSection.style.display = 'block';
    }
    this.showNotification(t('notifications.secretSavedNeedsRestart'), 'success');
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 显示通知
   * @param {string} message 消息
   * @param {string} type 类型
   */
  showNotification(message, type) {
    // 优先使用 NotificationManager
    if (typeof NotificationManager !== 'undefined') {
      if (type === 'success') {
        NotificationManager.success?.(message);
      } else if (type === 'error') {
        NotificationManager.error?.(message);
      } else if (type === 'warning') {
        NotificationManager.warning?.(message);
      } else {
        NotificationManager.info?.(message);
      }
    } else if (this.app?.showNotification) {
      // 回退到 app 的通知方法
      this.app.showNotification(message, type);
    }
  }

  /**
   * 获取账户信息
   * @returns {Object|null}
   */
  getAccountInfo() {
    return this.accountInfo;
  }

  /**
   * 检查是否已登录
   * @returns {boolean}
   */
  isLoggedIn() {
    return this.accountInfo?.hasSecret === true;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.AccountSetup = AccountSetup;
}
