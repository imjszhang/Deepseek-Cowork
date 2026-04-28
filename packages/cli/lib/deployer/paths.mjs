/**
 * Deploy 模块路径常量
 * 
 * 创建时间: 2026-01-28
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 智能获取项目根目录
 * - 开发模式：packages/cli/lib/deployer -> 项目根目录
 * - 打包模式：检测 deploy/ 目录位置
 */
function getProjectRoot() {
    // 使用 deploy/.dsc-root 文件作为检测标志
    const marker = 'deploy/.dsc-root';
    
    // 方案1：开发模式（packages/cli/lib/deployer 结构）
    const devRoot = join(__dirname, '../../../..');
    if (existsSync(join(devRoot, marker))) {
        return devRoot;
    }
    
    // 方案2：打包后的结构（dist/lib/deployer -> dist）
    const distRoot = join(__dirname, '../..');
    if (existsSync(join(distRoot, marker))) {
        return distRoot;
    }
    
    // 方案3：当前目录向上查找
    let currentDir = __dirname;
    for (let i = 0; i < 5; i++) {
        if (existsSync(join(currentDir, marker))) {
            return currentDir;
        }
        currentDir = dirname(currentDir);
    }
    
    throw new Error(
        `Cannot find project root (${marker} not found).\n` +
        `  __dirname: ${__dirname}`
    );
}

// 项目根目录
export const PROJECT_ROOT = getProjectRoot();

// Deploy 相关路径
export const DEPLOY_DIR = join(PROJECT_ROOT, 'deploy');
export const SKILLS_DIR = join(DEPLOY_DIR, 'skills');
export const USER_SERVER_MODULES_DIR = join(DEPLOY_DIR, 'user-server-modules');
export const SERVER_DOCS_DIR = join(PROJECT_ROOT, 'server', 'docs');

// Happy 配置路径
export const HAPPY_CONFIG_PATH = join(PROJECT_ROOT, '..', 'happy-service', 'happy-config.json');

// 应用名称
export const APP_NAME = 'deepseek-cowork';

// 用户数据目录相关
export const USER_MODULES_DIR_NAME = 'user-server-modules';
export const USER_MODULES_CONFIG_NAME = 'userServerModulesConfig.js';

// conversation-memory skill 常量
export const CONVERSATION_MEMORY_SKILL_NAME = 'conversation-memory';
export const CONVERSATION_MEMORY_SKILL_PATH = `.claude/skills/${CONVERSATION_MEMORY_SKILL_NAME}`;
export const CONVERSATION_MEMORY_DATA_PATH = `.claude/data/${CONVERSATION_MEMORY_SKILL_NAME}`;

// 主内置 Skill（当前仅保留 conversation-memory）
export const SKILL_NAME = CONVERSATION_MEMORY_SKILL_NAME;
export const SKILL_PATH = CONVERSATION_MEMORY_SKILL_PATH;
export const BACKUP_DIR = '.bcm-backups';

/**
 * 获取用户数据目录（跨平台）
 * @returns {string} 用户数据目录路径
 */
export function getUserDataDir() {
    const platform = process.platform;
    let dataDir;
    
    if (platform === 'win32') {
        dataDir = join(process.env.APPDATA || join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
    } else if (platform === 'darwin') {
        dataDir = join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    } else {
        dataDir = join(process.env.XDG_CONFIG_HOME || join(os.homedir(), '.config'), APP_NAME);
    }
    
    return dataDir;
}

/**
 * 获取 skills 源目录（根据语言）
 * @param {string} lang - 语言代码 ('en' | 'zh')
 * @returns {string} skills 源目录路径
 */
export function getSkillsSourceDir(lang = 'en') {
    if (lang === 'zh') {
        return join(SKILLS_DIR, 'i18n', 'zh', 'js-skills');
    }
    return join(SKILLS_DIR, 'js-skills');
}

export default {
    PROJECT_ROOT,
    DEPLOY_DIR,
    SKILLS_DIR,
    USER_SERVER_MODULES_DIR,
    SERVER_DOCS_DIR,
    HAPPY_CONFIG_PATH,
    APP_NAME,
    USER_MODULES_DIR_NAME,
    USER_MODULES_CONFIG_NAME,
    SKILL_NAME,
    SKILL_PATH,
    BACKUP_DIR,
    CONVERSATION_MEMORY_SKILL_NAME,
    CONVERSATION_MEMORY_SKILL_PATH,
    CONVERSATION_MEMORY_DATA_PATH,
    getUserDataDir,
    getSkillsSourceDir
};
