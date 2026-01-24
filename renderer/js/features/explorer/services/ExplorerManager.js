/**
 * ExplorerManager - Explorer 模块管理器
 * 统一管理 ExplorerClient 和 ExplorerSSE，提供统一的初始化和管理接口
 * 
 * @created 2026-01-15
 * @module features/explorer/services/ExplorerManager
 */

// 确保依赖已加载
if (typeof ExplorerClient === 'undefined') {
  console.error('[ExplorerManager] ExplorerClient not loaded');
}

if (typeof ExplorerSSE === 'undefined') {
  console.error('[ExplorerManager] ExplorerSSE not loaded');
}

/**
 * Explorer 模块管理器
 * 提供统一的初始化和管理接口
 */
class ExplorerManager {
  /**
   * 构造函数
   * @param {Object} options - 配置选项
   */
  constructor(options = {}) {
    this.options = {
      baseUrl: 'http://localhost:3333',
      autoConnect: false,
      ...options
    };
    
    this.client = null;
    this.sse = null;
    this.initialized = false;
  }

  /**
   * 初始化 Explorer 模块
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      console.warn('[ExplorerManager] Already initialized');
      return;
    }

    console.log('[ExplorerManager] Initializing with baseUrl:', this.options.baseUrl);

    // 创建 HTTP 客户端
    this.client = new ExplorerClient(this.options.baseUrl);
    
    // 创建 SSE 管理器
    this.sse = new ExplorerSSE(this.options.baseUrl, {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      eventDebounceMs: 300
    });

    this.initialized = true;

    // 自动连接 SSE
    if (this.options.autoConnect) {
      try {
        await this.connectSSE();
      } catch (error) {
        console.warn('[ExplorerManager] Auto-connect SSE failed:', error.message);
      }
    }

    console.log('[ExplorerManager] Initialized successfully');
  }

  /**
   * 连接 SSE
   * @returns {Promise<void>}
   */
  async connectSSE() {
    if (!this.sse) {
      throw new Error('ExplorerManager not initialized');
    }
    return this.sse.connect();
  }

  /**
   * 断开 SSE
   */
  disconnectSSE() {
    if (this.sse) {
      this.sse.disconnect();
    }
  }

  /**
   * 获取 HTTP 客户端实例
   * @returns {ExplorerClient}
   */
  getClient() {
    return this.client;
  }

  /**
   * 获取 SSE 管理器实例
   * @returns {ExplorerSSE}
   */
  getSSE() {
    return this.sse;
  }

  /**
   * 检查服务是否在线
   * @returns {Promise<boolean>}
   */
  async isServiceOnline() {
    if (!this.client) return false;
    return this.client.isOnline();
  }

  /**
   * 检查 SSE 是否已连接
   * @returns {boolean}
   */
  isSSEConnected() {
    return this.sse?.isConnected() || false;
  }

  /**
   * 更新基础 URL
   * @param {string} newBaseUrl - 新的基础 URL
   */
  setBaseUrl(newBaseUrl) {
    this.options.baseUrl = newBaseUrl;
    if (this.client) {
      this.client.setBaseUrl(newBaseUrl);
    }
    if (this.sse) {
      this.sse.setBaseUrl(newBaseUrl);
    }
  }

  /**
   * 销毁模块
   */
  destroy() {
    if (this.sse) {
      this.sse.disconnect();
      this.sse = null;
    }
    this.client = null;
    this.initialized = false;
    console.log('[ExplorerManager] Destroyed');
  }

  // ==================== 便捷方法（代理到 client）====================

  /**
   * 获取服务状态
   */
  async getStatus() {
    return this.client?.getStatus();
  }

  /**
   * 列出目录内容
   */
  async listDirectory(path) {
    return this.client?.listDirectory(path);
  }

  /**
   * 读取文件内容
   */
  async readFile(path) {
    return this.client?.readFile(path);
  }

  /**
   * 保存文件内容
   */
  async saveFile(path, content) {
    return this.client?.saveFile(path, content);
  }

  /**
   * 删除文件
   */
  async deleteFile(path) {
    return this.client?.deleteFile(path);
  }

  /**
   * 创建目录
   */
  async createDirectory(path) {
    return this.client?.createDirectory(path);
  }

  /**
   * 删除目录
   */
  async deleteDirectory(path, recursive = false) {
    return this.client?.deleteDirectory(path, recursive);
  }

  /**
   * 复制文件
   */
  async copyFile(source, dest) {
    return this.client?.copyFile(source, dest);
  }

  /**
   * 移动/重命名文件
   */
  async moveFile(source, dest) {
    return this.client?.moveFile(source, dest);
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(path) {
    return this.client?.getFileInfo(path);
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ExplorerManager = ExplorerManager;
}
