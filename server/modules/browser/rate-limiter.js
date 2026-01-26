/**
 * 速率限制模块
 * 
 * 负责限制客户端请求频率：
 * - 全局请求限制（每分钟 N 次）
 * - 敏感操作限制（execute_script, get_cookies 等）
 * - 认证失败锁定（连续失败 N 次后锁定）
 * 
 * 使用滑动窗口算法实现
 */

const Logger = require('./logger');

/**
 * 限制类型枚举
 */
const LimitType = {
  GLOBAL: 'global',
  SENSITIVE: 'sensitive',
  AUTH_FAILURE: 'auth_failure'
};

/**
 * 速率限制器类
 */
class RateLimiter {
  /**
   * 构造函数
   * @param {Object} config 速率限制配置
   * @param {boolean} config.enabled 是否启用
   * @param {number} config.globalLimit 全局请求限制（每分钟）
   * @param {number} config.sensitiveLimit 敏感操作限制（每分钟）
   * @param {number} config.windowMs 时间窗口（毫秒）
   * @param {string[]} config.sensitiveActions 敏感操作列表
   * @param {number} config.maxFailedAttempts 最大认证失败次数
   * @param {number} config.lockoutDuration 锁定时间（秒）
   */
  constructor(config = {}) {
    this.config = {
      enabled: true,
      globalLimit: 300,           // 每分钟 300 次
      sensitiveLimit: 30,         // 敏感操作每分钟 30 次
      windowMs: 60000,            // 1 分钟窗口
      sensitiveActions: ['execute_script', 'get_cookies'],
      maxFailedAttempts: 5,
      lockoutDuration: 60,        // 锁定 60 秒
      ...config
    };

    // 请求计数器：Map<clientId, { requests: Array<timestamp>, sensitiveRequests: Array<timestamp> }>
    this.requestCounts = new Map();

    // 认证失败计数器：Map<clientAddress, Array<timestamp>>
    this.authFailureCounts = new Map();

    // 锁定列表：Map<clientAddress, unlockTime>
    this.lockedClients = new Map();

    // 启动定期清理
    this.startCleanupTimer();

    Logger.info(`RateLimiter initialized (global: ${this.config.globalLimit}/min, sensitive: ${this.config.sensitiveLimit}/min)`);
  }

  /**
   * 检查是否允许请求
   * @param {string} clientId 客户端标识
   * @param {string} action 操作类型
   * @returns {Object} { allowed: boolean, retryAfter?: number, limitType?: string }
   */
  checkLimit(clientId, action) {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 获取或创建客户端计数器
    let counter = this.requestCounts.get(clientId);
    if (!counter) {
      counter = { requests: [], sensitiveRequests: [] };
      this.requestCounts.set(clientId, counter);
    }

    // 清理过期的请求记录
    counter.requests = counter.requests.filter(t => t > windowStart);
    counter.sensitiveRequests = counter.sensitiveRequests.filter(t => t > windowStart);

    // 检查全局限制
    if (counter.requests.length >= this.config.globalLimit) {
      const oldestRequest = counter.requests[0];
      const retryAfter = Math.ceil((oldestRequest + this.config.windowMs - now) / 1000);
      
      Logger.warn(`[RateLimit] Global limit exceeded for ${clientId}: ${counter.requests.length}/${this.config.globalLimit}`);
      
      return {
        allowed: false,
        retryAfter,
        limitType: LimitType.GLOBAL
      };
    }

    // 检查敏感操作限制
    if (this.isSensitiveAction(action)) {
      if (counter.sensitiveRequests.length >= this.config.sensitiveLimit) {
        const oldestSensitive = counter.sensitiveRequests[0];
        const retryAfter = Math.ceil((oldestSensitive + this.config.windowMs - now) / 1000);
        
        Logger.warn(`[RateLimit] Sensitive limit exceeded for ${clientId}: ${counter.sensitiveRequests.length}/${this.config.sensitiveLimit}`);
        
        return {
          allowed: false,
          retryAfter,
          limitType: LimitType.SENSITIVE
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 记录一次请求
   * @param {string} clientId 客户端标识
   * @param {string} action 操作类型
   */
  recordRequest(clientId, action) {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    let counter = this.requestCounts.get(clientId);
    if (!counter) {
      counter = { requests: [], sensitiveRequests: [] };
      this.requestCounts.set(clientId, counter);
    }

    // 记录全局请求
    counter.requests.push(now);

    // 记录敏感操作
    if (this.isSensitiveAction(action)) {
      counter.sensitiveRequests.push(now);
    }
  }

  /**
   * 检查操作是否为敏感操作
   * @param {string} action 操作类型
   * @returns {boolean}
   */
  isSensitiveAction(action) {
    return this.config.sensitiveActions.includes(action);
  }

  /**
   * 记录认证失败
   * @param {string} clientAddress 客户端地址
   */
  recordAuthFailure(clientAddress) {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // 获取或创建失败计数
    let failures = this.authFailureCounts.get(clientAddress) || [];
    
    // 清理过期记录
    failures = failures.filter(t => t > windowStart);
    failures.push(now);
    
    this.authFailureCounts.set(clientAddress, failures);

    // 检查是否需要锁定
    if (failures.length >= this.config.maxFailedAttempts) {
      this.lockClient(clientAddress);
    }

    Logger.warn(`[RateLimit] Auth failure recorded for ${clientAddress}: ${failures.length}/${this.config.maxFailedAttempts}`);
  }

  /**
   * 锁定客户端
   * @param {string} clientAddress 客户端地址
   */
  lockClient(clientAddress) {
    const unlockTime = Date.now() + this.config.lockoutDuration * 1000;
    this.lockedClients.set(clientAddress, unlockTime);
    
    // 清空认证失败计数
    this.authFailureCounts.delete(clientAddress);

    Logger.warn(`[RateLimit] Client locked: ${clientAddress} until ${new Date(unlockTime).toISOString()}`);
  }

  /**
   * 检查客户端是否被锁定
   * @param {string} clientAddress 客户端地址
   * @returns {Object} { locked: boolean, unlockAt?: Date, retryAfter?: number }
   */
  isLocked(clientAddress) {
    if (!this.config.enabled) {
      return { locked: false };
    }

    const unlockTime = this.lockedClients.get(clientAddress);
    
    if (!unlockTime) {
      return { locked: false };
    }

    const now = Date.now();
    
    if (now >= unlockTime) {
      // 锁定已过期，解锁
      this.lockedClients.delete(clientAddress);
      return { locked: false };
    }

    const retryAfter = Math.ceil((unlockTime - now) / 1000);
    
    return {
      locked: true,
      unlockAt: new Date(unlockTime),
      retryAfter
    };
  }

  /**
   * 手动解锁客户端
   * @param {string} clientAddress 客户端地址
   * @returns {boolean} 是否成功解锁
   */
  unlockClient(clientAddress) {
    if (this.lockedClients.has(clientAddress)) {
      this.lockedClients.delete(clientAddress);
      this.authFailureCounts.delete(clientAddress);
      Logger.info(`[RateLimit] Client manually unlocked: ${clientAddress}`);
      return true;
    }
    return false;
  }

  /**
   * 启动定期清理定时器
   */
  startCleanupTimer() {
    // 每分钟清理一次过期数据
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * 清理过期数据
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedCounters = 0;
    let cleanedLocks = 0;

    // 清理请求计数器
    for (const [clientId, counter] of this.requestCounts) {
      counter.requests = counter.requests.filter(t => t > windowStart);
      counter.sensitiveRequests = counter.sensitiveRequests.filter(t => t > windowStart);
      
      // 如果计数器为空，删除它
      if (counter.requests.length === 0 && counter.sensitiveRequests.length === 0) {
        this.requestCounts.delete(clientId);
        cleanedCounters++;
      }
    }

    // 清理认证失败计数
    for (const [address, failures] of this.authFailureCounts) {
      const filtered = failures.filter(t => t > windowStart);
      if (filtered.length === 0) {
        this.authFailureCounts.delete(address);
      } else {
        this.authFailureCounts.set(address, filtered);
      }
    }

    // 清理过期的锁定
    for (const [address, unlockTime] of this.lockedClients) {
      if (now >= unlockTime) {
        this.lockedClients.delete(address);
        cleanedLocks++;
      }
    }

    if (cleanedCounters > 0 || cleanedLocks > 0) {
      Logger.debug(`[RateLimit] Cleanup: ${cleanedCounters} counters, ${cleanedLocks} locks`);
    }
  }

  /**
   * 重置客户端计数器
   * @param {string} clientId 客户端标识
   */
  resetClient(clientId) {
    this.requestCounts.delete(clientId);
    Logger.debug(`[RateLimit] Counter reset for ${clientId}`);
  }

  /**
   * 获取客户端状态
   * @param {string} clientId 客户端标识
   * @returns {Object} 客户端状态
   */
  getClientStatus(clientId) {
    const counter = this.requestCounts.get(clientId);
    
    if (!counter) {
      return {
        requests: 0,
        sensitiveRequests: 0,
        globalRemaining: this.config.globalLimit,
        sensitiveRemaining: this.config.sensitiveLimit
      };
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const requests = counter.requests.filter(t => t > windowStart).length;
    const sensitiveRequests = counter.sensitiveRequests.filter(t => t > windowStart).length;

    return {
      requests,
      sensitiveRequests,
      globalRemaining: Math.max(0, this.config.globalLimit - requests),
      sensitiveRemaining: Math.max(0, this.config.sensitiveLimit - sensitiveRequests)
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      config: {
        globalLimit: this.config.globalLimit,
        sensitiveLimit: this.config.sensitiveLimit,
        windowMs: this.config.windowMs,
        sensitiveActions: this.config.sensitiveActions,
        lockoutDuration: this.config.lockoutDuration
      },
      activeClients: this.requestCounts.size,
      lockedClients: this.lockedClients.size,
      pendingAuthFailures: this.authFailureCounts.size
    };
  }

  /**
   * 获取锁定的客户端列表
   * @returns {Array} 锁定的客户端列表
   */
  getLockedClients() {
    const result = [];
    const now = Date.now();

    for (const [address, unlockTime] of this.lockedClients) {
      if (now < unlockTime) {
        result.push({
          address,
          unlockAt: new Date(unlockTime),
          remainingSeconds: Math.ceil((unlockTime - now) / 1000)
        });
      }
    }

    return result;
  }

  /**
   * 停止速率限制器
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    Logger.info('RateLimiter stopped');
  }
}

// 导出限制类型枚举
RateLimiter.LimitType = LimitType;

module.exports = RateLimiter;
