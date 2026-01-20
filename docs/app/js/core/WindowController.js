/**
 * WindowController - 窗口控制模块
 * 处理窗口最小化、最大化、关闭等操作
 * 
 * @created 2026-01-16
 * @module core/WindowController
 */

const WindowController = {
  /**
   * 最小化窗口
   */
  minimize() {
    (window.apiAdapter || window.browserControlManager)?.minimizeWindow?.();
  },

  /**
   * 最大化窗口
   */
  maximize() {
    (window.apiAdapter || window.browserControlManager)?.maximizeWindow?.();
  },

  /**
   * 关闭窗口
   */
  close() {
    (window.apiAdapter || window.browserControlManager)?.closeWindow?.();
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.WindowController = WindowController;
}
