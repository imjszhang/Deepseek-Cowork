/**
 * 调度器管理服务模块
 * 
 * 独立的调度器管理功能，不依赖外部脚本
 * 以服务形式提供HTTP API接口和Web管理界面，集成到主应用服务器
 * 
 * 移植自: agent-kaichi/kaichi/server/modules/schedulerManager
 * 适配时间: 2026-02-02
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const cron = require('node-cron');
const FileSystemManager = require('./fileSystemManager');

// 模块级工作目录配置
let moduleWorkDir = null;

// 获取工作目录辅助函数
function getWorkDir() {
  if (moduleWorkDir) {
    return path.resolve(moduleWorkDir);
  }
  return path.join(process.cwd(), 'work_dir', 'scheduler');
}

// 设置工作目录
function setWorkDir(workDir) {
  moduleWorkDir = workDir;
}

function getSubDir(subPath) {
  return path.join(getWorkDir(), subPath);
}

/**
 * 获取配置文件路径（按优先级查找）
 * 优先级1: {workDir}/config/scheduler-config.json
 * @returns {string} 配置文件路径
 */
function getConfigFile() {
  return getSubDir('config/scheduler-config.json');
}

// 基础配置常量
const BASE_CONFIG = {
  WORK_DIR: getWorkDir(),
  PID_FILE: getSubDir('process/scheduler.pid'),
  get CONFIG_FILE() {
    return getConfigFile();
  }
};

/**
 * 配置验证器
 */
class ConfigValidator {
  /**
   * 验证任务配置
   * @param {Object} taskConfig 任务配置
   * @param {Object} options 验证选项
   * @param {boolean} options.strictScriptCheck 是否严格检查脚本文件（默认 false，脚本不存在只返回警告）
   * @returns {Object} { errors: [], warnings: [] }
   */
  static validateTask(taskConfig, options = {}) {
    const { strictScriptCheck = false } = options;
    const errors = [];
    const warnings = [];
    const required = ['name', 'schedule', 'script'];
    
    for (const field of required) {
      if (!taskConfig[field]) {
        errors.push(`缺少必需字段: ${field}`);
      }
    }
    
    // 验证任务类型
    const type = taskConfig.type || 'cron';
    if (!['cron', 'once'].includes(type)) {
      errors.push(`无效的任务类型: ${type}，必须是 'cron' 或 'once'`);
    }

    // 验证调度配置
    if (taskConfig.schedule) {
      if (type === 'cron') {
        // 验证cron表达式
        if (!cron.validate(taskConfig.schedule)) {
          errors.push(`无效的cron表达式: ${taskConfig.schedule}`);
        }
      } else if (type === 'once') {
        // 验证ISO时间字符串
        const date = new Date(taskConfig.schedule);
        if (isNaN(date.getTime())) {
          errors.push(`无效的时间格式: ${taskConfig.schedule}，必须是有效的 ISO 8601 时间字符串`);
        }
      }
    }
    
    // 验证脚本文件 - 脚本不存在只作为警告，不阻止启动
    if (taskConfig.script) {
      const scriptExists = this.validateScriptPath(taskConfig.script);
      if (!scriptExists) {
        if (strictScriptCheck) {
          errors.push(`脚本文件不存在: ${taskConfig.script}`);
        } else {
          warnings.push(`脚本文件不存在: ${taskConfig.script}`);
        }
      }
    }
    
    // 兼容旧版调用方式：返回对象包含 errors 和 warnings
    return { errors, warnings };
  }
  
  /**
   * 验证脚本文件路径是否存在
   * 支持多种可能的路径组合
   */
  static validateScriptPath(scriptPath) {
    // 可能的基础路径列表
    const basePaths = [
      process.cwd(),                    // 当前工作目录 (/app)
      path.resolve(process.cwd()),      // 绝对路径
      path.join(process.cwd(), '..'),   // 上级目录
      '/',                              // 根目录
    ];
    
    // 如果是绝对路径，直接检查
    if (path.isAbsolute(scriptPath)) {
      return fs.existsSync(scriptPath);
    }
    
    // 尝试各种基础路径组合
    for (const basePath of basePaths) {
      const fullPath = path.join(basePath, scriptPath);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
    
    // 特殊处理：如果脚本路径以 scripts/ 开头，也检查相对于应用根目录的路径
    if (scriptPath.startsWith('scripts/')) {
      const appRootPath = path.join(process.cwd(), scriptPath);
      if (fs.existsSync(appRootPath)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * 验证整个配置
   * @param {Object} config 配置对象
   * @param {Object} options 验证选项
   * @returns {Object} { errors: [], warnings: [], taskWarnings: {} }
   */
  static validateConfig(config, options = {}) {
    const errors = [];
    const warnings = [];
    const taskWarnings = {}; // taskId -> warnings[]
    
    if (!config.tasks || typeof config.tasks !== 'object') {
      errors.push('配置必须包含tasks对象');
      return { errors, warnings, taskWarnings };
    }
    
    // completed_tasks 是可选的，但如果存在必须是对象
    if (config.completed_tasks && typeof config.completed_tasks !== 'object') {
      errors.push('completed_tasks 必须是对象');
    }

    for (const [taskId, taskConfig] of Object.entries(config.tasks)) {
      const result = this.validateTask(taskConfig, options);
      if (result.errors.length > 0) {
        errors.push(`任务 ${taskId}: ${result.errors.join(', ')}`);
      }
      if (result.warnings.length > 0) {
        taskWarnings[taskId] = result.warnings;
        warnings.push(`任务 ${taskId}: ${result.warnings.join(', ')}`);
      }
    }
    
    return { errors, warnings, taskWarnings };
  }
}

/**
 * 内置调度器类
 */
class InternalScheduler extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.isRunning = false;
    this.startTime = null;
    this.logs = [];
    this.config = null;
    
    // 配置警告信息（脚本不存在等非致命问题）
    this.configWarnings = [];
    this.taskWarnings = {}; // taskId -> warnings[]
    
    // 使用 Explorer 模块替代 FileSystemManager，如果不可用则回退到原有方式
    this.explorerInstance = null;
    this.fileSystemManager = null;
    this.configWatcherKey = 'scheduler-config';
    
    // 系统级定时任务，用于检查一次性任务
    this.systemCron = null;

    // 运行中任务跟踪
    this.runningTasks = new Map(); // taskId -> { startTime, process, status }
    this.taskHistory = new Map(); // taskId -> Array of execution records
    this.taskProcesses = new Map(); // taskId -> processId
    
    // 确保目录存在
    this.ensureDirectories();
    
    // 初始化文件系统管理（优先使用 Explorer，回退到 FileSystemManager）
    this.initializeFileSystemManagement();
    
    // 加载配置
    this.loadConfig();
  }
  
  /**
   * 确保必要的目录存在
   */
  ensureDirectories() {
    const dirs = [
      path.dirname(BASE_CONFIG.PID_FILE),
      path.dirname(BASE_CONFIG.CONFIG_FILE)
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
  
  /**
   * 初始化文件系统管理（优先使用 Explorer，回退到 FileSystemManager）
   */
  initializeFileSystemManagement() {
    try {
      // 首先尝试使用 Explorer 实例
      this.explorerInstance = global.explorerInstance;
      
      if (this.explorerInstance && this.explorerInstance.fileSystemManager) {
        // 使用 Explorer 的 FileSystemManager
        const fileSystemManager = this.explorerInstance.fileSystemManager;
        
        // 监听文件变化事件
        fileSystemManager.on('fileChange', (data) => {
          if (data.watcherKey === this.configWatcherKey) {
            this.handleConfigFileChange(data);
          }
        });
        
        // 监听监控器错误事件
        fileSystemManager.on('watcherError', (data) => {
          if (data.watcherKey === this.configWatcherKey) {
            this.log('error', '配置文件监听出错', { error: data.error });
          }
        });
        
        this.log('info', 'Explorer 实例初始化成功', { 
          workDir: fileSystemManager.workDir 
        });
        
      } else {
        // 回退到原有的 FileSystemManager 方式
        this.log('warn', 'Explorer 实例不可用，回退到独立的 FileSystemManager');
        this.initializeFallbackFileSystemManager();
      }
      
    } catch (error) {
      this.log('error', '初始化文件系统管理失败', { error: error.message });
      // 尝试回退到原有方式
      try {
        this.initializeFallbackFileSystemManager();
      } catch (fallbackError) {
        this.log('error', '回退到 FileSystemManager 也失败', { error: fallbackError.message });
      }
    }
  }
  
  /**
   * 初始化回退的 FileSystemManager
   */
  initializeFallbackFileSystemManager() {
    try {
      // 创建独立的 FileSystemManager 实例
      const configFile = BASE_CONFIG.CONFIG_FILE;
      const configDir = path.dirname(configFile);
      
      // 使用配置文件所在目录的父目录作为工作目录
      let workDir = path.dirname(configDir);
      
      this.fileSystemManager = new FileSystemManager({
        workDir: workDir,
        excludePatterns: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.*',
          '**/*.tmp'
        ]
      });
      
      // 监听文件变化事件
      this.fileSystemManager.on('fileChange', (data) => {
        if (data.watcherKey === this.configWatcherKey) {
          this.handleConfigFileChange(data);
        }
      });
      
      // 监听监控器错误事件
      this.fileSystemManager.on('watcherError', (data) => {
        if (data.watcherKey === this.configWatcherKey) {
          this.log('error', '配置文件监听出错', { error: data.error });
        }
      });
      
      this.log('info', '回退 FileSystemManager 初始化成功', { workDir });
      
    } catch (error) {
      this.log('error', '初始化回退 FileSystemManager 失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 获取配置目录结构
   */
  getConfigDirectoryStructure() {
    try {
      const configDir = path.dirname(BASE_CONFIG.CONFIG_FILE);
      
      // 尝试使用 Explorer 实例的 FileSystemManager
      if (this.explorerInstance && this.explorerInstance.fileSystemManager) {
        const workDir = this.explorerInstance.fileSystemManager.workDir;
        const relativePath = path.relative(workDir, configDir);
        return this.explorerInstance.fileSystemManager.buildFileSystemStructure(relativePath);
      }
      
      // 回退到独立的 FileSystemManager
      if (this.fileSystemManager) {
        const workDir = this.fileSystemManager.workDir;
        const relativePath = path.relative(workDir, configDir);
        return this.fileSystemManager.buildFileSystemStructure(relativePath);
      }
      
      // 如果都不可用，使用基本的文件系统结构构建
      return this.buildFileSystemStructure(configDir);
    } catch (error) {
      this.log('error', '获取配置目录结构失败', { error: error.message });
      return {};
    }
  }

  /**
   * 构建文件系统结构
   * @param {string} dirPath - 目录路径
   * @returns {Object} 文件系统结构对象
   */
  buildFileSystemStructure(dirPath) {
    const structure = {};
    try {
      const items = fs.readdirSync(dirPath);
      items.forEach(item => {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          structure[item] = this.buildFileSystemStructure(fullPath);
        } else {
          structure[item] = {
            size: stat.size,
            modified: stat.mtime.toISOString()
          };
        }
      });
    } catch (err) {
      this.log('error', `读取目录失败: ${dirPath}`, { error: err.message });
    }
    return structure;
  }
  
  /**
   * 加载配置文件
   */
  loadConfig() {
    try {
      if (!fs.existsSync(BASE_CONFIG.CONFIG_FILE)) {
        // 创建默认配置
        this.createDefaultConfig();
      }
      
      const configContent = fs.readFileSync(BASE_CONFIG.CONFIG_FILE, 'utf8');
      const newConfig = JSON.parse(configContent);
      
      // 验证配置（脚本不存在只作为警告，不阻止启动）
      const validationResult = ConfigValidator.validateConfig(newConfig);
      if (validationResult.errors.length > 0) {
        throw new Error(`配置验证失败: ${validationResult.errors.join('; ')}`);
      }
      
      // 保存警告信息，供前端显示
      this.configWarnings = validationResult.warnings;
      this.taskWarnings = validationResult.taskWarnings;
      
      // 如果有警告，记录日志
      if (validationResult.warnings.length > 0) {
        this.log('warn', '配置加载成功，但有警告', {
          warnings: validationResult.warnings
        });
      }
      
      this.config = newConfig;
      this.log('info', '配置加载成功', {
        configFile: BASE_CONFIG.CONFIG_FILE,
        version: this.config.version,
        tasksCount: Object.keys(this.config.tasks || {}).length,
        warningsCount: validationResult.warnings.length
      });
      
    } catch (error) {
      this.log('error', '加载配置失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 创建默认配置
   */
  createDefaultConfig() {
    try {
      const configFile = BASE_CONFIG.CONFIG_FILE;
      const configDir = path.dirname(configFile);
      
      // 确保配置目录存在
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 从 scheduler-config.default.json 读取默认配置
      const defaultConfigPath = path.join(__dirname, 'scheduler-config.default.json');
      
      if (fs.existsSync(defaultConfigPath)) {
        // 读取默认配置文件
        const defaultConfigContent = fs.readFileSync(defaultConfigPath, 'utf8');
        const defaultConfig = JSON.parse(defaultConfigContent);
        
        // 更新时间戳
        defaultConfig.lastUpdated = new Date().toISOString();
        
        // 写入配置文件
        fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2), 'utf8');
        this.log('info', '默认配置文件已创建（从 scheduler-config.default.json）', { 
          configFile: configFile,
          tasksCount: Object.keys(defaultConfig.tasks || {}).length
        });
      } else {
        // 如果默认配置文件不存在，使用后备的硬编码配置
        this.log('warn', '默认配置文件不存在，使用后备配置', { 
          defaultConfigPath 
        });
        
        const fallbackConfig = {
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
          settings: {
            timezone: "Asia/Shanghai",
            maxRetries: 3,
            logLevel: "info",
            healthCheckInterval: 60000,
            webApiPort: 3334,
            webApiEnabled: false
          },
          tasks: {
            example_task: {
              type: "cron",
              name: "示例任务",
              description: "自动化执行示例任务",
              schedule: "0 8 * * *",
              script: "server/modules/scheduler/example-task.js",
              args: [],
              enabled: false,
              timeout: 28800000,
              retryOnFailure: false,
              maxRetries: 0,
              tags: ["example", "demo"]
            }
          }
        };
        
        fs.writeFileSync(configFile, JSON.stringify(fallbackConfig, null, 2), 'utf8');
        this.log('info', '默认配置文件已创建（使用后备配置）', { configFile: configFile });
      }
    } catch (error) {
      this.log('error', '创建默认配置文件失败', { error: error.message });
      throw error;
    }
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
   * 日志记录
   */
  log(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      pid: process.pid,
      ...data
    };
    
    this.logs.push(logEntry);
    
    // 输出到控制台（添加时间戳）
    const timestamp = this.formatTimestamp();
    console.log(`[${timestamp}] [Scheduler] [${level.toUpperCase()}] ${message}`, data);
    
    // 保持日志数组大小
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }
  }
  
  /**
   * 启动调度器
   */
  async start() {
    try {
      if (this.isRunning) {
        this.log('warn', '调度器已在运行中');
        return;
      }
      
      this.log('info', '内置调度器启动中...');
      
      // 启动时归档过期的 once 任务
      await this.archiveExpiredOnceTasks();
      
      // 设置配置文件监听
      this.setupConfigWatcher();
      
      // 初始化任务
      this.initializeTasks();
      
      // 启动系统级检查任务
      this.startSystemCron();

      this.isRunning = true;
      this.startTime = new Date();
      
      this.log('info', '内置调度器启动成功', {
        pid: process.pid,
        tasksCount: this.tasks.size,
        startTime: this.startTime.toISOString()
      });
      
    } catch (error) {
      this.log('error', '启动调度器失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 初始化任务
   */
  initializeTasks() {
    if (!this.config || !this.config.tasks) {
      this.log('warn', '没有可用的任务配置');
      return;
    }
    
    for (const [taskId, taskConfig] of Object.entries(this.config.tasks)) {
      if (!taskConfig.enabled) {
        this.log('info', `跳过禁用的任务: ${taskConfig.name}`);
        continue;
      }
      
      try {
        // 检查任务类型
        const type = taskConfig.type || 'cron';
        
        let task = null;
        
        if (type === 'cron') {
          // 定时任务使用 node-cron 调度
          // 使用配置中的时区，如果没有则默认使用 Asia/Shanghai
          const timezone = this.config.settings?.timezone || 'Asia/Shanghai';
          task = cron.schedule(taskConfig.schedule, () => {
            this.executeTask(taskId, taskConfig);
          }, {
            scheduled: false,
            timezone
          });
        }
        
        // 注册任务到内存映射
        this.tasks.set(taskId, {
          ...taskConfig,
          type,
          cronTask: task, // 一次性任务此处为 null
          lastRun: null,
          nextRun: null,
          runCount: 0,
          errorCount: 0
        });
        
        // 如果是定时任务，启动它
        if (task) {
          task.start();
        }
        
        this.log('info', `任务已注册: ${taskConfig.name} [${type}]`, {
          taskId,
          schedule: taskConfig.schedule
        });
        
      } catch (error) {
        this.log('error', `注册任务失败: ${taskConfig.name}`, {
          taskId,
          error: error.message
        });
      }
    }
  }
  
  /**
   * 执行任务
   */
  async executeTask(taskId, taskConfig) {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.log('warn', `任务不存在，跳过执行: ${taskId}`);
      return;
    }
    
    // 检查任务是否已在运行
    if (this.runningTasks.has(taskId)) {
      this.log('warn', `任务已在运行中，跳过: ${taskConfig.name}`, { taskId });
      return;
    }
    
    // 预检查：脚本文件是否存在（在开始执行前检查，避免不必要的状态变更）
    const scriptPath = path.join(process.cwd(), taskConfig.script);
    if (!fs.existsSync(scriptPath)) {
      this.log('warn', `脚本文件不存在，跳过任务: ${taskConfig.name}`, { 
        taskId, 
        script: taskConfig.script,
        fullPath: scriptPath 
      });
      
      // 发送跳过事件（用于前端显示）
      this.emit('task_execution_skipped', { 
        taskId, 
        reason: 'script_not_found',
        script: taskConfig.script,
        message: `脚本文件不存在: ${taskConfig.script}`
      });
      
      return;
    }
    
    this.log('info', `开始执行任务: ${taskConfig.name}`, { taskId });
    
    const startTime = new Date();
    const executionId = `${taskId}_${Date.now()}`;
    
    // 记录任务开始执行
    this.runningTasks.set(taskId, {
      executionId,
      startTime,
      status: 'running',
      progress: '正在启动...',
      pid: null
    });
    
    // 发送任务开始执行事件
    this.emit('task_execution_started', { taskId, executionId, startTime });
    
    try {
      // 更新进度
      this.updateTaskProgress(taskId, '正在执行脚本...');
      
      // 执行脚本，传递超时参数
      const result = await this.runScript(scriptPath, taskConfig.args || [], taskId, taskConfig.timeout);
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // 更新任务状态
      task.lastRun = endTime;
      task.runCount++;
      
      // 记录执行历史
      this.addTaskHistory(taskId, {
        executionId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        success: true,
        exitCode: result.code,
        error: null,
        output: result.stdout
      });
      
      this.log('info', `任务执行成功: ${taskConfig.name}`, {
        taskId,
        duration: `${Math.round(duration / 1000)}秒`,
        exitCode: result.code
      });
      
      // 发送任务执行完成事件
      this.emit('task_execution_completed', { 
        taskId, 
        executionId, 
        duration, 
        exitCode: result.code,
        success: true
      });

      // 如果是一次性任务且执行成功，进行归档
      if (taskConfig.type === 'once') {
        // 延迟一点归档，确保事件都发送完成
        setTimeout(() => this.archiveTask(taskId), 1000);
      }
      
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // 更新错误计数（如果 task 存在）
      if (task) {
        task.errorCount++;
      }
      
      // 记录执行历史
      this.addTaskHistory(taskId, {
        executionId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        success: false,
        exitCode: error.code || -1,
        error: error.message,
        output: error.stderr || ''
      });
      
      // 使用 warn 级别，任务失败不应该被视为系统错误
      this.log('warn', `任务执行失败，已跳过: ${taskConfig.name}`, {
        taskId,
        duration: `${Math.round(duration / 1000)}秒`,
        error: error.message
      });
      
      // 发送任务执行失败事件（供前端显示）
      this.emit('task_execution_failed', { 
        taskId, 
        executionId, 
        duration, 
        exitCode: error.code || -1,
        error: error.message,
        success: false
      });
      
      // 不抛出错误，让调度器继续运行
      
    } finally {
      // 清理运行状态
      this.runningTasks.delete(taskId);
      this.taskProcesses.delete(taskId);
    }
  }
  
  /**
   * 运行脚本 - 使用 ProcessManager 服务
   * @param {string} scriptPath - 脚本路径
   * @param {Array} args - 脚本参数
   * @param {string} taskId - 任务ID
   * @param {number} timeout - 超时时间（毫秒），可选
   */
  async runScript(scriptPath, args = [], taskId = null, timeout = null) {
    try {
      // 获取全局 processManager 服务实例
      const processManager = global.processManagerService;
      if (!processManager) {
        throw new Error('ProcessManager 服务未初始化');
      }

      // 使用 processManager 执行脚本
      const result = await processManager.executeScript({
        scriptPath,
        args,
        taskId,
        timeout, // 传递超时参数
        metadata: {
          type: 'scheduler_task',
          source: 'Scheduler'
        }
      });

      // 如果提供了taskId，记录进程信息
      if (taskId && result.processId) {
        this.taskProcesses.set(taskId, result.processId);
        // 更新运行状态中的PID
        if (this.runningTasks.has(taskId)) {
          const runningTask = this.runningTasks.get(taskId);
          runningTask.pid = result.processId;
          this.runningTasks.set(taskId, runningTask);
        }
      }

      // 等待进程执行完成
      const executionResult = await result.promise;
      
      // 清理进程记录
      if (taskId && this.taskProcesses.has(taskId)) {
        this.taskProcesses.delete(taskId);
      }

      return {
        code: executionResult.exitCode,
        stdout: executionResult.stdout || '',
        stderr: executionResult.stderr || ''
      };

    } catch (error) {
      // 清理进程记录
      if (taskId && this.taskProcesses.has(taskId)) {
        this.taskProcesses.delete(taskId);
      }
      
      // 重新抛出错误，保持原有的错误处理逻辑
      const wrappedError = new Error(`脚本执行失败: ${error.message}`);
      wrappedError.code = error.exitCode || -1;
      wrappedError.stderr = error.stderr || error.message;
      throw wrappedError;
    }
  }
  
  /**
   * 更新任务进度
   */
  updateTaskProgress(taskId, progress) {
    if (this.runningTasks.has(taskId)) {
      const runningTask = this.runningTasks.get(taskId);
      runningTask.progress = progress;
      this.runningTasks.set(taskId, runningTask);
      
      // 发送任务进度更新事件
      const runTime = Date.now() - runningTask.startTime.getTime();
      this.emit('task_execution_progress', {
        taskId,
        progress,
        runTime,
        executionId: runningTask.executionId
      });
    }
  }
  
  /**
   * 添加任务执行历史
   */
  addTaskHistory(taskId, record) {
    if (!this.taskHistory.has(taskId)) {
      this.taskHistory.set(taskId, []);
    }
    
    const history = this.taskHistory.get(taskId);
    history.unshift(record); // 最新的记录在前面
    
    // 只保留最近50条记录
    if (history.length > 50) {
      history.splice(50);
    }
    
    this.taskHistory.set(taskId, history);
  }
  
  /**
   * 停止调度器
   */
  async stop() {
    try {
      this.log('info', '内置调度器停止中...');
      
      // 停止所有任务
      this.stopAllTasks();
      
      // 停止系统级检查任务
      if (this.systemCron) {
        this.systemCron.stop();
        this.systemCron = null;
      }

      // 停止配置文件监听
      if (this.explorerInstance && this.explorerInstance.fileSystemManager) {
        this.explorerInstance.fileSystemManager.stopFileWatcher(this.configWatcherKey);
      } else if (this.fileSystemManager) {
        this.fileSystemManager.stopFileWatcher(this.configWatcherKey);
      }
      
      this.isRunning = false;
      
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      
      this.log('info', '内置调度器已停止', {
        uptime: `${Math.round(uptime / 1000)}秒`
      });
      
    } catch (error) {
      this.log('error', '停止调度器失败', { error: error.message });
      throw error;
    }
  }
  
  /**
   * 停止所有任务
   */
  stopAllTasks() {
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.cronTask) {
        task.cronTask.stop();
        this.log('info', `任务已停止: ${task.name}`, { taskId });
      }
    }
    this.tasks.clear();
  }
  
  /**
   * 启动系统级检查任务
   * 每分钟执行一次，检查一次性任务是否到期
   */
  startSystemCron() {
    if (this.systemCron) return;
    
    this.log('info', '启动系统级检查任务');
    
    // 每分钟执行一次
    this.systemCron = cron.schedule('* * * * *', () => {
      this.checkOneTimeTasks();
    });
  }
  
  /**
   * 检查一次性任务
   */
  checkOneTimeTasks() {
    // 使用 UTC 时间进行比较，确保时区一致性
    // ISO 8601 格式的时间字符串（如 "2025-11-20T15:00:00.000+08:00"）会被正确解析
    const now = new Date();
    
    for (const [taskId, task] of this.tasks.entries()) {
      // 只检查启用的一次性任务
      if (!task.enabled || task.type !== 'once') continue;
      
      try {
        const scheduleTime = new Date(task.schedule);
        
        // 检查时间是否有效
        if (isNaN(scheduleTime.getTime())) {
          this.log('warn', `任务时间格式无效: ${task.name}`, { taskId, schedule: task.schedule });
          continue;
        }
        
        // 如果当前时间已经超过设定时间，且任务未运行中
        // 注意：这里比较的是 UTC 时间戳，ISO 8601 字符串中的时区信息会被正确解析
        if (now >= scheduleTime && !this.runningTasks.has(taskId)) {
          const configTimezone = this.config?.settings?.timezone || 'Asia/Shanghai';
          this.log('info', `一次性任务到期，触发执行: ${task.name}`, { 
            taskId, 
            schedule: task.schedule,
            scheduleTime: scheduleTime.toISOString(),
            now: now.toISOString(),
            timezone: configTimezone
          });
          this.executeTask(taskId, task);
        }
      } catch (error) {
        this.log('error', `检查一次性任务出错: ${taskId}`, { error: error.message });
      }
    }
  }

  /**
   * 归档任务
   * 将执行成功的一次性任务移动到 completed_tasks
   */
  async archiveTask(taskId) {
    try {
      if (!this.config.completed_tasks) {
        this.config.completed_tasks = {};
      }
      
      // 获取任务配置
      const taskConfig = this.config.tasks[taskId];
      if (!taskConfig) return;
      
      // 移动到已完成列表
      this.config.completed_tasks[taskId] = {
        ...taskConfig,
        archivedAt: new Date().toISOString()
      };
      
      // 从当前任务列表中移除
      delete this.config.tasks[taskId];
      
      // 从内存中移除
      if (this.tasks.has(taskId)) {
        const task = this.tasks.get(taskId);
        if (task.cronTask) task.cronTask.stop();
        this.tasks.delete(taskId);
      }
      
      // 更新配置文件
      this.config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(BASE_CONFIG.CONFIG_FILE, JSON.stringify(this.config, null, 2));
      
      this.log('info', `任务已归档: ${taskConfig.name}`, { taskId });
      this.emit('task_archived', { taskId, name: taskConfig.name });
      this.emit('task_removed', { taskId }); // 通知前端移除
      
    } catch (error) {
      this.log('error', `归档任务失败: ${taskId}`, { error: error.message });
    }
  }

  /**
   * 归档过期的 once 任务
   * 在调度器启动时检查所有 once 类型的任务，
   * 如果计划执行时间已过期，则自动归档
   * 
   * 注意：时间比较基于 UTC 时间戳
   * - ISO 8601 格式字符串（如 "2025-11-20T15:00:00.000+08:00"）的时区信息会被正确解析
   * - 不含时区的时间字符串会被当作本地时间处理
   */
  async archiveExpiredOnceTasks() {
    try {
      if (!this.config || !this.config.tasks) {
        this.log('info', '没有任务配置，跳过过期任务检查');
        return;
      }

      const now = new Date();
      const configTimezone = this.config?.settings?.timezone || 'Asia/Shanghai';
      const expiredTaskIds = [];

      this.log('info', '开始检查过期的 once 任务...', {
        currentTime: now.toISOString(),
        configTimezone
      });

      // 遍历所有任务，找出过期的 once 任务
      for (const [taskId, taskConfig] of Object.entries(this.config.tasks)) {
        const type = taskConfig.type || 'cron';
        
        // 只检查 once 类型的任务
        if (type !== 'once') continue;

        try {
          const scheduleTime = new Date(taskConfig.schedule);
          
          // 检查时间是否有效
          if (isNaN(scheduleTime.getTime())) {
            this.log('warn', `任务 ${taskId} 的计划时间无效: ${taskConfig.schedule}`);
            continue;
          }

          // 如果计划时间已过期，加入待归档列表
          // 注意：这里比较的是 UTC 时间戳，ISO 8601 字符串中的时区信息会被正确解析
          if (scheduleTime < now) {
            expiredTaskIds.push({
              taskId,
              taskName: taskConfig.name,
              scheduleTime: taskConfig.schedule,
              scheduleTimeISO: scheduleTime.toISOString()
            });
          }
        } catch (error) {
          this.log('warn', `检查任务 ${taskId} 时出错`, { error: error.message });
        }
      }

      // 如果没有过期任务，直接返回
      if (expiredTaskIds.length === 0) {
        this.log('info', '启动时检查：没有过期的 once 任务需要归档');
        return;
      }

      this.log('info', `启动时检查：发现 ${expiredTaskIds.length} 个过期的 once 任务，开始归档...`, {
        expiredTasks: expiredTaskIds.map(t => t.taskId),
        timezone: configTimezone
      });

      // 逐个归档过期任务
      for (const { taskId, taskName, scheduleTime, scheduleTimeISO } of expiredTaskIds) {
        try {
          await this.archiveTask(taskId);
          this.log('info', `已自动归档过期的 once 任务: ${taskName}`, {
            taskId,
            originalSchedule: scheduleTime,
            scheduleTimeUTC: scheduleTimeISO,
            currentTimeUTC: now.toISOString(),
            timezone: configTimezone,
            reason: '启动时自动归档'
          });
        } catch (error) {
          this.log('error', `归档过期任务失败: ${taskId}`, { error: error.message });
        }
      }

      this.log('info', `启动时归档完成，共归档 ${expiredTaskIds.length} 个过期任务`);
      
    } catch (error) {
      this.log('error', '检查和归档过期 once 任务时出错', { error: error.message });
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    
    const taskStatus = Array.from(this.tasks.entries()).map(([taskId, task]) => ({
      id: taskId,
      name: task.name,
      schedule: task.schedule,
      enabled: task.enabled,
      lastRun: task.lastRun,
      runCount: task.runCount,
      errorCount: task.errorCount
    }));
    
    return {
      isRunning: this.isRunning,
      pid: process.pid,
      startTime: this.startTime,
      uptime: `${Math.round(uptime / 1000)}秒`,
      tasksCount: this.tasks.size,
      tasks: taskStatus,
      memoryUsage: process.memoryUsage(),
      logCount: this.logs.length
    };
  }
  
  /**
   * 手动执行任务
   */
  async runTask(taskId) {
    const taskConfig = this.config.tasks[taskId];
    if (!taskConfig) {
      throw new Error(`任务不存在: ${taskId}`);
    }
    
    this.log('info', `手动执行任务: ${taskConfig.name}`, { taskId });
    
    // 如果任务映射为空，先初始化一个临时任务对象
    if (!this.tasks.has(taskId)) {
      this.tasks.set(taskId, {
        ...taskConfig,
        cronTask: null,
        lastRun: null,
        nextRun: null,
        runCount: 0,
        errorCount: 0
      });
    }
    
    await this.executeTask(taskId, taskConfig);
  }
  
  /**
   * 启用/禁用任务
   */
  async toggleTask(taskId, enabled) {
    try {
      // 检查任务是否在配置文件中存在
      if (!this.config || !this.config.tasks || !this.config.tasks[taskId]) {
        throw new Error(`任务不存在: ${taskId}`);
      }
      
      const taskConfig = this.config.tasks[taskId];
      
      if (enabled) {
        // 启用任务：如果任务不在内存中，创建并启动
        if (!this.tasks.has(taskId)) {
          const timezone = this.config.settings?.timezone || 'Asia/Shanghai';
          const type = taskConfig.type || 'cron';
          
          let task = null;
          
          if (type === 'cron') {
            task = cron.schedule(taskConfig.schedule, () => {
              this.executeTask(taskId, taskConfig);
            }, {
              scheduled: false,
              timezone
            });
          }
          
          this.tasks.set(taskId, {
            ...taskConfig,
            type,
            cronTask: task,
            lastRun: null,
            nextRun: null,
            runCount: 0,
            errorCount: 0,
            enabled: true
          });
          
          if (this.isRunning && task) {
            task.start();
          }
        } else {
          // 任务已在内存中，只需启动
          const task = this.tasks.get(taskId);
          task.enabled = true;
          if (this.isRunning && task.cronTask) {
            task.cronTask.start();
          }
        }
      } else {
        // 禁用任务：如果任务在内存中，停止并从内存中移除
        if (this.tasks.has(taskId)) {
          const task = this.tasks.get(taskId);
          if (task.cronTask) {
            task.cronTask.stop();
          }
          this.tasks.delete(taskId);
        }
      }
      
      // 更新配置文件
      this.updateConfigFile(taskId, { ...taskConfig, enabled });
      
      this.log('info', `任务${enabled ? '已启用' : '已禁用'}: ${taskConfig.name}`, { taskId });
      this.emit('task_toggled', { taskId, enabled });
      
      return true;
      
    } catch (error) {
      this.log('error', `切换任务状态失败: ${taskId}`, { error: error.message });
      throw error;
    }
  }
  
  /**
   * 更新配置文件中的任务
   */
  updateConfigFile(taskId, taskConfig) {
    try {
      if (!this.config.tasks) {
        this.config.tasks = {};
      }
      
      this.config.tasks[taskId] = { ...taskConfig };
      delete this.config.tasks[taskId].cronTask; // 移除不可序列化的对象
      
      this.config.lastUpdated = new Date().toISOString();
      
      fs.writeFileSync(BASE_CONFIG.CONFIG_FILE, JSON.stringify(this.config, null, 2));
      
    } catch (error) {
      this.log('error', '更新配置文件失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 添加新任务
   * @param {string} taskId 任务ID
   * @param {Object} taskConfig 任务配置
   * @returns {Object} 创建的任务详情
   */
  addTask(taskId, taskConfig) {
    try {
      // 检查任务ID是否已存在
      if (this.config.tasks && this.config.tasks[taskId]) {
        throw new Error(`任务ID已存在: ${taskId}`);
      }

      // 验证任务配置（脚本不存在只作为警告）
      const validationResult = ConfigValidator.validateTask(taskConfig);
      if (validationResult.errors.length > 0) {
        throw new Error(`任务配置验证失败: ${validationResult.errors.join('; ')}`);
      }
      
      // 保存警告信息
      if (validationResult.warnings.length > 0) {
        if (!this.taskWarnings) this.taskWarnings = {};
        this.taskWarnings[taskId] = validationResult.warnings;
        this.log('warn', `任务 ${taskId} 有警告`, { warnings: validationResult.warnings });
      }

      // 设置默认值
      const newTaskConfig = {
        ...taskConfig,
        type: taskConfig.type || 'cron',
        enabled: taskConfig.enabled !== undefined ? taskConfig.enabled : true,
        args: taskConfig.args || [],
        tags: taskConfig.tags || [],
        timeout: taskConfig.timeout || 28800000, // 默认8小时
        retryOnFailure: taskConfig.retryOnFailure || false,
        maxRetries: taskConfig.maxRetries || 0
      };

      // 更新配置文件
      this.updateConfigFile(taskId, newTaskConfig);

      // 如果任务启用且调度器正在运行，立即注册任务
      if (newTaskConfig.enabled && this.isRunning) {
        this.initializeSingleTask(taskId, newTaskConfig);
      }

      this.log('info', `任务已创建: ${newTaskConfig.name}`, { taskId });
      this.emit('task_added', { taskId, task: newTaskConfig });

      return this.getTaskDetails(taskId);
    } catch (error) {
      this.log('error', `创建任务失败: ${taskId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 更新任务
   * @param {string} taskId 任务ID
   * @param {Object} taskConfig 新的任务配置
   * @returns {Object} 更新后的任务详情
   */
  updateTask(taskId, taskConfig) {
    try {
      // 检查任务是否存在
      if (!this.config.tasks || !this.config.tasks[taskId]) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      // 验证任务配置（脚本不存在只作为警告）
      const validationResult = ConfigValidator.validateTask(taskConfig);
      if (validationResult.errors.length > 0) {
        throw new Error(`任务配置验证失败: ${validationResult.errors.join('; ')}`);
      }
      
      // 更新警告信息
      if (!this.taskWarnings) this.taskWarnings = {};
      if (validationResult.warnings.length > 0) {
        this.taskWarnings[taskId] = validationResult.warnings;
        this.log('warn', `任务 ${taskId} 有警告`, { warnings: validationResult.warnings });
      } else {
        delete this.taskWarnings[taskId];
      }

      const oldTaskConfig = this.config.tasks[taskId];
      const wasEnabled = oldTaskConfig.enabled !== false;
      const willBeEnabled = taskConfig.enabled !== false;

      // 如果任务正在运行，需要先停止
      if (this.tasks.has(taskId)) {
        const task = this.tasks.get(taskId);
        if (task.cronTask) {
          task.cronTask.stop();
        }
        this.tasks.delete(taskId);
      }

      // 合并配置，保留原有配置中未提供的字段
      const updatedTaskConfig = {
        ...oldTaskConfig,
        ...taskConfig,
        type: taskConfig.type || oldTaskConfig.type || 'cron',
        enabled: taskConfig.enabled !== undefined ? taskConfig.enabled : wasEnabled
      };

      // 更新配置文件
      this.updateConfigFile(taskId, updatedTaskConfig);

      // 如果任务启用且调度器正在运行，重新注册任务
      if (updatedTaskConfig.enabled && this.isRunning) {
        this.initializeSingleTask(taskId, updatedTaskConfig);
      }

      this.log('info', `任务已更新: ${updatedTaskConfig.name}`, { taskId });
      this.emit('task_updated', { taskId, task: updatedTaskConfig });

      return this.getTaskDetails(taskId);
    } catch (error) {
      this.log('error', `更新任务失败: ${taskId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 删除任务
   * @param {string} taskId 任务ID
   * @returns {boolean} 是否删除成功
   */
  deleteTask(taskId) {
    try {
      // 检查任务是否存在
      if (!this.config.tasks || !this.config.tasks[taskId]) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      const taskConfig = this.config.tasks[taskId];

      // 如果任务正在运行，先停止
      if (this.tasks.has(taskId)) {
        const task = this.tasks.get(taskId);
        if (task.cronTask) {
          task.cronTask.stop();
        }
        this.tasks.delete(taskId);
      }

      // 如果任务正在执行，取消执行
      if (this.runningTasks.has(taskId)) {
        this.log('warn', `任务正在执行中，尝试取消: ${taskId}`);
        // 注意：这里只是从跟踪中移除，实际进程可能需要手动终止
        this.runningTasks.delete(taskId);
      }

      // 从配置文件中删除
      delete this.config.tasks[taskId];
      this.config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(BASE_CONFIG.CONFIG_FILE, JSON.stringify(this.config, null, 2));

      // 清理历史记录
      this.taskHistory.delete(taskId);
      this.taskProcesses.delete(taskId);

      this.log('info', `任务已删除: ${taskConfig.name}`, { taskId });
      this.emit('task_removed', { taskId, task: taskConfig });

      return true;
    } catch (error) {
      this.log('error', `删除任务失败: ${taskId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * 初始化单个任务（用于动态添加/更新任务）
   * @param {string} taskId 任务ID
   * @param {Object} taskConfig 任务配置
   */
  initializeSingleTask(taskId, taskConfig) {
    try {
      if (!taskConfig.enabled) {
        return;
      }

      const type = taskConfig.type || 'cron';
      let task = null;

      if (type === 'cron') {
        const timezone = this.config.settings?.timezone || 'Asia/Shanghai';
        task = cron.schedule(taskConfig.schedule, () => {
          this.executeTask(taskId, taskConfig);
        }, {
          scheduled: false,
          timezone
        });
      }

      // 注册任务到内存映射
      this.tasks.set(taskId, {
        ...taskConfig,
        type,
        cronTask: task,
        lastRun: null,
        nextRun: null,
        runCount: 0,
        errorCount: 0
      });

      // 如果是定时任务，启动它
      if (task && this.isRunning) {
        task.start();
      }

      this.log('info', `任务已注册: ${taskConfig.name} [${type}]`, {
        taskId,
        schedule: taskConfig.schedule
      });
    } catch (error) {
      this.log('error', `注册任务失败: ${taskConfig.name}`, {
        taskId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * 获取任务详情
   */
  getTaskDetails(taskId) {
    // 获取任务警告信息
    const taskWarnings = this.taskWarnings?.[taskId] || [];
    const scriptExists = !taskWarnings.some(w => w.includes('脚本文件不存在'));
    
    if (!this.tasks.has(taskId)) {
      // 如果任务不在内存中，从配置文件获取
      const taskConfig = this.config?.tasks?.[taskId];
      if (taskConfig) {
        return {
          id: taskId,
          name: taskConfig.name,
          description: taskConfig.description || '',
          type: taskConfig.type || 'cron',
          schedule: taskConfig.schedule,
          script: taskConfig.script,
          args: taskConfig.args || [],
          enabled: taskConfig.enabled,
          timeout: taskConfig.timeout || 0,
          retryOnFailure: taskConfig.retryOnFailure || false,
          maxRetries: taskConfig.maxRetries || 0,
          tags: taskConfig.tags || [],
          lastRun: null,
          runCount: 0,
          errorCount: 0,
          isRunning: false,
          scriptExists: scriptExists,
          warnings: taskWarnings
        };
      }
      return null;
    }
    
    const task = this.tasks.get(taskId);
    return {
      id: taskId,
      name: task.name,
      description: task.description || '',
      type: task.type || 'cron',
      schedule: task.schedule,
      script: task.script,
      args: task.args || [],
      enabled: task.enabled,
      timeout: task.timeout || 0,
      retryOnFailure: task.retryOnFailure || false,
      maxRetries: task.maxRetries || 0,
      tags: task.tags || [],
      lastRun: task.lastRun,
      runCount: task.runCount,
      errorCount: task.errorCount,
      isRunning: task.cronTask ? task.cronTask.running : false,
      scriptExists: scriptExists,
      warnings: taskWarnings
    };
  }
  
  /**
   * 获取所有任务列表
   */
  getAllTasks() {
    const tasks = [];
    
    // 遍历配置文件中的所有任务，而不仅仅是内存中的启用任务
    if (this.config && this.config.tasks) {
      for (const [taskId, taskConfig] of Object.entries(this.config.tasks)) {
        // 获取任务警告信息
        const taskWarnings = this.taskWarnings?.[taskId] || [];
        const scriptExists = !taskWarnings.some(w => w.includes('脚本文件不存在'));
        
        // 如果任务在内存中（启用的），使用内存中的详细信息
        if (this.tasks.has(taskId)) {
          const taskDetails = this.getTaskDetails(taskId);
          // 添加运行状态信息
          taskDetails.isRunning = this.runningTasks.has(taskId);
          if (taskDetails.isRunning) {
            const runningInfo = this.runningTasks.get(taskId);
            taskDetails.runTime = Date.now() - runningInfo.startTime.getTime();
            taskDetails.progress = runningInfo.progress;
            taskDetails.pid = runningInfo.pid;
          }
          tasks.push(taskDetails);
        } else {
          // 如果任务不在内存中（禁用的），从配置文件创建任务信息
          tasks.push({
            id: taskId,
            name: taskConfig.name,
            description: taskConfig.description || '',
            type: taskConfig.type || 'cron',
            schedule: taskConfig.schedule,
            script: taskConfig.script,
            args: taskConfig.args || [],
            enabled: taskConfig.enabled,
            timeout: taskConfig.timeout || 0,
            retryOnFailure: taskConfig.retryOnFailure || false,
            maxRetries: taskConfig.maxRetries || 0,
            tags: taskConfig.tags || [],
            lastRun: null,
            runCount: 0,
            errorCount: 0,
            isRunning: false,
            runTime: 0,
            progress: null,
            pid: null,
            scriptExists: scriptExists,
            warnings: taskWarnings
          });
        }
      }
    }
    
    return tasks;
  }
  
  /**
   * 获取归档任务列表
   */
  getArchivedTasks() {
    const tasks = [];
    
    if (this.config && this.config.completed_tasks) {
      for (const [taskId, taskConfig] of Object.entries(this.config.completed_tasks)) {
        tasks.push({
          id: taskId,
          ...taskConfig
        });
      }
    }
    
    // 按归档时间倒序排序
    return tasks.sort((a, b) => {
      const timeA = new Date(a.archivedAt || 0).getTime();
      const timeB = new Date(b.archivedAt || 0).getTime();
      return timeB - timeA;
    });
  }

  /**
   * 获取任务执行历史
   */
  getTaskHistory(taskId) {
    const taskConfig = this.config?.tasks?.[taskId];
    if (!taskConfig) {
      throw new Error(`任务不存在: ${taskId}`);
    }
    
    return this.taskHistory.get(taskId) || [];
  }
  
  /**
   * 处理配置文件变化
   */
  handleConfigFileChange(data) {
    this.log('info', '检测到配置文件变化，正在重新加载...', { 
      filePath: path.basename(data.fullPath),
      changeType: data.type
    });
    
    // 延迟一点重新加载，避免文件正在写入时读取
    setTimeout(() => {
      this.reloadConfig();
    }, 1000);
  }
  
  /**
   * 设置配置文件监听
   */
  setupConfigWatcher() {
    // 尝试获取 Explorer 实例（如果之前获取失败）
    if (!this.explorerInstance) {
      this.explorerInstance = global.explorerInstance;
    }
    
    let fileSystemManager = null;
    let managerType = '';
    
    // 优先使用 Explorer 的 FileSystemManager
    if (this.explorerInstance && this.explorerInstance.fileSystemManager) {
      fileSystemManager = this.explorerInstance.fileSystemManager;
      managerType = 'Explorer';
    } else if (this.fileSystemManager) {
      // 回退到独立的 FileSystemManager
      fileSystemManager = this.fileSystemManager;
      managerType = 'Fallback';
    }
    
    if (!fileSystemManager) {
      this.log('error', '没有可用的 FileSystemManager，无法设置配置文件监听');
      return;
    }
    
    try {
      // 停止现有的监控器（如果存在）
      fileSystemManager.stopFileWatcher(this.configWatcherKey);
      
      // 获取当前使用的配置文件路径
      const configFile = BASE_CONFIG.CONFIG_FILE;
      const configDir = path.dirname(configFile);
      const workDir = fileSystemManager.workDir;
      
      // 计算配置文件相对于 FileSystemManager 工作目录的路径
      let relativeConfigDir = null;
      try {
        relativeConfigDir = path.relative(workDir, configDir);
      } catch (error) {
        // 如果路径不在 workDir 下，尝试使用绝对路径监控
        this.log('warn', '配置文件不在 FileSystemManager 工作目录下，尝试监控绝对路径', {
          configFile: configFile,
          workDir: workDir
        });
        // 对于 Explorer 的 FileSystemManager，可能需要特殊处理
        relativeConfigDir = configDir;
      }
      
      // 设置配置文件监听
      const watcher = fileSystemManager.setupFileWatcher({
        path: relativeConfigDir,
        key: this.configWatcherKey,
        name: '调度器配置文件监控',
        description: '监控调度器配置文件变化并自动重新加载',
        excludePatterns: [
          '**/*.tmp',
          '**/*.bak',
          '**/*~'
        ]
      });
      
      if (watcher) {
        this.log('info', '配置文件监听已启动', { 
          configFile: configFile,
          watchPath: relativeConfigDir,
          managerType: `${managerType} FileSystemManager`
        });
      } else {
        this.log('error', '启动配置文件监听失败');
      }
      
    } catch (error) {
      this.log('error', '启动配置文件监听失败', { error: error.message });
    }
  }
  
  /**
   * 重新加载配置
   */
  reloadConfig() {
    try {
      this.log('info', '开始重新加载配置...');
      
      // 停止所有任务
      this.stopAllTasks();
      
      // 清空旧的警告信息
      this.configWarnings = [];
      this.taskWarnings = {};
      
      // 重新加载配置
      this.loadConfig();
      
      // 重新初始化任务
      if (this.isRunning) {
        this.initializeTasks();
      }
      
      this.emit('config_reloaded', this.config);
      this.log('info', '配置重新加载成功');
      
    } catch (error) {
      this.log('error', '重新加载配置失败', { error: error.message });
    }
  }
  
  /**
   * 获取配置警告信息
   */
  getConfigWarnings() {
    return {
      configWarnings: this.configWarnings || [],
      taskWarnings: this.taskWarnings || {}
    };
  }
}

/**
 * 设置调度器管理服务
 * @param {Object} options 服务配置选项
 * @returns {SchedulerService} 调度器管理服务实例
 */
function setupSchedulerService(options = {}) {
  class SchedulerService extends EventEmitter {
    /**
     * 初始化调度器管理服务
     * @param {Object} options 配置选项
     */
    constructor(options = {}) {
      super();
      
      // 设置工作目录（如果提供）
      if (options.workDir) {
        setWorkDir(options.workDir);
      }
      
      this.serviceName = options.serviceName || 'Scheduler';
      this.enableLogging = options.enableLogging !== false;
      this.autoStartScheduler = options.autoStartScheduler !== false;
      
      // 服务状态
      this.isRunning = false;
      this.startTime = null;
      
      // 调度器实例
      this.scheduler = null;
      this.schedulerStatus = 'stopped'; // stopped, starting, running, stopping, error
      
      // 日志存储
      this.logs = [];
      this.maxLogs = options.maxLogs || 1000;
      
      // WebSocket连接管理（用于实时更新）
      this.wsConnections = new Set();
      
      // 日志记录器
      this.logger = console;
      
      if (this.enableLogging) {
        this.logger.info(`${this.serviceName}服务初始化完成`);
      }
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
     * 日志记录
     */
    log(level, message, data = {}) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        service: this.serviceName,
        ...data
      };
      
      this.logs.push(logEntry);
      
      // 输出到控制台（添加时间戳）
      if (this.enableLogging) {
        const timestamp = this.formatTimestamp();
        console.log(`[${timestamp}] [${this.serviceName}] [${level.toUpperCase()}] ${message}`, data);
      }
      
      // 保持日志数组大小
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-Math.floor(this.maxLogs / 2));
      }
      
      // 发送日志事件
      this.emit('log', logEntry);
      
      // 通过WebSocket广播日志
      this.broadcastToClients('log', logEntry);
    }

    /**
     * 启动调度器管理服务
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
        this.startTime = new Date();
        
        // 更新配置
        if (config.autoStartScheduler !== undefined) this.autoStartScheduler = config.autoStartScheduler;
        if (config.enableLogging !== undefined) this.enableLogging = config.enableLogging;
        
        // 初始化调度器
        await this.initializeScheduler();
        
        // 如果启用自动启动，则启动调度器
        if (this.autoStartScheduler) {
          await this.startScheduler();
        }
        
        this.isRunning = true;
        
        this.logger.info(`${this.serviceName}服务已启动`);
        this.emit('started', { 
          serviceName: this.serviceName,
          startTime: this.startTime,
          config: this.getServiceConfig()
        });
        
        return true;
        
      } catch (error) {
        this.logger.error(`启动${this.serviceName}服务失败:`, error.message);
        this.emit('error', { type: 'start', error });
        throw error;
      }
    }

    /**
     * 停止调度器管理服务
     * @returns {Promise<boolean>} 停止是否成功
     */
    async stop() {
      try {
        if (!this.isRunning) {
          this.logger.warn(`${this.serviceName}服务未运行`);
          return true;
        }

        this.logger.info(`正在停止${this.serviceName}服务...`);
        
        // 停止调度器
        if (this.scheduler) {
          await this.stopScheduler();
        }
        
        // 清理WebSocket连接
        this.wsConnections.clear();
        
        this.isRunning = false;
        
        const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
        this.logger.info(`${this.serviceName}服务已停止`, {
          uptime: `${Math.round(uptime / 1000)}秒`
        });
        
        this.emit('stopped', { 
          serviceName: this.serviceName,
          uptime 
        });
        
        return true;
        
      } catch (error) {
        this.logger.error(`停止${this.serviceName}服务失败:`, error.message);
        this.emit('error', { type: 'stop', error });
        throw error;
      }
    }

    /**
     * 初始化调度器
     */
    async initializeScheduler() {
      try {
        this.schedulerStatus = 'starting';
        this.log('info', '初始化调度器...');
        
        this.scheduler = new InternalScheduler();
        
        // 监听调度器事件
        this.scheduler.on('task_added', (data) => {
          this.log('info', '任务已添加', data);
          this.broadcastToClients('task_added', data);
        });
        
        this.scheduler.on('task_updated', (data) => {
          this.log('info', '任务已更新', data);
          this.broadcastToClients('task_updated', data);
        });
        
        this.scheduler.on('task_removed', (data) => {
          this.log('info', '任务已删除', data);
          this.broadcastToClients('task_removed', data);
        });
        
        this.scheduler.on('task_toggled', (data) => {
          this.log('info', '任务状态已切换', data);
          this.broadcastToClients('task_toggled', data);
        });
        
        this.scheduler.on('task_archived', (data) => {
          this.log('info', '任务已归档', data);
          this.broadcastToClients('task_archived', data);
        });

        this.scheduler.on('config_reloaded', (config) => {
          this.log('info', '配置已重新加载');
          this.broadcastToClients('config_reloaded', { version: config.version });
        });
        
        this.scheduler.on('health_check', (status) => {
          this.broadcastToClients('health_check', status);
        });
        
        // 监听任务执行事件
        this.scheduler.on('task_execution_started', (data) => {
          this.log('info', '任务开始执行', data);
          this.broadcastToClients('task_execution_started', data);
        });
        
        this.scheduler.on('task_execution_completed', (data) => {
          this.log('info', '任务执行完成', data);
          this.broadcastToClients('task_execution_completed', data);
          // 转发事件到 EventEmitter，供其他服务监听
          this.emit('task_execution_completed', data);
        });
        
        this.scheduler.on('task_execution_failed', (data) => {
          this.log('warn', '任务执行失败', data);
          this.broadcastToClients('task_execution_failed', data);
          // 转发事件到 EventEmitter，供其他服务监听
          this.emit('task_execution_failed', data);
        });
        
        this.scheduler.on('task_execution_skipped', (data) => {
          this.log('warn', '任务已跳过', data);
          this.broadcastToClients('task_execution_skipped', data);
          // 转发事件到 EventEmitter，供其他服务监听
          this.emit('task_execution_skipped', data);
        });
        
        this.scheduler.on('task_execution_progress', (data) => {
          this.broadcastToClients('task_execution_progress', data);
        });
        
        // 监听 FileSystemManager 事件（优先 Explorer，回退到独立实例）
        let fileSystemManager = this.scheduler.explorerInstance?.fileSystemManager || this.scheduler.fileSystemManager;
        if (fileSystemManager) {
          fileSystemManager.on('fileChange', (data) => {
            this.log('info', '文件变化', data);
            this.broadcastToClients('fileChange', data);
          });
          
          fileSystemManager.on('watcherError', (data) => {
            this.log('error', '文件监控错误', data);
            this.broadcastToClients('watcherError', data);
          });
          
          fileSystemManager.on('watcherReady', (data) => {
            this.log('info', '文件监控就绪', data);
            this.broadcastToClients('watcherReady', data);
          });
        }
        
        // 监听 Explorer 的 webhook 事件（方案2：直接监听全局Explorer事件）
        this.setupExplorerWebhookListener();
        
        this.schedulerStatus = 'initialized';
        this.log('info', '调度器初始化完成');
        
      } catch (error) {
        this.schedulerStatus = 'error';
        this.log('error', '初始化调度器失败', { error: error.message });
        throw error;
      }
    }

    /**
     * 启动调度器
     */
    async startScheduler() {
      try {
        if (!this.scheduler) {
          await this.initializeScheduler();
        }
        
        if (this.scheduler.isRunning) {
          this.log('warn', '调度器已在运行中');
          return;
        }
        
        this.schedulerStatus = 'starting';
        this.log('info', '启动调度器...');
        
        await this.scheduler.start();
        
        this.schedulerStatus = 'running';
        this.log('info', '调度器启动成功');
        this.broadcastToClients('scheduler_started');
        
      } catch (error) {
        this.schedulerStatus = 'error';
        this.log('error', '启动调度器失败', { error: error.message });
        throw error;
      }
    }

    /**
     * 停止调度器
     */
    async stopScheduler() {
      try {
        if (!this.scheduler) {
          this.log('warn', '调度器未初始化');
          return;
        }
        
        if (!this.scheduler.isRunning) {
          this.log('warn', '调度器未运行');
          return;
        }
        
        this.schedulerStatus = 'stopping';
        this.log('info', '停止调度器...');
        
        await this.scheduler.stop();
        
        this.schedulerStatus = 'stopped';
        this.log('info', '调度器已停止');
        this.broadcastToClients('scheduler_stopped');
        
      } catch (error) {
        this.schedulerStatus = 'error';
        this.log('error', '停止调度器失败', { error: error.message });
        throw error;
      }
    }

    /**
     * 获取服务配置
     * @returns {Object} 服务配置信息
     */
    getServiceConfig() {
      return {
        serviceName: this.serviceName,
        enableLogging: this.enableLogging,
        autoStartScheduler: this.autoStartScheduler,
        maxLogs: this.maxLogs
      };
    }

    /**
     * 获取服务状态
     */
    getServiceStatus() {
      const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
      
      return {
        service: {
          name: this.serviceName,
          isRunning: this.isRunning,
          startTime: this.startTime,
          uptime: `${Math.round(uptime / 1000)}秒`,
          autoStartScheduler: this.autoStartScheduler
        },
        scheduler: {
          status: this.schedulerStatus,
          isRunning: this.scheduler ? this.scheduler.isRunning : false,
          tasksCount: this.scheduler ? this.scheduler.tasks.size : 0,
          runningTasksCount: this.scheduler ? this.scheduler.runningTasks.size : 0
        },
        system: {
          memoryUsage: process.memoryUsage(),
          logCount: this.logs.length,
          wsConnections: this.wsConnections.size
        },
        settings: {
          timezone: this.scheduler?.config?.settings?.timezone || 'Asia/Shanghai'
        }
      };
    }

    /**
     * 设置HTTP路由和WebSocket
     * @param {Object} app Express应用实例
     * @param {Object} io Socket.IO实例
     * @returns {Object} 返回app实例以支持链式调用
     */
    setupRoutes(app, io = null) {
      // 如果提供了Socket.IO实例，设置WebSocket支持
      if (io) {
        this.setupSocketIO(io);
      }

      // 静态文件服务 - 调度器管理界面
      app.use('/scheduler', require('express').static(path.join(__dirname, 'html')));

      // 服务状态路由
      app.get('/api/scheduler/status', (req, res) => {
        try {
          const status = this.getServiceStatus();
          res.json({ success: true, data: status });
        } catch (error) {
          this.logger.error('获取服务状态失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 启动调度器
      app.post('/api/scheduler/scheduler/start', async (req, res) => {
        try {
          await this.startScheduler();
          res.json({ 
            success: true, 
            message: '调度器启动成功',
            data: this.getSchedulerStatus()
          });
        } catch (error) {
          this.logger.error('启动调度器失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 停止调度器
      app.post('/api/scheduler/scheduler/stop', async (req, res) => {
        try {
          await this.stopScheduler();
          res.json({ 
            success: true, 
            message: '调度器停止成功',
            data: this.getSchedulerStatus()
          });
        } catch (error) {
          this.logger.error('停止调度器失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 获取调度器状态
      app.get('/api/scheduler/scheduler/status', (req, res) => {
        try {
          const status = this.getSchedulerStatus();
          res.json({ success: true, data: status });
        } catch (error) {
          this.logger.error('获取调度器状态失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 获取所有任务
      app.get('/api/scheduler/tasks', (req, res) => {
        try {
          const tasks = this.getAllTasks();
          res.json({ success: true, data: tasks });
        } catch (error) {
          this.logger.error('获取任务列表失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 获取归档任务
      app.get('/api/scheduler/tasks/archived', (req, res) => {
        try {
          const tasks = this.getArchivedTasks();
          res.json({ success: true, data: tasks });
        } catch (error) {
          this.logger.error('获取归档任务列表失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 手动执行任务
      app.post('/api/scheduler/tasks/:taskId/run', async (req, res) => {
        try {
          const { taskId } = req.params;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          // 异步执行任务，不等待完成
          this.scheduler.runTask(taskId).catch(error => {
            this.logger.error(`手动执行任务失败: ${taskId}`, error.message);
          });
          
          res.json({ 
            success: true, 
            message: `任务 ${taskId} 开始执行` 
          });
        } catch (error) {
          this.logger.error('执行任务失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 切换任务状态
      app.patch('/api/scheduler/tasks/:taskId/toggle', async (req, res) => {
        try {
          const { taskId } = req.params;
          const { enabled } = req.body;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          if (typeof enabled !== 'boolean') {
            throw new Error('enabled 参数必须是布尔值');
          }
          
          await this.scheduler.toggleTask(taskId, enabled);
          
          res.json({ 
            success: true, 
            message: `任务 ${taskId} ${enabled ? '已启用' : '已禁用'}`,
            data: this.scheduler.getTaskDetails(taskId)
          });
        } catch (error) {
          this.logger.error('切换任务状态失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 获取任务执行历史
      app.get('/api/scheduler/tasks/:taskId/history', (req, res) => {
        try {
          const { taskId } = req.params;
          const { limit = 20, offset = 0 } = req.query;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          const history = this.scheduler.getTaskHistory(taskId);
          const paginatedHistory = history.slice(
            parseInt(offset), 
            parseInt(offset) + parseInt(limit)
          );
          
          res.json({
            success: true,
            data: {
              history: paginatedHistory,
              total: history.length,
              limit: parseInt(limit),
              offset: parseInt(offset)
            }
          });
        } catch (error) {
          this.logger.error('获取任务历史失败:', error);
          res.status(404).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 手动归档任务
      app.post('/api/scheduler/tasks/:taskId/archive', async (req, res) => {
        try {
          const { taskId } = req.params;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          // 检查任务是否存在
          const taskDetails = this.scheduler.getTaskDetails(taskId);
          if (!taskDetails) {
            throw new Error(`任务 ${taskId} 不存在`);
          }
          
          // 检查任务类型，只有一次性任务可以手动归档
          const taskType = taskDetails.type || 'cron';
          if (taskType !== 'once') {
            throw new Error('只有一次性任务可以手动归档');
          }
          
          // 执行归档
          await this.scheduler.archiveTask(taskId);
          
          res.json({ 
            success: true, 
            message: `任务 ${taskId} 已归档`
          });
        } catch (error) {
          this.logger.error('归档任务失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 创建新任务
      app.post('/api/scheduler/tasks', async (req, res) => {
        try {
          const { taskId, ...taskConfig } = req.body;
          
          if (!taskId) {
            throw new Error('taskId 参数是必需的');
          }
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          const task = await this.scheduler.addTask(taskId, taskConfig);
          
          res.json({
            success: true,
            message: `任务 ${taskId} 创建成功`,
            data: task
          });
        } catch (error) {
          this.logger.error('创建任务失败:', error);
          res.status(400).json({
            success: false,
            error: error.message
          });
        }
      });

      // 更新任务
      app.put('/api/scheduler/tasks/:taskId', async (req, res) => {
        try {
          const { taskId } = req.params;
          const taskConfig = req.body;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          const task = await this.scheduler.updateTask(taskId, taskConfig);
          
          res.json({
            success: true,
            message: `任务 ${taskId} 更新成功`,
            data: task
          });
        } catch (error) {
          this.logger.error('更新任务失败:', error);
          res.status(400).json({
            success: false,
            error: error.message
          });
        }
      });

      // 删除任务
      app.delete('/api/scheduler/tasks/:taskId', async (req, res) => {
        try {
          const { taskId } = req.params;
          
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          await this.scheduler.deleteTask(taskId);
          
          res.json({
            success: true,
            message: `任务 ${taskId} 删除成功`
          });
        } catch (error) {
          this.logger.error('删除任务失败:', error);
          res.status(400).json({
            success: false,
            error: error.message
          });
        }
      });

      // 获取服务日志
      app.get('/api/scheduler/logs', (req, res) => {
        try {
          const { limit = 100, level } = req.query;
          let logs = this.logs;
          
          if (level) {
            logs = logs.filter(log => log.level === level);
          }
          
          logs = logs.slice(-parseInt(limit));
          
          res.json({ success: true, data: logs });
        } catch (error) {
          this.logger.error('获取日志失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      // 获取配置目录结构
      app.get('/api/scheduler/config-directory', (req, res) => {
        try {
          if (!this.scheduler) {
            throw new Error('调度器未初始化');
          }
          
          const structure = this.scheduler.getConfigDirectoryStructure();
          res.json({ success: true, data: structure });
        } catch (error) {
          this.logger.error('获取配置目录结构失败:', error);
          res.status(500).json({ 
            success: false, 
            error: error.message 
          });
        }
      });

      this.logger.info(`${this.serviceName} HTTP路由已设置`);
      return app;
    }

    /**
     * 设置Socket.IO WebSocket支持
     * @param {Object} io Socket.IO实例
     */
    setupSocketIO(io) {
      const namespace = io.of('/scheduler');
      
      namespace.on('connection', (socket) => {
        this.wsConnections.add(socket);
        this.logger.info(`调度器管理WebSocket连接已建立: ${socket.id}`);
        
        // 发送当前状态
        socket.emit('status', this.getServiceStatus());
        
        socket.on('disconnect', () => {
          this.wsConnections.delete(socket);
          this.logger.info(`调度器管理WebSocket连接已断开: ${socket.id}`);
        });
        
        // 监听客户端请求
        socket.on('getStatus', () => {
          socket.emit('status', this.getServiceStatus());
        });
        
        socket.on('getTasks', () => {
          socket.emit('tasks', this.getAllTasks());
        });

        socket.on('getArchivedTasks', () => {
          socket.emit('archived_tasks', this.getArchivedTasks());
        });
        
        // 重新加载配置
        socket.on('reloadConfig', async () => {
          try {
            if (this.scheduler) {
              this.scheduler.reloadConfig();
              socket.emit('config_reloaded', { success: true });
            } else {
              socket.emit('config_reloaded', { success: false, error: '调度器未初始化' });
            }
          } catch (error) {
            socket.emit('config_reloaded', { success: false, error: error.message });
          }
        });
        
        // 取消任务执行
        socket.on('cancelTask', async (data) => {
          try {
            const { taskId } = data;
            if (this.scheduler) {
              // 这里需要实现取消任务的逻辑
              // 由于当前调度器没有直接的取消方法，我们发送一个事件通知
              socket.emit('task_cancelled', { taskId, success: true });
              this.log('info', `任务取消请求: ${taskId}`);
            } else {
              socket.emit('task_cancelled', { taskId, success: false, error: '调度器未初始化' });
            }
          } catch (error) {
            socket.emit('task_cancelled', { taskId: data.taskId, success: false, error: error.message });
          }
        });
        
        // 手动归档任务
        socket.on('archiveTask', async (data) => {
          try {
            const { taskId } = data;
            if (!this.scheduler) {
              socket.emit('task_archived', { taskId, success: false, error: '调度器未初始化' });
              return;
            }
            
            // 检查任务是否存在
            const taskDetails = this.scheduler.getTaskDetails(taskId);
            if (!taskDetails) {
              socket.emit('task_archived', { taskId, success: false, error: `任务 ${taskId} 不存在` });
              return;
            }
            
            // 检查任务类型，只有一次性任务可以手动归档
            const taskType = taskDetails.type || 'cron';
            if (taskType !== 'once') {
              socket.emit('task_archived', { taskId, success: false, error: '只有一次性任务可以手动归档' });
              return;
            }
            
            // 执行归档
            await this.scheduler.archiveTask(taskId);
            
            socket.emit('task_archived', { taskId, success: true, message: `任务 ${taskId} 已归档` });
            this.log('info', `任务已归档: ${taskId}`);
          } catch (error) {
            socket.emit('task_archived', { taskId: data.taskId, success: false, error: error.message });
            this.log('error', `归档任务失败: ${data.taskId}`, { error: error.message });
          }
        });
        
        // 获取文件监控状态
        socket.on('getFileWatcherStatus', () => {
          try {
            // 优先使用 Explorer 的 FileSystemManager，回退到独立实例
            const fileSystemManager = this.scheduler?.explorerInstance?.fileSystemManager || this.scheduler?.fileSystemManager;
            let managerType = 'Unknown';
            
            if (this.scheduler?.explorerInstance?.fileSystemManager) {
              managerType = 'Explorer FileSystemManager';
            } else if (this.scheduler?.fileSystemManager) {
              managerType = 'Fallback FileSystemManager';
            }
            
            if (fileSystemManager) {
              const watcherStatus = fileSystemManager.getWatcherStatus();
              const configWatcherStatus = watcherStatus[this.scheduler.configWatcherKey];
              
              const fileWatcherStatus = {
                isActive: configWatcherStatus ? configWatcherStatus.isActive : false,
                configPath: path.basename(BASE_CONFIG.CONFIG_FILE),
                watchedFile: BASE_CONFIG.CONFIG_FILE,
                lastChange: new Date().toISOString(),
                changeCount: 0,
                watcherName: configWatcherStatus ? configWatcherStatus.name : '调度器配置文件监控',
                watcherDescription: configWatcherStatus ? configWatcherStatus.description : '',
                managerType: managerType
              };
              socket.emit('filewatcher_status', fileWatcherStatus);
            } else {
              socket.emit('filewatcher_status', {
                isActive: false,
                configPath: path.basename(BASE_CONFIG.CONFIG_FILE),
                watchedFile: BASE_CONFIG.CONFIG_FILE,
                lastChange: null,
                changeCount: 0,
                watcherName: '调度器配置文件监控',
                watcherDescription: 'FileSystemManager 未初始化',
                managerType: 'None'
              });
            }
          } catch (error) {
            this.log('error', '获取文件监控状态失败', { error: error.message });
          }
        });
        
        // 重启文件监控
        socket.on('restartFileWatcher', async () => {
          try {
            // 检查是否有可用的 FileSystemManager（优先 Explorer，回退到独立实例）
            const hasFileSystemManager = this.scheduler && (
              this.scheduler.explorerInstance?.fileSystemManager || 
              this.scheduler.fileSystemManager
            );
            
            if (hasFileSystemManager) {
              // 重新设置配置文件监听
              this.scheduler.setupConfigWatcher();
              socket.emit('filewatcher_restarted', { success: true });
              this.log('info', '文件监控已重启');
            } else {
              socket.emit('filewatcher_restarted', { success: false, error: '调度器或FileSystemManager未初始化' });
            }
          } catch (error) {
            socket.emit('filewatcher_restarted', { success: false, error: error.message });
            this.log('error', '重启文件监控失败', { error: error.message });
          }
        });
      });
      
      this.logger.info(`${this.serviceName} WebSocket支持已设置`);
    }

    /**
     * 获取调度器状态（代理到调度器实例）
     */
    getSchedulerStatus() {
      if (!this.scheduler) {
        return { error: '调度器未初始化' };
      }
      
      return this.scheduler.getStatus();
    }

    /**
     * 获取所有任务（代理到调度器实例）
     */
    getAllTasks() {
      if (!this.scheduler) {
        return [];
      }
      
      return this.scheduler.getAllTasks();
    }

    /**
     * 获取归档任务（代理到调度器实例）
     */
    getArchivedTasks() {
      if (!this.scheduler) {
        return [];
      }
      
      return this.scheduler.getArchivedTasks();
    }


    /**
     * 设置 Explorer webhook 事件监听器
     * 监听来自 Explorer 模块的 webhook 文件系统事件
     */
    setupExplorerWebhookListener() {
      try {
        // 方法1: 监听全局 Explorer 实例的事件
        if (global.explorerInstance && global.explorerInstance.eventHandler) {
          this.log('info', '设置 Explorer EventHandler webhook 监听器');
          
          // 由于 EventHandler 不是 EventEmitter，我们需要通过其他方式监听
          // 这里我们通过修改 EventHandler 的 handleWebhookEvent 方法来实现
          const originalHandleWebhookEvent = global.explorerInstance.eventHandler.handleWebhookEvent;
          
          global.explorerInstance.eventHandler.handleWebhookEvent = (eventData) => {
            // 调用原始方法
            const result = originalHandleWebhookEvent.call(global.explorerInstance.eventHandler, eventData);
            
            // 如果是调度器配置文件变化，通知 Scheduler
            if (this.isSchedulerConfigFile(eventData.path)) {
              this.handleExplorerWebhookEvent(eventData);
            }
            
            return result;
          };
          
          this.log('info', 'Explorer webhook 监听器设置完成');
        }
        
        // 方法2: 监听全局 Socket.IO 的 fileChange 事件（作为备用方案）
        else if (global.io) {
          this.log('info', '设置全局 Socket.IO fileChange 监听器');
          
          // 监听全局 Socket.IO 实例的事件
          global.io.on('connection', (socket) => {
            socket.on('fileChange', (eventData) => {
              if (this.isSchedulerConfigFile(eventData.path)) {
                this.handleExplorerWebhookEvent(eventData);
              }
            });
          });
          
          this.log('info', '全局 Socket.IO 监听器设置完成');
        }
        
        else {
          this.log('warn', '无法设置 Explorer webhook 监听器：Explorer 实例或全局 Socket.IO 不可用');
        }
        
      } catch (error) {
        this.log('error', '设置 Explorer webhook 监听器失败', { error: error.message });
      }
    }
    
    /**
     * 判断是否为调度器配置文件
     */
    isSchedulerConfigFile(filePath) {
      return filePath && (
        filePath.includes('scheduler-config.json') ||
        filePath.endsWith('scheduler-config.json')
      );
    }
    
    /**
     * 处理来自 Explorer 的 webhook 事件
     */
    handleExplorerWebhookEvent(eventData) {
      try {
        this.log('info', 'Scheduler 收到 Explorer webhook 事件', {
          type: eventData.type,
          path: eventData.path,
          source: eventData.source,
          shouldDisplay: eventData.shouldDisplay
        });
        
        // 广播到 Scheduler 的客户端
        this.broadcastToClients('fileChange', {
          ...eventData,
          watcherKey: 'scheduler-config', // 标识为调度器配置文件变化
          processed_by: 'Scheduler'
        });
        
        // 如果是配置文件变化，触发配置重载
        if (eventData.type === 'change' && this.scheduler) {
          this.log('info', '检测到调度器配置文件变化，准备重新加载配置');
          
          // 延迟重载配置，避免文件正在写入时读取
          setTimeout(() => {
            try {
              this.scheduler.reloadConfig();
              this.log('info', '调度器配置重新加载完成');
            } catch (reloadError) {
              this.log('error', '重新加载调度器配置失败', { error: reloadError.message });
            }
          }, 1500); // 延迟1.5秒
        }
        
      } catch (error) {
        this.log('error', '处理 Explorer webhook 事件失败', { error: error.message });
      }
    }

    /**
     * 广播消息到所有Socket.IO客户端
     */
    broadcastToClients(event, data) {
      const message = { event, data, timestamp: new Date().toISOString() };
      
      for (const socket of this.wsConnections) {
        try {
          if (socket.connected) {
            socket.emit(event, data);
          }
        } catch (error) {
          this.log('warn', 'Socket.IO发送失败', { error: error.message });
          this.wsConnections.delete(socket);
        }
      }
    }

    /**
     * 添加WebSocket连接
     */
    addWebSocketConnection(ws) {
      this.wsConnections.add(ws);
      this.log('info', 'WebSocket连接已添加', { 
        totalConnections: this.wsConnections.size 
      });
      
      ws.on('close', () => {
        this.wsConnections.delete(ws);
        this.log('info', 'WebSocket连接已关闭', { 
          totalConnections: this.wsConnections.size 
        });
      });
    }
  }

  return new SchedulerService(options);
}

/**
 * 创建并启动调度器管理服务的便捷函数
 */
async function createSchedulerService(options = {}) {
  const service = setupSchedulerService(options);
  await service.start();
  return service;
}

module.exports = {
  setupSchedulerService,
  createSchedulerService
  // 注意：不再导出 SchedulerService 类，避免重复实例化
  // 如需获取类引用，请使用 setupSchedulerService(options).constructor
};
