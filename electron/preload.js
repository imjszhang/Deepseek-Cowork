/**
 * DeepSeek Cowork - 预加载脚本
 * 
 * 在渲染进程中暴露安全的管理 API
 */

const { contextBridge, ipcRenderer } = require('electron');

// 暴露管理 API 到渲染进程
contextBridge.exposeInMainWorld('appBridge', {
  // ============ 服务器控制 ============
  
  /**
   * 获取服务器状态
   * @returns {Promise<Object>} 服务器状态
   */
  getServerStatus: () => ipcRenderer.invoke('server:getStatus'),
  
  /**
   * 获取服务器详细状态
   * @returns {Promise<Object>} 详细状态信息
   */
  getDetailedStatus: () => ipcRenderer.invoke('server:getDetailedStatus'),
  
  /**
   * 启动服务器
   * @returns {Promise<boolean>} 是否成功
   */
  startServer: () => ipcRenderer.invoke('server:start'),
  
  /**
   * 停止服务器
   * @returns {Promise<boolean>} 是否成功
   */
  stopServer: () => ipcRenderer.invoke('server:stop'),
  
  /**
   * 重启服务器
   * @returns {Promise<boolean>} 是否成功
   */
  restartServer: () => ipcRenderer.invoke('server:restart'),
  
  /**
   * 获取服务器日志
   * @param {number} limit - 返回的日志条数
   * @returns {Promise<Array>} 日志列表
   */
  getServerLogs: (limit = 100) => ipcRenderer.invoke('server:getLogs', limit),
  
  /**
   * 清除服务器日志
   * @returns {Promise<boolean>} 是否成功
   */
  clearServerLogs: () => ipcRenderer.invoke('server:clearLogs'),

  // ============ 端口管理 ============
  
  /**
   * 检查端口是否可用
   * @param {number} port - 端口号
   * @returns {Promise<boolean>} 是否可用
   */
  checkPort: (port) => ipcRenderer.invoke('server:checkPort', port),
  
  /**
   * 强制释放端口（终止占用进程）
   * @param {number} port - 端口号
   * @returns {Promise<boolean>} 是否成功
   */
  killPort: (port) => ipcRenderer.invoke('server:killPort', port),

  // ============ 视图控制 ============
  
  /**
   * 刷新管理界面
   * @returns {Promise<boolean>} 是否成功
   */
  refreshView: () => ipcRenderer.invoke('view:refresh'),
  
  /**
   * 重新加载管理界面
   * @returns {Promise<boolean>} 是否成功
   */
  reloadView: () => ipcRenderer.invoke('view:reload'),
  
  /**
   * 打开管理界面开发者工具
   * @returns {Promise<boolean>} 是否成功
   */
  openDevTools: () => ipcRenderer.invoke('view:openDevTools'),
  
  /**
   * 切换管理界面开发者工具
   * @returns {Promise<boolean>} 是否成功
   */
  toggleDevTools: () => ipcRenderer.invoke('view:toggleDevTools'),
  
  /**
   * 获取当前管理界面 URL
   * @returns {Promise<string|null>} 当前 URL
   */
  getCurrentUrl: () => ipcRenderer.invoke('view:getCurrentUrl'),

  // ============ 配置管理 ============
  
  /**
   * 获取配置
   * @returns {Promise<Object>} 配置对象
   */
  getConfig: () => ipcRenderer.invoke('config:get'),
  
  /**
   * 设置服务器配置
   * @param {Object} config - 配置对象
   * @returns {Promise<boolean>} 是否成功
   */
  setServerConfig: (config) => ipcRenderer.invoke('config:setServer', config),
  
  /**
   * 设置视图配置
   * @param {Object} config - 配置对象
   * @returns {Promise<boolean>} 是否成功
   */
  setViewConfig: (config) => ipcRenderer.invoke('config:setView', config),

  // ============ 事件监听 ============
  
  /**
   * 监听服务器状态变化
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onServerStatusChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('server-status-changed', handler);
    return () => ipcRenderer.removeListener('server-status-changed', handler);
  },
  
  /**
   * 监听服务器日志
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onServerLog: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('server-log', handler);
    return () => ipcRenderer.removeListener('server-log', handler);
  },
  
  /**
   * 监听管理界面加载完成
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onViewLoaded: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('view-loaded', handler);
    return () => ipcRenderer.removeListener('view-loaded', handler);
  },
  
  /**
   * 监听管理界面加载失败
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onViewLoadFailed: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('view-load-failed', handler);
    return () => ipcRenderer.removeListener('view-load-failed', handler);
  },
  
  // ============ AI 相关 API ============
  
  /**
   * 获取 AI 状态
   * @returns {Promise<Object>} AI 状态
   */
  getAIStatus: () => ipcRenderer.invoke('ai:getStatus'),
  
  /**
   * 连接 AI
   * @returns {Promise<Object>} 连接结果
   */
  connectAI: () => ipcRenderer.invoke('ai:connect'),
  
  /**
   * 断开 AI 连接
   * @returns {Promise<Object>} 断开结果
   */
  disconnectAI: () => ipcRenderer.invoke('ai:disconnect'),
  
  /**
   * 发送消息到 AI
   * @param {string} text - 消息内容
   * @returns {Promise<Object>} 响应结果
   */
  sendAIMessage: (text) => ipcRenderer.invoke('ai:sendMessage', text),
  
  /**
   * 获取 AI 消息历史
   * @param {number} limit - 返回的消息条数
   * @returns {Promise<Array>} 消息列表
   */
  getAIMessages: (limit = 50) => ipcRenderer.invoke('ai:getMessages', limit),
  
  /**
   * 清除 AI 消息历史
   * @returns {Promise<boolean>} 是否成功
   */
  clearAIMessages: () => ipcRenderer.invoke('ai:clearMessages'),
  
  /**
   * 恢复 AI 消息历史（从记忆系统恢复）
   * @param {Array} messages - 消息数组 [{ role, text, messageId, timestamp, ... }]
   * @returns {Promise<Object>} { success, count, error }
   */
  restoreAIMessages: (messages) => ipcRenderer.invoke('ai:restoreMessages', messages),
  
  /**
   * 执行 AI 浏览器指令
   * @param {string} instruction - 指令内容
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 执行结果
   */
  executeAIInstruction: (instruction, context = {}) => 
    ipcRenderer.invoke('ai:executeInstruction', instruction, context),
  
  /**
   * 获取浏览器上下文
   * @param {string} type - 上下文类型 ('full', 'minimal', 'tabs_only', 'active_tab')
   * @returns {Promise<Object>} 上下文信息
   */
  getBrowserContext: (type = 'full') => ipcRenderer.invoke('ai:getContext', type),
  
  /**
   * 获取 Happy Session 信息
   * @returns {Promise<Object>} Session 信息
   */
  getHappySession: () => ipcRenderer.invoke('ai:getSession'),

  // ============ AI 事件监听 ============
  
  /**
   * 监听 AI 连接状态变化
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onAIStatusChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ai-status-changed', handler);
    return () => ipcRenderer.removeListener('ai-status-changed', handler);
  },
  
  /**
   * 监听 AI 消息
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onAIMessage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ai-message', handler);
    return () => ipcRenderer.removeListener('ai-message', handler);
  },
  
  /**
   * 监听 AI 进度
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onAIProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ai-progress', handler);
    return () => ipcRenderer.removeListener('ai-progress', handler);
  },
  
  /**
   * 监听 AI 错误
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onAIError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ai-error', handler);
    return () => ipcRenderer.removeListener('ai-error', handler);
  },

  // ============ Happy AI 实时消息事件 ============
  
  /**
   * 监听 Happy AI 消息（实时同步）
   * @param {Function} callback - 回调函数 (data: { role, text, messageId, timestamp })
   * @returns {Function} 取消监听函数
   */
  onHappyMessage: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:message', handler);
    return () => ipcRenderer.removeListener('happy:message', handler);
  },
  
  /**
   * 监听 Happy AI 连接状态
   * @param {Function} callback - 回调函数 (data: { sessionId })
   * @returns {Function} 取消监听函数
   */
  onHappyConnected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:connected', handler);
    return () => ipcRenderer.removeListener('happy:connected', handler);
  },
  
  /**
   * 监听 Happy AI 断开连接
   * @param {Function} callback - 回调函数 (data: { reason })
   * @returns {Function} 取消监听函数
   */
  onHappyDisconnected: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:disconnected', handler);
    return () => ipcRenderer.removeListener('happy:disconnected', handler);
  },
  
  /**
   * 监听 Happy AI 事件状态变化（idle, processing, ready）
   * @param {Function} callback - 回调函数 (data: { eventType, timestamp })
   * @returns {Function} 取消监听函数
   */
  onHappyEventStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:eventStatus', handler);
    return () => ipcRenderer.removeListener('happy:eventStatus', handler);
  },
  
  /**
   * 监听 Happy AI 错误
   * @param {Function} callback - 回调函数 (data: { type, message })
   * @returns {Function} 取消监听函数
   */
  onHappyError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:error', handler);
    return () => ipcRenderer.removeListener('happy:error', handler);
  },
  
  /**
   * 监听 Happy AI 使用量更新（上下文窗口使用情况）
   * @param {Function} callback - 回调函数 (data: { inputTokens, outputTokens, contextSize, ... })
   * @returns {Function} 取消监听函数
   */
  onUsageUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:usage', handler);
    return () => ipcRenderer.removeListener('happy:usage', handler);
  },
  
  /**
   * 获取最新的使用量数据
   * @returns {Promise<Object|null>} 使用量数据
   */
  getLatestUsage: () => ipcRenderer.invoke('ai:getLatestUsage'),
  
  /**
   * 获取 Happy AI 消息历史
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>} 消息列表
   */
  getHappyMessages: (limit = 50) => ipcRenderer.invoke('ai:getMessages', limit),
  
  /**
   * 恢复 Happy AI 消息历史（从记忆系统恢复）
   * @param {Array} messages - 消息数组
   * @returns {Promise<Object>} { success, count, error }
   */
  restoreHappyMessages: (messages) => ipcRenderer.invoke('ai:restoreMessages', messages),
  
  /**
   * 监听消息恢复完成事件
   * @param {Function} callback - 回调函数 (data: { count, sessionId })
   * @returns {Function} 取消监听的函数
   */
  onHappyMessagesRestored: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:messagesRestored', handler);
    return () => ipcRenderer.removeListener('happy:messagesRestored', handler);
  },
  
  /**
   * 监听 agentState 更新事件（权限请求）
   * @param {Function} callback - 回调函数 (data: { sessionId, agentState, version, hasNewRequests })
   * @returns {Function} 取消监听的函数
   */
  onHappyAgentState: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:agentState', handler);
    return () => ipcRenderer.removeListener('happy:agentState', handler);
  },

  // ============ 权限操作 API ============
  
  /**
   * 允许权限请求
   * @param {string} sessionId - 会话 ID
   * @param {string} permissionId - 权限请求 ID
   * @param {string} mode - 可选的模式 ('acceptEdits')
   * @param {Array} allowedTools - 可选的允许工具列表
   * @returns {Promise<Object>} 结果
   */
  allowPermission: (sessionId, permissionId, mode, allowedTools) => 
    ipcRenderer.invoke('ai:allowPermission', sessionId, permissionId, mode, allowedTools),
  
  /**
   * 拒绝权限请求
   * @param {string} sessionId - 会话 ID
   * @param {string} permissionId - 权限请求 ID
   * @returns {Promise<Object>} 结果
   */
  denyPermission: (sessionId, permissionId) => 
    ipcRenderer.invoke('ai:denyPermission', sessionId, permissionId),
  
  /**
   * 中止当前任务
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>} 结果
   */
  abortSession: (sessionId) => ipcRenderer.invoke('ai:abort', sessionId),

  // ============ Happy Service 设置 ============
  
  /**
   * 获取 Happy Service 设置
   * @returns {Promise<Object>} 设置对象
   */
  getHappySettings: () => ipcRenderer.invoke('happy:getSettings'),
  
  /**
   * 设置 Happy Service 配置
   * @param {Object} settings - 设置对象
   * @returns {Promise<Object>} 结果
   */
  setHappySettings: (settings) => ipcRenderer.invoke('happy:setSettings', settings),
  
  /**
   * 选择工作目录（打开文件夹选择对话框）
   * @returns {Promise<Object>} 结果 { success, path }
   */
  selectWorkspaceDir: () => ipcRenderer.invoke('happy:selectWorkspaceDir'),
  
  /**
   * 重置为默认工作目录
   * @returns {Promise<Object>} 结果
   */
  resetWorkspaceDir: () => ipcRenderer.invoke('happy:resetWorkspaceDir'),

  /**
   * 热切换工作目录
   * @param {string} newPath 新的工作目录路径
   * @returns {Promise<Object>} 结果 { success, sessionName, sessionId, connected, error }
   */
  switchWorkDir: (newPath) => ipcRenderer.invoke('happy:switchWorkDir', newPath),

  /**
   * 获取所有已映射的工作目录
   * @returns {Promise<Array>} 工作目录列表
   */
  listWorkDirs: () => ipcRenderer.invoke('happy:listWorkDirs'),

  /**
   * 获取当前工作目录
   * @returns {Promise<string|null>} 当前工作目录路径
   */
  getCurrentWorkDir: () => ipcRenderer.invoke('happy:getCurrentWorkDir'),

  // ============ Happy Secret 管理 API ============
  
  /**
   * 检查 Happy Secret 是否已配置
   * @returns {Promise<boolean>} 是否存在
   */
  hasHappySecret: () => ipcRenderer.invoke('happy:hasSecret'),
  
  /**
   * 生成新的 Happy Secret
   * @returns {Promise<Object>} { success, formatted, base64url } 或 { success: false, error }
   */
  generateHappySecret: () => ipcRenderer.invoke('happy:generateSecret'),
  
  /**
   * 验证 Secret 格式
   * @param {string} input - 用户输入的 Secret
   * @returns {Promise<Object>} { valid, normalized, error }
   */
  validateHappySecret: (input) => ipcRenderer.invoke('happy:validateSecret', input),
  
  /**
   * 验证 Secret 并测试连接
   * @param {string} secret - Secret 值
   * @returns {Promise<Object>} { success, normalized, error }
   */
  verifyHappySecret: (secret) => ipcRenderer.invoke('happy:verifySecret', secret),
  
  /**
   * 保存 Happy Secret（带格式验证）
   * @param {string} secret - Secret 值
   * @param {string} [token] - 可选的 JWT token（用于同步到 ~/.happy/access.key）
   * @returns {Promise<Object>} { success, needsRestart, error }
   */
  saveHappySecret: (secret, token = null) => ipcRenderer.invoke('happy:saveSecret', secret, token),
  
  /**
   * 设置 Happy Secret（直接存储，无验证，保留兼容）
   * @param {string} value - Secret 值
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  setHappySecret: (value) => ipcRenderer.invoke('secure:setSecret', 'happy.secret', value),
  
  /**
   * 删除 Happy Secret
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  deleteHappySecret: () => ipcRenderer.invoke('secure:deleteSecret', 'happy.secret'),
  
  /**
   * 获取账户信息
   * @returns {Promise<Object>} { hasSecret, isConnected, accountId, serverUrl, sessionId, eventStatus }
   */
  getAccountInfo: () => ipcRenderer.invoke('happy:getAccountInfo'),
  
  /**
   * 获取格式化的 Secret（用于显示/备份）
   * @returns {Promise<Object>} { success, formatted } 或 { success: false, error }
   */
  getFormattedSecret: () => ipcRenderer.invoke('happy:getFormattedSecret'),
  
  /**
   * 退出登录（清除 Secret 并断开连接）
   * @returns {Promise<Object>} { success, needsRestart } 或 { success: false, error }
   */
  logout: () => ipcRenderer.invoke('happy:logout'),

  /**
   * 修改服务器地址（会退出账户、清除数据）
   * @param {string|null} newServerUrl 新服务器地址（留空使用默认）
   * @returns {Promise<Object>} { success } 或 { success: false, error }
   */
  changeServer: (newServerUrl) => ipcRenderer.invoke('happy:changeServer', newServerUrl),

  // ============ Claude Code 安全存储 API ============
  
  /**
   * 设置 Claude Auth Token（加密存储）
   * @param {string} value - Token 值
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  setClaudeAuthToken: (value) => ipcRenderer.invoke('secure:setSecret', 'claude.authToken', value),
  
  /**
   * 检查 Claude Auth Token 是否已配置
   * @returns {Promise<boolean>} 是否存在
   */
  hasClaudeAuthToken: () => ipcRenderer.invoke('secure:hasSecret', 'claude.authToken'),
  
  /**
   * 删除 Claude Auth Token
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  deleteClaudeAuthToken: () => ipcRenderer.invoke('secure:deleteSecret', 'claude.authToken'),

  // ============ Claude Code 设置 API ============
  
  /**
   * 获取 Claude Code 设置
   * @returns {Promise<Object>} 设置对象
   */
  getClaudeCodeSettings: () => ipcRenderer.invoke('claude:getSettings'),
  
  /**
   * 保存 Claude Code 设置
   * @param {Object} settings - 设置对象
   * @returns {Promise<Object>} 结果 { success, needsRestart }
   */
  saveClaudeCodeSettings: (settings) => ipcRenderer.invoke('claude:saveSettings', settings),
  
  /**
   * 获取 Claude Code 提供商预设
   * @returns {Promise<Object>} 预设配置
   */
  getClaudeCodePresets: () => ipcRenderer.invoke('claude:getProviderPresets'),

  // ============ Daemon 管理 API ============
  
  /**
   * 启动 daemon
   * @returns {Promise<Object>} 结果 { success, error?, status? }
   */
  startDaemon: () => ipcRenderer.invoke('daemon:start'),
  
  /**
   * 停止 daemon
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  stopDaemon: () => ipcRenderer.invoke('daemon:stop'),
  
  /**
   * 重启 daemon（使新配置生效）
   * @returns {Promise<Object>} 结果 { success, error? }
   */
  restartDaemon: () => ipcRenderer.invoke('daemon:restart'),
  
  /**
   * 获取 daemon 状态
   * @returns {Promise<Object>} 状态信息
   */
  getDaemonStatus: () => ipcRenderer.invoke('daemon:getStatus'),
  
  /**
   * 监听 daemon 状态变化
   * @param {Function} callback - 回调函数 (data: { running, pid, httpPort, ... })
   * @returns {Function} 取消监听函数
   */
  onDaemonStatusChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('daemon:statusChanged', handler);
    return () => ipcRenderer.removeListener('daemon:statusChanged', handler);
  },
  
  /**
   * 监听 daemon 启动进度
   * @param {Function} callback - 回调函数 (data: { stage, progress, message })
   * @returns {Function} 取消监听函数
   */
  onDaemonStartProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('daemon:startProgress', handler);
    return () => ipcRenderer.removeListener('daemon:startProgress', handler);
  },

  // ============ Happy AI 设置 API ============
  
  /**
   * 获取所有 Happy AI 设置
   * @returns {Promise<Object>} 设置对象
   */
  getAllHappySettings: () => ipcRenderer.invoke('happy:getAllSettings'),
  
  /**
   * 保存 Happy AI 设置
   * @param {Object} settings - 设置对象
   * @returns {Promise<Object>} 结果 { success, needsRestart }
   */
  saveHappySettings: (settings) => ipcRenderer.invoke('happy:saveSettings', settings),

  // ============ 依赖检查 API ============
  
  /**
   * 获取依赖状态（使用缓存）
   * @returns {Promise<Object>} 依赖状态
   */
  getDependencyStatus: () => ipcRenderer.invoke('deps:getStatus'),
  
  /**
   * 检查所有依赖（刷新）
   * @returns {Promise<Object>} 依赖状态
   */
  checkAllDependencies: () => ipcRenderer.invoke('deps:checkAll'),
  
  /**
   * 检查 Node.js
   * @returns {Promise<Object>} Node.js 状态
   */
  checkNodeJs: () => ipcRenderer.invoke('deps:checkNodeJs'),
  
  /**
   * 检查 happy-coder
   * @returns {Promise<Object>} happy-coder 状态
   */
  checkHappyCoder: () => ipcRenderer.invoke('deps:checkHappyCoder'),
  
  /**
   * 检查 claude-code
   * @returns {Promise<Object>} claude-code 状态
   */
  checkClaudeCode: () => ipcRenderer.invoke('deps:checkClaudeCode'),
  
  /**
   * 安装 happy-coder
   * @returns {Promise<Object>} 安装结果
   */
  installHappyCoder: () => ipcRenderer.invoke('deps:installHappyCoder'),

  /**
   * 自动安装 Claude Code
   * @returns {Promise<Object>} 安装结果
   */
  installClaudeCode: () => ipcRenderer.invoke('deps:installClaudeCode'),

  /**
   * 自动升级 Claude Code
   * @returns {Promise<Object>} 升级结果
   */
  upgradeClaudeCode: () => ipcRenderer.invoke('deps:upgradeClaudeCode'),
  
  /**
   * 获取安装指南
   * @param {string} component - 组件名称 ('nodejs' | 'claudeCode')
   * @returns {Promise<Object>} 安装指南
   */
  getInstallGuide: (component) => ipcRenderer.invoke('deps:getInstallGuide', component),
  
  /**
   * 打开 Node.js 官网
   * @returns {Promise<boolean>}
   */
  openNodeJsWebsite: () => ipcRenderer.invoke('deps:openNodeJsWebsite'),
  
  /**
   * 打开 Claude Code 文档
   * @returns {Promise<boolean>}
   */
  openClaudeCodeDocs: () => ipcRenderer.invoke('deps:openClaudeCodeDocs'),

  // ============ 设置向导 API ============
  
  /**
   * 获取设置向导所需的配置项列表
   * @returns {Promise<Object>} 配置需求 { ready, critical, recommended, platform }
   */
  getSetupRequirements: () => ipcRenderer.invoke('setup:getRequirements'),
  
  /**
   * 重新检测环境
   * @returns {Promise<Object>} 配置需求
   */
  recheckSetup: () => ipcRenderer.invoke('setup:recheck'),
  
  /**
   * 标记设置向导已完成
   * @returns {Promise<Object>} { success }
   */
  completeSetup: () => ipcRenderer.invoke('setup:complete'),
  
  /**
   * 跳过设置向导
   * @returns {Promise<Object>} { success }
   */
  skipSetup: () => ipcRenderer.invoke('setup:skip'),
  
  /**
   * 判断是否应该显示设置向导
   * @returns {Promise<Object>} { shouldShow, reason?, requirements?, daysRemaining? }
   */
  shouldShowSetup: () => ipcRenderer.invoke('setup:shouldShow'),
  
  /**
   * 重置向导状态（用于从设置页重新运行向导）
   * @returns {Promise<Object>} { success }
   */
  resetSetupWizard: () => ipcRenderer.invoke('setup:resetWizard'),
  
  /**
   * 获取当前平台
   * @returns {Promise<string>} 平台标识 ('win32' | 'darwin' | 'linux')
   */
  getSetupPlatform: () => ipcRenderer.invoke('setup:getPlatform'),

  // ============ 应用控制 API ============
  
  /**
   * 获取应用版本信息
   * @returns {Promise<Object>} { version, name, description }
   */
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  /**
   * 重启应用
   * @returns {Promise<void>}
   */
  restartApp: () => ipcRenderer.invoke('app:restart'),
  
  /**
   * 退出应用
   * @returns {Promise<void>}
   */
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // ============ 自动更新 API ============
  
  /**
   * 检查更新
   * @returns {Promise<Object>} { success, updateInfo? } 或 { success: false, error }
   */
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
  
  /**
   * 下载更新
   * @returns {Promise<Object>} { success } 或 { success: false, error }
   */
  downloadUpdate: () => ipcRenderer.invoke('updater:downloadUpdate'),
  
  /**
   * 获取更新状态
   * @returns {Promise<Object>} { status, currentVersion, updateInfo?, downloadProgress?, error? }
   */
  getUpdateStatus: () => ipcRenderer.invoke('updater:getStatus'),
  
  /**
   * 退出并安装更新
   * @returns {Promise<boolean>} 是否成功
   */
  quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
  
  /**
   * 监听更新状态变化
   * @param {Function} callback - 回调函数 (data: { status, updateInfo?, downloadProgress?, error? })
   * @returns {Function} 取消监听函数
   */
  onUpdateStatusChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:statusChanged', handler);
    return () => ipcRenderer.removeListener('updater:statusChanged', handler);
  },
  
  /**
   * 监听检查更新事件
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onUpdateChecking: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:checking', handler);
    return () => ipcRenderer.removeListener('updater:checking', handler);
  },
  
  /**
   * 监听有新版本可用事件
   * @param {Function} callback - 回调函数 (data: { version, releaseDate, releaseNotes, currentVersion })
   * @returns {Function} 取消监听函数
   */
  onUpdateAvailable: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:available', handler);
    return () => ipcRenderer.removeListener('updater:available', handler);
  },
  
  /**
   * 监听无更新事件
   * @param {Function} callback - 回调函数 (data: { version, currentVersion })
   * @returns {Function} 取消监听函数
   */
  onUpdateNotAvailable: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:not-available', handler);
    return () => ipcRenderer.removeListener('updater:not-available', handler);
  },
  
  /**
   * 监听下载进度事件
   * @param {Function} callback - 回调函数 (data: { percent, bytesPerSecond, transferred, total })
   * @returns {Function} 取消监听函数
   */
  onUpdateDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:download-progress', handler);
    return () => ipcRenderer.removeListener('updater:download-progress', handler);
  },
  
  /**
   * 监听下载完成事件
   * @param {Function} callback - 回调函数 (data: { version, releaseDate, releaseNotes })
   * @returns {Function} 取消监听函数
   */
  onUpdateDownloaded: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:downloaded', handler);
    return () => ipcRenderer.removeListener('updater:downloaded', handler);
  },
  
  /**
   * 监听更新错误事件
   * @param {Function} callback - 回调函数 (data: { message })
   * @returns {Function} 取消监听函数
   */
  onUpdateError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },

  /**
   * 监听 Happy Service 状态变化
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  onHappyServiceStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy-service-status', handler);
    return () => ipcRenderer.removeListener('happy-service-status', handler);
  },

  /**
   * 监听 Happy Service 热初始化完成事件
   * @param {Function} callback - 回调函数 (data: { success, daemon, sessions })
   * @returns {Function} 取消监听函数
   */
  onHappyInitialized: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('happy:initialized', handler);
    return () => ipcRenderer.removeListener('happy:initialized', handler);
  },

  /**
   * 监听 Session 状态更新事件
   * 当 session 列表发生变化（创建/切换/删除）时触发
   * @param {Function} callback - 回调函数 (state: { currentSession, sessions, updatedAt })
   * @returns {Function} 取消监听函数
   */
  onSessionStateUpdated: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('session:stateUpdated', handler);
    return () => ipcRenderer.removeListener('session:stateUpdated', handler);
  },

  /**
   * 监听单个 Session 状态变化事件（轻量级）
   * 当某个 session 的处理状态变化（processing/idle）时触发
   * @param {Function} callback - 回调函数 (data: { sessionId, name, status, timestamp })
   * @returns {Function} 取消监听函数
   */
  onSessionStatusChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('session:statusChanged', handler);
    return () => ipcRenderer.removeListener('session:statusChanged', handler);
  },

  /**
   * 监听消息添加事件（供看板实时更新）
   * @param {Function} callback - 回调函数 ({ sessionId, message: { role, text, timestamp } })
   * @returns {Function} 取消监听函数
   */
  onMessageAdded: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('message:added', handler);
    return () => ipcRenderer.removeListener('message:added', handler);
  },

  /**
   * 获取格式化后的 Session 状态（供 SessionHub 预加载使用）
   * @returns {Promise<Object>} { currentSession, sessions: [], updatedAt }
   */
  getFormattedSessionState: () => ipcRenderer.invoke('happy:getFormattedSessionState'),

  /**
   * 批量获取多个 session 的消息（供看板预览使用）
   * @param {string[]} sessionIds Session ID 列表
   * @param {number} limit 每个 session 返回的消息数量（默认 5）
   * @returns {Promise<Object>} { [sessionId]: { messages: [...], lastUpdated } }
   */
  getMultiSessionMessages: (sessionIds, limit) => ipcRenderer.invoke('happy:getMultiSessionMessages', sessionIds, limit),

  // ============ 窗口控制 ============
  
  /**
   * 最小化窗口
   * @returns {Promise<void>}
   */
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  
  /**
   * 最大化/还原窗口
   * @returns {Promise<void>}
   */
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  
  /**
   * 关闭窗口
   * @returns {Promise<void>}
   */
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // ============ 文件系统 API ============

  /**
   * 获取工作目录根路径
   * @returns {Promise<Object>} { success, path } 或 { success: false, error }
   */
  getWorkspaceRoot: () => ipcRenderer.invoke('fs:getWorkspaceRoot'),

  /**
   * 列出目录内容
   * @param {string} dirPath - 目录路径（可选，默认为工作目录根）
   * @returns {Promise<Object>} 目录内容列表
   */
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:listDirectory', dirPath),

  /**
   * 创建文件夹
   * @param {string} folderPath - 文件夹路径
   * @returns {Promise<Object>} 创建结果
   */
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),

  /**
   * 删除文件或文件夹
   * @param {string} itemPath - 文件/文件夹路径
   * @param {boolean} skipConfirm - 是否跳过确认对话框
   * @returns {Promise<Object>} 删除结果
   */
  deleteItem: (itemPath, skipConfirm = false) => ipcRenderer.invoke('fs:deleteItem', itemPath, skipConfirm),

  /**
   * 重命名文件或文件夹
   * @param {string} oldPath - 原路径
   * @param {string} newPath - 新路径
   * @returns {Promise<Object>} 重命名结果
   */
  renameItem: (oldPath, newPath) => ipcRenderer.invoke('fs:renameItem', oldPath, newPath),

  /**
   * 使用系统默认程序打开文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 打开结果
   */
  openFile: (filePath) => ipcRenderer.invoke('fs:openFile', filePath),

  /**
   * 在系统文件管理器中显示文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 操作结果
   */
  showInExplorer: (filePath) => ipcRenderer.invoke('fs:showInExplorer', filePath),

  /**
   * 获取文件/文件夹信息
   * @param {string} itemPath - 文件/文件夹路径
   * @returns {Promise<Object>} 文件信息
   */
  getItemInfo: (itemPath) => ipcRenderer.invoke('fs:getItemInfo', itemPath),

  /**
   * 复制文件或文件夹
   * @param {string} sourcePath - 源路径
   * @param {string} destPath - 目标路径
   * @returns {Promise<Object>} 复制结果
   */
  copyItem: (sourcePath, destPath) => ipcRenderer.invoke('fs:copyItem', sourcePath, destPath),

  /**
   * 移动文件或文件夹
   * @param {string} sourcePath - 源路径
   * @param {string} destPath - 目标路径
   * @returns {Promise<Object>} 移动结果
   */
  moveItem: (sourcePath, destPath) => ipcRenderer.invoke('fs:moveItem', sourcePath, destPath),

  /**
   * 刷新工作目录缓存
   * @returns {Promise<Object>} 操作结果
   */
  refreshWorkspaceDir: () => ipcRenderer.invoke('fs:refreshWorkspaceDir'),

  // ============ 文件内容读写 API（用于文件预览/编辑）============

  /**
   * 读取文件内容（UTF-8 文本）
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} { success, path, content } 或 { success: false, error }
   */
  readFileContent: (filePath) => ipcRenderer.invoke('fs:readFileContent', filePath),

  /**
   * 读取二进制文件内容（用于 PDF 等二进制文件预览）
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} { success, path, data: Uint8Array } 或 { success: false, error }
   */
  readFileBinary: (filePath) => ipcRenderer.invoke('fs:readFileBinary', filePath),

  /**
   * 保存文件内容
   * @param {string} filePath - 文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<Object>} { success, path, message } 或 { success: false, error }
   */
  saveFileContent: (filePath, content) => ipcRenderer.invoke('fs:saveFileContent', filePath, content),

  // ============ 文件系统事件监听（用于实时更新文件列表）============

  /**
   * 监听文件系统变化事件
   * @param {Function} callback - 回调函数 (data: { type, path, oldPath?, isDirectory? })
   *   type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'rename'
   *   path: 变化的文件/目录路径
   *   oldPath: 重命名时的原路径
   *   isDirectory: 是否为目录
   * @returns {Function} 取消监听函数
   */
  onFileChanged: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('fs:fileChanged', handler);
    return () => ipcRenderer.removeListener('fs:fileChanged', handler);
  }
});

// 暴露平台信息
contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  platform: process.platform,
  arch: process.arch
});

console.log('DeepSeek Cowork preload script loaded');
