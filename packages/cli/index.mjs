/**
 * DeepSeek Cowork CLI 模块入口
 * 
 * 用于程序化调用 CLI 功能
 * 
 * 创建时间: 2026-01-20
 * 更新时间: 2026-01-21 - 重构为支持打包的静态导入
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 智能获取项目根目录
 * - 开发模式：packages/cli -> 项目根目录
 * - 打包模式：检测 lib/ 目录位置
 * - 全局安装：使用包内的 lib/ 目录
 */
function getProjectRoot() {
    // 方案1：检查是否是开发模式（packages/cli 结构）
    const devRoot = join(__dirname, '../..');
    if (existsSync(join(devRoot, 'lib/local-service/index.js'))) {
        return devRoot;
    }
    
    // 方案2：检查是否是打包后的结构（lib/ 在当前目录下）
    if (existsSync(join(__dirname, 'lib/local-service/index.js'))) {
        return __dirname;
    }
    
    // 方案3：检查包根目录（npm 安装后的结构）
    // 当全局安装时，__dirname 指向 node_modules/deepseek-cowork
    // lib/ 应该在同级目录
    const packageRoot = __dirname;
    if (existsSync(join(packageRoot, 'lib/local-service/index.js'))) {
        return packageRoot;
    }
    
    // 抛出错误，提供调试信息
    throw new Error(
        `Cannot find lib/local-service module.\n` +
        `  __dirname: ${__dirname}\n` +
        `  Checked paths:\n` +
        `    - ${join(devRoot, 'lib/local-service/index.js')}\n` +
        `    - ${join(__dirname, 'lib/local-service/index.js')}\n` +
        `    - ${join(packageRoot, 'lib/local-service/index.js')}`
    );
}

// 项目根目录
export const PROJECT_ROOT = getProjectRoot();

// 导出服务模块路径
export const LOCAL_SERVICE_PATH = join(PROJECT_ROOT, 'lib/local-service');

// 创建 require 函数用于加载 CommonJS 模块
const require = createRequire(import.meta.url);

/**
 * 动态导入 local-service 模块
 * 由于 local-service 是 CommonJS 模块，需要使用 require
 */
export async function getLocalService() {
    return require(LOCAL_SERVICE_PATH);
}

/**
 * 获取配置模块
 */
export async function getConfig() {
    return require(join(LOCAL_SERVICE_PATH, 'config'));
}

/**
 * 获取服务发现模块
 */
export async function getDiscovery() {
    return require(join(LOCAL_SERVICE_PATH, 'discovery'));
}

/**
 * 获取用户设置模块
 */
export async function getUserSettings() {
    return require(join(LOCAL_SERVICE_PATH, 'user-settings-cli'));
}

/**
 * 获取安全设置模块
 */
export async function getSecureSettings() {
    return require(join(LOCAL_SERVICE_PATH, 'secure-settings-cli'));
}

export default {
    PROJECT_ROOT,
    LOCAL_SERVICE_PATH,
    getLocalService,
    getConfig,
    getDiscovery,
    getUserSettings,
    getSecureSettings
};
