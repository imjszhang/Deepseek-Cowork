/**
 * ExplorerModule - 文件浏览器模块
 * 管理文件预览、标签页、SSE 连接等功能
 * 
 * @created 2026-01-16
 * @module features/explorer/ExplorerModule
 */

class ExplorerModule {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {Object} options.app 主应用实例引用
   */
  constructor(options = {}) {
    this.app = options.app;
    
    // Explorer Manager 实例
    this.explorerManager = null;
    this.explorerConnected = false;
    this.serverStatusUnsubscribe = null;
    
    // 文件预览状态
    this.filePreviewPath = null;
    this.previewedFileContent = null;
    this.isFileEditing = false;
    this.filePreviewUnsaved = false;
    this.previewViewMode = 'source'; // 'source' | 'rendered'
    this.previewFileType = 'text'; // 'text' | 'html' | 'markdown' | 'image'
    
    // 多文件标签页状态
    this.openTabs = [];
    this.activeTabId = null;
    
    // 防抖定时器
    this.fileRefreshDebounceTimer = null;
    
    // 分栏布局状态
    this.viewMode = 'list'; // 'list' | 'split'
    this.splitWidth = parseInt(localStorage.getItem('files-split-width')) || 280;
    this.isResizing = false;
    
    // Blob URL 缓存
    this._previewBlobUrl = null;
    
    // Three.js 背景实例
    this.previewBackground = null;
    
    // DOM 元素引用
    this.elements = {};
  }

  /**
   * 初始化模块
   */
  async init() {
    this.bindElements();
    this.bindEvents();
    this.initResizer();
    this.initPreviewBackground();
    
    // 初始化 ExplorerManager
    await this.initExplorerManager();
  }

  /**
   * 初始化预览背景动画
   */
  initPreviewBackground() {
    const container = document.getElementById('preview-threejs-bg');
    if (!container) {
      console.warn('[ExplorerModule] Preview background container not found');
      return;
    }
    
    if (typeof PreviewBackground !== 'undefined') {
      this.previewBackground = new PreviewBackground({ container });
      this.previewBackground.init();
      console.log('[ExplorerModule] Preview background initialized');
    } else {
      console.warn('[ExplorerModule] PreviewBackground class not available');
    }
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 设置面板 - 服务器状态区块中的 Explorer 状态
      serverExplorerStatus: document.getElementById('server-explorer-status'),
      
      // 文件列表容器
      filesSplitContainer: document.getElementById('files-split-container'),
      filesListPane: document.getElementById('files-list-pane'),
      filesResizer: document.getElementById('files-resizer'),
      filePreviewPane: document.getElementById('file-preview-pane'),
      filesList: document.getElementById('files-list'),
      
      // Three.js 背景容器
      previewThreejsBg: document.getElementById('preview-threejs-bg'),
      
      // 文件预览容器
      filePreviewContainer: document.getElementById('file-preview-container'),
      filePreviewContent: document.getElementById('file-preview-content'),
      filePreviewCode: document.getElementById('file-preview-code'),
      fileEditArea: document.getElementById('file-edit-area'),
      filePreviewIframe: document.getElementById('file-preview-iframe'),
      markdownPreview: document.getElementById('markdown-preview'),
      
      // 标签栏
      fileTabsScroll: document.getElementById('file-tabs-scroll'),
      
      // 预览头部
      previewFilename: document.getElementById('preview-filename'),
      previewIcon: document.getElementById('preview-icon'),
      previewFileSize: document.getElementById('preview-file-size'),
      previewFileModified: document.getElementById('preview-file-modified'),
      previewUnsaved: document.getElementById('preview-unsaved'),
      
      // 工具栏按钮
      previewEditBtn: document.getElementById('preview-edit-btn'),
      previewSaveBtn: document.getElementById('preview-save-btn'),
      previewCancelBtn: document.getElementById('preview-cancel-btn'),
      previewCloseBtn: document.getElementById('preview-close-btn'),
      
      // 视图切换
      previewViewToggle: document.getElementById('preview-view-toggle'),
      previewSourceBtn: document.getElementById('preview-source-btn'),
      previewRenderBtn: document.getElementById('preview-render-btn')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 预览工具栏按钮
    this.elements.previewEditBtn?.addEventListener('click', () => this.toggleFileEdit(true));
    this.elements.previewSaveBtn?.addEventListener('click', () => this.saveFileContent());
    this.elements.previewCancelBtn?.addEventListener('click', () => {
      this.restoreContentFromTab();
      this.toggleFileEdit(false);
    });
    this.elements.previewCloseBtn?.addEventListener('click', () => this.closeFilePreview());
    
    // 视图切换按钮
    this.elements.previewSourceBtn?.addEventListener('click', () => this.togglePreviewView('source'));
    this.elements.previewRenderBtn?.addEventListener('click', () => this.togglePreviewView('rendered'));
    
    // 编辑区域输入监听
    this.elements.fileEditArea?.addEventListener('input', () => {
      this.filePreviewUnsaved = true;
      if (this.elements.previewUnsaved) {
        this.elements.previewUnsaved.style.display = 'inline';
      }
      this.updateCurrentTabDirty();
    });
  }

  /**
   * 初始化 Explorer Manager
   */
  async initExplorerManager() {
    console.log('[ExplorerModule] Initializing Explorer Manager...');
    
    if (typeof ExplorerManager === 'undefined') {
      console.warn('[ExplorerModule] ExplorerManager not available');
      return;
    }
    
    try {
      this.explorerManager = new ExplorerManager({
        baseUrl: 'http://localhost:3333',
        autoConnect: false
      });
      
      await this.explorerManager.init();
      this.setupSSEEvents();
      
      // 监听服务器状态变化，只有在服务器运行时才连接 SSE
      this.setupServerStatusListener();
      
      // 检查当前服务器状态，如果已运行则连接
      await this.checkAndConnectSSE();
      
      console.log('[ExplorerModule] Explorer Manager initialized');
    } catch (error) {
      console.error('[ExplorerModule] Init failed:', error);
      this.updateStatus('offline');
    }
  }

  /**
   * 设置服务器状态监听器
   */
  setupServerStatusListener() {
    if (!window.appBridge) {
      console.warn('[ExplorerModule] appBridge not available');
      return;
    }

    // 监听服务器状态变化
    this.serverStatusUnsubscribe = window.appBridge.onServerStatusChanged(async (response) => {
      console.log('[ExplorerModule] Server status changed:', response);
      
      // 兼容两种返回格式
      const status = response?.status || response;
      const isRunning = status?.running === true;
      
      if (isRunning) {
        // 服务器已启动，尝试连接 SSE
        console.log('[ExplorerModule] Server is running, connecting SSE...');
        await this.checkAndConnectSSE();
      } else {
        // 服务器已停止，断开 SSE 连接
        console.log('[ExplorerModule] Server stopped, disconnecting SSE...');
        this.disconnectSSE();
        this.updateStatus('offline');
      }
    });
  }

  /**
   * 检查服务器状态并连接 SSE
   */
  async checkAndConnectSSE() {
    if (!window.appBridge || !this.explorerManager) {
      console.warn('[ExplorerModule] appBridge or explorerManager not available');
      return;
    }

    try {
      // 检查服务器状态
      const response = await window.appBridge.getServerStatus();
      console.log('[ExplorerModule] Current server status response:', response);
      
      // 兼容两种返回格式：
      // 1. Electron IPC 返回: { running: true, ... }
      // 2. HTTP API 返回: { success: true, status: { running: true, ... } }
      const status = response?.status || response;
      const isRunning = status?.running === true;
      
      console.log('[ExplorerModule] Server running:', isRunning);
      
      if (isRunning) {
        // 服务器正在运行，连接 SSE
        console.log('[ExplorerModule] Server is running, connecting SSE...');
        await this.connectSSE();
      } else {
        // 服务器未运行，等待服务器启动
        console.log('[ExplorerModule] Server not running, waiting for server to start...');
        this.updateStatus('offline');
      }
    } catch (error) {
      console.warn('[ExplorerModule] Failed to check server status:', error);
      this.updateStatus('offline');
    }
  }

  /**
   * 断开 SSE 连接
   */
  disconnectSSE() {
    if (this.explorerManager) {
      this.explorerManager.disconnectSSE();
      this.explorerConnected = false;
    }
    
    // 取消服务器状态监听
    if (this.serverStatusUnsubscribe) {
      this.serverStatusUnsubscribe();
      this.serverStatusUnsubscribe = null;
    }
  }

  /**
   * 连接 SSE
   */
  async connectSSE() {
    if (!this.explorerManager) {
      console.warn('[ExplorerModule] ExplorerManager not initialized, cannot connect SSE');
      return;
    }
    
    try {
      console.log('[ExplorerModule] Attempting to connect SSE...');
      this.updateStatus('connecting');
      await this.explorerManager.connectSSE();
      console.log('[ExplorerModule] SSE connected successfully');
      this.explorerConnected = true;
    } catch (error) {
      console.error('[ExplorerModule] SSE connection failed:', error.message, error);
      this.updateStatus('offline');
      this.explorerConnected = false;
    }
  }

  /**
   * 设置 SSE 事件监听
   */
  setupSSEEvents() {
    if (!this.explorerManager) return;
    
    const sse = this.explorerManager.getSSE();
    if (!sse) return;
    
    sse.addEventListener('state_change', (event) => {
      this.updateStatus(event.detail.state);
    });
    
    sse.addEventListener('connected', () => {
      this.explorerConnected = true;
      this.updateStatus('connected');
    });
    
    sse.addEventListener('disconnected', () => {
      this.explorerConnected = false;
      this.updateStatus('disconnected');
    });
    
    sse.addEventListener('file_change', (event) => {
      this.handleFileChangeEvent(event.detail);
    });
    
    sse.addEventListener('structure_update', (event) => {
      this.handleStructureUpdateEvent(event.detail);
    });
    
    sse.addEventListener('reconnect_failed', () => {
      this.updateStatus('offline');
    });
  }

  /**
   * 更新状态指示器
   * @param {string} state 状态
   */
  updateStatus(state) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const serverExplorerStatus = this.elements.serverExplorerStatus;
    
    // 更新设置面板服务器状态区块中的 Explorer 状态
    if (serverExplorerStatus) {
      serverExplorerStatus.classList.remove('running', 'stopped');
      switch (state) {
        case 'connected':
          serverExplorerStatus.textContent = t('explorer.status.online');
          serverExplorerStatus.classList.add('running');
          break;
        case 'connecting':
          serverExplorerStatus.textContent = t('explorer.status.connecting');
          break;
        case 'reconnecting':
          serverExplorerStatus.textContent = t('explorer.status.reconnecting');
          break;
        default:
          serverExplorerStatus.textContent = t('explorer.status.offline');
          serverExplorerStatus.classList.add('stopped');
      }
    }
    
    // 同步到 app
    if (this.app) {
      this.app.explorerConnected = this.explorerConnected;
    }
  }

  /**
   * 处理文件变化事件
   */
  handleFileChangeEvent(data) {
    const { type, path, fullPath } = data;
    
    console.log('[ExplorerModule] File change event:', type, path, fullPath);
    
    // 高亮变化的文件
    this.highlightChangedFile(path, type);
    
    // 防抖刷新文件列表
    if (this.fileRefreshDebounceTimer) {
      clearTimeout(this.fileRefreshDebounceTimer);
    }
    
    this.fileRefreshDebounceTimer = setTimeout(() => {
      // 获取当前浏览的目录路径
      const currentPath = this.app?.filesPanel?.currentPath || this.app?.currentFilePath;
      
      // 对于新增文件/文件夹，总是刷新列表
      if (type === 'add' || type === 'addDir') {
        console.log('[ExplorerModule] New file/folder detected, refreshing list');
        this.app?.refreshFileList?.();
        return;
      }
      
      // 对于其他类型的变化，检查路径是否匹配
      if (currentPath) {
        // 标准化路径分隔符
        const normalizedCurrentPath = currentPath.replace(/\\/g, '/');
        const normalizedFullPath = (fullPath || '').replace(/\\/g, '/');
        const normalizedPath = (path || '').replace(/\\/g, '/');
        
        // 检查完整路径是否在当前目录内，或相对路径是否匹配
        const isInCurrentDir = normalizedFullPath.startsWith(normalizedCurrentPath) ||
                               normalizedCurrentPath.includes(normalizedPath) ||
                               normalizedCurrentPath.endsWith(normalizedPath);
        
        if (isInCurrentDir) {
          console.log('[ExplorerModule] File in current directory changed, refreshing list');
          this.app?.refreshFileList?.();
        }
      } else {
        // 没有当前路径，也刷新（可能是初始状态）
        console.log('[ExplorerModule] No current path, refreshing list anyway');
        this.app?.refreshFileList?.();
      }
    }, 500);
    
    // 处理预览文件的变化
    this.handlePreviewFileChange(type, path, fullPath);
    
    // 处理已打开标签页中文件的变化
    this.handleOpenTabsFileChange(type, path, fullPath);
  }

  /**
   * 处理当前预览文件的变化
   * @param {string} type 变化类型
   * @param {string} changedPath 变化的文件路径
   * @param {string} fullPath 完整路径
   */
  handlePreviewFileChange(type, changedPath, fullPath) {
    // 检查是否是当前预览的文件（支持相对路径和绝对路径匹配）
    const isCurrentFile = this.filePreviewPath === changedPath || 
                          this.filePreviewPath === fullPath ||
                          (this.filePreviewPath && changedPath && 
                           this.filePreviewPath.replace(/\\/g, '/').endsWith(changedPath.replace(/\\/g, '/')));
    
    if (!isCurrentFile) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    switch (type) {
      case 'change':
        console.log('[ExplorerModule] Preview file changed externally:', changedPath);
        
        // 如果用户正在编辑且有未保存的修改，显示提示
        if (this.isFileEditing && this.filePreviewUnsaved) {
          this.showExternalChangeNotice();
        } else if (this.filePreviewUnsaved) {
          // 有未保存修改但不在编辑模式，也显示提示
          this.showExternalChangeNotice();
        } else {
          // 没有未保存的修改，自动重新加载
          this.reloadCurrentPreview();
        }
        break;
        
      case 'unlink':
        console.log('[ExplorerModule] Preview file deleted externally:', changedPath);
        // 文件被删除，关闭当前预览
        if (this.activeTabId) {
          this.closeTab(this.activeTabId, true);
        } else {
          this.closeFilePreview();
        }
        // 显示通知
        if (this.app?.showNotification) {
          this.app.showNotification(t('explorer.fileDeleted') || 'File has been deleted', 'warning');
        }
        break;
    }
  }

  /**
   * 处理已打开标签页中文件的变化
   * @param {string} type 变化类型
   * @param {string} changedPath 变化的文件路径
   * @param {string} fullPath 完整路径
   */
  handleOpenTabsFileChange(type, changedPath, fullPath) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 遍历所有打开的标签页
    for (const tab of this.openTabs) {
      // 检查路径匹配（跳过当前活动标签页，已在上面处理）
      const isTabFile = tab.path === changedPath || 
                        tab.path === fullPath ||
                        (tab.path && changedPath && 
                         tab.path.replace(/\\/g, '/').endsWith(changedPath.replace(/\\/g, '/')));
      
      if (!isTabFile) continue;
      
      // 跳过当前活动标签（已在 handlePreviewFileChange 中处理）
      if (tab.id === this.activeTabId) continue;
      
      switch (type) {
        case 'change':
          console.log('[ExplorerModule] Tab file changed externally:', tab.path);
          
          // 非活动标签页，标记为外部修改
          if (tab.isDirty) {
            // 有未保存的修改，标记但不自动更新
            tab.externallyModified = true;
            this.renderTabs();
          } else {
            // 没有未保存的修改，更新缓存内容
            this.reloadTabContent(tab.id);
          }
          break;
          
        case 'unlink':
          console.log('[ExplorerModule] Tab file deleted externally:', tab.path);
          // 文件被删除，关闭对应标签页
          this.closeTab(tab.id, true);
          break;
      }
    }
  }

  /**
   * 处理结构更新事件
   */
  handleStructureUpdateEvent(data) {
    if (this.fileRefreshDebounceTimer) {
      clearTimeout(this.fileRefreshDebounceTimer);
    }
    
    this.fileRefreshDebounceTimer = setTimeout(() => {
      this.app?.refreshFileList?.();
    }, 500);
  }

  /**
   * 高亮变化的文件
   */
  highlightChangedFile(filePath, changeType) {
    const filesList = this.elements.filesList || this.app?.filesList;
    if (!filesList) return;
    
    const fileItems = filesList.querySelectorAll('.file-item');
    fileItems.forEach(item => {
      if (item.dataset.path === filePath) {
        item.classList.remove('file-added', 'file-changed', 'file-deleted', 'file-highlight');
        
        switch (changeType) {
          case 'add':
          case 'addDir':
            item.classList.add('file-added');
            break;
          case 'change':
            item.classList.add('file-changed');
            break;
          case 'unlink':
          case 'unlinkDir':
            item.classList.add('file-deleted');
            setTimeout(() => item.remove(), 500);
            return;
        }
        
        setTimeout(() => {
          item.classList.remove('file-added', 'file-changed');
        }, 2000);
      }
    });
  }

  /**
   * 打开文件预览
   */
  async openFilePreview(filePath) {
    console.log('[ExplorerModule] Opening file preview:', filePath);
    
    const container = this.elements.filePreviewContainer;
    if (!container) return;
    
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const previewableExts = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'sh', 'bash', 'zsh', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'vue', 'svelte', 'astro'];
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
    const pdfExts = ['pdf'];
    const renderableExts = ['html', 'htm', 'md'];
    const markdownExts = ['md'];
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    this.switchToSplitView();
    
    // 移除之前的预览高亮
    const filesList = this.elements.filesList || this.app?.filesList;
    filesList?.querySelectorAll('.file-item.previewing').forEach(item => {
      item.classList.remove('previewing');
    });
    
    // 高亮当前预览的文件
    filesList?.querySelectorAll('.file-item').forEach(item => {
      if (item.dataset.path === filePath) {
        item.classList.add('previewing');
      }
    });
    
    container.style.display = 'flex';
    this.filePreviewPath = filePath;
    
    // 设置文件名和图标
    const fileName = filePath.split(/[\/\\]/).pop() || filePath;
    if (this.elements.previewFilename) {
      this.elements.previewFilename.textContent = fileName;
    }
    if (this.elements.previewIcon) {
      this.elements.previewIcon.textContent = this.app?.getFileIcon?.({ name: fileName, isDirectory: false }) || '📄';
    }
    
    // 重置状态
    this.isFileEditing = false;
    this.filePreviewUnsaved = false;
    this.previewFileType = markdownExts.includes(ext) ? 'markdown' : (renderableExts.includes(ext) ? 'html' : 'text');
    
    const isRenderable = renderableExts.includes(ext);
    this.previewViewMode = isRenderable ? 'rendered' : 'source';
    
    // 更新 UI
    if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = isRenderable ? 'none' : 'inline-block';
    if (this.elements.previewSaveBtn) this.elements.previewSaveBtn.style.display = 'none';
    if (this.elements.previewCancelBtn) this.elements.previewCancelBtn.style.display = 'none';
    if (this.elements.previewUnsaved) this.elements.previewUnsaved.style.display = 'none';
    if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = isRenderable ? 'none' : 'block';
    if (this.elements.fileEditArea) this.elements.fileEditArea.style.display = 'none';
    if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
    if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
    
    if (this.elements.previewViewToggle) {
      this.elements.previewViewToggle.style.display = isRenderable ? 'inline-flex' : 'none';
    }
    if (this.elements.previewSourceBtn) this.elements.previewSourceBtn.classList.toggle('active', !isRenderable);
    if (this.elements.previewRenderBtn) this.elements.previewRenderBtn.classList.toggle('active', isRenderable);
    
    try {
      if (this.elements.filePreviewCode) {
        this.elements.filePreviewCode.innerHTML = `<code>${t('common.loading')}</code>`;
      }
      
      let content = null;
      let fileInfo = null;
      
      // 优先使用 Explorer HTTP API
      if (this.explorerManager && this.explorerConnected) {
        try {
          const result = await this.explorerManager.readFile(filePath);
          if (result.status === 'success') {
            content = result.content;
          }
          const infoResult = await this.explorerManager.getFileInfo(filePath);
          if (infoResult.status === 'success') {
            fileInfo = infoResult.data;
          }
        } catch (e) {
          console.warn('[ExplorerModule] HTTP API failed:', e.message);
        }
      }
      
      // 回退到 IPC
      if (content === null) {
        const result = await window.appBridge?.readFileContent?.(filePath);
        if (result?.success) {
          content = result.content;
        } else {
          throw new Error(result?.error || t('errors.readFailed'));
        }
      }
      
      this.previewedFileContent = content;
      
      // 更新文件信息
      if (fileInfo) {
        const formatFileSize = this.app?.formatFileSize?.bind(this.app) || ((b) => b + ' bytes');
        const formatFileDate = this.app?.formatFileDate?.bind(this.app) || ((d) => d);
        
        if (this.elements.previewFileSize) {
          this.elements.previewFileSize.textContent = formatFileSize(fileInfo.size);
        }
        if (this.elements.previewFileModified) {
          this.elements.previewFileModified.textContent = formatFileDate(fileInfo.modifiedTime);
        }
      }
      
      // 清理之前的预览内容（防止 PDF/Image 预览残留）
      this.cleanupPreviewContent();
      
      // 根据文件类型渲染
      if (pdfExts.includes(ext)) {
        // PDF 文件预览
        if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
        if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
        if (this.elements.previewViewToggle) this.elements.previewViewToggle.style.display = 'none';
        this.previewFileType = 'pdf';
        await this.renderPdfPreview(filePath, fileInfo);
      } else if (imageExts.includes(ext)) {
        if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
        if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
        this.renderImagePreview(filePath, ext, fileInfo);
      } else if (previewableExts.includes(ext) || ext === '') {
        if (isRenderable) {
          if (this.previewFileType === 'markdown') {
            this.renderMarkdownPreview(content);
          } else {
            this.renderHtmlPreview(content);
          }
        } else {
          this.renderCodeContent(content, ext);
        }
      } else {
        if (this.elements.filePreviewCode) {
          this.elements.filePreviewCode.innerHTML = `<code class="file-preview-unsupported"><span class="unsupported-icon">📄</span><p>${t('explorer.preview.unsupported')}</p></code>`;
        }
        if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
      }
      
      // 创建或激活标签页
      const fileType = pdfExts.includes(ext) ? 'pdf' : (imageExts.includes(ext) ? 'image' : this.previewFileType);
      this.createOrActivateTab(filePath, content, fileType);
      
    } catch (error) {
      console.error('[ExplorerModule] Failed to read file:', error);
      if (this.elements.filePreviewCode) {
        this.elements.filePreviewCode.innerHTML = `<code class="error">${t('errors.readFailed')}: ${this.escapeHtml(error.message)}</code>`;
      }
    }
  }

  /**
   * 关闭文件预览
   */
  closeFilePreview() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (this.filePreviewUnsaved) {
      if (!confirm(t('explorer.preview.unsavedConfirm'))) {
        return;
      }
    }
    
    this.switchToListView();
    
    const filesList = this.elements.filesList || this.app?.filesList;
    filesList?.querySelectorAll('.file-item.previewing').forEach(item => {
      item.classList.remove('previewing');
    });
    
    if (this.elements.filePreviewContainer) {
      this.elements.filePreviewContainer.style.display = 'none';
    }
    
    if (this.elements.filePreviewIframe) {
      this.elements.filePreviewIframe.src = 'about:blank';
      this.elements.filePreviewIframe.style.display = 'none';
    }
    if (this._previewBlobUrl) {
      URL.revokeObjectURL(this._previewBlobUrl);
      this._previewBlobUrl = null;
    }
    
    if (this.elements.markdownPreview) {
      this.elements.markdownPreview.innerHTML = '';
      this.elements.markdownPreview.style.display = 'none';
    }
    
    // 清理 PDF 预览资源
    if (this._pdfCleanup) {
      this._pdfCleanup();
      this._pdfCleanup = null;
    }
    
    this.filePreviewPath = null;
    this.previewedFileContent = null;
    this.isFileEditing = false;
    this.filePreviewUnsaved = false;
    this.previewViewMode = 'source';
    this.previewFileType = 'text';
    
    this.openTabs = [];
    this.activeTabId = null;
    this.renderTabs();
  }

  // ============ 标签页管理 ============

  /**
   * 生成唯一的标签 ID
   */
  generateTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 根据文件路径查找标签
   */
  findTabByPath(filePath) {
    return this.openTabs.find(tab => tab.path === filePath) || null;
  }

  /**
   * 根据 ID 查找标签
   */
  findTabById(tabId) {
    return this.openTabs.find(tab => tab.id === tabId) || null;
  }

  /**
   * 创建新标签或激活已存在的标签
   */
  createOrActivateTab(filePath, content, fileType) {
    let tab = this.findTabByPath(filePath);

    if (tab) {
      this.activeTabId = tab.id;
    } else {
      const fileName = filePath.split(/[\/\\]/).pop() || filePath;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const renderableTypes = ['html', 'markdown'];
      const defaultViewMode = renderableTypes.includes(fileType) ? 'rendered' : 'source';

      tab = {
        id: this.generateTabId(),
        path: filePath,
        name: fileName,
        ext: ext,
        type: fileType,
        isDirty: false,
        content: content,
        viewMode: defaultViewMode
      };

      this.openTabs.push(tab);
      this.activeTabId = tab.id;
    }
    
    this.renderTabs();
    return tab;
  }

  /**
   * 关闭标签页
   */
  closeTab(tabId, force = false) {
    const tabIndex = this.openTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return false;
    
    const tab = this.openTabs[tabIndex];
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (tab.isDirty && !force) {
      if (!confirm(t('explorer.preview.unsavedConfirm'))) {
        return false;
      }
    }
    
    this.openTabs.splice(tabIndex, 1);
    
    if (this.activeTabId === tabId) {
      if (this.openTabs.length > 0) {
        const newIndex = Math.min(tabIndex, this.openTabs.length - 1);
        this.activeTabId = this.openTabs[newIndex].id;
        this.switchToTab(this.activeTabId);
      } else {
        this.activeTabId = null;
        this.closeFilePreviewWithoutTabClear();
      }
    }
    
    this.renderTabs();
    return true;
  }

  /**
   * 关闭预览面板但不清空标签数据
   */
  closeFilePreviewWithoutTabClear() {
    this.switchToListView();
    
    const filesList = this.elements.filesList || this.app?.filesList;
    filesList?.querySelectorAll('.file-item.previewing').forEach(item => {
      item.classList.remove('previewing');
    });
    
    if (this.elements.filePreviewContainer) {
      this.elements.filePreviewContainer.style.display = 'none';
    }
    
    if (this.elements.filePreviewIframe) {
      this.elements.filePreviewIframe.src = 'about:blank';
      this.elements.filePreviewIframe.style.display = 'none';
    }
    if (this._previewBlobUrl) {
      URL.revokeObjectURL(this._previewBlobUrl);
      this._previewBlobUrl = null;
    }
    
    if (this.elements.markdownPreview) {
      this.elements.markdownPreview.innerHTML = '';
      this.elements.markdownPreview.style.display = 'none';
    }
    
    this.filePreviewPath = null;
    this.previewedFileContent = null;
    this.isFileEditing = false;
    this.filePreviewUnsaved = false;
    this.previewViewMode = 'source';
    this.previewFileType = 'text';
  }

  /**
   * 切换到指定标签
   */
  async switchToTab(tabId) {
    const tab = this.findTabById(tabId);
    if (!tab) return;
    
    if (this.activeTabId && this.activeTabId !== tabId) {
      const currentTab = this.findTabById(this.activeTabId);
      if (currentTab) {
        currentTab.content = this.previewedFileContent;
        currentTab.isDirty = this.filePreviewUnsaved;
        currentTab.viewMode = this.previewViewMode;
      }
    }
    
    this.activeTabId = tabId;
    
    const filesList = this.elements.filesList || this.app?.filesList;
    filesList?.querySelectorAll('.file-item.previewing').forEach(item => {
      item.classList.remove('previewing');
    });
    filesList?.querySelectorAll('.file-item').forEach(item => {
      if (item.dataset.path === tab.path) {
        item.classList.add('previewing');
      }
    });
    
    this.filePreviewPath = tab.path;
    this.previewedFileContent = tab.content;
    this.filePreviewUnsaved = tab.isDirty;
    this.previewViewMode = tab.viewMode || 'source';
    this.previewFileType = tab.type;
    
    const fileName = tab.name;
    if (this.elements.previewFilename) {
      this.elements.previewFilename.textContent = fileName;
    }
    if (this.elements.previewIcon) {
      this.elements.previewIcon.textContent = this.app?.getFileIcon?.({ name: fileName, isDirectory: false }) || '📄';
    }
    
    if (this.elements.previewUnsaved) {
      this.elements.previewUnsaved.style.display = tab.isDirty ? 'inline' : 'none';
    }
    
    // 处理外部修改标记
    if (tab.externallyModified) {
      if (tab.isDirty) {
        // 有未保存修改，显示提示让用户选择
        this.showExternalChangeNotice();
      } else {
        // 没有未保存修改，自动重新加载
        this.reloadCurrentPreview();
      }
    } else {
      // 隐藏提示条
      this.hideExternalChangeNotice();
    }
    
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
    const pdfExts = ['pdf'];
    const renderableExts = ['html', 'htm', 'md'];
    
    // 清理之前的预览内容（重要：防止 PDF/Image 预览残留）
    this.cleanupPreviewContent();
    
    if (this.elements.previewViewToggle) {
      this.elements.previewViewToggle.style.display = renderableExts.includes(tab.ext) ? 'inline-flex' : 'none';
    }
    
    if (this.elements.previewSourceBtn) {
      this.elements.previewSourceBtn.classList.toggle('active', this.previewViewMode === 'source');
    }
    if (this.elements.previewRenderBtn) {
      this.elements.previewRenderBtn.classList.toggle('active', this.previewViewMode === 'rendered');
    }
    
    if (pdfExts.includes(tab.ext)) {
      // PDF 文件
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
      if (this.elements.previewViewToggle) this.elements.previewViewToggle.style.display = 'none';
      await this.renderPdfPreview(tab.path, null);
    } else if (imageExts.includes(tab.ext)) {
      // 图片文件
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
      await this.renderImagePreview(tab.path, tab.ext, null);
    } else {
      // 文本文件
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'inline-block';
      
      if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
      if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
      
      if (this.previewViewMode === 'rendered' && renderableExts.includes(tab.ext)) {
        if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
        if (tab.type === 'markdown') {
          this.renderMarkdownPreview(tab.content);
        } else {
          this.renderHtmlPreview(tab.content);
        }
      } else {
        if (this.elements.filePreviewCode) {
          this.elements.filePreviewCode.style.display = 'block';
          this.renderCodeContent(tab.content, tab.ext);
        }
      }
    }
    
    this.renderTabs();
  }

  /**
   * 渲染标签栏
   */
  renderTabs() {
    const container = this.elements.fileTabsScroll;
    if (!container) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    container.innerHTML = '';
    
    this.openTabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'file-tab';
      tabEl.dataset.tabId = tab.id;
      tabEl.draggable = true;
      
      if (tab.id === this.activeTabId) tabEl.classList.add('active');
      if (tab.isDirty) tabEl.classList.add('dirty');
      if (tab.externallyModified) tabEl.classList.add('externally-modified');
      
      const icon = this.app?.getFileIcon?.({ name: tab.name, isDirectory: false }) || '📄';
      tabEl.innerHTML = `
        <span class="tab-icon">${icon}</span>
        <span class="tab-name" title="${this.escapeHtml(tab.path)}">${this.escapeHtml(tab.name)}</span>
        <span class="tab-dirty"></span>
        <button class="tab-close" title="${t('common.close') || 'Close'}">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      `;
      
      tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) {
          this.switchToTab(tab.id);
        }
      });
      
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.closeTab(tab.id);
        }
      });
      
      tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
      
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showTabContextMenu(e, tab.id);
      });
      
      // 拖拽排序
      tabEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', tab.id);
        tabEl.classList.add('dragging');
      });
      tabEl.addEventListener('dragend', () => tabEl.classList.remove('dragging'));
      tabEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        tabEl.classList.add('drag-over');
      });
      tabEl.addEventListener('dragleave', () => tabEl.classList.remove('drag-over'));
      tabEl.addEventListener('drop', (e) => {
        e.preventDefault();
        tabEl.classList.remove('drag-over');
        this.reorderTabs(e.dataTransfer.getData('text/plain'), tab.id);
      });
      
      container.appendChild(tabEl);
    });
    
    const activeTab = container.querySelector('.file-tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * 重新排序标签
   */
  reorderTabs(draggedTabId, targetTabId) {
    if (draggedTabId === targetTabId) return;
    
    const draggedIndex = this.openTabs.findIndex(tab => tab.id === draggedTabId);
    const targetIndex = this.openTabs.findIndex(tab => tab.id === targetTabId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const [draggedTab] = this.openTabs.splice(draggedIndex, 1);
    this.openTabs.splice(targetIndex, 0, draggedTab);
    
    this.renderTabs();
  }

  /**
   * 显示标签右键菜单
   */
  showTabContextMenu(e, tabId) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    const existingMenu = document.querySelector('.tab-context-menu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.innerHTML = `
      <div class="tab-context-menu-item" data-action="close">${t('common.close') || 'Close'}</div>
      <div class="tab-context-menu-item" data-action="close-others">${t('tabs.closeOthers') || 'Close Others'}</div>
      <div class="tab-context-menu-item" data-action="close-right">${t('tabs.closeToRight') || 'Close to the Right'}</div>
      <div class="tab-context-menu-divider"></div>
      <div class="tab-context-menu-item" data-action="close-all">${t('tabs.closeAll') || 'Close All'}</div>
    `;
    
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    
    document.body.appendChild(menu);
    
    menu.addEventListener('click', (ev) => {
      const action = ev.target.dataset.action;
      if (!action) return;
      
      switch (action) {
        case 'close': this.closeTab(tabId); break;
        case 'close-others': this.closeOtherTabs(tabId); break;
        case 'close-right': this.closeTabsToRight(tabId); break;
        case 'close-all': this.closeAllTabs(); break;
      }
      
      menu.remove();
    });
    
    const closeMenu = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  closeOtherTabs(keepTabId) {
    this.openTabs.filter(tab => tab.id !== keepTabId).forEach(tab => this.closeTab(tab.id, false));
  }

  closeTabsToRight(tabId) {
    const index = this.openTabs.findIndex(tab => tab.id === tabId);
    if (index === -1) return;
    this.openTabs.slice(index + 1).reverse().forEach(tab => this.closeTab(tab.id, false));
  }

  closeAllTabs() {
    [...this.openTabs].reverse().forEach(tab => this.closeTab(tab.id, false));
  }

  updateCurrentTabDirty() {
    if (!this.activeTabId) return;
    const tab = this.findTabById(this.activeTabId);
    if (tab) {
      tab.isDirty = this.filePreviewUnsaved;
      this.renderTabs();
    }
  }

  // ============ 视图和编辑 ============

  toggleFileEdit(editing) {
    this.isFileEditing = editing;
    
    if (editing) {
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
      if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
      if (this.elements.fileEditArea) {
        this.elements.fileEditArea.style.display = 'block';
        this.elements.fileEditArea.value = this.previewedFileContent || '';
        this.elements.fileEditArea.focus();
      }
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
      if (this.elements.previewSaveBtn) this.elements.previewSaveBtn.style.display = 'inline-block';
      if (this.elements.previewCancelBtn) this.elements.previewCancelBtn.style.display = 'inline-block';
      if (this.elements.previewViewToggle) this.elements.previewViewToggle.style.display = 'none';
    } else {
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'block';
      if (this.elements.fileEditArea) this.elements.fileEditArea.style.display = 'none';
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'inline-block';
      if (this.elements.previewSaveBtn) this.elements.previewSaveBtn.style.display = 'none';
      if (this.elements.previewCancelBtn) this.elements.previewCancelBtn.style.display = 'none';
      if (this.elements.previewUnsaved) this.elements.previewUnsaved.style.display = 'none';
      this.filePreviewUnsaved = false;
      
      const ext = this.filePreviewPath?.split('.').pop()?.toLowerCase() || '';
      const renderableExts = ['html', 'htm', 'md'];
      if (this.elements.previewViewToggle && renderableExts.includes(ext)) {
        this.elements.previewViewToggle.style.display = 'inline-flex';
      }
      
      this.previewViewMode = 'source';
      if (this.elements.previewSourceBtn) this.elements.previewSourceBtn.classList.add('active');
      if (this.elements.previewRenderBtn) this.elements.previewRenderBtn.classList.remove('active');
      if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
    }
  }

  restoreContentFromTab() {
    if (this.activeTabId) {
      const tab = this.findTabById(this.activeTabId);
      if (tab) {
        this.previewedFileContent = tab.content;
        this.filePreviewUnsaved = false;
        tab.isDirty = false;
        this.renderTabs();
      }
    }
  }

  switchToSplitView() {
    if (this.viewMode === 'split') return;
    
    this.viewMode = 'split';
    
    // 显示文件预览容器，隐藏 Three.js 背景
    if (this.elements.filePreviewContainer) {
      this.elements.filePreviewContainer.style.display = 'flex';
    }
    if (this.elements.previewThreejsBg) {
      this.elements.previewThreejsBg.style.display = 'none';
    }
    if (this.previewBackground) {
      this.previewBackground.stop();
    }
    
    this.applySplitWidth();
  }

  switchToListView() {
    if (this.viewMode === 'list') return;
    
    this.viewMode = 'list';
    
    // 隐藏文件预览容器，显示 Three.js 背景
    if (this.elements.filePreviewContainer) {
      this.elements.filePreviewContainer.style.display = 'none';
    }
    if (this.elements.previewThreejsBg) {
      this.elements.previewThreejsBg.style.display = 'block';
    }
    if (this.previewBackground) {
      this.previewBackground.start();
    }
  }

  applySplitWidth() {
    const listPane = this.elements.filesListPane || this.app?.filesListPane;
    const previewPane = this.elements.filePreviewPane || this.app?.filePreviewPane;
    if (!listPane || !previewPane) return;

    const container = this.elements.filesSplitContainer || this.app?.filesSplitContainer;
    const containerWidth = container?.offsetWidth || 800;
    const maxWidth = Math.floor(containerWidth * 0.5);
    const width = Math.max(200, Math.min(maxWidth, this.splitWidth));
    
    listPane.style.flex = `0 0 ${width}px`;
  }

  initResizer() {
    const resizer = this.elements.filesResizer || this.app?.filesResizer;
    const container = this.elements.filesSplitContainer || this.app?.filesSplitContainer;
    if (!resizer || !container) return;
    
    let startX = 0;
    let startWidth = 0;
    
    const onMouseDown = (e) => {
      e.preventDefault();
      this.isResizing = true;
      const listPane = this.elements.filesListPane || this.app?.filesListPane;
      startX = e.clientX;
      startWidth = listPane?.offsetWidth || 0;
      
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = (e) => {
      if (!this.isResizing) return;
      
      const delta = e.clientX - startX;
      let newWidth = startWidth + delta;
      
      const containerWidth = container.offsetWidth;
      const minWidth = 200;
      const maxWidth = Math.floor(containerWidth * 0.5);
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      this.splitWidth = newWidth;
      this.applySplitWidth();
    };
    
    const onMouseUp = () => {
      this.isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      localStorage.setItem('files-split-width', this.splitWidth.toString());
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    resizer.addEventListener('mousedown', onMouseDown);
  }

  togglePreviewView(mode) {
    if (this.previewViewMode === mode) return;
    
    this.previewViewMode = mode;
    
    if (this.elements.previewSourceBtn) {
      this.elements.previewSourceBtn.classList.toggle('active', mode === 'source');
    }
    if (this.elements.previewRenderBtn) {
      this.elements.previewRenderBtn.classList.toggle('active', mode === 'rendered');
    }
    
    if (mode === 'source') {
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'block';
      if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
      if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'inline-block';
      
      // 渲染源码内容
      if (this.previewedFileContent && this.filePreviewPath) {
        const ext = this.filePreviewPath.split('.').pop()?.toLowerCase() || '';
        this.renderCodeContent(this.previewedFileContent, ext);
      }
    } else {
      if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
      if (this.elements.fileEditArea) this.elements.fileEditArea.style.display = 'none';
      if (this.elements.previewEditBtn) this.elements.previewEditBtn.style.display = 'none';
      if (this.elements.previewSaveBtn) this.elements.previewSaveBtn.style.display = 'none';
      if (this.elements.previewCancelBtn) this.elements.previewCancelBtn.style.display = 'none';
      
      if (this.previewFileType === 'markdown') {
        if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
        this.renderMarkdownPreview(this.previewedFileContent);
      } else {
        if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
        this.renderHtmlPreview(this.previewedFileContent);
      }
    }
  }

  // ============ 渲染方法 ============

  renderCodeContent(content, ext) {
    const codeEl = this.elements.filePreviewCode;
    if (!codeEl) return;
    
    const escaped = this.escapeHtml(content || '');
    
    if (typeof hljs !== 'undefined' && ext) {
      try {
        const langMap = {
          'js': 'javascript', 'ts': 'typescript', 'jsx': 'javascript', 'tsx': 'typescript',
          'py': 'python', 'rb': 'ruby', 'rs': 'rust', 'sh': 'bash', 'bash': 'bash',
          'yml': 'yaml', 'md': 'markdown', 'conf': 'ini'
        };
        const lang = langMap[ext] || ext;
        
        if (hljs.getLanguage(lang)) {
          const highlighted = hljs.highlight(content || '', { language: lang }).value;
          codeEl.innerHTML = `<code class="hljs">${highlighted}</code>`;
        } else {
          codeEl.innerHTML = `<code>${escaped}</code>`;
        }
      } catch (e) {
        codeEl.innerHTML = `<code>${escaped}</code>`;
      }
    } else {
      codeEl.innerHTML = `<code>${escaped}</code>`;
    }
  }

  renderHtmlPreview(htmlContent) {
    const iframe = this.elements.filePreviewIframe;
    if (!iframe) {
      console.warn('[ExplorerModule] renderHtmlPreview: iframe element not found');
      return;
    }

    if (this._previewBlobUrl) {
      URL.revokeObjectURL(this._previewBlobUrl);
      this._previewBlobUrl = null;
    }

    if (this.filePreviewPath) {
      // 检测运行环境：仅通过 _isPolyfill 标记判断是否为 Web 模式
      // 注意：window.apiAdapter 在 Electron 和 Web 模式下都会存在，不能用于判断
      const isWebMode = window.appBridge?._isPolyfill === true;
      
      console.log('[ExplorerModule] renderHtmlPreview:', {
        filePath: this.filePreviewPath,
        isWebMode,
        baseUrl: window.apiAdapter?._baseUrl
      });
      
      if (isWebMode) {
        // Web 模式：使用 HTTP 代理服务文件
        // 这样可以正确加载相对路径的 CSS、JS、图片等资源
        const baseUrl = window.apiAdapter?._baseUrl || 'http://localhost:3333';
        const filePath = this.filePreviewPath.replace(/\\/g, '/');
        const serveUrl = `${baseUrl}/api/files/serve?path=${encodeURIComponent(filePath)}`;
        
        console.log('[ExplorerModule] Using serve URL:', serveUrl);
        iframe.src = serveUrl;
        iframe.style.display = 'block';
        return;
      } else {
        // Electron 模式：使用 file:// 协议
        const filePath = this.filePreviewPath.replace(/\\/g, '/');
        const fileUrl = filePath.match(/^[a-zA-Z]:/) 
          ? `file:///${filePath}` 
          : `file://${filePath}`;
        
        console.log('[ExplorerModule] Using file:// URL:', fileUrl);
        iframe.src = fileUrl;
        iframe.style.display = 'block';
        return;
      }
    }

    // 如果只有内容没有文件路径，使用 srcdoc
    if (htmlContent) {
      console.log('[ExplorerModule] Using srcdoc for preview');
      iframe.srcdoc = htmlContent;
      iframe.style.display = 'block';
    }
  }

  renderMarkdownPreview(markdownContent) {
    const container = this.elements.markdownPreview;
    if (!container) return;

    if (typeof marked === 'undefined') {
      container.innerHTML = '<p style="color: var(--muted-foreground);">Markdown preview not available</p>';
      container.style.display = 'block';
      return;
    }

    try {
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false
      });

      const htmlContent = marked.parse(markdownContent || '');
      
      let renderedHtml = htmlContent;
      if (typeof hljs !== 'undefined') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        tempDiv.querySelectorAll('pre code').forEach((block) => {
          try {
            hljs.highlightElement(block);
          } catch (e) {
            console.warn('[ExplorerModule] Failed to highlight code block:', e);
          }
        });
        
        renderedHtml = tempDiv.innerHTML;
      }
      
      container.innerHTML = renderedHtml;
      container.style.display = 'block';
    } catch (error) {
      console.error('[ExplorerModule] Failed to render Markdown:', error);
      container.innerHTML = `<p style="color: var(--destructive);">Failed to render Markdown: ${this.escapeHtml(error.message)}</p>`;
      container.style.display = 'block';
    }
  }

  async renderImagePreview(filePath, ext, fileInfo) {
    const contentEl = this.elements.filePreviewContent;
    if (!contentEl) return;

    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const formatFileSize = this.app?.formatFileSize?.bind(this.app) || ((b) => b + ' bytes');

    // 隐藏其他预览元素
    if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
    if (this.elements.fileEditArea) this.elements.fileEditArea.style.display = 'none';
    if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
    if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
    
    // 移除之前的图片预览容器（如果存在）
    const existingImageContainer = contentEl.querySelector('.image-preview-container');
    if (existingImageContainer) {
      existingImageContainer.remove();
    }

    const container = document.createElement('div');
    container.className = 'image-preview-container';
    container.innerHTML = `
      <div class="image-viewer">
        <div class="image-loading">
          <div class="spinner"></div>
          <span>${t('common.loading')}</span>
        </div>
      </div>
      <div class="image-toolbar">
        <button class="zoom-out-btn" title="${t('explorer.preview.zoomOut') || 'Zoom Out'}">−</button>
        <button class="zoom-in-btn" title="${t('explorer.preview.zoomIn') || 'Zoom In'}">+</button>
        <button class="zoom-fit-btn" title="${t('explorer.preview.fit') || 'Fit'}">⊡</button>
        <button class="zoom-actual-btn" title="${t('explorer.preview.actualSize') || '100%'}">1:1</button>
        <span class="zoom-level">100%</span>
      </div>
      <div class="image-info">
        <span class="image-dimensions">- × -</span>
        <span class="image-size">${fileInfo ? formatFileSize(fileInfo.size) : '-'}</span>
        <span class="image-format">${ext.toUpperCase()}</span>
      </div>
    `;

    // 插入到容器中（不清空原有元素）
    contentEl.appendChild(container);

    const viewer = container.querySelector('.image-viewer');
    const loadingEl = container.querySelector('.image-loading');
    const zoomLevelEl = container.querySelector('.zoom-level');
    const dimensionsEl = container.querySelector('.image-dimensions');

    let scale = 1, translateX = 0, translateY = 0;
    let isDragging = false, dragStartX = 0, dragStartY = 0;
    let imgWidth = 0, imgHeight = 0;

    const img = document.createElement('img');
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // 检测运行环境
    const isWebMode = typeof window.appBridge?._isPolyfill === 'boolean' && 
                      window.appBridge._isPolyfill === true;
    
    let fileUrl;
    if (isWebMode) {
      // Web 模式：使用 HTTP 代理服务文件
      const baseUrl = window.apiAdapter?._baseUrl || 'http://localhost:3333';
      fileUrl = `${baseUrl}/api/files/serve?path=${encodeURIComponent(filePath)}`;
    } else {
      // Electron 模式：使用 file:// 协议
      fileUrl = normalizedPath.match(/^[a-zA-Z]:/) 
        ? `file:///${normalizedPath}` 
        : `file://${normalizedPath}`;
    }
    
    img.onload = () => {
      loadingEl.remove();
      viewer.appendChild(img);
      imgWidth = img.naturalWidth;
      imgHeight = img.naturalHeight;
      dimensionsEl.textContent = `${imgWidth} × ${imgHeight}`;
      
      const containerRect = viewer.getBoundingClientRect();
      const scaleX = (containerRect.width - 40) / imgWidth;
      const scaleY = (containerRect.height - 40) / imgHeight;
      scale = Math.min(scaleX, scaleY, 1);
      centerImage();
      updateTransform();
    };
    
    img.onerror = () => {
      loadingEl.innerHTML = `<span style="color: var(--destructive);">${t('errors.imageLoadFailed') || 'Failed to load image'}</span>`;
    };
    
    img.src = fileUrl;

    const updateTransform = () => {
      img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
    };

    const centerImage = () => {
      const containerRect = viewer.getBoundingClientRect();
      translateX = (containerRect.width - imgWidth * scale) / 2;
      translateY = (containerRect.height - imgHeight * scale) / 2;
    };

    const fitToView = () => {
      const containerRect = viewer.getBoundingClientRect();
      const scaleX = (containerRect.width - 40) / imgWidth;
      const scaleY = (containerRect.height - 40) / imgHeight;
      scale = Math.min(scaleX, scaleY, 1);
      centerImage();
      updateTransform();
    };

    const zoomTo = (newScale) => {
      scale = Math.max(0.1, Math.min(10, newScale));
      centerImage();
      updateTransform();
    };

    viewer.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY > 0 ? 0.9 : 1.1));
    }, { passive: false });

    viewer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX - translateX;
      dragStartY = e.clientY - translateY;
      viewer.classList.add('dragging');
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      translateX = e.clientX - dragStartX;
      translateY = e.clientY - dragStartY;
      updateTransform();
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      viewer.classList.remove('dragging');
    });

    viewer.addEventListener('dblclick', fitToView);

    container.querySelector('.zoom-out-btn')?.addEventListener('click', () => zoomTo(scale * 0.8));
    container.querySelector('.zoom-in-btn')?.addEventListener('click', () => zoomTo(scale * 1.25));
    container.querySelector('.zoom-fit-btn')?.addEventListener('click', fitToView);
    container.querySelector('.zoom-actual-btn')?.addEventListener('click', () => zoomTo(1));
  }

  /**
   * 渲染 PDF 预览
   * @param {string} filePath - 文件路径
   * @param {Object} fileInfo - 文件信息
   */
  async renderPdfPreview(filePath, fileInfo) {
    const contentEl = this.elements.filePreviewContent;
    if (!contentEl) return;

    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const formatFileSize = this.app?.formatFileSize?.bind(this.app) || ((b) => b + ' bytes');

    // 隐藏其他预览元素
    if (this.elements.filePreviewCode) this.elements.filePreviewCode.style.display = 'none';
    if (this.elements.fileEditArea) this.elements.fileEditArea.style.display = 'none';
    if (this.elements.filePreviewIframe) this.elements.filePreviewIframe.style.display = 'none';
    if (this.elements.markdownPreview) this.elements.markdownPreview.style.display = 'none';
    
    // 移除之前的 PDF 预览容器（如果存在）
    const existingPdfContainer = contentEl.querySelector('.pdf-preview-container');
    if (existingPdfContainer) {
      existingPdfContainer.remove();
    }
    
    // 创建 PDF 预览容器
    const container = document.createElement('div');
    container.className = 'pdf-preview-container';
    container.innerHTML = `
      <div class="pdf-viewer">
        <div class="pdf-loading">
          <div class="spinner"></div>
          <span>${t('common.loading')}</span>
        </div>
      </div>
      <div class="pdf-toolbar">
        <button class="pdf-prev-btn" title="${t('explorer.preview.pdfPrev') || 'Previous Page'}">◀</button>
        <span class="pdf-page-info">
          <input type="number" class="pdf-page-input" min="1" value="1">
          <span class="pdf-page-separator">/</span>
          <span class="pdf-total-pages">-</span>
        </span>
        <button class="pdf-next-btn" title="${t('explorer.preview.pdfNext') || 'Next Page'}">▶</button>
        <span class="pdf-toolbar-divider"></span>
        <button class="pdf-zoom-out-btn" title="${t('explorer.preview.zoomOut') || 'Zoom Out'}">−</button>
        <span class="pdf-zoom-level">100%</span>
        <button class="pdf-zoom-in-btn" title="${t('explorer.preview.zoomIn') || 'Zoom In'}">+</button>
        <button class="pdf-zoom-fit-btn" title="${t('explorer.preview.fit') || 'Fit Width'}">↔</button>
      </div>
      <div class="pdf-info">
        <span class="pdf-size">${fileInfo ? formatFileSize(fileInfo.size) : '-'}</span>
        <span class="pdf-format">PDF</span>
      </div>
    `;

    // 插入到容器中（不清空原有元素）
    contentEl.appendChild(container);

    const viewer = container.querySelector('.pdf-viewer');
    const loadingEl = container.querySelector('.pdf-loading');
    const pageInput = container.querySelector('.pdf-page-input');
    const totalPagesEl = container.querySelector('.pdf-total-pages');
    const zoomLevelEl = container.querySelector('.pdf-zoom-level');

    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;
    let scale = 1.0;
    let canvas = null;
    let ctx = null;

    // 检测运行环境
    const isWebMode = window.appBridge?._isPolyfill === true || 
                      (typeof process === 'undefined' || !process.versions?.electron);

    try {
      // 按需加载 PDF.js 库
      if (!window.pdfjsLib) {
        if (typeof window.loadPdfJs === 'function') {
          await window.loadPdfJs();
        } else if (window.pdfjsLibPromise) {
          await window.pdfjsLibPromise;
        }
      }
      
      if (!window.pdfjsLib) {
        throw new Error('PDF.js library not loaded');
      }

      // 获取 PDF 二进制数据
      let pdfData;
      if (isWebMode) {
        // Web 版：通过 API 获取
        console.log('[ExplorerModule] Web mode: Reading PDF binary for:', filePath);
        console.log('[ExplorerModule] appBridge available:', !!window.appBridge);
        console.log('[ExplorerModule] readFileBinary available:', !!window.appBridge?.readFileBinary);
        
        if (!window.appBridge?.readFileBinary) {
          throw new Error('readFileBinary method not available. Make sure ApiAdapter is loaded.');
        }
        
        const result = await window.appBridge.readFileBinary(filePath);
        console.log('[ExplorerModule] readFileBinary result:', result);
        
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to read PDF file');
        }
        
        if (!result.data || !(result.data instanceof Uint8Array)) {
          throw new Error(`Invalid data format. Expected Uint8Array, got: ${typeof result.data}`);
        }
        
        pdfData = result.data;
        console.log('[ExplorerModule] PDF data loaded, size:', pdfData.length);
      } else {
        // Electron 版：通过 IPC 获取
        const result = await window.appBridge?.readFileBinary?.(filePath);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to read PDF file');
        }
        pdfData = result.data;
      }

      // 加载 PDF 文档
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;
      totalPagesEl.textContent = totalPages;
      pageInput.max = totalPages;

      // 移除加载提示
      loadingEl.remove();

      // 创建画布
      canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      ctx = canvas.getContext('2d');
      viewer.appendChild(canvas);

      // 渲染指定页面
      const renderPage = async (pageNum) => {
        if (!pdfDoc || pageNum < 1 || pageNum > totalPages) return;

        currentPage = pageNum;
        pageInput.value = pageNum;

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        await page.render(renderContext).promise;
      };

      // 适应宽度
      const fitWidth = async () => {
        if (!pdfDoc) return;
        const page = await pdfDoc.getPage(currentPage);
        const viewerWidth = viewer.clientWidth - 40;
        const defaultViewport = page.getViewport({ scale: 1 });
        scale = viewerWidth / defaultViewport.width;
        zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
        await renderPage(currentPage);
      };

      // 缩放
      const zoom = async (factor) => {
        scale = Math.max(0.25, Math.min(4, scale * factor));
        zoomLevelEl.textContent = `${Math.round(scale * 100)}%`;
        await renderPage(currentPage);
      };

      // 初始渲染：适应宽度
      await fitWidth();

      // 事件绑定
      container.querySelector('.pdf-prev-btn')?.addEventListener('click', () => {
        if (currentPage > 1) renderPage(currentPage - 1);
      });

      container.querySelector('.pdf-next-btn')?.addEventListener('click', () => {
        if (currentPage < totalPages) renderPage(currentPage + 1);
      });

      pageInput.addEventListener('change', () => {
        const page = parseInt(pageInput.value, 10);
        if (page >= 1 && page <= totalPages) {
          renderPage(page);
        } else {
          pageInput.value = currentPage;
        }
      });

      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          pageInput.blur();
        }
      });

      container.querySelector('.pdf-zoom-out-btn')?.addEventListener('click', () => zoom(0.8));
      container.querySelector('.pdf-zoom-in-btn')?.addEventListener('click', () => zoom(1.25));
      container.querySelector('.pdf-zoom-fit-btn')?.addEventListener('click', fitWidth);

      // 滚轮缩放
      viewer.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          zoom(e.deltaY > 0 ? 0.9 : 1.1);
        }
      }, { passive: false });

      // 键盘导航
      const handleKeydown = (e) => {
        if (document.activeElement === pageInput) return;
        
        switch (e.key) {
          case 'ArrowLeft':
          case 'PageUp':
            if (currentPage > 1) renderPage(currentPage - 1);
            break;
          case 'ArrowRight':
          case 'PageDown':
            if (currentPage < totalPages) renderPage(currentPage + 1);
            break;
          case 'Home':
            renderPage(1);
            break;
          case 'End':
            renderPage(totalPages);
            break;
        }
      };
      
      document.addEventListener('keydown', handleKeydown);
      
      // 清理函数（当预览关闭时移除事件监听）
      this._pdfCleanup = () => {
        document.removeEventListener('keydown', handleKeydown);
        pdfDoc?.destroy();
        pdfDoc = null;
      };

    } catch (error) {
      console.error('[ExplorerModule] Failed to render PDF:', error);
      loadingEl.innerHTML = `
        <span style="color: var(--destructive);">
          ${t('errors.pdfLoadFailed') || 'Failed to load PDF'}: ${this.escapeHtml(error.message)}
        </span>
      `;
    }
  }

  async saveFileContent() {
    if (!this.filePreviewPath || !this.elements.fileEditArea) return;
    
    const content = this.elements.fileEditArea.value;
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      let success = false;
      
      if (this.explorerManager && this.explorerConnected) {
        try {
          const result = await this.explorerManager.saveFile(this.filePreviewPath, content);
          success = result.status === 'success';
        } catch (e) {
          console.warn('[ExplorerModule] HTTP API save failed:', e.message);
        }
      }
      
      if (!success) {
        const result = await window.appBridge?.saveFileContent?.(this.filePreviewPath, content);
        success = result?.success;
        if (!success) {
          throw new Error(result?.error || t('errors.saveFailed'));
        }
      }
      
      this.previewedFileContent = content;
      this.filePreviewUnsaved = false;
      if (this.elements.previewUnsaved) this.elements.previewUnsaved.style.display = 'none';
      
      if (this.activeTabId) {
        const tab = this.findTabById(this.activeTabId);
        if (tab) {
          tab.content = content;
          tab.isDirty = false;
          this.renderTabs();
        }
      }
      
      this.toggleFileEdit(false);
      const ext = this.filePreviewPath?.split('.').pop()?.toLowerCase() || '';
      this.renderCodeContent(content, ext);
      
      console.log('[ExplorerModule] File saved successfully');
      
    } catch (error) {
      console.error('[ExplorerModule] Failed to save file:', error);
      alert(t('errors.saveFailed') + ': ' + error.message);
    }
  }

  // ============ 文件同步方法 ============

  /**
   * 重新加载当前预览的文件内容
   * @param {Object} options 选项
   * @param {boolean} options.force 是否强制重新加载（忽略未保存状态）
   * @returns {Promise<boolean>} 是否成功重新加载
   */
  async reloadCurrentPreview(options = {}) {
    const { force = false } = options;
    
    if (!this.filePreviewPath) {
      console.warn('[ExplorerModule] No file to reload');
      return false;
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 如果有未保存的修改且不是强制重新加载，则不执行
    if (this.filePreviewUnsaved && !force) {
      console.log('[ExplorerModule] File has unsaved changes, skipping reload');
      return false;
    }
    
    try {
      let content = null;
      const ext = this.filePreviewPath.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
      
      // 图片文件单独处理
      if (imageExts.includes(ext)) {
        await this.reloadImagePreview();
        return true;
      }
      
      // 优先使用 Explorer HTTP API
      if (this.explorerManager && this.explorerConnected) {
        try {
          const result = await this.explorerManager.readFile(this.filePreviewPath);
          if (result.status === 'success') {
            content = result.content;
          }
        } catch (e) {
          console.warn('[ExplorerModule] HTTP API read failed:', e.message);
        }
      }
      
      // 回退到 IPC
      if (content === null) {
        const result = await window.appBridge?.readFileContent?.(this.filePreviewPath);
        if (result?.success) {
          content = result.content;
        } else {
          throw new Error(result?.error || t('errors.readFailed'));
        }
      }
      
      // 更新内容
      this.previewedFileContent = content;
      this.filePreviewUnsaved = false;
      
      // 更新当前 tab 的缓存
      if (this.activeTabId) {
        const tab = this.findTabById(this.activeTabId);
        if (tab) {
          tab.content = content;
          tab.isDirty = false;
          tab.externallyModified = false;
          this.renderTabs();
        }
      }
      
      // 隐藏外部修改提示条
      this.hideExternalChangeNotice();
      
      // 根据当前视图模式刷新渲染
      if (this.isFileEditing) {
        // 编辑模式：更新编辑区内容
        if (this.elements.fileEditArea) {
          this.elements.fileEditArea.value = content;
        }
      } else if (this.previewViewMode === 'rendered') {
        // 预览模式
        if (this.previewFileType === 'markdown') {
          this.renderMarkdownPreview(content);
        } else if (this.previewFileType === 'html') {
          this.renderHtmlPreview(content);
        }
      } else {
        // 源码模式
        this.renderCodeContent(content, ext);
      }
      
      // 更新未保存状态显示
      if (this.elements.previewUnsaved) {
        this.elements.previewUnsaved.style.display = 'none';
      }
      
      console.log('[ExplorerModule] File reloaded successfully:', this.filePreviewPath);
      return true;
      
    } catch (error) {
      console.error('[ExplorerModule] Failed to reload file:', error);
      return false;
    }
  }

  /**
   * 重新加载图片预览
   */
  async reloadImagePreview() {
    const contentEl = this.elements.filePreviewContent;
    if (!contentEl || !this.filePreviewPath) return;
    
    const img = contentEl.querySelector('.image-viewer img');
    if (img) {
      // 检测运行环境
      const isWebMode = typeof window.appBridge?._isPolyfill === 'boolean' &&
                        window.appBridge._isPolyfill === true;
      
      let fileUrl;
      if (isWebMode) {
        // Web 模式：使用 HTTP 代理服务文件
        const baseUrl = window.apiAdapter?._baseUrl || 'http://localhost:3333';
        fileUrl = `${baseUrl}/api/files/serve?path=${encodeURIComponent(this.filePreviewPath)}`;
      } else {
        // Electron 模式：使用 file:// 协议
        const normalizedPath = this.filePreviewPath.replace(/\\/g, '/');
        fileUrl = normalizedPath.match(/^[a-zA-Z]:/) 
          ? `file:///${normalizedPath}` 
          : `file://${normalizedPath}`;
      }
      
      // 追加时间戳强制刷新图片
      img.src = `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      console.log('[ExplorerModule] Image reloaded:', this.filePreviewPath);
    }
  }

  /**
   * 重新加载指定标签页的内容
   * @param {string} tabId 标签页 ID
   */
  async reloadTabContent(tabId) {
    const tab = this.findTabById(tabId);
    if (!tab) return false;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      let content = null;
      
      // 优先使用 Explorer HTTP API
      if (this.explorerManager && this.explorerConnected) {
        try {
          const result = await this.explorerManager.readFile(tab.path);
          if (result.status === 'success') {
            content = result.content;
          }
        } catch (e) {
          console.warn('[ExplorerModule] HTTP API read failed:', e.message);
        }
      }
      
      // 回退到 IPC
      if (content === null) {
        const result = await window.appBridge?.readFileContent?.(tab.path);
        if (result?.success) {
          content = result.content;
        } else {
          throw new Error(result?.error || t('errors.readFailed'));
        }
      }
      
      // 更新 tab 缓存
      tab.content = content;
      tab.isDirty = false;
      tab.externallyModified = false;
      
      // 如果是当前活动标签页，也更新显示
      if (tabId === this.activeTabId) {
        this.previewedFileContent = content;
        this.filePreviewUnsaved = false;
      }
      
      this.renderTabs();
      console.log('[ExplorerModule] Tab content reloaded:', tab.path);
      return true;
      
    } catch (error) {
      console.error('[ExplorerModule] Failed to reload tab content:', error);
      return false;
    }
  }

  /**
   * 显示外部修改提示条
   */
  showExternalChangeNotice() {
    let notice = document.getElementById('external-change-notice');
    if (!notice) {
      // 动态创建提示条
      notice = document.createElement('div');
      notice.id = 'external-change-notice';
      notice.className = 'external-change-notice';
      
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      
      notice.innerHTML = `
        <span class="notice-icon">⚠️</span>
        <span class="notice-text">${t('explorer.externalChange.message') || 'File has been modified externally.'}</span>
        <button class="notice-btn reload-btn">${t('explorer.externalChange.reload') || 'Reload'}</button>
        <button class="notice-btn keep-btn">${t('explorer.externalChange.keep') || 'Keep Mine'}</button>
        <button class="notice-btn close-btn">×</button>
      `;
      
      // 插入到预览容器顶部
      const container = this.elements.filePreviewContainer;
      if (container) {
        container.insertBefore(notice, container.firstChild);
      }
      
      // 绑定事件
      notice.querySelector('.reload-btn')?.addEventListener('click', () => {
        this.reloadCurrentPreview({ force: true });
      });
      
      notice.querySelector('.keep-btn')?.addEventListener('click', () => {
        this.hideExternalChangeNotice();
        // 标记用户选择保留本地修改
        if (this.activeTabId) {
          const tab = this.findTabById(this.activeTabId);
          if (tab) {
            tab.externallyModified = false;
          }
        }
      });
      
      notice.querySelector('.close-btn')?.addEventListener('click', () => {
        this.hideExternalChangeNotice();
      });
    }
    
    notice.style.display = 'flex';
    
    // 标记当前 tab
    if (this.activeTabId) {
      const tab = this.findTabById(this.activeTabId);
      if (tab) {
        tab.externallyModified = true;
        this.renderTabs();
      }
    }
  }

  /**
   * 隐藏外部修改提示条
   */
  hideExternalChangeNotice() {
    const notice = document.getElementById('external-change-notice');
    if (notice) {
      notice.style.display = 'none';
    }
  }

  /**
   * 清理预览内容（用于标签页切换时清理之前的内容）
   */
  cleanupPreviewContent() {
    // 清理 PDF 预览资源
    if (this._pdfCleanup) {
      this._pdfCleanup();
      this._pdfCleanup = null;
    }
    
    // 清理 PDF/Image 预览容器
    const contentEl = this.elements.filePreviewContent;
    if (contentEl) {
      const pdfContainer = contentEl.querySelector('.pdf-preview-container');
      if (pdfContainer) {
        pdfContainer.remove();
      }
      const imageContainer = contentEl.querySelector('.image-preview-container');
      if (imageContainer) {
        imageContainer.remove();
      }
    }
    
    // 清理 Blob URL
    if (this._previewBlobUrl) {
      URL.revokeObjectURL(this._previewBlobUrl);
      this._previewBlobUrl = null;
    }
    
    // 隐藏 iframe
    if (this.elements.filePreviewIframe) {
      this.elements.filePreviewIframe.src = 'about:blank';
      this.elements.filePreviewIframe.style.display = 'none';
    }
    
    // 隐藏 markdown 预览
    if (this.elements.markdownPreview) {
      this.elements.markdownPreview.style.display = 'none';
    }
  }

  // ============ 工具方法 ============

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 获取模块状态
   */
  isConnected() {
    return this.explorerConnected;
  }

  getOpenTabs() {
    return [...this.openTabs];
  }

  getActiveTabId() {
    return this.activeTabId;
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.ExplorerModule = ExplorerModule;
}
