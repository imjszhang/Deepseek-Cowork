/**
 * 资源监控模块
 * 
 * 负责监控服务资源使用情况：
 * - pendingResponses 数量监控
 * - callback 表大小监控
 * - 内存使用监控
 * - 提供健康检查端点数据
 * - 触发紧急清理
 */

const Logger = require('./logger');

/**
 * 资源监控器类
 */
class ResourceMonitor {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {boolean} options.enabled 是否启用
   * @param {number} options.maxPendingResponses 最大待处理响应数
   * @param {number} options.maxCallbacks 最大回调数
   * @param {number} options.healthCheckInterval 健康检查间隔（毫秒）
   * @param {number} options.warningThreshold 警告阈值（0-1）
   */
  constructor(options = {}) {
    this.config = {
      enabled: true,
      maxPendingResponses: 100,
      maxCallbacks: 1000,
      healthCheckInterval: 30000,
      warningThreshold: 0.8,
      ...options
    };

    // 依赖注入
    this.extensionWebSocketServer = null;
    this.callbackManager = null;
    this.database = null;

    // 状态
    this.healthCheckTimer = null;
    this.lastHealthCheck = null;
    this.isRunning = false;

    // 统计
    this.stats = {
      healthChecks: 0,
      warnings: 0,
      emergencyCleanups: 0,
      rejectedRequests: 0
    };

    Logger.info(`ResourceMonitor initialized (maxPending: ${this.config.maxPendingResponses}, maxCallbacks: ${this.config.maxCallbacks})`);
  }

  /**
   * 设置依赖
   * @param {Object} deps 依赖对象
   */
  setDependencies(deps) {
    if (deps.extensionWebSocketServer) {
      this.extensionWebSocketServer = deps.extensionWebSocketServer;
    }
    if (deps.callbackManager) {
      this.callbackManager = deps.callbackManager;
    }
    if (deps.database) {
      this.database = deps.database;
    }
  }

  /**
   * 启动监控
   */
  start() {
    if (!this.config.enabled || this.isRunning) {
      return;
    }

    this.isRunning = true;

    // 启动定期健康检查
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(err => {
        Logger.error(`Health check error: ${err.message}`);
      });
    }, this.config.healthCheckInterval);

    Logger.info('ResourceMonitor started');
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.isRunning = false;
    Logger.info('ResourceMonitor stopped');
  }

  /**
   * 执行健康检查
   * @returns {Object} 健康状态
   */
  async performHealthCheck() {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
      warnings: []
    };

    try {
      // 检查 pendingResponses
      if (this.extensionWebSocketServer) {
        const pendingStats = this.extensionWebSocketServer.getPendingStats();
        const pendingCount = pendingStats.total;
        const pendingUsage = pendingCount / this.config.maxPendingResponses;

        health.checks.pendingResponses = {
          count: pendingCount,
          max: this.config.maxPendingResponses,
          usage: pendingUsage,
          byType: pendingStats.byType
        };

        if (pendingUsage >= 1) {
          health.status = 'critical';
          health.warnings.push(`PendingResponses at capacity: ${pendingCount}/${this.config.maxPendingResponses}`);
        } else if (pendingUsage >= this.config.warningThreshold) {
          health.status = health.status === 'healthy' ? 'warning' : health.status;
          health.warnings.push(`PendingResponses high: ${pendingCount}/${this.config.maxPendingResponses}`);
        }
      }

      // 检查 callbacks
      if (this.callbackManager) {
        const callbackStats = this.callbackManager.getStats();
        const pendingCallbacks = callbackStats.pendingCount;
        const callbackUsage = pendingCallbacks / this.config.maxCallbacks;

        health.checks.callbacks = {
          pending: pendingCallbacks,
          max: this.config.maxCallbacks,
          usage: callbackUsage
        };

        if (callbackUsage >= 1) {
          health.status = 'critical';
          health.warnings.push(`Callbacks at capacity: ${pendingCallbacks}/${this.config.maxCallbacks}`);
        } else if (callbackUsage >= this.config.warningThreshold) {
          health.status = health.status === 'healthy' ? 'warning' : health.status;
          health.warnings.push(`Callbacks high: ${pendingCallbacks}/${this.config.maxCallbacks}`);
        }
      }

      // 检查数据库连接
      if (this.database) {
        try {
          await this.database.get('SELECT 1');
          health.checks.database = { status: 'connected' };
        } catch (err) {
          health.status = 'critical';
          health.checks.database = { status: 'error', error: err.message };
          health.warnings.push(`Database error: ${err.message}`);
        }
      }

      // 检查内存使用
      const memUsage = process.memoryUsage();
      health.checks.memory = {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        heapUsage: memUsage.heapUsed / memUsage.heapTotal
      };

      // 更新统计
      this.stats.healthChecks++;
      if (health.warnings.length > 0) {
        this.stats.warnings += health.warnings.length;
        health.warnings.forEach(w => Logger.warn(`[HealthCheck] ${w}`));
      }

      // 如果状态为 critical，触发紧急清理
      if (health.status === 'critical') {
        await this.triggerEmergencyCleanup();
      }

      this.lastHealthCheck = health;
      return health;

    } catch (err) {
      Logger.error(`Health check failed: ${err.message}`);
      health.status = 'error';
      health.error = err.message;
      return health;
    }
  }

  /**
   * 触发紧急清理
   */
  async triggerEmergencyCleanup() {
    Logger.warn('[ResourceMonitor] Triggering emergency cleanup');
    this.stats.emergencyCleanups++;

    try {
      // 清理 CallbackManager 中过期的请求
      if (this.callbackManager) {
        await this.callbackManager.cleanupExpiredCallbacks();
        await this.callbackManager.cleanupExpiredResponses();
      }

      // 清理 ExtensionWebSocketServer 中过期的 pendingResponses
      if (this.extensionWebSocketServer) {
        this.extensionWebSocketServer.cleanupPendingResponses();
      }

      Logger.info('[ResourceMonitor] Emergency cleanup completed');
    } catch (err) {
      Logger.error(`Emergency cleanup failed: ${err.message}`);
    }
  }

  /**
   * 检查是否可以接受新请求
   * @returns {Object} { allowed: boolean, reason?: string }
   */
  canAcceptRequest() {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    // 检查 pendingResponses
    if (this.extensionWebSocketServer) {
      const pendingStats = this.extensionWebSocketServer.getPendingStats();
      if (pendingStats.total >= this.config.maxPendingResponses) {
        this.stats.rejectedRequests++;
        return {
          allowed: false,
          reason: `Server at capacity: ${pendingStats.total} pending requests`,
          retryAfter: 5
        };
      }
    }

    // 检查 callbacks
    if (this.callbackManager) {
      const callbackStats = this.callbackManager.getStats();
      if (callbackStats.pendingCount >= this.config.maxCallbacks) {
        this.stats.rejectedRequests++;
        return {
          allowed: false,
          reason: `Server at capacity: ${callbackStats.pendingCount} pending callbacks`,
          retryAfter: 5
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 获取健康状态（用于 API 端点）
   * @returns {Object} 健康状态
   */
  getHealth() {
    if (this.lastHealthCheck) {
      return this.lastHealthCheck;
    }

    return {
      timestamp: new Date().toISOString(),
      status: 'unknown',
      message: 'No health check performed yet'
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      config: {
        maxPendingResponses: this.config.maxPendingResponses,
        maxCallbacks: this.config.maxCallbacks,
        healthCheckInterval: this.config.healthCheckInterval,
        warningThreshold: this.config.warningThreshold
      },
      statistics: this.stats,
      lastHealthCheck: this.lastHealthCheck?.timestamp || null
    };
  }

  /**
   * 手动触发清理
   * @returns {Object} 清理结果
   */
  async manualCleanup() {
    Logger.info('[ResourceMonitor] Manual cleanup triggered');

    const result = {
      timestamp: new Date().toISOString(),
      cleanedCallbacks: 0,
      cleanedResponses: 0,
      cleanedPending: 0
    };

    try {
      if (this.callbackManager) {
        result.cleanedCallbacks = await this.callbackManager.cleanupExpiredCallbacks();
        result.cleanedResponses = await this.callbackManager.cleanupExpiredResponses();
      }

      if (this.extensionWebSocketServer) {
        result.cleanedPending = this.extensionWebSocketServer.cleanupPendingResponses();
      }

      Logger.info(`[ResourceMonitor] Manual cleanup completed: ${JSON.stringify(result)}`);
      return result;

    } catch (err) {
      Logger.error(`Manual cleanup failed: ${err.message}`);
      result.error = err.message;
      return result;
    }
  }
}

module.exports = ResourceMonitor;
