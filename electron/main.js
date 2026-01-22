/**
 * DeepSeek Cowork - 主进程入口
 * 
 * 功能：
 * - 启动内嵌 browserControlServer（同进程）
 * - 创建应用窗口
 * - 管理 BrowserView 加载管理界面
 * - 处理 IPC 通信
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 管理器
const ServerManager = require('./managers/server-manager');
const ViewManager = require('./managers/view-manager');
const UpdateManager = require('./managers/update-manager');

// Happy Service
const HappyService = require('../lib/happy-service');

// 用户设置
const userSettings = require('../lib/user-settings');

// 消息历史持久化
const MessageStore = require('../lib/message-store');

// 安全设置（加密存储）
const secureSettings = require('../lib/secure-settings');

// 依赖检查
const dependencyChecker = require('../lib/dependency-checker');

// 文件系统管理器
const fileManager = require('./managers/file-manager');

// 全局引用
let mainWindow = null;
let serverManager = null;
let viewManager = null;
let updateManager = null;
let isQuitting = false;
let happyServiceInitialized = false;

// 依赖状态缓存
let dependencyStatus = null;

/**
 * 获取应用数据目录（兼容开发环境和打包环境）
 * 打包后 ASAR 包是只读的，所以需要使用 userData 目录
 * @returns {string} 数据目录路径
 */
function getAppDataDir() {
  const config = require('../config');
  const configDataDir = config.database?.directory;
  
  // 检查配置的目录是否在 ASAR 包内（打包环境）
  if (configDataDir && configDataDir.includes('app.asar')) {
    // 打包环境：使用 userData 目录
    return path.join(app.getPath('userData'), 'data');
  }
  
  // 开发环境或配置了外部路径：使用配置的目录
  if (configDataDir) {
    return configDataDir;
  }
  
  // 备用方案：检查 __dirname 是否在 ASAR 包内
  if (__dirname.includes('app.asar')) {
    return path.join(app.getPath('userData'), 'data');
  }
  
  // 开发环境默认值
  return path.join(__dirname, '../data');
}

// ============================================================================
// 单实例锁 - 防止多个应用实例同时运行
// ============================================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance of DeepSeek Cowork is already running, quitting...');
  app.quit();
}

// 当第二个实例尝试启动时，聚焦到现有窗口
app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('Second instance detected, focusing existing window...');
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

/**
 * 创建主窗口
 */
function createMainWindow() {
  // 隐藏默认菜单栏
  Menu.setApplicationMenu(null);
  
  // 设置应用图标路径
  // Windows 优先使用 .ico，如果没有则使用 PNG
  // Linux/macOS 使用 PNG
  let iconPath = null;
  const iconsDir = path.join(__dirname, '../icons');
  
  if (process.platform === 'win32') {
    // Windows: 优先使用 .ico，如果没有则使用 icon-256.png
    const icoPath = path.join(iconsDir, 'icon.ico');
    if (fs.existsSync(icoPath)) {
      iconPath = icoPath;
    } else {
      const pngPath = path.join(iconsDir, 'icon-256.png');
      if (fs.existsSync(pngPath)) {
        iconPath = pngPath;
      }
    }
  } else {
    // Linux/macOS: 使用 PNG
    const pngPath = path.join(iconsDir, 'icon-256.png');
    if (fs.existsSync(pngPath)) {
      iconPath = pngPath;
    }
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 480,
    minHeight: 600,
    title: 'DeepSeek Cowork',
    icon: iconPath, // 设置应用图标
    frame: false, // 无边框窗口，自定义标题栏
    autoHideMenuBar: true, // 隐藏菜单栏
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // 允许 file:// 协议访问外部资源（用于 HTML 预览）
    },
    backgroundColor: '#0a0a0a',
    show: false // 先不显示，等准备好再显示
  });

  // 加载渲染进程页面（工具栏）
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 开发模式下打开开发者工具
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  // F12 快捷键打开开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 窗口大小变化时调整 BrowserView
  mainWindow.on('resize', () => {
    if (viewManager) {
      viewManager.adjustBounds();
    }
  });

  return mainWindow;
}

/**
 * 初始化服务器管理器
 */
async function initializeServerManager() {
  serverManager = new ServerManager();
  
  // 设置状态变化回调
  serverManager.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-status-changed', status);
    }
    
    // 如果服务器重启成功，刷新管理界面
    if (status.running && viewManager) {
      setTimeout(() => {
        viewManager.refresh();
      }, 500);
    }
  });

  return serverManager;
}

/**
 * 初始化视图管理器
 */
function initializeViewManager() {
  viewManager = new ViewManager(mainWindow);
  
  // 设置布局配置
  viewManager.setLayout({
    toolbarHeight: 32, // 极简标题栏高度
    statusBarHeight: 28
  });

  return viewManager;
}

/**
 * 设置 IPC 处理器
 */
function setupIpcHandlers() {
  // ============ 服务器控制 ============
  
  ipcMain.handle('server:getStatus', () => {
    return serverManager ? serverManager.getStatus() : { running: false };
  });

  ipcMain.handle('server:getDetailedStatus', () => {
    return serverManager ? serverManager.getDetailedStatus() : { running: false };
  });

  ipcMain.handle('server:getExtensionConnections', () => {
    return serverManager ? serverManager.getExtensionConnections() : 0;
  });

  ipcMain.handle('server:start', async () => {
    if (serverManager) {
      return serverManager.start();
    }
    return false;
  });

  ipcMain.handle('server:stop', async () => {
    if (serverManager) {
      return serverManager.stop();
    }
    return false;
  });

  ipcMain.handle('server:restart', async () => {
    if (serverManager) {
      const result = await serverManager.restart();
      // 重启后刷新视图
      if (result && viewManager) {
        setTimeout(() => viewManager.refresh(), 1000);
      }
      return result;
    }
    return false;
  });

  ipcMain.handle('server:getLogs', (event, limit = 100) => {
    return serverManager ? serverManager.getLogs(limit) : [];
  });

  ipcMain.handle('server:clearLogs', () => {
    if (serverManager) {
      serverManager.clearLogs();
      return true;
    }
    return false;
  });

  // ============ 端口管理 ============

  ipcMain.handle('server:checkPort', async (event, port) => {
    if (serverManager) {
      return serverManager.checkPortAvailable(port);
    }
    return false;
  });

  ipcMain.handle('server:killPort', async (event, port) => {
    if (serverManager) {
      return serverManager.killProcessOnPort(port);
    }
    return false;
  });

  // ============ 浏览器标签页 ============

  ipcMain.handle('browser:getTabs', async () => {
    try {
      const service = serverManager?.getService?.();
      
      if (service) {
        // 尝试多种方式获取 tabsManager
        let tabsManager = null;
        if (typeof service.getTabsManager === 'function') {
          tabsManager = service.getTabsManager();
        } else if (service.tabsManager) {
          tabsManager = service.tabsManager;
        }
        
        if (tabsManager) {
          const result = await tabsManager.getTabs();
          console.log('[browser:getTabs] Success, tabs count:', result?.tabs?.length || 0);
          return result;
        }
      }
      return { status: 'error', message: '标签页管理器不可用', tabs: [] };
    } catch (error) {
      console.error('[browser:getTabs] Error:', error.message);
      return { status: 'error', message: error.message, tabs: [] };
    }
  });

  ipcMain.handle('browser:closeTab', async (event, tabId) => {
    try {
      const service = serverManager?.getService?.();
      if (service) {
        const extensionServer = service.getExtensionWebSocketServer?.();
        if (extensionServer) {
          return await extensionServer.sendMessage({
            type: 'close_tab',
            tabId: tabId,
            requestId: `close_${tabId}_${Date.now()}`
          });
        }
      }
      return { status: 'error', message: '扩展服务器不可用' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  });

  ipcMain.handle('browser:openUrl', async (event, url, tabId) => {
    try {
      const service = serverManager?.getService?.();
      if (service) {
        const extensionServer = service.getExtensionWebSocketServer?.();
        if (extensionServer) {
          return await extensionServer.sendMessage({
            type: 'open_url',
            url: url,
            tabId: tabId,
            requestId: `open_${Date.now()}`
          });
        }
      }
      return { status: 'error', message: '扩展服务器不可用' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  });

  // ============ 视图控制 ============

  ipcMain.handle('view:refresh', () => {
    if (viewManager) {
      return viewManager.refresh();
    }
    return false;
  });

  ipcMain.handle('view:reload', () => {
    if (viewManager) {
      return viewManager.reload();
    }
    return false;
  });

  ipcMain.handle('view:openDevTools', () => {
    if (viewManager) {
      return viewManager.openDevTools();
    }
    return false;
  });

  ipcMain.handle('view:toggleDevTools', () => {
    if (viewManager) {
      return viewManager.toggleDevTools();
    }
    return false;
  });

  ipcMain.handle('view:getCurrentUrl', () => {
    if (viewManager) {
      return viewManager.getCurrentUrl();
    }
    return null;
  });

  // ============ 配置管理 ============

  ipcMain.handle('config:get', () => {
    return {
      server: serverManager ? serverManager.config : {},
      view: viewManager ? viewManager.config : {}
    };
  });

  ipcMain.handle('config:setServer', (event, config) => {
    if (serverManager) {
      serverManager.setConfig(config);
      return true;
    }
    return false;
  });

  ipcMain.handle('config:setView', (event, config) => {
    if (viewManager) {
      viewManager.setConfig(config);
      return true;
    }
    return false;
  });

  // ============ AI 相关 IPC 处理器（使用 HappyService） ============

  ipcMain.handle('ai:getStatus', () => {
    // 返回 HappyService 的状态
    const status = HappyService.getStatus();
    return {
      state: status.clientConnected ? 'connected' : 'disconnected',
      isConnected: status.clientConnected,
      initialized: status.initialized,
      eventStatus: status.eventStatus
    };
  });

  ipcMain.handle('ai:connect', async () => {
    try {
      // 使用当前 session 或默认 'main'
      const currentSession = HappyService.sessionManager?.getCurrentSessionName() || 'main';
      const result = await HappyService.connectToSession(currentSession);
      return {
        success: result.success,
        status: HappyService.getStatus(),
        error: result.error
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:disconnect', async () => {
    try {
      await HappyService.disconnectClient();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:sendMessage', async (event, text) => {
    try {
      const result = await HappyService.sendMessage(text);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:getMessages', (event, limit = 50) => {
    return HappyService.getMessages(limit);
  });

  ipcMain.handle('ai:clearMessages', () => {
    HappyService.clearMessages();
    return true;
  });

  ipcMain.handle('ai:restoreMessages', (event, messages) => {
    return HappyService.restoreMessages(messages);
  });

  ipcMain.handle('ai:getLatestUsage', () => {
    return HappyService.getLatestUsage();
  });

  // 保留旧的执行指令接口（使用 serverManager 的 AIAgent）
  ipcMain.handle('ai:executeInstruction', async (event, instruction, context = {}) => {
    try {
      if (serverManager) {
        const service = serverManager.getService();
        const aiAgent = service?.getAIAgent?.();
        if (aiAgent) {
          return await aiAgent.executeInstruction(instruction, context);
        }
      }
      return { success: false, error: 'AI Agent 未配置' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ai:getContext', async (event, type = 'full') => {
    try {
      if (serverManager) {
        const service = serverManager.getService();
        if (service) {
          const { ContextBuilder } = require('../server/ai');
          const contextBuilder = new ContextBuilder({ browserService: service });
          return await contextBuilder.build({ type });
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to get browser context:', error);
      return null;
    }
  });

  ipcMain.handle('ai:getSession', () => {
    try {
      const HappySessionLoader = require('../server/ai/HappySessionLoader');
      const sessionLoader = new HappySessionLoader();
      return {
        metadata: sessionLoader.getStateMetadata(),
        sessions: sessionLoader.getAllSessions(),
        activeSessions: sessionLoader.getActiveSessions()
      };
    } catch (error) {
      console.error('Failed to get Happy session:', error);
      return null;
    }
  });

  // ============ 权限操作 IPC 处理器 ============
  
  ipcMain.handle('ai:allowPermission', async (event, sessionId, permissionId, mode, allowedTools) => {
    try {
      return await HappyService.allowPermission(sessionId, permissionId, mode, allowedTools);
    } catch (error) {
      console.error('Failed to allow permission:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('ai:denyPermission', async (event, sessionId, permissionId) => {
    try {
      return await HappyService.denyPermission(sessionId, permissionId);
    } catch (error) {
      console.error('Failed to deny permission:', error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('ai:abort', async (event, sessionId) => {
    try {
      return await HappyService.abortSession(sessionId);
    } catch (error) {
      console.error('Failed to abort session:', error);
      return { success: false, error: error.message };
    }
  });

  // ============ Happy Service IPC 处理器 ============

  ipcMain.handle('happy:getStatus', () => {
    return HappyService.getStatus();
  });

  ipcMain.handle('happy:isInitialized', () => {
    return HappyService.isInitialized();
  });

  ipcMain.handle('happy:getSessionId', (event, name = 'main') => {
    return HappyService.getSessionId(name);
  });

  ipcMain.handle('happy:getAllSessions', () => {
    return HappyService.getAllSessions();
  });

  ipcMain.handle('happy:isDaemonRunning', async () => {
    return await HappyService.isDaemonRunning();
  });

  ipcMain.handle('happy:initialize', async () => {
    if (HappyService.isInitialized()) {
      return { success: true, alreadyInitialized: true };
    }
    return await initializeHappyService();
  });

  ipcMain.handle('happy:reinitialize', async () => {
    const config = require('../config');
    const happyConfig = config.happy || {};
    
    let stateDir = happyConfig.stateDir;
    if (!stateDir) {
      // 使用数据目录作为基础，自动处理 ASAR 打包兼容性
      const dataDir = getAppDataDir();
      stateDir = path.join(dataDir, 'happy-state');
    }
    
    console.log('[happy:reinitialize] State directory:', stateDir);
    
    return await HappyService.reinitialize({
      stateDir: stateDir,
      workDirs: happyConfig.workDirs || [{ name: 'main', path: process.cwd() }],
      baseDir: process.cwd(),
      monitorInterval: happyConfig.monitorInterval || 30000,
      autoMonitor: happyConfig.autoMonitor !== false
    });
  });

  ipcMain.handle('happy:reconnectSession', async (event, name) => {
    return await HappyService.reconnectSession(name);
  });

  // ============ Happy Service 设置 IPC 处理器 ============

  ipcMain.handle('happy:getSettings', () => {
    return {
      workspaceDir: userSettings.get('happy.workspaceDir'),
      defaultWorkspaceDir: userSettings.getDefaultWorkspaceDir(),
      currentWorkspaceDir: HappyService.getCurrentWorkDir(),
      autoMonitor: userSettings.get('happy.autoMonitor') !== false
    };
  });

  ipcMain.handle('happy:setSettings', async (event, settings) => {
    if (settings.autoMonitor !== undefined) {
      userSettings.set('happy.autoMonitor', settings.autoMonitor);
    }
    
    return { success: true };
  });

  ipcMain.handle('happy:selectWorkspaceDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择工作目录'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  });

  // 热切换工作目录
  ipcMain.handle('happy:switchWorkDir', async (event, newPath) => {
    if (!happyServiceInitialized) {
      return { success: false, error: 'HappyService not initialized' };
    }
    
    try {
      // 获取当前 anonId 用于账户变更检测
      let anonId = null;
      if (secureSettings.hasSecret('happy.secret')) {
        const secret = secureSettings.getSecret('happy.secret');
        if (secret) {
          const CryptoUtils = require('../lib/happy-client/utils/CryptoUtils');
          const KeyUtils = require('../lib/happy-client/utils/KeyUtils');
          
          try {
            const normalized = KeyUtils.normalizeSecretKey(secret);
            const secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
            const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
            anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
          } catch (e) {
            console.warn('Failed to derive anonId:', e.message);
          }
        }
      }
      
      // 执行热切换
      const result = await HappyService.switchWorkDir(newPath, anonId);
      
      if (result.success) {
        // 保存用户选择的目录
        userSettings.set('happy.workspaceDir', newPath);
        // 刷新文件管理器缓存，确保文件面板使用新目录
        fileManager.refreshWorkspaceDir();
      }
      
      return result;
    } catch (error) {
      console.error('Failed to switch work directory:', error);
      return { success: false, error: error.message };
    }
  });

  // 列出所有已映射的工作目录
  ipcMain.handle('happy:listWorkDirs', () => {
    return HappyService.listWorkDirs();
  });

  // 获取当前工作目录
  ipcMain.handle('happy:getCurrentWorkDir', () => {
    return HappyService.getCurrentWorkDir();
  });

  ipcMain.handle('happy:resetWorkspaceDir', async () => {
    // 重置为默认目录
    const defaultDir = userSettings.getDefaultWorkspaceDir();
    userSettings.set('happy.workspaceDir', null);
    // 刷新文件管理器缓存
    fileManager.refreshWorkspaceDir();
    
    // 热切换到默认目录
    if (happyServiceInitialized) {
      const result = await HappyService.switchWorkDir(defaultDir);
      return { success: result.success, error: result.error };
    }
    
    return { success: true };
  });

  // ============ 安全存储 IPC 处理器 ============

  ipcMain.handle('secure:setSecret', (event, key, value) => {
    try {
      secureSettings.setSecret(key, value);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('secure:hasSecret', (event, key) => {
    return secureSettings.hasSecret(key);
  });

  ipcMain.handle('secure:deleteSecret', (event, key) => {
    try {
      secureSettings.deleteSecret(key);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ============ Happy Secret 凭证同步函数 ============
  
  /**
   * 同步凭证到 ~/.happy/access.key 和 serverUrl 到 ~/.happy/settings.json
   * 使 daemon (happy-cli) 能够读取正确的凭证和服务器地址
   * 
   * @param {string} secretBase64url - base64url 编码的 secret
   * @param {string} token - JWT token
   * @param {string} serverUrl - 账号服务器地址
   * @param {boolean} clearMachineId - 是否清理 machineId（账号切换时需要）
   */
  function syncCredentialsToHappyDir(secretBase64url, token, serverUrl, clearMachineId = false) {
    // 跨平台获取 home 目录
    const happyHomeDir = path.join(os.homedir(), '.happy');
    const accessKeyPath = path.join(happyHomeDir, 'access.key');
    const settingsPath = path.join(happyHomeDir, 'settings.json');
    
    // 确保目录存在
    if (!fs.existsSync(happyHomeDir)) {
      fs.mkdirSync(happyHomeDir, { recursive: true });
    }
    
    // 转换：base64url → bytes → 标准 base64
    // happy-cli 使用标准 base64 存储 secret
    const secretBytes = Buffer.from(secretBase64url, 'base64url');
    const secretBase64 = secretBytes.toString('base64');
    
    // 写入凭证文件（格式与 happy-cli 的 writeCredentialsLegacy 一致，不包含 serverUrl）
    const credentials = {
      secret: secretBase64,
      token: token
    };
    
    fs.writeFileSync(accessKeyPath, JSON.stringify(credentials, null, 2), 'utf8');
    console.log('[syncCredentialsToHappyDir] Credentials synced to:', accessKeyPath);
    
    // 更新 settings.json：写入 serverUrl，可选清理 machineId
    const DEFAULT_SERVER_URL = 'https://api.deepseek-cowork.com';
    try {
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      
      // 写入 serverUrl（为空时使用默认服务器地址）
      settings.serverUrl = serverUrl || DEFAULT_SERVER_URL;
      console.log('[syncCredentialsToHappyDir] Setting serverUrl:', settings.serverUrl);
      
      // 如果需要清理 machineId（账号切换场景）
      if (clearMachineId && settings.machineId) {
        console.log('[syncCredentialsToHappyDir] Clearing old machineId:', settings.machineId);
        delete settings.machineId;
        delete settings.machineIdConfirmedByServer;
      }
      
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log('[syncCredentialsToHappyDir] settings.json updated');
    } catch (e) {
      console.warn('[syncCredentialsToHappyDir] Failed to update settings.json:', e.message);
    }
  }

  // ============ Happy Secret 管理 IPC 处理器 ============

  ipcMain.handle('happy:hasSecret', () => {
    return secureSettings.hasSecret('happy.secret');
  });

  ipcMain.handle('happy:generateSecret', () => {
    try {
      const SecretGenerator = require('../lib/happy-client/utils/SecretGenerator');
      const result = SecretGenerator.generateSecretWithFormats();
      return {
        success: true,
        formatted: result.formatted,
        base64url: result.base64url
      };
    } catch (error) {
      console.error('Failed to generate secret:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('happy:validateSecret', (event, input) => {
    try {
      const SecretGenerator = require('../lib/happy-client/utils/SecretGenerator');
      return SecretGenerator.validateSecretFormat(input);
    } catch (error) {
      return { valid: false, normalized: null, error: error.message };
    }
  });

  ipcMain.handle('happy:verifySecret', async (event, secret) => {
    try {
      const SecretGenerator = require('../lib/happy-client/utils/SecretGenerator');
      const Auth = require('../lib/happy-client/core/Auth');
      
      // 验证格式
      const validation = SecretGenerator.validateSecretFormat(secret);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      
      // 尝试获取 Token 验证 Secret 有效性
      const auth = new Auth();
      const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
      const masterSecret = Buffer.from(validation.normalized, 'base64url');
      
      try {
        const token = await auth.getToken(masterSecret, serverUrl);
        if (token) {
          // 返回 token 以便后续同步到 ~/.happy/access.key
          return { success: true, normalized: validation.normalized, token: token };
        }
        return { success: false, error: '无法获取 Token，请检查 Secret 是否正确' };
      } catch (authError) {
        console.error('Auth error:', authError.message);
        return { success: false, error: authError.message };
      }
    } catch (error) {
      console.error('Failed to verify secret:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('happy:saveSecret', async (event, secret, providedToken = null) => {
    console.log('[happy:saveSecret] Called, providedToken:', !!providedToken);
    try {
      const SecretGenerator = require('../lib/happy-client/utils/SecretGenerator');
      
      // 验证格式
      console.log('[happy:saveSecret] Validating secret format...');
      const validation = SecretGenerator.validateSecretFormat(secret);
      if (!validation.valid) {
        console.log('[happy:saveSecret] Validation failed:', validation.error);
        return { success: false, error: validation.error };
      }
      console.log('[happy:saveSecret] Validation passed');
      
      // 检查是否是账户切换（已有不同的 secret）
      let isAccountSwitching = false;
      const hasExistingSecret = secureSettings.hasSecret('happy.secret');
      if (hasExistingSecret) {
        const existingSecret = secureSettings.getSecret('happy.secret');
        if (existingSecret !== validation.normalized) {
          // 账户切换场景：预先清理旧状态以防止重启时连接到旧 session
          isAccountSwitching = true;
          console.log('[saveSecret] Account switching detected, clearing old state...');
          
          // 断开现有连接
          if (happyServiceInitialized) {
            try {
              await HappyService.disconnectClient();
            } catch (e) {
              console.warn('[saveSecret] Failed to disconnect client:', e.message);
            }
          }
          
          // 标记账户变更，确保下次初始化时清理 daemon sessions
          if (HappyService.sessionManager) {
            HappyService.sessionManager._accountChanged = true;
            HappyService.sessionManager.removeStateFile();
            HappyService.sessionManager.clearSessions();
            console.log('[saveSecret] Session state marked for cleanup');
          }
          
          // 清除消息历史
          try {
            HappyService.clearMessages();
          } catch (e) {
            console.warn('[saveSecret] Failed to clear messages:', e.message);
          }
        }
      } else {
        // 首次设置账号也需要清理 machineId（可能是旧账号遗留的）
        isAccountSwitching = true;
      }
      
      // 保存标准化后的 Secret
      console.log('[happy:saveSecret] Saving secret to secure storage...');
      secureSettings.setSecret('happy.secret', validation.normalized);
      console.log('[happy:saveSecret] Secret saved');
      
      // 同步凭证到 ~/.happy/access.key（使 daemon 能正确认证）
      let token = providedToken;
      if (!token) {
        // 如果没有提供 token，需要重新获取
        console.log('[happy:saveSecret] No token provided, fetching from server...');
        try {
          const Auth = require('../lib/happy-client/core/Auth');
          const auth = new Auth();
          const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
          console.log('[happy:saveSecret] Server URL:', serverUrl);
          const masterSecret = Buffer.from(validation.normalized, 'base64url');
          token = await auth.getToken(masterSecret, serverUrl);
          console.log('[happy:saveSecret] Token fetched:', !!token);
        } catch (e) {
          console.warn('[saveSecret] Failed to get token for sync:', e.message);
        }
      } else {
        console.log('[happy:saveSecret] Using provided token');
      }
      
      if (token) {
        console.log('[happy:saveSecret] Syncing credentials to ~/.happy/access.key...');
        try {
          // 获取当前服务器地址
          const serverUrl = userSettings.get('happy.serverUrl') || null;
          // 账号切换或首次设置时清理旧的 machineId
          syncCredentialsToHappyDir(validation.normalized, token, serverUrl, isAccountSwitching);
          console.log('[happy:saveSecret] Credentials synced');
        } catch (e) {
          console.warn('[saveSecret] Failed to sync credentials to ~/.happy/access.key:', e.message);
        }
      } else {
        console.warn('[saveSecret] No token available, credentials not synced to ~/.happy/access.key');
      }
      
      console.log('[happy:saveSecret] isAccountSwitching:', isAccountSwitching, 'hasExistingSecret:', hasExistingSecret, 'happyServiceInitialized:', happyServiceInitialized);
      
      // 热切换：如果是账号切换且 HappyService 已初始化，尝试重启 Daemon 而非整个应用
      if (isAccountSwitching && hasExistingSecret && happyServiceInitialized) {
        console.log('[saveSecret] Attempting hot account switch via daemon restart...');
        try {
          // 计算新账户的 anonId
          let newAnonId = null;
          try {
            const CryptoUtils = require('../lib/happy-client/utils/CryptoUtils');
            const KeyUtils = require('../lib/happy-client/utils/KeyUtils');
            const normalized = KeyUtils.normalizeSecretKey(validation.normalized);
            const secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
            const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
            newAnonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
            console.log('[saveSecret] Computed new anonId:', newAnonId);
          } catch (e) {
            console.warn('[saveSecret] Failed to derive anonId:', e.message);
          }
          
          // 传入新的 secret 配置和 anonId，确保 HappyClient 使用新账户
          const newOptions = {
            happySecret: validation.normalized,
            serverUrl: userSettings.get('happy.serverUrl') || undefined,
            anonId: newAnonId
          };
          const restartResult = await HappyService.restartDaemon(newOptions);
          if (restartResult.success) {
            console.log('[saveSecret] Hot account switch successful, reconnecting HappyClient...');
            // 重新连接 HappyClient（等待连接完成，确保消息功能可用）
            try {
              const connectResult = await connectHappyClient('main');
              if (!connectResult.success) {
                console.warn('[saveSecret] HappyClient reconnection failed:', connectResult.error);
              }
            } catch (err) {
              console.error('[saveSecret] HappyClient reconnection error:', err.message);
            }
            return { success: true, needsRestart: false, hotSwitched: true };
          } else {
            // Daemon 重启失败，尝试完整重新初始化
            console.warn('[saveSecret] Daemon restart failed, trying full reinitialization:', restartResult.error);
            const reinitResult = await tryReinitializeHappyService();
            if (reinitResult.success) {
              console.log('[saveSecret] Full reinitialization successful');
              return { success: true, needsRestart: false, hotSwitched: true };
            } else {
              console.warn('[saveSecret] Full reinitialization failed, fallback to app restart:', reinitResult.error);
              return { success: true, needsRestart: true, error: reinitResult.error };
            }
          }
        } catch (e) {
          // 重启失败，尝试完整重新初始化
          console.warn('[saveSecret] Hot switch failed, trying full reinitialization:', e.message);
          try {
            const reinitResult = await tryReinitializeHappyService();
            if (reinitResult.success) {
              console.log('[saveSecret] Full reinitialization successful after error');
              return { success: true, needsRestart: false, hotSwitched: true };
            } else {
              console.warn('[saveSecret] Full reinitialization failed, fallback to app restart:', reinitResult.error);
              return { success: true, needsRestart: true, error: reinitResult.error };
            }
          } catch (reinitError) {
            console.warn('[saveSecret] Full reinitialization error, fallback to app restart:', reinitError.message);
            return { success: true, needsRestart: true, error: reinitError.message };
          }
        }
      }
      
      // 首次登录热初始化：如果 HappyService 未初始化，尝试立即初始化
      if (!happyServiceInitialized) {
        console.log('[saveSecret] First login detected, attempting hot initialization...');
        try {
          const initResult = await initializeHappyService();
          if (initResult && initResult.success) {
            console.log('[saveSecret] Hot initialization successful');
            // 发送初始化成功事件到渲染进程
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('happy:initialized', {
                success: true,
                daemon: initResult.daemon,
                sessions: initResult.sessions
              });
            }
            return { success: true, needsRestart: false, hotInitialized: true };
          } else {
            console.warn('[saveSecret] Hot initialization failed:', initResult?.error);
            return { success: true, needsRestart: true, error: initResult?.error || 'Initialization failed' };
          }
        } catch (e) {
          console.warn('[saveSecret] Hot initialization error:', e.message);
          return { success: true, needsRestart: true, error: e.message };
        }
      }
      
      // HappyService 已初始化，无需额外操作
      return { success: true, needsRestart: false };
    } catch (error) {
      console.error('Failed to save secret:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('happy:getAccountInfo', async () => {
    try {
      const hasSecret = secureSettings.hasSecret('happy.secret');
      const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
      
      // 获取 HappyService 状态
      const serviceStatus = HappyService.getStatus();
      
      // 如果有 Secret，生成匿名 ID（参考 Happy 项目的 anonID 实现）
      let anonId = null;
      if (hasSecret) {
        try {
          const secret = secureSettings.getSecret('happy.secret');
          if (secret) {
            const CryptoUtils = require('../lib/happy-client/utils/CryptoUtils');
            const KeyUtils = require('../lib/happy-client/utils/KeyUtils');
            
            // 标准化 secret 并获取字节数组
            let secretBytes;
            try {
              const normalized = KeyUtils.normalizeSecretKey(secret);
              secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
            } catch (e) {
              secretBytes = Buffer.from(CryptoUtils.decodeBase64(secret, 'base64url'));
            }
            
            // 派生匿名 ID：deriveKey(masterSecret, 'Happy Coder', ['analytics', 'id'])
            // 然后取前 16 个 hex 字符
            const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
            anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
          }
        } catch (e) {
          console.error('Failed to derive anon ID:', e);
        }
      }
      
      return {
        hasSecret,
        isConnected: serviceStatus.clientConnected || false,
        anonId,
        serverUrl,
        sessionId: serviceStatus.currentSessionId || null,
        eventStatus: serviceStatus.eventStatus || 'idle'
      };
    } catch (error) {
      console.error('Failed to get account info:', error);
      return {
        hasSecret: false,
        isConnected: false,
        anonId: null,
        serverUrl: 'https://api.deepseek-cowork.com',
        sessionId: null,
        eventStatus: 'idle'
      };
    }
  });

  ipcMain.handle('happy:getFormattedSecret', () => {
    try {
      if (!secureSettings.hasSecret('happy.secret')) {
        return { success: false, error: '未配置 Secret' };
      }
      
      const secret = secureSettings.getSecret('happy.secret');
      if (!secret) {
        return { success: false, error: '无法读取 Secret' };
      }
      
      console.log('[getFormattedSecret] Secret type:', typeof secret, 'length:', secret.length);
      
      const SecretGenerator = require('../lib/happy-client/utils/SecretGenerator');
      const KeyUtils = require('../lib/happy-client/utils/KeyUtils');
      const CryptoUtils = require('../lib/happy-client/utils/CryptoUtils');
      
      let secretBytes;
      
      // 尝试多种解码方式
      // 1. 先尝试 base64url 解码
      try {
        secretBytes = Buffer.from(CryptoUtils.decodeBase64(secret, 'base64url'));
        console.log('[getFormattedSecret] Decoded as base64url, bytes length:', secretBytes.length);
        
        if (secretBytes.length === 32) {
          // 成功解码为 32 字节
          const formatted = SecretGenerator.formatSecretForBackup(secretBytes);
          return { success: true, formatted };
        }
      } catch (e) {
        console.log('[getFormattedSecret] Not base64url format, trying other formats...');
      }
      
      // 2. 尝试使用 KeyUtils.normalizeSecretKey 来标准化
      try {
        const normalized = KeyUtils.normalizeSecretKey(secret);
        secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
        console.log('[getFormattedSecret] Normalized and decoded, bytes length:', secretBytes.length);
        
        if (secretBytes.length === 32) {
          const formatted = SecretGenerator.formatSecretForBackup(secretBytes);
          return { success: true, formatted };
        }
      } catch (e) {
        console.log('[getFormattedSecret] Normalization failed:', e.message);
      }
      
      // 3. 如果都失败，返回错误
      return { success: false, error: 'Secret 格式无效，请重新配置账户' };
    } catch (error) {
      console.error('Failed to get formatted secret:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('happy:logout', async () => {
    try {
      // 1. 断开 HappyClient 连接
      if (happyServiceInitialized) {
        try {
          await HappyService.disconnectClient();
        } catch (e) {
          console.warn('Failed to disconnect HappyClient:', e.message);
        }
        
        // 2. 清除 Session 状态文件和内存状态
        try {
          if (HappyService.sessionManager) {
            HappyService.sessionManager.removeStateFile();
            HappyService.sessionManager.clearSessions();
            console.log('[logout] Session state cleared');
          }
        } catch (e) {
          console.warn('Failed to clear session state:', e.message);
        }
        
        // 3. 清除消息历史缓存
        try {
          HappyService.clearMessages();
          console.log('[logout] Message history cleared');
        } catch (e) {
          console.warn('Failed to clear messages:', e.message);
        }
      }
      
      // 4. 删除 Secret
      secureSettings.deleteSecret('happy.secret');
      console.log('[logout] Secret deleted');
      
      // 5. 停止 Daemon 清理历史 session
      try {
        if (HappyService.daemonManager) {
          await HappyService.daemonManager.stopDaemon();
          console.log('[logout] Daemon stopped');
        }
      } catch (e) {
        console.warn('Failed to stop daemon:', e.message);
      }
      
      // 6. 删除 ~/.happy/access.key（清理凭证文件）
      try {
        const accessKeyPath = path.join(os.homedir(), '.happy', 'access.key');
        if (fs.existsSync(accessKeyPath)) {
          fs.unlinkSync(accessKeyPath);
          console.log('[logout] access.key deleted');
        }
      } catch (e) {
        console.warn('Failed to delete access.key:', e.message);
      }
      
      // 6.5. 清理 ~/.happy/settings.json 中的 machineId（防止新账号复用旧 machineId）
      try {
        const settingsPath = path.join(os.homedir(), '.happy', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (settings.machineId) {
            delete settings.machineId;
            delete settings.machineIdConfirmedByServer;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            console.log('[logout] machineId cleared from settings.json');
          }
        }
      } catch (e) {
        console.warn('Failed to clear machineId:', e.message);
      }
      
      // 7. 重置 HappyService 内部状态
      HappyService.reset();
      console.log('[logout] HappyService reset');
      
      // 8. 重置初始化标志
      happyServiceInitialized = false;
      
      return { success: true, needsRestart: true };
    } catch (error) {
      console.error('Failed to logout:', error);
      return { success: false, error: error.message };
    }
  });

  // 修改服务器地址
  ipcMain.handle('happy:changeServer', async (event, newServerUrl) => {
    try {
      console.log('[changeServer] Changing server to:', newServerUrl || '(default)');
      
      // 1. 断开 HappyClient 连接
      if (happyServiceInitialized) {
        try {
          await HappyService.disconnectClient();
          console.log('[changeServer] HappyClient disconnected');
        } catch (e) {
          console.warn('Failed to disconnect HappyClient:', e.message);
        }
        
        // 2. 清除 Session 状态文件和内存状态
        try {
          if (HappyService.sessionManager) {
            HappyService.sessionManager.removeStateFile();
            HappyService.sessionManager.clearSessions();
            console.log('[changeServer] Session state cleared');
          }
        } catch (e) {
          console.warn('Failed to clear session state:', e.message);
        }
        
        // 3. 清除消息历史缓存
        try {
          HappyService.clearMessages();
          console.log('[changeServer] Message history cleared');
        } catch (e) {
          console.warn('Failed to clear messages:', e.message);
        }
      }
      
      // 4. 删除 Secret
      secureSettings.deleteSecret('happy.secret');
      console.log('[changeServer] Secret deleted');
      
      // 5. 停止 Daemon 清理历史 session
      try {
        if (HappyService.daemonManager) {
          await HappyService.daemonManager.stopDaemon();
          console.log('[changeServer] Daemon stopped');
        }
      } catch (e) {
        console.warn('Failed to stop daemon:', e.message);
      }
      
      // 6. 删除 ~/.happy/access.key（旧 token 属于旧服务器，需要清理）
      try {
        const accessKeyPath = path.join(os.homedir(), '.happy', 'access.key');
        if (fs.existsSync(accessKeyPath)) {
          fs.unlinkSync(accessKeyPath);
          console.log('[changeServer] access.key deleted');
        }
      } catch (e) {
        console.warn('Failed to delete access.key:', e.message);
      }
      
      // 6.5. 清理 ~/.happy/settings.json 中的 machineId（切换服务器后旧 machineId 无效）
      try {
        const settingsPath = path.join(os.homedir(), '.happy', 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (settings.machineId) {
            delete settings.machineId;
            delete settings.machineIdConfirmedByServer;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            console.log('[changeServer] machineId cleared from settings.json');
          }
        }
      } catch (e) {
        console.warn('Failed to clear machineId:', e.message);
      }
      
      // 7. 重置 HappyService 内部状态
      HappyService.reset();
      console.log('[changeServer] HappyService reset');
      
      // 8. 保存新服务器地址
      userSettings.set('happy.serverUrl', newServerUrl || null);
      console.log('[changeServer] Server URL saved:', newServerUrl || '(default)');
      
      // 9. 重置 HappyService 初始化状态
      happyServiceInitialized = false;
      
      return { success: true };
    } catch (error) {
      console.error('Failed to change server:', error);
      return { success: false, error: error.message };
    }
  });

  // ============ Happy AI 设置 IPC 处理器 ============

  ipcMain.handle('happy:getAllSettings', () => {
    return {
      hasSecret: secureSettings.hasSecret('happy.secret'),
      permissionMode: userSettings.get('happy.permissionMode') || 'default',
      serverUrl: userSettings.get('happy.serverUrl'),
      workspaceDir: userSettings.get('happy.workspaceDir'),
      defaultWorkspaceDir: userSettings.getDefaultWorkspaceDir(),
      currentWorkDir: HappyService.getCurrentWorkDir(),
      workDirs: HappyService.listWorkDirs(),
      autoMonitor: userSettings.get('happy.autoMonitor') !== false
    };
  });

  ipcMain.handle('happy:saveSettings', (event, settings) => {
    // 保存非敏感设置
    if (settings.permissionMode !== undefined) {
      const oldValue = userSettings.get('happy.permissionMode');
      if (oldValue !== settings.permissionMode) {
        userSettings.set('happy.permissionMode', settings.permissionMode);
        
        // 热切换：直接更新 HappyService 的权限模式，无需重启
        if (happyServiceInitialized) {
          const result = HappyService.setPermissionMode(settings.permissionMode);
          if (result.success) {
            console.log('[saveSettings] Permission mode hot-switched to:', settings.permissionMode);
          } else {
            console.warn('[saveSettings] Permission mode hot-switch failed:', result.error);
          }
        }
      }
    }
    
    // permissionMode 现在支持热切换，不再需要重启
    return { success: true, needsRestart: false };
  });

  // ============ 应用控制 IPC 处理器 ============

  ipcMain.handle('app:getVersion', () => {
    const packageJson = require('../package.json');
    return {
      version: packageJson.version,
      name: packageJson.name,
      description: packageJson.description
    };
  });

  ipcMain.handle('app:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  // ============ 自动更新 IPC 处理器 ============

  ipcMain.handle('updater:checkForUpdates', async () => {
    if (!updateManager) {
      return { success: false, error: 'UpdateManager not initialized' };
    }
    return await updateManager.checkForUpdates();
  });

  ipcMain.handle('updater:downloadUpdate', async () => {
    if (!updateManager) {
      return { success: false, error: 'UpdateManager not initialized' };
    }
    return await updateManager.downloadUpdate();
  });

  ipcMain.handle('updater:getStatus', () => {
    if (!updateManager) {
      return { status: 'idle', error: 'UpdateManager not initialized' };
    }
    return updateManager.getStatus();
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    if (!updateManager) {
      return { success: false, error: 'UpdateManager not initialized' };
    }
    return updateManager.quitAndInstall();
  });

  // ============ 依赖检查 IPC 处理器 ============

  ipcMain.handle('deps:getStatus', () => {
    return dependencyStatus || dependencyChecker.checkAllDependencies();
  });

  ipcMain.handle('deps:checkAll', async () => {
    dependencyStatus = dependencyChecker.checkAllDependencies();
    return dependencyStatus;
  });

  ipcMain.handle('deps:checkNodeJs', () => {
    return dependencyChecker.checkNodeJs();
  });

  ipcMain.handle('deps:checkHappyCoder', () => {
    return dependencyChecker.checkHappyCoder();
  });

  ipcMain.handle('deps:checkClaudeCode', () => {
    return dependencyChecker.checkClaudeCode();
  });

  ipcMain.handle('deps:installHappyCoder', async () => {
    const result = await dependencyChecker.installHappyCoder();
    if (result.success) {
      // 更新缓存
      dependencyStatus = dependencyChecker.checkAllDependencies();
    }
    return result;
  });

  ipcMain.handle('deps:getInstallGuide', (event, component) => {
    return dependencyChecker.getInstallGuide(component);
  });

  ipcMain.handle('deps:openNodeJsWebsite', () => {
    const { shell } = require('electron');
    shell.openExternal('https://nodejs.org/');
    return true;
  });

  ipcMain.handle('deps:openClaudeCodeDocs', () => {
    const { shell } = require('electron');
    shell.openExternal('https://claude.ai/code');
    return true;
  });

  // ============ 设置向导 IPC 处理器 ============

  ipcMain.handle('setup:getRequirements', () => {
    return dependencyChecker.getSetupRequirements(secureSettings);
  });

  ipcMain.handle('setup:recheck', () => {
    // 重新检测环境
    dependencyStatus = dependencyChecker.checkAllDependencies();
    return dependencyChecker.getSetupRequirements(secureSettings);
  });

  ipcMain.handle('setup:complete', () => {
    // 标记向导已完成
    userSettings.set('setupWizard.completed', true);
    userSettings.set('setupWizard.completedAt', new Date().toISOString());
    return { success: true };
  });

  ipcMain.handle('setup:skip', () => {
    // 记录跳过时间，7天后再次提醒
    userSettings.set('setupWizard.skippedAt', new Date().toISOString());
    return { success: true };
  });

  ipcMain.handle('setup:shouldShow', () => {
    // 判断是否应该显示设置向导
    const requirements = dependencyChecker.getSetupRequirements(secureSettings);
    
    // 如果环境已就绪，不显示
    if (requirements.ready) {
      return { shouldShow: false, reason: 'ready' };
    }
    
    // 如果已完成向导，不显示
    if (userSettings.get('setupWizard.completed')) {
      return { shouldShow: false, reason: 'completed' };
    }
    
    // 检查跳过时间
    const skippedAt = userSettings.get('setupWizard.skippedAt');
    if (skippedAt) {
      const skipDate = new Date(skippedAt);
      const now = new Date();
      const daysSinceSkip = (now - skipDate) / (1000 * 60 * 60 * 24);
      
      // 7天内跳过过，不显示
      if (daysSinceSkip < 7) {
        return { shouldShow: false, reason: 'skipped', daysRemaining: Math.ceil(7 - daysSinceSkip) };
      }
    }
    
    // 需要显示向导
    return { shouldShow: true, requirements };
  });

  ipcMain.handle('setup:resetWizard', () => {
    // 重置向导状态（用于从设置页重新运行向导）
    userSettings.set('setupWizard.completed', false);
    userSettings.set('setupWizard.skippedAt', null);
    return { success: true };
  });

  ipcMain.handle('setup:getPlatform', () => {
    return process.platform;
  });

  // ============ Claude Code 配置 IPC 处理器 ============

  ipcMain.handle('claude:getSettings', () => {
    const claudeCodeSettings = userSettings.get('happy.claudeCode') || {};
    const hasAuthToken = secureSettings.hasSecret('claude.authToken');
    
    return {
      ...claudeCodeSettings,
      hasAuthToken
    };
  });

  ipcMain.handle('claude:saveSettings', async (event, settings) => {
    try {
      // 保存到 userSettings
      const { authToken, ...otherSettings } = settings;

      // 更新各个设置项
      if (otherSettings.provider !== undefined) {
        userSettings.set('happy.claudeCode.provider', otherSettings.provider);
      }
      if (otherSettings.baseUrl !== undefined) {
        userSettings.set('happy.claudeCode.baseUrl', otherSettings.baseUrl || null);
      }
      if (otherSettings.model !== undefined) {
        userSettings.set('happy.claudeCode.model', otherSettings.model || null);
      }
      if (otherSettings.smallFastModel !== undefined) {
        userSettings.set('happy.claudeCode.smallFastModel', otherSettings.smallFastModel || null);
      }
      if (otherSettings.timeoutMs !== undefined) {
        userSettings.set('happy.claudeCode.timeoutMs', otherSettings.timeoutMs);
      }
      if (otherSettings.disableNonessential !== undefined) {
        userSettings.set('happy.claudeCode.disableNonessential', otherSettings.disableNonessential);
      }

      // 保存 Auth Token（如果提供）
      if (authToken !== undefined) {
        if (authToken) {
          secureSettings.setSecret('claude.authToken', authToken);
        } else {
          secureSettings.deleteSecret('claude.authToken');
        }
      }

      // 如果配置了非官方 Anthropic 提供商，自动重启 daemon 使配置生效
      let daemonRestarted = false;
      const provider = otherSettings.provider || userSettings.get('happy.claudeCode.provider');
      if (provider && provider !== 'anthropic' && happyServiceInitialized) {
        console.log('Claude Code config changed, restarting daemon...');
        try {
          const restartResult = await HappyService.restartDaemon();
          daemonRestarted = restartResult.success;
          if (daemonRestarted) {
            console.log('Daemon restarted successfully, new config applied');
          } else {
            console.warn('Daemon restart failed:', restartResult.error);
          }
        } catch (restartError) {
          console.error('Error restarting daemon:', restartError);
        }
      }

      return { success: true, needsRestart: !daemonRestarted, daemonRestarted };
    } catch (error) {
      console.error('Failed to save Claude Code settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('claude:getProviderPresets', () => {
    return userSettings.getAllClaudeCodePresets();
  });

  // ============ Daemon 管理 IPC 处理器 ============

  ipcMain.handle('daemon:start', async () => {
    if (!happyServiceInitialized || !HappyService.daemonManager) {
      return { success: false, error: 'Happy Service not initialized' };
    }
    
    try {
      console.log('IPC: daemon:start - Starting daemon...');
      const started = await HappyService.daemonManager.startDaemon();
      const status = HappyService.daemonManager.getStatus();
      console.log('IPC: daemon:start - Result:', started, status);
      
      // 启动成功后创建 session（daemon 刚启动，是冷启动场景）
      let sessions = {};
      if (started && HappyService.sessionManager) {
        console.log('IPC: daemon:start - Creating sessions (cold start)...');
        sessions = await HappyService.sessionManager.createAllSessions({ wasDaemonRunning: false });
        console.log('IPC: daemon:start - Sessions:', Object.keys(sessions));
      }
      
      // 通知渲染进程状态变化
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('daemon:statusChanged', status);
      }
      
      return { success: started, status, sessions };
    } catch (error) {
      console.error('IPC: daemon:start - Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('daemon:stop', async () => {
    if (!happyServiceInitialized || !HappyService.daemonManager) {
      return { success: false, error: 'Happy Service not initialized' };
    }
    
    try {
      console.log('IPC: daemon:stop - Stopping daemon...');
      const stopped = await HappyService.daemonManager.stopDaemon();
      const status = HappyService.daemonManager.getStatus();
      console.log('IPC: daemon:stop - Result:', stopped, status);
      
      // 停止成功后清理本地状态
      if (stopped) {
        console.log('IPC: daemon:stop - Cleaning up local state...');
        await HappyService.onDaemonStopped();
      }
      
      // 通知渲染进程状态变化
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('daemon:statusChanged', status);
      }
      
      return { success: stopped, status };
    } catch (error) {
      console.error('IPC: daemon:stop - Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('daemon:restart', async () => {
    if (!happyServiceInitialized) {
      return { success: false, error: 'Happy Service not initialized' };
    }
    
    try {
      console.log('IPC: daemon:restart - Restarting daemon...');
      const result = await HappyService.restartDaemon();
      console.log('IPC: daemon:restart - Result:', result);
      
      // 通知渲染进程状态变化
      if (result.success && mainWindow && !mainWindow.isDestroyed()) {
        const status = HappyService.daemonManager?.getStatus();
        if (status) {
          mainWindow.webContents.send('daemon:statusChanged', status);
        }
      }
      
      return result;
    } catch (error) {
      console.error('IPC: daemon:restart - Error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('daemon:getStatus', () => {
    if (!happyServiceInitialized || !HappyService.daemonManager) {
      return { running: false, error: 'Happy Service not initialized' };
    }
    return HappyService.daemonManager.getStatus();
  });

  // ============ 窗口控制 IPC 处理器 ============

  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  // ============ 文件系统 IPC 处理器 ============

  ipcMain.handle('fs:getWorkspaceRoot', () => {
    try {
      return {
        success: true,
        path: fileManager.getWorkspaceRoot()
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fs:listDirectory', async (event, dirPath) => {
    return await fileManager.listDirectory(dirPath);
  });

  ipcMain.handle('fs:createFolder', async (event, folderPath) => {
    return await fileManager.createFolder(folderPath);
  });

  ipcMain.handle('fs:deleteItem', async (event, itemPath, skipConfirm = false) => {
    // 如果不跳过确认，显示确认对话框
    if (!skipConfirm && mainWindow && !mainWindow.isDestroyed()) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['取消', '删除'],
        defaultId: 0,
        cancelId: 0,
        title: '确认删除',
        message: '确定要删除此项目吗？',
        detail: `路径: ${itemPath}\n\n此操作无法撤销。`
      });
      
      if (result.response === 0) {
        return { success: false, cancelled: true };
      }
    }
    
    return await fileManager.deleteItem(itemPath);
  });

  ipcMain.handle('fs:renameItem', async (event, oldPath, newPath) => {
    return await fileManager.renameItem(oldPath, newPath);
  });

  ipcMain.handle('fs:openFile', async (event, filePath) => {
    return await fileManager.openWithSystem(filePath);
  });

  ipcMain.handle('fs:showInExplorer', (event, filePath) => {
    return fileManager.showInExplorer(filePath);
  });

  ipcMain.handle('fs:getItemInfo', async (event, itemPath) => {
    return await fileManager.getItemInfo(itemPath);
  });

  ipcMain.handle('fs:copyItem', async (event, sourcePath, destPath) => {
    return await fileManager.copyItem(sourcePath, destPath);
  });

  ipcMain.handle('fs:moveItem', async (event, sourcePath, destPath) => {
    return await fileManager.moveItem(sourcePath, destPath);
  });

  ipcMain.handle('fs:refreshWorkspaceDir', () => {
    fileManager.refreshWorkspaceDir();
    return { success: true };
  });

  // ============ 文件内容读写 IPC 处理器（用于文件预览/编辑）============

  ipcMain.handle('fs:readFileContent', async (event, filePath) => {
    try {
      const resolvedPath = fileManager._validatePath(filePath);
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      return {
        success: true,
        path: filePath,
        content: content
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  });

  ipcMain.handle('fs:readFileBinary', async (event, filePath) => {
    try {
      const resolvedPath = fileManager._validatePath(filePath);
      const stats = await fs.promises.stat(resolvedPath);
      
      // 限制文件大小（50MB）
      if (stats.size > 50 * 1024 * 1024) {
        return {
          success: false,
          error: '文件太大（最大 50MB）'
        };
      }
      
      const buffer = await fs.promises.readFile(resolvedPath);
      // 返回 Uint8Array，Electron IPC 会自动序列化
      return {
        success: true,
        path: filePath,
        data: new Uint8Array(buffer),
        size: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  });

  ipcMain.handle('fs:saveFileContent', async (event, filePath, content) => {
    try {
      const resolvedPath = fileManager._validatePath(filePath);
      
      // 确保目录存在
      const dirPath = path.dirname(resolvedPath);
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
      
      await fs.promises.writeFile(resolvedPath, content, 'utf8');
      return {
        success: true,
        path: filePath,
        message: '文件已保存'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  });

  console.log('IPC handlers configured');
}

/**
 * 初始化 Happy Service（异步，不阻塞主流程）
 */
async function initializeHappyService() {
  try {
    console.log('Initializing Happy Service...');

    // 获取配置
    const config = require('../config');
    const happyConfig = config.happy || {};

    // 如果配置中禁用了 happy service，则跳过
    if (happyConfig.enabled === false) {
      console.log('Happy Service is disabled in config, skipping');
      return;
    }

    // 确定状态文件目录（使用辅助函数兼容打包环境）
    let stateDir = happyConfig.stateDir;
    if (!stateDir) {
      // 使用数据目录作为基础，自动处理 ASAR 打包兼容性
      const dataDir = getAppDataDir();
      stateDir = path.join(dataDir, 'happy-state');
    }
    
    // 确保状态目录存在
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
      console.log('Created state directory:', stateDir);
    }
    
    console.log('State directory:', stateDir);

    // 确定工作目录（优先使用用户设置，否则使用默认的 userData/workspace）
    const defaultWorkspace = userSettings.getDefaultWorkspaceDir();
    const customWorkspace = userSettings.get('happy.workspaceDir');
    const workspaceDir = customWorkspace || defaultWorkspace;
    
    // 确保工作目录存在
    if (workspaceDir && !fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
      console.log('Created workspace directory:', workspaceDir);
    }
    
    // 固定使用 'main' 作为默认 session 名称
    const workDirs = [{ name: 'main', path: workspaceDir }];

    console.log('Workspace directory:', workspaceDir);

    // 读取加密的 secret
    const happySecret = secureSettings.hasSecret('happy.secret') 
        ? secureSettings.getSecret('happy.secret') 
        : null;
    
    // 读取其他 Happy AI 配置
    const permissionMode = userSettings.get('happy.permissionMode') || 'default';
    const serverUrl = userSettings.get('happy.serverUrl');
    const debug = userSettings.get('happy.debug') || false;
    
    console.log('Happy AI config:');
    console.log('  Secret configured:', happySecret ? 'Yes' : 'No');
    console.log('  Permission mode:', permissionMode);
    console.log('  Server URL:', serverUrl || '(default)');
    console.log('  Debug mode:', debug);

    // 设置 Claude Code 环境变量获取器
    HappyService.setClaudeCodeEnvGetter(() => {
      const claudeConfig = userSettings.get('happy.claudeCode') || {};
      const provider = claudeConfig.provider || 'anthropic';
      
      // 构建环境变量
      const env = {};
      
      // 始终注入 Happy Server URL（账号服务器地址），不依赖于 Claude Code 提供商
      const happyServerUrl = userSettings.get('happy.serverUrl');
      if (happyServerUrl) {
        env.HAPPY_SERVER_URL = happyServerUrl;
      }
      
      // 如果是官方 Anthropic，只返回 Happy Server URL 相关配置
      if (provider === 'anthropic') {
        // 如果没有任何环境变量需要注入，返回 null
        return Object.keys(env).length > 0 ? env : null;
      }
      
      if (claudeConfig.baseUrl) {
        env.ANTHROPIC_BASE_URL = claudeConfig.baseUrl;
      }
      
      // 从安全存储获取 Auth Token
      if (secureSettings.hasSecret('claude.authToken')) {
        env.ANTHROPIC_AUTH_TOKEN = secureSettings.getSecret('claude.authToken');
      }
      
      if (claudeConfig.model) {
        env.ANTHROPIC_MODEL = claudeConfig.model;
      }
      
      if (claudeConfig.smallFastModel) {
        env.ANTHROPIC_SMALL_FAST_MODEL = claudeConfig.smallFastModel;
      }
      
      if (claudeConfig.timeoutMs) {
        env.API_TIMEOUT_MS = claudeConfig.timeoutMs;
      }
      
      if (claudeConfig.disableNonessential) {
        env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = true;
      }
      
      console.log('Claude Code env configured for provider:', provider);
      return env;
    });

    // 初始化 Happy Service
    const result = await HappyService.initialize({
      stateDir: stateDir,
      workDirs: workDirs,
      baseDir: workspaceDir,
      monitorInterval: happyConfig.monitorInterval || 30000,
      autoMonitor: userSettings.get('happy.autoMonitor') !== false,
      logLevel: happyConfig.logLevel || 'INFO',
      // Happy AI 配置
      happySecret: happySecret,
      permissionMode: permissionMode,
      serverUrl: serverUrl || undefined,
      debug: debug
    });
    
    if (result.success) {
      happyServiceInitialized = true;
      console.log('Happy Service initialized successfully');
      console.log('  Daemon:', result.daemon?.running ? 'Running' : 'Not running');
      console.log('  Sessions:', Object.keys(result.sessions || {}).length);
      
      // 设置 HappyService 事件转发到渲染进程
      setupHappyServiceEventForwarding();
      
      // 连接 HappyClient 到 Session（异步，不阻塞）
      connectHappyClient('main').catch(err => {
        console.error('HappyClient connection failed:', err.message);
      });
      
      // 通知渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('happy-service-status', {
          initialized: true,
          daemon: result.daemon,
          sessions: result.sessions
        });
      }
    } else {
      console.error('Happy Service initialization failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Happy Service initialization error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试重新初始化 HappyService（热切换的回退方案）
 * 用于 daemon restart 失败时
 * @returns {Promise<Object>} 结果 { success, error?, ... }
 */
async function tryReinitializeHappyService() {
  try {
    console.log('[tryReinitializeHappyService] Building initialization options...');
    
    // 获取配置
    const config = require('../config');
    const happyConfig = config.happy || {};
    
    // 确定状态文件目录（使用辅助函数兼容打包环境）
    let stateDir = happyConfig.stateDir;
    if (!stateDir) {
      // 使用数据目录作为基础，自动处理 ASAR 打包兼容性
      const dataDir = getAppDataDir();
      stateDir = path.join(dataDir, 'happy-state');
    }
    
    // 确保状态目录存在
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
      console.log('[tryReinitializeHappyService] Created state directory:', stateDir);
    }
    
    console.log('[tryReinitializeHappyService] State directory:', stateDir);
    
    // 确定工作目录
    const defaultWorkspace = userSettings.getDefaultWorkspaceDir();
    const customWorkspace = userSettings.get('happy.workspaceDir');
    const workspaceDir = customWorkspace || defaultWorkspace;
    
    // 确保工作目录存在
    if (workspaceDir && !fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    
    const workDirs = [{ name: 'main', path: workspaceDir }];
    
    // 读取配置
    const happySecret = secureSettings.hasSecret('happy.secret') 
        ? secureSettings.getSecret('happy.secret') 
        : null;
    const permissionMode = userSettings.get('happy.permissionMode') || 'default';
    const serverUrl = userSettings.get('happy.serverUrl');
    const debug = userSettings.get('happy.debug') || false;
    
    console.log('[tryReinitializeHappyService] Calling HappyService.reinitialize...');
    
    // 调用重新初始化
    const result = await HappyService.reinitialize({
      stateDir: stateDir,
      workDirs: workDirs,
      baseDir: workspaceDir,
      monitorInterval: happyConfig.monitorInterval || 30000,
      autoMonitor: userSettings.get('happy.autoMonitor') !== false,
      logLevel: happyConfig.logLevel || 'INFO',
      happySecret: happySecret,
      permissionMode: permissionMode,
      serverUrl: serverUrl || undefined,
      debug: debug
    });
    
    if (result.success) {
      happyServiceInitialized = true;
      console.log('[tryReinitializeHappyService] Reinitialization successful');
      
      // 设置事件转发（如果尚未设置）
      setupHappyServiceEventForwarding();
      
      // 连接 HappyClient
      connectHappyClient('main').catch(err => {
        console.error('[tryReinitializeHappyService] HappyClient connection failed:', err.message);
      });
      
      // 通知渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('happy-service-status', {
          initialized: true,
          daemon: result.daemon,
          sessions: result.sessions
        });
        mainWindow.webContents.send('happy:initialized', {
          success: true,
          daemon: result.daemon,
          sessions: result.sessions
        });
      }
    } else {
      console.error('[tryReinitializeHappyService] Reinitialization failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('[tryReinitializeHappyService] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 设置 HappyService 事件转发到渲染进程
 */
function setupHappyServiceEventForwarding() {
  const happyEvents = [
    'happy:connected',
    'happy:disconnected',
    'happy:message',
    'happy:error',
    'happy:eventStatus',
    'happy:usage',
    'happy:messagesRestored'
  ];
  
  happyEvents.forEach(eventName => {
    HappyService.on(eventName, (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(eventName, data);
      }
    });
  });
  
  // 当 HappyService 连接成功后，将 MemoryManager 传给 ServerManager
  HappyService.on('happy:connected', () => {
    if (serverManager && HappyService.memoryManager) {
      serverManager.setMemoryManager(HappyService.memoryManager);
      console.log('MemoryManager connected to ServerManager');
    }
  });
  
  console.log('HappyService event forwarding configured');
}

/**
 * 连接 HappyClient 到指定 Session
 * @param {string} sessionName Session 名称
 */
async function connectHappyClient(sessionName = 'main') {
  try {
    console.log(`Connecting HappyClient to session: ${sessionName}`);
    
    // 计算 anonId 用于账户变更检测
    let anonId = null;
    const happySecret = secureSettings.getSecret('happy.secret');
    if (happySecret) {
      try {
        const CryptoUtils = require('../lib/happy-client/utils/CryptoUtils');
        const KeyUtils = require('../lib/happy-client/utils/KeyUtils');
        const normalized = KeyUtils.normalizeSecretKey(happySecret);
        const secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
        const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
        anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
      } catch (e) {
        console.warn('Failed to derive anonId for connectHappyClient:', e.message);
      }
    }
    
    const result = await HappyService.connectToSession(sessionName, { anonId });
    
    if (result.success) {
      console.log('HappyClient connected successfully');
      console.log('  Session ID:', result.sessionId);
    } else {
      console.warn('HappyClient connection failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('HappyClient connection error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 清理资源并退出
 */
async function cleanupAndQuit() {
  if (isQuitting) {
    return;
  }
  isQuitting = true;
  
  console.log('DeepSeek Cowork is exiting...');
  
  try {
    // Clean up view
    if (viewManager) {
      viewManager.destroy();
      viewManager = null;
    }
    
    // Clean up update manager
    if (updateManager) {
      updateManager.destroy();
      updateManager = null;
    }
    
    // Clean up Happy Service (preserving daemon/sessions for next startup)
    if (happyServiceInitialized) {
      console.log('Cleaning up Happy Service (preserving daemon/sessions)...');
      try {
        await HappyService.cleanup();
        happyServiceInitialized = false;
        console.log('Happy Service cleanup complete (daemon/sessions preserved)');
      } catch (error) {
        console.error('Happy Service cleanup error:', error);
      }
    }
    
    // Stop server (embedded mode, direct call)
    if (serverManager) {
      await serverManager.destroy();
      serverManager = null;
    }
    
    // Flush message store (确保消息历史被保存)
    try {
      MessageStore.flush();
      console.log('Message store flushed');
    } catch (error) {
      console.error('Message store flush error:', error);
    }
    
    console.log('Cleanup complete');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

/**
 * 检查并安装依赖
 * @returns {Object} 依赖状态
 */
async function checkAndInstallDependencies() {
  console.log('Checking all dependencies...');
  
  // 检查所有依赖
  let status = dependencyChecker.checkAllDependencies();
  
  // 输出 Node.js 状态
  if (status.nodejs.installed) {
    console.log(`  Node.js: v${status.nodejs.version} (${status.nodejs.path || 'system'})`);
    console.log(`  npm: v${status.nodejs.npm.version || 'N/A'}`);
  } else {
    console.log('  Node.js: Not installed (using Electron built-in)');
    console.log(`  Electron Node.js: v${status.nodejs.electronBuiltin.version}`);
  }
  
  // 检查并安装 happy-coder
  if (status.happyCoder.installed) {
    console.log(`  happy-coder: v${status.happyCoder.version} (${status.happyCoder.source})`);
    if (status.happyCoder.daemon.running) {
      console.log(`    Daemon: Running (PID: ${status.happyCoder.daemon.pid}, Port: ${status.happyCoder.daemon.port})`);
    }
  } else {
    console.log('  happy-coder: Not installed, attempting to install...');
    
    // 尝试安装
    const installResult = await dependencyChecker.installHappyCoder();
    if (installResult.success) {
      status.happyCoder = installResult.status;
      console.log(`  happy-coder: Installed v${status.happyCoder.version}`);
    } else {
      console.error('  happy-coder: Installation failed -', installResult.error);
    }
  }
  
  // 输出 claude-code 状态
  if (status.claudeCode.installed) {
    console.log(`  claude-code: v${status.claudeCode.version || 'unknown'} (${status.claudeCode.source})`);
  } else {
    console.log('  claude-code: Not installed (some features may be limited)');
    // 不阻止启动，只是警告
  }
  
  return status;
}

/**
 * 应用启动流程
 */
async function bootstrap() {
  console.log('DeepSeek Cowork starting...');
  
  try {
    // 0. 设置应用图标（macOS dock 图标）
    if (process.platform === 'darwin') {
      const iconsDir = path.join(__dirname, '../icons');
      const iconPath = path.join(iconsDir, 'icon-256.png');
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
        console.log('macOS dock icon set:', iconPath);
      }
    }
    
    // 0. Initialize user settings (必须在 Happy Service 之前)
    userSettings.initialize(app.getPath('userData'));
    console.log('User settings initialized');
    console.log('  Settings file:', userSettings.getSettingsPath());
    
    // 0.1 Initialize message store (消息历史持久化)
    MessageStore.initialize(app.getPath('userData'));
    console.log('Message store initialized');
    console.log('  Storage file:', MessageStore.getStoragePath());
    
    // 0.2 Initialize secure settings (加密存储)
    secureSettings.initialize(app.getPath('userData'));
    console.log('Secure settings initialized');
    console.log('  Encryption available:', secureSettings.isEncryptionAvailable());

    // 0.3 检查依赖
    console.log('Checking dependencies...');
    dependencyStatus = await checkAndInstallDependencies();
    console.log('Dependency check completed');

    // 1. Initialize server manager
    await initializeServerManager();
    console.log('Server manager initialized');

    // 2. Start server (embedded mode)
    const serverStarted = await serverManager.start();
    if (!serverStarted) {
      console.error('Server startup failed');
    }

    // 3. Wait for server ready
    const serverReady = await serverManager.waitForReady(15000);
    if (!serverReady) {
      console.warn('Server ready check timeout, but continuing to start UI');
    }

    // 4. Create main window
    createMainWindow();
    console.log('Main window created');

    // 5. Setup IPC handlers
    setupIpcHandlers();

    // 6. Set server manager window reference
    serverManager.setMainWindow(mainWindow);

    // 7. Initialize view manager (BrowserView 暂时禁用，使用新的面板式界面)
    initializeViewManager();
    // 注意：暂时不加载 BrowserView，让新界面可见
    // 浏览器面板将通过其他方式显示标签页信息
    // viewManager.loadManagementUI();
    console.log('New panel-based UI loaded (BrowserView disabled)');

    console.log('DeepSeek Cowork started');
    
    // 8. Initialize Happy Service (async, non-blocking)
    initializeHappyService().catch(err => {
      console.error('Happy Service initialization failed:', err.message);
    });
    
    // 9. Initialize Update Manager and check for updates (delayed)
    updateManager = new UpdateManager(mainWindow);
    updateManager.onStatusChange((status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:statusChanged', status);
      }
    });
    console.log('Update manager initialized');
    
    // Delay update check to avoid blocking startup (check after 5 seconds)
    setTimeout(() => {
      if (updateManager && !isQuitting) {
        console.log('Checking for updates...');
        updateManager.checkForUpdates().catch(err => {
          console.error('Update check failed:', err.message);
        });
      }
    }, 5000);
    
  } catch (error) {
    console.error('Startup error:', error);
  }
}

// App ready - 只有获取到单实例锁才启动
if (gotTheLock) {
  app.whenReady().then(bootstrap);

  // Quit app when all windows closed (except macOS)
  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
      await cleanupAndQuit();
      app.quit();
    }
  });

  // macOS: recreate window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap();
    }
  });

  // Cleanup before quit (simplified, server in same process)
  app.on('before-quit', async (event) => {
    if (!isQuitting) {
      event.preventDefault();
      await cleanupAndQuit();
      app.quit();
    }
  });

  // App will quit
  app.on('will-quit', async () => {
    // Ensure cleanup complete
    if (!isQuitting) {
      await cleanupAndQuit();
    }
  });

  // Uncaught exception handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise rejection:', reason);
  });
}
