/**
 * DeepSeek Cowork - 服务器管理器
 *
 * Electron 侧仅保留端口管理、状态通知与日志汇总职责，
 * 实际 HTTP/Socket.IO/模块启动统一复用 LocalService。
 */

const http = require('http');
const net = require('net');
const { exec } = require('child_process');
const { app } = require('electron');
const { LocalService } = require('../../lib/local-service');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ServerManager {
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    this.localService = null;
    this.localServiceListeners = [];
    this.isRunning = false;
    this.logs = [];
    this.maxLogs = 1000;
    this.config = {
      port: 3333,
      wsPort: 8080,
      host: 'localhost'
    };
    this.statusChangeCallbacks = [];
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };

    this.addLog('info', 'ServerManager initialized (LocalService-backed mode)');
  }

  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
    this.addLog('info', `Server config updated: ${JSON.stringify(this.config)}`);
  }

  onStatusChange(callback) {
    this.statusChangeCallbacks.push(callback);
  }

  emitStatusChange(status) {
    this.statusChangeCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        this.originalConsole.error('Status callback error:', error);
      }
    });
  }

  checkPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, this.config.host);
    });
  }

  getProcessOnPort(port) {
    return new Promise((resolve) => {
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }

        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!Number.isNaN(pid) && pid > 0) {
            resolve(pid);
            return;
          }
        }

        resolve(null);
      });
    });
  }

  async killProcessOnPort(port) {
    const pid = await this.getProcessOnPort(port);
    if (!pid) {
      this.addLog('info', `Port ${port} is not in use`);
      return true;
    }

    this.addLog('info', `Terminating process on port ${port} (PID: ${pid})`);
    return new Promise((resolve) => {
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

  async checkPortConflict(port) {
    const available = await this.checkPortAvailable(port);
    if (available) {
      return { available: true };
    }

    this.addLog('info', `Port ${port} is in use, checking service type...`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`http://localhost:${port}/api/ping`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.app === 'deepseek-cowork') {
          if (data.mode === 'cli') {
            this.addLog('info', `Port ${port} is used by CLI service`);
            return { available: false, conflict: 'cli', message: 'CLI service is running' };
          }
          if (data.mode === 'electron') {
            this.addLog('info', `Port ${port} is used by another Electron client`);
            return { available: false, conflict: 'electron', message: 'Another Electron client is running' };
          }
        }
      }

      this.addLog('info', `Port ${port} is used by another program`);
      return { available: false, conflict: 'other', message: 'Port is occupied by another program' };
    } catch (error) {
      this.addLog('info', `Port ${port} is used by another program (ping failed)`);
      return { available: false, conflict: 'other', message: 'Port is occupied by another program' };
    }
  }

  _createLocalService() {
    const localService = new LocalService();

    const eventBindings = [
      ['started', (data) => this.addLog('info', `LocalService started on http://${data.host}:${data.httpPort}`)],
      ['stopped', () => this.addLog('info', 'LocalService stopped')],
      ['explorer:file_change', (data) => this.notifyRenderer('explorer-file-change', data)],
      ['explorer:structure_update', (data) => this.notifyRenderer('explorer-structure-update', data)],
      ['memory:saved', (data) => this.notifyRenderer('memory-saved', data)]
    ];

    eventBindings.forEach(([eventName, handler]) => {
      localService.on(eventName, handler);
      this.localServiceListeners.push({ eventName, handler });
    });

    return localService;
  }

  _detachLocalServiceListeners() {
    if (!this.localService) {
      this.localServiceListeners = [];
      return;
    }

    this.localServiceListeners.forEach(({ eventName, handler }) => {
      this.localService.off(eventName, handler);
    });
    this.localServiceListeners = [];
  }

  async start() {
    if (this.isRunning) {
      this.addLog('info', 'Server is already running');
      return true;
    }

    try {
      this.addLog('info', 'Starting embedded server via LocalService...');

      const portStatus = await this.checkPortConflict(this.config.port);
      if (!portStatus.available) {
        const error = new Error(`HTTP port ${this.config.port}: ${portStatus.message}`);
        error.portConflict = portStatus;
        throw error;
      }

      this.localService = this._createLocalService();
      const initResult = await this.localService.initialize({
        dataDir: app.getPath('userData'),
        httpPort: this.config.port,
        wsPort: this.config.wsPort,
        mode: 'electron',
        skipHappyInitialization: true,
        skipHappyClientConnect: true
      });

      if (!initResult.success) {
        throw new Error(initResult.error || 'LocalService initialization failed');
      }

      const startResult = await this.localService.start();
      if (!startResult.success && !startResult.alreadyRunning) {
        throw new Error(startResult.error || 'LocalService failed to start');
      }

      this.isRunning = true;
      this.addLog('info', `Server started successfully: http://${this.config.host}:${this.config.port}`);

      const status = this.getStatus();
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      return true;
    } catch (error) {
      this.addLog('error', `Failed to start server: ${error.message}`);
      if (this.localService?.isRunning?.()) {
        await this.localService.stop({ stopDaemon: false });
      }
      await this.cleanup();

      const status = { running: false, error: error.message, config: this.config };
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      throw error;
    }
  }

  async waitForReady(timeout = 15000, interval = 200) {
    const startedAt = Date.now();
    this.addLog('info', `Waiting for server ready (timeout: ${timeout}ms)`);

    while (Date.now() - startedAt < timeout) {
      if (await this.checkServerHealth()) {
        this.addLog('info', `Server ready (took: ${Date.now() - startedAt}ms)`);
        return true;
      }
      await sleep(interval);
    }

    this.addLog('warn', `Server ready timeout (${timeout}ms)`);
    return false;
  }

  checkServerHealth() {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.config.host}:${this.config.port}/api/ping`, { timeout: 3000 }, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async stop() {
    if (!this.isRunning) {
      this.addLog('info', 'Server is not running');
      return true;
    }

    this.addLog('info', 'Stopping server...');

    try {
      if (this.localService) {
        const stopResult = await this.localService.stop({ stopDaemon: false });
        if (!stopResult.success && !stopResult.alreadyStopped) {
          throw new Error(stopResult.error || 'LocalService failed to stop');
        }
      }

      await this.cleanup();
      this.isRunning = false;
      this.addLog('info', 'Server stopped');

      const status = { running: false, config: this.config };
      this.notifyRenderer('server-status-changed', status);
      this.emitStatusChange(status);
      return true;
    } catch (error) {
      this.addLog('error', `Failed to stop server: ${error.message}`);
      return false;
    }
  }

  async cleanup() {
    this._detachLocalServiceListeners();
    this.localService = null;
  }

  async restart() {
    this.addLog('info', 'Restarting server...');
    this.notifyRenderer('server-status-changed', { running: false, restarting: true, config: this.config });

    await this.stop();
    await sleep(500);

    const success = await this.start();
    if (success) {
      await this.waitForReady(10000);
    }
    return success;
  }

  getStatus() {
    return {
      running: this.isRunning,
      config: this.config,
      service: this.localService ? this.localService.getStatus() : null
    };
  }

  getDetailedStatus() {
    return {
      ...this.getStatus(),
      logs: this.getLogs()
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
    this.addLog('info', 'Logs cleared');
  }

  addLog(level, message) {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.notifyRenderer('server-log', log);

    const prefix = `[Server ${level.toUpperCase()}]`;
    if (level === 'error') {
      this.originalConsole.error(prefix, message);
    } else if (level === 'warn') {
      this.originalConsole.warn(prefix, message);
    } else {
      this.originalConsole.log(prefix, message);
    }
  }

  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async destroy() {
    this.statusChangeCallbacks = [];
    await this.stop();
  }
}

module.exports = ServerManager;
