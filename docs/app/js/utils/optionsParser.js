/**
 * 选项解析工具模块
 * 参考 happy/sources/components/markdown/parseMarkdownBlock.ts
 * 从消息文本中解析 <options> 块
 * 
 * @created 2026-01-17
 * @module utils/optionsParser
 */

/**
 * 解析选项结果
 * @typedef {Object} ParseOptionsResult
 * @property {string} cleanText - 移除选项块后的干净文本
 * @property {string[]} options - 解析出的选项数组
 */

/**
 * 从文本中解析选项块
 * 
 * 支持的格式：
 * ```
 * <options>
 *     <option>选项1</option>
 *     <option>选项2</option>
 * </options>
 * ```
 * 
 * @param {string} text - 原始文本
 * @returns {ParseOptionsResult} 解析结果
 */
function parseOptions(text) {
  if (!text || typeof text !== 'string') {
    return { cleanText: text || '', options: [] };
  }

  const options = [];
  let cleanText = text;

  // 匹配 <options>...</options> 块（支持多行）
  // 使用非贪婪匹配，确保只匹配最后一个 options 块
  const optionsBlockRegex = /<options>\s*([\s\S]*?)\s*<\/options>\s*$/i;
  const blockMatch = text.match(optionsBlockRegex);

  if (blockMatch) {
    const optionsContent = blockMatch[1];
    
    // 提取所有 <option>...</option> 标签内容
    const optionRegex = /<option>([\s\S]*?)<\/option>/gi;
    let optionMatch;
    
    while ((optionMatch = optionRegex.exec(optionsContent)) !== null) {
      const optionText = optionMatch[1].trim();
      if (optionText) {
        options.push(optionText);
      }
    }

    // 移除 options 块，保留干净的文本
    cleanText = text.replace(optionsBlockRegex, '').trim();
  }

  return { cleanText, options };
}

/**
 * 检查文本是否包含选项块
 * @param {string} text - 原始文本
 * @returns {boolean} 是否包含选项块
 */
function hasOptions(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  return /<options>[\s\S]*<\/options>\s*$/i.test(text);
}

/**
 * 格式化选项为 XML 字符串（用于测试或调试）
 * @param {string[]} options - 选项数组
 * @returns {string} XML 格式的选项字符串
 */
function formatOptions(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return '';
  }
  
  const optionTags = options
    .map(opt => `    <option>${opt}</option>`)
    .join('\n');
  
  return `<options>\n${optionTags}\n</options>`;
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.OptionsParser = {
    parseOptions,
    hasOptions,
    formatOptions
  };
}
