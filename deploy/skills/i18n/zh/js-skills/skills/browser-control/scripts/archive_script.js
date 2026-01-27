#!/usr/bin/env node

/**
 * archive_script.js - 归档脚本到库
 * 
 * 将执行成功的脚本保存到脚本库
 * 
 * 用法：
 *   # 从代码字符串归档
 *   node archive_script.js \
 *     --code "(() => { ... })()" \
 *     --url "https://..." \
 *     --name "get_note_info" \
 *     --purpose "提取笔记信息" \
 *     --keywords "笔记,标题,点赞"
 * 
 *   # 从文件归档
 *   node archive_script.js \
 *     --file "./my_script.js" \
 *     --url "https://..." \
 *     --name "get_note_info" \
 *     --purpose "提取笔记信息" \
 *     --keywords "笔记,标题,点赞"
 * 
 *   # 归档到通用目录
 *   node archive_script.js \
 *     --code "..." \
 *     --common \
 *     --name "scroll_to_bottom" \
 *     --purpose "滚动到页面底部"
 * 
 * @created 2026-01-11
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ensureDataDir,
  ensureDomainDir,
  getLibraryDir,
  getCommonDir,
  getDomainDir,
  getSiteMetaFile,
  extractDomain,
  formatDate
} = require('./paths');

/**
 * 计算代码哈希
 * @param {string} code - 代码字符串
 * @returns {string} 哈希值（前8位）
 */
function hashCode(code) {
  // 移除注释和空白后计算哈希
  const normalized = code
    .replace(/\/\*[\s\S]*?\*\//g, '')  // 移除块注释
    .replace(/\/\/.*/g, '')             // 移除行注释
    .replace(/\s+/g, ' ')               // 压缩空白
    .trim();
  
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
}

/**
 * 检查是否已有相同代码的脚本
 * @param {string} targetDir - 目标目录
 * @param {string} code - 代码
 * @returns {string|null} 已存在的脚本文件名，不存在返回 null
 */
function findDuplicateScript(targetDir, code) {
  if (!fs.existsSync(targetDir)) {
    return null;
  }
  
  const newHash = hashCode(code);
  const files = fs.readdirSync(targetDir);
  
  for (const file of files) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    
    const filePath = path.join(targetDir, file);
    const existingCode = fs.readFileSync(filePath, 'utf8');
    
    // 提取实际代码部分（跳过元信息注释）
    const codeStart = existingCode.indexOf('(() =>') !== -1 
      ? existingCode.indexOf('(() =>')
      : existingCode.indexOf('(function');
    
    if (codeStart !== -1) {
      const existingHash = hashCode(existingCode.substring(codeStart));
      if (existingHash === newHash) {
        return file;
      }
    }
  }
  
  return null;
}

/**
 * 生成带元信息的脚本内容
 * @param {string} code - 原始代码
 * @param {Object} meta - 元信息
 * @returns {string} 带元信息的完整脚本
 */
function generateScriptWithMeta(code, meta) {
  const { name, purpose, keywords, created, updated } = meta;
  
  // 检查代码是否已有元信息头
  if (code.trim().startsWith('/**') && code.includes('@name')) {
    // 已有元信息，更新它
    return code.replace(/@updated\s+.+/, `@updated ${updated}`);
  }
  
  // 生成新的元信息头
  const header = `/**
 * @name ${name}
 * @purpose ${purpose}
 * @keywords ${keywords.join(', ')}
 * @created ${created}
 * @updated ${updated}
 * @usageCount 0
 */
`;
  
  return header + code.trim() + '\n';
}

/**
 * 更新站点元信息
 * @param {string} domain - 域名
 */
function updateSiteMeta(domain) {
  const siteFile = getSiteMetaFile(domain);
  
  if (fs.existsSync(siteFile)) {
    const siteMeta = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
    
    // 统计脚本数量
    const domainDir = getDomainDir(domain);
    const files = fs.readdirSync(domainDir);
    const scriptCount = files.filter(f => f.endsWith('.js') && !f.startsWith('_')).length;
    
    siteMeta.scriptCount = scriptCount;
    siteMeta.lastUpdated = formatDate();
    
    fs.writeFileSync(siteFile, JSON.stringify(siteMeta, null, 2), 'utf8');
  }
}

/**
 * 归档脚本
 * @param {Object} options - 归档选项
 * @returns {Object} 归档结果
 */
function archiveScript(options) {
  const {
    code,
    file,
    url,
    name,
    purpose = '',
    keywords = [],
    common = false,
    force = false
  } = options;
  
  // 获取代码
  let scriptCode = code;
  if (file && !scriptCode) {
    if (!fs.existsSync(file)) {
      return { success: false, error: `文件不存在: ${file}` };
    }
    scriptCode = fs.readFileSync(file, 'utf8');
  }
  
  if (!scriptCode) {
    return { success: false, error: '未提供代码或文件' };
  }
  
  if (!name) {
    return { success: false, error: '未提供脚本名称' };
  }
  
  // 确定目标目录
  let targetDir;
  let domain;
  
  if (common) {
    targetDir = getCommonDir();
    domain = '_common';
  } else if (url) {
    domain = extractDomain(url);
    if (!domain) {
      return { success: false, error: `无法从 URL 提取域名: ${url}` };
    }
    ensureDomainDir(domain);
    targetDir = getDomainDir(domain);
  } else {
    return { success: false, error: '需要提供 --url 或 --common 参数' };
  }
  
  ensureDataDir();
  
  // 检查重复
  const duplicate = findDuplicateScript(targetDir, scriptCode);
  if (duplicate && !force) {
    return {
      success: false,
      error: `发现相同代码的脚本: ${duplicate}`,
      duplicate: duplicate
    };
  }
  
  // 检查同名文件
  const targetFile = path.join(targetDir, `${name}.js`);
  if (fs.existsSync(targetFile) && !force) {
    return {
      success: false,
      error: `同名脚本已存在: ${name}.js`,
      existing: targetFile
    };
  }
  
  // 生成带元信息的脚本
  const today = formatDate();
  const fullScript = generateScriptWithMeta(scriptCode, {
    name,
    purpose,
    keywords,
    created: today,
    updated: today
  });
  
  // 写入文件
  fs.writeFileSync(targetFile, fullScript, 'utf8');
  
  // 更新站点元信息
  if (domain !== '_common') {
    updateSiteMeta(domain);
  }
  
  return {
    success: true,
    message: `脚本已归档: ${name}.js`,
    path: targetFile,
    domain: domain
  };
}

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    code: null,
    file: null,
    url: null,
    name: null,
    purpose: '',
    keywords: [],
    common: false,
    force: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--code':
        options.code = args[++i];
        break;
      case '--file':
        options.file = args[++i];
        break;
      case '--url':
        options.url = args[++i];
        break;
      case '--name':
        options.name = args[++i];
        break;
      case '--purpose':
        options.purpose = args[++i];
        break;
      case '--keywords':
        options.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        options.common = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

/**
 * 打印使用说明
 */
function printUsage() {
  console.log(`
归档脚本到库

用法:
  node archive_script.js [选项]

选项:
  --code <code>         脚本代码字符串
  --file <path>         脚本文件路径
  --url <url>           目标页面 URL（用于确定域名）
  --name <name>         脚本名称（不含 .js 后缀）
  --purpose <desc>      脚本用途描述
  --keywords <kw1,kw2>  关键词（逗号分隔）
  --common              归档到通用脚本目录
  --force               强制覆盖已存在的脚本
  --help, -h            显示此帮助信息

示例:
  # 从代码字符串归档到特定站点
  node archive_script.js \\
    --code "(() => { return document.title; })()" \\
    --url "https://www.xiaohongshu.com/explore/xxx" \\
    --name "get_title" \\
    --purpose "获取页面标题" \\
    --keywords "标题,title"

  # 从文件归档到通用目录
  node archive_script.js \\
    --file "./scroll_to_bottom.js" \\
    --common \\
    --name "scroll_to_bottom" \\
    --purpose "滚动到页面底部加载更多"
`);
}

/**
 * 主函数
 */
function main() {
  const options = parseArgs();
  
  if (options.help) {
    printUsage();
    return;
  }
  
  const result = archiveScript(options);
  
  if (result.success) {
    console.log(`✓ ${result.message}`);
    console.log(`  路径: ${result.path}`);
    console.log(`  域名: ${result.domain}`);
    console.log('');
    console.log('提示: 运行 update_index.js 更新索引');
  } else {
    console.error(`✗ 归档失败: ${result.error}`);
    if (result.duplicate) {
      console.log(`  已存在相同脚本: ${result.duplicate}`);
      console.log('  使用 --force 强制覆盖');
    }
    if (result.existing) {
      console.log(`  使用 --force 强制覆盖`);
    }
    process.exit(1);
  }
}

// 导出函数供其他模块使用
module.exports = {
  archiveScript,
  hashCode,
  findDuplicateScript,
  generateScriptWithMeta,
  updateSiteMeta
};

// 如果直接运行则执行主函数
if (require.main === module) {
  main();
}
