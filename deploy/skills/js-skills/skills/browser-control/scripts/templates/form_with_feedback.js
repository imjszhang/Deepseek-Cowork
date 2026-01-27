/**
 * form_with_feedback.js - 表单操作模板（带视觉反馈）
 * 
 * 此模板用于填写和提交表单，会高亮显示正在操作的表单元素。
 * 
 * 使用方法：
 *   1. 复制此模板
 *   2. 修改表单字段配置
 *   3. 使用 --visual-feedback 参数运行
 * 
 * @template form_with_feedback
 * @requires __bcHighlight (自动注入)
 */

(() => {
  // ========== 配置区域 - 根据需要修改 ==========
  const CONFIG = {
    // 表单字段配置
    fields: [
      {
        selector: 'input[name="username"]',
        value: 'test_user',
        label: '填写用户名'
      },
      {
        selector: 'input[name="email"]',
        value: 'test@example.com',
        label: '填写邮箱'
      },
      {
        selector: 'textarea[name="message"]',
        value: '这是测试消息',
        label: '填写消息'
      }
    ],
    
    // 提交按钮选择器
    submitSelector: 'button[type="submit"]',
    
    // 是否自动提交
    autoSubmit: true,
    
    // 字段填写间隔（毫秒）
    fieldDelay: 300,
    
    // 提交前等待时间（毫秒）
    submitDelay: 500
  };
  // ========== 配置区域结束 ==========

  // 检查是否有视觉反馈模块
  const hasHighlight = typeof __bcHighlight !== 'undefined';
  
  // 触发 input 事件（某些框架需要）
  const triggerInputEvent = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // 填写单个字段
  const fillField = async (fieldConfig) => {
    const { selector, value, label } = fieldConfig;
    const element = document.querySelector(selector);
    
    if (!element) {
      return { success: false, error: `Element not found: ${selector}` };
    }
    
    if (hasHighlight) {
      __bcHighlight.show(element, { label: label || '填写中...', pulse: true });
      await new Promise(r => setTimeout(r, 200));
    }
    
    try {
      // 根据元素类型填写值
      if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = !!value;
      } else if (element.type === 'select-one' || element.type === 'select-multiple') {
        element.value = value;
      } else {
        element.value = value;
      }
      
      triggerInputEvent(element);
      
      if (hasHighlight) {
        __bcHighlight.success(element);
      }
      
      return { success: true, selector, value };
    } catch (e) {
      if (hasHighlight) {
        __bcHighlight.fail(element);
      }
      return { success: false, selector, error: e.message };
    }
  };

  // 主逻辑
  return (async () => {
    try {
      const results = [];
      
      // 逐个填写字段
      for (const field of CONFIG.fields) {
        const result = await fillField(field);
        results.push(result);
        
        if (!result.success) {
          return {
            success: false,
            error: `Failed to fill field: ${field.selector}`,
            details: result.error,
            results
          };
        }
        
        // 字段间延迟
        await new Promise(r => setTimeout(r, CONFIG.fieldDelay));
      }
      
      // 提交表单
      if (CONFIG.autoSubmit) {
        const submitBtn = document.querySelector(CONFIG.submitSelector);
        
        if (!submitBtn) {
          return {
            success: false,
            error: `Submit button not found: ${CONFIG.submitSelector}`,
            results
          };
        }
        
        // 提交前等待
        await new Promise(r => setTimeout(r, CONFIG.submitDelay));
        
        if (hasHighlight) {
          await __bcHighlight.withFeedback(submitBtn, () => {
            submitBtn.click();
            return { success: true };
          }, { label: '提交中...' });
        } else {
          submitBtn.click();
        }
        
        return {
          success: true,
          message: 'Form submitted',
          fieldsCount: results.length,
          results
        };
      }
      
      return {
        success: true,
        message: 'Form filled (not submitted)',
        fieldsCount: results.length,
        results
      };
      
    } catch (e) {
      return {
        success: false,
        error: e.message,
        stack: e.stack
      };
    }
  })();
})()
