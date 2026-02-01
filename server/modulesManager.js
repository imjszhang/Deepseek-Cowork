/**
 * 模块管理器
 * 
 * 负责管理服务模块的加载、初始化、启动和关闭
 * 支持内置模块和用户自定义模块
 * 支持多种运行模式（server、CLI、Electron）
 */

const path = require('path');
const fs = require('fs');
const logger = require('./utils/logger');
const { 
    getUserModulesDir, 
    getUserModulesConfigPath, 
    userModulesConfigExists,
    getUserDataDir,
    ensureDir
} = require('./utils/userDataDir');

// ============================================================
// 核心服务注册表
// ============================================================

/**
 * 核心服务注册表
 * 集中管理所有可注入到模块的核心服务
 * 使用 getter 实现懒加载，避免循环依赖
 */
const coreServices = {
    /**
     * HappyService - AI 通信核心（单例）
     * 用于发送消息、监听 AI 响应、管理会话等
     */
    get HappyService() {
        return require('../lib/happy-service');
    },
    
    /**
     * MessageStore - 消息持久化存储（单例）
     * 用于存储和读取消息历史
     */
    get MessageStore() {
        return require('../lib/message-store');
    },
    
    /**
     * MemoryManager - 记忆管理器（类）
     * 注意：这是一个类，需要实例化后使用
     * 实例化时需要传入 dataDir 参数
     */
    get MemoryManager() {
        return require('../lib/memory-manager');
    },
    
    /**
     * userSettings - 用户设置（需要在 local-service 中初始化）
     * 可能未初始化，使用时需检查
     */
    get userSettings() {
        try {
            return require('../lib/local-service/user-settings-cli');
        } catch (e) {
            logger.warn('Failed to load userSettings:', e.message);
            return null;
        }
    },
    
    /**
     * secureSettings - 安全设置（需要在 local-service 中初始化）
     * 可能未初始化，使用时需检查
     */
    get secureSettings() {
        try {
            return require('../lib/local-service/secure-settings-cli');
        } catch (e) {
            logger.warn('Failed to load secureSettings:', e.message);
            return null;
        }
    }
};

/**
 * 获取核心服务注册表
 * @returns {Object} 核心服务对象
 */
function getCoreServices() {
    return coreServices;
}

// ============================================================

// 存储已加载的模块实例
let moduleInstances = {};

// 存储合并后的模块配置
let mergedModuleConfigs = [];

// 存储模块启动顺序（用于逆序关闭）
let bootOrder = [];

// 存储运行时选项
let runtimeOptions = {};

// 存储运行时上下文（用于热加载）
let runtimeContext = null;

/**
 * 清理模块缓存
 * @param {string} modulePath 模块路径
 */
function clearModuleCache(modulePath) {
    try {
        const resolvedPath = require.resolve(modulePath);
        if (require.cache[resolvedPath]) {
            delete require.cache[resolvedPath];
            logger.debug(`Module cache cleared: ${modulePath}`);
        }
    } catch (e) {
        // 模块可能不在缓存中，忽略错误
    }
}

/**
 * 加载内置模块配置
 * @returns {Array} 内置模块配置数组
 */
function loadBuiltinConfig() {
    try {
        const builtinConfig = require('./modulesConfig');
        return builtinConfig.modules || [];
    } catch (error) {
        logger.error('Failed to load builtin module config:', error);
        return [];
    }
}

/**
 * 加载用户模块配置
 * @returns {Object|null} 用户配置对象，包含 overrides 和 modules
 */
function loadUserConfig() {
    const configPath = getUserModulesConfigPath();
    
    if (!userModulesConfigExists()) {
        logger.debug('User module config file not found, skipping');
        return null;
    }
    
    try {
        // 清除 require 缓存，确保每次读取最新配置
        delete require.cache[require.resolve(configPath)];
        const userConfig = require(configPath);
        logger.info('Loaded user module config:', configPath);
        return userConfig;
    } catch (error) {
        logger.error('Failed to load user module config:', error);
        return null;
    }
}

/**
 * 合并内置配置和用户配置
 * @returns {Array} 合并后的模块配置数组
 */
function loadAllConfigs() {
    const builtinConfigs = loadBuiltinConfig();
    const userConfig = loadUserConfig();
    
    // 创建配置映射（按模块名）
    const configMap = new Map();
    
    // 先添加内置配置
    for (const config of builtinConfigs) {
        configMap.set(config.name, { ...config, source: 'builtin' });
    }
    
    // 如果有用户配置，进行合并
    if (userConfig) {
        // 处理 overrides（覆盖内置模块配置）
        if (userConfig.overrides) {
            for (const [name, override] of Object.entries(userConfig.overrides)) {
                if (configMap.has(name)) {
                    const existing = configMap.get(name);
                    configMap.set(name, { ...existing, ...override });
                    logger.debug(`User config overrides builtin module: ${name}`);
                }
            }
        }
        
        // 处理用户自定义模块
        if (userConfig.modules && Array.isArray(userConfig.modules)) {
            for (const userModule of userConfig.modules) {
                if (configMap.has(userModule.name)) {
                    // 同名模块，用户配置覆盖
                    const existing = configMap.get(userModule.name);
                    configMap.set(userModule.name, { ...existing, ...userModule, source: 'user' });
                    logger.debug(`User module override: ${userModule.name}`);
                } else {
                    // 新模块
                    configMap.set(userModule.name, { ...userModule, source: 'user' });
                    logger.debug(`Added user module: ${userModule.name}`);
                }
            }
        }
    }
    
    mergedModuleConfigs = Array.from(configMap.values());
    logger.info(`Loaded ${mergedModuleConfigs.length} module configs`);
    
    return mergedModuleConfigs;
}

/**
 * 获取已启用的模块配置
 * @param {Object} config 服务器配置（用于评估 enabledCondition）
 * @returns {Array} 已启用的模块配置数组
 */
function getEnabledModules(config) {
    return mergedModuleConfigs.filter(moduleConfig => {
        // 检查 enabled 标志
        if (moduleConfig.enabled === false) {
            return false;
        }
        
        // 检查 enabledCondition 函数
        if (typeof moduleConfig.enabledCondition === 'function') {
            return moduleConfig.enabledCondition(config);
        }
        
        return true;
    });
}

/**
 * 默认路径解析器
 * @param {Object} moduleConfig 模块配置
 * @returns {string} 绝对模块路径
 */
function defaultPathResolver(moduleConfig) {
    if (moduleConfig.source === 'user') {
        // 用户模块：相对于用户模块目录
        return path.resolve(getUserModulesDir(), moduleConfig.module);
    } else {
        // 内置模块：相对于当前目录（server/）
        return path.resolve(__dirname, moduleConfig.module);
    }
}

/**
 * 解析模块路径
 * @param {Object} moduleConfig 模块配置
 * @returns {string} 绝对模块路径
 */
function resolveModulePath(moduleConfig) {
    // 使用自定义路径解析器或默认解析器
    const resolver = runtimeOptions.pathResolver || defaultPathResolver;
    return resolver(moduleConfig);
}

/**
 * 重置管理器状态
 * 用于在不同入口重新初始化时清理状态
 */
function reset() {
    moduleInstances = {};
    mergedModuleConfigs = [];
    bootOrder = [];
    runtimeOptions = {};
    logger.debug('Module manager state reset');
}

/**
 * 初始化所有模块
 * @param {Object} config 服务器配置对象
 * @param {Object} options 运行时选项
 * @param {Function} options.pathResolver 自定义路径解析函数
 * @param {boolean} options.clearCache 是否清理模块缓存
 * @param {Object} options.runtimeContext 运行时上下文（workspaceDir, memoriesDir 等）
 * @returns {Object} 模块实例映射
 */
function initModules(config, options = {}) {
    // 保存运行时选项
    runtimeOptions = options;
    
    // 构建增强的 runtimeContext，注入核心服务
    const enhancedRuntimeContext = {
        ...options.runtimeContext,
        // 注入核心服务注册表，模块可通过 runtimeContext.services.XXX 访问
        services: getCoreServices()
    };
    
    // 保存增强后的 runtimeContext（用于热加载）
    options.runtimeContext = enhancedRuntimeContext;
    
    logger.info('Injected core services to runtimeContext:', Object.keys(coreServices).join(', '));
    
    const enabledModules = getEnabledModules(config);
    
    for (const moduleConfig of enabledModules) {
        try {
            // 解析模块路径
            const modulePath = resolveModulePath(moduleConfig);
            
            // 可选：清理模块缓存
            if (options.clearCache) {
                clearModuleCache(modulePath);
            }
            
            // 动态加载模块
            const serviceModule = require(modulePath);
            
            // 获取 setup 函数
            const setupFunction = serviceModule[moduleConfig.setupFunction];
            if (typeof setupFunction !== 'function') {
                logger.error(`Module ${moduleConfig.name} setup function not found: ${moduleConfig.setupFunction}`);
                continue;
            }
            
            // 生成初始化参数（使用增强的 runtimeContext）
            let moduleOptions = {};
            if (typeof moduleConfig.getOptions === 'function') {
                // getOptions 可以接收 config 和 runtimeContext 两个参数
                // runtimeContext.services 包含所有核心服务
                moduleOptions = moduleConfig.getOptions(config, enhancedRuntimeContext);
            }
            
            // 创建模块实例
            const instance = setupFunction(moduleOptions);
            moduleInstances[moduleConfig.name] = instance;
            
            logger.info(`Module initialized: ${moduleConfig.name} (source: ${moduleConfig.source || 'builtin'})`);
        } catch (error) {
            logger.error(`Failed to initialize module ${moduleConfig.name}:`, error);
        }
    }
    
    return moduleInstances;
}

/**
 * 为模块设置事件监听器
 * @param {Object} instance 模块实例
 * @param {Object} moduleConfig 模块配置
 */
function setupModuleEvents(instance, moduleConfig) {
    if (!moduleConfig.events || !instance.on) return;
    
    for (const [eventName, handler] of Object.entries(moduleConfig.events)) {
        if (typeof handler === 'function') {
            instance.on(eventName, handler);
        }
    }
}

/**
 * 启动单个模块
 * @param {Object} instance 模块实例
 * @param {Object} moduleConfig 模块配置
 * @param {Object} context 启动上下文
 */
async function bootstrapModule(instance, moduleConfig, context) {
    const { app, io } = context;
    
    try {
        // 初始化
        if (instance.init) {
            await instance.init();
        }
        
        // 设置路由
        if (moduleConfig.features?.hasRoutes && instance.setupRoutes) {
            instance.setupRoutes(app);
        }
        
        // 设置 Socket.IO（如果模块支持）
        if (io && instance.setupSocketIO) {
            instance.setupSocketIO(io);
            logger.info(`Module ${moduleConfig.name} Socket.IO namespace initialized`);
        }
        
        // 启动服务
        if (instance.start) {
            await instance.start();
        }
        
        // 设置事件监听器
        if (moduleConfig.features?.emitsEvents) {
            setupModuleEvents(instance, moduleConfig);
        }
        
        // 记录启动顺序
        bootOrder.push(moduleConfig.name);
        
        logger.info(`Module ${moduleConfig.name} started successfully`);
    } catch (error) {
        logger.error(`Error starting module ${moduleConfig.name}:`, error);
    }
}

/**
 * 启动所有模块
 * @param {Object} context 启动上下文 { app, io, http, config, PORT }
 */
async function bootstrapModules(context) {
    // 保存运行时上下文，用于热加载
    runtimeContext = context;
    
    const { config } = context;
    const enabledModules = getEnabledModules(config);
    
    for (const moduleConfig of enabledModules) {
        const instance = moduleInstances[moduleConfig.name];
        if (!instance) {
            logger.warn(`Module ${moduleConfig.name} not initialized, skipping`);
            continue;
        }
        
        logger.info(`Starting module: ${moduleConfig.name}...`);
        await bootstrapModule(instance, moduleConfig, context);
    }
}

/**
 * 关闭所有模块（按启动的逆序）
 */
async function shutdownModules() {
    // 按启动顺序的逆序关闭
    const reversedOrder = [...bootOrder].reverse();
    
    for (const moduleName of reversedOrder) {
        const instance = moduleInstances[moduleName];
        if (!instance) continue;
        
        try {
            if (instance.stop && typeof instance.stop === 'function') {
                await instance.stop();
                logger.info(`Module ${moduleName} stopped`);
            }
        } catch (error) {
            logger.error(`Error stopping module ${moduleName}:`, error);
        }
    }
    
    // 清空状态
    bootOrder = [];
}

// ============================================================
// 热加载 API - 运行时动态加载/卸载模块
// ============================================================

/**
 * 运行时加载单个模块
 * @param {string} moduleName 模块名称
 * @returns {Object} 加载结果 { success, data?, error? }
 */
async function loadSingleModule(moduleName) {
    try {
        // 检查运行时上下文是否可用
        if (!runtimeContext) {
            return { success: false, error: 'Service not fully started, cannot hot-load module' };
        }
        
        // 检查模块是否已加载
        if (moduleInstances[moduleName]) {
            return { success: false, error: `Module ${moduleName} already loaded, please unload or reload` };
        }
        
        // 重新读取用户配置以获取最新的模块信息
        const userConfig = loadUserConfig();
        if (!userConfig || !userConfig.modules) {
            return { success: false, error: 'Unable to read user module config' };
        }
        
        // 找到目标模块配置
        const moduleConfig = userConfig.modules.find(m => m.name === moduleName);
        if (!moduleConfig) {
            return { success: false, error: `Module config not found: ${moduleName}` };
        }
        
        // 标记为用户模块
        moduleConfig.source = 'user';
        
        // 解析模块路径
        const modulePath = resolveModulePath(moduleConfig);
        
        // 检查模块文件是否存在
        if (!fs.existsSync(modulePath)) {
            return { success: false, error: `Module file not found: ${modulePath}` };
        }
        
        // 清理可能的旧缓存
        clearModuleCache(modulePath);
        
        logger.info(`[Hot-load] Loading module: ${moduleName}...`);
        
        // 动态加载模块
        const serviceModule = require(modulePath);
        
        // 获取 setup 函数
        const setupFunction = serviceModule[moduleConfig.setupFunction];
        if (typeof setupFunction !== 'function') {
            return { success: false, error: `Module ${moduleName} setup function not found: ${moduleConfig.setupFunction}` };
        }
        
        // 生成初始化参数
        let moduleOptions = {};
        if (typeof moduleConfig.getOptions === 'function') {
            moduleOptions = moduleConfig.getOptions(runtimeContext.config, runtimeOptions.runtimeContext);
        }
        
        // 创建模块实例
        const instance = setupFunction(moduleOptions);
        moduleInstances[moduleName] = instance;
        
        // 添加到合并配置中（如果不存在）
        if (!mergedModuleConfigs.find(m => m.name === moduleName)) {
            mergedModuleConfigs.push(moduleConfig);
        }
        
        // 启动模块
        await bootstrapModule(instance, moduleConfig, runtimeContext);
        
        logger.info(`[Hot-load] Module ${moduleName} loaded successfully`);
        
        return { 
            success: true, 
            data: { 
                name: moduleName, 
                status: 'loaded',
                source: 'user'
            } 
        };
        
    } catch (error) {
        logger.error(`[Hot-load] Failed to load module ${moduleName}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 运行时卸载单个模块
 * @param {string} moduleName 模块名称
 * @returns {Object} 卸载结果 { success, data?, error? }
 */
async function unloadSingleModule(moduleName) {
    try {
        // 检查模块是否已加载
        const instance = moduleInstances[moduleName];
        if (!instance) {
            return { success: false, error: `Module ${moduleName} not loaded` };
        }
        
        // 找到模块配置
        const moduleConfig = mergedModuleConfigs.find(m => m.name === moduleName);
        
        // 不允许卸载内置模块
        if (moduleConfig && moduleConfig.source !== 'user') {
            return { success: false, error: `Cannot unload builtin module: ${moduleName}` };
        }
        
        logger.info(`[Hot-load] Unloading module: ${moduleName}...`);
        
        // 调用 stop 方法
        if (instance.stop && typeof instance.stop === 'function') {
            await instance.stop();
        }
        
        // 从实例映射中移除
        delete moduleInstances[moduleName];
        
        // 从启动顺序中移除
        const bootIndex = bootOrder.indexOf(moduleName);
        if (bootIndex !== -1) {
            bootOrder.splice(bootIndex, 1);
        }
        
        // 清理 require 缓存
        if (moduleConfig) {
            const modulePath = resolveModulePath(moduleConfig);
            clearModuleCache(modulePath);
        }
        
        logger.info(`[Hot-load] Module ${moduleName} unloaded`);
        
        return { 
            success: true, 
            data: { 
                name: moduleName, 
                status: 'unloaded' 
            } 
        };
        
    } catch (error) {
        logger.error(`[Hot-load] Failed to unload module ${moduleName}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 运行时重载单个模块（卸载后重新加载）
 * @param {string} moduleName 模块名称
 * @returns {Object} 重载结果 { success, data?, error? }
 */
async function reloadModule(moduleName) {
    try {
        logger.info(`[Hot-load] Reloading module: ${moduleName}...`);
        
        // 如果模块已加载，先卸载
        if (moduleInstances[moduleName]) {
            const unloadResult = await unloadSingleModule(moduleName);
            if (!unloadResult.success) {
                return unloadResult;
            }
        }
        
        // 重新加载
        const loadResult = await loadSingleModule(moduleName);
        if (!loadResult.success) {
            return loadResult;
        }
        
        logger.info(`[Hot-load] Module ${moduleName} reloaded successfully`);
        
        return { 
            success: true, 
            data: { 
                name: moduleName, 
                status: 'reloaded' 
            } 
        };
        
    } catch (error) {
        logger.error(`[Hot-load] Failed to reload module ${moduleName}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取所有已加载模块的状态信息
 * @returns {Array} 模块状态列表
 */
function getModulesStatus() {
    return mergedModuleConfigs.map(config => {
        const instance = moduleInstances[config.name];
        return {
            name: config.name,
            source: config.source || 'builtin',
            enabled: config.enabled !== false,
            loaded: !!instance,
            running: instance ? (instance.isRunning !== undefined ? instance.isRunning : true) : false,
            features: config.features || {}
        };
    });
}

/**
 * 获取单个模块实例
 * @param {string} name 模块名称
 * @returns {Object|null} 模块实例
 */
function getModule(name) {
    return moduleInstances[name] || null;
}

/**
 * 获取所有模块实例
 * @returns {Object} 模块实例映射
 */
function getAllModules() {
    return moduleInstances;
}

/**
 * 获取所有已加载的模块配置
 * @returns {Array} 模块配置数组
 */
function getModuleConfigs() {
    return mergedModuleConfigs;
}

/**
 * 获取运行时选项
 * @returns {Object} 运行时选项
 */
function getRuntimeOptions() {
    return runtimeOptions;
}

module.exports = {
    loadAllConfigs,
    getEnabledModules,
    initModules,
    bootstrapModules,
    shutdownModules,
    getModule,
    getAllModules,
    getModuleConfigs,
    getRuntimeOptions,
    reset,
    clearModuleCache,
    defaultPathResolver,
    // 热加载 API
    loadSingleModule,
    unloadSingleModule,
    reloadModule,
    getModulesStatus,
    // 核心服务 API
    getCoreServices
};
