/**
 * extract_with_feedback.js - 数据提取模板（带视觉反馈）
 * 
 * 此模板用于从页面提取数据，会高亮显示正在提取的元素。
 * 
 * 使用方法：
 *   1. 复制此模板
 *   2. 修改选择器和数据提取逻辑
 *   3. 使用 --visual-feedback 参数运行
 * 
 * @template extract_with_feedback
 * @requires __bcHighlight (自动注入)
 */

(() => {
  // ========== 配置区域 - 根据需要修改 ==========
  const CONFIG = {
    // 列表项选择器
    itemSelector: '.item',
    
    // 每个项目的数据提取规则
    extractRules: {
      title: { selector: '.title', attr: 'innerText' },
      link: { selector: 'a', attr: 'href' },
      desc: { selector: '.desc', attr: 'innerText' },
      image: { selector: 'img', attr: 'src' }
    },
    
    // 是否逐个高亮（true: 逐个显示，false: 批量显示）
    sequential: false,
    
    // 处理间隔（毫秒，仅 sequential=true 时有效）
    delay: 100
  };
  // ========== 配置区域结束 ==========

  try {
    const items = document.querySelectorAll(CONFIG.itemSelector);
    
    if (!items.length) {
      return { 
        success: true, 
        data: [], 
        message: 'No items found',
        selector: CONFIG.itemSelector
      };
    }

    // 检查是否有视觉反馈模块
    const hasHighlight = typeof __bcHighlight !== 'undefined';
    
    // 提取单个元素的数据
    const extractItem = (item) => {
      const data = {};
      
      for (const [key, rule] of Object.entries(CONFIG.extractRules)) {
        const el = item.querySelector(rule.selector);
        if (el) {
          if (rule.attr === 'innerText') {
            data[key] = el.innerText?.trim() ?? '';
          } else if (rule.attr === 'innerHTML') {
            data[key] = el.innerHTML ?? '';
          } else {
            data[key] = el.getAttribute(rule.attr) ?? el[rule.attr] ?? '';
          }
        } else {
          data[key] = '';
        }
      }
      
      return data;
    };

    // 如果有视觉反馈且需要逐个处理
    if (hasHighlight && CONFIG.sequential) {
      return __bcHighlight.batch(items, (item, index) => {
        return extractItem(item);
      }, { delay: CONFIG.delay }).then(results => {
        const data = results.map(r => r.result);
        return { 
          success: true, 
          data: data, 
          count: data.length 
        };
      });
    }
    
    // 批量提取（带整体高亮）
    if (hasHighlight) {
      // 高亮所有元素
      items.forEach((item, index) => {
        __bcHighlight.show(item, { badge: index + 1 });
      });
    }
    
    const data = Array.from(items).map(extractItem);
    
    // 显示成功反馈
    if (hasHighlight) {
      items.forEach(item => {
        __bcHighlight.success(item);
      });
    }
    
    return { 
      success: true, 
      data: data, 
      count: data.length 
    };
    
  } catch (e) {
    return { 
      success: false, 
      error: e.message,
      stack: e.stack
    };
  }
})()
