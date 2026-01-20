/**
 * ExtensionService - 浏览器扩展连接管理服务
 * 负责扩展连接的轮询和状态管理
 * 
 * @created 2026-01-16
 * @module features/browser/services/ExtensionService
 */

class ExtensionService {
  /**
   * 构造函数
   * @param {Object} module - BrowserControlModule 实例引用
   */
  constructor(module) {
    this.module = module;
    
    // 连接数
    this.connections = 0;
    
    // 轮询定时器
    this.pollInterval = null;
    
    // 默认轮询间隔（毫秒）
    this.defaultIntervalMs = 5000;
  }

  /**
   * 启动扩展连接轮询
   * @param {number} intervalMs - 轮询间隔（毫秒），默认 5000ms
   */
  startPoll(intervalMs = this.defaultIntervalMs) {
    // 避免重复启动
    if (this.pollInterval) {
      return;
    }
    
    this.pollInterval = setInterval(() => {
      // 只有服务器运行时才轮询
      if (this.module.isServerRunning()) {
        this.fetchConnections();
      }
    }, intervalMs);
    
    console.log(`[ExtensionService] Poll started with interval ${intervalMs}ms`);
  }

  /**
   * 停止扩展连接轮询
   */
  stopPoll() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[ExtensionService] Poll stopped');
    }
  }

  /**
   * 获取扩展连接数
   * @returns {Promise<number>} 连接数
   */
  async fetchConnections() {
    try {
      const result = await window.browserControlManager.getExtensionConnections();
      // 处理不同的返回格式
      let connections = 0;
      if (typeof result === 'number') {
        connections = result;
      } else if (result && typeof result.connections === 'number') {
        connections = result.connections;
      }
      
      this.connections = connections;
      
      // 通知模块更新 UI
      this.module.onExtensionConnectionsChanged(connections);
      
      return connections;
    } catch (error) {
      console.error('[ExtensionService] Failed to get extension connections:', error);
      return this.connections;
    }
  }

  /**
   * 获取当前连接数（同步）
   * @returns {number}
   */
  getCount() {
    return this.connections;
  }

  /**
   * 设置连接数（用于从状态更新中同步）
   * @param {number} count
   */
  setCount(count) {
    this.connections = count;
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.stopPoll();
    this.connections = 0;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ExtensionService = ExtensionService;
}
