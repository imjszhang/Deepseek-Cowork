/**
 * UsageDisplay - Token 用量显示模块
 * 显示 AI 模型的 Token 使用量和上下文信息
 * 
 * @created 2026-01-16
 * @module features/happy-ai/UsageDisplay
 */

class UsageDisplay {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 当前使用量数据
    this.usageData = null;
    
    // 是否始终显示上下文大小
    this.alwaysShowContextSize = true;
    
    // 模型配置状态
    this.currentModel = null;        // 当前模型 ID (如 'deepseek-chat')
    this.currentProvider = null;     // 当前 provider (如 'deepseek')
    this.currentModelConfig = null;  // 当前模型配置
  }

  /**
   * 初始化
   */
  async init() {
    // 设置默认配置
    this.currentModelConfig = (typeof MODEL_CONFIGS !== 'undefined' && MODEL_CONFIGS['default']) 
      || { contextSize: 128000, maxOutput: 8000, name: 'default' };
    
    // 加载模型配置
    await this.loadModelConfig();
  }

  /**
   * 从设置加载当前模型配置
   * 优先级：设置中的 model > provider 默认模型 > 全局默认
   */
  async loadModelConfig() {
    try {
      const settings = await (window.apiAdapter || window.browserControlManager)?.getClaudeCodeSettings?.();
      if (settings) {
        this.currentProvider = settings.provider || 'deepseek';
        this.currentModel = settings.model || null;
        
        // 1. 尝试直接匹配 model
        if (this.currentModel && typeof MODEL_CONFIGS !== 'undefined' && MODEL_CONFIGS[this.currentModel]) {
          this.currentModelConfig = MODEL_CONFIGS[this.currentModel];
          console.log(`[UsageDisplay] Using model config: ${this.currentModel}`, this.currentModelConfig);
          return;
        }
        
        // 2. 尝试 provider 默认模型
        if (typeof PROVIDER_DEFAULT_MODELS !== 'undefined') {
          const defaultModel = PROVIDER_DEFAULT_MODELS[this.currentProvider];
          if (defaultModel && typeof MODEL_CONFIGS !== 'undefined' && MODEL_CONFIGS[defaultModel]) {
            this.currentModel = defaultModel;
            this.currentModelConfig = MODEL_CONFIGS[defaultModel];
            console.log(`[UsageDisplay] Using provider default: ${defaultModel}`, this.currentModelConfig);
            return;
          }
        }
      }
    } catch (error) {
      console.warn('[UsageDisplay] Failed to load settings:', error);
    }
    
    // 3. 使用全局默认
    this.currentModelConfig = (typeof MODEL_CONFIGS !== 'undefined' && MODEL_CONFIGS['default'])
      || { contextSize: 128000, maxOutput: 8000, name: 'default' };
    console.log('[UsageDisplay] Using default config', this.currentModelConfig);
  }

  /**
   * 获取当前模型的最大上下文大小
   * @returns {number} 上下文窗口大小
   */
  getMaxContextSize() {
    const defaultSize = (typeof DEFAULT_CONTEXT_SIZE !== 'undefined') ? DEFAULT_CONTEXT_SIZE : 128000;
    return this.currentModelConfig?.contextSize || defaultSize;
  }

  /**
   * 获取当前模型名称（显示用户实际配置的模型）
   * @returns {string} 模型名称
   */
  getCurrentModelName() {
    // 优先显示用户实际配置的模型名称
    return this.currentModel || this.currentModelConfig?.name || 'Unknown';
  }

  /**
   * 计算上下文警告级别
   * @param {number} contextSize 上下文大小
   * @returns {Object|null} 警告信息 { level, text } 或 null
   */
  getContextWarning(contextSize) {
    const maxContextSize = this.getMaxContextSize();
    const percentageUsed = (contextSize / maxContextSize) * 100;
    const percentageRemaining = Math.max(0, Math.min(100, 100 - percentageUsed));

    if (percentageRemaining <= 5) {
      return { level: 'critical', text: `${Math.round(percentageRemaining)}% left` };
    } else if (percentageRemaining <= 10) {
      return { level: 'warning', text: `${Math.round(percentageRemaining)}% left` };
    } else if (this.alwaysShowContextSize) {
      return { level: 'normal', text: `${Math.round(percentageRemaining)}% left` };
    }
    return null;
  }

  /**
   * 格式化 token 数量显示
   * @param {number} tokens token 数量
   * @returns {string} 格式化后的字符串
   */
  formatTokensDisplay(tokens) {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  }

  /**
   * 更新上下文使用量显示
   * @param {Object} usage 使用量数据
   */
  updateUsageDisplay(usage) {
    this.usageData = usage;
    const contextBar = document.getElementById('ai-context-bar');

    // 获取 app 的连接状态
    const aiConnected = this.app?.aiConnected ?? false;

    if (!contextBar) return;

    // 如果没有数据或未连接，隐藏状态栏
    if (!usage || !aiConnected) {
      contextBar.style.display = 'none';
      return;
    }

    // 显示状态栏
    contextBar.style.display = 'block';

    // 更新 token 显示
    // Input 显示完整的上下文大小（contextSize = cacheCreation + cacheRead + inputTokens）
    // 因为使用 prompt caching 时，inputTokens 只包含新增部分，不包含缓存中的历史
    const inputTokensEl = document.getElementById('context-input-tokens');
    const outputTokensEl = document.getElementById('context-output-tokens');

    if (inputTokensEl) {
      inputTokensEl.textContent = this.formatTokensDisplay(usage.contextSize || 0);
    }
    if (outputTokensEl) {
      outputTokensEl.textContent = this.formatTokensDisplay(usage.outputTokens || 0);
    }

    // 更新模型名称显示
    const modelNameEl = document.getElementById('context-model-name');
    if (modelNameEl) {
      modelNameEl.textContent = this.getCurrentModelName();
    }

    // 计算并更新上下文警告
    const warning = this.getContextWarning(usage.contextSize || 0);
    const remainingEl = document.getElementById('context-remaining');
    const percentEl = document.getElementById('context-percent');
    const fillEl = document.getElementById('context-fill');

    // 获取动态上下文大小
    const maxContextSize = this.getMaxContextSize();

    if (warning && remainingEl && percentEl && fillEl) {
      percentEl.textContent = warning.text;
      remainingEl.className = `context-remaining ${warning.level}`;

      // 计算已使用百分比
      const percentUsed = (usage.contextSize / maxContextSize) * 100;
      fillEl.style.width = `${Math.min(percentUsed, 100)}%`;
      fillEl.className = `context-fill ${warning.level}`;
    }
  }

  /**
   * 隐藏上下文使用量显示
   */
  hideUsageDisplay() {
    const contextBar = document.getElementById('ai-context-bar');
    if (contextBar) {
      contextBar.style.display = 'none';
    }
  }

  /**
   * 获取当前使用量数据
   * @returns {Object|null}
   */
  getData() {
    return this.usageData;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.UsageDisplay = UsageDisplay;
}
