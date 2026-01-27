#!/usr/bin/env node

/**
 * paths.js - Browser Control 技能路径管理模块
 * 
 * 提供统一的路径解析功能，将数据目录从技能目录分离到 .claude/data/ 下
 * 
 * 目录结构：
 *   workdir/
 *   ├── .claude/
 *   │   ├── skills/browser-control/    # 技能代码
 *   │   │   └── scripts/               # 脚本目录（本模块所在位置）
 *   │   └── data/browser-control/      # 数据目录
 *   │       ├── workspace/             # 临时工作区（存 JSON 请求文件）
 *   │       │   └── session-YYYYMMDD/
 *   │       └── library/               # 脚本库（存 JS 代码）
 *   │           ├── index.md
 *   │           ├── _common/
 *   │           └── {domain}/
 * 
 * @created 2026-01-11
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// 技能名称
const SKILL_NAME = 'browser-control';

/**
 * 向上查找 .claude 目录
 * @param {string} startDir - 起始目录，默认为当前脚本目录
 * @returns {string|null} .claude 目录的路径，未找到返回 null
 */
function findClaudeRoot(startDir = __dirname) {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;
  
  while (currentDir !== root) {
    const claudeDir = path.join(currentDir, '.claude');
    if (fs.existsSync(claudeDir) && fs.statSync(claudeDir).isDirectory()) {
      return claudeDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

/**
 * 获取工作目录根路径
 * @returns {string} 工作目录路径
 * @throws {Error} 如果找不到 .claude 目录
 */
function getWorkDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录，请确保在正确的工作目录中运行');
  }
  return path.dirname(claudeRoot);
}

/**
 * 获取技能目录路径
 * @returns {string} 技能目录路径
 */
function getSkillDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录');
  }
  return path.join(claudeRoot, 'skills', SKILL_NAME);
}

/**
 * 获取数据目录路径
 * @returns {string} 数据目录路径 (.claude/data/browser-control/)
 */
function getDataDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录');
  }
  return path.join(claudeRoot, 'data', SKILL_NAME);
}

/**
 * 获取脚本库目录路径
 * @returns {string} 脚本库目录路径 (.claude/data/browser-control/library/)
 */
function getLibraryDir() {
  return path.join(getDataDir(), 'library');
}

/**
 * 获取临时工作区目录路径
 * @returns {string} 临时工作区目录路径 (.claude/data/browser-control/workspace/)
 */
function getWorkspaceDir() {
  return path.join(getDataDir(), 'workspace');
}

/**
 * 获取当前会话目录路径
 * @returns {string} 当前会话目录路径 (.claude/data/browser-control/workspace/session-YYYYMMDD/)
 */
function getSessionDir() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const sessionName = `session-${year}${month}${day}`;
  return path.join(getWorkspaceDir(), sessionName);
}

/**
 * 获取通用脚本目录路径
 * @returns {string} 通用脚本目录路径 (.claude/data/browser-control/library/_common/)
 */
function getCommonDir() {
  return path.join(getLibraryDir(), '_common');
}

/**
 * 获取索引文件路径
 * @returns {string} 索引文件路径
 */
function getIndexFile() {
  return path.join(getLibraryDir(), 'index.md');
}

/**
 * 获取 SKILL.md 文件路径
 * @returns {string} SKILL.md 文件路径
 */
function getSkillFile() {
  return path.join(getSkillDir(), 'SKILL.md');
}

/**
 * 从 URL 提取根域名
 * @param {string} urlString - URL 字符串
 * @returns {string|null} 根域名，如 xiaohongshu.com
 */
function extractDomain(urlString) {
  try {
    const url = new URL(urlString);
    let hostname = url.hostname;
    
    // 移除 www. 前缀
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    
    return hostname;
  } catch (e) {
    return null;
  }
}

/**
 * 获取指定域名的脚本目录路径
 * @param {string} domain - 域名
 * @returns {string} 域名脚本目录路径
 */
function getDomainDir(domain) {
  return path.join(getLibraryDir(), domain);
}

/**
 * 获取指定域名的站点元信息文件路径
 * @param {string} domain - 域名
 * @returns {string} _site.json 文件路径
 */
function getSiteMetaFile(domain) {
  return path.join(getDomainDir(domain), '_site.json');
}

/**
 * 确保数据目录存在
 * 创建完整的目录结构
 */
function ensureDataDir() {
  const dirs = [
    getDataDir(),
    getWorkspaceDir(),
    getLibraryDir(),
    getCommonDir()
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // 确保 index.md 存在
  const indexFile = getIndexFile();
  if (!fs.existsSync(indexFile)) {
    const initialContent = `# 浏览器脚本库索引

> 此文件由脚本自动更新，记录所有可复用脚本

## 统计

- 站点数：0
- 脚本总数：0
- 最后更新：${formatDate()}

## 站点列表

<!-- SITES_START -->
| 域名 | 名称 | 脚本数 | 热门脚本 |
|------|------|--------|----------|
| _common | 通用 | 0 | - |
<!-- SITES_END -->

## 脚本详细索引

<!-- SCRIPTS_START -->
### _common（通用）

| 脚本 | 用途 | 关键词 | 使用次数 |
|------|------|--------|----------|
| （暂无脚本） | - | - | - |
<!-- SCRIPTS_END -->

## 关键词快速索引

<!-- KEYWORDS_START -->
（暂无关键词）
<!-- KEYWORDS_END -->
`;
    fs.writeFileSync(indexFile, initialContent, 'utf8');
  }
}

/**
 * 确保指定域名的目录存在
 * @param {string} domain - 域名
 * @param {string} name - 站点名称（可选）
 */
function ensureDomainDir(domain, name = null) {
  const domainDir = getDomainDir(domain);
  
  if (!fs.existsSync(domainDir)) {
    fs.mkdirSync(domainDir, { recursive: true });
  }
  
  // 确保 _site.json 存在
  const siteMetaFile = getSiteMetaFile(domain);
  if (!fs.existsSync(siteMetaFile)) {
    const siteMeta = {
      domain: domain,
      aliases: [],
      name: name || domain,
      scriptCount: 0,
      lastUpdated: formatDate()
    };
    fs.writeFileSync(siteMetaFile, JSON.stringify(siteMeta, null, 2), 'utf8');
  }
}

/**
 * 确保当前会话目录存在
 * @returns {string} 会话目录路径
 */
function ensureSessionDir() {
  const sessionDir = getSessionDir();
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象，默认为当前时间
 * @returns {string} 格式化的日期字符串 YYYY-MM-DD
 */
function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象，默认为当前时间
 * @returns {string} 格式化的日期时间字符串 YYYY-MM-DD HH:MM:SS
 */
function formatDateTime(date = new Date()) {
  const dateStr = formatDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}:${seconds}`;
}

/**
 * 生成时间戳字符串
 * @returns {string} 时间戳 YYYYMMDD-HHMMSS
 */
function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * 获取配置对象
 * @returns {Object} 配置对象
 */
function getConfig() {
  return {
    skillName: SKILL_NAME,
    skillDir: getSkillDir(),
    dataDir: getDataDir(),
    libraryDir: getLibraryDir(),
    workspaceDir: getWorkspaceDir(),
    commonDir: getCommonDir(),
    indexFile: getIndexFile(),
    skillFile: getSkillFile()
  };
}

module.exports = {
  SKILL_NAME,
  findClaudeRoot,
  getWorkDir,
  getSkillDir,
  getDataDir,
  getLibraryDir,
  getWorkspaceDir,
  getSessionDir,
  getCommonDir,
  getIndexFile,
  getSkillFile,
  extractDomain,
  getDomainDir,
  getSiteMetaFile,
  ensureDataDir,
  ensureDomainDir,
  ensureSessionDir,
  formatDate,
  formatDateTime,
  generateTimestamp,
  getConfig
};
