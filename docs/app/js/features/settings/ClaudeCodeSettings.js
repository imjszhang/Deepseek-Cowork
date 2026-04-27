/**
 * ClaudeCodeSettings - Claude Code 配置模块
 * 管理 Claude Code 的提供商、Token、模型等设置
 * 
 * @created 2026-01-16
 * @module features/settings/ClaudeCodeSettings
 */

class ClaudeCodeSettings {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 当前设置
    this.provider = 'anthropic';
    this.hasAuthToken = false;
    this.tokenVisible = false;
    
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
      // 提供商选择
      providerSelect: document.getElementById('claude-provider'),
      
      // API 配置
      baseurlItem: document.getElementById('claude-baseurl-item'),
      baseurlInput: document.getElementById('claude-baseurl'),
      modelItem: document.getElementById('claude-model-item'),
      modelInput: document.getElementById('claude-model'),
      
      // Auth Token
      authTokenInput: document.getElementById('claude-auth-token'),
      tokenStatus: document.getElementById('claude-token-status'),
      toggleTokenBtn: document.getElementById('btn-toggle-claude-token'),
      saveTokenBtn: document.getElementById('btn-save-claude-token'),
      
      // 其他设置
      timeoutInput: document.getElementById('claude-timeout'),
      disableNonessentialCheckbox: document.getElementById('claude-disable-nonessential'),
      
      // 保存按钮
      saveSettingsBtn: document.getElementById('btn-save-claude-settings')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    this.elements.providerSelect?.addEventListener('change', () => this.onProviderChange());
    this.elements.toggleTokenBtn?.addEventListener('click', () => this.toggleTokenVisibility());
    this.elements.saveTokenBtn?.addEventListener('click', () => this.saveToken());
    this.elements.saveSettingsBtn?.addEventListener('click', () => this.saveSettings());
  }

  /**
   * 加载 Claude Code 设置
   */
  async load() {
    try {
      console.log('[ClaudeCodeSettings] Loading...');
      const settings = await window.browserControlManager.getClaudeCodeSettings();
      console.log('[ClaudeCodeSettings] Settings:', settings);
      
      // 提供商 - 先设置值，然后只更新 UI 显示状态（不自动填充预设值）
      const provider = settings.provider || 'anthropic';
      this.provider = provider;
      if (this.elements.providerSelect) {
        this.elements.providerSelect.value = provider;
      }
      
      // 根据提供商显示/隐藏自定义字段（不触发预设填充）
      const showCustomFields = provider !== 'anthropic';
      if (this.elements.baseurlItem) {
        this.elements.baseurlItem.style.display = showCustomFields ? 'flex' : 'none';
      }
      if (this.elements.modelItem) {
        this.elements.modelItem.style.display = showCustomFields ? 'flex' : 'none';
      }
      
      // API 端点 - 使用保存的值
      if (this.elements.baseurlInput) {
        this.elements.baseurlInput.value = settings.baseUrl || '';
      }
      
      // Auth Token 状态
      this.hasAuthToken = settings.hasAuthToken;
      this.updateTokenStatus(settings.hasAuthToken);
      
      // 模型 - 使用保存的值
      if (this.elements.modelInput) {
        this.elements.modelInput.value = settings.model || '';
      }
      
      // 超时时间
      if (this.elements.timeoutInput) {
        this.elements.timeoutInput.value = settings.timeoutMs || 600000;
      }
      
      // 禁用非必要流量
      if (this.elements.disableNonessentialCheckbox) {
        this.elements.disableNonessentialCheckbox.checked = settings.disableNonessential || false;
      }
      
    } catch (error) {
      console.error('[ClaudeCodeSettings] Load error:', error);
    }
  }

  /**
   * 处理提供商切换
   */
  async onProviderChange() {
    const provider = this.elements.providerSelect?.value || 'anthropic';
    this.provider = provider;
    
    // 根据提供商显示/隐藏自定义字段
    const showCustomFields = provider !== 'anthropic';
    
    if (this.elements.baseurlItem) {
      this.elements.baseurlItem.style.display = showCustomFields ? 'flex' : 'none';
    }
    if (this.elements.modelItem) {
      this.elements.modelItem.style.display = showCustomFields ? 'flex' : 'none';
    }
    
    // 如果选择了预设提供商，自动填充预设值
    if (provider !== 'custom' && provider !== 'anthropic') {
      try {
        const presets = await window.browserControlManager.getClaudeCodePresets();
        const preset = presets[provider];
        if (preset) {
          if (this.elements.baseurlInput) {
            this.elements.baseurlInput.value = preset.baseUrl || '';
          }
          if (this.elements.modelInput) {
            this.elements.modelInput.value = preset.model || '';
          }
        }
      } catch (error) {
        console.error('[ClaudeCodeSettings] Error loading presets:', error);
      }
    }
    
    // 清空 anthropic 的自定义值
    if (provider === 'anthropic') {
      if (this.elements.baseurlInput) {
        this.elements.baseurlInput.value = '';
      }
      if (this.elements.modelInput) {
        this.elements.modelInput.value = '';
      }
    }
  }

  /**
   * 切换 Token 显示/隐藏
   */
  toggleTokenVisibility() {
    this.tokenVisible = !this.tokenVisible;
    
    if (this.elements.authTokenInput) {
      this.elements.authTokenInput.type = this.tokenVisible ? 'text' : 'password';
    }
    
    if (this.elements.toggleTokenBtn) {
      const span = this.elements.toggleTokenBtn.querySelector('span');
      if (span) {
        span.textContent = this.tokenVisible ? '🙈' : '👁';
      }
    }
  }

  /**
   * 更新 Token 状态显示
   * @param {boolean} hasToken 是否已配置
   */
  updateTokenStatus(hasToken) {
    this.hasAuthToken = hasToken;
    
    if (this.elements.tokenStatus) {
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      if (hasToken) {
        this.elements.tokenStatus.textContent = '✓ ' + t('settings.configured');
        this.elements.tokenStatus.className = 'setting-status configured';
      } else {
        this.elements.tokenStatus.textContent = '✗ ' + t('settings.notConfigured');
        this.elements.tokenStatus.className = 'setting-status not-configured';
      }
    }
  }

  /**
   * 保存 Auth Token
   */
  async saveToken() {
    const token = this.elements.authTokenInput?.value?.trim();
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      if (this.elements.saveTokenBtn) {
        this.elements.saveTokenBtn.disabled = true;
        this.elements.saveTokenBtn.textContent = t('common.saving');
      }
      
      if (token) {
        await window.browserControlManager.setClaudeAuthToken(token);
        this.updateTokenStatus(true);
        this.app?.showNotification?.(t('notifications.tokenSaved'), 'success');
      } else {
        await window.browserControlManager.deleteClaudeAuthToken();
        this.updateTokenStatus(false);
        this.app?.showNotification?.(t('notifications.tokenDeleted'), 'info');
      }
      
      // 清空输入框
      if (this.elements.authTokenInput) {
        this.elements.authTokenInput.value = '';
      }
      
      // 显示重启提示
      this.app?.showRestartPrompt?.();
      
    } catch (error) {
      console.error('[ClaudeCodeSettings] Save token error:', error);
      this.app?.showNotification?.(t('notifications.saveFailed') + ': ' + error.message, 'error');
    } finally {
      if (this.elements.saveTokenBtn) {
        this.elements.saveTokenBtn.disabled = false;
        this.elements.saveTokenBtn.textContent = t('common.save');
      }
    }
  }

  /**
   * 保存 Claude Code 设置
   */
  async saveSettings() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      if (this.elements.saveSettingsBtn) {
        this.elements.saveSettingsBtn.disabled = true;
        this.elements.saveSettingsBtn.textContent = t('common.saving');
      }

      const provider = this.elements.providerSelect?.value || 'anthropic';
      const model = this.elements.modelInput?.value?.trim() || null;
      const isDeepSeek = provider === 'deepseek';
      const deepSeekMainModel = model || 'deepseek-v4-pro';
      const settings = {
        provider,
        baseUrl: this.elements.baseurlInput?.value?.trim() || null,
        model,
        smallFastModel: isDeepSeek ? 'deepseek-v4-flash' : model,
        defaultOpusModel: isDeepSeek ? deepSeekMainModel : null,
        defaultSonnetModel: isDeepSeek ? deepSeekMainModel : null,
        defaultHaikuModel: isDeepSeek ? 'deepseek-v4-flash' : null,
        subagentModel: isDeepSeek ? 'deepseek-v4-flash' : null,
        effortLevel: isDeepSeek ? 'max' : null,
        timeoutMs: parseInt(this.elements.timeoutInput?.value) || 600000,
        disableNonessential: this.elements.disableNonessentialCheckbox?.checked || false
      };

      // 显示正在应用配置
      if (settings.provider !== 'anthropic' && this.elements.saveSettingsBtn) {
        this.elements.saveSettingsBtn.textContent = t('notifications.applyingConfig');
      }

      const result = await window.browserControlManager.saveClaudeCodeSettings(settings);

      if (result.success) {
        if (result.daemonRestarted) {
          this.app?.showNotification?.(t('notifications.configSavedAndApplied'), 'success');
        } else if (result.needsRestart) {
          this.app?.showNotification?.(t('notifications.configSavedNeedsRestart'), 'warning');
          this.app?.showRestartPrompt?.();
        } else {
          this.app?.showNotification?.(t('notifications.configSaved'), 'success');
        }
      } else {
        this.app?.showNotification?.(t('notifications.saveFailed') + ': ' + (result.error || t('errors.unknownError')), 'error');
      }

    } catch (error) {
      console.error('[ClaudeCodeSettings] Save settings error:', error);
      this.app?.showNotification?.(t('notifications.saveFailed') + ': ' + error.message, 'error');
    } finally {
      if (this.elements.saveSettingsBtn) {
        this.elements.saveSettingsBtn.disabled = false;
        this.elements.saveSettingsBtn.textContent = t('settings.saveClaudeConfig');
      }
    }
  }

  /**
   * 获取当前提供商
   * @returns {string}
   */
  getProvider() {
    return this.provider;
  }

  /**
   * 检查是否有 Auth Token
   * @returns {boolean}
   */
  hasToken() {
    return this.hasAuthToken;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ClaudeCodeSettings = ClaudeCodeSettings;
}
