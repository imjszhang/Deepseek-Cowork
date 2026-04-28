/**
 * Happy Service 工具函数模块
 * 
 * 提供通用工具函数
 * 
 * 创建时间: 2026-01-09
 */

const { promisify } = require('util');
const { exec } = require('child_process');

const execAsync = promisify(exec);

// ============================================================================
// 日志函数
// ============================================================================

/**
 * 日志级别
 */
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

/**
 * 当前日志级别（可通过环境变量设置）
 */
let currentLogLevel = LOG_LEVELS[process.env.HAPPY_LOG_LEVEL || 'INFO'] || LOG_LEVELS.INFO;

/**
 * 设置日志级别
 * @param {string} level 日志级别
 */
function setLogLevel(level) {
    currentLogLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
}

/**
 * 通用日志函数
 * @param {string} level 日志级别
 * @param {string} message 日志消息
 * @param  {...any} args 附加参数
 */
function log(level, message, ...args) {
    const levelValue = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    
    if (levelValue < currentLogLevel) {
        return;
    }
    
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    const prefix = `[${timestamp}] [HappyService] [${levelUpper}]`;
    
    if (args.length > 0) {
        console.log(prefix, message, ...args);
    } else {
        console.log(prefix, message);
    }
}

/**
 * DEBUG 日志
 * @param {string} message 消息
 * @param  {...any} args 附加参数
 */
function logDebug(message, ...args) {
    log('DEBUG', message, ...args);
}

/**
 * INFO 日志
 * @param {string} message 消息
 * @param  {...any} args 附加参数
 */
function logInfo(message, ...args) {
    log('INFO', message, ...args);
}

/**
 * WARN 日志
 * @param {string} message 消息
 * @param  {...any} args 附加参数
 */
function logWarn(message, ...args) {
    log('WARN', message, ...args);
}

/**
 * ERROR 日志
 * @param {string} message 消息
 * @param  {...any} args 附加参数
 */
function logError(message, ...args) {
    log('ERROR', message, ...args);
}

// ============================================================================
// 命令检查函数
// ============================================================================

/**
 * 检查命令是否可用（保留用于兼容）
 * @param {string} command 命令名
 * @returns {Promise<boolean>} 是否可用
 */
async function checkCommandAvailable(command) {
    const isWindows = process.platform === 'win32';
    const checkCommand = isWindows ? 'where' : 'which';
    
    try {
        const { stdout } = await execAsync(`${checkCommand} ${command}`, {
            shell: true,
            timeout: 5000
        });
        return stdout.trim().length > 0;
    } catch (error) {
        return false;
    }
}

/**
 * 确保 happy CLI 本地包可用
 * 注意：现在使用本地依赖，不再需要全局安装
 * @param {string} command 命令名（保留参数用于兼容，但不再使用）
 * @returns {Promise<void>}
 */
async function ensureHappyCommand(command = 'happy') {
    const path = require('path');
    const fs = require('fs');
    
    logInfo('Checking happy CLI local package availability...');
    
    // 获取应用根目录（处理打包后的路径）
    let appRoot;
    let isPackaged = false;
    try {
        const { app } = require('electron');
        if (app && app.isReady && app.isReady()) {
            const appPath = app.getAppPath();
            isPackaged = app.isPackaged;
            appRoot = appPath;
        } else {
            appRoot = path.join(__dirname, '..', '..');
        }
    } catch (e) {
        appRoot = path.join(__dirname, '..', '..');
    }
    
    const possiblePaths = [];
    
    // 打包环境：优先使用 app.asar.unpacked 目录
    if (isPackaged || appRoot.includes('app.asar')) {
        const unpackedPath = appRoot.replace('app.asar', 'app.asar.unpacked');
        possiblePaths.push(
            path.join(unpackedPath, 'lib', 'happy-cli', 'bin', 'happy.mjs'),
            path.join(unpackedPath, 'node_modules', 'happy', 'bin', 'happy.mjs'),
            path.join(unpackedPath, 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
        );
    }
    
    // 标准路径
    possiblePaths.push(
        path.join(appRoot, 'lib', 'happy-cli', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', 'happy-cli', 'bin', 'happy.mjs'),
        path.join(appRoot, 'node_modules', 'happy', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', '..', 'node_modules', 'happy', 'bin', 'happy.mjs'),
        path.join(appRoot, 'node_modules', 'happy-coder', 'bin', 'happy.mjs'),
        path.join(__dirname, '..', '..', 'node_modules', 'happy-coder', 'bin', 'happy.mjs')
    );
    
    let found = false;
    for (const testPath of possiblePaths) {
        try {
            if (fs.existsSync(testPath)) {
                logInfo(`happy CLI local package ready: ${testPath}`);
                found = true;
                break;
            }
        } catch (e) {
            // 忽略检查错误
        }
    }
    
    if (!found) {
        logError('happy CLI local package not found');
        logError('Tried paths:');
        possiblePaths.forEach(p => logError(`  - ${p}`));
        logError('Please run npm install to install dependencies');
        throw new Error('happy CLI local package not installed');
    }
}

// ============================================================================
// 通用工具函数
// ============================================================================

/**
 * 休眠函数
 * @param {number} ms 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查进程是否运行
 * @param {number} pid 进程 ID
 * @returns {boolean} 是否运行
 */
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 解析相对路径
 * @param {string} basePath 基础路径
 * @param {string} relativePath 相对路径
 * @returns {string} 绝对路径
 */
function resolvePath(basePath, relativePath) {
    const path = require('path');
    
    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }
    
    return path.resolve(basePath, relativePath);
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
    // 日志函数
    log,
    logDebug,
    logInfo,
    logWarn,
    logError,
    setLogLevel,
    LOG_LEVELS,
    
    // 命令检查
    checkCommandAvailable,
    ensureHappyCommand,
    
    // 通用工具
    sleep,
    isProcessRunning,
    resolvePath
};
