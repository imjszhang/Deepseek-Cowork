/**
 * 认证管理器模块
 * 
 * 负责 WebSocket 连接的身份认证：
 * - Challenge-Response 认证机制
 * - HMAC-SHA256 签名验证
 * - 会话管理（创建、验证、销毁）
 * - 密钥管理（环境变量 > 配置文件 > 自动生成）
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

/**
 * 认证管理器类
 */
class AuthManager {
  /**
   * 构造函数
   * @param {Object} config 认证配置
   * @param {boolean} config.enabled 是否启用认证
   * @param {string} config.secretKey 密钥（可选）
   * @param {string} config.secretKeyFile 密钥文件路径
   * @param {number} config.sessionTTL 会话有效期（秒）
   * @param {number} config.lockoutDuration 锁定时间（秒）
   * @param {number} config.maxFailedAttempts 最大失败次数
   * @param {number} config.challengeTimeout Challenge 超时时间（秒）
   */
  constructor(config = {}) {
    this.config = {
      enabled: true,
      secretKey: null,
      secretKeyFile: 'data/auth_secret.key',
      sessionTTL: 3600,           // 1小时
      lockoutDuration: 60,        // 60秒
      maxFailedAttempts: 5,
      challengeTimeout: 30,       // 30秒
      ...config
    };

    // 存储待验证的 challenge
    this.pendingChallenges = new Map();

    // 存储活跃会话
    this.sessions = new Map();

    // 密钥
    this.secretKey = null;

    // 初始化密钥
    this.initSecretKey();

    // 启动定期清理
    this.startCleanupTimer();

    Logger.info('AuthManager initialized');
  }

  /**
   * 初始化密钥
   * 优先级：环境变量 > 配置文件 > 密钥文件 > 自动生成
   */
  initSecretKey() {
    // 1. 优先从环境变量读取
    if (process.env.BROWSER_CONTROL_SECRET) {
      this.secretKey = process.env.BROWSER_CONTROL_SECRET;
      Logger.info('Secret key loaded from environment variable');
      return;
    }

    // 2. 从配置中读取
    if (this.config.secretKey) {
      this.secretKey = this.config.secretKey;
      Logger.info('Secret key loaded from config');
      return;
    }

    // 3. 从密钥文件读取
    const keyFilePath = path.isAbsolute(this.config.secretKeyFile)
      ? this.config.secretKeyFile
      : path.join(global.rootDir || process.cwd(), this.config.secretKeyFile);

    if (fs.existsSync(keyFilePath)) {
      try {
        this.secretKey = fs.readFileSync(keyFilePath, 'utf8').trim();
        Logger.info(`Secret key loaded from file: ${keyFilePath}`);
        return;
      } catch (err) {
        Logger.warn(`Failed to read secret key file: ${err.message}`);
      }
    }

    // 4. 自动生成并保存
    this.secretKey = this.generateRandomKey();
    this.saveSecretKeyToFile(keyFilePath);
    Logger.info('New secret key generated and saved');
  }

  /**
   * 生成随机密钥
   * @returns {string} 64位十六进制密钥
   */
  generateRandomKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * 保存密钥到文件
   * @param {string} filePath 文件路径
   */
  saveSecretKeyToFile(filePath) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, this.secretKey, { mode: 0o600 });
      Logger.info(`Secret key saved to: ${filePath}`);
    } catch (err) {
      Logger.error(`Failed to save secret key: ${err.message}`);
    }
  }

  /**
   * 生成认证挑战
   * @returns {Object} { challenge: string, expiresAt: Date }
   */
  generateChallenge() {
    const challenge = crypto.randomBytes(16).toString('hex'); // 32位十六进制
    const expiresAt = new Date(Date.now() + this.config.challengeTimeout * 1000);

    this.pendingChallenges.set(challenge, {
      challenge,
      expiresAt,
      createdAt: new Date()
    });

    Logger.debug(`Challenge generated: ${challenge.substring(0, 8)}...`);

    return { challenge, expiresAt };
  }

  /**
   * 验证客户端响应
   * @param {string} challenge 之前发送的挑战
   * @param {string} response 客户端的 HMAC 响应
   * @param {string} clientAddress 客户端地址（用于日志）
   * @returns {Object} { valid: boolean, reason?: string }
   */
  verifyResponse(challenge, response, clientAddress = 'unknown') {
    // 检查 challenge 是否存在
    const pendingChallenge = this.pendingChallenges.get(challenge);
    if (!pendingChallenge) {
      Logger.warn(`[Auth] Invalid challenge from ${clientAddress}: challenge not found`);
      return { valid: false, reason: 'Challenge not found or expired' };
    }

    // 检查 challenge 是否过期
    if (new Date() > pendingChallenge.expiresAt) {
      this.pendingChallenges.delete(challenge);
      Logger.warn(`[Auth] Expired challenge from ${clientAddress}`);
      return { valid: false, reason: 'Challenge expired' };
    }

    // 计算期望的 HMAC 响应
    const expectedResponse = this.computeHMAC(challenge);

    // 使用时间安全的比较
    const responseBuffer = Buffer.from(response, 'hex');
    const expectedBuffer = Buffer.from(expectedResponse, 'hex');

    if (responseBuffer.length !== expectedBuffer.length) {
      Logger.warn(`[Auth] Invalid response length from ${clientAddress}`);
      this.pendingChallenges.delete(challenge);
      return { valid: false, reason: 'Invalid response format' };
    }

    const isValid = crypto.timingSafeEqual(responseBuffer, expectedBuffer);

    // 无论成功与否，都删除已使用的 challenge（一次性）
    this.pendingChallenges.delete(challenge);

    if (isValid) {
      Logger.info(`[Auth] Authentication successful from ${clientAddress}`);
      return { valid: true };
    } else {
      Logger.warn(`[Auth] Authentication failed from ${clientAddress}: invalid response`);
      return { valid: false, reason: 'Invalid credentials' };
    }
  }

  /**
   * 计算 HMAC-SHA256
   * @param {string} message 消息
   * @returns {string} 64位十六进制 HMAC
   */
  computeHMAC(message) {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('hex');
  }

  /**
   * 创建会话
   * @param {string} clientId 客户端标识
   * @param {string} clientType 客户端类型 (extension | automation | web)
   * @returns {Object} { sessionId: string, expiresAt: Date, permissions: string[] }
   */
  createSession(clientId, clientType = 'unknown') {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + this.config.sessionTTL * 1000);

    // 定义权限（目前所有认证用户权限相同）
    const permissions = [
      'get_tabs',
      'get_html',
      'open_url',
      'close_tab',
      'execute_script',
      'get_cookies',
      'inject_css',
      'subscribe_events'
    ];

    const session = {
      sessionId,
      clientId,
      clientType,
      permissions,
      createdAt: new Date(),
      expiresAt,
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);

    Logger.info(`[Auth] Session created: ${sessionId.substring(0, 8)}... for ${clientType}:${clientId || 'anonymous'}`);

    return {
      sessionId,
      expiresAt,
      permissions
    };
  }

  /**
   * 验证会话
   * @param {string} sessionId 会话ID
   * @returns {Object|null} 会话信息或 null
   */
  validateSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // 检查是否过期
    if (new Date() > session.expiresAt) {
      this.sessions.delete(sessionId);
      Logger.debug(`[Auth] Session expired: ${sessionId.substring(0, 8)}...`);
      return null;
    }

    // 更新最后活动时间
    session.lastActivity = new Date();

    return session;
  }

  /**
   * 销毁会话
   * @param {string} sessionId 会话ID
   * @returns {boolean} 是否成功销毁
   */
  destroySession(sessionId) {
    if (!sessionId) {
      return false;
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      Logger.info(`[Auth] Session destroyed: ${sessionId.substring(0, 8)}...`);
      return true;
    }

    return false;
  }

  /**
   * 获取会话信息（用于审计）
   * @param {string} sessionId 会话ID
   * @returns {Object|null} 会话信息
   */
  getSessionInfo(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取活跃会话数量
   * @returns {number} 活跃会话数
   */
  getActiveSessionCount() {
    return this.sessions.size;
  }

  /**
   * 启动定期清理定时器
   */
  startCleanupTimer() {
    // 每分钟清理一次过期的 challenge 和 session
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * 清理过期的 challenge 和 session
   */
  cleanup() {
    const now = new Date();
    let cleanedChallenges = 0;
    let cleanedSessions = 0;

    // 清理过期的 challenge
    for (const [key, value] of this.pendingChallenges) {
      if (now > value.expiresAt) {
        this.pendingChallenges.delete(key);
        cleanedChallenges++;
      }
    }

    // 清理过期的 session
    for (const [key, value] of this.sessions) {
      if (now > value.expiresAt) {
        this.sessions.delete(key);
        cleanedSessions++;
      }
    }

    if (cleanedChallenges > 0 || cleanedSessions > 0) {
      Logger.debug(`[Auth] Cleanup: ${cleanedChallenges} challenges, ${cleanedSessions} sessions`);
    }
  }

  /**
   * 停止清理定时器
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    Logger.info('AuthManager stopped');
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      pendingChallenges: this.pendingChallenges.size,
      activeSessions: this.sessions.size,
      config: {
        sessionTTL: this.config.sessionTTL,
        challengeTimeout: this.config.challengeTimeout
      }
    };
  }

  /**
   * 获取密钥信息（用于前端显示）
   * @returns {Object} 密钥信息
   */
  getSecretInfo() {
    // 确定密钥来源
    let source = 'generated';
    if (process.env.BROWSER_CONTROL_SECRET) {
      source = 'env';
    } else if (this.config.secretKey) {
      source = 'config';
    } else {
      const keyFilePath = path.isAbsolute(this.config.secretKeyFile)
        ? this.config.secretKeyFile
        : path.join(global.rootDir || process.cwd(), this.config.secretKeyFile);
      if (fs.existsSync(keyFilePath)) {
        source = 'file';
      }
    }

    return {
      secretKey: this.secretKey,
      source,
      keyFile: this.config.secretKeyFile
    };
  }
}

module.exports = AuthManager;
