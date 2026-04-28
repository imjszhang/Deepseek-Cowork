/**
 * SetupWizard - 设置向导模块
 * 引导用户完成初始设置
 * 
 * @created 2026-01-16
 * @updated 2026-01-16 - 从 app.js 迁移所有向导方法
 * @module wizards/SetupWizard
 */

class SetupWizard {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 当前步骤
    this.currentWizardStep = 1;
    this.totalSteps = 4;
    
    // 需求检查状态
    this.wizardRequirements = null;
    
    // 当前安装命令
    this.currentInstallCommand = null;
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
      // 向导覆盖层
      overlay: document.getElementById('setup-wizard-overlay'),
      steps: document.querySelectorAll('.wizard-steps .wizard-step'),
      stepContents: document.querySelectorAll('.wizard-step-content'),
      
      // Step 1 按钮
      skipBtn: document.getElementById('wizard-skip-btn'),
      startBtn: document.getElementById('wizard-start-btn'),
      
      // Step 2 元素
      prev2: document.getElementById('wizard-prev-2'),
      installClaudeBtn: document.getElementById('wizard-install-claude-btn'),
      recheck2: document.getElementById('wizard-recheck-2'),
      next2: document.getElementById('wizard-next-2'),
      copyCommandBtn: document.getElementById('copy-command-btn'),
      openClaudeDocsBtn: document.getElementById('open-claude-docs-btn'),
      claudeInstallStatus: document.getElementById('claude-install-status'),
      claudeInstallMethods: document.getElementById('claude-install-methods'),
      claudeCommandText: document.getElementById('claude-command-text'),
      requirementsList: document.getElementById('requirements-list'),
      
      // Step 3 元素
      provider: document.getElementById('wizard-provider'),
      baseUrlGroup: document.getElementById('wizard-baseurl-group'),
      baseUrl: document.getElementById('wizard-baseurl'),
      apiKey: document.getElementById('wizard-api-key'),
      modelGroup: document.getElementById('wizard-model-group'),
      model: document.getElementById('wizard-model'),
      apiHint: document.getElementById('wizard-api-hint'),
      apiStatus: document.getElementById('wizard-api-status'),
      toggleApiKeyBtn: document.getElementById('toggle-api-key-btn'),
      prev3: document.getElementById('wizard-prev-3'),
      saveApi: document.getElementById('wizard-save-api'),
      
      // Step 4 元素 (完成)
      completeBtn: document.getElementById('wizard-complete-btn'),
      configSummary: document.getElementById('config-summary')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // Step 1 事件
    this.elements.skipBtn?.addEventListener('click', () => this.skip());
    this.elements.startBtn?.addEventListener('click', () => this.goToStep(2));
    
    // Step 2 事件
    this.elements.prev2?.addEventListener('click', () => this.goToStep(1));
    this.elements.installClaudeBtn?.addEventListener('click', () => this.installOrUpgradeClaudeCode());
    this.elements.recheck2?.addEventListener('click', () => this.recheckClaudeCode());
    this.elements.next2?.addEventListener('click', () => this.goToStep(3));
    this.elements.copyCommandBtn?.addEventListener('click', () => this.copyInstallCommand());
    this.elements.openClaudeDocsBtn?.addEventListener('click', () => {
      window.appBridge?.openClaudeCodeDocs?.();
    });
    
    // Step 3 事件
    this.elements.provider?.addEventListener('change', () => this.onProviderChange());
    this.elements.toggleApiKeyBtn?.addEventListener('click', () => this.toggleApiKeyVisibility());
    this.elements.prev3?.addEventListener('click', () => this.goToStep(2));
    this.elements.saveApi?.addEventListener('click', () => this.saveApiConfig());
    
    // Step 4 事件 (完成)
    this.elements.completeBtn?.addEventListener('click', () => this.complete());
  }

  getTranslator() {
    return typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
  }

  setClaudeInstallStatus(message, type = 'info') {
    const statusEl = this.elements.claudeInstallStatus;
    if (!statusEl) return;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    statusEl.className = type === 'success' ? 'install-status success' : `install-status ${type}`;
    statusEl.innerHTML = `
      <span class="status-icon">${icon}</span>
      <span class="status-text">${message}</span>
    `;
  }

  getClaudeWizardActionMode(claudeCode) {
    if (!claudeCode || claudeCode.status !== 'installed') return 'install';
    if (claudeCode.source === 'npm') return 'upgrade';
    return 'hidden';
  }

  updateClaudeInstallButton(claudeCode) {
    const t = this.getTranslator();
    const mode = this.getClaudeWizardActionMode(claudeCode);
    const btn = this.elements.installClaudeBtn;
    if (!btn) return;

    btn.style.display = mode === 'hidden' ? 'none' : 'inline-flex';
    btn.disabled = !!this.claudeActionInProgress;

    if (this.claudeActionInProgress === 'install') {
      btn.textContent = t('settings.installing');
      return;
    }
    if (this.claudeActionInProgress === 'upgrade') {
      btn.textContent = t('settings.upgrading');
      return;
    }

    btn.textContent = mode === 'upgrade' ? t('settings.upgradeNow') : t('wizard.installNow');
  }

  getClaudeActionErrorMessage(result, action) {
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

  /**
   * 检查是否需要显示向导
   * @returns {Promise<boolean>}
   */
  async shouldShow() {
    try {
      const result = await window.appBridge?.shouldShowSetup?.();
      console.log('[SetupWizard] shouldShowSetup result:', result);
      
      if (result?.shouldShow) {
        this.wizardRequirements = result.requirements;
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SetupWizard] shouldShow error:', error);
      return false;
    }
  }

  /**
   * 检查并显示向导
   */
  async checkAndShow() {
    try {
      const result = await window.appBridge?.shouldShowSetup?.();
      console.log('[SetupWizard] shouldShowSetup result:', result);
      
      if (result?.shouldShow) {
        this.wizardRequirements = result.requirements;
        this.show();
      }
    } catch (error) {
      console.error('[SetupWizard] checkAndShow error:', error);
    }
  }

  /**
   * 显示向导
   */
  async show() {
    if (!this.elements.overlay) return;
    
    // 获取最新的配置需求
    if (!this.wizardRequirements) {
      this.wizardRequirements = await window.appBridge?.getSetupRequirements?.();
    }
    
    // 渲染需求列表
    this.renderRequirementsList();
    
    // 显示覆盖层
    this.elements.overlay.style.display = 'flex';
    
    // 设置初始步骤
    this.currentWizardStep = 1;
    this.goToStep(1);
    
    console.log('[SetupWizard] Wizard shown');
  }

  /**
   * 隐藏向导
   */
  hide() {
    if (this.elements.overlay) {
      this.elements.overlay.style.display = 'none';
    }
  }

  /**
   * 渲染配置需求列表
   */
  renderRequirementsList() {
    const container = this.elements.requirementsList;
    if (!container || !this.wizardRequirements) return;
    
    container.innerHTML = '';
    
    // 渲染关键依赖
    if (this.wizardRequirements.critical) {
      this.wizardRequirements.critical.forEach(item => {
        const el = this.createRequirementItem(item, 'critical');
        container.appendChild(el);
      });
    }
    
    // 渲染推荐依赖
    if (this.wizardRequirements.recommended) {
      this.wizardRequirements.recommended.forEach(item => {
        const el = this.createRequirementItem(item, 'recommended');
        container.appendChild(el);
      });
    }
  }

  /**
   * 创建需求项 DOM 元素
   * @param {Object} item 需求项
   * @param {string} priority 优先级
   * @returns {HTMLElement}
   */
  createRequirementItem(item, priority) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const div = document.createElement('div');
    const statusClass = item.status === 'missing' ? priority : item.status;
    div.className = `requirement-item ${statusClass}`;
    
    let icon = '❌';
    let badgeClass = 'missing';
    let badgeText = t('settings.notInstalled');
    
    if (item.status === 'installed' || item.status === 'configured') {
      icon = '✅';
      badgeClass = item.status;
      badgeText = item.status === 'configured' ? t('settings.configured') : t('settings.installed');
    } else if (priority === 'recommended') {
      icon = '⚠️';
      badgeText = t('settings.recommendedInstall');
    }
    
    let statusInfo = item.description || '';
    if (item.version) {
      statusInfo = `版本: ${item.version}`;
    }
    
    div.innerHTML = `
      <span class="requirement-icon">${icon}</span>
      <div class="requirement-info">
        <div class="requirement-name">${item.name}</div>
        <div class="requirement-status">${statusInfo}</div>
      </div>
      <span class="requirement-badge ${badgeClass}">${badgeText}</span>
    `;
    
    return div;
  }

  /**
   * 跳转到指定向导步骤
   * @param {number} step 步骤号
   */
  goToStep(step) {
    this.currentWizardStep = step;
    
    // 更新步骤指示器
    this.elements.steps?.forEach((el, index) => {
      el.classList.remove('active', 'completed');
      if (index + 1 < step) {
        el.classList.add('completed');
      } else if (index + 1 === step) {
        el.classList.add('active');
      }
    });
    
    // 更新步骤内容
    this.elements.stepContents?.forEach(el => {
      el.classList.remove('active');
      if (parseInt(el.dataset.step) === step) {
        el.classList.add('active');
      }
    });
    
    // 步骤特定初始化
    if (step === 2) {
      this.initClaudeCodeStep();
    } else if (step === 3) {
      this.initApiConfigStep();
    } else if (step === 4) {
      this.initCompleteStep();
    }
  }

  /**
   * 初始化 Claude Code 安装步骤
   */
  async initClaudeCodeStep() {
    const t = this.getTranslator();
    const commandEl = this.elements.claudeCommandText;
    
    // 检测 Claude Code 状态
    const claudeCode = this.wizardRequirements?.critical?.find(c => c.id === 'claudeCode');
    
    if (claudeCode?.status === 'installed') {
      this.setClaudeInstallStatus(`Claude Code ${t('settings.installedVersion', { version: claudeCode.version || 'unknown' })}`, 'success');
      if (this.elements.next2) {
        this.elements.next2.disabled = false;
      }
    } else {
      this.setClaudeInstallStatus(t('wizard.installClaudeMissing'));
      if (this.elements.next2) {
        this.elements.next2.disabled = true;
      }
    }

    this.updateClaudeInstallButton(claudeCode);
    
    // 渲染安装命令
    const guide = claudeCode?.guide;
    if (guide && commandEl) {
      const method = guide.methods?.[0];
      if (method?.command) {
        commandEl.textContent = method.command;
        this.currentInstallCommand = method.command;
      } else if (method?.url) {
        commandEl.textContent = method.url;
        this.currentInstallCommand = method.url;
      }
    }
  }

  async installOrUpgradeClaudeCode() {
    const t = this.getTranslator();
    const claudeCode = this.wizardRequirements?.critical?.find(c => c.id === 'claudeCode');
    const action = this.getClaudeWizardActionMode(claudeCode) === 'upgrade' ? 'upgrade' : 'install';
    const methodName = action === 'upgrade' ? 'upgradeClaudeCode' : 'installClaudeCode';

    try {
      this.claudeActionInProgress = action;
      this.updateClaudeInstallButton(claudeCode);
      this.setClaudeInstallStatus(
        action === 'upgrade' ? t('settings.upgrading') : t('settings.installing'),
        'info'
      );

      const result = await window.appBridge?.[methodName]?.();
      if (result?.success) {
        this.wizardRequirements = await window.appBridge?.recheckSetup?.();
        this.renderRequirementsList();
        await this.initClaudeCodeStep();

        const successMessage = action === 'upgrade'
          ? t('notifications.claudeCodeUpgraded')
          : t('notifications.claudeCodeInstalled');
        const versionSuffix = result?.status?.version ? ` (v${result.status.version})` : '';
        this.showNotification(successMessage + versionSuffix, 'success');
        return;
      }

      const errorMessage = this.getClaudeActionErrorMessage(result, action);
      this.setClaudeInstallStatus(errorMessage, 'error');
      this.showNotification(errorMessage, 'error');
    } catch (error) {
      console.error('[SetupWizard] Claude Code install action error:', error);
      const fallback = action === 'upgrade'
        ? t('notifications.claudeCodeUpgradeFailed')
        : t('notifications.claudeCodeInstallFailed');
      const message = `${fallback}: ${error.message}`;
      this.setClaudeInstallStatus(message, 'error');
      this.showNotification(message, 'error');
    } finally {
      this.claudeActionInProgress = null;
      this.updateClaudeInstallButton(this.wizardRequirements?.critical?.find(c => c.id === 'claudeCode'));
    }
  }

  /**
   * 重新检测 Claude Code
   */
  async recheckClaudeCode() {
    const t = this.getTranslator();
    const recheckBtn = this.elements.recheck2;
    
    if (recheckBtn) {
      recheckBtn.textContent = t('common.checking');
      recheckBtn.disabled = true;
    }
    
    try {
      // 重新检测
      this.wizardRequirements = await window.appBridge?.recheckSetup?.();
      
      // 更新需求列表
      this.renderRequirementsList();
      
      // 更新当前步骤
      this.initClaudeCodeStep();
      
      // 检测通过通知
      const claudeCode = this.wizardRequirements?.critical?.find(c => c.id === 'claudeCode');
      if (claudeCode?.status === 'installed') {
        this.showNotification(t('notifications.claudeCodeDetected'), 'success');
      }
    } catch (error) {
      console.error('[SetupWizard] Recheck error:', error);
      this.showNotification(t('notifications.detectFailed') + ': ' + error.message, 'error');
    } finally {
      if (recheckBtn) {
        recheckBtn.textContent = t('common.recheck');
        recheckBtn.disabled = false;
      }
    }
  }

  /**
   * 复制安装命令
   */
  async copyInstallCommand() {
    if (!this.currentInstallCommand) return;
    
    try {
      await navigator.clipboard.writeText(this.currentInstallCommand);
      
      const btn = this.elements.copyCommandBtn;
      if (btn) {
        btn.classList.add('copied');
        btn.innerHTML = '<span>✓</span>';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<span>📋</span>';
        }, 2000);
      }
    } catch (error) {
      console.error('[SetupWizard] Copy failed:', error);
    }
  }

  /**
   * 初始化 API 配置步骤
   */
  initApiConfigStep() {
    // 默认选择 DeepSeek
    if (this.elements.provider) {
      this.elements.provider.value = 'deepseek';
      this.onProviderChange();
    }
  }

  /**
   * Provider 变化处理
   */
  onProviderChange() {
    const provider = this.elements.provider?.value;
    
    // 根据 provider 显示/隐藏相关字段
    const showCustomFields = provider === 'custom';
    const showDeepseekFields = provider === 'deepseek';
    
    if (this.elements.baseUrlGroup) {
      this.elements.baseUrlGroup.style.display = showCustomFields ? 'block' : 'none';
    }
    if (this.elements.modelGroup) {
      this.elements.modelGroup.style.display = (showCustomFields || showDeepseekFields) ? 'block' : 'none';
    }
    
    // 更新提示文本
    if (this.elements.apiHint) {
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      if (provider === 'deepseek') {
        this.elements.apiHint.textContent = t('notifications.enterDeepSeekKey');
        if (this.elements.model) this.elements.model.placeholder = 'deepseek-v4-pro[1m]';
      } else if (provider === 'anthropic') {
        this.elements.apiHint.textContent = t('notifications.enterAnthropicKey');
      } else {
        this.elements.apiHint.textContent = t('notifications.enterApiKey');
      }
    }
    
    // 设置默认 base URL
    if (showDeepseekFields && this.elements.baseUrl) {
      this.elements.baseUrl.value = 'https://api.deepseek.com/anthropic';
    }
  }

  /**
   * 切换 API Key 可见性
   */
  toggleApiKeyVisibility() {
    if (this.elements.apiKey) {
      const isPassword = this.elements.apiKey.type === 'password';
      this.elements.apiKey.type = isPassword ? 'text' : 'password';
      if (this.elements.toggleApiKeyBtn) {
        this.elements.toggleApiKeyBtn.innerHTML = isPassword ? '<span>🔒</span>' : '<span>👁</span>';
      }
    }
  }

  /**
   * 保存 API 配置
   */
  async saveApiConfig() {
    const provider = this.elements.provider?.value;
    const apiKey = this.elements.apiKey?.value?.trim();
    const baseUrl = this.elements.baseUrl?.value?.trim();
    const model = this.elements.model?.value?.trim();
    
    if (!apiKey) {
      this.showApiStatus('请输入 API Key', 'error');
      return;
    }
    
    // 显示保存中状态
    const t = this.getTranslator();
    if (this.elements.saveApi) {
      this.elements.saveApi.textContent = t('common.saving');
      this.elements.saveApi.disabled = true;
    }
    
    try {
      // 构建配置
      const settings = {
        provider: provider,
        authToken: apiKey
      };
      
      if (provider === 'deepseek') {
        settings.baseUrl = 'https://api.deepseek.com/anthropic';
        settings.model = model || 'deepseek-v4-pro[1m]';
        settings.smallFastModel = 'deepseek-v4-flash';
        settings.defaultOpusModel = settings.model;
        settings.defaultSonnetModel = settings.model;
        settings.defaultHaikuModel = 'deepseek-v4-flash';
        settings.subagentModel = 'deepseek-v4-flash';
        settings.effortLevel = 'max';
      } else if (provider === 'custom') {
        settings.baseUrl = baseUrl;
        settings.model = model;
      }
      
      // 保存配置
      const result = await window.appBridge?.saveClaudeCodeSettings?.(settings);
      
      if (result?.success) {
        this.showApiStatus('配置保存成功', 'success');
        
        // 更新需求状态
        this.wizardRequirements = await window.appBridge?.recheckSetup?.();
        
        // 进入完成页
        setTimeout(() => {
          this.goToStep(4);
        }, 500);
      } else {
        this.showApiStatus('保存失败: ' + (result?.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('[SetupWizard] Save API config error:', error);
      this.showApiStatus('保存失败: ' + error.message, 'error');
    } finally {
      if (this.elements.saveApi) {
        this.elements.saveApi.textContent = t('notifications.saveConfig');
        this.elements.saveApi.disabled = false;
      }
    }
  }

  /**
   * 显示 API 配置状态
   * @param {string} message 消息
   * @param {string} type 类型
   */
  showApiStatus(message, type) {
    if (this.elements.apiStatus) {
      this.elements.apiStatus.textContent = message;
      this.elements.apiStatus.className = `api-config-status ${type}`;
      this.elements.apiStatus.style.display = 'block';
    }
  }

  /**
   * 初始化完成步骤
   */
  initCompleteStep() {
    const summaryEl = this.elements.configSummary;
    if (!summaryEl) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 生成配置摘要
    const claudeCode = this.wizardRequirements?.critical?.find(c => c.id === 'claudeCode');
    const apiKey = this.wizardRequirements?.critical?.find(c => c.id === 'apiKey');
    const provider = this.elements.provider?.value || 'unknown';
    
    const claudeCodeStatus = claudeCode?.status === 'installed' 
      ? '✅ ' + t('settings.installedVersion', { version: claudeCode?.version || '' })
      : '⚠️ ' + t('settings.notInstalled');
    const apiKeyStatus = apiKey?.status === 'configured'
      ? '✅ ' + t('settings.configured')
      : '⚠️ ' + t('settings.notConfigured');
    
    summaryEl.innerHTML = `
      <div class="summary-item">
        <span class="summary-label">Claude Code</span>
        <span class="summary-value">${claudeCodeStatus}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">${t('settings.apiProvider')}</span>
        <span class="summary-value">${this.getProviderDisplayName(provider)}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">API Key</span>
        <span class="summary-value">${apiKeyStatus}</span>
      </div>
    `;
  }

  /**
   * 获取提供商显示名称
   * @param {string} provider Provider ID
   * @returns {string}
   */
  getProviderDisplayName(provider) {
    const names = {
      'deepseek': 'DeepSeek',
      'anthropic': 'Anthropic (Official)',
      'custom': 'Custom'
    };
    const t = this.getTranslator();
    // Try to get localized names
    const localizedNames = {
      'deepseek': 'DeepSeek',
      'anthropic': t('settings.providerAnthropic'),
      'custom': t('settings.providerCustom')
    };
    return localizedNames[provider] || names[provider] || provider;
  }

  /**
   * 跳过设置向导
   */
  async skip() {
    const t = this.getTranslator();
    try {
      await window.appBridge?.skipSetup?.();
      this.hide();
      this.showNotification(t('notifications.configLater'), 'info');
    } catch (error) {
      console.error('[SetupWizard] Skip error:', error);
    }
  }

  /**
   * 完成设置向导
   */
  async complete() {
    const t = this.getTranslator();
    try {
      await window.appBridge?.completeSetup?.();
      this.hide();
      this.showNotification(t('notifications.configComplete'), 'success');
      
      // 通知 app 刷新账户信息
      if (this.app?.loadAccountInfo) {
        await this.app.loadAccountInfo();
      }
    } catch (error) {
      console.error('[SetupWizard] Complete error:', error);
    }
  }

  /**
   * 重新运行设置向导
   */
  async rerun() {
    const t = this.getTranslator();
    try {
      // 重置向导状态
      await window.appBridge?.resetSetupWizard?.();
      
      // 获取最新需求
      this.wizardRequirements = await window.appBridge?.getSetupRequirements?.();
      
      // 显示向导
      this.show();
    } catch (error) {
      console.error('[SetupWizard] Rerun error:', error);
      this.showNotification(t('notifications.cannotStartWizard') + ': ' + error.message, 'error');
    }
  }

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
   * 获取当前步骤
   * @returns {number}
   */
  getCurrentStep() {
    return this.currentWizardStep;
  }

  /**
   * 获取需求状态
   * @returns {Object|null}
   */
  getRequirements() {
    return this.wizardRequirements;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.SetupWizard = SetupWizard;
}
