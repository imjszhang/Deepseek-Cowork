/**
 * Happy Client - 核心客户端类
 * 
 * 封装所有功能，提供统一接口，包括：
 * - 认证与加密
 * - 会话管理
 * - 消息收发
 * - 账户管理
 * - 机器管理
 * - 使用量统计
 * - Artifacts 管理
 * - KV 存储
 * - 社交功能
 * - Feed 动态
 * - 服务连接
 */
const EventEmitter = require('events');
const Encryption = require('./core/Encryption');
const Auth = require('./core/Auth');
const SessionManager = require('./core/SessionManager');
const HttpApi = require('./api/HttpApi');
const WebSocketClient = require('./api/WebSocketClient');
const ConversationManager = require('./conversation/ConversationManager');
const CryptoUtils = require('./utils/CryptoUtils');
const { loadEnvFile } = require('./utils/EnvLoader');
const { 
  VALID_MODES, 
  MODE_DISPLAY_NAMES, 
  isValidMode, 
  normalizeMode, 
  getModeDisplayName,
  normalizeAndConvertMode,
  detectBackendType,
  getSupportedModes,
  BACKEND_TYPES
} = require('./utils/ModeUtils');
const DaemonClient = require('./daemon/DaemonClient');

class HappyClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 加载环境变量
    loadEnvFile();
    
    // 确定服务器 URL（优先级：options > 环境变量 > settings.json > 默认值）
    const DEFAULT_SERVER_URL = 'https://api.deepseek-cowork.com';
    
    // 辅助函数：验证 URL 是否有效
    const isValidUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };
    
    let serverUrl = null;
    
    // 1. 优先使用 options.serverUrl（如果有效）
    if (isValidUrl(options.serverUrl)) {
      serverUrl = options.serverUrl;
    }
    // 2. 其次使用环境变量（如果有效）
    else if (isValidUrl(process.env.HAPPY_SERVER_URL)) {
      serverUrl = process.env.HAPPY_SERVER_URL;
    }
    // 3. 尝试从 ~/.happy/settings.json 读取
    else {
      try {
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const settingsPath = path.join(os.homedir(), '.happy', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (isValidUrl(settings.serverUrl)) {
            serverUrl = settings.serverUrl;
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }
    
    // 4. 使用默认值
    if (!serverUrl) {
      serverUrl = DEFAULT_SERVER_URL;
    }
    
    // 检测后端类型
    this.backendType = detectBackendType(serverUrl);
    
    // 处理权限模式（自动根据后端类型转换）
    const requestedMode = options.permissionMode || process.env.HAPPY_MODE || 'default';
    const initialMode = normalizeAndConvertMode(requestedMode, serverUrl);
    
    if (!isValidMode(initialMode)) {
      throw new Error(`Invalid permission mode: ${initialMode}, valid modes: ${VALID_MODES.join(', ')}`);
    }
    
    this.options = {
      // 先展开 options，然后用明确计算的值覆盖
      ...options,
      secret: options.secret || process.env.HAPPY_SECRET,
      token: options.token || process.env.HAPPY_TOKEN,
      apiKey: options.apiKey || process.env.HAPPY_API_KEY || null,
      serverUrl: serverUrl,  // 使用上面计算的正确值，覆盖 options 中可能的 undefined
      workDir: options.workDir || process.cwd(),
      autoReconnect: options.autoReconnect !== false,
      reconnectInterval: options.reconnectInterval || 60000,
      permissionMode: initialMode,
      // 直接指定 sessionId（优先级最高）
      sessionId: options.sessionId || null,
      // Daemon 相关配置
      useDaemon: options.useDaemon !== false, // 默认启用 daemon 模式
      daemonTimeout: options.daemonTimeout || 30000, // daemon 操作超时时间
      autoSpawnSession: options.autoSpawnSession !== false // 自动创建 session
    };
    
    // 初始化组件
    this.encryption = null;
    this.auth = new Auth(this.options);
    this.sessionManager = new SessionManager(this.options);
    this.httpApi = new HttpApi(this.options);
    this.wsClient = null;
    this.conversationManager = null;
    
    // Daemon 客户端（延迟初始化）
    this.daemonClient = null;
    if (this.options.useDaemon) {
      this.daemonClient = new DaemonClient({
        httpTimeout: this.options.daemonTimeout
      });
    }
    
    // 状态
    this.isConnected = false;
    this.currentSessionId = null;
    this.currentPermissionMode = initialMode;
    
    // 缓存
    this._cachedToken = null;
    this._cachedProfile = null;
    this._cachedSettings = null;
    this._cachedSettingsVersion = null;
    
    // 多 Session 消息同步 - 动态加密器初始化
    this._pendingEncryptionInits = new Map();  // sessionId -> Promise，正在初始化的 session
    this._pendingMessages = new Map();         // sessionId -> Array<message>，等待处理的消息队列
    this._maxPendingMessages = 100;            // 每个 session 最大暂存消息数
  }
  
  // ============================================================================
  // 初始化与连接
  // ============================================================================
  
  /**
   * 初始化连接
   */
  async initialize() {
    try {
      // 1. 初始化加密
      await this._initializeEncryption();
      
      // 2. 获取或恢复 Token
      const token = await this._getToken();
      
      // 3. 查找或创建 Session
      this.currentSessionId = await this._findSession(token);
      
      // 4. 连接 WebSocket
      await this._connectWebSocket(token);
      
      // 5. 创建对话管理器
      this.conversationManager = new ConversationManager(
        this.wsClient.socket,
        this.encryption,
        this.currentSessionId,
        {
          permissionMode: this.currentPermissionMode,
          ...this.options.conversation,
          // 超时时调用软中止，让 AI 停止当前操作
          onTimeout: async (conversationId, conversation) => {
            console.log(`[HappyClient] Conversation ${conversationId} timeout, executing soft abort...`);
            try {
              await this.abortSession(null, 'Conversation timeout, auto abort');
              console.log(`[HappyClient] Soft abort complete`);
            } catch (e) {
              console.warn(`[HappyClient] Soft abort failed: ${e.message}`);
            }
          }
        }
      );
      
      // 6. 设置事件转发
      this._setupEventForwarding();
      
      this.isConnected = true;
      this.emit('connected', { sessionId: this.currentSessionId });
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * 初始化加密
   */
  async _initializeEncryption() {
    const secret = this.options.secret;
    if (!secret) {
      throw new Error('HAPPY_SECRET not configured');
    }
    
    const secretBytes = this.auth.normalizeSecretKey(secret);
    const masterSecret = Buffer.from(secretBytes, 'base64url');
    
    this.encryption = await Encryption.create(masterSecret);
  }
  
  /**
   * 获取 Token
   */
  async _getToken() {
    if (this._cachedToken) {
      return this._cachedToken;
    }
    
    if (this.options.token) {
      this._cachedToken = this.options.token;
      return this._cachedToken;
    }
    
    const secret = this.options.secret;
    if (!secret) {
      throw new Error('HAPPY_SECRET not configured');
    }
    
    const secretBytes = this.auth.normalizeSecretKey(secret);
    const masterSecret = Buffer.from(secretBytes, 'base64url');
    
    this._cachedToken = await this.auth.getToken(masterSecret, this.options.serverUrl);
    return this._cachedToken;
  }
  
  /**
   * 查找 Session
   */
  async _findSession(token) {
    // 获取当前账户的所有 sessions
    const sessionsData = await this.httpApi.fetchSessions(token);
    const sessions = sessionsData.sessions || [];
    
    // 1. 如果指定了 sessionId，验证是否存在
    if (this.options.sessionId) {
      const targetSession = sessions.find(s => s.id === this.options.sessionId);
      
      if (targetSession) {
        // 初始化目标 session 的加密
        await this.sessionManager.initializeSessionEncryption(targetSession, this.encryption);
        // 初始化所有其他 session 的加密器（用于多 session 消息同步）
        await this._initializeAllSessionEncryptions(sessions);
        return this.options.sessionId;
      }
      
      // 指定的 sessionId 不存在，清除它
      console.warn(`[HappyClient] Specified sessionId not found: ${this.options.sessionId}`);
      this.options.sessionId = null;
    }
    
    // 2. 尝试通过 workDir 精确匹配（内部会初始化匹配到的 session 的加密）
    if (sessions.length > 0) {
      const matchedSessionId = await this.sessionManager.findSessionByWorkDirExact(
        sessions,
        this.options.workDir,
        this.encryption
      );
      
      if (matchedSessionId) {
        // 初始化所有其他 session 的加密器（用于多 session 消息同步）
        await this._initializeAllSessionEncryptions(sessions);
        return matchedSessionId;
      }
    }
    
    // 3. 匹配失败，创建新 session
    if (this.daemonClient) {
      console.log('[HappyClient] No matching session found, creating new session via daemon...');
      const sessionId = await this._spawnSessionViaDaemon();
      if (sessionId) {
        // 关键修复：重新获取 session 信息并初始化加密
        // daemon 创建的 session 需要从服务器获取完整信息（含 dataEncryptionKey）
        const refreshedData = await this.httpApi.fetchSessions(token);
        const refreshedSessions = refreshedData.sessions || [];
        const newSession = refreshedSessions.find(s => s.id === sessionId);
        
        if (newSession) {
          await this.sessionManager.initializeSessionEncryption(newSession, this.encryption);
          console.log(`[HappyClient] Session encryption initialized for: ${sessionId}`);
        } else {
          // 服务器尚未同步，使用 fallback 初始化（无 dataEncryptionKey）
          console.warn(`[HappyClient] New session not found in server response, using fallback encryption`);
          await this.encryption.initializeSession(sessionId, null);
        }
        
        // 初始化所有其他 session 的加密器（用于多 session 消息同步）
        await this._initializeAllSessionEncryptions(refreshedSessions);
        
        return sessionId;
      }
    }
    
    return null;
  }
  
  /**
   * 初始化所有 Session 的加密器
   * 用于多 session 消息同步，确保能解密其他 session 的消息
   * @param {Array} sessions - Session 列表
   * @private
   */
  async _initializeAllSessionEncryptions(sessions) {
    if (!sessions || sessions.length === 0) return;
    
    let initializedCount = 0;
    for (const session of sessions) {
      // 跳过已初始化的 session
      if (this.encryption.getSessionEncryption(session.id)) continue;
      
      try {
        await this.sessionManager.initializeSessionEncryption(session, this.encryption);
        initializedCount++;
      } catch (error) {
        console.warn(`[HappyClient] Failed to initialize encryption for session ${session.id.substring(0, 8)}...: ${error.message}`);
      }
    }
    
    if (initializedCount > 0) {
      console.log(`[HappyClient] Initialized encryption for ${initializedCount} additional sessions (total: ${sessions.length})`);
    }
  }
  
  /**
   * 根据 sessionId 动态初始化单个 session 的加密器
   * 用于连接后新创建的 session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} 是否初始化成功
   * @private
   */
  async _initializeSessionEncryptionById(sessionId) {
    // 如果已经初始化，直接返回成功
    if (this.encryption.getSessionEncryption(sessionId)) {
      return true;
    }
    
    // 如果正在初始化中，等待现有的 Promise
    if (this._pendingEncryptionInits.has(sessionId)) {
      try {
        await this._pendingEncryptionInits.get(sessionId);
        return this.encryption.getSessionEncryption(sessionId) !== null;
      } catch (error) {
        return false;
      }
    }
    
    // 创建初始化 Promise
    const initPromise = (async () => {
      try {
        console.log(`[HappyClient] Dynamically initializing encryption for session ${sessionId.substring(0, 8)}...`);
        
        // 获取 token
        const token = await this._getToken();
        
        // 从服务器获取 session 信息
        const sessionsData = await this.httpApi.fetchSessions(token);
        const sessions = sessionsData.sessions || [];
        const session = sessions.find(s => s.id === sessionId);
        
        if (!session) {
          console.warn(`[HappyClient] Session ${sessionId.substring(0, 8)}... not found on server`);
          return false;
        }
        
        // 初始化加密器
        await this.sessionManager.initializeSessionEncryption(session, this.encryption);
        console.log(`[HappyClient] Successfully initialized encryption for session ${sessionId.substring(0, 8)}...`);
        
        return true;
      } catch (error) {
        console.error(`[HappyClient] Failed to initialize encryption for session ${sessionId.substring(0, 8)}...: ${error.message}`);
        return false;
      } finally {
        // 清理初始化状态
        this._pendingEncryptionInits.delete(sessionId);
        
        // 处理暂存的消息
        this._processPendingMessages(sessionId);
      }
    })();
    
    // 保存初始化 Promise
    this._pendingEncryptionInits.set(sessionId, initPromise);
    
    return initPromise;
  }
  
  /**
   * 处理其他 Session 的更新消息
   * 当前 session 的消息由 ConversationManager 处理，这里只处理其他 session 的消息
   * @param {Object} data - WebSocket update 事件数据
   * @private
   */
  _handleOtherSessionUpdate(data) {
    try {
      const body = data.body;
      
      // 只处理 new-message 类型的事件
      if (!body || body.t !== 'new-message') {
        return;
      }
      
      const sessionId = body.sid || body.id;
      
      // 跳过当前 session（由 ConversationManager 处理）
      if (sessionId === this.currentSessionId) {
        return;
      }
      
      const message = body.message;
      if (!message || message.content?.t !== 'encrypted') {
        return;
      }
      
      // 获取加密器
      const enc = this.encryption.getSessionEncryption(sessionId);
      if (!enc) {
        // 加密器不存在，可能是新创建的 session
        // 将消息暂存并触发懒加载初始化
        this._queuePendingMessage(sessionId, data);
        
        // 如果还没有开始初始化，触发懒加载
        if (!this._pendingEncryptionInits.has(sessionId)) {
          console.log(`[HappyClient] No encryption for session ${sessionId.substring(0, 8)}..., triggering lazy initialization`);
          this._initializeSessionEncryptionById(sessionId);
        }
        return;
      }
      
      // 处理消息
      this._processOtherSessionMessage(sessionId, message);
      
    } catch (error) {
      console.error('[HappyClient] Error handling other session update:', error.message);
    }
  }
  
  /**
   * 将消息加入暂存队列
   * @param {string} sessionId - Session ID
   * @param {Object} data - 原始消息数据
   * @private
   */
  _queuePendingMessage(sessionId, data) {
    if (!this._pendingMessages.has(sessionId)) {
      this._pendingMessages.set(sessionId, []);
    }
    
    const queue = this._pendingMessages.get(sessionId);
    
    // 限制队列大小，防止内存泄漏
    if (queue.length >= this._maxPendingMessages) {
      console.warn(`[HappyClient] Pending message queue full for session ${sessionId.substring(0, 8)}..., dropping oldest message`);
      queue.shift();
    }
    
    queue.push(data);
    console.log(`[HappyClient] Queued message for session ${sessionId.substring(0, 8)}..., queue size: ${queue.length}`);
  }
  
  /**
   * 处理单条其他 session 的消息
   * @param {string} sessionId - Session ID
   * @param {Object} message - 消息对象
   * @private
   */
  _processOtherSessionMessage(sessionId, message) {
    try {
      const enc = this.encryption.getSessionEncryption(sessionId);
      if (!enc) {
        console.warn(`[HappyClient] Still no encryption for session ${sessionId.substring(0, 8)}...`);
        return;
      }
      
      // 解密消息
      const encryptedData = CryptoUtils.decodeBase64(message.content.c, 'base64');
      const decrypted = this.encryption.decrypt(enc, encryptedData);
      
      if (!decrypted) {
        console.warn(`[HappyClient] Failed to decrypt message from session ${sessionId.substring(0, 8)}...`);
        return;
      }
      
      // 跳过 event 类型消息（如 ready、processing 等状态事件）
      if (decrypted.content?.type === 'event') {
        return;
      }
      
      // 发出 otherSessionMessage 事件，供上层（HappyService）处理
      this.emit('otherSessionMessage', {
        sessionId,
        role: decrypted.role,
        content: decrypted.content,
        meta: decrypted.meta,
        messageId: message.id,
        createdAt: message.createdAt || Date.now()
      });
      
      console.log(`[HappyClient] Received message from other session ${sessionId.substring(0, 8)}..., role=${decrypted.role}`);
      
    } catch (error) {
      console.error(`[HappyClient] Error processing message from session ${sessionId.substring(0, 8)}...:`, error.message);
    }
  }
  
  /**
   * 处理暂存的消息队列
   * 在加密器初始化完成后调用
   * @param {string} sessionId - Session ID
   * @private
   */
  _processPendingMessages(sessionId) {
    const queue = this._pendingMessages.get(sessionId);
    if (!queue || queue.length === 0) {
      return;
    }
    
    // 检查加密器是否已初始化成功
    const enc = this.encryption.getSessionEncryption(sessionId);
    if (!enc) {
      console.warn(`[HappyClient] Encryption init failed for session ${sessionId.substring(0, 8)}..., discarding ${queue.length} pending messages`);
      this._pendingMessages.delete(sessionId);
      return;
    }
    
    console.log(`[HappyClient] Processing ${queue.length} pending messages for session ${sessionId.substring(0, 8)}...`);
    
    // 处理所有暂存的消息
    let processedCount = 0;
    for (const data of queue) {
      try {
        const message = data.body?.message;
        if (message) {
          this._processOtherSessionMessage(sessionId, message);
          processedCount++;
        }
      } catch (error) {
        console.error(`[HappyClient] Error processing pending message:`, error.message);
      }
    }
    
    console.log(`[HappyClient] Processed ${processedCount}/${queue.length} pending messages for session ${sessionId.substring(0, 8)}...`);
    
    // 清空队列
    this._pendingMessages.delete(sessionId);
  }
  
  /**
   * 通过 Daemon 创建 Session
   * @returns {Promise<string|null>} Session ID 或 null
   */
  async _spawnSessionViaDaemon() {
    if (!this.daemonClient) {
      console.warn('[HappyClient] Daemon client not initialized');
      return null;
    }
    
    try {
      // 确保 daemon 运行
      await this.daemonClient.ensureDaemonRunning();
      
      // 创建 session
      const workDir = this.options.workDir;
      console.log(`[HappyClient] Creating session via daemon, workDir: ${workDir}`);
      
      const result = await this.daemonClient.spawnSession(workDir);
      
      if (result && result.sessionId) {
        console.log(`[HappyClient] Session created: ${result.sessionId}`);
        this.emit('daemon:sessionSpawned', { sessionId: result.sessionId, workDir });
        
        // 等待一小段时间让 session 完全初始化
        await this._sleep(2000);
        
        return result.sessionId;
      }
      
      return null;
    } catch (error) {
      console.error(`[HappyClient] Failed to create session via daemon: ${error.message}`);
      this.emit('daemon:error', { error: error.message, operation: 'spawnSession' });
      return null;
    }
  }
  
  /**
   * 休眠函数
   * @param {number} ms - 毫秒数
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 连接 WebSocket
   */
  async _connectWebSocket(token) {
    this.wsClient = new WebSocketClient({
      serverUrl: this.options.serverUrl,
      token,
      apiKey: this.options.apiKey,
      autoReconnect: this.options.autoReconnect,
      reconnectInterval: this.options.reconnectInterval
    });
    
    await this.wsClient.connect();
  }
  
  /**
   * 设置事件转发
   */
  _setupEventForwarding() {
    // 转发 WebSocket 事件
    this.wsClient.on('connect', () => {
      this.isConnected = true;  // 重连时恢复状态
      this.emit('ws:connect');
    });
    
    this.wsClient.on('disconnect', (reason) => {
      this.isConnected = false;  // 断开时更新状态
      this.emit('ws:disconnect', reason);
    });
    
    // 监听 update 事件，处理其他 session 的消息
    // 当前 session 的消息由 ConversationManager 处理，这里只处理其他 session
    this.wsClient.on('update', (data) => {
      this._handleOtherSessionUpdate(data);
    });
    
    // 转发对话事件
    if (this.conversationManager) {
      this.conversationManager.on('message', (event) => {
        this.emit('conversation:message', event);
      });
      
      // 转发消息流结束事件
      this.conversationManager.on('streamEnded', (event) => {
        this.emit('conversation:streamEnded', event);
      });
      
      // 转发事件状态变更（ready, processing, switch 等）
      this.conversationManager.on('eventStatus', (event) => {
        this.emit('conversation:eventStatus', event);
      });
      
      // 转发同步消息事件（包括来自其他客户端的消息）
      // 这个事件用于让上层代码同步显示所有来自同一 session 的消息
      this.conversationManager.on('syncMessage', (event) => {
        this.emit('conversation:syncMessage', event);
      });
    }
  }
  
  // ============================================================================
  // 消息收发
  // ============================================================================
  
  /**
   * 发送消息并等待响应（自动交互）
   */
  async sendAndWait(message, options = {}) {
    if (!this.isConnected || !this.conversationManager) {
      throw new Error('Client not connected, please call initialize() first');
    }
    
    return await this.conversationManager.sendAndWait(message, options);
  }
  
  /**
   * 发送消息（不等待响应）
   * @param {string} message - 消息文本
   * @param {object|string} options - 选项对象或权限模式字符串（向后兼容）
   * @param {string} options.permissionMode - 权限模式 (可选，默认使用当前模式)
   * @param {string} options.appendSystemPrompt - 追加到系统提示词的内容
   */
  async sendMessage(message, options = {}) {
    if (!this.isConnected || !this.wsClient) {
      throw new Error('Client not connected, please call initialize() first');
    }
    
    const enc = this.encryption.getSessionEncryption(this.currentSessionId);
    if (!enc) {
      throw new Error('Session encryption not initialized');
    }
    
    // 向后兼容：如果 options 是字符串，视为 permissionMode
    const opts = typeof options === 'string' 
      ? { permissionMode: options } 
      : options;
    
    const mode = opts.permissionMode || this.currentPermissionMode;
    const wsOptions = {};
    
    // 传递 appendSystemPrompt
    if (opts.appendSystemPrompt) {
      wsOptions.appendSystemPrompt = opts.appendSystemPrompt;
    }
    
    return await this.wsClient.sendMessage(
      this.currentSessionId, 
      message, 
      enc, 
      this.encryption, 
      mode,
      wsOptions
    );
  }
  
  // ============================================================================
  // 权限模式管理
  // ============================================================================
  
  /**
   * 设置权限模式
   * @param {string} mode - 权限模式（会根据后端类型自动转换）
   */
  setPermissionMode(mode) {
    const convertedMode = normalizeAndConvertMode(mode, this.options.serverUrl);
    if (!isValidMode(convertedMode)) {
      throw new Error(`Invalid permission mode: ${mode}, valid modes: ${VALID_MODES.join(', ')}`);
    }
    this.currentPermissionMode = convertedMode;
    this.emit('permissionModeChanged', { mode: convertedMode, originalMode: mode });
    return convertedMode;
  }
  
  /**
   * 获取当前后端类型
   */
  getBackendType() {
    return this.backendType;
  }
  
  /**
   * 获取当前后端支持的模式列表
   */
  getSupportedModes() {
    return getSupportedModes(this.backendType);
  }
  
  /**
   * 获取当前权限模式
   */
  getPermissionMode() {
    return this.currentPermissionMode;
  }
  
  /**
   * 获取权限模式显示名称
   */
  getPermissionModeDisplayName() {
    return getModeDisplayName(this.currentPermissionMode);
  }
  
  /**
   * 获取所有有效的权限模式
   */
  static getValidModes() {
    return VALID_MODES;
  }
  
  /**
   * 获取模式显示名称映射
   */
  static getModeDisplayNames() {
    return MODE_DISPLAY_NAMES;
  }
  
  // ============================================================================
  // 会话管理
  // ============================================================================
  
  /**
   * 获取会话列表
   * @returns {Promise<{sessions: Array}>} 会话列表
   */
  async getSessions() {
    const token = await this._getToken();
    const data = await this.httpApi.fetchSessions(token);
    
    // 初始化所有会话的加密并解密元数据
    const sessions = data.sessions || [];
    const decryptedSessions = [];
    
    for (const session of sessions) {
      await this.sessionManager.initializeSessionEncryption(session, this.encryption);
      const metadata = this.sessionManager.decryptSessionMetadata(session, this.encryption);
      
      decryptedSessions.push({
        ...session,
        decryptedMetadata: metadata
      });
    }
    
    return { sessions: decryptedSessions };
  }
  
  /**
   * 获取消息列表
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<{messages: Array}>} 消息列表
   */
  async getMessages(sessionId) {
    const token = await this._getToken();
    return await this.httpApi.fetchMessages(token, sessionId);
  }
  
  /**
   * 删除会话
   * @param {string} sessionId - 会话 ID
   */
  async deleteSession(sessionId) {
    const token = await this._getToken();
    return await this.httpApi.deleteSession(token, sessionId);
  }
  
  /**
   * 诊断会话
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<object>} 诊断信息
   */
  async diagnoseSession(sessionId) {
    const token = await this._getToken();
    const sessionsData = await this.httpApi.fetchSessions(token);
    const sessions = sessionsData.sessions || [];
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    return await this.sessionManager.diagnoseSession(session, this.encryption);
  }
  
  // ============================================================================
  // Daemon 管理
  // ============================================================================
  
  /**
   * 获取 Daemon 状态
   * @returns {Object} Daemon 状态信息
   */
  getDaemonStatus() {
    if (!this.daemonClient) {
      return { running: false, enabled: false };
    }
    return {
      enabled: true,
      ...this.daemonClient.getStatus()
    };
  }
  
  /**
   * 检查 Daemon 是否运行
   * @returns {boolean}
   */
  isDaemonRunning() {
    if (!this.daemonClient) return false;
    return this.daemonClient.isDaemonRunning();
  }
  
  /**
   * 确保 Daemon 运行
   * @returns {Promise<boolean>}
   */
  async ensureDaemonRunning() {
    if (!this.daemonClient) {
      throw new Error('Daemon mode not enabled');
    }
    return await this.daemonClient.ensureDaemonRunning();
  }
  
  /**
   * 列出 Daemon 管理的所有 Session
   * @returns {Promise<Array>} Session 列表
   */
  async listDaemonSessions() {
    if (!this.daemonClient) {
      return [];
    }
    return await this.daemonClient.listSessions();
  }
  
  /**
   * 通过 Daemon 停止 Session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>}
   */
  async stopDaemonSession(sessionId) {
    if (!this.daemonClient) {
      throw new Error('Daemon mode not enabled');
    }
    return await this.daemonClient.stopSession(sessionId);
  }
  
  // ============================================================================
  // 账户管理
  // ============================================================================
  
  /**
   * 获取账户资料
   * @returns {Promise<object>} 账户资料
   */
  async getProfile() {
    const token = await this._getToken();
    const profile = await this.httpApi.fetchProfile(token);
    this._cachedProfile = profile;
    return profile;
  }
  
  /**
   * 获取账户设置
   * @returns {Promise<object>} 解密后的设置
   */
  async getSettings() {
    const token = await this._getToken();
    const data = await this.httpApi.fetchSettings(token);
    
    let settings = null;
    if (data.settings && this.encryption) {
      settings = this.encryption.decryptLegacy(data.settings);
    }
    
    this._cachedSettings = settings;
    this._cachedSettingsVersion = data.settingsVersion;
    
    return {
      settings,
      settingsVersion: data.settingsVersion
    };
  }
  
  /**
   * 更新账户设置
   * @param {object} settings - 新的设置对象
   * @returns {Promise<object>} 更新结果
   */
  async updateSettings(settings) {
    const token = await this._getToken();
    
    // 获取当前版本号
    if (this._cachedSettingsVersion === null) {
      await this.getSettings();
    }
    
    // 加密设置
    const encryptedSettings = this.encryption.encryptLegacy(settings);
    
    const result = await this.httpApi.updateSettings(
      token, 
      encryptedSettings, 
      this._cachedSettingsVersion
    );
    
    // 更新缓存
    this._cachedSettings = settings;
    if (result.settingsVersion) {
      this._cachedSettingsVersion = result.settingsVersion;
    }
    
    return result;
  }
  
  // ============================================================================
  // 机器管理
  // ============================================================================
  
  /**
   * 获取机器列表
   * @returns {Promise<Array>} 机器列表（含解密的元数据）
   */
  async getMachines() {
    const token = await this._getToken();
    const machines = await this.httpApi.fetchMachines(token);
    
    if (!Array.isArray(machines)) {
      return [];
    }
    
    const decryptedMachines = [];
    
    for (const machine of machines) {
      // 初始化机器加密
      if (machine.dataEncryptionKey) {
        const decryptedKey = await this.encryption.decryptEncryptionKey(machine.dataEncryptionKey);
        await this.encryption.initializeMachine(machine.id, decryptedKey);
      } else {
        await this.encryption.initializeMachine(machine.id, null);
      }
      
      // 解密元数据
      let metadata = null;
      if (machine.metadata) {
        const enc = this.encryption.getMachineEncryption(machine.id);
        if (enc) {
          try {
            const metadataData = CryptoUtils.decodeBase64(machine.metadata, 'base64');
            metadata = this.encryption.decrypt(enc, metadataData);
          } catch (e) {
            // 忽略解密错误
          }
        }
      }
      
      decryptedMachines.push({
        ...machine,
        decryptedMetadata: metadata
      });
    }
    
    return decryptedMachines;
  }
  
  // ============================================================================
  // 使用量统计
  // ============================================================================
  
  /**
   * 获取使用量统计
   * @param {string} period - 时间段 ('today' | '7days' | '30days')
   * @returns {Promise<object>} 使用量统计
   */
  async getUsage(period = '7days') {
    const token = await this._getToken();
    
    const now = Math.floor(Date.now() / 1000);
    const oneDaySeconds = 24 * 60 * 60;
    
    let startTime;
    let groupBy;
    
    switch (period) {
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startTime = Math.floor(today.getTime() / 1000);
        groupBy = 'hour';
        break;
      case '30days':
        startTime = now - (30 * oneDaySeconds);
        groupBy = 'day';
        break;
      case '7days':
      default:
        startTime = now - (7 * oneDaySeconds);
        groupBy = 'day';
        break;
    }
    
    const data = await this.httpApi.queryUsage(token, {
      startTime,
      endTime: now,
      groupBy
    });
    
    // 计算汇总数据
    let totalTokens = 0;
    let totalCost = 0;
    const tokensByModel = {};
    const costByModel = {};
    
    for (const dataPoint of (data.usage || [])) {
      for (const [model, tokens] of Object.entries(dataPoint.tokens || {})) {
        if (typeof tokens === 'number') {
          totalTokens += tokens;
          tokensByModel[model] = (tokensByModel[model] || 0) + tokens;
        }
      }
      
      for (const [model, cost] of Object.entries(dataPoint.cost || {})) {
        if (typeof cost === 'number') {
          totalCost += cost;
          costByModel[model] = (costByModel[model] || 0) + cost;
        }
      }
    }
    
    return {
      ...data,
      summary: {
        totalTokens,
        totalCost,
        tokensByModel,
        costByModel
      }
    };
  }
  
  // ============================================================================
  // Artifacts 管理
  // ============================================================================
  
  /**
   * 获取 Artifacts 列表
   * @returns {Promise<Array>} Artifacts 列表（含解密的 header）
   */
  async getArtifacts() {
    const token = await this._getToken();
    const artifacts = await this.httpApi.fetchArtifacts(token);
    
    if (!Array.isArray(artifacts)) {
      return [];
    }
    
    const decryptedArtifacts = [];
    
    for (const artifact of artifacts) {
      // 初始化 Artifact 加密
      if (artifact.dataEncryptionKey) {
        const decryptedKey = await this.encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
        await this.encryption.initializeArtifact(artifact.id, decryptedKey);
      } else {
        await this.encryption.initializeArtifact(artifact.id, null);
      }
      
      // 解密 header
      let header = null;
      if (artifact.header) {
        const enc = this.encryption.getArtifactEncryption(artifact.id);
        if (enc) {
          try {
            const headerData = CryptoUtils.decodeBase64(artifact.header, 'base64');
            header = this.encryption.decrypt(enc, headerData);
          } catch (e) {
            // 忽略解密错误
          }
        }
      }
      
      decryptedArtifacts.push({
        ...artifact,
        decryptedHeader: header
      });
    }
    
    return decryptedArtifacts;
  }
  
  /**
   * 获取单个 Artifact
   * @param {string} artifactId - Artifact ID
   * @returns {Promise<object>} Artifact（含解密的 header 和 body）
   */
  async getArtifact(artifactId) {
    const token = await this._getToken();
    const artifact = await this.httpApi.fetchArtifact(token, artifactId);
    
    // 初始化加密
    if (artifact.dataEncryptionKey) {
      const decryptedKey = await this.encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
      await this.encryption.initializeArtifact(artifact.id, decryptedKey);
    } else {
      await this.encryption.initializeArtifact(artifact.id, null);
    }
    
    const enc = this.encryption.getArtifactEncryption(artifact.id);
    
    // 解密 header
    let header = null;
    if (artifact.header && enc) {
      try {
        const headerData = CryptoUtils.decodeBase64(artifact.header, 'base64');
        header = this.encryption.decrypt(enc, headerData);
      } catch (e) {
        // 忽略解密错误
      }
    }
    
    // 解密 body
    let body = null;
    if (artifact.body && enc) {
      try {
        const bodyData = CryptoUtils.decodeBase64(artifact.body, 'base64');
        body = this.encryption.decrypt(enc, bodyData);
      } catch (e) {
        // 忽略解密错误
      }
    }
    
    return {
      ...artifact,
      decryptedHeader: header,
      decryptedBody: body
    };
  }
  
  /**
   * 创建 Artifact
   * @param {object} header - Artifact header（如 { title, draft }）
   * @param {object} body - Artifact body（如 { body: '内容' }）
   * @returns {Promise<object>} 创建结果
   */
  async createArtifact(header, body) {
    const token = await this._getToken();
    
    // 使用旧版加密加密 header 和 body
    const encryptedHeader = this.encryption.encryptLegacy(header);
    const encryptedBody = this.encryption.encryptLegacy(body);
    
    return await this.httpApi.createArtifact(token, {
      header: encryptedHeader,
      body: encryptedBody
    });
  }
  
  /**
   * 更新 Artifact
   * @param {string} artifactId - Artifact ID
   * @param {object} header - 新的 header
   * @param {object} body - 新的 body
   * @returns {Promise<object>} 更新结果
   */
  async updateArtifact(artifactId, header, body) {
    const token = await this._getToken();
    
    // 获取 Artifact 以初始化加密
    await this.getArtifact(artifactId);
    
    const enc = this.encryption.getArtifactEncryption(artifactId);
    
    // 加密 header 和 body
    let encryptedHeader = null;
    let encryptedBody = null;
    
    if (enc) {
      if (header) {
        const headerBytes = this.encryption.encrypt(enc, header);
        encryptedHeader = CryptoUtils.encodeBase64(headerBytes, 'base64');
      }
      if (body) {
        const bodyBytes = this.encryption.encrypt(enc, body);
        encryptedBody = CryptoUtils.encodeBase64(bodyBytes, 'base64');
      }
    }
    
    return await this.httpApi.updateArtifact(token, artifactId, {
      header: encryptedHeader,
      body: encryptedBody
    });
  }
  
  /**
   * 删除 Artifact
   * @param {string} artifactId - Artifact ID
   */
  async deleteArtifact(artifactId) {
    const token = await this._getToken();
    return await this.httpApi.deleteArtifact(token, artifactId);
  }
  
  // ============================================================================
  // KV 存储
  // ============================================================================
  
  /**
   * 获取 KV 列表
   * @param {string} prefix - 键前缀（可选）
   * @param {number} limit - 返回数量限制（可选）
   * @returns {Promise<{items: Array}>} KV 列表
   */
  async kvList(prefix = '', limit = 100) {
    const token = await this._getToken();
    return await this.httpApi.kvList(token, { prefix, limit });
  }
  
  /**
   * 获取 KV 值
   * @param {string} key - 键
   * @returns {Promise<object|null>} KV 项或 null
   */
  async kvGet(key) {
    const token = await this._getToken();
    return await this.httpApi.kvGet(token, key);
  }
  
  /**
   * 设置 KV 值
   * @param {string} key - 键
   * @param {string} value - 值
   * @returns {Promise<object>} 操作结果
   */
  async kvSet(key, value) {
    const token = await this._getToken();
    
    // 先获取当前版本
    const existing = await this.httpApi.kvGet(token, key);
    const version = existing ? existing.version : -1;
    
    return await this.httpApi.kvMutate(token, [{
      key,
      value,
      version
    }]);
  }
  
  /**
   * 删除 KV 值
   * @param {string} key - 键
   * @returns {Promise<object>} 操作结果
   */
  async kvDelete(key) {
    const token = await this._getToken();
    
    const existing = await this.httpApi.kvGet(token, key);
    if (!existing) {
      throw new Error('Key not found');
    }
    
    return await this.httpApi.kvMutate(token, [{
      key,
      value: null,
      version: existing.version
    }]);
  }
  
  // ============================================================================
  // 社交功能
  // ============================================================================
  
  /**
   * 获取好友列表
   * @returns {Promise<{friends: Array}>} 好友列表
   */
  async getFriends() {
    const token = await this._getToken();
    return await this.httpApi.fetchFriends(token);
  }
  
  /**
   * 搜索用户
   * @param {string} query - 搜索关键词
   * @returns {Promise<{users: Array}>} 用户列表
   */
  async searchUsers(query) {
    const token = await this._getToken();
    return await this.httpApi.searchUsers(token, query);
  }
  
  /**
   * 获取用户资料
   * @param {string} userId - 用户 ID
   * @returns {Promise<object|null>} 用户资料
   */
  async getUser(userId) {
    const token = await this._getToken();
    return await this.httpApi.fetchUser(token, userId);
  }
  
  /**
   * 添加好友
   * @param {string} userId - 用户 ID
   * @returns {Promise<object>} 操作结果
   */
  async addFriend(userId) {
    const token = await this._getToken();
    return await this.httpApi.addFriend(token, userId);
  }
  
  /**
   * 移除好友
   * @param {string} userId - 用户 ID
   * @returns {Promise<object>} 操作结果
   */
  async removeFriend(userId) {
    const token = await this._getToken();
    return await this.httpApi.removeFriend(token, userId);
  }
  
  // ============================================================================
  // Feed 动态
  // ============================================================================
  
  /**
   * 获取动态 Feed
   * @param {object} options - 查询选项
   * @param {number} options.limit - 返回数量限制
   * @param {string} options.before - 获取该时间之前的动态
   * @param {string} options.after - 获取该时间之后的动态
   * @returns {Promise<{items: Array, hasMore: boolean}>} Feed 数据
   */
  async getFeed(options = {}) {
    const token = await this._getToken();
    return await this.httpApi.fetchFeed(token, options);
  }
  
  // ============================================================================
  // 服务连接
  // ============================================================================
  
  /**
   * 获取已连接服务列表
   * @returns {Promise<object>} 包含已连接服务信息的账户资料
   */
  async getConnectedServices() {
    const profile = this._cachedProfile || await this.getProfile();
    
    return {
      github: profile.github || null,
      connectedServices: profile.connectedServices || []
    };
  }
  
  /**
   * 断开服务连接
   * @param {string} service - 服务名称（如 'github'）
   */
  async disconnectService(service) {
    const token = await this._getToken();
    await this.httpApi.disconnectService(token, service);
    
    // 清除缓存
    this._cachedProfile = null;
  }
  
  // ============================================================================
  // Session RPC 调用
  // ============================================================================
  
  /**
   * 发送 Session RPC 调用
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} method - RPC 方法名（如 'abort', 'killSession'）
   * @param {object} params - 参数对象
   * @returns {Promise<object>} RPC 结果
   */
  async sessionRPC(sessionId, method, params = {}) {
    if (!this.isConnected || !this.wsClient) {
      throw new Error('Client not connected, please call initialize() first');
    }
    
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      throw new Error('Session ID not specified');
    }
    
    const enc = this.encryption.getSessionEncryption(targetSessionId);
    if (!enc) {
      throw new Error('Session encryption not initialized');
    }
    
    return await this.wsClient.sessionRPC(targetSessionId, method, params, enc, this.encryption);
  }
  
  /**
   * 软中止会话 - 中止当前操作，会话继续存活
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @param {string} reason - 中止原因（可选）
   * @returns {Promise<object>} 操作结果
   */
  async abortSession(sessionId = null, reason = null) {
    const defaultReason = `The user doesn't want to proceed with this tool use. The tool use was rejected. STOP what you are doing and wait for the user to tell you how to proceed.`;
    
    const result = await this.sessionRPC(sessionId, 'abort', {
      reason: reason || defaultReason
    });
    
    this.emit('session:aborted', { sessionId: sessionId || this.currentSessionId });
    return result;
  }
  
  /**
   * 硬中止会话 - 完全终止会话进程
   * @param {string} sessionId - 会话 ID（可选，默认使用当前会话）
   * @returns {Promise<object>} 操作结果
   */
  async killSession(sessionId = null) {
    const targetSessionId = sessionId || this.currentSessionId;
    
    const result = await this.sessionRPC(targetSessionId, 'killSession', {});
    
    // 如果终止成功，清除会话相关状态
    if (result?.success !== false) {
      this.emit('session:killed', { sessionId: targetSessionId });
      
      // 如果终止的是当前会话，清空当前会话 ID
      if (targetSessionId === this.currentSessionId) {
        this.currentSessionId = null;
      }
    }
    
    return result;
  }
  
  // ============================================================================
  // 连接管理
  // ============================================================================
  
  /**
   * 断开连接
   */
  async disconnect() {
    if (this.conversationManager) {
      this.conversationManager.cleanup();
    }
    
    if (this.wsClient) {
      await this.wsClient.disconnect();
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }
  
  /**
   * 清理资源
   */
  cleanup() {
    this.disconnect();
    this.removeAllListeners();
    
    // 清除缓存
    this._cachedToken = null;
    this._cachedProfile = null;
    this._cachedSettings = null;
    this._cachedSettingsVersion = null;
  }
}

module.exports = HappyClient;
