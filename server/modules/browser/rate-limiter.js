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
   * @param {number} config.callbackQueryLimit 回调查询限制（每分钟）
   * @param {number} config.perRequestIdLimit 单个 requestId 最大查询次数
   * @param {number} config.callbackQueryWindow 回调查询时间窗口（毫秒）
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
      // 回调轮询限制
      callbackQueryLimit: 60,     // 每分钟回调查询限制
      perRequestIdLimit: 60,      // 单个 requestId 最大查询次数
      callbackQueryWindow: 60000, // 回调查询时间窗口
      ...config
    };

    // 请求计数器：Map<clientId, { requests: Array<timestamp>, sensitiveRequests: Array<timestamp> }>
    this.requestCounts = new Map();

    // 认证失败计数器：Map<clientAddress, Array<timestamp>>
    this.authFailureCounts = new Map();

    // 锁定列表：Map<clientAddress, unlockTime>
    this.lockedClients = new Map();

    // 回调查询计数器：Map<clientId, { queries: Array<timestamp> }>
    this.callbackQueryCounts = new Map();

    // 单个 requestId 查询计数：Map<requestId, count>
    this.requestIdQueryCounts = new Map();

    // 启动定期清理
    this.startCleanupTimer();

    Logger.info(`RateLimiter initialized (global: ${this.config.globalLimit}/min, sensitive: ${this.config.sensitiveLimit}/min, callbackQuery: ${this.config.callbackQueryLimit}/min)`);
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
   * 检查回调查询是否允许
   * @param {string} clientId 客户端标识
   * @param {string} requestId 请求ID
   * @returns {Object} { allowed: boolean, retryAfter?: number, limitType?: string, reason?: string }
   */
  checkCallbackQueryLimit(clientId, requestId) {
    if (!this.config.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const windowStart = now - this.config.callbackQueryWindow;

    // 检查单个 requestId 的查询次数
    const requestIdCount = this.requestIdQueryCounts.get(requestId) || 0;
    if (requestIdCount >= this.config.perRequestIdLimit) {
      Logger.warn(`[RateLimit] Per-requestId limit exceeded for ${requestId}: ${requestIdCount}/${this.config.perRequestIdLimit}`);
      
      return {
        allowed: false,
        retryAfter: 0,  // 不需要重试，这个 requestId 已经超限
        limitType: 'per_request_id',
        reason: `Request ${requestId} has been queried ${requestIdCount} times, exceeding limit of ${this.config.perRequestIdLimit}`
      };
    }

    // 检查客户端的回调查询频率
    let counter = this.callbackQueryCounts.get(clientId);
    if (!counter) {
      counter = { queries: [] };
      this.callbackQueryCounts.set(clientId, counter);
    }

    // 清理过期的查询记录
    counter.queries = counter.queries.filter(t => t > windowStart);

    if (counter.queries.length >= this.config.callbackQueryLimit) {
      const oldestQuery = counter.queries[0];
      const retryAfter = Math.ceil((oldestQuery + this.config.callbackQueryWindow - now) / 1000);
      
      Logger.warn(`[RateLimit] Callback query limit exceeded for ${clientId}: ${counter.queries.length}/${this.config.callbackQueryLimit}`);
      
      return {
        allowed: false,
        retryAfter,
        limitType: 'callback_query',
        reason: `Callback query rate limit exceeded`
      };
    }

    return { allowed: true };
  }

  /**
   * 记录一次回调查询
   * @param {string} clientId 客户端标识
   * @param {string} requestId 请求ID
   */
  recordCallbackQuery(clientId, requestId) {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    // 记录客户端查询
    let counter = this.callbackQueryCounts.get(clientId);
    if (!counter) {
      counter = { queries: [] };
      this.callbackQueryCounts.set(clientId, counter);
    }
    counter.queries.push(now);

    // 记录 requestId 查询次数
    const currentCount = this.requestIdQueryCounts.get(requestId) || 0;
    this.requestIdQueryCounts.set(requestId, currentCount + 1);
  }

  /**
   * 清除 requestId 的查询计数（请求完成后调用）
   * @param {string} requestId 请求ID
   */
  clearRequestIdCount(requestId) {
    this.requestIdQueryCounts.delete(requestId);
  }

  /**
   * 获取 requestId 的查询次数
   * @param {string} requestId 请求ID
   * @returns {number} 查询次数
   */
  getRequestIdQueryCount(requestId) {
    return this.requestIdQueryCounts.get(requestId) || 0;
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
    const callbackWindowStart = now - this.config.callbackQueryWindow;
    let cleanedCounters = 0;
    let cleanedLocks = 0;
    let cleanedCallbackCounters = 0;

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

    // 清理回调查询计数
    for (const [clientId, counter] of this.callbackQueryCounts) {
      counter.queries = counter.queries.filter(t => t > callbackWindowStart);
      
      if (counter.queries.length === 0) {
        this.callbackQueryCounts.delete(clientId);
        cleanedCallbackCounters++;
      }
    }

    // 清理老的 requestId 查询计数（超过 5 分钟的）
    // 注意：这里只是定期清理，正常情况下应该在请求完成时调用 clearRequestIdCount
    // 这里作为兜底清理
    const maxRequestIdAge = 5 * 60 * 1000;  // 5 分钟
    // requestIdQueryCounts 没有时间戳，所以无法精确清理
    // 但如果数量过多，可以考虑全部清空
    if (this.requestIdQueryCounts.size > 10000) {
      Logger.warn(`[RateLimit] requestIdQueryCounts too large (${this.requestIdQueryCounts.size}), clearing all`);
      this.requestIdQueryCounts.clear();
    }

    if (cleanedCounters > 0 || cleanedLocks > 0 || cleanedCallbackCounters > 0) {
      Logger.debug(`[RateLimit] Cleanup: ${cleanedCounters} counters, ${cleanedLocks} locks, ${cleanedCallbackCounters} callback counters`);
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
        lockoutDuration: this.config.lockoutDuration,
        callbackQueryLimit: this.config.callbackQueryLimit,
        perRequestIdLimit: this.config.perRequestIdLimit
      },
      activeClients: this.requestCounts.size,
      lockedClients: this.lockedClients.size,
      pendingAuthFailures: this.authFailureCounts.size,
      callbackQueryClients: this.callbackQueryCounts.size,
      trackedRequestIds: this.requestIdQueryCounts.size
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
