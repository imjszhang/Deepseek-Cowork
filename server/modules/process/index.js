/**
 * 进程服务模块
 * 
 * 提供独立进程执行脚本的功能，支持复杂任务的异步执行
 * 以服务形式提供HTTP API接口和事件系统
 */

const { spawn, fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * 设置进程服务
 * @param {Object} options 服务配置选项
 * @returns {ProcessService} 进程服务实例
 */
function setupProcessService(options = {}) {
  class ProcessService extends EventEmitter {
    /**
     * 初始化进程服务
     * @param {Object} options 配置选项
     */
    constructor(options = {}) {
      super();
      
      this.serviceName = options.serviceName || 'Process';
      this.workDir = options.workDir || process.cwd();
      this.maxConcurrentProcesses = options.maxConcurrentProcesses || 5;
      this.processTimeout = options.processTimeout || 8 * 60 * 60 * 1000; // 8小时
      this.enableLogging = options.enableLogging !== false;
      this.enableCleanup = options.enableCleanup !== false;
      this.cleanupInterval = options.cleanupInterval || 60 * 60 * 1000; // 1小时
      
      // 服务状态
      this.isRunning = false;
      this.startTime = null;
      
      // 进程管理
      this.runningProcesses = new Map(); // 存储正在运行的进程
      this.processQueue = []; // 进程队列
      this.processHistory = []; // 进程历史记录
      
      // 新增：日志存储
      this.processLogs = new Map(); // 存储每个进程的日志
      this.maxLogsPerProcess = options.maxLogsPerProcess || 1000; // 每个进程最大日志数
      
      // WebSocket连接管理
      this.wsConnections = new Set();
      
      // 清理定时器
      this.cleanupTimer = null;
      
      // 日志记录器
      this.logger = console;
      
      if (this.enableLogging) {
        this.logger.info(`${this.serviceName}服务初始化完成 - 最大并发: ${this.maxConcurrentProcesses}, 超时: ${this.processTimeout}ms`);
      }
    }

    /**
     * 启动进程服务
     * @param {Object} config 启动配置
     * @returns {Promise<boolean>} 启动是否成功
     */
    async start(config = {}) {
      try {
        if (this.isRunning) {
          this.logger.warn(`${this.serviceName}服务已在运行中`);
          return true;
        }

        this.logger.info(`正在启动${this.serviceName}服务...`);
        
        // 更新配置
        if (config.maxConcurrentProcesses) this.maxConcurrentProcesses = config.maxConcurrentProcesses;
        if (config.processTimeout) this.processTimeout = config.processTimeout;
        if (config.workDir) this.workDir = config.workDir;
        if (config.enableLogging !== undefined) this.enableLogging = config.enableLogging;
        
        // 启动自动清理
        if (this.enableCleanup) {
          this._startCleanupTimer();
        }
        
        // 设置进程退出处理
        this._setupProcessExitHandlers();
        
        this.isRunning = true;
        this.startTime = new Date();
        
        // 设置全局实例，供其他模块（如 scheduler）使用
        global.processManagerService = this;
        
        this.logger.info(`${this.serviceName}服务已启动`);
        this.emit('started', { 
          serviceName: this.serviceName,
          startTime: this.startTime,
          config: this.getServiceConfig()
        });
        
        return true;
      } catch (error) {
        this.logger.error(`启动${this.serviceName}服务失败:`, error);
        this.emit('error', { type: 'startError', error });
        throw error;
      }
    }

    /**
     * 停止进程服务
     * @returns {Promise<boolean>} 停止是否成功
     */
    async stop() {
      try {
        if (!this.isRunning) {
          this.logger.info(`${this.serviceName}服务未运行，无需停止`);
          return true;
        }

        this.logger.info(`正在停止${this.serviceName}服务...`);
        
        // 停止清理定时器
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        
        // 终止所有运行中的进程
        const terminatedCount = this.terminateAllProcesses('SIGTERM');
        if (terminatedCount > 0) {
          this.logger.info(`已终止 ${terminatedCount} 个运行中的进程`);
          
          // 等待进程终止
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 强制终止仍在运行的进程
          const remainingCount = this.terminateAllProcesses('SIGKILL');
          if (remainingCount > 0) {
            this.logger.warn(`强制终止了 ${remainingCount} 个顽固进程`);
          }
        }
        
        // 清空队列
        this.processQueue.forEach(task => {
          task.reject(new Error('服务正在停止'));
        });
        this.processQueue = [];
        
        this.isRunning = false;
        
        this.logger.info(`${this.serviceName}服务已停止`);
        this.emit('stopped', { 
          serviceName: this.serviceName,
          stopTime: new Date()
        });
        
        return true;
      } catch (error) {
        this.logger.error(`停止${this.serviceName}服务失败:`, error);
        this.emit('error', { type: 'stopError', error });
        throw error;
      }
    }

    /**
     * 设置HTTP路由
     * @param {Object} app Express应用实例
     * @returns {Object} 返回app实例以支持链式调用
     */
    setupRoutes(app) {
      // 服务状态路由
      app.get('/api/process/status', (req, res) => {
        try {
          const status = this.getServiceStatus();
          res.json({ success: true, data: status });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 执行脚本路由
      app.post('/api/process/execute', async (req, res) => {
        try {
          const {
            scriptPath,
            args = [],
            env = {},
            cwd,
            detached = false,
            useFork = true,
            timeout,
            taskId,
            metadata = {}
          } = req.body;

          if (!scriptPath) {
            return res.status(400).json({ 
              success: false, 
              error: '必须提供脚本文件路径' 
            });
          }

          const result = await this.executeScript({
            scriptPath,
            args,
            env,
            cwd,
            detached,
            useFork,
            timeout,
            taskId,
            metadata
          });

          res.json({ 
            success: true, 
            data: {
              processId: result.processId,
              metadata: result.metadata
            }
          });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 获取进程状态路由
      app.get('/api/process/process/:processId', (req, res) => {
        try {
          const { processId } = req.params;
          const status = this.getProcessStatus(processId);
          
          if (!status) {
            return res.status(404).json({ 
              success: false, 
              error: '进程不存在' 
            });
          }

          res.json({ success: true, data: status });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 获取所有进程状态路由
      app.get('/api/process/processes', (req, res) => {
        try {
          const status = this.getAllProcessStatus();
          res.json({ success: true, data: status });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 终止进程路由
      app.delete('/api/process/process/:processId', (req, res) => {
        try {
          const { processId } = req.params;
          const { signal = 'SIGTERM' } = req.body;
          
          const success = this.terminateProcess(processId, signal);
          
          if (success) {
            res.json({ success: true, message: '进程终止信号已发送' });
          } else {
            res.status(404).json({ success: false, error: '进程不存在或已结束' });
          }
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 终止所有进程路由
      app.delete('/api/process/processes', (req, res) => {
        try {
          const { signal = 'SIGTERM' } = req.body;
          const terminatedCount = this.terminateAllProcesses(signal);
          
          res.json({ 
            success: true, 
            message: `已向 ${terminatedCount} 个进程发送终止信号`,
            terminatedCount 
          });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 进程管理器页面路由
      app.get('/process', (req, res) => {
        res.removeHeader('Content-Type');
        res.sendFile(path.join(__dirname, './html/index.html'));
      });

      // 获取脚本文件列表路由
      app.get('/api/process/scripts', (req, res) => {
        try {
          console.log('收到获取脚本列表请求');
          
          const FileManager = require('./fileManager');
          const fileManager = new FileManager(this.workDir);
          
          console.log('工作目录:', this.workDir);
          
          // 获取scripts目录下的文件
          const scriptsPath = 'scripts';
          
          // 先检查scripts目录是否存在
          const scriptsAbsolutePath = require('path').join(this.workDir, scriptsPath);
          console.log('scripts绝对路径:', scriptsAbsolutePath);
          console.log('scripts目录是否存在:', require('fs').existsSync(scriptsAbsolutePath));
          
          if (!fileManager.directoryExists(scriptsPath)) {
            console.error('scripts目录不存在');
            return res.status(404).json({ 
              success: false, 
              error: 'scripts目录不存在',
              debug: {
                workDir: this.workDir,
                scriptsPath: scriptsPath,
                absolutePath: scriptsAbsolutePath
              }
            });
          }
          
          const getScriptFiles = (dirPath) => {
            console.log('正在扫描目录:', dirPath);
            const items = fileManager.listDirectory(dirPath);
            if (!items) {
              console.log('无法读取目录:', dirPath);
              return [];
            }
            
            console.log(`目录 ${dirPath} 包含 ${items.length} 个项目`);
            
            const scripts = [];
            
            items.forEach(item => {
              if (item.isDirectory) {
                // 递归获取子目录中的脚本
                const subScripts = getScriptFiles(item.path);
                scripts.push({
                  name: item.name,
                  path: item.path,
                  isDirectory: true,
                  children: subScripts
                });
              } else if (item.name.endsWith('.js')) {
                scripts.push({
                  name: item.name,
                  path: item.path,
                  isDirectory: false,
                  size: item.size,
                  modified: item.modified
                });
              }
            });
            
            console.log(`目录 ${dirPath} 找到 ${scripts.length} 个脚本项目`);
            return scripts;
          };
          
          const scriptFiles = getScriptFiles(scriptsPath);
          const totalFiles = this.countJsFiles(scriptFiles);
          
          console.log(`总计找到 ${totalFiles} 个JS文件`);
          
          res.json({ 
            success: true, 
            data: {
              scripts: scriptFiles,
              totalFiles: totalFiles,
              debug: {
                workDir: this.workDir,
                scriptsPath: scriptsPath
              }
            }
          });
        } catch (error) {
          console.error('获取脚本列表错误:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message,
            stack: error.stack
          });
        }
      });

      // 获取脚本文件内容路由
      app.get('/api/process/scripts/:scriptPath(*)', (req, res) => {
        try {
          console.log('收到获取脚本内容请求:', req.params.scriptPath);
          
          const FileManager = require('./fileManager');
          const fileManager = new FileManager(this.workDir);
          
          const scriptPath = req.params.scriptPath;
          
          if (!scriptPath.startsWith('scripts/')) {
            return res.status(400).json({ 
              success: false, 
              error: '只能访问scripts目录下的文件' 
            });
          }
          
          if (!scriptPath.endsWith('.js')) {
            return res.status(400).json({ 
              success: false, 
              error: '只能访问JavaScript文件' 
            });
          }
          
          if (!fileManager.fileExists(scriptPath)) {
            return res.status(404).json({ 
              success: false, 
              error: '脚本文件不存在' 
            });
          }
          
          const content = fileManager.readFile(scriptPath);
          if (content === null) {
            return res.status(500).json({ 
              success: false, 
              error: '读取脚本文件失败' 
            });
          }
          
          // 提取脚本的基本信息
          const scriptInfo = this.extractScriptInfo(content);
          
          res.json({ 
            success: true, 
            data: {
              path: scriptPath,
              content: content,
              info: scriptInfo
            }
          });
        } catch (error) {
          console.error('获取脚本内容错误:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 新增：获取进程历史日志路由
      app.get('/api/process/process/:processId/logs', (req, res) => {
        try {
          const { processId } = req.params;
          const logs = this.getProcessLogs(processId);
          
          res.json({ 
            success: true, 
            data: {
              processId,
              logs,
              totalCount: logs.length
            }
          });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      // 新增：获取所有进程的历史日志路由
      app.get('/api/process/logs', (req, res) => {
        try {
          const { processId, limit = 500, offset = 0 } = req.query;
          let allLogs = [];
          
          if (processId && processId !== 'all') {
            // 获取特定进程的日志
            allLogs = this.getProcessLogs(processId);
          } else {
            // 获取所有进程的日志
            this.processLogs.forEach((logs, pid) => {
              allLogs.push(...logs);
            });
            
            // 按时间排序
            allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          }
          
          // 分页
          const startIndex = parseInt(offset);
          const endIndex = startIndex + parseInt(limit);
          const pagedLogs = allLogs.slice(startIndex, endIndex);
          
          res.json({ 
            success: true, 
            data: {
              logs: pagedLogs,
              totalCount: allLogs.length,
              limit: parseInt(limit),
              offset: parseInt(offset)
            }
          });
        } catch (error) {
          res.status(500).json({ success: false, error: error.message });
        }
      });

      this.emit('routesSetup', { app });
      return app;
    }

    /**
     * 设置Socket.IO支持
     * @param {Object} io Socket.IO实例
     */
    setupSocketIO(io) {
      const namespace = io.of('/process');
      
      namespace.on('connection', (socket) => {
        this.wsConnections.add(socket);
        
        if (this.enableLogging) {
          this.logger.info(`新的WebSocket连接: ${socket.id}`);
        }
        
        // 发送当前进程状态
        socket.emit('processStatus', this.getAllProcessStatus());
        
        // 发送服务状态
        socket.emit('serviceStatus', this.getServiceStatus());
        
        socket.on('disconnect', () => {
          this.wsConnections.delete(socket);
          if (this.enableLogging) {
            this.logger.info(`WebSocket连接断开: ${socket.id}`);
          }
        });
        
        // 监听客户端请求刷新数据
        socket.on('requestRefresh', () => {
          socket.emit('processStatus', this.getAllProcessStatus());
          socket.emit('serviceStatus', this.getServiceStatus());
        });
      });
      
      this.wsNamespace = namespace;
      this.emit('socketIOSetup', { namespace });
    }

    /**
     * 格式化时间戳
     */
    formatTimestamp() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
    }

    /**
     * 广播日志消息到所有WebSocket连接
     * @param {string} level 日志级别
     * @param {string} message 日志消息
     * @param {Object} metadata 额外元数据
     */
    broadcastLog(level, message, metadata = {}) {
      // 存储日志
      if (metadata.processId) {
        this.storeProcessLog(metadata.processId, level, message, metadata);
      } else {
        // 系统日志存储到特殊的系统进程ID
        this.storeProcessLog('system', level, message, { ...metadata, type: 'system' });
      }
      
      // 输出到 console（让外层 PM 能捕获）
      // 仅在非服务器模式（CLI/嵌套模式）下输出，避免服务器日志重复
      if (!this.wsNamespace && this.enableLogging) {
        const timestamp = this.formatTimestamp();
        const logMethod = level === 'error' ? console.error : console.log;
        logMethod(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
      }
      
      // 广播日志（WebSocket）
      if (this.wsNamespace) {
        this.wsNamespace.emit('processLog', {
          timestamp: new Date().toISOString(),
          level,
          message,
          metadata
        });
      }
    }

    /**
     * 广播进程状态更新到所有WebSocket连接
     */
    broadcastProcessStatus() {
      if (this.wsNamespace) {
        this.wsNamespace.emit('processStatus', this.getAllProcessStatus());
      }
    }

    /**
     * 获取服务配置信息
     * @returns {Object} 服务配置
     */
    getServiceConfig() {
      return {
        serviceName: this.serviceName,
        workDir: this.workDir,
        maxConcurrentProcesses: this.maxConcurrentProcesses,
        processTimeout: this.processTimeout,
        enableLogging: this.enableLogging,
        enableCleanup: this.enableCleanup,
        cleanupInterval: this.cleanupInterval
      };
    }

    /**
     * 获取服务状态
     * @returns {Object} 服务状态信息
     */
    getServiceStatus() {
      const processStatus = this.getAllProcessStatus();
      
      return {
        serviceName: this.serviceName,
        isRunning: this.isRunning,
        startTime: this.startTime,
        uptime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
        config: this.getServiceConfig(),
        processes: processStatus,
        performance: {
          totalProcessed: this.processHistory.length,
          memoryUsage: process.memoryUsage(),
          loadAverage: require('os').loadavg()
        }
      };
    }

    // ===== 进程管理方法 =====

    /**
     * 执行Node.js脚本
     */
    async executeScript({
      scriptPath,
      args = [],
      env = {},
      cwd,
      detached = false,
      useFork = true,
      timeout,
      taskId,
      metadata = {}
    }) {
      try {
        if (!this.isRunning) {
          throw new Error('进程服务未运行');
        }

        if (!scriptPath) {
          throw new Error("必须提供脚本文件路径");
        }

        const absoluteScriptPath = path.resolve(this.workDir, scriptPath);
        if (!fs.existsSync(absoluteScriptPath)) {
          throw new Error(`脚本文件不存在: ${absoluteScriptPath}`);
        }

        const processId = taskId || uuidv4();
        const processTimeout = timeout || this.processTimeout;
        const workingDir = cwd || this.workDir;

        if (this.runningProcesses.size >= this.maxConcurrentProcesses) {
          if (this.enableLogging) {
            this.logger.warn(`达到最大并发限制 (${this.maxConcurrentProcesses})，任务加入队列: ${processId}`);
          }
          
          return new Promise((resolve, reject) => {
            this.processQueue.push({
              resolve,
              reject,
              options: {
                scriptPath, args, env, cwd, detached, useFork, timeout, taskId: processId, metadata
              }
            });
          });
        }

        const executionPromise = this._createProcess({
          processId,
          scriptPath: absoluteScriptPath,
          args,
          env,
          cwd: workingDir,
          detached,
          useFork,
          timeout: processTimeout,
          metadata
        });

        return {
          processId,
          promise: executionPromise,
          metadata
        };

      } catch (error) {
        this.logger.error(`创建进程失败: ${error.message}`);
        throw error;
      }
    }

    // 获取进程状态相关方法
    getProcessStatus(processId) {
      const process = this.runningProcesses.get(processId);
      if (!process) {
        const historyRecord = this.processHistory.find(record => record.processId === processId);
        return historyRecord || null;
      }

      return {
        processId,
        status: 'running',
        startTime: process.startTime,
        pid: process.childProcess.pid,
        metadata: process.metadata
      };
    }

    getAllProcessStatus() {
      const running = Array.from(this.runningProcesses.entries()).map(([processId, process]) => ({
        processId,
        status: 'running',
        startTime: process.startTime,
        pid: process.childProcess.pid,
        metadata: process.metadata
      }));

      const queued = this.processQueue.map((item, index) => ({
        processId: item.options.taskId,
        status: 'queued',
        queuePosition: index + 1,
        metadata: item.options.metadata
      }));

      return {
        running,
        queued,
        history: this.processHistory.slice(-20),
        stats: {
          runningCount: running.length,
          queuedCount: queued.length,
          totalHistoryCount: this.processHistory.length
        }
      };
    }

    terminateProcess(processId, signal = 'SIGTERM') {
      const process = this.runningProcesses.get(processId);
      if (!process) {
        if (this.enableLogging) {
          this.logger.warn(`尝试终止不存在的进程: ${processId}`);
        }
        return false;
      }

      try {
        process.childProcess.kill(signal);
        if (this.enableLogging) {
          this.logger.info(`发送终止信号 ${signal} 到进程: ${processId}`);
        }
        return true;
      } catch (error) {
        this.logger.error(`终止进程失败 ${processId}: ${error.message}`);
        return false;
      }
    }

    terminateAllProcesses(signal = 'SIGTERM') {
      let terminatedCount = 0;
      
      for (const [processId, process] of this.runningProcesses.entries()) {
        try {
          process.childProcess.kill(signal);
          terminatedCount++;
        } catch (error) {
          this.logger.error(`终止进程失败 ${processId}: ${error.message}`);
        }
      }

      if (this.enableLogging) {
        this.logger.info(`发送终止信号到 ${terminatedCount} 个进程`);
      }

      return terminatedCount;
    }

    cleanupHistory(keepCount = 100) {
      if (this.processHistory.length > keepCount) {
        const removed = this.processHistory.length - keepCount;
        this.processHistory = this.processHistory.slice(-keepCount);
        
        if (this.enableLogging) {
          this.logger.info(`清理了 ${removed} 条历史记录，保留最近 ${keepCount} 条`);
        }
      }
    }

    // ===== 私有方法 =====

    _startCleanupTimer() {
      this.cleanupTimer = setInterval(() => {
        this.cleanupHistory();
      }, this.cleanupInterval);
      
      if (this.enableLogging) {
        this.logger.info(`自动清理定时器已启动，间隔: ${this.cleanupInterval}ms`);
      }
    }

    _setupProcessExitHandlers() {
      // 注意：在server.js环境中，我们不应该设置全局的进程退出处理器
      // 这些应该由主应用程序管理
    }

    async _createProcess({
      processId,
      scriptPath,
      args,
      env,
      cwd,
      detached,
      useFork,
      timeout,
      metadata
    }) {
      return new Promise((resolve, reject) => {
        const startTime = new Date();
        
        const processEnv = { ...process.env, ...env };
        
        let childProcess;
        
        if (useFork) {
          childProcess = fork(scriptPath, args, {
            cwd,
            env: processEnv,
            detached,
            silent: true // 改为true以便捕获输出
          });
        } else {
          childProcess = spawn('node', [scriptPath, ...args], {
            cwd,
            env: processEnv,
            detached,
            stdio: ['pipe', 'pipe', 'pipe'] // 捕获所有输出
          });
        }

        const processInfo = {
          processId,
          childProcess,
          startTime,
          metadata,
          resolve,
          reject,
          stdout: '',  // 收集 stdout 输出
          stderr: ''   // 收集 stderr 输出
        };
        
        this.runningProcesses.set(processId, processInfo);

        // 设置输出监听
        this._setupProcessOutputListeners(processId, childProcess, useFork);

        const timeoutHandle = setTimeout(() => {
          this._handleProcessTimeout(processId);
        }, timeout);

        childProcess.on('exit', (code, signal) => {
          this._handleProcessExit(processId, code, signal, timeoutHandle);
        });

        childProcess.on('error', (error) => {
          this._handleProcessError(processId, error, timeoutHandle);
        });

        if (useFork) {
          childProcess.on('message', (message) => {
            this.emit('processMessage', { processId, message });
            this.broadcastLog('info', `[${processId.substring(0, 8)}] 收到消息: ${JSON.stringify(message)}`, { processId, type: 'message' });
          });
        }

        if (this.enableLogging) {
          this.logger.info(`进程启动: ${processId} (PID: ${childProcess.pid})`);
        }

        this.broadcastLog('success', `进程已启动: ${processId.substring(0, 8)} (PID: ${childProcess.pid})`, { 
          processId, 
          pid: childProcess.pid, 
          metadata,
          type: 'start'
        });

        this.emit('processStarted', { processId, pid: childProcess.pid, metadata });
        this.broadcastProcessStatus();
      });
    }

    /**
     * 设置进程输出监听器
     * @private
     */
    _setupProcessOutputListeners(processId, childProcess, useFork) {
      const shortId = processId.substring(0, 8);
      const processInfo = this.runningProcesses.get(processId);
      
      // 监听stdout和stderr（优先使用直接的stdout/stderr属性）
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          const rawOutput = data.toString();
          const output = rawOutput.trim();
          
          // 收集到 processInfo 的 stdout 缓冲区
          if (processInfo) {
            processInfo.stdout += rawOutput;
          }
          
          if (output) {
            this.broadcastLog('info', `[${shortId}] ${output}`, { 
              processId, 
              type: 'stdout' 
            });
          }
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          const rawOutput = data.toString();
          const output = rawOutput.trim();
          
          // 收集到 processInfo 的 stderr 缓冲区
          if (processInfo) {
            processInfo.stderr += rawOutput;
          }
          
          // 跳过完全空白的输出
          if (!output || output.length === 0) {
            return;
          }
          
          // 在CLI交互模式下，过滤掉包含timestamp和label的JSON格式stderr输出
          const isCliMode = process.env.CLI_INTERACTIVE_MODE === 'true';
          if (isCliMode) {
            try {
              const parsed = JSON.parse(output);
              if (parsed && parsed.timestamp && parsed.label) {
                // 跳过JSON格式的winston日志输出，这些可能是循环引用
                return;
              }
            } catch (e) {
              // 不是JSON，继续处理
            }
            
            // 过滤掉明显的winston日志格式
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*\[.*\].*\[.*ProcessInstance.*\]/.test(output)) {
              return;
            }
            
            // 过滤掉只包含重复换行符或空字符的输出
            if (/^[\s\n\r]*$/.test(rawOutput)) {
              return;
            }
          }
          
          // 广播有实际内容的stderr输出
          this.broadcastLog('error', `[${shortId}] ${output}`, { 
            processId, 
            type: 'stderr' 
          });
        });
      }
      
      if (useFork) {
        // Fork模式下额外处理send方法和message事件
        const originalSend = childProcess.send;
        if (originalSend) {
          childProcess.send = function(...args) {
            try {
              return originalSend.apply(this, args);
            } catch (error) {
              // 忽略发送错误
            }
          };
        }
      }

      // 注意：移除了重复的stdio监听，避免重复日志
      // 如果stdout/stderr不存在，则尝试从stdio数组中获取
      if (!childProcess.stdout && !childProcess.stderr && childProcess.stdio) {
        childProcess.stdio.forEach((stream, index) => {
          if (stream && typeof stream.on === 'function') {
            // 只监听stdout(index=1)和stderr(index=2)
            if (index === 1 || index === 2) {
              stream.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                  const level = index === 2 ? 'error' : 'info';
                  const type = index === 2 ? 'stderr' : 'stdout';
                  this.broadcastLog(level, `[${shortId}] ${output}`, { 
                    processId, 
                    type 
                  });
                }
              });
            }
          }
        });
      }
    }

    _handleProcessExit(processId, code, signal, timeoutHandle) {
      clearTimeout(timeoutHandle);
      
      const process = this.runningProcesses.get(processId);
      if (!process) return;

      const endTime = new Date();
      const duration = endTime - process.startTime;

      const result = {
        processId,
        exitCode: code,
        signal,
        duration,
        startTime: process.startTime,
        endTime,
        metadata: process.metadata,
        stdout: process.stdout || '',  // 包含收集的 stdout
        stderr: process.stderr || ''   // 包含收集的 stderr
      };

      this.runningProcesses.delete(processId);

      this.processHistory.push({
        ...result,
        status: code === 0 ? 'completed' : 'failed'
      });

      if (this.enableLogging) {
        this.logger.info(`进程结束: ${processId} (退出码: ${code}, 耗时: ${duration}ms)`);
      }

      const level = code === 0 ? 'success' : 'error';
      const message = code === 0 
        ? `进程已完成: ${processId.substring(0, 8)} (耗时: ${duration}ms)`
        : `进程异常结束: ${processId.substring(0, 8)} (退出码: ${code}, 耗时: ${duration}ms)`;
      
      this.broadcastLog(level, message, { 
        processId, 
        exitCode: code, 
        signal, 
        duration,
        type: 'exit'
      });

      this.emit('processCompleted', result);
      this.broadcastProcessStatus();

      if (code === 0) {
        process.resolve(result);
      } else {
        // 错误时也返回结果（包含 stdout/stderr），而不是抛出异常
        const error = new Error(`进程退出异常，退出码: ${code}, 信号: ${signal}`);
        error.exitCode = code;
        error.signal = signal;
        error.stdout = result.stdout;
        error.stderr = result.stderr;
        process.reject(error);
      }

      this._processNextInQueue();
    }

    _handleProcessError(processId, error, timeoutHandle) {
      clearTimeout(timeoutHandle);
      
      const process = this.runningProcesses.get(processId);
      if (!process) return;

      const endTime = new Date();
      const duration = endTime - process.startTime;

      this.runningProcesses.delete(processId);

      this.processHistory.push({
        processId,
        status: 'error',
        error: error.message,
        duration,
        startTime: process.startTime,
        endTime,
        metadata: process.metadata
      });

      if (this.enableLogging) {
        this.logger.error(`进程错误: ${processId} - ${error.message}`);
      }

      this.broadcastLog('error', `进程错误: ${processId.substring(0, 8)} - ${error.message}`, { 
        processId, 
        error: error.message,
        type: 'error'
      });

      this.emit('processError', { processId, error, metadata: process.metadata });
      this.broadcastProcessStatus();
      process.reject(error);
      this._processNextInQueue();
    }

    _handleProcessTimeout(processId) {
      const process = this.runningProcesses.get(processId);
      if (!process) return;

      if (this.enableLogging) {
        this.logger.warn(`进程超时: ${processId}`);
      }

      this.broadcastLog('warn', `进程执行超时: ${processId.substring(0, 8)}`, { 
        processId,
        type: 'timeout'
      });

      try {
        process.childProcess.kill('SIGKILL');
      } catch (error) {
        this.logger.error(`强制终止超时进程失败: ${error.message}`);
      }

      this.processHistory.push({
        processId,
        status: 'timeout',
        duration: this.processTimeout,
        startTime: process.startTime,
        endTime: new Date(),
        metadata: process.metadata
      });

      this.runningProcesses.delete(processId);
      this.emit('processTimeout', { processId, metadata: process.metadata });
      this.broadcastProcessStatus();
      process.reject(new Error(`进程执行超时: ${processId}`));
      this._processNextInQueue();
    }

    _processNextInQueue() {
      if (this.processQueue.length > 0 && this.runningProcesses.size < this.maxConcurrentProcesses) {
        const nextTask = this.processQueue.shift();
        
        this.broadcastLog('info', `开始处理队列中的任务: ${nextTask.options.taskId.substring(0, 8)}`, {
          processId: nextTask.options.taskId,
          type: 'queue'
        });
        
        setImmediate(async () => {
          try {
            const result = await this.executeScript(nextTask.options);
            nextTask.resolve(result);
          } catch (error) {
            nextTask.reject(error);
          }
        });
      }
    }

    /**
     * 计算JS文件数量
     * @private
     */
    countJsFiles(scripts) {
      let count = 0;
      scripts.forEach(script => {
        if (script.isDirectory && script.children) {
          count += this.countJsFiles(script.children);
        } else if (!script.isDirectory) {
          count++;
        }
      });
      return count;
    }

    /**
     * 提取脚本信息
     * @private
     */
    extractScriptInfo(content) {
      const info = {
        description: '',
        usage: '',
        examples: []
      };
      
      try {
        const lines = content.split('\n');
        let inComment = false;
        let commentLines = [];
        
        for (let i = 0; i < Math.min(lines.length, 50); i++) { // 只检查前50行
          const line = lines[i].trim();
          
          if (line.startsWith('/**')) {
            inComment = true;
            continue;
          }
          
          if (line.includes('*/')) {
            inComment = false;
            continue;
          }
          
          if (inComment || line.startsWith('*') || line.startsWith('//')) {
            commentLines.push(line.replace(/^[\s\*\/]*/, ''));
          }
          
          // 提取使用示例
          if (line.includes('node ') && line.includes('.js')) {
            info.examples.push(line.replace(/^[\s\*\/]*/, ''));
          }
        }
        
        // 从注释中提取描述
        if (commentLines.length > 0) {
          info.description = commentLines.slice(0, 3).join(' ').trim();
          
          // 查找使用方法
          const usageIndex = commentLines.findIndex(line => 
            line.includes('使用方法') || line.includes('Usage') || line.includes('用法')
          );
          if (usageIndex !== -1 && usageIndex + 1 < commentLines.length) {
            info.usage = commentLines[usageIndex + 1].trim();
          }
        }
        
      } catch (error) {
        console.error('提取脚本信息失败:', error);
      }
      
      return info;
    }

    /**
     * 存储进程日志
     * @param {string} processId 进程ID
     * @param {string} level 日志级别
     * @param {string} message 日志消息
     * @param {Object} metadata 额外元数据
     */
    storeProcessLog(processId, level, message, metadata = {}) {
      if (!this.processLogs.has(processId)) {
        this.processLogs.set(processId, []);
      }
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        logType: metadata.type || 'general',
        processId: processId.substring(0, 8),
        isIndented: message.includes('└─'),
        originalProcessId: processId,
        metadata
      };
      
      // 处理缩进消息
      if (logEntry.isIndented) {
        logEntry.message = message.replace('└─', '').trim();
      }
      
      const logs = this.processLogs.get(processId);
      logs.push(logEntry);
      
      // 限制日志数量
      if (logs.length > this.maxLogsPerProcess) {
        logs.splice(0, logs.length - this.maxLogsPerProcess);
      }
    }

    /**
     * 获取进程日志
     * @param {string} processId 进程ID
     * @returns {Array} 日志数组
     */
    getProcessLogs(processId) {
      return this.processLogs.get(processId) || [];
    }

    /**
     * 获取所有进程的日志
     * @returns {Map} 所有进程的日志Map
     */
    getAllProcessLogs() {
      return this.processLogs;
    }
  }

  return new ProcessService({
    serviceName: "Process",
    ...options
  });
}

// 导出设置函数
module.exports = { setupProcessService };
