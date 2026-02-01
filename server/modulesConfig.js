/**
 * 内置模块配置
 * 
 * 声明式配置 server/modules/ 下的内置模块
 * 由 modulesManager.js 加载和管理
 */

const path = require('path');
const logger = require('./utils/logger');
const { getUserDataDir } = require('./utils/userDataDir');

/**
 * 内置模块配置列表
 */
const modules = [
    {
        // 浏览器控制服务
        name: 'browser',
        module: './modules/browser',
        setupFunction: 'setupBrowserControlService',
        enabled: true,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数
        getOptions: (config, runtimeContext) => ({
            browserControlConfig: config.browserControl,
            serverConfig: {
                host: config.server.host,
                port: config.server.port
            }
        }),
        
        // 事件监听配置
        events: {
            started: ({ serverInfo }) => {
                logger.info('Browser control server started');
                logger.info('Config summary:', JSON.stringify(serverInfo.config, null, 2));
                if (serverInfo.connections?.extensionWebSocket?.enabled) {
                    logger.info(`Browser extension WebSocket: ${serverInfo.connections.extensionWebSocket.baseUrl}`);
                }
            },
            stopped: () => {
                logger.info('Browser control server stopped');
            },
            error: ({ type, error }) => {
                logger.error(`Browser control server error (${type}):`, error);
            }
        }
    },
    
    {
        // Explorer 文件浏览服务
        name: 'explorer',
        module: './modules/explorer',
        setupFunction: 'setupExplorerService',
        enabled: true,
        
        // 启用条件（通过配置控制）
        enabledCondition: (config) => config.explorer?.enabled !== false,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数（支持 runtimeContext）
        getOptions: (config, runtimeContext) => {
            // 使用 runtimeContext 中的 workspaceDir，如果没有则使用默认值
            const workspaceDir = runtimeContext?.workspaceDir || global.rootDir || process.cwd();
            
            return {
                explorerConfig: {
                    ...config.explorer,
                    // 如果 runtimeContext 提供了 watchDirs，使用它
                    watchDirs: runtimeContext?.watchDirs || config.explorer?.watchDirs
                },
                serverConfig: {
                    host: config.server.host,
                    port: config.server.port
                },
                appDir: workspaceDir
            };
        },
        
        // 事件监听配置
        events: {
            started: ({ serverInfo }) => {
                logger.info('Explorer service started');
                logger.info('Explorer config summary:', JSON.stringify(serverInfo.config, null, 2));
            },
            stopped: () => {
                logger.info('Explorer service stopped');
            },
            error: ({ type, error }) => {
                logger.error(`Explorer service error (${type}):`, error);
            },
            file_change: (data) => {
                logger.debug(`File change: ${data.type} - ${data.path}`);
            }
        }
    },
    
    {
        // Memory 记忆服务
        name: 'memory',
        module: './modules/memory',
        setupFunction: 'setupMemoryService',
        enabled: true,
        
        // 启用条件（通过配置控制）
        enabledCondition: (config) => config.memory?.enabled !== false,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数（支持 runtimeContext）
        getOptions: (config, runtimeContext) => {
            // 使用 runtimeContext 中的 memoriesDir，如果没有则使用默认值
            const memoriesDir = runtimeContext?.memoriesDir || path.join(getUserDataDir(), 'memories');
            
            // 从 runtimeContext.services 获取核心服务
            const services = runtimeContext?.services || {};
            
            return {
                serverConfig: {
                    host: config.server.host,
                    port: config.server.port
                },
                dataDir: memoriesDir,
                // 注入核心服务（通过 runtimeContext.services 获取）
                // 模块内部可直接使用，无需再 require
                MemoryManager: services.MemoryManager,
                MessageStore: services.MessageStore
            };
        },
        
        // 事件监听配置
        events: {
            started: ({ serverInfo }) => {
                logger.info('Memory service started');
            },
            stopped: () => {
                logger.info('Memory service stopped');
            },
            error: ({ type, error }) => {
                logger.error(`Memory service error (${type}):`, error);
            },
            'memory:saved': ({ sessionId, memoryName, messageCount }) => {
                logger.info(`Memory saved: ${memoryName} (${messageCount} messages)`);
            }
        }
    },
    
    {
        // Process 进程管理服务
        name: 'process',
        module: './modules/process',
        setupFunction: 'setupProcessService',
        enabled: true,
        
        // 启用条件（通过配置控制）
        enabledCondition: (config) => config.process?.enabled !== false,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数（支持 runtimeContext）
        getOptions: (config, runtimeContext) => {
            // 使用 runtimeContext 中的 workspaceDir，如果没有则使用默认值
            const workspaceDir = runtimeContext?.workspaceDir || global.rootDir || process.cwd();
            
            return {
                workDir: workspaceDir,
                maxConcurrentProcesses: config.process?.maxConcurrentProcesses || 5,
                processTimeout: config.process?.processTimeout || 8 * 60 * 60 * 1000, // 8小时
                enableLogging: config.process?.enableLogging !== false,
                enableCleanup: config.process?.enableCleanup !== false,
                cleanupInterval: config.process?.cleanupInterval || 60 * 60 * 1000, // 1小时
                maxLogsPerProcess: config.process?.maxLogsPerProcess || 1000
            };
        },
        
        // 事件监听配置
        events: {
            started: ({ serviceName, startTime, config }) => {
                logger.info('Process service started');
                logger.info('Process config:', JSON.stringify(config, null, 2));
            },
            stopped: ({ serviceName, stopTime }) => {
                logger.info('Process service stopped');
            },
            error: ({ type, error }) => {
                logger.error(`Process service error (${type}):`, error);
            },
            processStarted: ({ processId, pid, metadata }) => {
                logger.info(`Process started: ${processId} (PID: ${pid})`);
            },
            processCompleted: ({ processId, exitCode, duration }) => {
                logger.info(`Process completed: ${processId} (exit: ${exitCode}, duration: ${duration}ms)`);
            },
            processError: ({ processId, error }) => {
                logger.error(`Process error: ${processId} - ${error.message}`);
            },
            processTimeout: ({ processId }) => {
                logger.warn(`Process timeout: ${processId}`);
            }
        }
    },
    
    {
        // Scheduler 调度器服务
        name: 'scheduler',
        module: './modules/scheduler',
        setupFunction: 'setupSchedulerService',
        enabled: true,
        
        // 启用条件（通过配置控制）
        enabledCondition: (config) => config.scheduler?.enabled !== false,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数（支持 runtimeContext）
        getOptions: (config, runtimeContext) => {
            // 调度器配置保存在用户数据目录
            const schedulerDir = path.join(getUserDataDir(), 'scheduler');
            
            return {
                workDir: schedulerDir,
                serviceName: 'Scheduler',
                autoStartScheduler: config.scheduler?.autoStartScheduler !== false,
                enableLogging: config.scheduler?.enableLogging !== false,
                maxLogs: config.scheduler?.maxLogs || 1000
            };
        },
        
        // 事件监听配置
        events: {
            started: ({ serviceName, startTime, config }) => {
                logger.info('Scheduler service started');
            },
            stopped: ({ serviceName, uptime }) => {
                logger.info('Scheduler service stopped');
            },
            error: ({ type, error }) => {
                logger.error(`Scheduler service error (${type}):`, error);
            },
            task_execution_completed: ({ taskId, executionId, duration, exitCode }) => {
                logger.info(`Scheduler task completed: ${taskId} (exit: ${exitCode}, duration: ${duration}ms)`);
            },
            task_execution_failed: ({ taskId, executionId, error }) => {
                logger.error(`Scheduler task failed: ${taskId} - ${error}`);
            }
        }
    }
];

module.exports = {
    modules
};
