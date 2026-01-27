/**
 * visual-feedback.js - 浏览器脚本视觉反馈模块
 * 
 * 此模块可注入到页面中，为脚本操作的元素提供视觉反馈效果。
 * 
 * API:
 *   __bcHighlight.show(element, options)    - 显示高亮
 *   __bcHighlight.hide(element)             - 隐藏高亮
 *   __bcHighlight.success(element, duration) - 成功反馈（绿色）
 *   __bcHighlight.fail(element, duration)    - 失败反馈（红色）
 *   __bcHighlight.withFeedback(element, fn)  - 自动包装操作
 *   __bcHighlight.batch(elements, fn)        - 批量操作带序号
 *   __bcHighlight.cleanup()                  - 清理所有高亮
 * 
 * @created 2026-01-12
 */

const __bcHighlight = (() => {
  // 配置
  const CONFIG = {
    prefix: '__bc-highlight-',
    zIndex: 2147483647,
    colors: {
      primary: '#2196F3',    // 蓝色 - 默认/处理中
      success: '#4CAF50',    // 绿色 - 成功
      error: '#F44336',      // 红色 - 失败
      warning: '#FF9800'     // 橙色 - 警告
    },
    defaultDuration: 1500,   // 默认反馈持续时间（毫秒）
    animationDuration: 300   // 动画时长（毫秒）
  };

  // 存储所有创建的覆盖层
  const overlays = new Map();
  let styleInjected = false;
  let containerId = null;

  /**
   * 注入样式
   */
  function injectStyles() {
    if (styleInjected) return;
    
    const styleId = CONFIG.prefix + 'styles';
    if (document.getElementById(styleId)) {
      styleInjected = true;
      return;
    }

    const css = `
      .${CONFIG.prefix}container {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: ${CONFIG.zIndex} !important;
        overflow: visible !important;
      }
      
      .${CONFIG.prefix}overlay {
        position: absolute !important;
        box-sizing: border-box !important;
        pointer-events: none !important;
        border: 3px solid ${CONFIG.colors.primary} !important;
        border-radius: 4px !important;
        background: rgba(33, 150, 243, 0.1) !important;
        transition: all ${CONFIG.animationDuration}ms ease !important;
        opacity: 0 !important;
        transform: scale(0.95) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}visible {
        opacity: 1 !important;
        transform: scale(1) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}success {
        border-color: ${CONFIG.colors.success} !important;
        background: rgba(76, 175, 80, 0.1) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}error {
        border-color: ${CONFIG.colors.error} !important;
        background: rgba(244, 67, 54, 0.1) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}pulse {
        animation: ${CONFIG.prefix}pulse-animation 1s ease-in-out infinite !important;
      }
      
      @keyframes ${CONFIG.prefix}pulse-animation {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4);
        }
        50% {
          box-shadow: 0 0 0 10px rgba(33, 150, 243, 0);
        }
      }
      
      .${CONFIG.prefix}label {
        position: absolute !important;
        top: -28px !important;
        left: 0 !important;
        padding: 4px 8px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        color: white !important;
        background: ${CONFIG.colors.primary} !important;
        border-radius: 4px !important;
        white-space: nowrap !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}success .${CONFIG.prefix}label {
        background: ${CONFIG.colors.success} !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}error .${CONFIG.prefix}label {
        background: ${CONFIG.colors.error} !important;
      }
      
      .${CONFIG.prefix}badge {
        position: absolute !important;
        top: -12px !important;
        right: -12px !important;
        width: 24px !important;
        height: 24px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12px !important;
        font-weight: bold !important;
        color: white !important;
        background: ${CONFIG.colors.primary} !important;
        border-radius: 50% !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}success .${CONFIG.prefix}badge {
        background: ${CONFIG.colors.success} !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}success .${CONFIG.prefix}badge::after {
        content: '✓' !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}error .${CONFIG.prefix}badge {
        background: ${CONFIG.colors.error} !important;
      }
      
      .${CONFIG.prefix}overlay.${CONFIG.prefix}error .${CONFIG.prefix}badge::after {
        content: '✗' !important;
      }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
    styleInjected = true;
  }

  /**
   * 获取或创建覆盖层容器
   */
  function getContainer() {
    if (containerId) {
      const existing = document.getElementById(containerId);
      if (existing) return existing;
    }

    containerId = CONFIG.prefix + 'container-' + Date.now();
    const container = document.createElement('div');
    container.id = containerId;
    container.className = CONFIG.prefix + 'container';
    document.body.appendChild(container);
    return container;
  }

  /**
   * 获取元素的唯一标识
   */
  function getElementId(element) {
    if (!element.__bcHighlightId) {
      element.__bcHighlightId = CONFIG.prefix + 'el-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    return element.__bcHighlightId;
  }

  /**
   * 更新覆盖层位置
   */
  function updateOverlayPosition(overlay, element) {
    const rect = element.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    overlay.style.left = (rect.left + scrollX - 3) + 'px';
    overlay.style.top = (rect.top + scrollY - 3) + 'px';
    overlay.style.width = (rect.width + 6) + 'px';
    overlay.style.height = (rect.height + 6) + 'px';
  }

  /**
   * 显示高亮
   * @param {HTMLElement} element - 目标元素
   * @param {Object} options - 选项
   * @param {string} options.label - 标签文字
   * @param {boolean} options.pulse - 是否使用脉冲动画
   * @param {number} options.badge - 序号角标
   */
  function show(element, options = {}) {
    if (!element || !(element instanceof HTMLElement)) {
      console.warn('[__bcHighlight] Invalid element');
      return null;
    }

    injectStyles();
    const container = getContainer();
    const elementId = getElementId(element);

    // 如果已存在，先移除
    if (overlays.has(elementId)) {
      hide(element);
    }

    // 创建覆盖层
    const overlay = document.createElement('div');
    overlay.className = CONFIG.prefix + 'overlay';
    
    if (options.pulse) {
      overlay.classList.add(CONFIG.prefix + 'pulse');
    }

    // 添加标签
    if (options.label) {
      const label = document.createElement('div');
      label.className = CONFIG.prefix + 'label';
      label.textContent = options.label;
      overlay.appendChild(label);
    }

    // 添加序号角标
    if (typeof options.badge === 'number') {
      const badge = document.createElement('div');
      badge.className = CONFIG.prefix + 'badge';
      badge.textContent = options.badge;
      overlay.appendChild(badge);
    }

    container.appendChild(overlay);
    updateOverlayPosition(overlay, element);

    // 保存引用
    overlays.set(elementId, { overlay, element });

    // 触发显示动画
    requestAnimationFrame(() => {
      overlay.classList.add(CONFIG.prefix + 'visible');
    });

    // 监听滚动和窗口大小变化
    const updatePosition = () => updateOverlayPosition(overlay, element);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    overlay.__bcCleanupListeners = () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };

    return overlay;
  }

  /**
   * 隐藏高亮
   * @param {HTMLElement} element - 目标元素
   */
  function hide(element) {
    if (!element) return;

    const elementId = getElementId(element);
    const data = overlays.get(elementId);
    
    if (data) {
      const { overlay } = data;
      
      // 清理事件监听
      if (overlay.__bcCleanupListeners) {
        overlay.__bcCleanupListeners();
      }
      
      // 移除动画
      overlay.classList.remove(CONFIG.prefix + 'visible');
      
      // 延迟移除 DOM
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, CONFIG.animationDuration);
      
      overlays.delete(elementId);
    }
  }

  /**
   * 成功反馈
   * @param {HTMLElement} element - 目标元素
   * @param {number} duration - 持续时间（毫秒）
   */
  function success(element, duration = CONFIG.defaultDuration) {
    const elementId = getElementId(element);
    const data = overlays.get(elementId);
    
    if (data) {
      const { overlay } = data;
      overlay.classList.remove(CONFIG.prefix + 'pulse');
      overlay.classList.add(CONFIG.prefix + 'success');
      
      // 更新标签
      const label = overlay.querySelector('.' + CONFIG.prefix + 'label');
      if (label) {
        label.textContent = '完成';
      }
      
      // 更新角标显示对勾
      const badge = overlay.querySelector('.' + CONFIG.prefix + 'badge');
      if (badge) {
        badge.textContent = '';
      }
      
      // 延迟隐藏
      if (duration > 0) {
        setTimeout(() => hide(element), duration);
      }
    } else {
      // 如果没有现有高亮，创建一个成功状态的
      const overlay = show(element, { label: '完成' });
      if (overlay) {
        overlay.classList.add(CONFIG.prefix + 'success');
        if (duration > 0) {
          setTimeout(() => hide(element), duration);
        }
      }
    }
  }

  /**
   * 失败反馈
   * @param {HTMLElement} element - 目标元素
   * @param {number} duration - 持续时间（毫秒）
   */
  function fail(element, duration = CONFIG.defaultDuration) {
    const elementId = getElementId(element);
    const data = overlays.get(elementId);
    
    if (data) {
      const { overlay } = data;
      overlay.classList.remove(CONFIG.prefix + 'pulse');
      overlay.classList.add(CONFIG.prefix + 'error');
      
      // 更新标签
      const label = overlay.querySelector('.' + CONFIG.prefix + 'label');
      if (label) {
        label.textContent = '失败';
      }
      
      // 更新角标
      const badge = overlay.querySelector('.' + CONFIG.prefix + 'badge');
      if (badge) {
        badge.textContent = '';
      }
      
      // 延迟隐藏
      if (duration > 0) {
        setTimeout(() => hide(element), duration);
      }
    } else {
      // 如果没有现有高亮，创建一个失败状态的
      const overlay = show(element, { label: '失败' });
      if (overlay) {
        overlay.classList.add(CONFIG.prefix + 'error');
        if (duration > 0) {
          setTimeout(() => hide(element), duration);
        }
      }
    }
  }

  /**
   * 自动包装操作，带视觉反馈
   * @param {HTMLElement} element - 目标元素
   * @param {Function} fn - 要执行的操作，返回结果或 Promise
   * @param {Object} options - 选项
   * @returns {Promise} 操作结果
   */
  async function withFeedback(element, fn, options = {}) {
    const label = options.label || '处理中...';
    
    // 显示高亮
    show(element, { label, pulse: true });
    
    try {
      // 执行操作
      const result = await fn();
      
      // 判断是否成功
      const isSuccess = result === undefined || 
        result === true || 
        (result && result.success !== false);
      
      if (isSuccess) {
        success(element);
      } else {
        fail(element);
      }
      
      return result;
    } catch (error) {
      fail(element);
      throw error;
    }
  }

  /**
   * 批量操作，带序号和进度
   * @param {NodeList|Array} elements - 元素列表
   * @param {Function} fn - 对每个元素执行的操作 (element, index) => result
   * @param {Object} options - 选项
   * @returns {Promise<Array>} 所有操作的结果
   */
  async function batch(elements, fn, options = {}) {
    const elementsArray = Array.from(elements);
    const results = [];
    const delay = options.delay || 200;
    
    // 先给所有元素添加序号高亮
    elementsArray.forEach((el, index) => {
      show(el, { badge: index + 1 });
    });
    
    // 等待一下让用户看到全局概览
    await new Promise(r => setTimeout(r, 500));
    
    // 逐个处理
    for (let i = 0; i < elementsArray.length; i++) {
      const element = elementsArray[i];
      const elementId = getElementId(element);
      const data = overlays.get(elementId);
      
      if (data) {
        // 当前元素添加脉冲动画
        data.overlay.classList.add(CONFIG.prefix + 'pulse');
        
        // 更新标签
        const label = document.createElement('div');
        label.className = CONFIG.prefix + 'label';
        label.textContent = `处理中 (${i + 1}/${elementsArray.length})`;
        
        const existingLabel = data.overlay.querySelector('.' + CONFIG.prefix + 'label');
        if (existingLabel) {
          existingLabel.textContent = label.textContent;
        } else {
          data.overlay.appendChild(label);
        }
      }
      
      try {
        const result = await fn(element, i);
        results.push({ index: i, success: true, result });
        success(element, 0); // 不自动隐藏
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
        fail(element, 0); // 不自动隐藏
      }
      
      // 间隔延迟
      if (i < elementsArray.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    // 最后延迟清理所有高亮
    setTimeout(() => {
      elementsArray.forEach(el => hide(el));
    }, CONFIG.defaultDuration);
    
    return results;
  }

  /**
   * 清理所有高亮
   */
  function cleanup() {
    // 清理所有覆盖层
    overlays.forEach((data, elementId) => {
      const { overlay, element } = data;
      if (overlay.__bcCleanupListeners) {
        overlay.__bcCleanupListeners();
      }
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    overlays.clear();
    
    // 移除容器
    if (containerId) {
      const container = document.getElementById(containerId);
      if (container) {
        container.parentNode.removeChild(container);
      }
      containerId = null;
    }
    
    // 移除样式
    const style = document.getElementById(CONFIG.prefix + 'styles');
    if (style) {
      style.parentNode.removeChild(style);
    }
    styleInjected = false;
  }

  // 返回公开 API
  return {
    show,
    hide,
    success,
    fail,
    withFeedback,
    batch,
    cleanup,
    CONFIG
  };
})();

// 导出供 Node.js 使用（用于注入到脚本中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getVisualFeedbackCode };
}

/**
 * 获取可注入的视觉反馈模块代码
 * @returns {string} 压缩后的代码
 */
function getVisualFeedbackCode() {
  // 返回上面 __bcHighlight 的完整代码（去掉 module.exports 部分）
  const code = `const __bcHighlight=(()=>{const CONFIG={prefix:'__bc-highlight-',zIndex:2147483647,colors:{primary:'#2196F3',success:'#4CAF50',error:'#F44336',warning:'#FF9800'},defaultDuration:1500,animationDuration:300};const overlays=new Map();let styleInjected=false;let containerId=null;function injectStyles(){if(styleInjected)return;const styleId=CONFIG.prefix+'styles';if(document.getElementById(styleId)){styleInjected=true;return}const css=\`.\${CONFIG.prefix}container{position:fixed!important;top:0!important;left:0!important;width:100%!important;height:100%!important;pointer-events:none!important;z-index:\${CONFIG.zIndex}!important;overflow:visible!important}.\${CONFIG.prefix}overlay{position:absolute!important;box-sizing:border-box!important;pointer-events:none!important;border:3px solid \${CONFIG.colors.primary}!important;border-radius:4px!important;background:rgba(33,150,243,0.1)!important;transition:all \${CONFIG.animationDuration}ms ease!important;opacity:0!important;transform:scale(0.95)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}visible{opacity:1!important;transform:scale(1)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}success{border-color:\${CONFIG.colors.success}!important;background:rgba(76,175,80,0.1)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}error{border-color:\${CONFIG.colors.error}!important;background:rgba(244,67,54,0.1)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}pulse{animation:\${CONFIG.prefix}pulse-animation 1s ease-in-out infinite!important}@keyframes \${CONFIG.prefix}pulse-animation{0%,100%{box-shadow:0 0 0 0 rgba(33,150,243,0.4)}50%{box-shadow:0 0 0 10px rgba(33,150,243,0)}}.\${CONFIG.prefix}label{position:absolute!important;top:-28px!important;left:0!important;padding:4px 8px!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:12px!important;font-weight:500!important;color:white!important;background:\${CONFIG.colors.primary}!important;border-radius:4px!important;white-space:nowrap!important;box-shadow:0 2px 4px rgba(0,0,0,0.2)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}success .\${CONFIG.prefix}label{background:\${CONFIG.colors.success}!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}error .\${CONFIG.prefix}label{background:\${CONFIG.colors.error}!important}.\${CONFIG.prefix}badge{position:absolute!important;top:-12px!important;right:-12px!important;width:24px!important;height:24px!important;display:flex!important;align-items:center!important;justify-content:center!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif!important;font-size:12px!important;font-weight:bold!important;color:white!important;background:\${CONFIG.colors.primary}!important;border-radius:50%!important;box-shadow:0 2px 4px rgba(0,0,0,0.2)!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}success .\${CONFIG.prefix}badge{background:\${CONFIG.colors.success}!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}success .\${CONFIG.prefix}badge::after{content:'✓'!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}error .\${CONFIG.prefix}badge{background:\${CONFIG.colors.error}!important}.\${CONFIG.prefix}overlay.\${CONFIG.prefix}error .\${CONFIG.prefix}badge::after{content:'✗'!important}\`;const style=document.createElement('style');style.id=styleId;style.textContent=css;document.head.appendChild(style);styleInjected=true}function getContainer(){if(containerId){const existing=document.getElementById(containerId);if(existing)return existing}containerId=CONFIG.prefix+'container-'+Date.now();const container=document.createElement('div');container.id=containerId;container.className=CONFIG.prefix+'container';document.body.appendChild(container);return container}function getElementId(element){if(!element.__bcHighlightId){element.__bcHighlightId=CONFIG.prefix+'el-'+Date.now()+'-'+Math.random().toString(36).substr(2,9)}return element.__bcHighlightId}function updateOverlayPosition(overlay,element){const rect=element.getBoundingClientRect();const scrollX=window.scrollX||window.pageXOffset;const scrollY=window.scrollY||window.pageYOffset;overlay.style.left=(rect.left+scrollX-3)+'px';overlay.style.top=(rect.top+scrollY-3)+'px';overlay.style.width=(rect.width+6)+'px';overlay.style.height=(rect.height+6)+'px'}function show(element,options={}){if(!element||!(element instanceof HTMLElement)){console.warn('[__bcHighlight] Invalid element');return null}injectStyles();const container=getContainer();const elementId=getElementId(element);if(overlays.has(elementId)){hide(element)}const overlay=document.createElement('div');overlay.className=CONFIG.prefix+'overlay';if(options.pulse){overlay.classList.add(CONFIG.prefix+'pulse')}if(options.label){const label=document.createElement('div');label.className=CONFIG.prefix+'label';label.textContent=options.label;overlay.appendChild(label)}if(typeof options.badge==='number'){const badge=document.createElement('div');badge.className=CONFIG.prefix+'badge';badge.textContent=options.badge;overlay.appendChild(badge)}container.appendChild(overlay);updateOverlayPosition(overlay,element);overlays.set(elementId,{overlay,element});requestAnimationFrame(()=>{overlay.classList.add(CONFIG.prefix+'visible')});const updatePosition=()=>updateOverlayPosition(overlay,element);window.addEventListener('scroll',updatePosition,true);window.addEventListener('resize',updatePosition);overlay.__bcCleanupListeners=()=>{window.removeEventListener('scroll',updatePosition,true);window.removeEventListener('resize',updatePosition)};return overlay}function hide(element){if(!element)return;const elementId=getElementId(element);const data=overlays.get(elementId);if(data){const{overlay}=data;if(overlay.__bcCleanupListeners){overlay.__bcCleanupListeners()}overlay.classList.remove(CONFIG.prefix+'visible');setTimeout(()=>{if(overlay.parentNode){overlay.parentNode.removeChild(overlay)}},CONFIG.animationDuration);overlays.delete(elementId)}}function success(element,duration=CONFIG.defaultDuration){const elementId=getElementId(element);const data=overlays.get(elementId);if(data){const{overlay}=data;overlay.classList.remove(CONFIG.prefix+'pulse');overlay.classList.add(CONFIG.prefix+'success');const label=overlay.querySelector('.'+CONFIG.prefix+'label');if(label){label.textContent='完成'}const badge=overlay.querySelector('.'+CONFIG.prefix+'badge');if(badge){badge.textContent=''}if(duration>0){setTimeout(()=>hide(element),duration)}}else{const overlay=show(element,{label:'完成'});if(overlay){overlay.classList.add(CONFIG.prefix+'success');if(duration>0){setTimeout(()=>hide(element),duration)}}}}function fail(element,duration=CONFIG.defaultDuration){const elementId=getElementId(element);const data=overlays.get(elementId);if(data){const{overlay}=data;overlay.classList.remove(CONFIG.prefix+'pulse');overlay.classList.add(CONFIG.prefix+'error');const label=overlay.querySelector('.'+CONFIG.prefix+'label');if(label){label.textContent='失败'}const badge=overlay.querySelector('.'+CONFIG.prefix+'badge');if(badge){badge.textContent=''}if(duration>0){setTimeout(()=>hide(element),duration)}}else{const overlay=show(element,{label:'失败'});if(overlay){overlay.classList.add(CONFIG.prefix+'error');if(duration>0){setTimeout(()=>hide(element),duration)}}}}async function withFeedback(element,fn,options={}){const label=options.label||'处理中...';show(element,{label,pulse:true});try{const result=await fn();const isSuccess=result===undefined||result===true||(result&&result.success!==false);if(isSuccess){success(element)}else{fail(element)}return result}catch(error){fail(element);throw error}}async function batch(elements,fn,options={}){const elementsArray=Array.from(elements);const results=[];const delay=options.delay||200;elementsArray.forEach((el,index)=>{show(el,{badge:index+1})});await new Promise(r=>setTimeout(r,500));for(let i=0;i<elementsArray.length;i++){const element=elementsArray[i];const elementId=getElementId(element);const data=overlays.get(elementId);if(data){data.overlay.classList.add(CONFIG.prefix+'pulse');const label=document.createElement('div');label.className=CONFIG.prefix+'label';label.textContent=\`处理中 (\${i+1}/\${elementsArray.length})\`;const existingLabel=data.overlay.querySelector('.'+CONFIG.prefix+'label');if(existingLabel){existingLabel.textContent=label.textContent}else{data.overlay.appendChild(label)}}try{const result=await fn(element,i);results.push({index:i,success:true,result});success(element,0)}catch(error){results.push({index:i,success:false,error:error.message});fail(element,0)}if(i<elementsArray.length-1){await new Promise(r=>setTimeout(r,delay))}}setTimeout(()=>{elementsArray.forEach(el=>hide(el))},CONFIG.defaultDuration);return results}function cleanup(){overlays.forEach((data,elementId)=>{const{overlay,element}=data;if(overlay.__bcCleanupListeners){overlay.__bcCleanupListeners()}if(overlay.parentNode){overlay.parentNode.removeChild(overlay)}});overlays.clear();if(containerId){const container=document.getElementById(containerId);if(container){container.parentNode.removeChild(container)}containerId=null}const style=document.getElementById(CONFIG.prefix+'styles');if(style){style.parentNode.removeChild(style)}styleInjected=false}return{show,hide,success,fail,withFeedback,batch,cleanup,CONFIG}})();`;
  
  return code;
}
