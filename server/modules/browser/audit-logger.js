/**
 * 审计日志模块
 * 
 * 负责记录系统中的安全相关事件：
 * - 认证成功/失败
 * - 敏感操作（execute_script, get_cookies 等）
 * - 速率限制触发
 * - 会话生命周期
 * 
 * 支持多种存储方式：
 * - file: 写入日志文件
 * - database: 写入 SQLite 数据库
 * - both: 同时写入两者
 */

const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

/**
 * 事件类型枚举
 */
const EventType = {
  AUTH_SUCCESS: 'AUTH_SUCCESS',      // 认证成功
  AUTH_FAILURE: 'AUTH_FAILURE',      // 认证失败
  SENSITIVE_OP: 'SENSITIVE_OP',      // 敏感操作
  RATE_LIMITED: 'RATE_LIMITED',      // 速率限制触发
  SESSION_END: 'SESSION_END',        // 会话结束
  CONNECTION: 'CONNECTION',          // 连接事件
  ERROR: 'ERROR'                     // 错误事件
};

/**
 * 审计日志类
 */
class AuditLogger {
  /**
   * 构造函数
   * @param {Object} config 审计配置
   * @param {boolean} config.enabled 是否启用
   * @param {string} config.storage 存储方式 (file | database | both)
   * @param {string} config.logPath 日志文件路径
   * @param {number} config.retentionDays 日志保留天数
   * @param {string[]} config.logActions 需要记录的操作列表
   * @param {boolean} config.logPayload 是否记录请求详情
   * @param {Object} database 数据库实例
   */
  constructor(config = {}, database = null) {
    this.config = {
      enabled: true,
      storage: 'both',
      logPath: 'logs/audit.log',
      retentionDays: 30,
      logActions: ['execute_script', 'get_cookies', 'open_url', 'close_tab'],
      logPayload: false,
      ...config
    };

    this.database = database;
    this.logStream = null;
    this.writeQueue = [];
    this.isWriting = false;

    // 初始化日志文件
    if (this.config.enabled && ['file', 'both'].includes(this.config.storage)) {
      this.initLogFile();
    }

    // 启动定期清理
    if (this.config.enabled && this.config.retentionDays > 0) {
      this.startRetentionTimer();
    }

    Logger.info(`AuditLogger initialized (storage: ${this.config.storage})`);
  }

  /**
   * 初始化日志文件
   */
  initLogFile() {
    try {
      const logPath = path.isAbsolute(this.config.logPath)
        ? this.config.logPath
        : path.join(global.rootDir || process.cwd(), this.config.logPath);

      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      this.logFilePath = logPath;
      this.logStream = fs.createWriteStream(logPath, { flags: 'a' });

      this.logStream.on('error', (err) => {
        Logger.error(`Audit log file error: ${err.message}`);
      });

      Logger.info(`Audit log file: ${logPath}`);
    } catch (err) {
      Logger.error(`Failed to initialize audit log file: ${err.message}`);
    }
  }

  /**
   * 记录审计事件
   * @param {Object} event 事件对象
   */
  async log(event) {
    if (!this.config.enabled) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };

    // 根据配置选择存储方式
    const promises = [];

    if (['file', 'both'].includes(this.config.storage)) {
      promises.push(this.writeToFile(logEntry));
    }

    if (['database', 'both'].includes(this.config.storage) && this.database) {
      promises.push(this.writeToDatabase(logEntry));
    }

    try {
      await Promise.all(promises);
    } catch (err) {
      Logger.error(`Failed to write audit log: ${err.message}`);
    }
  }

  /**
   * 写入日志文件
   * @param {Object} entry 日志条目
   */
  async writeToFile(entry) {
    if (!this.logStream) {
      return;
    }

    return new Promise((resolve, reject) => {
      const line = JSON.stringify(entry) + '\n';
      this.logStream.write(line, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 写入数据库
   * @param {Object} entry 日志条目
   */
  async writeToDatabase(entry) {
    if (!this.database) {
      return;
    }

    try {
      const query = `
        INSERT INTO audit_logs (
          timestamp, event_type, session_id, client_id, client_type,
          client_address, action, target_tab_id, target_url,
          status, duration, request_id, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        entry.timestamp,
        entry.eventType || null,
        entry.sessionId || null,
        entry.clientId || null,
        entry.clientType || null,
        entry.clientAddress || null,
        entry.action || null,
        entry.targetTabId || null,
        entry.targetUrl || null,
        entry.status || null,
        entry.duration || null,
        entry.requestId || null,
        entry.details ? JSON.stringify(entry.details) : null
      ];

      await this.database.run(query, params);
    } catch (err) {
      Logger.error(`Failed to write audit log to database: ${err.message}`);
    }
  }

  /**
   * 记录认证成功
   * @param {string} sessionId 会话ID
   * @param {string} clientId 客户端标识
   * @param {string} clientType 客户端类型
   * @param {string} clientAddress 客户端地址
   */
  async logAuthSuccess(sessionId, clientId, clientType, clientAddress) {
    await this.log({
      eventType: EventType.AUTH_SUCCESS,
      sessionId,
      clientId,
      clientType,
      clientAddress,
      status: 'success'
    });

    Logger.info(`[Audit] AUTH_SUCCESS: ${clientType}:${clientId || 'anonymous'} from ${clientAddress}`);
  }

  /**
   * 记录认证失败
   * @param {string} reason 失败原因
   * @param {string} clientAddress 客户端地址
   * @param {Object} details 额外详情
   */
  async logAuthFailure(reason, clientAddress, details = {}) {
    await this.log({
      eventType: EventType.AUTH_FAILURE,
      clientAddress,
      status: 'failure',
      details: { reason, ...details }
    });

    Logger.warn(`[Audit] AUTH_FAILURE: ${reason} from ${clientAddress}`);
  }

  /**
   * 记录敏感操作
   * @param {string} sessionId 会话ID
   * @param {string} action 操作类型
   * @param {number} targetTabId 目标标签页ID
   * @param {string} targetUrl 目标URL
   * @param {string} status 操作状态 (success | error)
   * @param {number} duration 执行时长（毫秒）
   * @param {string} requestId 请求ID
   * @param {Object} sessionInfo 会话信息
   */
  async logSensitiveOp(sessionId, action, targetTabId, targetUrl, status, duration, requestId, sessionInfo = {}) {
    // 检查是否需要记录此操作
    if (this.config.logActions.length > 0 && 
        !this.config.logActions.includes('*') && 
        !this.config.logActions.includes(action)) {
      return;
    }

    await this.log({
      eventType: EventType.SENSITIVE_OP,
      sessionId,
      clientId: sessionInfo.clientId,
      clientType: sessionInfo.clientType,
      action,
      targetTabId,
      targetUrl,
      status,
      duration,
      requestId
    });

    Logger.info(`[Audit] SENSITIVE_OP: ${action} on tab ${targetTabId} - ${status} (${duration}ms)`);
  }

  /**
   * 记录速率限制触发
   * @param {string} clientId 客户端标识
   * @param {string} limitType 限制类型 (global | sensitive | auth_failure)
   * @param {string} clientAddress 客户端地址
   */
  async logRateLimited(clientId, limitType, clientAddress) {
    await this.log({
      eventType: EventType.RATE_LIMITED,
      clientId,
      clientAddress,
      details: { limitType }
    });

    Logger.warn(`[Audit] RATE_LIMITED: ${limitType} for ${clientId || clientAddress}`);
  }

  /**
   * 记录会话结束
   * @param {string} sessionId 会话ID
   * @param {number} duration 会话持续时间（秒）
   * @param {string} reason 结束原因 (expired | destroyed | disconnected)
   */
  async logSessionEnd(sessionId, duration, reason = 'unknown') {
    await this.log({
      eventType: EventType.SESSION_END,
      sessionId,
      duration,
      details: { reason }
    });

    Logger.info(`[Audit] SESSION_END: ${sessionId.substring(0, 8)}... after ${duration}s (${reason})`);
  }

  /**
   * 记录连接事件
   * @param {string} eventName 事件名称 (connected | disconnected | rejected)
   * @param {string} clientAddress 客户端地址
   * @param {Object} details 额外详情
   */
  async logConnection(eventName, clientAddress, details = {}) {
    await this.log({
      eventType: EventType.CONNECTION,
      clientAddress,
      action: eventName,
      details
    });
  }

  /**
   * 查询审计日志
   * @param {Object} filters 查询条件
   * @param {string} filters.eventType 事件类型
   * @param {string} filters.sessionId 会话ID
   * @param {string} filters.action 操作类型
   * @param {Date} filters.startTime 开始时间
   * @param {Date} filters.endTime 结束时间
   * @param {number} filters.limit 返回数量限制
   * @param {number} filters.offset 偏移量
   * @returns {Promise<Array>} 日志列表
   */
  async query(filters = {}) {
    if (!this.database) {
      return [];
    }

    try {
      let query = 'SELECT * FROM audit_logs WHERE 1=1';
      const params = [];

      if (filters.eventType) {
        query += ' AND event_type = ?';
        params.push(filters.eventType);
      }

      if (filters.sessionId) {
        query += ' AND session_id = ?';
        params.push(filters.sessionId);
      }

      if (filters.action) {
        query += ' AND action = ?';
        params.push(filters.action);
      }

      if (filters.startTime) {
        query += ' AND timestamp >= ?';
        params.push(filters.startTime.toISOString());
      }

      if (filters.endTime) {
        query += ' AND timestamp <= ?';
        params.push(filters.endTime.toISOString());
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(filters.limit);
      }

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }

      return await this.database.all(query, params);
    } catch (err) {
      Logger.error(`Failed to query audit logs: ${err.message}`);
      return [];
    }
  }

  /**
   * 启动日志保留清理定时器
   */
  startRetentionTimer() {
    // 每天清理一次过期日志
    this.retentionInterval = setInterval(() => {
      this.cleanupOldLogs();
    }, 24 * 60 * 60 * 1000);

    // 启动时也执行一次
    setTimeout(() => this.cleanupOldLogs(), 60000);
  }

  /**
   * 清理过期日志
   */
  async cleanupOldLogs() {
    if (!this.database || this.config.retentionDays <= 0) {
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const result = await this.database.run(
        'DELETE FROM audit_logs WHERE timestamp < ?',
        [cutoffDate.toISOString()]
      );

      if (result.changes > 0) {
        Logger.info(`[Audit] Cleaned up ${result.changes} old audit logs`);
      }
    } catch (err) {
      Logger.error(`Failed to cleanup old audit logs: ${err.message}`);
    }
  }

  /**
   * 获取统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    if (!this.database) {
      return { enabled: this.config.enabled, storage: this.config.storage };
    }

    try {
      const totalCount = await this.database.get(
        'SELECT COUNT(*) as count FROM audit_logs'
      );

      const todayCount = await this.database.get(
        'SELECT COUNT(*) as count FROM audit_logs WHERE timestamp >= date("now")'
      );

      const eventTypeCounts = await this.database.all(
        'SELECT event_type, COUNT(*) as count FROM audit_logs GROUP BY event_type'
      );

      return {
        enabled: this.config.enabled,
        storage: this.config.storage,
        totalLogs: totalCount?.count || 0,
        todayLogs: todayCount?.count || 0,
        byEventType: eventTypeCounts.reduce((acc, row) => {
          acc[row.event_type] = row.count;
          return acc;
        }, {})
      };
    } catch (err) {
      Logger.error(`Failed to get audit stats: ${err.message}`);
      return { enabled: this.config.enabled, storage: this.config.storage, error: err.message };
    }
  }

  /**
   * 停止审计日志
   */
  stop() {
    if (this.retentionInterval) {
      clearInterval(this.retentionInterval);
      this.retentionInterval = null;
    }

    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }

    Logger.info('AuditLogger stopped');
  }
}

// 导出事件类型枚举
AuditLogger.EventType = EventType;

module.exports = AuditLogger;
