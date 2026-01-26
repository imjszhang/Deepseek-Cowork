/**
 * 浏览器控制服务器配置模块
 * 
 * 为服务器提供配置管理，支持：
 * - 从项目配置系统加载
 * - 直接传入配置
 * - 动态 URL 生成
 */

const path = require('path');
const fs = require('fs');

/**
 * 浏览器控制服务器配置类
 */
class BrowserControlServerConfig {
  constructor() {
    this.config = null;
    this.configPath = null;
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置对象
   */
  getDefaultConfig() {
    return {
      // 服务器基础配置
      server: {
        host: 'localhost',
        port: 3333,
        baseUrl: null,
        routePrefix: '/api/browser',
        webInterfacePath: '/browser'
      },

      // WebSocket服务器配置 (浏览器扩展连接)
      extensionWebSocket: {
        enabled: true,
        host: 'localhost',
        port: 8080,
        maxClients: 10,
        baseUrl: null,
        reconnectAttempts: 5,
        reconnectDelay: 2000
      },

      // 数据库配置
      database: {
        path: 'data/browser_data.db',
        directory: 'data',
        autoCreate: true,
        performance: {
          walMode: true,
          cacheSize: 20000,
          tempStore: 'MEMORY',
          mmapSize: 268435456,
          busyTimeout: 5000,
          walAutocheckpoint: 1000
        }
      },

      // 事件系统配置
      events: {
        maxHistorySize: 1000,
        maxListeners: 50,
        enableBroadcast: true
      },

      // 安全配置
      security: {
        enableCors: true,
        corsOrigins: ['*'],  // 已弃用，使用 allowedOrigins 替代
        maxRequestSize: '100mb',
        enableRateLimit: false,
        rateLimitWindow: 60000,
        rateLimitMax: 100,
        
        // Origin 白名单配置（用于 WebSocket 和 HTTP CORS）
        allowedOrigins: [
          'moz-extension://*',      // Firefox 扩展
          'chrome-extension://*',   // Chrome 扩展
          'http://localhost:*',     // 本地开发
          'http://127.0.0.1:*',     // 本地开发
          'https://localhost:*',    // 本地 HTTPS
          'https://127.0.0.1:*'     // 本地 HTTPS
        ],
        allowNullOrigin: true,      // 允许无 Origin 的请求（Node.js 脚本、服务器端调用等）
        strictOriginCheck: true,    // 是否启用严格 Origin 检查
        
        // 安全日志配置
        securityLogging: {
          logRejectedConnections: true,  // 是否记录被拒绝的连接
          logLevel: 'WARN'               // 安全日志级别
        },

        // 认证配置（Challenge-Response 机制）
        auth: {
          enabled: true,              // 是否启用认证（开发环境可设为 false）
          secretKey: null,            // 密钥（首次启动自动生成，或从环境变量读取）
          secretKeyFile: 'data/auth_secret.key',  // 密钥文件路径
          sessionTTL: 3600,           // 会话有效期（秒）
          lockoutDuration: 60,        // 认证失败锁定时间（秒）
          maxFailedAttempts: 5,       // 连续失败多少次触发锁定
          challengeTimeout: 30        // Challenge 超时时间（秒）
        },

        // 速率限制配置
        rateLimit: {
          enabled: true,              // 是否启用速率限制
          globalLimit: 300,           // 全局请求限制（每分钟）
          sensitiveLimit: 30,         // 敏感操作限制（每分钟）
          windowMs: 60000,            // 时间窗口（毫秒）
          sensitiveActions: ['execute_script', 'get_cookies']  // 敏感操作列表
        },

        // 审计日志配置
        audit: {
          enabled: true,              // 是否启用审计日志
          storage: 'both',            // 存储方式：file | database | both
          logPath: 'logs/audit.log',  // 日志文件路径
          retentionDays: 30,          // 日志保留天数
          logActions: ['execute_script', 'get_cookies', 'open_url', 'close_tab'],  // 需要记录的操作
          logPayload: false           // 是否记录请求详情（可能包含敏感数据）
        }
      },

      // 日志配置
      logging: {
        level: 'INFO',
        enableConsole: true,
        enableFile: false,
        filePath: 'logs/browser-control.log',
        maxFileSize: '10mb',
        maxFiles: 5
      },

      // 监控配置
      monitoring: {
        enableHealthCheck: true,
        healthCheckInterval: 30000,
        enableMetrics: true,
        metricsInterval: 60000,
        enableConnectionMonitor: true,
        connectionCheckInterval: 30000
      }
    };
  }

  /**
   * 深度合并配置对象
   * @param {Object} target 目标对象
   * @param {Object} source 源对象
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 生成动态URL
   * @param {Object} config 配置对象
   */
  generateDynamicUrls(config) {
    if (!config.server.baseUrl && config.server.host && config.server.port) {
      const protocol = config.server.port === 443 ? 'https' : 'http';
      const port = (config.server.port === 80 || config.server.port === 443) ? '' : `:${config.server.port}`;
      config.server.baseUrl = `${protocol}://${config.server.host}${port}`;
    }

    if (!config.extensionWebSocket.baseUrl && config.extensionWebSocket.host && config.extensionWebSocket.port) {
      const protocol = config.extensionWebSocket.port === 443 ? 'wss' : 'ws';
      const port = (config.extensionWebSocket.port === 80 || config.extensionWebSocket.port === 443) ? '' : `:${config.extensionWebSocket.port}`;
      config.extensionWebSocket.baseUrl = `${protocol}://${config.extensionWebSocket.host}${port}`;
    }
  }

  /**
   * 验证配置
   * @param {Object} config 配置对象
   * @returns {Array} 验证错误数组
   */
  validateConfig(config) {
    const errors = [];

    if (!config.server) {
      errors.push('缺少server配置节');
    }
    if (!config.extensionWebSocket) {
      errors.push('缺少extensionWebSocket配置节');
    }
    if (!config.database) {
      errors.push('缺少database配置节');
    }

    if (config.extensionWebSocket.enabled && (!config.extensionWebSocket.port || config.extensionWebSocket.port < 1 || config.extensionWebSocket.port > 65535)) {
      errors.push('扩展WebSocket端口号无效 (必须在1-65535范围内)');
    }

    if (!config.extensionWebSocket.host) {
      errors.push('扩展WebSocket主机地址不能为空');
    }

    if (!config.database.path) {
      errors.push('数据库路径不能为空');
    }
    if (!config.database.directory) {
      errors.push('数据库目录不能为空');
    }

    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (config.logging.level && !validLogLevels.includes(config.logging.level.toUpperCase())) {
      errors.push(`无效的日志级别: ${config.logging.level}，必须是: ${validLogLevels.join(', ')}`);
    }

    return errors;
  }

  /**
   * 初始化配置
   * @param {Object} options 选项
   * @param {Object} options.browserControlConfig 浏览器控制配置
   * @param {Object} options.serverConfig 主服务器配置
   * @returns {Object} 最终配置
   */
  initialize(options = {}) {
    try {
      // 1. 从默认配置开始
      let config = JSON.parse(JSON.stringify(this.defaultConfig));

      // 2. 合并传入的 browserControlConfig
      if (options.browserControlConfig) {
        console.log('Using integrated config mode');
        config = this.deepMerge(config, options.browserControlConfig);
      } else {
        console.log('Using standalone config mode');
      }

      // 3. 从主服务器配置继承
      if (options.serverConfig) {
        if (options.serverConfig.port && !options.browserControlConfig?.server?.port) {
          config.server.port = options.serverConfig.port;
        }
        if (options.serverConfig.host) {
          config.server.host = options.serverConfig.host;
        }
        if (options.serverConfig.wsPort) {
          config.extensionWebSocket.port = options.serverConfig.wsPort;
        }
      }

      // 4. 生成动态URL
      this.generateDynamicUrls(config);

      // 5. 验证配置
      const errors = this.validateConfig(config);
      if (errors.length > 0) {
        throw new Error(`浏览器控制服务器配置验证失败: ${errors.join(', ')}`);
      }

      // 6. 保存最终配置
      this.config = config;

      console.log('Browser control server config initialized successfully');
      return config;
    } catch (error) {
      console.error('Browser control server config initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    if (!this.config) {
      throw new Error('配置尚未初始化，请先调用 initialize() 方法');
    }
    return this.config;
  }

  /**
   * 获取配置的某个部分
   * @param {string} section 配置节名称
   * @returns {Object} 配置节
   */
  getSection(section) {
    const config = this.getConfig();
    return config[section] || {};
  }

  /**
   * 获取配置摘要信息
   * @returns {Object} 配置摘要
   */
  getSummary() {
    if (!this.config) {
      return { status: 'not_initialized' };
    }

    return {
      status: 'initialized',
      configPath: this.configPath,
      server: {
        host: this.config.server.host,
        port: this.config.server.port,
        baseUrl: this.config.server.baseUrl
      },
      extensionWebSocket: {
        enabled: this.config.extensionWebSocket.enabled,
        host: this.config.extensionWebSocket.host,
        port: this.config.extensionWebSocket.port,
        baseUrl: this.config.extensionWebSocket.baseUrl
      },
      database: {
        path: this.config.database.path,
        directory: this.config.database.directory
      }
    };
  }
}

// 创建全局配置实例
const browserControlServerConfig = new BrowserControlServerConfig();

module.exports = {
  BrowserControlServerConfig,
  browserControlServerConfig
};
