/**
 * DeepSeek Cowork 服务器优雅关闭模块
 * 
 * 负责在服务器退出时按顺序关闭所有服务
 */

const modulesManager = require('./modulesManager');
const logger = require('./utils/logger');

/**
 * 关闭所有服务
 */
async function shutdownServices() {
    logger.info('Shutting down server...');
    
    // 使用模块管理器关闭所有模块（按启动顺序的逆序）
    await modulesManager.shutdownModules();

    // 添加超时机制，防止进程卡住
    setTimeout(() => {
        logger.warn('Shutdown timeout, forcing process exit');
        process.exit(1);
    }, 5000); // 5秒后强制退出
}

/**
 * 设置 SIGINT/SIGTERM 处理器
 */
function setupShutdownHandler() {
    // 处理 Ctrl+C
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT signal');
        await shutdownServices();
        process.exit(0);
    });

    // 处理终止信号
    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM signal');
        await shutdownServices();
        process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        shutdownServices().then(() => process.exit(1));
    });

    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise rejection:', reason);
    });
}

module.exports = {
    shutdownServices,
    setupShutdownHandler
};
