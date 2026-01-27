/**
 * click_with_feedback.js - 点击操作模板（带视觉反馈）
 * 
 * 此模板用于点击页面元素，会高亮显示正在点击的元素。
 * 
 * 使用方法：
 *   1. 复制此模板
 *   2. 修改目标选择器
 *   3. 使用 --visual-feedback 参数运行
 * 
 * @template click_with_feedback
 * @requires __bcHighlight (自动注入)
 */

(() => {
  // ========== 配置区域 - 根据需要修改 ==========
  const CONFIG = {
    // 点击目标选择器
    selector: '.btn-submit',
    
    // 点击前等待时间（毫秒）
    waitBefore: 500,
    
    // 点击后等待时间（毫秒）
    waitAfter: 1000,
    
    // 点击类型: 'click' | 'dblclick' | 'mousedown'
    clickType: 'click',
    
    // 操作标签
    label: '点击按钮',
    
    // 是否等待元素出现
    waitForElement: true,
    
    // 等待元素超时时间（毫秒）
    waitTimeout: 5000,
    
    // 点击后检查选择器（可选，用于验证操作结果）
    checkSelector: null,
    
    // 点击后检查条件（可选）
    // checkCondition: (element) => element.classList.contains('active')
    checkCondition: null
  };
  // ========== 配置区域结束 ==========

  // 检查是否有视觉反馈模块
  const hasHighlight = typeof __bcHighlight !== 'undefined';

  // 等待元素出现
  const waitForElement = (selector, timeout) => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      const startTime = Date.now();
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        } else if (Date.now() - startTime > timeout) {
          observer.disconnect();
          reject(new Error(`Element not found within ${timeout}ms: ${selector}`));
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 超时检查
      setTimeout(() => {
        observer.disconnect();
        const el = document.querySelector(selector);
        if (el) {
          resolve(el);
        } else {
          reject(new Error(`Element not found within ${timeout}ms: ${selector}`));
        }
      }, timeout);
    });
  };

  // 执行点击
  const performClick = (element, clickType) => {
    switch (clickType) {
      case 'dblclick':
        element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        break;
      case 'mousedown':
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        break;
      case 'click':
      default:
        element.click();
        break;
    }
  };

  // 主逻辑
  return (async () => {
    try {
      let element;
      
      // 获取目标元素
      if (CONFIG.waitForElement) {
        element = await waitForElement(CONFIG.selector, CONFIG.waitTimeout);
      } else {
        element = document.querySelector(CONFIG.selector);
      }
      
      if (!element) {
        return {
          success: false,
          error: `Element not found: ${CONFIG.selector}`
        };
      }
      
      // 点击前等待
      if (CONFIG.waitBefore > 0) {
        await new Promise(r => setTimeout(r, CONFIG.waitBefore));
      }
      
      // 执行点击（带视觉反馈）
      if (hasHighlight) {
        await __bcHighlight.withFeedback(element, () => {
          performClick(element, CONFIG.clickType);
          return { success: true };
        }, { label: CONFIG.label });
      } else {
        performClick(element, CONFIG.clickType);
      }
      
      // 点击后等待
      if (CONFIG.waitAfter > 0) {
        await new Promise(r => setTimeout(r, CONFIG.waitAfter));
      }
      
      // 验证操作结果（可选）
      let checkResult = null;
      if (CONFIG.checkSelector) {
        const checkElement = document.querySelector(CONFIG.checkSelector);
        if (checkElement) {
          if (CONFIG.checkCondition) {
            checkResult = CONFIG.checkCondition(checkElement);
          } else {
            checkResult = true;
          }
        } else {
          checkResult = false;
        }
      }
      
      return {
        success: true,
        message: `Clicked: ${CONFIG.selector}`,
        clickType: CONFIG.clickType,
        checkResult: checkResult
      };
      
    } catch (e) {
      // 失败反馈
      if (hasHighlight) {
        const element = document.querySelector(CONFIG.selector);
        if (element) {
          __bcHighlight.fail(element);
        }
      }
      
      return {
        success: false,
        error: e.message,
        stack: e.stack
      };
    }
  })();
})()
