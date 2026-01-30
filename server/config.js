/**
 * DeepSeek Cowork Server 配置模块
 * 
 * 提供统一的服务器配置管理
 */

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

/**
 * 加载配置文件并返回配置对象
 * @returns {Object} 配置对象
 */
function setupConfig() {
    // 确定配置文件路径
    const configFileName = process.env.DEEPSEEK_CONFIG_FILE || 'config.json';
    const configPath = path.join(__dirname, '..', 'config', configFileName);
    
    let config;
    try {
        // 检查指定的配置文件是否存在
        if (!fs.existsSync(configPath)) {
            logger.warn(`Config file not found: ${configPath}`);
            logger.info('Using default config...');
            config = getDefaultConfig();
        } else {
            logger.info(`Using config file: ${configFileName}`);
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (err) {
        logger.error('Error reading config file:', err);
        config = getDefaultConfig();
    }

    // 合并默认配置
    config = deepMerge(getDefaultConfig(), config);

    // 为了兼容现有代码，保留这两个属性
    config.port = config.server.port;
    config.host = config.server.host;
    
    // 生成完整的 baseUrl
    if (!config.server.baseUrl) {
        const protocol = config.server.protocol || 'http';
        const port = config.server.port || 3333;
        const host = config.server.host || 'localhost';
        
        const shouldShowPort = !(
            (protocol === 'http' && port === 80) || 
            (protocol === 'https' && port === 443)
        );
        
        config.server.baseUrl = shouldShowPort 
            ? `${protocol}://${host}:${port}`
            : `${protocol}://${host}`;
    }
    
    logger.info(`Server URL: ${config.server.baseUrl}`);
    
    return config;
}

/**
 * 获取默认配置
 * @returns {Object} 默认配置
 */
function getDefaultConfig() {
    return {
        server: {
            host: 'localhost',
            port: 3333,
            protocol: 'http',
            baseUrl: null
        },
        
        browserControl: {
            server: {
                host: 'localhost',
                port: 3333,
                routePrefix: '/api/browser',
                webInterfacePath: '/browser'
            },
            extensionWebSocket: {
                enabled: true,
                host: 'localhost',
                port: 8080,
                maxClients: 10
            },
            database: {
                path: 'data/browser_data.db',
                directory: 'data'
            },
            logging: {
                level: 'INFO'
            },
            monitoring: {
                enableConnectionMonitor: true,
                connectionCheckInterval: 30000
            }
        },
        
        cors: {
            origins: ['*'],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
        },
        
        bodyLimit: '100mb',
        enableRequestLogging: false
    };
}

/**
 * 深度合并配置对象
 * @param {Object} target 目标对象
 * @param {Object} source 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    
    return result;
}

module.exports = {
    setupConfig,
    getDefaultConfig,
    deepMerge
};
