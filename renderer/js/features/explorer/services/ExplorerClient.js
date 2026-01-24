/**
 * ExplorerClient - HTTP API 客户端
 * 封装与 Explorer 服务的 HTTP 通信
 * 
 * @created 2026-01-15
 * @module features/explorer/services/ExplorerClient
 */

class ExplorerClient {
  /**
   * 构造函数
   * @param {string} baseUrl - Explorer 服务基础 URL
   */
  constructor(baseUrl = 'http://localhost:3333') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 移除尾部斜杠
    this.apiPrefix = '/api/explorer';
  }

  /**
   * 发送 HTTP 请求
   * @param {string} endpoint - API 端点
   * @param {Object} options - fetch 选项
   * @returns {Promise<Object>} 响应数据
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${this.apiPrefix}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    try {
      const response = await fetch(url, mergedOptions);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('无法连接到 Explorer 服务');
      }
      throw error;
    }
  }

  // ==================== 状态查询 ====================

  /**
   * 获取服务状态
   * @returns {Promise<Object>} 服务状态信息
   */
  async getStatus() {
    return this.request('/status');
  }

  /**
   * 获取当前运行模式
   * @returns {Promise<Object>} 模式信息
   */
  async getMode() {
    return this.request('/mode');
  }

  // ==================== 文件结构 ====================

  /**
   * 获取完整文件树结构
   * @returns {Promise<Object>} 文件树结构
   */
  async getStructure() {
    return this.request('/structure');
  }

  /**
   * 列出目录内容
   * @param {string} path - 目录路径
   * @returns {Promise<Object>} 目录内容列表
   */
  async listDirectory(path) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/list?path=${encodedPath}`);
  }

  // ==================== 文件操作 ====================

  /**
   * 读取文件内容
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 文件内容
   */
  async readFile(path) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/file?path=${encodedPath}`);
  }

  /**
   * 保存文件内容
   * @param {string} path - 文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<Object>} 保存结果
   */
  async saveFile(path, content) {
    return this.request('/file', {
      method: 'POST',
      body: JSON.stringify({ path, content })
    });
  }

  /**
   * 删除文件
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 删除结果
   */
  async deleteFile(path) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/file?path=${encodedPath}`, {
      method: 'DELETE'
    });
  }

  /**
   * 获取文件信息
   * @param {string} path - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  async getFileInfo(path) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/file/info?path=${encodedPath}`);
  }

  // ==================== 目录操作 ====================

  /**
   * 创建目录
   * @param {string} path - 目录路径
   * @returns {Promise<Object>} 创建结果
   */
  async createDirectory(path) {
    return this.request('/directory', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  /**
   * 删除目录
   * @param {string} path - 目录路径
   * @param {boolean} recursive - 是否递归删除
   * @returns {Promise<Object>} 删除结果
   */
  async deleteDirectory(path, recursive = false) {
    const encodedPath = encodeURIComponent(path);
    return this.request(`/directory?path=${encodedPath}&recursive=${recursive}`, {
      method: 'DELETE'
    });
  }

  // ==================== 复制/移动 ====================

  /**
   * 复制文件
   * @param {string} source - 源路径
   * @param {string} dest - 目标路径
   * @returns {Promise<Object>} 复制结果
   */
  async copyFile(source, dest) {
    return this.request('/copy', {
      method: 'POST',
      body: JSON.stringify({ source, dest })
    });
  }

  /**
   * 移动/重命名文件
   * @param {string} source - 源路径
   * @param {string} dest - 目标路径
   * @returns {Promise<Object>} 移动结果
   */
  async moveFile(source, dest) {
    return this.request('/move', {
      method: 'POST',
      body: JSON.stringify({ source, dest })
    });
  }

  // ==================== 工具方法 ====================

  /**
   * 检查服务是否在线
   * @returns {Promise<boolean>} 是否在线
   */
  async isOnline() {
    try {
      const result = await this.getStatus();
      return result.status === 'success' && result.data?.isRunning;
    } catch {
      return false;
    }
  }

  /**
   * 更新基础 URL
   * @param {string} newBaseUrl - 新的基础 URL
   */
  setBaseUrl(newBaseUrl) {
    this.baseUrl = newBaseUrl.replace(/\/$/, '');
  }
}

// 导出到全局（浏览器环境）
if (typeof window !== 'undefined') {
  window.ExplorerClient = ExplorerClient;
}
