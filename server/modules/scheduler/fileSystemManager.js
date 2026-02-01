/**
 * 文件系统管理器 - 整合文件操作和监控功能
 * 
 * 整合了原 fileManager.js 和 fileWatcher.js 的所有功能：
 * - 完整的文件系统操作（读写删除等）
 * - 实时文件监控和事件通知
 * - 路径安全验证和防护
 * - 文件结构构建和管理
 * 
 * 移植自: agent-kaichi/kaichi/server/modules/schedulerManager/fileSystemManager.js
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const EventEmitter = require('events');

/**
 * 文件系统管理器类
 * 提供文件操作、监控、安全验证等完整功能
 */
class FileSystemManager extends EventEmitter {
  /**
   * 创建文件系统管理器实例
   * @param {Object} options - 配置选项
   * @param {string} options.workDir - 工作目录
   * @param {Array} options.excludePatterns - 监控排除模式
   * @param {Object} options.watchOptions - chokidar监控选项
   */
  constructor(options = {}) {
    super();
    
    this.workDir = options.workDir || process.cwd();
    this.excludePatterns = options.excludePatterns || [
      '**/node_modules/**',
      '**/.git/**',
      '**/.*',
      '**/*.tmp',
      '**/*.log'
    ];
    
    // chokidar 监控配置
    this.watchOptions = {
      ignored: this.excludePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      },
      ...options.watchOptions
    };
    
    // 存储活跃的监控器
    this.watchers = new Map();
    
    // 存储监控目录信息
    this.watchedDirs = new Map();
    
    console.log(`文件系统管理器已初始化，工作目录: ${this.workDir}`);
  }

  // ==================== 路径安全验证 ====================

  /**
   * 验证路径安全性
   * @param {string} targetPath - 目标路径
   * @returns {string|null} 安全的绝对路径或null
   */
  validatePath(targetPath) {
    try {
      // 验证路径：防止路径遍历攻击
      const normalizedPath = path.normalize(targetPath);
      if (normalizedPath.includes('..')) {
        console.error(`错误：不允许使用相对路径跳转(..) - ${targetPath}`);
        return null;
      }

      // 判断是否为绝对路径
      let absolutePath;
      if (path.isAbsolute(normalizedPath)) {
        // 如果已经是绝对路径，直接使用
        absolutePath = normalizedPath;
      } else {
        // 如果是相对路径，与 workDir 拼接
        absolutePath = path.join(this.workDir, normalizedPath);
      }
      
      // 确保路径在工作目录内，防止路径遍历
      const resolvedWorkDir = path.resolve(this.workDir);
      const resolvedPath = path.resolve(absolutePath);
      if (!resolvedPath.startsWith(resolvedWorkDir)) {
        console.error(`错误：访问路径超出工作目录范围 - ${targetPath}`);
        return null;
      }
      
      return absolutePath;
    } catch (error) {
      console.error(`路径验证失败:`, error);
      return null;
    }
  }

  /**
   * 获取相对路径
   * @param {string} fullPath - 完整路径
   * @returns {string|null} 相对工作目录的路径或null
   */
  getRelativePath(fullPath) {
    try {
      const resolvedFullPath = path.resolve(fullPath);
      const resolvedWorkDir = path.resolve(this.workDir);
      
      if (!resolvedFullPath.startsWith(resolvedWorkDir)) {
        console.error(`错误：路径不在工作目录内 - ${fullPath}`);
        return null;
      }
      
      return path.relative(this.workDir, fullPath).replace(/\\/g, '/');
    } catch (error) {
      console.error(`获取相对路径失败:`, error);
      return null;
    }
  }

  // ==================== 文件存在性检查 ====================

  /**
   * 检查文件是否存在
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {boolean} 文件是否存在
   */
  fileExists(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (error) {
      console.error(`检查文件是否存在失败:`, error);
      return false;
    }
  }

  /**
   * 检查目录是否存在
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {boolean} 目录是否存在
   */
  directoryExists(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch (error) {
      console.error(`检查目录是否存在失败:`, error);
      return false;
    }
  }

  // ==================== 目录操作 ====================

  /**
   * 列出目录内容
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {Array|null} 文件详情数组或null
   */
  listDirectory(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    try {
      if (!fs.existsSync(dirPath)) {
        console.error(`错误：目录不存在: ${dirPath}`);
        return null;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        console.error(`错误：路径不是目录: ${dirPath}`);
        return null;
      }
      
      const files = fs.readdirSync(dirPath);
      return files.map(file => {
        try {
          const itemPath = path.join(dirPath, file);
          const stats = fs.statSync(itemPath);
          // 返回相对路径
          const relItemPath = path.join(relativePath, file).replace(/\\/g, '/');
          
          return {
            name: file,
            path: relItemPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (err) {
          console.error(`无法访问文件 ${file}:`, err);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      console.error(`列出目录内容失败:`, error);
      return null;
    }
  }

  /**
   * 创建目录
   * @param {string} relativePath - 相对工作目录的路径
   * @param {boolean} recursive - 是否递归创建
   * @returns {boolean} 创建是否成功
   */
  createDirectory(relativePath, recursive = true) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      if (fs.existsSync(dirPath)) {
        console.log(`目录已存在: ${relativePath}`);
        return true;
      }
      
      fs.mkdirSync(dirPath, { recursive });
      console.log(`目录已成功创建: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`创建目录失败:`, error);
      return false;
    }
  }

  /**
   * 删除目录
   * @param {string} relativePath - 相对工作目录的路径
   * @param {boolean} recursive - 是否递归删除内容
   * @returns {boolean} 删除是否成功
   */
  deleteDirectory(relativePath, recursive = false) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      if (!fs.existsSync(dirPath)) {
        console.error(`错误：目录不存在: ${dirPath}`);
        return false;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        console.error(`错误：路径不是目录: ${dirPath}`);
        return false;
      }
      
      if (recursive) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(dirPath);
      }
      
      console.log(`目录已成功删除: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`删除目录失败:`, error);
      return false;
    }
  }

  // ==================== 文件读取操作 ====================

  /**
   * 读取文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {string|null} 文件内容或null
   */
  readFile(relativePath) {
    console.log(`[FileSystemManager] 尝试读取文件: ${relativePath}`);
    console.log(`[FileSystemManager] 工作目录: ${this.workDir}`);
    
    const filePath = this.validatePath(relativePath);
    if (!filePath) {
      console.error(`[FileSystemManager] 路径验证失败: ${relativePath}`);
      return null;
    }

    console.log(`[FileSystemManager] 验证后的完整路径: ${filePath}`);

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`[FileSystemManager] 错误：文件不存在: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`[FileSystemManager] 错误：路径是目录而非文件: ${filePath}`);
        return null;
      }
      
      console.log(`[FileSystemManager] 成功读取文件: ${filePath}`);
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`[FileSystemManager] 读取文件内容失败:`, error);
      return null;
    }
  }

  /**
   * 异步读取文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {Promise<string|null>} 文件内容或null的Promise
   */
  async readFileAsync(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`错误：文件不存在: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`错误：路径是目录而非文件: ${filePath}`);
        return null;
      }
      
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      console.error(`异步读取文件内容失败:`, error);
      return null;
    }
  }

  // ==================== 文件写入操作 ====================

  /**
   * 保存文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @param {string} content - 文件内容
   * @returns {boolean} 保存是否成功
   */
  saveFile(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        console.error(`错误：保存文件时需要提供内容`);
        return false;
      }
      
      // 确保目录存在
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // 写入文件
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`文件已成功保存: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`保存文件失败:`, error);
      return false;
    }
  }

  /**
   * 异步保存文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<boolean>} 保存是否成功的Promise
   */
  async saveFileAsync(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        console.error(`错误：保存文件时需要提供内容`);
        return false;
      }
      
      // 确保目录存在
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
      
      // 写入文件
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`文件已成功保存: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`异步保存文件失败:`, error);
      return false;
    }
  }

  // ==================== 文件删除操作 ====================

  /**
   * 删除文件
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {boolean} 删除是否成功
   */
  deleteFile(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`错误：文件不存在: ${filePath}`);
        return false;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`错误：路径是目录而非文件: ${filePath}`);
        return false;
      }
      
      fs.unlinkSync(filePath);
      console.log(`文件已成功删除: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`删除文件失败:`, error);
      return false;
    }
  }

  // ==================== 文件结构构建 ====================

  /**
   * 构建文件系统结构
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {Object|null} 文件系统结构对象或null
   */
  buildFileSystemStructure(relativePath = '') {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    // 检查目录是否存在
    if (!fs.existsSync(dirPath)) {
      console.warn(`目录不存在，跳过构建结构: ${dirPath}`);
      return {};
    }

    // 检查是否是目录
    try {
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        console.warn(`路径不是目录，跳过构建结构: ${dirPath}`);
        return {};
      }
    } catch (err) {
      console.error(`无法访问路径 ${dirPath}:`, err);
      return {};
    }

    const structure = {};
    try {
      const items = fs.readdirSync(dirPath);
      items.forEach(item => {
        try {
          const fullPath = path.join(dirPath, item);
          const stat = fs.statSync(fullPath);
          
          const relPath = path.join(relativePath, item).replace(/\\/g, '/');

          if (stat.isDirectory()) {
            structure[item] = this.buildFileSystemStructure(relPath);
          } else {
            structure[item] = true;
          }
        } catch (itemErr) {
          console.warn(`跳过无法访问的项目 ${item}:`, itemErr.message);
        }
      });
    } catch (err) {
      console.error(`读取目录失败 ${dirPath}:`, err);
      return {};
    }
    return structure;
  }

  // ==================== 文件监控功能 ====================

  /**
   * 设置文件监控
   * @param {Object} watchConfig - 监控配置
   * @param {string} watchConfig.path - 监控路径（相对于工作目录）
   * @param {string} watchConfig.key - 监控器标识键
   * @param {string} watchConfig.name - 监控器名称
   * @param {string} watchConfig.description - 监控器描述
   * @param {Array} watchConfig.excludePatterns - 额外的排除模式
   * @returns {Object|null} 监控器实例或null
   */
  setupFileWatcher(watchConfig) {
    const { path: watchPath, key, name, description, excludePatterns = [] } = watchConfig;
    
    if (!watchPath || !key) {
      console.error('错误：监控配置缺少必要参数 path 和 key');
      return null;
    }

    const fullPath = this.validatePath(watchPath);
    if (!fullPath) {
      console.error(`错误：无效的监控路径: ${watchPath}`);
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      console.log(`监控路径不存在，尝试创建: ${fullPath}`);
      try {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`成功创建监控路径: ${fullPath}`);
      } catch (createErr) {
        console.error(`创建监控路径失败: ${fullPath}`, createErr);
        return null;
      }
    }

    // 如果已存在同名监控器，先关闭它
    if (this.watchers.has(key)) {
      this.stopFileWatcher(key);
    }

    try {
      // 合并排除模式
      const combinedExcludePatterns = [...this.excludePatterns, ...excludePatterns];
      
      // 创建监控器
      const watcher = chokidar.watch(fullPath, {
        ...this.watchOptions,
        ignored: combinedExcludePatterns
      });

      // 监听文件变化事件
      watcher.on('all', (event, filePath) => {
        const relativePath = path.relative(fullPath, filePath).replace(/\\/g, '/');
        const time = new Date().toLocaleTimeString();
        
        // 记录到服务器日志
        console.log(`[文件变化] ${event}: ${key}/${relativePath} (${time})`);
        
        // 发出文件变化事件
        this.emit('fileChange', {
          type: event,
          watcherKey: key,
          watcherName: name,
          path: relativePath,
          fullPath: filePath,
          time: time,
          shouldDisplay: false
        });
        
        // 发出文件结构更新事件
        this.emit('structureUpdate', {
          watcherKey: key,
          structure: this.buildFileSystemStructure(watchPath)
        });
      });

      // 监听错误事件
      watcher.on('error', (error) => {
        console.error(`文件监控错误 [${key}]:`, error);
        this.emit('watcherError', {
          watcherKey: key,
          error: error.message
        });
      });

      // 监听就绪事件
      watcher.on('ready', () => {
        console.log(`文件监控已启动: ${key} -> ${fullPath}`);
        this.emit('watcherReady', {
          watcherKey: key,
          watcherName: name,
          path: watchPath,
          fullPath: fullPath
        });
      });

      // 存储监控器和配置信息
      this.watchers.set(key, watcher);
      this.watchedDirs.set(key, {
        path: watchPath,
        fullPath: fullPath,
        name: name || key,
        description: description || '',
        excludePatterns: combinedExcludePatterns
      });

      return watcher;
    } catch (error) {
      console.error(`设置文件监控失败 [${key}]:`, error);
      return null;
    }
  }

  /**
   * 停止文件监控
   * @param {string} key - 监控器标识键
   * @returns {boolean} 停止是否成功
   */
  stopFileWatcher(key) {
    if (!this.watchers.has(key)) {
      console.warn(`监控器不存在: ${key}`);
      return false;
    }

    try {
      const watcher = this.watchers.get(key);
      watcher.close();
      this.watchers.delete(key);
      this.watchedDirs.delete(key);
      
      console.log(`文件监控已停止: ${key}`);
      this.emit('watcherStopped', { watcherKey: key });
      return true;
    } catch (error) {
      console.error(`停止文件监控失败 [${key}]:`, error);
      return false;
    }
  }

  /**
   * 获取所有监控器状态
   * @returns {Object} 监控器状态信息
   */
  getWatcherStatus() {
    const status = {};
    
    for (const [key, dirInfo] of this.watchedDirs.entries()) {
      const watcher = this.watchers.get(key);
      status[key] = {
        ...dirInfo,
        isActive: watcher && !watcher.closed,
        watchedPaths: watcher ? watcher.getWatched() : null
      };
    }
    
    return status;
  }

  /**
   * 更新文件结构并通知
   * @param {Array|null} watchDirs - 监控目录数组（兼容原接口）
   * @param {Object|null} io - Socket.IO实例（兼容原接口）
   */
  updateFileStructure(watchDirs = null, io = null) {
    const structure = {};
    
    // 如果提供了watchDirs参数，使用它；否则使用内部存储的监控目录
    const dirs = watchDirs || Array.from(this.watchedDirs.values());
    
    if (!dirs || !Array.isArray(dirs)) {
      console.error('更新文件结构失败: 监控目录未定义或不是数组');
      return;
    }
    
    dirs.forEach(dir => {
      const dirKey = dir.path;
      const dirPath = dir.path || dirKey;
      
      // 检查目录是否存在，如果不存在则尝试创建
      const fullPath = this.validatePath(dirPath);
      if (fullPath && !fs.existsSync(fullPath)) {
        console.log(`监控目录不存在，尝试创建: ${fullPath}`);
        try {
          fs.mkdirSync(fullPath, { recursive: true });
          console.log(`成功创建监控目录: ${fullPath}`);
        } catch (createErr) {
          console.error(`创建监控目录失败: ${fullPath}`, createErr);
        }
      }
      
      structure[dirKey] = {
        name: dir.name || dirKey,
        description: dir.description || '',
        files: this.buildFileSystemStructure(dirPath)
      };
    });
    
    // 发出结构更新事件
    this.emit('initialStructure', structure);
    
    // 兼容原接口：如果提供了io实例，也通过socket发送
    if (io && typeof io.emit === 'function') {
      io.emit('initialStructure', structure);
    }
  }

  /**
   * 批量设置监控器
   * @param {Array} watchConfigs - 监控配置数组
   * @returns {Object} 设置结果
   */
  setupMultipleWatchers(watchConfigs) {
    const results = {
      success: [],
      failed: []
    };

    watchConfigs.forEach(config => {
      const watcher = this.setupFileWatcher(config);
      if (watcher) {
        results.success.push(config.key);
      } else {
        results.failed.push(config.key);
      }
    });

    return results;
  }

  /**
   * 停止所有监控器
   */
  stopAllWatchers() {
    const keys = Array.from(this.watchers.keys());
    keys.forEach(key => this.stopFileWatcher(key));
    console.log(`已停止所有文件监控器 (${keys.length}个)`);
  }

  /**
   * 销毁文件系统管理器
   */
  destroy() {
    this.stopAllWatchers();
    this.removeAllListeners();
    console.log('文件系统管理器已销毁');
  }

  // ==================== 兼容性方法 ====================

  /**
   * 获取监控目录的相对路径（兼容原fileWatcher接口）
   * @param {string} fullPath - 完整路径
   * @param {Array} watchDirs - 监控目录数组
   * @returns {Object|null} 包含目录ID和相对路径的对象，或null
   */
  static getRelativePathForWatchDirs(fullPath, watchDirs) {
    for (const dir of watchDirs) {
      const dirFullPath = dir.fullPath || dir.path;
      if (fullPath.startsWith(dirFullPath)) {
        return {
          dirId: dir.path,
          relativePath: path.relative(dirFullPath, fullPath).replace(/\\/g, '/')
        };
      }
    }
    return null;
  }
}

module.exports = FileSystemManager;
