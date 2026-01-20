/**
 * Local Service 配置模块
 * 
 * 提供跨平台的数据目录路径和配置
 * 
 * 创建时间: 2026-01-20
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// 应用名称
const APP_NAME = 'deepseek-cowork';

// 默认端口
const DEFAULT_HTTP_PORT = 3333;
const DEFAULT_WS_PORT = 8080;

/**
 * 获取跨平台数据目录
 * @returns {string} 数据目录路径
 */
function getDataDir() {
    const platform = process.platform;
    let dataDir;
    
    if (platform === 'win32') {
        // Windows: %APPDATA%\deepseek-cowork
        dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
    } else if (platform === 'darwin') {
        // macOS: ~/Library/Application Support/deepseek-cowork
        dataDir = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    } else {
        // Linux: ~/.config/deepseek-cowork
        dataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
    }
    
    return dataDir;
}

/**
 * 获取日志目录
 * @returns {string} 日志目录路径
 */
function getLogDir() {
    return path.join(getDataDir(), 'logs');
}

/**
 * 获取消息存储目录
 * @returns {string} 消息存储目录路径
 */
function getMessagesDir() {
    return path.join(getDataDir(), 'messages');
}

/**
 * 获取 Happy 状态目录
 * @returns {string} Happy 状态目录路径
 */
function getHappyStateDir() {
    return path.join(getDataDir(), 'happy-state');
}

/**
 * 获取默认工作目录
 * @returns {string} 默认工作目录路径
 */
function getDefaultWorkspaceDir() {
    return path.join(getDataDir(), 'workspace');
}

/**
 * 获取设置文件路径
 * @returns {string} 设置文件路径
 */
function getSettingsPath() {
    return path.join(getDataDir(), 'settings.json');
}

/**
 * 获取安全设置文件路径
 * @returns {string} 安全设置文件路径
 */
function getSecureSettingsPath() {
    return path.join(getDataDir(), 'secure-settings.json');
}

/**
 * 获取 PID 文件路径
 * @returns {string} PID 文件路径
 */
function getPidFilePath() {
    return path.join(getDataDir(), 'daemon.pid');
}

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 初始化所有必要的目录
 */
function initializeDirectories() {
    ensureDir(getDataDir());
    ensureDir(getLogDir());
    ensureDir(getMessagesDir());
    ensureDir(getHappyStateDir());
    ensureDir(getDefaultWorkspaceDir());
}

/**
 * 默认服务配置
 */
const defaultConfig = {
    server: {
        host: 'localhost',
        httpPort: DEFAULT_HTTP_PORT,
        wsPort: DEFAULT_WS_PORT,
    },
    cors: {
        // 允许公域前端和本地前端访问
        origins: [
            'https://deepseek-cowork.com',
            'https://www.deepseek-cowork.com',
            'http://localhost:*',
            'http://127.0.0.1:*',
            'file://*'
        ],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    },
    happy: {
        enabled: true,
        monitorInterval: 30000,
        autoMonitor: true
    },
    browserControl: {
        enabled: true
    },
    explorer: {
        enabled: true
    }
};

module.exports = {
    APP_NAME,
    DEFAULT_HTTP_PORT,
    DEFAULT_WS_PORT,
    getDataDir,
    getLogDir,
    getMessagesDir,
    getHappyStateDir,
    getDefaultWorkspaceDir,
    getSettingsPath,
    getSecureSettingsPath,
    getPidFilePath,
    ensureDir,
    initializeDirectories,
    defaultConfig
};
