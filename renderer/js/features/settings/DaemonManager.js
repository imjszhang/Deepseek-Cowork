/**
 * DaemonManager - Daemon 管理模块
 * 管理 Happy Coder Daemon 的启动、停止和状态
 * 
 * @created 2026-01-16
 * @module features/settings/DaemonManager
 */

class DaemonManager {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 状态
    this.status = {
      running: false,
      pid: null,
      port: null,
      startTime: null
    };
    
    this.isOperating = false; // 是否正在操作中
    
    // DOM 元素
    this.elements = {};
  }

  /**
   * 初始化
   */
  init() {
    this.bindElements();
    this.bindEvents();
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      statusDot: document.getElementById('daemon-status-dot'),
      statusText: document.getElementById('daemon-status-text'),
      pid: document.getElementById('daemon-pid'),
      port: document.getElementById('daemon-port'),
      startTime: document.getElementById('daemon-start-time'),
      startBtn: document.getElementById('btn-daemon-start'),
      stopBtn: document.getElementById('btn-daemon-stop'),
      restartBtn: document.getElementById('btn-daemon-restart')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    this.elements.startBtn?.addEventListener('click', () => this.start());
    this.elements.stopBtn?.addEventListener('click', () => this.stop());
    this.elements.restartBtn?.addEventListener('click', () => this.restart());
  }

  /**
   * 加载状态
   */
  async loadStatus() {
    try {
      console.log('[DaemonManager] Loading status...');
      const result = await window.browserControlManager?.getDaemonStatus?.();
      
      console.log('[DaemonManager] getDaemonStatus result:', result);
      
      // 处理两种格式：直接的 status 对象或 { success, status } 包装
      if (result) {
        if (result.success !== undefined && result.status) {
          // 包装格式: { success: true, status: {...} }
          this.updateUI(result.status);
        } else if (result.running !== undefined) {
          // 直接格式: { running: true, pid: ..., ... }
          this.updateUI(result);
        }
      }
    } catch (error) {
      console.error('[DaemonManager] Load status error:', error);
    }
  }

  /**
   * 更新 UI
   * @param {Object} status 状态对象
   */
  updateUI(status) {
    console.log('[DaemonManager] updateUI with status:', status);
    this.status = status;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 更新状态指示器
    if (this.elements.statusDot) {
      this.elements.statusDot.className = `daemon-status-dot ${status.running ? 'running' : 'stopped'}`;
    }
    
    if (this.elements.statusText) {
      this.elements.statusText.textContent = status.running 
        ? t('settings.daemonRunning') 
        : t('notifications.daemonStopped');
    }
    
    // 更新详情
    if (this.elements.pid) {
      this.elements.pid.textContent = status.pid || '-';
    }
    
    // 支持 port 或 httpPort 字段
    if (this.elements.port) {
      this.elements.port.textContent = status.port || status.httpPort || '-';
    }
    
    if (this.elements.startTime && status.startTime) {
      // 处理多种日期格式
      let date;
      if (typeof status.startTime === 'string') {
        // 尝试解析 "2026/1/20 23:47:31" 格式
        date = new Date(status.startTime.replace(/\//g, '-'));
        if (isNaN(date.getTime())) {
          date = new Date(status.startTime);
        }
      } else {
        date = new Date(status.startTime);
      }
      
      if (!isNaN(date.getTime())) {
        this.elements.startTime.textContent = date.toLocaleString('zh-CN');
      } else {
        this.elements.startTime.textContent = status.startTime;
      }
    } else if (this.elements.startTime) {
      this.elements.startTime.textContent = '-';
    }
    
    // 更新按钮状态
    this.updateButtons(status.running, this.isOperating);
  }

  /**
   * 更新按钮状态
   * @param {boolean} isRunning 是否运行中
   * @param {boolean} isOperating 是否操作中
   */
  updateButtons(isRunning, isOperating) {
    if (this.elements.startBtn) {
      this.elements.startBtn.disabled = isRunning || isOperating;
    }
    if (this.elements.stopBtn) {
      this.elements.stopBtn.disabled = !isRunning || isOperating;
    }
    if (this.elements.restartBtn) {
      this.elements.restartBtn.disabled = !isRunning || isOperating;
    }
  }

  /**
   * 启动 Daemon
   */
  async start() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      this.isOperating = true;
      this.updateButtons(false, true);
      NotificationManager?.info?.(t('notifications.daemonStarting'));
      
      // 更新状态文本
      if (this.elements.statusText) {
        this.elements.statusText.textContent = t('notifications.starting');
      }
      if (this.elements.statusDot) {
        this.elements.statusDot.className = 'daemon-status-dot starting';
      }
      
      const result = await window.browserControlManager?.startDaemon?.();
      
      if (result?.success) {
        NotificationManager?.success?.(t('notifications.daemonStarted'));
        this.updateUI(result.status);
      } else {
        NotificationManager?.error?.(t('notifications.daemonStartFailed') + ': ' + (result?.error || ''));
        this.updateUI({ running: false });
      }
    } catch (error) {
      console.error('[DaemonManager] Start error:', error);
      NotificationManager?.error?.(t('notifications.daemonStartFailed') + ': ' + error.message);
      this.updateUI({ running: false });
    } finally {
      this.isOperating = false;
    }
  }

  /**
   * 停止 Daemon
   */
  async stop() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      this.isOperating = true;
      this.updateButtons(true, true);
      NotificationManager?.info?.(t('notifications.daemonStopping'));
      
      // 更新状态文本
      if (this.elements.statusText) {
        this.elements.statusText.textContent = t('notifications.stopping');
      }
      if (this.elements.statusDot) {
        this.elements.statusDot.className = 'daemon-status-dot stopping';
      }
      
      const result = await window.browserControlManager?.stopDaemon?.();
      
      if (result?.success) {
        NotificationManager?.success?.(t('notifications.daemonStopped'));
        this.updateUI({ running: false });
      } else {
        NotificationManager?.error?.(t('notifications.daemonStopFailed') + ': ' + (result?.error || ''));
        await this.loadStatus();
      }
    } catch (error) {
      console.error('[DaemonManager] Stop error:', error);
      NotificationManager?.error?.(t('notifications.daemonStopFailed') + ': ' + error.message);
    } finally {
      this.isOperating = false;
    }
  }

  /**
   * 重启 Daemon
   */
  async restart() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      this.isOperating = true;
      this.updateButtons(true, true);
      NotificationManager?.info?.(t('notifications.daemonRestarting'));
      
      if (this.elements.statusText) {
        this.elements.statusText.textContent = t('notifications.daemonRestarting');
      }
      if (this.elements.statusDot) {
        this.elements.statusDot.className = 'daemon-status-dot starting';
      }
      
      const result = await window.browserControlManager?.restartDaemon?.();
      
      if (result?.success) {
        NotificationManager?.success?.(t('notifications.daemonRestarted'));
        this.updateUI(result.status);
      } else {
        NotificationManager?.error?.(t('notifications.daemonRestartFailed') + ': ' + (result?.error || ''));
        await this.loadStatus();
      }
    } catch (error) {
      console.error('[DaemonManager] Restart error:', error);
      NotificationManager?.error?.(t('notifications.daemonRestartFailed') + ': ' + error.message);
    } finally {
      this.isOperating = false;
    }
  }

  /**
   * 检查是否运行中
   * @returns {boolean}
   */
  isRunning() {
    return this.status.running;
  }

  /**
   * 获取状态
   * @returns {Object}
   */
  getStatus() {
    return { ...this.status };
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.DaemonManager = DaemonManager;
}
