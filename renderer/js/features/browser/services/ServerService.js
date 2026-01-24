/**
 * ServerService - 服务器状态管理服务
 * 负责服务器的启停、重启、状态查询和日志获取
 * 
 * @created 2026-01-16
 * @module features/browser/services/ServerService
 */

class ServerService {
  /**
   * 构造函数
   * @param {Object} module - BrowserControlModule 实例引用
   */
  constructor(module) {
    this.module = module;
    
    // 服务器状态
    this.status = { running: false };
  }

  /**
   * 获取服务器状态
   * @returns {Promise<Object>} 状态对象
   */
  async getStatus() {
    try {
      const result = await window.browserControlManager.getServerStatus();
      console.log('[ServerService] getServerStatus result:', result);
      
      // 处理 API 响应格式：{ success: true, status: {...} }
      let status;
      if (result?.success !== undefined && result?.status) {
        status = result.status;
      } else if (result?.running !== undefined) {
        status = result;
      } else {
        status = { running: false };
      }
      
      this.status = status;
      return status;
    } catch (error) {
      console.error('[ServerService] Failed to get server status:', error);
      return this.status;
    }
  }

  /**
   * 重启服务器
   * @returns {Promise<void>}
   */
  async restart() {
    try {
      console.log('[ServerService] Restarting server...');
      await window.browserControlManager.restartServer();
    } catch (error) {
      console.error('[ServerService] Failed to restart server:', error);
      throw error;
    }
  }

  /**
   * 刷新管理视图
   * @returns {Promise<void>}
   */
  async refreshView() {
    try {
      await window.browserControlManager.refreshView();
    } catch (error) {
      console.error('[ServerService] Failed to refresh view:', error);
      throw error;
    }
  }

  /**
   * 切换开发者工具
   * @returns {Promise<void>}
   */
  async toggleDevTools() {
    try {
      await window.browserControlManager.toggleDevTools();
    } catch (error) {
      console.error('[ServerService] Failed to toggle DevTools:', error);
      throw error;
    }
  }

  /**
   * 获取服务器日志
   * @param {number} count - 获取的日志数量
   * @returns {Promise<Array>} 日志数组
   */
  async getLogs(count = 100) {
    try {
      const result = await window.browserControlManager.getServerLogs(count);
      // 处理不同的返回格式
      if (Array.isArray(result)) {
        return result;
      }
      if (result && Array.isArray(result.logs)) {
        return result.logs;
      }
      return [];
    } catch (error) {
      console.error('[ServerService] Failed to get server logs:', error);
      return [];
    }
  }

  /**
   * 更新状态（从事件回调中调用）
   * @param {Object} status - 新状态
   */
  updateStatus(status) {
    this.status = status;
  }

  /**
   * 检查服务器是否正在运行
   * @returns {boolean}
   */
  isRunning() {
    return this.status?.running === true;
  }

  /**
   * 检查服务器是否正在重启
   * @returns {boolean}
   */
  isRestarting() {
    return this.status?.restarting === true;
  }

  /**
   * 检查服务器是否有错误
   * @returns {boolean}
   */
  hasError() {
    return this.status?.error === true;
  }

  /**
   * 获取当前状态（同步）
   * @returns {Object}
   */
  getCurrentStatus() {
    return this.status;
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.status = { running: false };
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ServerService = ServerService;
}
