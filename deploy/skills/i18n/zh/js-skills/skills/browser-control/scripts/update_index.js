#!/usr/bin/env node

/**
 * update_index.js - 更新脚本库索引
 * 
 * 扫描 library 目录，生成/更新 index.md
 * 
 * 用法：
 *   node update_index.js
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
  getIndexFile,
  formatDate
} = require('./paths');
const { parseScriptMeta, getScriptsInDir, getSiteMeta } = require('./search_library');

/**
 * 获取所有站点目录
 * @returns {Array} 站点目录列表 [{ domain, name, path }]
 */
function getAllSites() {
  const libraryDir = getLibraryDir();
  const sites = [];
  
  if (!fs.existsSync(libraryDir)) {
    return sites;
  }
  
  const dirs = fs.readdirSync(libraryDir);
  
  for (const dir of dirs) {
    const dirPath = path.join(libraryDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    
    if (dir === '_common') {
      sites.push({
        domain: '_common',
        name: '通用',
        path: dirPath
      });
    } else {
      const siteMeta = getSiteMeta(dir);
      sites.push({
        domain: dir,
        name: siteMeta?.name || dir,
        path: dirPath
      });
    }
  }
  
  // 排序：_common 在前，其他按域名排序
  sites.sort((a, b) => {
    if (a.domain === '_common') return -1;
    if (b.domain === '_common') return 1;
    return a.domain.localeCompare(b.domain);
  });
  
  return sites;
}

/**
 * 构建关键词索引
 * @param {Object} allScripts - 所有脚本 { domain: [scripts] }
 * @returns {Object} 关键词索引 { keyword: [{ domain, script }] }
 */
function buildKeywordIndex(allScripts) {
  const keywordIndex = {};
  
  for (const [domain, scripts] of Object.entries(allScripts)) {
    for (const script of scripts) {
      for (const keyword of script.keywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (!keywordIndex[lowerKeyword]) {
          keywordIndex[lowerKeyword] = [];
        }
        keywordIndex[lowerKeyword].push({
          domain,
          script: script.name,
          file: `${script.name}.js`
        });
      }
    }
  }
  
  return keywordIndex;
}

/**
 * 生成索引内容
 * @returns {string} index.md 内容
 */
function generateIndexContent() {
  const sites = getAllSites();
  const allScripts = {};
  let totalScripts = 0;
  
  // 收集所有脚本
  for (const site of sites) {
    const scripts = getScriptsInDir(site.path);
    allScripts[site.domain] = scripts;
    totalScripts += scripts.length;
  }
  
  // 构建关键词索引
  const keywordIndex = buildKeywordIndex(allScripts);
  
  // 生成站点列表表格
  let sitesTable = '| 域名 | 名称 | 脚本数 | 热门脚本 |\n';
  sitesTable += '|------|------|--------|----------|\n';
  
  for (const site of sites) {
    const scripts = allScripts[site.domain];
    const scriptCount = scripts.length;
    
    // 获取使用次数最多的前3个脚本
    const topScripts = [...scripts]
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 3)
      .map(s => s.name);
    
    const hotScripts = topScripts.length > 0 ? topScripts.join(', ') : '-';
    
    sitesTable += `| ${site.domain} | ${site.name} | ${scriptCount} | ${hotScripts} |\n`;
  }
  
  // 生成脚本详细索引
  let scriptsDetail = '';
  
  for (const site of sites) {
    const scripts = allScripts[site.domain];
    const label = site.domain === '_common' ? '_common（通用）' : `${site.domain}（${site.name}）`;
    
    scriptsDetail += `### ${label}\n\n`;
    
    if (scripts.length === 0) {
      scriptsDetail += '| 脚本 | 用途 | 关键词 | 使用次数 |\n';
      scriptsDetail += '|------|------|--------|----------|\n';
      scriptsDetail += '| （暂无脚本） | - | - | - |\n';
    } else {
      scriptsDetail += '| 脚本 | 用途 | 关键词 | 使用次数 |\n';
      scriptsDetail += '|------|------|--------|----------|\n';
      
      for (const script of scripts) {
        const keywords = script.keywords.length > 0 ? script.keywords.join(', ') : '-';
        scriptsDetail += `| ${script.name}.js | ${script.purpose || '-'} | ${keywords} | ${script.usageCount || 0} |\n`;
      }
    }
    
    scriptsDetail += '\n';
  }
  
  // 生成关键词快速索引
  let keywordsSection = '';
  const sortedKeywords = Object.keys(keywordIndex).sort();
  
  if (sortedKeywords.length === 0) {
    keywordsSection = '（暂无关键词）';
  } else {
    for (const keyword of sortedKeywords) {
      const refs = keywordIndex[keyword];
      const refStrings = refs.map(r => `${r.domain}/${r.file}`);
      keywordsSection += `- **${keyword}**: ${refStrings.join(', ')}\n`;
    }
  }
  
  // 组装完整索引
  const content = `# 浏览器脚本库索引

> 此文件由脚本自动更新，记录所有可复用脚本

## 统计

- 站点数：${sites.length}
- 脚本总数：${totalScripts}
- 最后更新：${formatDate()}

## 站点列表

<!-- SITES_START -->
${sitesTable}<!-- SITES_END -->

## 脚本详细索引

<!-- SCRIPTS_START -->
${scriptsDetail}<!-- SCRIPTS_END -->

## 关键词快速索引

<!-- KEYWORDS_START -->
${keywordsSection}<!-- KEYWORDS_END -->
`;
  
  return content;
}

/**
 * 更新索引文件
 */
function updateIndex() {
  ensureDataDir();
  
  const indexFile = getIndexFile();
  const content = generateIndexContent();
  
  fs.writeFileSync(indexFile, content, 'utf8');
  
  return indexFile;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
更新脚本库索引

用法:
  node update_index.js

功能:
  扫描 library 目录下所有脚本，更新 index.md 索引文件。
  索引包含：站点列表、脚本详情、关键词快速索引。
`);
    return;
  }
  
  console.log('正在更新索引...');
  
  const indexFile = updateIndex();
  
  console.log(`✓ 索引已更新: ${indexFile}`);
}

// 导出函数供其他模块使用
module.exports = {
  updateIndex,
  generateIndexContent,
  getAllSites,
  buildKeywordIndex
};

// 如果直接运行则执行主函数
if (require.main === module) {
  main();
}
