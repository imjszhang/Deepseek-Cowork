#!/usr/bin/env node

/**
 * search_library.js - 搜索脚本库
 * 
 * 在创建新脚本前搜索现有库，找到可复用的脚本
 * 
 * 用法：
 *   # 按 URL 自动匹配站点
 *   node search_library.js --url "https://www.xiaohongshu.com/..."
 * 
 *   # 按域名 + 关键词搜索
 *   node search_library.js --domain xiaohongshu.com --keywords "笔记,提取"
 * 
 *   # 搜索通用脚本
 *   node search_library.js --common --keywords "scroll"
 * 
 *   # 列出所有脚本
 *   node search_library.js --list
 * 
 * @created 2026-01-11
 */

const fs = require('fs');
const path = require('path');
const {
  ensureDataDir,
  getLibraryDir,
  getCommonDir,
  getDomainDir,
  getSiteMetaFile,
  extractDomain
} = require('./paths');

/**
 * 解析脚本文件的元信息
 * @param {string} filePath - 脚本文件路径
 * @returns {Object|null} 元信息对象
 */
function parseScriptMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = {
      name: path.basename(filePath, '.js'),
      purpose: '',
      keywords: [],
      created: '',
      updated: '',
      usageCount: 0,
      filePath: filePath
    };
    
    // 解析 JSDoc 风格的元信息
    const nameMatch = content.match(/@name\s+(.+)/);
    const purposeMatch = content.match(/@purpose\s+(.+)/);
    const keywordsMatch = content.match(/@keywords\s+(.+)/);
    const createdMatch = content.match(/@created\s+(.+)/);
    const updatedMatch = content.match(/@updated\s+(.+)/);
    const usageMatch = content.match(/@usageCount\s+(\d+)/);
    
    if (nameMatch) meta.name = nameMatch[1].trim();
    if (purposeMatch) meta.purpose = purposeMatch[1].trim();
    if (keywordsMatch) {
      meta.keywords = keywordsMatch[1].split(/[,，]/).map(k => k.trim()).filter(k => k);
    }
    if (createdMatch) meta.created = createdMatch[1].trim();
    if (updatedMatch) meta.updated = updatedMatch[1].trim();
    if (usageMatch) meta.usageCount = parseInt(usageMatch[1], 10);
    
    return meta;
  } catch (e) {
    return null;
  }
}

/**
 * 获取目录下所有脚本的元信息
 * @param {string} dirPath - 目录路径
 * @returns {Array} 脚本元信息数组
 */
function getScriptsInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  
  const scripts = [];
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (file.endsWith('.js') && !file.startsWith('_')) {
      const filePath = path.join(dirPath, file);
      const meta = parseScriptMeta(filePath);
      if (meta) {
        scripts.push(meta);
      }
    }
  }
  
  return scripts;
}

/**
 * 读取站点元信息
 * @param {string} domain - 域名
 * @returns {Object|null} 站点元信息
 */
function getSiteMeta(domain) {
  const siteFile = getSiteMetaFile(domain);
  if (fs.existsSync(siteFile)) {
    try {
      return JSON.parse(fs.readFileSync(siteFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * 通过别名查找域名
 * @param {string} alias - 别名
 * @returns {string|null} 匹配的域名
 */
function findDomainByAlias(alias) {
  const libraryDir = getLibraryDir();
  if (!fs.existsSync(libraryDir)) {
    return null;
  }
  
  const dirs = fs.readdirSync(libraryDir);
  for (const dir of dirs) {
    if (dir.startsWith('_')) continue;
    
    const siteMeta = getSiteMeta(dir);
    if (siteMeta && siteMeta.aliases && siteMeta.aliases.includes(alias)) {
      return dir;
    }
  }
  
  return null;
}

/**
 * 计算关键词匹配度
 * @param {Array} scriptKeywords - 脚本关键词
 * @param {Array} searchKeywords - 搜索关键词
 * @returns {number} 匹配度 0-100
 */
function calculateMatchScore(scriptKeywords, searchKeywords) {
  if (!searchKeywords.length || !scriptKeywords.length) {
    return 0;
  }
  
  let matches = 0;
  const lowerScriptKeywords = scriptKeywords.map(k => k.toLowerCase());
  
  for (const searchKw of searchKeywords) {
    const lowerSearchKw = searchKw.toLowerCase();
    for (const scriptKw of lowerScriptKeywords) {
      if (scriptKw.includes(lowerSearchKw) || lowerSearchKw.includes(scriptKw)) {
        matches++;
        break;
      }
    }
  }
  
  return Math.round((matches / searchKeywords.length) * 100);
}

/**
 * 搜索脚本
 * @param {Object} options - 搜索选项
 * @param {string} options.url - URL
 * @param {string} options.domain - 域名
 * @param {Array} options.keywords - 关键词
 * @param {boolean} options.common - 只搜索通用脚本
 * @returns {Array} 匹配的脚本列表
 */
function searchScripts(options) {
  ensureDataDir();
  
  const { url, domain, keywords = [], common = false } = options;
  const results = [];
  
  // 确定要搜索的域名
  let targetDomain = domain;
  if (url && !targetDomain) {
    targetDomain = extractDomain(url);
  }
  
  // 尝试通过别名查找
  if (targetDomain) {
    const actualDomain = findDomainByAlias(targetDomain);
    if (actualDomain) {
      targetDomain = actualDomain;
    }
  }
  
  const searchKeywords = keywords;
  
  // 搜索特定域名目录
  if (targetDomain && !common) {
    const domainDir = getDomainDir(targetDomain);
    const scripts = getScriptsInDir(domainDir);
    
    for (const script of scripts) {
      const score = searchKeywords.length > 0
        ? calculateMatchScore(script.keywords, searchKeywords)
        : 50; // 无关键词时给基础分
      
      results.push({
        ...script,
        domain: targetDomain,
        matchScore: score,
        source: 'domain'
      });
    }
  }
  
  // 搜索通用脚本
  if (common || !targetDomain || results.length === 0) {
    const commonDir = getCommonDir();
    const scripts = getScriptsInDir(commonDir);
    
    for (const script of scripts) {
      const score = searchKeywords.length > 0
        ? calculateMatchScore(script.keywords, searchKeywords)
        : 30; // 通用脚本基础分较低
      
      results.push({
        ...script,
        domain: '_common',
        matchScore: score,
        source: 'common'
      });
    }
  }
  
  // 按匹配度排序
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  // 过滤低匹配度结果（如果有关键词搜索）
  if (searchKeywords.length > 0) {
    return results.filter(r => r.matchScore > 0);
  }
  
  return results;
}

/**
 * 列出所有脚本
 * @returns {Object} 按域名分组的脚本列表
 */
function listAllScripts() {
  ensureDataDir();
  
  const libraryDir = getLibraryDir();
  const result = {};
  
  if (!fs.existsSync(libraryDir)) {
    return result;
  }
  
  const dirs = fs.readdirSync(libraryDir);
  
  for (const dir of dirs) {
    const dirPath = path.join(libraryDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    
    const scripts = getScriptsInDir(dirPath);
    if (scripts.length > 0) {
      const siteMeta = dir === '_common' ? { name: '通用' } : getSiteMeta(dir);
      result[dir] = {
        name: siteMeta?.name || dir,
        scripts: scripts
      };
    }
  }
  
  return result;
}

/**
 * 打印搜索结果
 * @param {Array} results - 搜索结果
 * @param {string} domain - 搜索的域名
 */
function printResults(results, domain) {
  if (results.length === 0) {
    console.log('\n未找到匹配的脚本。');
    console.log('提示：可以创建新脚本，执行成功后会自动归档到库中。');
    return;
  }
  
  console.log(`\n找到 ${results.length} 个匹配脚本：\n`);
  
  results.forEach((script, index) => {
    const domainLabel = script.domain === '_common' ? '通用' : script.domain;
    console.log(`${index + 1}. ${script.name} (匹配度: ${script.matchScore}%)`);
    console.log(`   用途: ${script.purpose || '未描述'}`);
    console.log(`   站点: ${domainLabel}`);
    console.log(`   关键词: ${script.keywords.join(', ') || '无'}`);
    console.log(`   路径: ${script.filePath}`);
    console.log(`   使用次数: ${script.usageCount}`);
    console.log('');
  });
  
  console.log('使用方式：');
  console.log('  node scripts/run_script.js --from-library <域名/脚本名.js> --tabId <tabId>');
}

/**
 * 打印所有脚本列表
 * @param {Object} allScripts - 所有脚本
 */
function printAllScripts(allScripts) {
  const domains = Object.keys(allScripts);
  
  if (domains.length === 0) {
    console.log('\n脚本库为空。');
    return;
  }
  
  let totalScripts = 0;
  
  console.log('\n=== 脚本库内容 ===\n');
  
  for (const domain of domains) {
    const { name, scripts } = allScripts[domain];
    totalScripts += scripts.length;
    
    console.log(`【${name}】(${domain})`);
    
    for (const script of scripts) {
      console.log(`  - ${script.name}: ${script.purpose || '未描述'}`);
    }
    
    console.log('');
  }
  
  console.log(`共 ${domains.length} 个站点，${totalScripts} 个脚本`);
}

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: null,
    domain: null,
    keywords: [],
    common: false,
    list: false,
    help: false,
    json: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        options.url = args[++i];
        break;
      case '--domain':
        options.domain = args[++i];
        break;
      case '--keywords':
        options.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        options.common = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--json':
        options.json = true;
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
搜索脚本库

用法:
  node search_library.js [选项]

选项:
  --url <url>           按 URL 自动匹配站点
  --domain <domain>     指定域名搜索
  --keywords <kw1,kw2>  按关键词搜索（逗号分隔）
  --common              只搜索通用脚本
  --list                列出所有脚本
  --json                以 JSON 格式输出
  --help, -h            显示此帮助信息

示例:
  # 按 URL 搜索
  node search_library.js --url "https://www.xiaohongshu.com/explore/xxx"

  # 按域名 + 关键词搜索
  node search_library.js --domain xiaohongshu.com --keywords "笔记,提取"

  # 搜索通用脚本
  node search_library.js --common --keywords "scroll"

  # 列出所有脚本
  node search_library.js --list
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
  
  if (options.list) {
    const allScripts = listAllScripts();
    if (options.json) {
      console.log(JSON.stringify(allScripts, null, 2));
    } else {
      printAllScripts(allScripts);
    }
    return;
  }
  
  // 执行搜索
  const results = searchScripts(options);
  
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const domain = options.domain || (options.url ? extractDomain(options.url) : null);
    printResults(results, domain);
  }
}

// 导出函数供其他模块使用
module.exports = {
  searchScripts,
  listAllScripts,
  parseScriptMeta,
  getScriptsInDir,
  getSiteMeta,
  findDomainByAlias,
  calculateMatchScore
};

// 如果直接运行则执行主函数
if (require.main === module) {
  main();
}
