/**
 * NotificationManager - 通知管理组件
 * 显示临时通知消息（toast）
 * 
 * @created 2026-01-16
 * @module components/NotificationManager
 */

const NotificationManager = {
  /**
   * 显示通知
   * @param {string} message 消息内容
   * @param {string} type 类型 ('info', 'success', 'error', 'warning')
   * @param {number} duration 显示时长（毫秒），默认 3000
   */
  show(message, type = 'info', duration = 3000) {
    const colors = {
      info: '#3b82f6',
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b'
    };
    
    console.log(`[Notification] ${type}: ${message}`);
    
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      padding: 12px 20px;
      background: ${colors[type] || colors.info};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // 指定时间后移除
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  },

  /**
   * 显示信息通知
   * @param {string} message 消息内容
   */
  info(message) {
    this.show(message, 'info');
  },

  /**
   * 显示成功通知
   * @param {string} message 消息内容
   */
  success(message) {
    this.show(message, 'success');
  },

  /**
   * 显示错误通知
   * @param {string} message 消息内容
   */
  error(message) {
    this.show(message, 'error');
  },

  /**
   * 显示警告通知
   * @param {string} message 消息内容
   */
  warning(message) {
    this.show(message, 'warning');
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.NotificationManager = NotificationManager;
}
