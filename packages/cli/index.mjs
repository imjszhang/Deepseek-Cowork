/**
 * DeepSeek Cowork CLI 模块入口
 * 
 * 用于程序化调用 CLI 功能
 * 
 * 创建时间: 2026-01-20
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取项目根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 项目根目录（packages/cli 的父目录的父目录）
export const PROJECT_ROOT = join(__dirname, '../..');

// 导出服务模块路径
export const LOCAL_SERVICE_PATH = join(PROJECT_ROOT, 'lib/local-service');

/**
 * 动态导入 local-service 模块
 * 由于 local-service 是 CommonJS 模块，需要动态导入
 */
export async function getLocalService() {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require(LOCAL_SERVICE_PATH);
}

/**
 * 获取配置模块
 */
export async function getConfig() {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require(join(LOCAL_SERVICE_PATH, 'config'));
}

/**
 * 获取用户设置模块
 */
export async function getUserSettings() {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require(join(LOCAL_SERVICE_PATH, 'user-settings-cli'));
}

/**
 * 获取安全设置模块
 */
export async function getSecureSettings() {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    return require(join(LOCAL_SERVICE_PATH, 'secure-settings-cli'));
}

export default {
    PROJECT_ROOT,
    LOCAL_SERVICE_PATH,
    getLocalService,
    getConfig,
    getUserSettings,
    getSecureSettings
};
