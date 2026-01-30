/**
 * DeepSeek Cowork 服务编排启动模块
 * 
 * 负责初始化和启动所有服务模块
 * 通过 modulesManager 实现动态模块加载
 */

const logger = require('./utils/logger');
const modulesManager = require('./modulesManager');

/**
 * 获取所有服务实例
 */
function getServices() {
    return modulesManager.getAllModules();
}

/**
 * 获取单个服务实例
 * @param {string} name 服务名称
 */
function getService(name) {
    return modulesManager.getModule(name);
}

/**
 * 初始化服务实例（在服务器启动前调用）
 * @param {Object} config 配置对象
 */
function initServices(config) {
    // 加载所有模块配置（内置 + 用户）
    modulesManager.loadAllConfigs();
    
    // 初始化所有启用的模块
    modulesManager.initModules(config);
    
    return getServices();
}

/**
 * 启动所有服务
 * @param {Object} context 启动上下文
 */
async function bootstrapServices({ app, io, http, config, PORT }) {
    await modulesManager.bootstrapModules({ app, io, http, config, PORT });
    logger.info('All modules started successfully');
}

module.exports = {
    initServices,
    bootstrapServices,
    getServices,
    getService
};
