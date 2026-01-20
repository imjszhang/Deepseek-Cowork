/**
 * LogViewer - 日志查看器组件
 * 管理日志的显示、添加和清除
 * 
 * @created 2026-01-16
 * @module components/LogViewer
 */

class LogViewer {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {string} options.containerSelector 日志列表容器选择器
   * @param {string} options.scrollContainerSelector 滚动容器选择器
   * @param {number} options.maxLogs 最大日志条数
   */
  constructor(options = {}) {
    this.containerSelector = options.containerSelector || '#logs-list';
    this.scrollContainerSelector = options.scrollContainerSelector || '#logs-container-inline';
    this.maxLogs = options.maxLogs || 500;
    this.logs = [];
    
    // DOM 元素
    this.container = null;
    this.scrollContainer = null;
  }

  /**
   * 初始化日志查看器
   */
  init() {
    this.container = document.querySelector(this.containerSelector);
    this.scrollContainer = document.querySelector(this.scrollContainerSelector);
  }

  /**
   * 添加日志条目
   * @param {Object} log 日志对象
   * @param {boolean} autoScroll 是否自动滚动到底部
   */
  append(log, autoScroll = true) {
    this.logs.push(log);
    
    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
      // 重新渲染
      this.render();
      return;
    }
    
    // 添加单条日志
    const logEntry = this.createEntry(log);
    this.container?.appendChild(logEntry);
    
    if (autoScroll) {
      this.scrollToBottom();
    }
  }

  /**
   * 创建日志条目元素
   * @param {Object} log 日志对象
   * @returns {HTMLElement}
   */
  createEntry(log) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    // 时间
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = this.formatTime(log.timestamp);
    
    // 级别
    const level = document.createElement('span');
    level.className = `log-level ${log.level}`;
    level.textContent = log.level;
    
    // 消息
    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = log.message;
    
    entry.appendChild(time);
    entry.appendChild(level);
    entry.appendChild(message);
    
    return entry;
  }

  /**
   * 渲染所有日志
   */
  render() {
    if (!this.container) return;
    this.container.innerHTML = '';
    this.logs.forEach(log => {
      const entry = this.createEntry(log);
      this.container.appendChild(entry);
    });
    this.scrollToBottom();
  }

  /**
   * 清除所有日志
   * @param {Function} onClear 清除后的回调（用于清除后端日志）
   */
  async clear(onClear = null) {
    if (onClear) {
      await onClear();
    }
    this.logs = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * 滚动日志到底部
   */
  scrollToBottom() {
    if (this.scrollContainer) {
      this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
    }
  }

  /**
   * 格式化时间
   * @param {string|number} timestamp 时间戳
   * @returns {string}
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * 获取日志数量
   * @returns {number}
   */
  getCount() {
    return this.logs.length;
  }

  /**
   * 获取所有日志
   * @returns {Array}
   */
  getLogs() {
    return [...this.logs];
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.LogViewer = LogViewer;
}
