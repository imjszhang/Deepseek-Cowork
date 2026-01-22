/**
 * File System Manager - Integrated file operations and monitoring
 * 
 * Integrates file system operations and real-time monitoring:
 * - Complete file system operations (read, write, delete, etc.)
 * - Real-time file monitoring and event notifications
 * - Path security validation and protection
 * - File structure building and management
 * 
 * Adapted from: modules/explorer/fileSystemManager.js
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const EventEmitter = require('events');
const Logger = require('./logger');
const platform = require('./platform');

/**
 * File System Manager class
 * Provides complete file operations, monitoring, security validation, etc.
 */
class FileSystemManager extends EventEmitter {
  /**
   * Create FileSystemManager instance
   * @param {Object} options - Configuration options
   * @param {string} options.workDir - Working directory
   * @param {Array} options.excludePatterns - Watch exclude patterns
   * @param {Object} options.watchOptions - chokidar watch options
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
    
    // chokidar watch configuration
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
    
    // Store active watchers
    this.watchers = new Map();
    
    // Store watched directory info
    this.watchedDirs = new Map();
    
    // Temporary watchers for dynamic directory monitoring
    // Key: normalized absolute path, Value: { watcher, refCount, lastAccess, timeoutId }
    this.temporaryWatchers = new Map();
    
    // Temporary watcher configuration
    this.tempWatcherConfig = {
      maxCount: 10,           // Maximum number of temporary watchers
      idleTimeout: 5 * 60 * 1000,  // 5 minutes idle timeout
      cleanupInterval: 60 * 1000   // Cleanup check every 1 minute
    };
    
    // Start cleanup timer
    this._tempWatcherCleanupTimer = setInterval(() => {
      this._cleanupIdleTemporaryWatchers();
    }, this.tempWatcherConfig.cleanupInterval);
    
    Logger.info(`FileSystemManager initialized, workDir: ${this.workDir}`);
  }

  // ==================== Path Security Validation ====================

  /**
   * Validate path security
   * @param {string} targetPath - Target path
   * @returns {string|null} Safe absolute path or null
   */
  validatePath(targetPath) {
    try {
      // Validate path: prevent path traversal attack
      const normalizedPath = path.normalize(targetPath);
      if (normalizedPath.includes('..')) {
        Logger.error(`Error: relative path traversal (..) not allowed - ${targetPath}`);
        return null;
      }

      // Check if absolute path
      let absolutePath;
      if (path.isAbsolute(normalizedPath)) {
        // If already absolute path, use directly
        absolutePath = normalizedPath;
      } else {
        // If relative path, join with workDir
        absolutePath = path.join(this.workDir, normalizedPath);
      }
      
      // Ensure path is within workDir, prevent traversal
      const resolvedWorkDir = path.resolve(this.workDir);
      const resolvedPath = path.resolve(absolutePath);
      
      // Use platform-aware path comparison (Windows/macOS case-insensitive)
      if (!platform.pathStartsWith(resolvedPath, resolvedWorkDir)) {
        Logger.error(`Error: path is outside work directory - ${targetPath}`);
        return null;
      }
      
      // Windows long path warning
      const pathCheck = platform.checkPathLength(resolvedPath);
      if (pathCheck.isNearLimit) {
        Logger.warn(`Path approaching Windows limit: ${pathCheck.length}/${pathCheck.maxLength} (${pathCheck.remaining} chars remaining)`);
      }
      
      // Symlink security check (Linux/macOS)
      // Ensure symlink real path is also within workDir
      if (!platform.isWindows && fs.existsSync(resolvedPath)) {
        try {
          const stats = fs.lstatSync(resolvedPath);
          if (stats.isSymbolicLink()) {
            const realPath = fs.realpathSync(resolvedPath);
            const resolvedRealPath = path.resolve(realPath);
            
            if (!platform.pathStartsWith(resolvedRealPath, resolvedWorkDir)) {
              Logger.warn(`Symlink points outside work directory: ${targetPath} -> ${realPath}`);
              // Warning only, not blocking (user may intend this)
            }
          }
        } catch (symlinkError) {
          // Symlink check failure doesn't block, debug log only
          Logger.debug(`Symlink check skipped: ${symlinkError.message}`);
        }
      }
      
      return absolutePath;
    } catch (error) {
      Logger.error(`Path validation failed:`, error);
      return null;
    }
  }

  /**
   * Get relative path
   * @param {string} fullPath - Full path
   * @returns {string|null} Path relative to workDir or null
   */
  getRelativePath(fullPath) {
    try {
      const resolvedFullPath = path.resolve(fullPath);
      const resolvedWorkDir = path.resolve(this.workDir);
      
      // Use platform-aware path comparison (Windows/macOS case-insensitive)
      if (!platform.pathStartsWith(resolvedFullPath, resolvedWorkDir)) {
        Logger.error(`Error: path is not within work directory - ${fullPath}`);
        return null;
      }
      
      return path.relative(this.workDir, fullPath).replace(/\\/g, '/');
    } catch (error) {
      Logger.error(`Failed to get relative path:`, error);
      return null;
    }
  }

  // ==================== File Existence Check ====================

  /**
   * Check if file exists
   * @param {string} relativePath - Path relative to workDir
   * @returns {boolean} Whether file exists
   */
  fileExists(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (error) {
      Logger.error(`Failed to check if file exists:`, error);
      return false;
    }
  }

  /**
   * Check if directory exists
   * @param {string} relativePath - Path relative to workDir
   * @returns {boolean} Whether directory exists
   */
  directoryExists(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch (error) {
      Logger.error(`Failed to check if directory exists:`, error);
      return false;
    }
  }

  // ==================== Directory Operations ====================

  /**
   * List directory contents
   * @param {string} relativePath - Path relative to workDir
   * @returns {Array|null} File details array or null
   */
  listDirectory(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    try {
      if (!fs.existsSync(dirPath)) {
        Logger.error(`Error: directory does not exist: ${dirPath}`);
        return null;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        Logger.error(`Error: path is not a directory: ${dirPath}`);
        return null;
      }
      
      const files = fs.readdirSync(dirPath);
      return files.map(file => {
        try {
          const itemPath = path.join(dirPath, file);
          const stats = fs.statSync(itemPath);
          // Return relative path
          const relItemPath = path.join(relativePath, file).replace(/\\/g, '/');
          
          return {
            name: file,
            path: relItemPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (err) {
          Logger.warn(`Cannot access file ${file}:`, err.message);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      Logger.error(`Failed to list directory contents:`, error);
      return null;
    }
  }

  /**
   * Create directory
   * @param {string} relativePath - Path relative to workDir
   * @param {boolean} recursive - Whether to create recursively
   * @returns {boolean} Whether creation succeeded
   */
  createDirectory(relativePath, recursive = true) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      if (fs.existsSync(dirPath)) {
        Logger.info(`Directory already exists: ${relativePath}`);
        return true;
      }
      
      fs.mkdirSync(dirPath, { recursive });
      Logger.info(`Directory created successfully: ${relativePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to create directory:`, error);
      return false;
    }
  }

  /**
   * Delete directory
   * @param {string} relativePath - Path relative to workDir
   * @param {boolean} recursive - Whether to delete recursively
   * @returns {boolean} Whether deletion succeeded
   */
  deleteDirectory(relativePath, recursive = false) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      if (!fs.existsSync(dirPath)) {
        Logger.error(`Error: directory does not exist: ${dirPath}`);
        return false;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        Logger.error(`Error: path is not a directory: ${dirPath}`);
        return false;
      }
      
      if (recursive) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(dirPath);
      }
      
      Logger.info(`Directory deleted successfully: ${relativePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to delete directory:`, error);
      return false;
    }
  }

  // ==================== File Read Operations ====================

  /**
   * Read file content
   * @param {string} relativePath - File path relative to workDir
   * @returns {string|null} File content or null
   */
  readFile(relativePath) {
    Logger.debug(`Attempting to read file: ${relativePath}`);
    
    const filePath = this.validatePath(relativePath);
    if (!filePath) {
      Logger.error(`Path validation failed: ${relativePath}`);
      return null;
    }

    try {
      if (!fs.existsSync(filePath)) {
        Logger.error(`Error: file does not exist: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        Logger.error(`Error: path is a directory, not a file: ${filePath}`);
        return null;
      }
      
      Logger.debug(`Successfully read file: ${filePath}`);
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      Logger.error(`Failed to read file content:`, error);
      return null;
    }
  }

  /**
   * Async read file content
   * @param {string} relativePath - File path relative to workDir
   * @returns {Promise<string|null>} Promise of file content or null
   */
  async readFileAsync(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) {
        Logger.error(`Error: file does not exist: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        Logger.error(`Error: path is a directory, not a file: ${filePath}`);
        return null;
      }
      
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      Logger.error(`Failed to async read file content:`, error);
      return null;
    }
  }

  // ==================== File Write Operations ====================

  /**
   * Save file content
   * @param {string} relativePath - File path relative to workDir
   * @param {string} content - File content
   * @returns {boolean} Whether save succeeded
   */
  saveFile(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        Logger.error(`Error: content is required when saving file`);
        return false;
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // Write file
      fs.writeFileSync(filePath, content, 'utf8');
      Logger.info(`File saved successfully: ${relativePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to save file:`, error);
      return false;
    }
  }

  /**
   * Async save file content
   * @param {string} relativePath - File path relative to workDir
   * @param {string} content - File content
   * @returns {Promise<boolean>} Promise of whether save succeeded
   */
  async saveFileAsync(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        Logger.error(`Error: content is required when saving file`);
        return false;
      }
      
      // Ensure directory exists
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
      
      // Write file
      await fs.promises.writeFile(filePath, content, 'utf8');
      Logger.info(`File saved successfully: ${relativePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to async save file:`, error);
      return false;
    }
  }

  // ==================== File Delete Operations ====================

  /**
   * Delete file
   * @param {string} relativePath - File path relative to workDir
   * @returns {boolean} Whether deletion succeeded
   */
  deleteFile(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (!fs.existsSync(filePath)) {
        Logger.error(`Error: file does not exist: ${filePath}`);
        return false;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        Logger.error(`Error: path is a directory, not a file: ${filePath}`);
        return false;
      }
      
      fs.unlinkSync(filePath);
      Logger.info(`File deleted successfully: ${relativePath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to delete file:`, error);
      return false;
    }
  }

  // ==================== File Copy and Move ====================

  /**
   * Copy file
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @returns {boolean} Whether copy succeeded
   */
  copyFile(sourcePath, destPath) {
    const sourceFullPath = this.validatePath(sourcePath);
    const destFullPath = this.validatePath(destPath);
    
    if (!sourceFullPath || !destFullPath) return false;

    try {
      if (!fs.existsSync(sourceFullPath)) {
        Logger.error(`Error: source file does not exist: ${sourcePath}`);
        return false;
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(sourceFullPath, destFullPath);
      Logger.info(`File copied: ${sourcePath} -> ${destPath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to copy file:`, error);
      return false;
    }
  }

  /**
   * Move/rename file
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @returns {boolean} Whether move succeeded
   */
  moveFile(sourcePath, destPath) {
    const sourceFullPath = this.validatePath(sourcePath);
    const destFullPath = this.validatePath(destPath);
    
    if (!sourceFullPath || !destFullPath) return false;

    try {
      if (!fs.existsSync(sourceFullPath)) {
        Logger.error(`Error: source file does not exist: ${sourcePath}`);
        return false;
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.renameSync(sourceFullPath, destFullPath);
      Logger.info(`File moved: ${sourcePath} -> ${destPath}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to move file:`, error);
      return false;
    }
  }

  // ==================== File Structure Building ====================

  /**
   * Build file system structure
   * @param {string} relativePath - Path relative to workDir
   * @returns {Object|null} File system structure object or null
   */
  buildFileSystemStructure(relativePath = '') {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      Logger.warn(`Directory does not exist, skipping structure build: ${dirPath}`);
      return {};
    }

    // Check if is directory
    try {
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        Logger.warn(`Path is not a directory, skipping structure build: ${dirPath}`);
        return {};
      }
    } catch (err) {
      Logger.error(`Cannot access path ${dirPath}:`, err.message);
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
          Logger.warn(`Skipping inaccessible item ${item}:`, itemErr.message);
        }
      });
    } catch (err) {
      Logger.error(`Failed to read directory ${dirPath}:`, err.message);
      return {};
    }
    return structure;
  }

  // ==================== File Monitoring Functions ====================

  /**
   * Setup file watcher
   * @param {Object} watchConfig - Watch configuration
   * @param {string} watchConfig.path - Watch path (relative to workDir)
   * @param {string} watchConfig.key - Watcher identifier key
   * @param {string} watchConfig.name - Watcher name
   * @param {string} watchConfig.description - Watcher description
   * @param {Array} watchConfig.excludePatterns - Additional exclude patterns
   * @returns {Object|null} Watcher instance or null
   */
  setupFileWatcher(watchConfig) {
    const { path: watchPath, key, name, description, excludePatterns = [] } = watchConfig;
    
    if (!watchPath || !key) {
      Logger.error('Error: watch config missing required parameters path and key');
      return null;
    }

    const fullPath = this.validatePath(watchPath);
    if (!fullPath) {
      Logger.error(`Error: invalid watch path: ${watchPath}`);
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      Logger.info(`Watch path does not exist, attempting to create: ${fullPath}`);
      try {
        fs.mkdirSync(fullPath, { recursive: true });
        Logger.info(`Successfully created watch path: ${fullPath}`);
      } catch (createErr) {
        Logger.error(`Failed to create watch path: ${fullPath}`, createErr);
        return null;
      }
    }

    // If watcher with same name exists, close it first
    if (this.watchers.has(key)) {
      this.stopFileWatcher(key);
    }

    try {
      // Merge exclude patterns
      const combinedExcludePatterns = [...this.excludePatterns, ...excludePatterns];
      
      // Create watcher
      const watcher = chokidar.watch(fullPath, {
        ...this.watchOptions,
        ignored: combinedExcludePatterns
      });

      // Listen for file change events
      watcher.on('all', (event, filePath) => {
        const relativePath = path.relative(fullPath, filePath).replace(/\\/g, '/');
        const time = new Date().toLocaleTimeString();
        
        // Log to server log
        Logger.debug(`[File change] ${event}: ${key}/${relativePath} (${time})`);
        
        // Emit file change event
        this.emit('fileChange', {
          type: event,
          watcherKey: key,
          watcherName: name,
          path: relativePath,
          fullPath: filePath,
          time: time,
          shouldDisplay: false
        });
        
        // Emit file structure update event
        this.emit('structureUpdate', {
          watcherKey: key,
          structure: this.buildFileSystemStructure(watchPath)
        });
      });

      // Listen for error events
      watcher.on('error', (error) => {
        Logger.error(`File watcher error [${key}]:`, error);
        
        // Get error suggestion
        const suggestion = this.getWatcherErrorSuggestion(error);
        if (suggestion) {
          Logger.error(`Suggestion: ${suggestion}`);
        }
        
        this.emit('watcherError', {
          watcherKey: key,
          error: error.message,
          code: error.code,
          suggestion: suggestion
        });
      });

      // Listen for ready event
      watcher.on('ready', () => {
        Logger.info(`File watcher started: ${key} -> ${fullPath}`);
        this.emit('watcherReady', {
          watcherKey: key,
          watcherName: name,
          path: watchPath,
          fullPath: fullPath
        });
      });

      // Store watcher and config info
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
      Logger.error(`Failed to setup file watcher [${key}]:`, error);
      return null;
    }
  }

  /**
   * Stop file watcher
   * @param {string} key - Watcher identifier key
   * @returns {boolean} Whether stop succeeded
   */
  stopFileWatcher(key) {
    if (!this.watchers.has(key)) {
      Logger.warn(`Watcher does not exist: ${key}`);
      return false;
    }

    try {
      const watcher = this.watchers.get(key);
      watcher.close();
      this.watchers.delete(key);
      this.watchedDirs.delete(key);
      
      Logger.info(`File watcher stopped: ${key}`);
      this.emit('watcherStopped', { watcherKey: key });
      return true;
    } catch (error) {
      Logger.error(`Failed to stop file watcher [${key}]:`, error);
      return false;
    }
  }

  /**
   * Get all watcher status
   * @returns {Object} Watcher status info
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
   * Batch setup watchers
   * @param {Array} watchConfigs - Watch config array
   * @returns {Object} Setup results
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
   * Stop all watchers
   */
  stopAllWatchers() {
    const keys = Array.from(this.watchers.keys());
    keys.forEach(key => this.stopFileWatcher(key));
    Logger.info(`Stopped all file watchers (${keys.length})`);
  }

  /**
   * Get watcher error suggestion
   * @param {Error} error - Error object
   * @returns {string|null} Suggestion text or null
   */
  getWatcherErrorSuggestion(error) {
    // Linux inotify limit
    if (error.code === 'ENOSPC' && platform.isLinux) {
      return 'inotify watch limit reached. Run these commands to increase:\n' +
             '  Temporary: echo 65536 | sudo tee /proc/sys/fs/inotify/max_user_watches\n' +
             '  Permanent: echo "fs.inotify.max_user_watches=65536" | sudo tee -a /etc/sysctl.conf && sudo sysctl -p';
    }
    
    // Permission error
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return 'Insufficient permissions to access directory. Check permissions or run as admin.';
    }
    
    // File/directory does not exist
    if (error.code === 'ENOENT') {
      return 'Watched file or directory does not exist, may have been deleted.';
    }
    
    // Windows path too long
    if (error.code === 'ENAMETOOLONG' && platform.isWindows) {
      return 'Windows path too long (>260 chars). Use shorter directory structure or enable Windows long path support.';
    }
    
    return null;
  }

  // ==================== Temporary Watcher Functions ====================

  /**
   * Validate path for temporary watcher (allows paths outside workDir)
   * @param {string} targetPath - Target path
   * @returns {string|null} Safe absolute path or null
   */
  validateExternalPath(targetPath) {
    try {
      // Basic security: prevent path traversal
      const normalizedPath = path.normalize(targetPath);
      if (normalizedPath.includes('..')) {
        Logger.error(`Error: relative path traversal (..) not allowed - ${targetPath}`);
        return null;
      }

      // Must be absolute path for external directories
      if (!path.isAbsolute(normalizedPath)) {
        Logger.error(`Error: external path must be absolute - ${targetPath}`);
        return null;
      }

      // Check if directory exists
      if (!fs.existsSync(normalizedPath)) {
        Logger.error(`Error: directory does not exist - ${targetPath}`);
        return null;
      }

      // Check if it's a directory
      const stats = fs.statSync(normalizedPath);
      if (!stats.isDirectory()) {
        Logger.error(`Error: path is not a directory - ${targetPath}`);
        return null;
      }

      // Exclude sensitive system directories
      const sensitivePatterns = [
        /^[A-Za-z]:\\Windows/i,           // Windows system
        /^[A-Za-z]:\\Program Files/i,     // Program Files
        /^\/etc\/?$/,                      // Linux /etc
        /^\/usr\/?$/,                      // Linux /usr
        /^\/var\/?$/,                      // Linux /var
        /^\/System/i,                      // macOS system
        /^\/Library/i                      // macOS Library
      ];

      for (const pattern of sensitivePatterns) {
        if (pattern.test(normalizedPath)) {
          Logger.error(`Error: cannot watch sensitive system directory - ${targetPath}`);
          return null;
        }
      }

      return normalizedPath;
    } catch (error) {
      Logger.error(`External path validation failed:`, error);
      return null;
    }
  }

  /**
   * Get normalized key for temporary watcher
   * @param {string} dirPath - Directory path
   * @returns {string} Normalized path key
   */
  _getTempWatcherKey(dirPath) {
    return path.resolve(dirPath).replace(/\\/g, '/').toLowerCase();
  }

  /**
   * Check if a path is already being watched (either by permanent or temporary watcher)
   * @param {string} dirPath - Directory path to check
   * @returns {boolean} Whether the path is being watched
   */
  isPathWatched(dirPath) {
    const normalizedPath = path.resolve(dirPath).replace(/\\/g, '/');
    const normalizedPathLower = normalizedPath.toLowerCase();

    // Check permanent watchers
    for (const [key, dirInfo] of this.watchedDirs.entries()) {
      const watchedPath = path.resolve(dirInfo.fullPath).replace(/\\/g, '/').toLowerCase();
      if (normalizedPathLower === watchedPath || normalizedPathLower.startsWith(watchedPath + '/')) {
        return true;
      }
    }

    // Check temporary watchers
    const tempKey = this._getTempWatcherKey(dirPath);
    if (this.temporaryWatchers.has(tempKey)) {
      return true;
    }

    return false;
  }

  /**
   * Add a temporary watcher for a directory
   * @param {string} dirPath - Absolute path to watch
   * @returns {Object} Result object { success, message, isNew, refCount }
   */
  addTemporaryWatcher(dirPath) {
    // Validate path
    const validatedPath = this.validateExternalPath(dirPath);
    if (!validatedPath) {
      return { success: false, message: 'Invalid or inaccessible path' };
    }

    const key = this._getTempWatcherKey(validatedPath);

    // Check if already exists
    if (this.temporaryWatchers.has(key)) {
      const existing = this.temporaryWatchers.get(key);
      existing.refCount++;
      existing.lastAccess = Date.now();
      
      // Clear any pending timeout
      if (existing.timeoutId) {
        clearTimeout(existing.timeoutId);
        existing.timeoutId = null;
      }

      Logger.debug(`Temporary watcher ref count increased: ${key} (refCount: ${existing.refCount})`);
      return { success: true, message: 'Watcher already exists, ref count increased', isNew: false, refCount: existing.refCount };
    }

    // Check if path is under a permanent watcher
    if (this.isPathWatched(validatedPath)) {
      Logger.debug(`Path already covered by permanent watcher: ${validatedPath}`);
      return { success: true, message: 'Path already watched by permanent watcher', isNew: false, refCount: -1 };
    }

    // Check max count limit
    if (this.temporaryWatchers.size >= this.tempWatcherConfig.maxCount) {
      // Try to clean up idle watchers first
      this._cleanupIdleTemporaryWatchers();
      
      if (this.temporaryWatchers.size >= this.tempWatcherConfig.maxCount) {
        Logger.warn(`Temporary watcher limit reached (${this.tempWatcherConfig.maxCount})`);
        return { success: false, message: 'Maximum temporary watcher limit reached' };
      }
    }

    try {
      // Create new watcher
      const watcher = chokidar.watch(validatedPath, {
        ...this.watchOptions,
        depth: 1  // Only watch immediate children for temporary watchers
      });

      // Listen for file change events
      watcher.on('all', (event, filePath) => {
        const relativePath = path.relative(validatedPath, filePath).replace(/\\/g, '/');
        const time = new Date().toLocaleTimeString();
        
        Logger.debug(`[Temp watcher] ${event}: ${relativePath} (${time})`);
        
        // Emit file change event
        this.emit('fileChange', {
          type: event,
          watcherKey: `temp:${key}`,
          watcherName: 'Temporary',
          path: relativePath,
          fullPath: filePath,
          watchedDir: validatedPath,
          time: time,
          isTemporary: true,
          shouldDisplay: false
        });
      });

      watcher.on('error', (error) => {
        Logger.error(`Temporary watcher error [${key}]:`, error.message);
      });

      watcher.on('ready', () => {
        Logger.info(`Temporary watcher ready: ${validatedPath}`);
      });

      // Store watcher info
      this.temporaryWatchers.set(key, {
        watcher,
        path: validatedPath,
        refCount: 1,
        lastAccess: Date.now(),
        timeoutId: null,
        createdAt: Date.now()
      });

      Logger.info(`Temporary watcher added: ${validatedPath}`);
      return { success: true, message: 'Temporary watcher created', isNew: true, refCount: 1 };
    } catch (error) {
      Logger.error(`Failed to create temporary watcher:`, error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Remove or decrease ref count for a temporary watcher
   * @param {string} dirPath - Directory path
   * @param {boolean} force - Force remove regardless of ref count
   * @returns {Object} Result object { success, message, refCount }
   */
  removeTemporaryWatcher(dirPath, force = false) {
    const key = this._getTempWatcherKey(dirPath);
    
    if (!this.temporaryWatchers.has(key)) {
      return { success: true, message: 'Watcher does not exist', refCount: 0 };
    }

    const watcherInfo = this.temporaryWatchers.get(key);

    if (!force && watcherInfo.refCount > 1) {
      watcherInfo.refCount--;
      watcherInfo.lastAccess = Date.now();
      Logger.debug(`Temporary watcher ref count decreased: ${key} (refCount: ${watcherInfo.refCount})`);
      return { success: true, message: 'Ref count decreased', refCount: watcherInfo.refCount };
    }

    // Schedule removal with delay (allow for quick re-navigation)
    if (!force && !watcherInfo.timeoutId) {
      watcherInfo.timeoutId = setTimeout(() => {
        this._forceRemoveTemporaryWatcher(key);
      }, 10000); // 10 second grace period
      
      watcherInfo.refCount = 0;
      Logger.debug(`Temporary watcher scheduled for removal: ${key}`);
      return { success: true, message: 'Scheduled for removal', refCount: 0 };
    }

    // Force remove
    return this._forceRemoveTemporaryWatcher(key);
  }

  /**
   * Force remove a temporary watcher
   * @param {string} key - Watcher key
   * @returns {Object} Result object
   */
  _forceRemoveTemporaryWatcher(key) {
    const watcherInfo = this.temporaryWatchers.get(key);
    if (!watcherInfo) {
      return { success: true, message: 'Already removed', refCount: 0 };
    }

    try {
      // Clear timeout if any
      if (watcherInfo.timeoutId) {
        clearTimeout(watcherInfo.timeoutId);
      }

      // Close watcher
      watcherInfo.watcher.close();
      this.temporaryWatchers.delete(key);
      
      Logger.info(`Temporary watcher removed: ${watcherInfo.path}`);
      return { success: true, message: 'Watcher removed', refCount: 0 };
    } catch (error) {
      Logger.error(`Failed to remove temporary watcher:`, error);
      return { success: false, message: error.message, refCount: -1 };
    }
  }

  /**
   * Cleanup idle temporary watchers
   */
  _cleanupIdleTemporaryWatchers() {
    const now = Date.now();
    const timeout = this.tempWatcherConfig.idleTimeout;

    for (const [key, info] of this.temporaryWatchers.entries()) {
      // Skip if has active references or pending timeout
      if (info.refCount > 0 || info.timeoutId) {
        continue;
      }

      // Remove if idle for too long
      if (now - info.lastAccess > timeout) {
        Logger.info(`Cleaning up idle temporary watcher: ${info.path}`);
        this._forceRemoveTemporaryWatcher(key);
      }
    }
  }

  /**
   * Get temporary watcher status
   * @returns {Object} Status info
   */
  getTemporaryWatcherStatus() {
    const status = {
      count: this.temporaryWatchers.size,
      maxCount: this.tempWatcherConfig.maxCount,
      watchers: []
    };

    for (const [key, info] of this.temporaryWatchers.entries()) {
      status.watchers.push({
        path: info.path,
        refCount: info.refCount,
        lastAccess: new Date(info.lastAccess).toISOString(),
        createdAt: new Date(info.createdAt).toISOString(),
        hasPendingTimeout: !!info.timeoutId
      });
    }

    return status;
  }

  /**
   * Stop all temporary watchers
   */
  stopAllTemporaryWatchers() {
    const keys = Array.from(this.temporaryWatchers.keys());
    keys.forEach(key => this._forceRemoveTemporaryWatcher(key));
    Logger.info(`Stopped all temporary watchers (${keys.length})`);
  }

  /**
   * Destroy file system manager
   */
  destroy() {
    // Stop cleanup timer
    if (this._tempWatcherCleanupTimer) {
      clearInterval(this._tempWatcherCleanupTimer);
      this._tempWatcherCleanupTimer = null;
    }
    
    // Stop all temporary watchers
    this.stopAllTemporaryWatchers();
    
    this.stopAllWatchers();
    this.removeAllListeners();
    Logger.info('FileSystemManager destroyed');
  }

  /**
   * Get file info
   * @param {string} relativePath - File path relative to workDir
   * @returns {Object|null} File info or null
   */
  getFileInfo(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const stats = fs.statSync(filePath);
      return {
        name: path.basename(filePath),
        path: relativePath,
        fullPath: filePath,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString()
      };
    } catch (error) {
      Logger.error(`Failed to get file info:`, error);
      return null;
    }
  }
}

module.exports = FileSystemManager;
