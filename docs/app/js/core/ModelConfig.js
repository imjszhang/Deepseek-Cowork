/**
 * ModelConfig - 模型配置常量
 * 包含各 AI 模型的上下文窗口大小和输出限制
 * 
 * @created 2026-01-16
 * @module core/ModelConfig
 */

// 模型配置映射表
const MODEL_CONFIGS = {
  // DeepSeek 系列
  'deepseek-chat': {
    name: 'DeepSeek-V3.2',
    contextSize: 128000,
    maxOutput: 8000
  },
  'deepseek-reasoner': {
    name: 'DeepSeek-R1',
    contextSize: 128000,
    maxOutput: 64000
  },
  // Claude 系列
  'claude-3-5-sonnet-20241022': {
    name: 'Claude 3.5 Sonnet',
    contextSize: 200000,
    maxOutput: 8192
  },
  'claude-3-5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    contextSize: 200000,
    maxOutput: 8192
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    contextSize: 200000,
    maxOutput: 4096
  },
  'claude-3-haiku': {
    name: 'Claude 3 Haiku',
    contextSize: 200000,
    maxOutput: 4096
  },
  // 默认配置（保守值）
  'default': {
    name: 'Unknown',
    contextSize: 128000,
    maxOutput: 8000
  }
};

// Provider 到默认模型的映射
const PROVIDER_DEFAULT_MODELS = {
  'deepseek': 'deepseek-chat',
  'anthropic': 'claude-3-5-sonnet'
};

// 兼容旧代码的默认值
const DEFAULT_CONTEXT_SIZE = 128000;

// 导出到全局
if (typeof window !== 'undefined') {
  window.MODEL_CONFIGS = MODEL_CONFIGS;
  window.PROVIDER_DEFAULT_MODELS = PROVIDER_DEFAULT_MODELS;
  window.DEFAULT_CONTEXT_SIZE = DEFAULT_CONTEXT_SIZE;
}
