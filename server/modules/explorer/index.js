/**
 * Explorer Service Module
 * 
 * Provides file system browsing, operations, and monitoring, following standard service module interface
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { EventEmitter } = require('events');

// Import internal module components
const FileSystemManager = require('./FileSystemManager');
const EventHandler = require('./EventHandler');
const Logger = require('./logger');
const { explorerServerConfig, EXPLORER_MODES } = require('./config');

/**
 * Setup Explorer Service
 * @param {Object} options Configuration options
 * @returns {ExplorerService} Explorer service instance
 */
function setupExplorerService(options = {}) {
  /**
   * Explorer Service class
   */
  class ExplorerService extends EventEmitter {
    constructor() {
      super();
      this.fileSystemManager = null;
      this.eventHandler = null;
      this.config = null;
      this.watchDirs = [];
      this.isRunning = false;
      this.sseClients = new Set();
    }

    /**
     * Initialize service
     */
    async init() {
      try {
        // Initialize config system
        this.config = explorerServerConfig.initialize({
          explorerConfig: options.explorerConfig,
          serverConfig: options.serverConfig,
          appDir: options.appDir || global.rootDir || process.cwd()
        });
        
        // Set log level
        const logLevel = this.config.logging?.level || 'INFO';
        Logger.setLogLevel(logLevel);
        
        Logger.info('Explorer service config initialized:', explorerServerConfig.getSummary());

        // Save watch directories reference
        this.watchDirs = this.config.watchDirs;
        
        // Ensure all watch directories exist
        this.watchDirs.forEach(dir => {
          if (!fs.existsSync(dir.fullPath)) {
            fs.mkdirSync(dir.fullPath, { recursive: true });
            Logger.info(`Created directory: ${dir.fullPath}`);
          }
        });

        // Initialize FileSystemManager
        this.fileSystemManager = new FileSystemManager({
          workDir: options.appDir || global.rootDir || process.cwd(),
          excludePatterns: this.config.excludePatterns,
          watchOptions: this.config.watchOptions
        });

        // Initialize event handler
        this.eventHandler = new EventHandler(this.config, this.watchDirs);
        this.eventHandler.setEventEmitter(this);

        // Setup event bridge
        this.setupEventBridge();
        
        return true;
      } catch (error) {
        Logger.error(`Failed to initialize explorer service: ${error.message}`);
        this.emit('error', { type: 'initError', error });
        throw error;
      }
    }

    /**
     * Setup event bridge
     */
    setupEventBridge() {
      Logger.info('Setting up explorer event bridge');
      
      // Listen for file change events
      this.fileSystemManager.on('fileChange', (data) => {
        Logger.debug(`File change event: ${data.type} - ${data.path}`);
        this.emit('file_change', data);
        this.broadcastSSE('file_change', data);
      });

      // Listen for structure update events
      this.fileSystemManager.on('structureUpdate', (data) => {
        Logger.debug(`Structure update event: ${data.watcherKey}`);
        this.emit('structure_update', data);
        this.broadcastSSE('structure_update', data);
      });

      // Listen for watcher ready events
      this.fileSystemManager.on('watcherReady', (data) => {
        Logger.info(`Watcher ready: ${data.watcherKey}`);
        this.emit('watcher_ready', data);
      });

      // Listen for watcher error events
      this.fileSystemManager.on('watcherError', (data) => {
        Logger.error(`Watcher error: ${data.watcherKey} - ${data.error}`);
        this.emit('watcher_error', data);
      });
      
      Logger.info('Event bridge setup complete');
    }

    /**
     * Start service
     */
    async start() {
      try {
        Logger.info("Starting explorer service...");

        // If internal monitoring enabled, setup file watchers
        if (explorerServerConfig.isInternalMonitoringEnabled()) {
          Logger.info('Setting up internal file monitoring...');
          this.watchDirs.forEach(dir => {
            this.fileSystemManager.setupFileWatcher({
              path: dir.path,
              key: dir.name || dir.path,
              name: dir.name,
              description: dir.description
            });
          });
        } else {
          Logger.info('Internal monitoring disabled, webhook mode active');
        }
        
        // Set global instance for other modules (e.g., scheduler) to share
        global.explorerInstance = this;
        
        this.isRunning = true;
        this.emit('started', { serverInfo: this.getStatus() });
        Logger.info('Explorer service started successfully');
        return true;
      } catch (error) {
        Logger.error('Failed to start explorer service:', error);
        this.emit('error', { type: 'startError', error });
        throw error;
      }
    }

    /**
     * Stop service
     */
    async stop() {
      try {
        Logger.info("Stopping explorer service...");
        
        // Stop all file watchers
        if (this.fileSystemManager) {
          this.fileSystemManager.stopAllWatchers();
        }

        // Close all SSE connections
        this.sseClients.forEach(client => {
          try {
            client.end();
          } catch (e) {
            // Ignore close errors
          }
        });
        this.sseClients.clear();
        
        // Clear global instance
        if (global.explorerInstance === this) {
          global.explorerInstance = null;
        }
        
        this.isRunning = false;
        this.emit('stopped');
        Logger.info('Explorer service stopped');
        return true;
      } catch (error) {
        Logger.error('Failed to stop explorer service:', error);
        this.emit('error', { type: 'stopError', error });
        throw error;
      }
    }

    /**
     * Switch watch directory (hot reload)
     * @param {string} newPath New directory path to watch
     * @param {Object} options Options
     * @param {string} options.name Watch directory name
     * @param {string} options.description Watch directory description
     * @returns {Object} Result { success, path, watchDirs }
     */
    async switchWatchDir(newPath, options = {}) {
      const name = options.name || 'Workspace';
      const description = options.description || 'AI workspace';
      
      try {
        Logger.info(`Switching watch directory to: ${newPath}`);
        
        // 1. Stop all existing watchers
        if (this.fileSystemManager) {
          this.fileSystemManager.stopAllWatchers();
          Logger.info('Stopped all existing watchers');
        }
        
        // 2. Ensure new directory exists
        if (!fs.existsSync(newPath)) {
          fs.mkdirSync(newPath, { recursive: true });
          Logger.info(`Created directory: ${newPath}`);
        }
        
        // 3. Update watchDirs configuration
        this.watchDirs = [{
          path: newPath,
          name: name,
          description: description,
          fullPath: newPath
        }];
        
        // 4. Update FileSystemManager workDir
        if (this.fileSystemManager) {
          this.fileSystemManager.workDir = newPath;
        }
        
        // 5. Update EventHandler watchDirs reference
        if (this.eventHandler) {
          this.eventHandler.watchDirs = this.watchDirs;
        }
        
        // 6. If internal monitoring enabled, setup new watchers
        if (explorerServerConfig.isInternalMonitoringEnabled()) {
          Logger.info('Setting up new file watchers...');
          this.watchDirs.forEach(dir => {
            this.fileSystemManager.setupFileWatcher({
              path: dir.path,
              key: dir.name || dir.path,
              name: dir.name,
              description: dir.description
            });
          });
        }
        
        // 7. Broadcast watch directory changed event
        this.broadcastSSE('watch_dir_changed', {
          path: newPath,
          name: name,
          timestamp: new Date().toISOString()
        });
        
        Logger.info(`Watch directory switched successfully to: ${newPath}`);
        
        return { 
          success: true, 
          path: newPath, 
          watchDirs: this.watchDirs 
        };
      } catch (error) {
        Logger.error(`Failed to switch watch directory: ${error.message}`);
        return { 
          success: false, 
          error: error.message 
        };
      }
    }

    /**
     * Broadcast SSE event
     * @param {string} eventType Event type
     * @param {Object} data Event data
     */
    broadcastSSE(eventType, data) {
      const eventData = JSON.stringify(data);
      this.sseClients.forEach(client => {
        try {
          client.write(`event: ${eventType}\ndata: ${eventData}\n\n`);
        } catch (e) {
          Logger.error(`Error broadcasting SSE event: ${e.message}`);
        }
      });
    }
    
    /**
     * Setup routes
     * @param {Object} app Express application instance
     */
    setupRoutes(app) {
      // Setup static file service
      const htmlPath = path.join(__dirname, './html');
      if (fs.existsSync(htmlPath)) {
        app.use('/explorer-assets', express.static(htmlPath));
      }
      
      // Home/Dashboard
      app.get('/explorer', (req, res) => {
        const indexPath = path.join(__dirname, './html/index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.json({
            name: 'Explorer Service',
            status: 'running',
            message: 'File browser service running',
            api: '/api/explorer'
          });
        }
      });
      
      // API route prefix
      const apiRouter = express.Router();
      
      // Enable CORS
      apiRouter.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept']
      }));

      // JSON parsing middleware
      apiRouter.use(express.json({ limit: this.config.security?.maxFileSize || '50mb' }));
      
      app.use('/api/explorer', apiRouter);

      // ==================== Status APIs ====================
      
      // Get service status
      apiRouter.get('/status', (req, res) => {
        res.json({
          status: 'success',
          data: this.getStatus()
        });
      });

      // Get current running mode
      apiRouter.get('/mode', (req, res) => {
        res.json({
          status: 'success',
          currentMode: this.config.mode,
          availableModes: Object.values(EXPLORER_MODES),
          internalMonitoringEnabled: explorerServerConfig.isInternalMonitoringEnabled(),
          webhookReceivingEnabled: explorerServerConfig.isWebhookReceivingEnabled()
        });
      });

      // ==================== File Structure APIs ====================

      // Get complete file tree
      apiRouter.get('/structure', (req, res) => {
        try {
          const structure = {};
          this.watchDirs.forEach(dir => {
            structure[dir.path] = {
              name: dir.name,
              description: dir.description,
              files: this.fileSystemManager.buildFileSystemStructure(dir.path)
            };
          });
          res.json({
            status: 'success',
            data: structure
          });
        } catch (error) {
          Logger.error('Error getting file structure:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // List directory contents
      apiRouter.get('/list', (req, res) => {
        try {
          const { path: dirPath } = req.query;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const items = this.fileSystemManager.listDirectory(dirPath);
          
          if (items === null) {
            return res.status(404).json({
              status: 'error',
              message: 'Directory does not exist or cannot be accessed'
            });
          }

          res.json({
            status: 'success',
            path: dirPath,
            items: items
          });
        } catch (error) {
          Logger.error('Error listing directory:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // ==================== File Operation APIs ====================

      // Read file content
      apiRouter.get('/file', (req, res) => {
        try {
          const { path: filePath } = req.query;
          
          if (!filePath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const content = this.fileSystemManager.readFile(filePath);
          
          if (content === null) {
            return res.status(404).json({
              status: 'error',
              message: 'File does not exist or cannot be read'
            });
          }

          res.json({
            status: 'success',
            path: filePath,
            content: content
          });
        } catch (error) {
          Logger.error('Error reading file:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Get file info
      apiRouter.get('/file/info', (req, res) => {
        try {
          const { path: filePath } = req.query;
          
          if (!filePath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const info = this.fileSystemManager.getFileInfo(filePath);
          
          if (info === null) {
            return res.status(404).json({
              status: 'error',
              message: 'File does not exist'
            });
          }

          res.json({
            status: 'success',
            data: info
          });
        } catch (error) {
          Logger.error('Error getting file info:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Create/save file
      apiRouter.post('/file', (req, res) => {
        try {
          const { path: filePath, content } = req.body;
          
          if (!filePath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          if (content === undefined) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing content parameter'
            });
          }

          const success = this.fileSystemManager.saveFile(filePath, content);
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to save file'
            });
          }

          res.json({
            status: 'success',
            message: 'File saved',
            path: filePath
          });
        } catch (error) {
          Logger.error('Error saving file:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Delete file
      apiRouter.delete('/file', (req, res) => {
        try {
          const { path: filePath } = req.query;
          
          if (!filePath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const success = this.fileSystemManager.deleteFile(filePath);
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to delete file'
            });
          }

          res.json({
            status: 'success',
            message: 'File deleted',
            path: filePath
          });
        } catch (error) {
          Logger.error('Error deleting file:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // ==================== Directory Operation APIs ====================

      // Create directory
      apiRouter.post('/directory', (req, res) => {
        try {
          const { path: dirPath } = req.body;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const success = this.fileSystemManager.createDirectory(dirPath);
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to create directory'
            });
          }

          res.json({
            status: 'success',
            message: 'Directory created',
            path: dirPath
          });
        } catch (error) {
          Logger.error('Error creating directory:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Delete directory
      apiRouter.delete('/directory', (req, res) => {
        try {
          const { path: dirPath, recursive } = req.query;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const success = this.fileSystemManager.deleteDirectory(dirPath, recursive === 'true');
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to delete directory'
            });
          }

          res.json({
            status: 'success',
            message: 'Directory deleted',
            path: dirPath
          });
        } catch (error) {
          Logger.error('Error deleting directory:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // ==================== Copy/Move APIs ====================

      // Copy file
      apiRouter.post('/copy', (req, res) => {
        try {
          const { source, dest } = req.body;
          
          if (!source || !dest) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing source or dest parameter'
            });
          }

          const success = this.fileSystemManager.copyFile(source, dest);
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to copy file'
            });
          }

          res.json({
            status: 'success',
            message: 'File copied',
            source: source,
            dest: dest
          });
        } catch (error) {
          Logger.error('Error copying file:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Move/rename file
      apiRouter.post('/move', (req, res) => {
        try {
          const { source, dest } = req.body;
          
          if (!source || !dest) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing source or dest parameter'
            });
          }

          const success = this.fileSystemManager.moveFile(source, dest);
          
          if (!success) {
            return res.status(500).json({
              status: 'error',
              message: 'Failed to move file'
            });
          }

          res.json({
            status: 'success',
            message: 'File moved',
            source: source,
            dest: dest
          });
        } catch (error) {
          Logger.error('Error moving file:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // ==================== SSE Event APIs ====================

      // SSE event stream
      apiRouter.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        
        // Send initial connection message
        res.write(`event: connected\ndata: ${JSON.stringify({
          message: 'SSE connection established',
          timestamp: new Date().toISOString()
        })}\n\n`);

        // Add to client set
        this.sseClients.add(res);
        Logger.info(`SSE client connected, total clients: ${this.sseClients.size}`);

        // Setup heartbeat
        const heartbeatInterval = setInterval(() => {
          try {
            res.write(':\n\n');  // SSE comment as heartbeat
          } catch (e) {
            clearInterval(heartbeatInterval);
          }
        }, this.config.sse?.heartbeatInterval || 30000);

        // Cleanup on connection close
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          this.sseClients.delete(res);
          Logger.info(`SSE client disconnected, remaining clients: ${this.sseClients.size}`);
        });
      });

      // ==================== Temporary Watcher APIs ====================

      // Switch primary watch directory (hot reload)
      apiRouter.put('/watch/switch', async (req, res) => {
        try {
          const { path: newPath, name, description } = req.body;
          
          if (!newPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const result = await this.switchWatchDir(newPath, { name, description });
          
          if (!result.success) {
            return res.status(500).json({
              status: 'error',
              message: result.error || 'Failed to switch watch directory'
            });
          }

          res.json({
            status: 'success',
            message: 'Watch directory switched',
            data: result
          });
        } catch (error) {
          Logger.error('Error switching watch directory:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Add temporary watcher for a directory
      apiRouter.post('/watch', (req, res) => {
        try {
          const { path: dirPath } = req.body;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const result = this.fileSystemManager.addTemporaryWatcher(dirPath);
          
          if (!result.success) {
            return res.status(400).json({
              status: 'error',
              message: result.message
            });
          }

          res.json({
            status: 'success',
            message: result.message,
            data: {
              path: dirPath,
              isNew: result.isNew,
              refCount: result.refCount
            }
          });
        } catch (error) {
          Logger.error('Error adding temporary watcher:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Remove temporary watcher for a directory
      apiRouter.delete('/watch', (req, res) => {
        try {
          const { path: dirPath, force } = req.query;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const result = this.fileSystemManager.removeTemporaryWatcher(dirPath, force === 'true');
          
          res.json({
            status: 'success',
            message: result.message,
            data: {
              path: dirPath,
              refCount: result.refCount
            }
          });
        } catch (error) {
          Logger.error('Error removing temporary watcher:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Check if a path is being watched
      apiRouter.get('/watch/check', (req, res) => {
        try {
          const { path: dirPath } = req.query;
          
          if (!dirPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing path parameter'
            });
          }

          const isWatched = this.fileSystemManager.isPathWatched(dirPath);
          
          res.json({
            status: 'success',
            data: {
              path: dirPath,
              isWatched: isWatched
            }
          });
        } catch (error) {
          Logger.error('Error checking watch status:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Get temporary watcher status
      apiRouter.get('/watch/status', (req, res) => {
        try {
          const status = this.fileSystemManager.getTemporaryWatcherStatus();
          
          res.json({
            status: 'success',
            data: status
          });
        } catch (error) {
          Logger.error('Error getting temporary watcher status:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // ==================== Webhook APIs ====================

      // Webhook receiving endpoint
      apiRouter.post('/webhook/filesystem-event', (req, res) => {
        try {
          // Check if webhook receiving is enabled
          if (!explorerServerConfig.isWebhookReceivingEnabled()) {
            return res.status(503).json({
              status: 'error',
              message: 'Webhook receiving is disabled',
              currentMode: this.config.mode
            });
          }

          const { type, path: eventPath, dir, time, metadata } = req.body;

          // Validate required parameters
          if (!type || !eventPath) {
            return res.status(400).json({
              status: 'error',
              message: 'Missing required parameter type or path'
            });
          }

          // Validate event type
          const validTypes = ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];
          if (!validTypes.includes(type)) {
            return res.status(400).json({
              status: 'error',
              message: `Invalid event type: ${type}`,
              validTypes: validTypes
            });
          }

          // Construct event data
          const eventData = {
            type,
            path: eventPath,
            dir: dir || 'external',
            time: time || new Date().toISOString(),
            source: 'webhook',
            metadata: metadata || {}
          };

          Logger.info('Received webhook filesystem event:', eventData);

          // Broadcast event
          this.emit('file_change', eventData);
          this.broadcastSSE('file_change', eventData);

          // Notify event handler
          if (this.eventHandler) {
            this.eventHandler.handleWebhookEvent(eventData);
          }

          res.json({
            status: 'success',
            message: 'Event received and processed',
            eventData: eventData
          });
        } catch (error) {
          Logger.error('Error processing webhook event:', error);
          res.status(500).json({
            status: 'error',
            message: error.message
          });
        }
      });

      // Webhook status query
      apiRouter.get('/webhook/status', (req, res) => {
        res.json({
          status: 'success',
          timestamp: new Date().toISOString(),
          currentMode: this.config.mode,
          webhookReceivingEnabled: explorerServerConfig.isWebhookReceivingEnabled(),
          internalMonitoringEnabled: explorerServerConfig.isInternalMonitoringEnabled(),
          watchDirs: this.watchDirs.map(dir => ({
            path: dir.path,
            name: dir.name,
            description: dir.description
          })),
          sseClients: this.sseClients.size
        });
      });
      
      this.emit('routesSetup', { app });
      Logger.info('Explorer routes setup complete');
      return app;
    }
    
    /**
     * Get service status
     */
    getStatus() {
      return {
        isRunning: this.isRunning,
        config: explorerServerConfig.getSummary(),
        mode: this.config?.mode,
        watchDirs: this.watchDirs.map(dir => ({
          path: dir.path,
          name: dir.name,
          fullPath: dir.fullPath
        })),
        watchers: this.fileSystemManager?.getWatcherStatus() || {},
        sseClients: this.sseClients.size,
        internalMonitoringEnabled: explorerServerConfig.isInternalMonitoringEnabled(),
        webhookReceivingEnabled: explorerServerConfig.isWebhookReceivingEnabled()
      };
    }
    
    /**
     * Get FileSystemManager instance
     */
    getFileSystemManager() {
      return this.fileSystemManager;
    }
    
    /**
     * Get EventHandler instance
     */
    getEventHandler() {
      return this.eventHandler;
    }
    
    /**
     * Get config
     */
    getConfig() {
      return this.config;
    }
  }

  return new ExplorerService();
}

// Export module
module.exports = { 
  setupExplorerService,
  EXPLORER_MODES
};
