/**
 * DeepSeek Cowork - 服务器管理器（内嵌模式）
 * 
 * 功能：
 * - 直接嵌入 browserControlServer（不使用子进程）
 * - 管理 Express 和 WebSocket 服务器生命周期
 * - 端口检测和清理
 * - 监控服务器状态
 * - 收集服务器日志
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { exec } = require('child_process');
const express = require('express');
const { app } = require('electron');

/**
 * 延迟函数
 * @param {number} ms - 毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ServerManager {
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    
    // 内嵌服务器相关
    this.browserControlServer = null;  // 浏览器控制服务实例
    this.explorerService = null;       // 文件管理服务实例
    this.memoryService = null;         // 记忆管理服务实例
    this.expressApp = null;            // Express 应用
    this.httpServer = null;            // HTTP 服务器实例
    
    this.isRunning = false;
    this.logs = [];
    this.maxLogs = 1000;
    
    // 服务器配置
    this.config = {
      port: 3333,
      wsPort: 8080,
      host: 'localhost'
    };
    
    // 应用路径缓存（用于模块路径解析）
    this.appPath = null;
    this.isDev = null;
    
    // 状态变化回调
    this.statusChangeCallbacks = [];
    
    // 原始 console 方法（用于日志拦截）
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
    
    console.log('ServerManager initialized (embedded mode)');
  }

  /**
   * 设置主窗口引用
   * @param {BrowserWindow} mainWindow - 主窗口
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * 设置服务器配置
   * @param {Object} config - 配置对象
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 注册状态变化回调
   * @param {Function} callback - 回调函数
   */
  onStatusChange(callback) {
    this.statusChangeCallbacks.push(callback);
  }

  /**
   * 触发状态变化
   * @param {Object} status - 状态信息
   */
  emitStatusChange(status) {
    this.statusChangeCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Status callback error:', error);
      }
    });
  }

  /**
   * 检查端口是否可用
   * @param {number} port - 端口号
   * @returns {Promise<boolean>} 是否可用
   */
  checkPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port, this.config.host);
    });
  }

  /**
   * 获取占用端口的进程 ID
   * @param {number} port - 端口号
   * @returns {Promise<number|null>} 进程 ID
   */
  getProcessOnPort(port) {
    return new Promise((resolve) => {
      // Windows 命令
      const cmd = `netstat -ano | findstr :${port} | findstr LISTENING`;
      
      exec(cmd, (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        
        // 解析输出获取 PID
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1]);
          if (!isNaN(pid) && pid > 0) {
            resolve(pid);
            return;
          }
        }
        resolve(null);
      });
    });
  }

  /**
   * 强制释放端口（终止占用进程）
   * @param {number} port - 端口号
   * @returns {Promise<boolean>} 是否成功
   */
  async killProcessOnPort(port) {
    const pid = await this.getProcessOnPort(port);
    if (!pid) {
      this.addLog('info', `Port ${port} is not in use`);
      return true;
    }
    
    this.addLog('info', `Terminating process on port ${port} (PID: ${pid})`);
    
    return new Promise((resolve) => {
      // Windows command
      exec(`taskkill /F /PID ${pid}`, (error) => {
        if (error) {
          this.addLog('error', `Failed to terminate process: ${error.message}`);
          resolve(false);
        } else {
          this.addLog('info', `Successfully terminated process ${pid}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * 确保端口可用（检查并清理）
   * @deprecated 使用 checkPortConflict 代替，不再强制释放端口
   * @param {number} port - 端口号
   * @returns {Promise<boolean>} 是否可用
   */
  async ensurePortAvailable(port) {
    const available = await this.checkPortAvailable(port);
    if (available) {
      return true;
    }
    
    // 不再强制释放端口，直接返回 false
    this.addLog('warn', `Port ${port} is in use`);
    return false;
  }

  /**
   * 检测端口冲突类型
   * @param {number} port - 端口号
   * @returns {Promise<Object>} 冲突信息 { available, conflict, message }
   */
  async checkPortConflict(port) {
    // 先检查端口是否可用
    const available = await this.checkPortAvailable(port);
    if (available) {
      return { available: true };
    }
    
    this.addLog('info', `Port ${port} is in use, checking service type...`);
    
    // 端口被占用，尝试请求 /api/ping 检测服务类型
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`http://localhost:${port}/api/ping`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        
        // 检查是否是自家服务
        if (data.app === 'deepseek-cowork') {
          if (data.mode === 'cli') {
            this.addLog('info', `Port ${port} is used by CLI service`);
            return {
              available: false,
              conflict: 'cli',
              message: 'CLI service is running'
            };
          } else if (data.mode === 'electron') {
            this.addLog('info', `Port ${port} is used by another Electron client`);
            return {
              available: false,
              conflict: 'electron',
              message: 'Another Electron client is running'
            };
          }
        }
      }
      
      // 响应成功但不是自家服务
      this.addLog('info', `Port ${port} is used by another program`);
      return {
        available: false,
        conflict: 'other',
        message: 'Port is occupied by another program'
      };
      
    } catch (error) {
      // 请求失败（超时、连接拒绝等），说明是其他程序占用
      this.addLog('info', `Port ${port} is used by another program (ping failed)`);
      return {
        available: false,
        conflict: 'other',
        message: 'Port is occupied by another program'
      };
    }
  }

  /**
   * 获取默认服务器配置
   * @returns {Object} 配置对象
   */
  getDefaultServerConfig() {
    // 尝试加载项目配置系统
    let projectConfig = {};
    try {
      projectConfig = require('../../config');
    } catch (e) {
      // 配置系统不存在，使用默认值
    }
    
    // 数据库路径处理
    // In production, use userData directory; in dev, use project data directory
    // Use this.isDev if available, otherwise check app.isPackaged
    const isDev = this.isDev !== null ? this.isDev : !app.isPackaged;
    
    // Also check if rootDir points to asar - if so, we're in production
    const isAsarPath = global.rootDir && global.rootDir.includes('.asar');
    const actualIsDev = isDev && !isAsarPath;
    
    // Always use userData for data storage to ensure writability
    const baseDataDir = actualIsDev 
      ? (global.rootDir || process.cwd())
      : app.getPath('userData');
    
    // In production, always use userData for database, ignore projectConfig paths
    // because projectConfig paths are relative and would resolve to asar (read-only)
    const dbPath = actualIsDev && projectConfig.database?.path 
      ? projectConfig.database.path 
      : path.join(baseDataDir, 'data', 'browser_data.db');
    const dbDir = actualIsDev && projectConfig.database?.directory 
      ? projectConfig.database.directory 
      : path.join(baseDataDir, 'data');
    
    return {
      server: {
        host: this.config.host,
        port: this.config.port,
        routePrefix: '/api/browser',
        webInterfacePath: '/browser'
      },
      extensionWebSocket: {
        enabled: true,
        host: this.config.host,
        port: this.config.wsPort,
        maxClients: 10,
        reconnectAttempts: 5,
        reconnectDelay: 2000
      },
      database: {
        path: dbPath,
        directory: dbDir,
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
      events: {
        maxHistorySize: 1000,
        maxListeners: 50,
        enableBroadcast: true
      },
      security: {
        enableCors: true,
        corsOrigins: ['*'],
        maxRequestSize: '100mb',
        enableRateLimit: false
      },
      logging: {
        level: 'INFO',
        enableConsole: true,
        enableFile: false
      },
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
   * 启动服务器
   * @returns {Promise<boolean>} 是否成功
   */
  async start() {
    if (this.isRunning) {
      this.addLog('info', 'Server is already running');
      return true;
    }

    try {
      this.addLog('info', 'Starting embedded server...');
      
      // 1. Set global.rootDir (required by server module)
      // Use app.getAppPath() to get correct path in both dev and production
      // In dev: returns project root (e.g., D:\github\My\deepseek-cowork)
      // In production: returns path to app.asar (e.g., C:\...\app.asar) or unpacked app directory
      this.isDev = !app.isPackaged;
      
      try {
        this.appPath = app.getAppPath();
      } catch (e) {
        // Fallback if app is not available yet (shouldn't happen as we're called after app.whenReady)
        this.appPath = path.join(__dirname, '../..');
        this.addLog('warn', 'app.getAppPath() not available, using __dirname fallback');
      }
      
      // In development: appPath is already the project root, use it directly
      // In production: appPath is the app.asar path, keep it as is for require() to work
      if (this.isDev) {
        // Development mode: appPath is the project root
        global.rootDir = this.appPath;
      } else {
        // Production mode: keep app.asar path as rootDir
        // Node.js/Electron can transparently access files inside asar
        // Native modules will be loaded from app.asar.unpacked automatically
        global.rootDir = this.appPath;
      }
      
      this.addLog('info', `App path: ${this.appPath}`);
      this.addLog('info', `Root dir: ${global.rootDir}`);
      
      // 2. Ensure data directory exists
      // Use userData directory for data in production, or project data dir in dev
      const dataDir = this.isDev 
        ? path.join(global.rootDir, 'data')
        : path.join(app.getPath('userData'), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.addLog('info', `Created data directory: ${dataDir}`);
      }
      
      // 3. Check port conflicts (no longer force-killing processes)
      const httpPortStatus = await this.checkPortConflict(this.config.port);
      if (!httpPortStatus.available) {
        const error = new Error(`HTTP port ${this.config.port}: ${httpPortStatus.message}`);
        error.portConflict = httpPortStatus;
        throw error;
      }
      
      const wsPortStatus = await this.checkPortConflict(this.config.wsPort);
      if (!wsPortStatus.available) {
        const error = new Error(`WebSocket port ${this.config.wsPort}: ${wsPortStatus.message}`);
        error.portConflict = wsPortStatus;
        throw error;
      }
      
      // 4. 创建 Express 应用
      this.expressApp = express();
      this.expressApp.use(express.json({ limit: '100mb' }));
      this.expressApp.use(express.urlencoded({ extended: true, limit: '100mb' }));
      
      // 5. Import and create server instance
      // Try multiple paths to find the server module
      const possiblePaths = [
        path.join(global.rootDir, 'server', 'modules', 'browser', 'index.js'),
        path.join(__dirname, '../../server/modules/browser/index.js'), // Fallback for dev
      ];
      
      // In production, also try asar path
      if (!this.isDev && this.appPath) {
        possiblePaths.push(path.join(this.appPath, 'server', 'modules', 'browser', 'index.js'));
        if (process.resourcesPath) {
          possiblePaths.push(
            path.join(process.resourcesPath, 'app', 'server', 'modules', 'browser', 'index.js'),
            path.join(process.resourcesPath, 'app.asar', 'server', 'modules', 'browser', 'index.js')
          );
        }
      }
      
      // Find the first existing path
      let browserControlModulePath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          browserControlModulePath = testPath;
          break;
        }
      }
      
      if (!browserControlModulePath) {
        this.addLog('error', `Browser control module not found. Tried paths:`);
        possiblePaths.forEach(p => this.addLog('error', `  - ${p} (exists: ${fs.existsSync(p)})`));
        throw new Error(`Browser control module not found. App path: ${this.appPath}, Root dir: ${global.rootDir}, IsDev: ${this.isDev}`);
      }
      
      this.addLog('info', `Using server module: ${browserControlModulePath}`);
      
      // Clear module cache (ensure new instance on restart)
      this.clearModuleCache(browserControlModulePath);
      
      const { setupBrowserControlService } = require(browserControlModulePath);
      
      const serverConfig = this.getDefaultServerConfig();
      this.browserControlServer = setupBrowserControlService({
        browserControlConfig: serverConfig,
        serverConfig: {
          host: this.config.host,
          port: this.config.port
        }
      });
      
      // 6. Initialize server
      this.addLog('info', 'Initializing server components...');
      await this.browserControlServer.init();
      
      // 7. Setup routes
      this.addLog('info', 'Setting up routes...');
      this.browserControlServer.setupRoutes(this.expressApp);
      
      // 8. Start HTTP server
      await this.startHttpServer();
      
      // 9. Start WebSocket server
      this.addLog('info', 'Starting WebSocket server...');
      await this.browserControlServer.start();
      
      // 10. Initialize and start Explorer service
      await this.initExplorerService();
      
      // 11. Initialize and start Memory service
      await this.initMemoryModule();
      
      // 12. Setup server event bridge
      this.setupEventBridge();
      
      this.isRunning = true;
      
      this.addLog('info', 'Server started successfully');
      this.addLog('info', `HTTP: http://${this.config.host}:${this.config.port}`);
      this.addLog('info', `WebSocket: ws://${this.config.host}:${this.config.wsPort}`);
      this.addLog('info', `Management UI: http://${this.config.host}:${this.config.port}/browser`);
      
      const status = { 
        running: true, 
        config: this.config,
        extensionConnections: this.getExtensionConnections()
      };
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      
      return true;
      
    } catch (error) {
      this.addLog('error', `Failed to start server: ${error.message}`);
      console.error('Server startup error:', error);
      
      // 清理已创建的资源
      await this.cleanup();
      
      const status = { running: false, error: error.message };
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      
      return false;
    }
  }

  /**
   * 启动 HTTP 服务器
   * @returns {Promise<void>}
   */
  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.httpServer = this.expressApp.listen(this.config.port, this.config.host, () => {
        this.addLog('info', `HTTP server started: http://${this.config.host}:${this.config.port}`);
        resolve();
      });
      
      this.httpServer.on('error', (error) => {
        this.addLog('error', `HTTP server error: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * 设置服务器事件桥接
   */
  setupEventBridge() {
    if (!this.browserControlServer) return;
    
    // 监听服务器事件并转发到渲染进程
    const events = [
      'tabs_update',
      'tab_opened',
      'tab_closed',
      'tab_url_changed',
      'cookies_received',
      'error'
    ];
    
    events.forEach(eventName => {
      this.browserControlServer.on(eventName, (data) => {
        this.notifyRenderer(`server-event-${eventName}`, data);
      });
    });
    
    this.addLog('info', 'Server event bridge configured');
  }

  /**
   * 初始化并启动 Explorer 服务
   * @returns {Promise<void>}
   */
  async initExplorerService() {
    try {
      this.addLog('info', 'Initializing Explorer service...');
      
      // Try multiple paths to find Explorer module
      const explorerPossiblePaths = [
        path.join(global.rootDir, 'server', 'modules', 'explorer', 'index.js'),
        path.join(__dirname, '../../server/modules/explorer/index.js'), // Fallback for dev
      ];
      
      // In production, also try asar path
      if (!this.isDev && this.appPath) {
        explorerPossiblePaths.push(path.join(this.appPath, 'server', 'modules', 'explorer', 'index.js'));
        if (process.resourcesPath) {
          explorerPossiblePaths.push(
            path.join(process.resourcesPath, 'app', 'server', 'modules', 'explorer', 'index.js'),
            path.join(process.resourcesPath, 'app.asar', 'server', 'modules', 'explorer', 'index.js')
          );
        }
      }
      
      // Find the first existing path
      let finalExplorerPath = null;
      for (const testPath of explorerPossiblePaths) {
        if (fs.existsSync(testPath)) {
          finalExplorerPath = testPath;
          break;
        }
      }
      
      if (!finalExplorerPath) {
        this.addLog('error', `Explorer module not found. Tried paths:`);
        explorerPossiblePaths.forEach(p => this.addLog('error', `  - ${p} (exists: ${fs.existsSync(p)})`));
        return;
      }
      
      this.addLog('info', `Using Explorer module: ${finalExplorerPath}`);
      
      // Clear module cache
      this.clearModuleCache(finalExplorerPath);
      
      const { setupExplorerService } = require(finalExplorerPath);
      
      // Get user settings for workspace directory
      let workspaceDir = global.rootDir || process.cwd();
      try {
        const userSettings = require('../../lib/user-settings');
        const customDir = userSettings.get('happy.workspaceDir');
        if (customDir && fs.existsSync(customDir)) {
          workspaceDir = customDir;
        } else {
          const defaultDir = userSettings.getDefaultWorkspaceDir();
          if (defaultDir) {
            workspaceDir = defaultDir;
            // Ensure directory exists
            if (!fs.existsSync(workspaceDir)) {
              fs.mkdirSync(workspaceDir, { recursive: true });
            }
          }
        }
      } catch (e) {
        this.addLog('debug', `Using default workspace: ${workspaceDir}`);
      }
      
      // Create Explorer service instance
      this.explorerService = setupExplorerService({
        explorerConfig: {
          enabled: true,
          watchDirs: [{
            name: 'workspace',
            path: workspaceDir,
            description: 'Workspace directory'
          }],
          mode: 'internal-only',
          logging: {
            level: 'INFO'
          }
        },
        serverConfig: {
          host: this.config.host,
          port: this.config.port
        },
        appDir: workspaceDir
      });
      
      // Initialize
      await this.explorerService.init();
      
      // Setup routes
      this.explorerService.setupRoutes(this.expressApp);
      this.addLog('info', 'Explorer routes configured');
      
      // Start service
      await this.explorerService.start();
      
      // Verify SSE endpoint is accessible
      const sseEndpoint = `http://${this.config.host}:${this.config.port}/api/explorer/events`;
      this.addLog('info', `Explorer SSE endpoint: ${sseEndpoint}`);
      
      // Setup explorer event forwarding
      this.explorerService.on('file_change', (data) => {
        this.notifyRenderer('explorer-file-change', data);
      });
      
      this.explorerService.on('structure_update', (data) => {
        this.notifyRenderer('explorer-structure-update', data);
      });
      
      this.addLog('info', 'Explorer service started successfully');
      this.addLog('info', `Explorer API: http://${this.config.host}:${this.config.port}/api/explorer`);
      this.addLog('info', `Explorer SSE: ${sseEndpoint}`);
      
    } catch (error) {
      this.addLog('error', `Failed to initialize Explorer service: ${error.message}`);
      console.error('Explorer service error:', error);
      // Don't throw - Explorer is optional, app should continue
    }
  }

  /**
   * 初始化并启动 Memory 服务
   * @returns {Promise<void>}
   */
  async initMemoryModule() {
    try {
      this.addLog('info', 'Initializing Memory service...');
      
      // Try multiple paths to find Memory module
      const memoryPossiblePaths = [
        path.join(global.rootDir, 'server', 'modules', 'memory', 'index.js'),
        path.join(__dirname, '../../server/modules/memory/index.js'), // Fallback for dev
      ];
      
      // In production, also try asar path
      if (!this.isDev && this.appPath) {
        memoryPossiblePaths.push(path.join(this.appPath, 'server', 'modules', 'memory', 'index.js'));
        if (process.resourcesPath) {
          memoryPossiblePaths.push(
            path.join(process.resourcesPath, 'app', 'server', 'modules', 'memory', 'index.js'),
            path.join(process.resourcesPath, 'app.asar', 'server', 'modules', 'memory', 'index.js')
          );
        }
      }
      
      // Find the first existing path
      let finalMemoryPath = null;
      for (const testPath of memoryPossiblePaths) {
        if (fs.existsSync(testPath)) {
          finalMemoryPath = testPath;
          break;
        }
      }
      
      if (!finalMemoryPath) {
        this.addLog('error', `Memory module not found. Tried paths:`);
        memoryPossiblePaths.forEach(p => this.addLog('error', `  - ${p} (exists: ${fs.existsSync(p)})`));
        return;
      }
      
      this.addLog('info', `Using Memory module: ${finalMemoryPath}`);
      
      // Clear module cache
      this.clearModuleCache(finalMemoryPath);
      
      const { setupMemoryService } = require(finalMemoryPath);
      
      // Create Memory service instance
      this.memoryService = setupMemoryService({
        serverConfig: {
          host: this.config.host,
          port: this.config.port
        },
        dataDir: path.join(app.getPath('userData'), 'memories')
      });
      
      // Initialize
      await this.memoryService.init();
      
      // Setup routes
      this.memoryService.setupRoutes(this.expressApp);
      
      // Start service
      await this.memoryService.start();
      
      // Setup memory event forwarding
      this.memoryService.on('memory:saved', (data) => {
        this.notifyRenderer('memory-saved', data);
      });
      
      this.addLog('info', 'Memory service started successfully');
      this.addLog('info', `Memory API: http://${this.config.host}:${this.config.port}/api/memory`);
      
    } catch (error) {
      this.addLog('error', `Failed to initialize Memory service: ${error.message}`);
      console.error('Memory service error:', error);
      // Don't throw - Memory is optional, app should continue
    }
  }

  /**
   * 设置 MemoryManager 到 Memory 服务
   * @param {Object} memoryManager MemoryManager 实例
   */
  setMemoryManager(memoryManager) {
    if (this.memoryService) {
      this.memoryService.setMemoryManager(memoryManager);
      this.addLog('info', 'MemoryManager set to Memory service');
    }
  }

  /**
   * 清除模块缓存
   * @param {string} modulePath - 模块路径
   */
  clearModuleCache(modulePath) {
    const resolvedPath = require.resolve(modulePath);
    
    // 清除主模块及其依赖
    const clearCache = (id) => {
      const cached = require.cache[id];
      if (cached) {
        // 递归清除子模块
        if (cached.children) {
          cached.children.forEach(child => {
            // 只清除同目录下的模块
            if (child.id.startsWith(path.dirname(resolvedPath))) {
              clearCache(child.id);
            }
          });
        }
        delete require.cache[id];
      }
    };
    
    clearCache(resolvedPath);
  }

  /**
   * 等待服务器就绪
   * @param {number} timeout - 超时时间（毫秒）
   * @param {number} interval - 检查间隔（毫秒）
   * @returns {Promise<boolean>} 是否就绪
   */
  async waitForReady(timeout = 15000, interval = 200) {
    const start = Date.now();
    this.addLog('info', `Waiting for server ready (timeout: ${timeout}ms)`);
    
    while (Date.now() - start < timeout) {
      if (await this.checkServerHealth()) {
        this.addLog('info', `Server ready (took: ${Date.now() - start}ms)`);
        return true;
      }
      await sleep(interval);
    }
    
    this.addLog('warn', `Server ready timeout (${timeout}ms)`);
    return false;
  }

  /**
   * 停止服务器
   * @returns {Promise<boolean>} 是否成功
   */
  async stop() {
    if (!this.isRunning) {
      this.addLog('info', 'Server is not running');
      return true;
    }

    this.addLog('info', 'Stopping server...');

    try {
      await this.cleanup();
      
      this.isRunning = false;
      this.addLog('info', 'Server stopped');
      
      const status = { running: false };
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      
      return true;
    } catch (error) {
      this.addLog('error', `Failed to stop server: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理服务器资源
   */
  async cleanup() {
    // 1. 停止 browserControlServer（包括 WebSocket）
    if (this.browserControlServer) {
      try {
        await this.browserControlServer.stop();
      } catch (error) {
        this.addLog('warn', `Error stopping browserControlServer: ${error.message}`);
      }
      this.browserControlServer = null;
    }
    
    // 2. 停止 Explorer 服务
    if (this.explorerService) {
      try {
        await this.explorerService.stop();
      } catch (error) {
        this.addLog('warn', `Error stopping Explorer service: ${error.message}`);
      }
      this.explorerService = null;
    }
    
    // 3. 停止 Memory 服务
    if (this.memoryService) {
      try {
        await this.memoryService.stop();
      } catch (error) {
        this.addLog('warn', `Error stopping Memory service: ${error.message}`);
      }
      this.memoryService = null;
    }
    
    // 4. Close HTTP server
    if (this.httpServer) {
      await new Promise((resolve) => {
        this.httpServer.close((err) => {
          if (err) {
            this.addLog('warn', `Error closing HTTP server: ${err.message}`);
          }
          resolve();
        });
      });
      this.httpServer = null;
    }
    
    // 4. Clean up Express app
    this.expressApp = null;
  }

  /**
   * 重启服务器
   * @returns {Promise<boolean>} 是否成功
   */
  async restart() {
    this.addLog('info', 'Restarting server...');
    this.notifyRenderer('server-status-changed', { running: false, restarting: true });
    
    await this.stop();
    await sleep(500);
    
    const success = await this.start();
    
    if (success) {
      await this.waitForReady(10000);
    }
    
    return success;
  }

  /**
   * 检查服务器健康状态
   * @returns {Promise<boolean>} 是否健康
   */
  checkServerHealth() {
    return new Promise((resolve) => {
      const url = `http://${this.config.host}:${this.config.port}/api/browser/config`;
      
      const req = http.get(url, { timeout: 3000 }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /**
   * 获取扩展连接数
   * @returns {number} 连接数
   */
  getExtensionConnections() {
    if (!this.browserControlServer) {
      return 0;
    }
    
    try {
      const status = this.browserControlServer.getStatus();
      return status.activeExtensionConnections || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 获取服务器状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: this.config,
      extensionConnections: this.getExtensionConnections()
    };
  }

  /**
   * 获取详细状态
   * @returns {Object} 详细状态信息
   */
  getDetailedStatus() {
    const basicStatus = this.getStatus();
    
    if (!this.browserControlServer) {
      return basicStatus;
    }
    
    try {
      const serverStatus = this.browserControlServer.getStatus();
      return {
        ...basicStatus,
        serverInfo: serverStatus
      };
    } catch (error) {
      return basicStatus;
    }
  }

  /**
   * 获取 BrowserControlService 实例
   * @returns {BrowserControlService|null} 服务实例
   */
  getService() {
    return this.browserControlServer;
  }

  /**
   * 获取服务器日志
   * @param {number} limit - 返回的日志条数
   * @returns {Array} 日志列表
   */
  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  /**
   * 清除日志
   */
  clearLogs() {
    this.logs = [];
    this.addLog('info', 'Logs cleared');
  }

  /**
   * 添加日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   */
  addLog(level, message) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.logs.push(log);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 通知渲染进程
    this.notifyRenderer('server-log', log);

    // 控制台输出
    const prefix = `[Server ${level.toUpperCase()}]`;
    if (level === 'error') {
      this.originalConsole.error(prefix, message);
    } else if (level === 'warn') {
      this.originalConsole.warn(prefix, message);
    } else {
      this.originalConsole.log(prefix, message);
    }
  }

  /**
   * 通知渲染进程
   * @param {string} channel - 通道名称
   * @param {Object} data - 数据
   */
  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 销毁管理器
   */
  async destroy() {
    this.statusChangeCallbacks = [];
    await this.stop();
  }
}

module.exports = ServerManager;
