/**
 * Command Suggestions Module
 * 命令建议模块 - 提供斜杠命令自动补全功能
 * 
 * 参考 happy/sources/sync/suggestionCommands.ts
 * 
 * @module features/command-suggestions
 */

/**
 * 命令项
 * @typedef {Object} CommandItem
 * @property {string} command - 命令名称（不含斜杠）
 * @property {string} [description] - 命令描述
 */

/**
 * 默认命令列表
 * @type {CommandItem[]}
 */
const DEFAULT_COMMANDS = [
  { command: 'clear', description: '清空对话历史' },
  { command: 'compact', description: '压缩对话历史' },
  { command: 'help', description: '显示帮助信息' },
  { command: 'abort', description: '中止当前任务' },
  { command: 'stop', description: '停止当前操作' },
  { command: 'reset', description: '重置会话' }
];

/**
 * 忽略的命令列表（不显示在建议中）
 * @type {string[]}
 */
const IGNORED_COMMANDS = [
  'exit',
  'quit',
  'config',
  'settings'
];

/**
 * 搜索命令
 * @param {string} query - 搜索查询（可含斜杠前缀）
 * @param {Object} [options] - 搜索选项
 * @param {number} [options.limit=5] - 返回结果数量限制
 * @returns {CommandItem[]} 匹配的命令列表
 */
function searchCommands(query, options = {}) {
  const { limit = 5 } = options;
  
  // 移除斜杠前缀
  const searchTerm = query.replace(/^\//, '').toLowerCase();
  
  // 如果没有搜索词，返回所有默认命令
  if (!searchTerm) {
    return DEFAULT_COMMANDS.slice(0, limit);
  }
  
  // 过滤匹配的命令
  const matched = DEFAULT_COMMANDS.filter(cmd => {
    // 跳过忽略的命令
    if (IGNORED_COMMANDS.includes(cmd.command)) {
      return false;
    }
    
    // 命令名包含搜索词
    if (cmd.command.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    // 描述包含搜索词
    if (cmd.description && cmd.description.toLowerCase().includes(searchTerm)) {
      return true;
    }
    
    return false;
  });
  
  // 按相关性排序（前缀匹配优先）
  matched.sort((a, b) => {
    const aStartsWith = a.command.toLowerCase().startsWith(searchTerm);
    const bStartsWith = b.command.toLowerCase().startsWith(searchTerm);
    
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return 0;
  });
  
  return matched.slice(0, limit);
}

/**
 * 获取所有可用命令
 * @returns {CommandItem[]}
 */
function getAllCommands() {
  return DEFAULT_COMMANDS.filter(cmd => !IGNORED_COMMANDS.includes(cmd.command));
}

/**
 * 检查文本是否是命令
 * @param {string} text - 输入文本
 * @returns {boolean}
 */
function isCommand(text) {
  return text.trim().startsWith('/');
}

/**
 * 解析命令
 * @param {string} text - 输入文本
 * @returns {{ command: string, args: string[] } | null}
 */
function parseCommand(text) {
  if (!isCommand(text)) {
    return null;
  }
  
  const parts = text.trim().slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  return { command, args };
}

/**
 * 纯前端命令列表（这些命令不发送到后端）
 * @type {string[]}
 */
const FRONTEND_ONLY_COMMANDS = ['help'];

/**
 * 检查是否是纯前端命令
 * @param {string} command - 命令名
 * @returns {boolean}
 */
function isFrontendOnlyCommand(command) {
  return FRONTEND_ONLY_COMMANDS.includes(command.toLowerCase());
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.CommandSuggestions = {
    DEFAULT_COMMANDS,
    IGNORED_COMMANDS,
    FRONTEND_ONLY_COMMANDS,
    searchCommands,
    getAllCommands,
    isCommand,
    parseCommand,
    isFrontendOnlyCommand
  };
}
