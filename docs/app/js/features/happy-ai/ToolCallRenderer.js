/**
 * ToolCallRenderer - 工具调用卡片渲染模块
 * 负责渲染 AI 工具调用的卡片 UI
 * 
 * @created 2026-01-16
 * @module features/happy-ai/ToolCallRenderer
 */

class ToolCallRenderer {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // 工具元素映射
    this.toolElements = new Map();
    
    // 计时器管理
    this.toolTimers = {};
    
    // 工具配置映射 (仿 happy 的 knownTools)
    // title 使用 i18n key，运行时动态获取翻译
    this.knownTools = {
      'TodoWrite': {
        icon: '💡',
        titleKey: 'tools.todoWrite',
        noStatus: true,
        customRenderer: 'renderTodoList'
      },
      'TodoRead': {
        icon: '☑️',
        titleKey: 'tools.todoRead',
        noStatus: true
      },
      'Bash': {
        icon: '💻',
        titleKey: 'tools.bash',
        customRenderer: 'renderBashView'
      },
      'Edit': {
        icon: '✏️',
        titleKey: 'tools.editFile',
        customRenderer: 'renderEditView'
      },
      'MultiEdit': {
        icon: '📝',
        titleKey: 'tools.multiEdit',
        customRenderer: 'renderEditView'
      },
      'Write': {
        icon: '📄',
        titleKey: 'tools.writeFile',
        customRenderer: 'renderWriteView'
      },
      'Read': {
        icon: '📖',
        titleKey: 'tools.readFile',
        customRenderer: 'renderReadView'
      },
      'Glob': {
        icon: '🔍',
        titleKey: 'tools.globTool',
        customRenderer: 'renderGlobView'
      },
      'Grep': {
        icon: '🔎',
        titleKey: 'tools.grepTool',
        customRenderer: 'renderGrepView'
      },
      'LS': {
        icon: '📁',
        titleKey: 'tools.lsTool'
      },
      'Task': {
        icon: '📋',
        titleKey: 'tools.subagent'
      },
      'WebSearch': {
        icon: '🌐',
        titleKey: 'tools.webSearch',
        customRenderer: 'renderWebSearchView'
      },
      'WebFetch': {
        icon: '📥',
        titleKey: 'tools.webFetch'
      },
      'AskUserQuestion': {
        icon: '❓',
        titleKey: 'tools.askUser',
        customRenderer: 'renderAskUserQuestion',
        noStatus: true
      },
      'NotebookEdit': {
        icon: '📓',
        titleKey: 'tools.notebookEdit'
      }
    };
  }
  
  /**
   * 获取国际化翻译
   * @param {string} key 翻译键
   * @param {Object} params 参数（可选）
   * @returns {string} 翻译后的文本
   */
  t(key, params = {}) {
    if (typeof I18nManager !== 'undefined' && I18nManager.t) {
      return I18nManager.t(key, params);
    }
    // Fallback: 返回 key 的最后一部分
    return key.split('.').pop();
  }
  
  /**
   * 获取工具标题（支持 i18n）
   * @param {Object} toolConfig 工具配置
   * @param {string} defaultTitle 默认标题
   * @returns {string} 工具标题
   */
  getToolTitle(toolConfig, defaultTitle) {
    if (toolConfig?.titleKey) {
      return this.t(toolConfig.titleKey);
    }
    return defaultTitle || 'Unknown Tool';
  }

  /**
   * 添加工具调用消息
   * @param {Object} data 工具调用数据
   */
  addToolCallMessage(data) {
    const messagesContainer = this.app?.aiMessages;
    if (!messagesContainer) return;
    
    const tool = data.tool || data;
    const toolId = tool.id || `tool-${Date.now()}`;
    
    // 调试日志
    console.log(`[addToolCallMessage] Tool: ${tool.name}, ID: ${toolId}, State: ${tool.state}`);
    console.log(`[addToolCallMessage] Tool input:`, tool.input);
    
    // 检查是否已存在该工具卡片（用于更新状态）
    const existingCard = this.toolElements.get(toolId);
    if (existingCard) {
      console.log(`[addToolCallMessage] Updating existing card for ${toolId}`);
      this.updateToolCard(existingCard, tool);
      return;
    }
    
    // 获取工具配置
    const toolConfig = this.knownTools[tool.name] || {};
    const toolIcon = toolConfig.icon || this.getToolIcon(tool.name);
    const toolTitle = this.getToolTitle(toolConfig, tool.name);
    const noStatus = toolConfig.noStatus || false;
    
    console.log(`[addToolCallMessage] Config: customRenderer=${toolConfig.customRenderer}, noStatus=${noStatus}`);
    
    // 渲染工具内容 (使用自定义渲染器或默认)
    let toolContentHtml;
    
    // Task 工具特殊处理：渲染 sidechain 子消息
    if (tool.name === 'Task' && data.children?.length > 0) {
      console.log(`[addToolCallMessage] Task tool with ${data.children.length} children`);
      toolContentHtml = this.renderSidechainChildren(data.children);
    } else if (toolConfig.customRenderer && typeof this[toolConfig.customRenderer] === 'function') {
      console.log(`[addToolCallMessage] Using custom renderer: ${toolConfig.customRenderer}`);
      toolContentHtml = this[toolConfig.customRenderer](tool);
    } else {
      console.log(`[addToolCallMessage] Using default renderer`);
      toolContentHtml = this.renderToolContent(tool);
    }
    console.log(`[addToolCallMessage] Rendered HTML length: ${toolContentHtml?.length || 0}`);
    
    const toolCard = document.createElement('div');
    toolCard.className = 'tool-card';
    toolCard.id = `tool-${toolId}`;
    toolCard.dataset.toolId = toolId;
    toolCard.dataset.toolName = tool.name; // 存储工具名称用于更新时判断
    
    // 构建工具卡片内容
    toolCard.innerHTML = `
      <div class="tool-header">
        <span class="tool-icon">${toolIcon}</span>
        <div class="tool-title-group">
          <span class="tool-name">${this.escapeHtml(toolTitle)}</span>
          ${tool.input?.path ? `<span class="tool-subtitle">${this.escapeHtml(this.shortenPath(tool.input.path))}</span>` : ''}
        </div>
        <div class="tool-status-group">
          ${!noStatus && tool.state === 'running' ? `<span class="tool-elapsed" data-start="${tool.createdAt || Date.now()}">0.0s</span>` : ''}
          ${!noStatus ? `<span class="tool-status ${tool.state || 'pending'}">${this.getStatusIcon(tool.state)}</span>` : ''}
        </div>
      </div>
      <div class="tool-content ${!noStatus && tool.state === 'running' ? 'collapsed' : ''}">
        ${toolContentHtml}
      </div>
      <div class="tool-file-refs" id="file-refs-${toolId}">
        ${this.renderFileReference(tool)}
      </div>
      <div class="tool-footer" id="perm-${toolId}">
        ${this.renderPermissionFooter(tool)}
      </div>
    `;
    
    // 绑定内容区折叠/展开
    const header = toolCard.querySelector('.tool-header');
    const content = toolCard.querySelector('.tool-content');
    header.addEventListener('click', () => {
      content.classList.toggle('collapsed');
    });
    
    // 存储元素引用
    this.toolElements.set(toolId, toolCard);
    
    // 添加到消息列表
    messagesContainer.appendChild(toolCard);
    if (this.app?.smartScrollToBottom) {
      this.app.smartScrollToBottom();
    }
    
    // 如果工具正在运行，启动计时器
    if (tool.state === 'running') {
      this.startToolTimer(toolId, tool.createdAt || Date.now());
    }
    
    // 绑定权限按钮事件
    this.bindPermissionButtons(toolCard, tool);
    
    // 绑定文件标签事件（如果工具已完成）
    if (tool.state === 'completed') {
      const fileRefsEl = toolCard.querySelector('.tool-file-refs');
      if (fileRefsEl) {
        this.bindFileTagEvents(fileRefsEl);
      }
      // 追踪会话文件（从历史加载时也需要追踪）
      this.trackSessionFile(tool, tool.name);
    }
  }
  
  /**
   * 更新工具卡片状态
   * @param {HTMLElement} toolCard 工具卡片元素
   * @param {Object} tool 工具数据
   */
  updateToolCard(toolCard, tool) {
    const toolId = tool.id || toolCard.dataset.toolId;
    // 优先使用卡片中保存的原始工具名（因为 tool.name 可能是 "Tool Result"）
    const originalToolName = toolCard.dataset.toolName;
    const toolConfig = this.knownTools[originalToolName] || {};
    const noStatus = toolConfig.noStatus || false;
    
    console.log(`[updateToolCard] Updating card: originalTool=${originalToolName}, currentTool=${tool.name}, state=${tool.state}`);
    
    // 更新状态图标 (如果不是 noStatus 类型)
    if (!noStatus) {
      const statusEl = toolCard.querySelector('.tool-status');
      if (statusEl) {
        statusEl.className = `tool-status ${tool.state || 'pending'}`;
        statusEl.innerHTML = this.getStatusIcon(tool.state);
      }
    }
    
    // 如果完成，停止计时器
    if (tool.state === 'completed' || tool.state === 'error') {
      this.stopToolTimer(toolId);
      
      const contentEl = toolCard.querySelector('.tool-content');
      if (contentEl) {
        // 对于使用自定义渲染器的工具（如 TodoWrite），
        // 当工具结果不包含有效数据时，保留原始内容
        if (toolConfig.customRenderer) {
          // 检查是否有有效的数据来更新
          const hasValidData = tool.input?.todos || tool.result?.newTodos;
          if (!hasValidData) {
            console.log(`[updateToolCard] Keeping original content for ${originalToolName} - no valid data in result`);
          } else if (typeof this[toolConfig.customRenderer] === 'function') {
            const newContent = this[toolConfig.customRenderer](tool);
            if (!newContent.includes('tool-empty')) {
              contentEl.innerHTML = newContent;
            }
          }
        } else {
          // 普通工具，正常更新内容
          contentEl.innerHTML = this.renderToolContent(tool);
        }
        contentEl.classList.remove('collapsed');
      }
    }
    
    // 更新文件引用区域（仅在完成时）
    if (tool.state === 'completed') {
      const fileRefsEl = toolCard.querySelector('.tool-file-refs');
      if (fileRefsEl) {
        // 使用原始工具名来检查是否是文件操作工具
        const fileRefHtml = this.renderFileReference({ ...tool, name: originalToolName });
        fileRefsEl.innerHTML = fileRefHtml;
        this.bindFileTagEvents(fileRefsEl);
      }
      
      // 追踪会话文件（添加到侧边栏）
      this.trackSessionFile(tool, originalToolName);
    }
    
    // 更新权限区域
    const footerEl = toolCard.querySelector('.tool-footer');
    if (footerEl) {
      footerEl.innerHTML = this.renderPermissionFooter(tool);
      this.bindPermissionButtons(toolCard, tool);
    }
  }
  
  /**
   * 获取工具图标
   * @param {string} toolName 工具名称
   * @returns {string} 图标 HTML
   */
  getToolIcon(toolName) {
    const icons = {
      'Bash': '💻',
      'Edit': '✏️',
      'MultiEdit': '📝',
      'Write': '📄',
      'Read': '📖',
      'Glob': '🔍',
      'Grep': '🔎',
      'LS': '📁',
      'Task': '📋',
      'TodoRead': '☑️',
      'TodoWrite': '✅',
      'WebSearch': '🌐',
      'WebFetch': '📥',
      'AskUserQuestion': '❓',
      'NotebookEdit': '📓'
    };
    
    // MCP 工具特殊处理
    if (toolName && toolName.startsWith('mcp__')) {
      return '🧩';
    }
    
    return icons[toolName] || '🔧';
  }
  
  /**
   * 获取状态图标
   * @param {string} state 状态
   * @returns {string} 图标 HTML
   */
  getStatusIcon(state) {
    switch (state) {
      case 'running':
        return '<span class="status-spinner"></span>';
      case 'completed':
        return '✓';
      case 'error':
        return '⚠️';
      case 'denied':
      case 'canceled':
        return '⊘';
      default:
        return '•';
    }
  }
  
  /**
   * 渲染工具内容
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderToolContent(tool) {
    let content = '';
    
    // 输入参数
    if (tool.input) {
      const inputDisplay = this.formatToolInput(tool);
      if (inputDisplay) {
        content += `<div class="tool-section tool-input">
          <div class="tool-section-header">${this.t('toolCall.input')}</div>
          <div class="tool-section-content">${inputDisplay}</div>
        </div>`;
      }
    }
    
    // 输出结果
    if (tool.state === 'completed' && tool.result) {
      const resultDisplay = this.formatToolResult(tool);
      content += `<div class="tool-section tool-output">
        <div class="tool-section-header">${this.t('toolCall.output')}</div>
        <div class="tool-section-content">${resultDisplay}</div>
      </div>`;
    }
    
    // 错误信息
    if (tool.state === 'error' && tool.result) {
      content += `<div class="tool-section tool-error">
        <div class="tool-section-header">${this.t('toolCall.error')}</div>
        <div class="tool-section-content">${this.escapeHtml(String(tool.result))}</div>
      </div>`;
    }
    
    return content || `<div class="tool-empty">${this.t('toolCall.executing')}</div>`;
  }
  
  /**
   * 渲染待办列表 (TodoWrite 专用)
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderTodoList(tool) {
    // 调试日志
    console.log('[renderTodoList] tool.input:', JSON.stringify(tool.input));
    console.log('[renderTodoList] tool.input.todos type:', typeof tool.input?.todos);
    
    // 优先从 result.newTodos 获取，fallback 到 input.todos
    let todos = tool.result?.newTodos || tool.input?.todos || [];
    
    // 如果 todos 是字符串，尝试解析为 JSON
    if (typeof todos === 'string') {
      try {
        todos = JSON.parse(todos);
        console.log('[renderTodoList] Parsed todos from string');
      } catch (e) {
        console.error('[renderTodoList] Failed to parse todos string:', e);
        return `<div class="tool-content-text">${this.escapeHtml(todos)}</div>`;
      }
    }
    
    // 检查是否是有效数组
    if (!todos || !Array.isArray(todos) || todos.length === 0) {
      console.log('[renderTodoList] No valid todos array, length:', todos?.length);
      return `<div class="tool-empty">${this.t('toolCall.noTodos')}</div>`;
    }
    
    console.log('[renderTodoList] Processing', todos.length, 'todos');
    
    const todoItems = todos.map((todo, index) => {
      const status = todo.status || 'pending';
      const icon = this.getTodoStatusIcon(status);
      const content = this.escapeHtml(todo.content || '');
      const id = todo.id || `todo-${index}`;
      
      return `
        <div class="todo-item ${status}" data-todo-id="${id}">
          <span class="todo-icon">${icon}</span>
          <span class="todo-content">${content}</span>
        </div>
      `;
    }).join('');
    
    // 计算统计信息
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    
    const html = `
      <div class="todo-list">
        <div class="todo-items">${todoItems}</div>
        <div class="todo-summary">
          <span class="todo-stat completed">${completed} ${this.t('toolCall.completed')}</span>
          <span class="todo-stat in_progress">${inProgress} ${this.t('toolCall.inProgress')}</span>
          <span class="todo-stat pending">${pending} ${this.t('toolCall.pending')}</span>
        </div>
      </div>
    `;
    console.log('[renderTodoList] Generated HTML:', html.substring(0, 500));
    return html;
  }
  
  /**
   * 获取待办状态图标
   * @param {string} status 状态
   * @returns {string} 图标
   */
  getTodoStatusIcon(status) {
    switch (status) {
      case 'completed':
        return '☑';
      case 'in_progress':
        return '▶';
      case 'pending':
      default:
        return '☐';
    }
  }
  
  /**
   * 格式化工具输入显示
   * @param {Object} tool 工具数据
   * @returns {string} 格式化的输入
   */
  formatToolInput(tool) {
    const input = tool.input;
    if (!input) return '';
    
    // 根据工具类型自定义显示
    switch (tool.name) {
      case 'Bash':
        return `<pre class="tool-code"><code>${this.escapeHtml(input.command || '')}</code></pre>`;
      case 'Edit':
      case 'Write':
        return `<div class="tool-path">${this.escapeHtml(input.path || '')}</div>`;
      case 'Read':
        return `<div class="tool-path">${this.escapeHtml(input.path || '')}</div>`;
      case 'Grep':
        return `<div class="tool-param"><span class="param-label">Pattern:</span> ${this.escapeHtml(input.pattern || '')}</div>`;
      case 'Glob':
        return `<div class="tool-param"><span class="param-label">Pattern:</span> ${this.escapeHtml(input.glob_pattern || input.pattern || '')}</div>`;
      case 'WebSearch':
        return `<div class="tool-param"><span class="param-label">Query:</span> ${this.escapeHtml(input.search_term || input.query || '')}</div>`;
      default:
        // 默认显示 JSON
        return `<pre class="tool-code"><code>${this.escapeHtml(JSON.stringify(input, null, 2))}</code></pre>`;
    }
  }
  
  /**
   * 格式化工具结果显示
   * @param {Object} tool 工具数据
   * @returns {string} 格式化的结果
   */
  formatToolResult(tool) {
    const result = tool.result;
    if (!result) return '';
    
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    
    // 长结果截断
    const maxLength = 500;
    if (resultStr.length > maxLength) {
      return `<pre class="tool-code tool-result-truncated"><code>${this.escapeHtml(resultStr.substring(0, maxLength))}...</code></pre>
        <span class="tool-result-more" data-full-result="${this.escapeHtml(resultStr)}">${this.t('toolCall.showMore')}</span>`;
    }
    
    return `<pre class="tool-code"><code>${this.escapeHtml(resultStr)}</code></pre>`;
  }
  
  /**
   * 缩短路径显示
   * @param {string} path 路径
   * @returns {string} 缩短后的路径
   */
  shortenPath(path) {
    if (!path) return '';
    if (path.length <= 50) return path;
    
    const parts = path.split(/[\/\\]/);
    if (parts.length <= 3) return path;
    
    return `.../${parts.slice(-2).join('/')}`;
  }
  
  /**
   * 渲染 Sidechain 子消息（用于 Task 工具）
   * @param {Array} children 子消息数组
   * @returns {string} HTML 内容
   */
  renderSidechainChildren(children) {
    // 过滤出工具调用消息
    const toolCalls = children.filter(c => c.kind === 'tool-call');
    if (toolCalls.length === 0) {
      return `<div class="tool-empty">${this.t('toolCall.noSubtasks')}</div>`;
    }
    
    // 只显示最后 3 个工具
    const visible = toolCalls.slice(-3);
    const remaining = toolCalls.length - 3;
    
    let html = '<div class="sidechain-tools">';
    
    for (const child of visible) {
      const config = this.knownTools[child.tool?.name] || {};
      const title = this.getToolTitle(config, child.tool?.name);
      const stateIcon = this.getStatusIcon(child.tool?.state);
      
      html += `
        <div class="sidechain-tool-item">
          <span class="sidechain-tool-title">${this.escapeHtml(title)}</span>
          <span class="sidechain-tool-status">${stateIcon}</span>
        </div>
      `;
    }
    
    if (remaining > 0) {
      html += `<div class="sidechain-more">${this.t('toolCall.moreTools', { count: remaining })}</div>`;
    }
    
    html += '</div>';
    return html;
  }

  /**
   * 启动工具计时器
   * @param {string} toolId 工具 ID
   * @param {number} startTime 开始时间
   */
  startToolTimer(toolId, startTime) {
    const start = typeof startTime === 'number' ? startTime : Date.now();
    
    this.toolTimers[toolId] = setInterval(() => {
      const elapsed = document.querySelector(`#tool-${toolId} .tool-elapsed`);
      if (elapsed) {
        const seconds = ((Date.now() - start) / 1000).toFixed(1);
        elapsed.textContent = `${seconds}s`;
      }
    }, 100);
  }
  
  /**
   * 停止工具计时器
   * @param {string} toolId 工具 ID
   */
  stopToolTimer(toolId) {
    if (this.toolTimers[toolId]) {
      clearInterval(this.toolTimers[toolId]);
      delete this.toolTimers[toolId];
    }
  }
  
  /**
   * 停止所有计时器
   */
  stopAllTimers() {
    Object.keys(this.toolTimers).forEach(toolId => {
      this.stopToolTimer(toolId);
    });
  }
  
  /**
   * 渲染文件引用标签
   * 当文件操作工具完成时，显示可点击的文件标签
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderFileReference(tool) {
    // 只有文件操作工具才显示文件引用
    const fileTools = ['Read', 'Edit', 'MultiEdit', 'Write', 'StrReplace'];
    if (!fileTools.includes(tool.name)) {
      return '';
    }
    
    // 只有完成状态才显示
    if (tool.state !== 'completed') {
      return '';
    }
    
    // 获取文件路径
    const filePath = tool.input?.path || tool.input?.file_path;
    if (!filePath) {
      return '';
    }
    
    // 使用 FileTagParser 获取文件信息
    const fileName = window.FileTagParser?.getFileNameFromPath?.(filePath) || filePath.split(/[\/\\]/).pop() || filePath;
    const fileIcon = window.FileTagParser?.getDefaultFileIcon?.(filePath) || '📄';
    
    // 根据工具类型添加操作标签
    let actionLabel = '';
    switch (tool.name) {
      case 'Read':
        actionLabel = this.t('toolCall.fileRead') || '已读取';
        break;
      case 'Edit':
      case 'MultiEdit':
      case 'StrReplace':
        actionLabel = this.t('toolCall.fileEdited') || '已编辑';
        break;
      case 'Write':
        actionLabel = this.t('toolCall.fileCreated') || '已创建';
        break;
    }
    
    return `
      <div class="file-tag-container">
        <span class="file-tag-action">${actionLabel}</span>
        <div class="file-tag" data-file-path="${this.escapeHtml(filePath)}" title="${this.escapeHtml(filePath)}">
          <span class="file-tag-icon">${fileIcon}</span>
          <span class="file-tag-name">${this.escapeHtml(fileName)}</span>
          <span class="file-tag-open">${this.t('toolCall.openFile') || '打开'}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * 绑定文件标签点击事件
   * @param {HTMLElement} container 包含文件标签的容器
   */
  bindFileTagEvents(container) {
    const fileTags = container.querySelectorAll('.file-tag');
    fileTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        const filePath = tag.dataset.filePath;
        if (filePath && this.app?.openChatFilePreview) {
          console.log('[ToolCallRenderer] Opening file preview:', filePath);
          this.app.openChatFilePreview(filePath);
        } else if (filePath && this.app?.openFilePreview) {
          // 回退到文档模式的文件预览
          console.log('[ToolCallRenderer] Fallback to openFilePreview:', filePath);
          this.app.openFilePreview(filePath);
        }
      });
    });
  }
  
  /**
   * 追踪会话文件（添加到侧边栏）
   * @param {Object} tool 工具数据
   * @param {string} toolName 工具名称
   */
  trackSessionFile(tool, toolName) {
    // 只追踪文件操作工具
    const fileTools = ['Read', 'Edit', 'MultiEdit', 'Write', 'StrReplace'];
    if (!fileTools.includes(toolName)) {
      return;
    }
    
    // 获取文件路径
    const filePath = tool.input?.path || tool.input?.file_path;
    if (!filePath) {
      return;
    }
    
    // 确定操作类型
    let action = 'edited';
    switch (toolName) {
      case 'Read':
        action = 'read';
        break;
      case 'Write':
        action = 'created';
        break;
      case 'Edit':
      case 'MultiEdit':
      case 'StrReplace':
        action = 'edited';
        break;
    }
    
    // 添加到会话文件列表
    if (this.app?.addSessionFile) {
      console.log('[ToolCallRenderer] Tracking session file:', filePath, action);
      this.app.addSessionFile(filePath, action);
      
      // 创建或编辑文件时，自动打开展示区预览
      if ((action === 'created' || action === 'edited') && this.app?.openChatFilePreview) {
        console.log('[ToolCallRenderer] Auto-opening file preview:', filePath);
        this.app.openChatFilePreview(filePath);
        this.app.updateShowcaseToggleBtn?.();
      }
    }
  }
  
  /**
   * 渲染权限确认按钮
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderPermissionFooter(tool) {
    if (!tool.permission) return '';
    
    const permission = tool.permission;
    const isPending = permission.status === 'pending';
    const isApproved = permission.status === 'approved';
    const isDenied = permission.status === 'denied' || permission.status === 'canceled';
    
    if (!isPending && !isApproved && !isDenied) return '';
    
    // 判断是否是编辑类工具
    const isEditTool = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool.name);
    
    return `
      <div class="permission-buttons ${isPending ? '' : 'permission-decided'}">
        <button class="perm-btn perm-allow ${isApproved && !permission.mode ? 'selected' : ''}" 
                data-action="allow" ${isPending ? '' : 'disabled'}>
          ${this.t('toolCall.permissionYes')}
        </button>
        ${isEditTool 
          ? `<button class="perm-btn perm-allow-all ${isApproved && permission.mode === 'acceptEdits' ? 'selected' : ''}" 
                     data-action="allowAllEdits" ${isPending ? '' : 'disabled'}>
              ${this.t('toolCall.permissionYesAllEdits')}
            </button>`
          : `<button class="perm-btn perm-allow-session ${isApproved && permission.allowedTools?.length ? 'selected' : ''}" 
                     data-action="allowForSession" ${isPending ? '' : 'disabled'}>
              ${this.t('toolCall.permissionYesForTool')}
            </button>`
        }
        <button class="perm-btn perm-deny ${isDenied ? 'selected' : ''}" 
                data-action="deny" ${isPending ? '' : 'disabled'}>
          ${this.t('toolCall.permissionNo')}
        </button>
      </div>
    `;
  }
  
  /**
   * 绑定权限按钮事件
   * @param {HTMLElement} toolCard 工具卡片元素
   * @param {Object} tool 工具数据
   */
  bindPermissionButtons(toolCard, tool) {
    const buttons = toolCard.querySelectorAll('.perm-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        
        // 禁用所有按钮
        buttons.forEach(b => b.disabled = true);
        
        // 添加加载状态
        e.target.classList.add('loading');
        
        try {
          await this.handlePermissionAction(tool, action);
          
          // 更新按钮状态
          e.target.classList.remove('loading');
          e.target.classList.add('selected');
          toolCard.querySelector('.permission-buttons')?.classList.add('permission-decided');
        } catch (error) {
          console.error('Permission action failed:', error);
          e.target.classList.remove('loading');
          // 恢复按钮
          buttons.forEach(b => b.disabled = false);
          if (this.app?.addAIMessage) {
            this.app.addAIMessage('system', `${this.t('toolCall.permissionFailed')} ${error.message}`);
          }
        }
      });
    });
  }
  
  /**
   * 处理权限操作
   * @param {Object} tool 工具数据
   * @param {string} action 操作类型
   */
  async handlePermissionAction(tool, action) {
    const sessionId = this.app?.currentSessionId;
    const permissionId = tool.permission?.id;
    
    if (!permissionId) {
      throw new Error('No permission ID');
    }
    
    switch (action) {
      case 'allow':
        await window.appBridge.allowPermission?.(sessionId, permissionId);
        break;
      case 'allowAllEdits':
        await window.appBridge.allowPermission?.(sessionId, permissionId, 'acceptEdits');
        break;
      case 'allowForSession':
        await window.appBridge.allowPermission?.(sessionId, permissionId, null, [tool.name]);
        break;
      case 'deny':
        await window.appBridge.denyPermission?.(sessionId, permissionId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * HTML 转义
   * @param {string} text 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 注册工具元素
   * @param {string} toolId 工具 ID
   * @param {HTMLElement} element 元素
   */
  registerElement(toolId, element) {
    this.toolElements.set(toolId, element);
  }

  /**
   * 获取工具元素
   * @param {string} toolId 工具 ID
   * @returns {HTMLElement|null}
   */
  getElement(toolId) {
    return this.toolElements.get(toolId);
  }

  /**
   * 清理
   */
  destroy() {
    this.stopAllTimers();
    this.toolElements.clear();
  }

  // ========== 自定义渲染器 ==========

  /**
   * 渲染 Bash 终端命令视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderBashView(tool) {
    const input = tool.input || {};
    const command = input.command || '';
    const state = tool.state;
    const result = tool.result;

    let html = '<div class="tool-bash">';

    // 命令区域
    html += `
      <div class="tool-bash-command">
        <div class="tool-bash-prompt">$</div>
        <pre class="tool-bash-cmd"><code>${this.escapeHtml(command)}</code></pre>
      </div>
    `;

    // 输出区域（仅完成或错误时显示）
    if (state === 'completed' && result) {
      let stdout = '';
      let stderr = '';

      if (typeof result === 'string') {
        stdout = result;
      } else if (typeof result === 'object') {
        stdout = result.stdout || '';
        stderr = result.stderr || '';
      }

      if (stdout || stderr) {
        html += '<div class="tool-bash-output">';
        
        if (stdout) {
          const truncatedStdout = stdout.length > 1000 
            ? stdout.substring(0, 1000) + '\n... (truncated)'
            : stdout;
          html += `<pre class="tool-bash-stdout"><code>${this.escapeHtml(truncatedStdout)}</code></pre>`;
        }
        
        if (stderr) {
          const truncatedStderr = stderr.length > 500
            ? stderr.substring(0, 500) + '\n... (truncated)'
            : stderr;
          html += `<pre class="tool-bash-stderr"><code>${this.escapeHtml(truncatedStderr)}</code></pre>`;
        }
        
        html += '</div>';
      }
    }

    // 错误状态
    if (state === 'error' && result) {
      const errorMsg = typeof result === 'string' ? result : JSON.stringify(result);
      html += `
        <div class="tool-bash-error">
          <span class="tool-bash-error-icon">⚠️</span>
          <span class="tool-bash-error-msg">${this.escapeHtml(errorMsg)}</span>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * 渲染 Edit 文件编辑差异视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderEditView(tool) {
    const input = tool.input || {};
    const oldString = input.old_string || '';
    const newString = input.new_string || '';
    const filePath = input.path || '';

    let html = '<div class="tool-diff">';

    // 文件路径（如果有）
    if (filePath) {
      html += `<div class="tool-diff-path">${this.escapeHtml(this.shortenPath(filePath))}</div>`;
    }

    // 简化的 diff 视图
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');

    html += '<div class="tool-diff-content">';

    // 删除的行（红色）
    if (oldString.trim()) {
      html += '<div class="tool-diff-section tool-diff-removed">';
      oldLines.forEach(line => {
        if (line.trim()) {
          html += `<div class="tool-diff-line removed">
            <span class="tool-diff-sign">-</span>
            <span class="tool-diff-text">${this.escapeHtml(line)}</span>
          </div>`;
        }
      });
      html += '</div>';
    }

    // 新增的行（绿色）
    if (newString.trim()) {
      html += '<div class="tool-diff-section tool-diff-added">';
      newLines.forEach(line => {
        if (line.trim()) {
          html += `<div class="tool-diff-line added">
            <span class="tool-diff-sign">+</span>
            <span class="tool-diff-text">${this.escapeHtml(line)}</span>
          </div>`;
        }
      });
      html += '</div>';
    }

    html += '</div></div>';
    return html;
  }

  /**
   * 渲染 Write 写入文件视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderWriteView(tool) {
    const input = tool.input || {};
    const content = input.content || '';
    const filePath = input.path || '';

    let html = '<div class="tool-write">';

    // 文件路径
    if (filePath) {
      html += `<div class="tool-write-path">${this.escapeHtml(this.shortenPath(filePath))}</div>`;
    }

    // 文件内容预览（全部显示为新增）
    const lines = content.split('\n');
    const maxLines = 20;
    const displayLines = lines.slice(0, maxLines);
    const hasMore = lines.length > maxLines;

    html += '<div class="tool-write-content">';
    displayLines.forEach((line, index) => {
      html += `<div class="tool-write-line">
        <span class="tool-write-number">${index + 1}</span>
        <span class="tool-write-text">${this.escapeHtml(line) || ' '}</span>
      </div>`;
    });

    if (hasMore) {
      html += `<div class="tool-write-more">... ${this.t('toolCall.moreLines', { count: lines.length - maxLines })}</div>`;
    }

    html += '</div></div>';
    return html;
  }

  /**
   * 渲染 AskUserQuestion 用户问答视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderAskUserQuestion(tool) {
    const input = tool.input || {};
    const questions = input.questions || [];
    const state = tool.state;

    // 如果没有问题，返回空
    if (!Array.isArray(questions) || questions.length === 0) {
      return `<div class="tool-empty">${this.t('toolCall.noQuestion')}</div>`;
    }

    let html = '<div class="tool-question">';

    questions.forEach((question, qIndex) => {
      const header = question.header || this.t('toolCall.questionNumber', { index: qIndex + 1 });
      const questionText = question.question || '';
      const options = question.options || [];
      const multiSelect = question.multiSelect || false;

      html += `
        <div class="tool-question-section" data-question-index="${qIndex}">
          <div class="tool-question-header">${this.escapeHtml(header)}</div>
          <div class="tool-question-text">${this.escapeHtml(questionText)}</div>
          <div class="tool-question-options">
      `;

      options.forEach((option, oIndex) => {
        const label = option.label || option;
        const description = option.description || '';
        const isDisabled = state !== 'running';

        html += `
          <div class="tool-question-option ${isDisabled ? 'disabled' : ''}" 
               data-question="${qIndex}" 
               data-option="${oIndex}"
               data-multi="${multiSelect}">
            <span class="tool-question-indicator ${multiSelect ? 'checkbox' : 'radio'}"></span>
            <div class="tool-question-option-content">
              <span class="tool-question-option-label">${this.escapeHtml(label)}</span>
              ${description ? `<span class="tool-question-option-desc">${this.escapeHtml(description)}</span>` : ''}
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    // 提交按钮（仅运行中时显示）
    if (state === 'running') {
      html += `
        <div class="tool-question-actions">
          <button class="tool-question-submit" disabled>${this.t('toolCall.submitAnswer')}</button>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /**
   * 渲染 Read 读取文件视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderReadView(tool) {
    const input = tool.input || {};
    const filePath = input.path || '';
    const state = tool.state;
    const result = tool.result;

    let html = '<div class="tool-read">';

    // 文件路径
    html += `<div class="tool-read-path">${this.escapeHtml(filePath)}</div>`;

    // 文件内容预览（完成时）
    if (state === 'completed' && result) {
      const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = content.split('\n');
      const maxLines = 15;
      const displayLines = lines.slice(0, maxLines);
      const hasMore = lines.length > maxLines;

      html += '<div class="tool-read-content">';
      displayLines.forEach((line, index) => {
        html += `<div class="tool-read-line">
          <span class="tool-read-number">${index + 1}</span>
          <span class="tool-read-text">${this.escapeHtml(line) || ' '}</span>
        </div>`;
      });

      if (hasMore) {
        html += `<div class="tool-read-more">... ${this.t('toolCall.moreLines', { count: lines.length - maxLines })}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * 渲染 Glob 文件搜索视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderGlobView(tool) {
    const input = tool.input || {};
    const pattern = input.glob_pattern || input.pattern || '';
    const state = tool.state;
    const result = tool.result;

    let html = '<div class="tool-glob">';

    // 搜索模式
    html += `
      <div class="tool-search-query">
        <span class="tool-search-label">Pattern:</span>
        <code class="tool-search-value">${this.escapeHtml(pattern)}</code>
      </div>
    `;

    // 搜索结果
    if (state === 'completed' && result) {
      let files = [];
      if (typeof result === 'string') {
        files = result.split('\n').filter(f => f.trim());
      } else if (Array.isArray(result)) {
        files = result;
      }

      if (files.length > 0) {
        const maxFiles = 10;
        const displayFiles = files.slice(0, maxFiles);
        const hasMore = files.length > maxFiles;

        html += '<div class="tool-glob-results">';
        displayFiles.forEach(file => {
          html += `<div class="tool-glob-file">
            <span class="tool-glob-icon">📄</span>
            <span class="tool-glob-name">${this.escapeHtml(this.shortenPath(file))}</span>
          </div>`;
        });

        if (hasMore) {
          html += `<div class="tool-glob-more">... ${this.t('toolCall.moreFiles', { count: files.length - maxFiles })}</div>`;
        }
        html += '</div>';
      } else {
        html += `<div class="tool-empty">${this.t('toolCall.noMatchingFiles')}</div>`;
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * 渲染 Grep 内容搜索视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderGrepView(tool) {
    const input = tool.input || {};
    const pattern = input.pattern || '';
    const state = tool.state;
    const result = tool.result;

    let html = '<div class="tool-grep">';

    // 搜索模式
    html += `
      <div class="tool-search-query">
        <span class="tool-search-label">Pattern:</span>
        <code class="tool-search-value">${this.escapeHtml(pattern)}</code>
      </div>
    `;

    // 搜索结果
    if (state === 'completed' && result) {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const lines = resultStr.split('\n').filter(l => l.trim());
      
      if (lines.length > 0) {
        const maxLines = 15;
        const displayLines = lines.slice(0, maxLines);
        const hasMore = lines.length > maxLines;

        html += '<div class="tool-grep-results">';
        displayLines.forEach(line => {
          // 尝试高亮匹配的模式
          let highlightedLine = this.escapeHtml(line);
          try {
            const regex = new RegExp(`(${this.escapeRegex(pattern)})`, 'gi');
            highlightedLine = this.escapeHtml(line).replace(regex, '<mark class="tool-grep-match">$1</mark>');
          } catch (e) {
            // 正则表达式无效，使用原始文本
          }
          html += `<div class="tool-grep-line">${highlightedLine}</div>`;
        });

        if (hasMore) {
          html += `<div class="tool-grep-more">... ${this.t('toolCall.moreLines', { count: lines.length - maxLines })}</div>`;
        }
        html += '</div>';
      } else {
        html += `<div class="tool-empty">${this.t('toolCall.noMatchingContent')}</div>`;
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * 渲染 WebSearch 网络搜索视图
   * @param {Object} tool 工具数据
   * @returns {string} HTML 内容
   */
  renderWebSearchView(tool) {
    const input = tool.input || {};
    const query = input.search_term || input.query || '';
    const state = tool.state;
    const result = tool.result;

    let html = '<div class="tool-websearch">';

    // 搜索关键词
    html += `
      <div class="tool-search-query">
        <span class="tool-search-label">${this.t('toolCall.search')}</span>
        <span class="tool-search-value">${this.escapeHtml(query)}</span>
      </div>
    `;

    // 搜索结果
    if (state === 'completed' && result) {
      let results = [];
      if (typeof result === 'string') {
        // 尝试从文本中提取 URL
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
        const urls = result.match(urlRegex) || [];
        results = urls.map(url => ({ url }));
      } else if (Array.isArray(result)) {
        results = result;
      } else if (result.results) {
        results = result.results;
      }

      if (results.length > 0) {
        const maxResults = 5;
        const displayResults = results.slice(0, maxResults);
        const hasMore = results.length > maxResults;

        html += '<div class="tool-websearch-results">';
        displayResults.forEach(item => {
          const title = item.title || item.url || 'Link';
          const url = item.url || item.link || '#';
          const snippet = item.snippet || item.description || '';

          html += `
            <div class="tool-websearch-item">
              <div class="tool-websearch-title">${this.escapeHtml(title)}</div>
              <div class="tool-websearch-url">${this.escapeHtml(url)}</div>
              ${snippet ? `<div class="tool-websearch-snippet">${this.escapeHtml(snippet.substring(0, 150))}...</div>` : ''}
            </div>
          `;
        });

        if (hasMore) {
          html += `<div class="tool-websearch-more">... ${this.t('toolCall.moreResults', { count: results.length - maxResults })}</div>`;
        }
        html += '</div>';
      } else {
        // 显示原始结果摘要
        const summary = typeof result === 'string' 
          ? result.substring(0, 300) 
          : JSON.stringify(result).substring(0, 300);
        html += `<div class="tool-websearch-summary">${this.escapeHtml(summary)}...</div>`;
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * 转义正则表达式特殊字符
   * @param {string} str 原始字符串
   * @returns {string} 转义后的字符串
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ToolCallRenderer = ToolCallRenderer;
}
