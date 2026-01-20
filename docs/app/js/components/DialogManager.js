/**
 * DialogManager - 对话框管理组件
 * 提供统一的对话框显示/隐藏控制
 * 
 * @created 2026-01-16
 * @module components/DialogManager
 */

const DialogManager = {
  /**
   * 当前打开的对话框栈
   */
  _openDialogs: [],

  /**
   * 显示对话框
   * @param {HTMLElement|string} dialog 对话框元素或 ID
   * @param {Object} options 配置选项
   * @param {HTMLElement} options.focusElement 显示后聚焦的元素
   * @param {Function} options.onShow 显示后的回调
   */
  show(dialog, options = {}) {
    const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
    if (!el) {
      console.warn('[DialogManager] Dialog not found:', dialog);
      return;
    }

    el.style.display = 'flex';
    this._openDialogs.push(el);

    // 聚焦指定元素
    if (options.focusElement) {
      setTimeout(() => {
        options.focusElement.focus();
      }, 100);
    }

    // 执行回调
    if (options.onShow) {
      options.onShow(el);
    }
  },

  /**
   * 隐藏对话框
   * @param {HTMLElement|string} dialog 对话框元素或 ID
   * @param {Object} options 配置选项
   * @param {Function} options.onHide 隐藏后的回调
   */
  hide(dialog, options = {}) {
    const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
    if (!el) {
      console.warn('[DialogManager] Dialog not found:', dialog);
      return;
    }

    el.style.display = 'none';

    // 从栈中移除
    const index = this._openDialogs.indexOf(el);
    if (index > -1) {
      this._openDialogs.splice(index, 1);
    }

    // 执行回调
    if (options.onHide) {
      options.onHide(el);
    }
  },

  /**
   * 切换对话框显示状态
   * @param {HTMLElement|string} dialog 对话框元素或 ID
   */
  toggle(dialog) {
    const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
    if (!el) return;

    if (el.style.display === 'none' || !el.style.display) {
      this.show(el);
    } else {
      this.hide(el);
    }
  },

  /**
   * 关闭所有打开的对话框
   */
  hideAll() {
    [...this._openDialogs].forEach(dialog => {
      this.hide(dialog);
    });
  },

  /**
   * 检查对话框是否打开
   * @param {HTMLElement|string} dialog 对话框元素或 ID
   * @returns {boolean}
   */
  isOpen(dialog) {
    const el = typeof dialog === 'string' ? document.getElementById(dialog) : dialog;
    return el && el.style.display !== 'none' && el.style.display !== '';
  },

  /**
   * 创建简单的确认对话框
   * @param {string} message 消息内容
   * @param {Object} options 配置选项
   * @returns {Promise<boolean>}
   */
  confirm(message, options = {}) {
    return new Promise((resolve) => {
      // 使用原生 confirm 作为默认实现
      // 后续可以替换为自定义 UI
      const result = window.confirm(message);
      resolve(result);
    });
  },

  /**
   * 创建简单的输入对话框
   * @param {string} message 提示消息
   * @param {string} defaultValue 默认值
   * @returns {Promise<string|null>}
   */
  prompt(message, defaultValue = '') {
    return new Promise((resolve) => {
      // 使用原生 prompt 作为默认实现
      const result = window.prompt(message, defaultValue);
      resolve(result);
    });
  }
};

// 导出到全局
if (typeof window !== 'undefined') {
  window.DialogManager = DialogManager;
}
