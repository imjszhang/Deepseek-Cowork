/**
 * FilesPanel - 文件面板模块
 * 管理文件列表、目录导航和文件操作
 * 
 * @created 2026-01-16
 * @module panels/FilesPanel
 */

class FilesPanel {
  /**
   * 构造函数
   * @param {Object} app 主应用实例引用
   */
  constructor(app) {
    this.app = app;
    
    // 路径状态
    this.workspaceRoot = null;
    this.currentPath = '';
    this.pathHistory = [];
    
    // 选中状态
    this.selectedItem = null;
    this.contextMenuTarget = null;
    
    // 目录树展开状态
    this.expandedDirs = new Set();       // 已展开的目录路径集合
    this.childrenCache = new Map();       // 子目录内容缓存 Map<dirPath, Array<item>>
    
    // DOM 元素
    this.elements = {};
    
    // 文件图标映射
    this.fileIconMap = {
      // 文件夹
      'folder': '📁',
      // 编程语言
      'js': '📜', 'jsx': '📜', 'ts': '📜', 'tsx': '📜',
      'py': '🐍', 'pyw': '🐍',
      'java': '☕', 'class': '☕', 'jar': '☕',
      'c': '⚙️', 'cpp': '⚙️', 'h': '⚙️', 'hpp': '⚙️',
      'cs': '🔷', 'vb': '🔷',
      'go': '🐹', 'rs': '🦀', 'rb': '💎', 'php': '🐘',
      'swift': '🍎', 'kt': '🟣', 'kts': '🟣',
      'scala': '🔴', 'clj': '🟢', 'ex': '💜', 'exs': '💜',
      'lua': '🌙', 'r': '📊', 'jl': '📐',
      // Web
      'html': '🌐', 'htm': '🌐',
      'css': '🎨', 'scss': '🎨', 'sass': '🎨', 'less': '🎨',
      'vue': '💚', 'svelte': '🧡', 'astro': '🚀',
      // 数据/配置
      'json': '📋', 'yaml': '📋', 'yml': '📋', 'toml': '📋',
      'xml': '📄', 'ini': '⚙️', 'conf': '⚙️', 'cfg': '⚙️',
      'env': '🔐', '.env': '🔐',
      // 文档
      'md': '📝', 'markdown': '📝', 'txt': '📄',
      'doc': '📘', 'docx': '📘', 'pdf': '📕',
      'xls': '📗', 'xlsx': '📗', 'csv': '📗',
      'ppt': '📙', 'pptx': '📙',
      // 图片
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
      'svg': '🖼️', 'ico': '🖼️', 'webp': '🖼️', 'bmp': '🖼️',
      // 音视频
      'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
      'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬', 'webm': '🎬',
      // 压缩包
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
      // Shell/脚本
      'sh': '💻', 'bash': '💻', 'zsh': '💻', 'fish': '💻',
      'bat': '💻', 'cmd': '💻', 'ps1': '💻',
      // 数据库
      'sql': '🗃️', 'db': '🗃️', 'sqlite': '🗃️',
      // 其他
      'log': '📋', 'lock': '🔒', 'gitignore': '🔧', '.gitignore': '🔧',
      'npmrc': '📦', '.npmrc': '📦', 'license': '📜',
      'default': '📄'
    };
  }

  /**
   * 初始化面板
   */
  async init() {
    // 只在首次初始化时绑定元素和事件
    if (!this._initialized) {
      this.bindElements();
      this.bindEvents();
      this._initialized = true;
    }
    
    // 重置路径历史
    this.pathHistory = [];
    
    // 重置目录展开状态
    this.expandedDirs.clear();
    this.childrenCache.clear();
    
    // 获取工作区根目录
    try {
      const settings = await window.appBridge?.getAllHappySettings?.();
      if (settings?.workspaceDir) {
        this.workspaceRoot = settings.workspaceDir;
        this.currentPath = this.workspaceRoot;
      } else if (settings?.defaultWorkspaceDir) {
        this.workspaceRoot = settings.defaultWorkspaceDir;
        this.currentPath = this.workspaceRoot;
      }
      console.log('[FilesPanel] Workspace root:', this.workspaceRoot);
    } catch (error) {
      console.error('[FilesPanel] Failed to get workspace root:', error);
    }
    
    // 加载初始目录
    if (this.workspaceRoot) {
      await this.loadDirectory(this.currentPath);
    }
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 文件列表相关
      filesList: document.getElementById('files-list'),
      filesLoading: document.getElementById('files-loading'),
      noFilesMessage: document.getElementById('no-files-message'),
      filesError: document.getElementById('files-error'),
      filesErrorMessage: document.getElementById('files-error-message'),
      filesBreadcrumb: document.getElementById('files-breadcrumb'),
      filesBackBtn: document.getElementById('files-back-btn'),
      filesRefreshBtn: document.getElementById('files-refresh-btn'),
      filesNewFolderBtn: document.getElementById('files-newfolder-btn'),
      fileContextMenu: document.getElementById('file-context-menu'),
      emptyAreaContextMenu: document.getElementById('empty-area-context-menu'),
      filesContainer: document.getElementById('files-container'),
      // 新建文件夹对话框
      newFolderDialog: document.getElementById('new-folder-dialog'),
      newFolderNameInput: document.getElementById('new-folder-name'),
      newFolderError: document.getElementById('new-folder-error'),
      newFolderCreateBtn: document.getElementById('new-folder-create-btn'),
      newFolderCancelBtn: document.getElementById('new-folder-cancel-btn'),
      newFolderCancelBtn2: document.getElementById('new-folder-cancel-btn2'),
      // 新建文件对话框
      newFileDialog: document.getElementById('new-file-dialog'),
      newFileNameInput: document.getElementById('new-file-name'),
      newFileError: document.getElementById('new-file-error'),
      newFileCreateBtn: document.getElementById('new-file-create-btn'),
      newFileCancelBtn: document.getElementById('new-file-cancel-btn'),
      newFileCancelBtn2: document.getElementById('new-file-cancel-btn2'),
      // 重命名对话框
      renameDialog: document.getElementById('rename-dialog'),
      renameInput: document.getElementById('rename-input'),
      renameError: document.getElementById('rename-error'),
      renameConfirmBtn: document.getElementById('rename-confirm-btn'),
      renameCancelBtn: document.getElementById('rename-cancel-btn'),
      renameCancelBtn2: document.getElementById('rename-cancel-btn2')
    };
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 导航按钮
    this.elements.filesBackBtn?.addEventListener('click', () => this.navigateBack());
    this.elements.filesRefreshBtn?.addEventListener('click', () => this.refresh());
    this.elements.filesNewFolderBtn?.addEventListener('click', () => this.showNewFolderDialog());
    
    // Electron 环境下监听 IPC 文件变化事件（用于实时更新文件列表）
    this.setupFileChangeListener();
    
    // 新建文件夹对话框
    this.elements.newFolderCreateBtn?.addEventListener('click', () => this.createNewFolder());
    this.elements.newFolderCancelBtn?.addEventListener('click', () => this.hideNewFolderDialog());
    this.elements.newFolderCancelBtn2?.addEventListener('click', () => this.hideNewFolderDialog());
    this.elements.newFolderNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.createNewFolder();
      } else if (e.key === 'Escape') {
        this.hideNewFolderDialog();
      }
    });
    
    // 新建文件对话框
    this.elements.newFileCreateBtn?.addEventListener('click', () => this.createNewFile());
    this.elements.newFileCancelBtn?.addEventListener('click', () => this.hideNewFileDialog());
    this.elements.newFileCancelBtn2?.addEventListener('click', () => this.hideNewFileDialog());
    this.elements.newFileNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.createNewFile();
      } else if (e.key === 'Escape') {
        this.hideNewFileDialog();
      }
    });
    
    // 重命名对话框
    this.elements.renameConfirmBtn?.addEventListener('click', () => this.confirmRename());
    this.elements.renameCancelBtn?.addEventListener('click', () => this.hideRenameDialog());
    this.elements.renameCancelBtn2?.addEventListener('click', () => this.hideRenameDialog());
    this.elements.renameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmRename();
      } else if (e.key === 'Escape') {
        this.hideRenameDialog();
      }
    });
    
    // 文件项右键菜单
    this.elements.fileContextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleContextMenuAction(action);
      });
    });
    
    // 空白区域右键菜单
    this.elements.emptyAreaContextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleEmptyAreaContextMenuAction(action);
      });
    });
    
    // 文件列表容器右键事件（空白区域）
    this.elements.filesContainer?.addEventListener('contextmenu', (e) => {
      // 检查是否点击在文件项上
      const fileItem = e.target.closest('.file-item');
      if (!fileItem) {
        // 点击在空白区域
        e.preventDefault();
        e.stopPropagation();
        this.handleEmptyAreaContextMenu(e);
      }
    });
    
    // 点击空白处关闭右键菜单
    document.addEventListener('click', (e) => {
      if (this.elements.fileContextMenu && !this.elements.fileContextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
      if (this.elements.emptyAreaContextMenu && !this.elements.emptyAreaContextMenu.contains(e.target)) {
        this.hideEmptyAreaContextMenu();
      }
    });
  }

  /**
   * 设置 Electron IPC 文件变化事件监听
   * 仅在 Electron 环境下生效，用于实时更新文件列表
   */
  setupFileChangeListener() {
    // 检测是否为 Electron 环境（非 polyfill 模式）
    const isElectron = window.appBridge &&
                       typeof window.appBridge.onFileChanged === 'function';
    
    if (!isElectron) {
      console.log('[FilesPanel] Not in Electron mode, skipping IPC file change listener');
      return;
    }
    
    console.log('[FilesPanel] Setting up Electron IPC file change listener');
    
    // 防抖定时器
    this._fileChangeDebounceTimer = null;
    
    // 监听文件变化事件
    this._unsubscribeFileChanged = window.appBridge.onFileChanged((data) => {
      console.log('[FilesPanel] Received file change event:', data);
      
      // 使用防抖避免频繁刷新
      if (this._fileChangeDebounceTimer) {
        clearTimeout(this._fileChangeDebounceTimer);
      }
      
      this._fileChangeDebounceTimer = setTimeout(() => {
        this.handleFileChangeEvent(data);
      }, 300);
    });
    
    console.log('[FilesPanel] File change listener registered');
  }

  /**
   * 处理文件变化事件
   * @param {Object} data 事件数据 { type, path, oldPath?, isDirectory?, timestamp }
   */
  handleFileChangeEvent(data) {
    const { type, path: changedPath } = data;
    
    console.log('[FilesPanel] Processing file change:', type, changedPath);
    
    // 检查变化的文件是否在当前目录下
    if (!this.currentPath || !changedPath) {
      console.log('[FilesPanel] No current path or changed path, refreshing anyway');
      this.refresh();
      return;
    }
    
    // 标准化路径分隔符进行比较
    const normalizedCurrentPath = this.currentPath.replace(/\\/g, '/').toLowerCase();
    const normalizedChangedPath = changedPath.replace(/\\/g, '/').toLowerCase();
    
    // 获取变化文件的父目录
    const changedDir = normalizedChangedPath.substring(0, normalizedChangedPath.lastIndexOf('/'));
    
    // 判断变化是否发生在当前目录或其父目录
    const isInCurrentDir = normalizedChangedPath.startsWith(normalizedCurrentPath + '/') ||
                           changedDir === normalizedCurrentPath ||
                           normalizedCurrentPath.startsWith(changedDir);
    
    // 对于新增、删除、重命名操作，且发生在当前目录，刷新列表
    if (['add', 'addDir', 'unlink', 'unlinkDir', 'rename'].includes(type)) {
      if (isInCurrentDir || changedDir === normalizedCurrentPath) {
        console.log('[FilesPanel] Change in current directory, refreshing');
        this.refresh();
      } else {
        console.log('[FilesPanel] Change not in current directory, skipping refresh');
      }
    }
  }

  /**
   * 加载目录内容
   * @param {string} dirPath 目录路径
   */
  async loadDirectory(dirPath) {
    console.log('[FilesPanel] Loading directory:', dirPath);
    
    if (!dirPath) {
      console.warn('[FilesPanel] No directory path provided');
      this.showError('No directory path provided');
      return;
    }
    
    this.showLoading();
    
    try {
      if (!window.appBridge || !window.appBridge.listDirectory) {
        throw new Error('appBridge.listDirectory is not available');
      }
      
      const result = await window.appBridge.listDirectory(dirPath);
      
      if (!result) {
        throw new Error('No result returned from listDirectory');
      }
      
      if (result.success) {
        this.currentPath = result.path || dirPath;
        this.workspaceRoot = result.workspaceRoot || this.workspaceRoot;
        
        console.log('[FilesPanel] Directory loaded successfully:', {
          path: this.currentPath,
          workspaceRoot: this.workspaceRoot,
          relativePath: result.relativePath,
          itemCount: result.items?.length || 0
        });
        
        // 更新返回按钮状态
        this.updateBackButtonState();
        
        // 渲染面包屑（确保传递正确的relativePath）
        const relativePath = result.relativePath !== undefined ? result.relativePath : 
                           (this.currentPath && this.workspaceRoot ? 
                            this.currentPath.replace(this.workspaceRoot, '').replace(/^[\/\\]+/, '') : 
                            '');
        this.renderBreadcrumb(relativePath);
        
        // 渲染文件列表
        this.renderFileList(result.items || []);
        
        console.log('[FilesPanel] Loaded', result.items?.length || 0, 'items');
      } else {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        const errorMessage = result?.error || t('errors.loadFailed') || 'Failed to load directory';
        console.error('[FilesPanel] Failed to load directory:', errorMessage);
        this.showError(errorMessage);
      }
    } catch (error) {
      console.error('[FilesPanel] Error loading directory:', error);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.showError(error.message || t('errors.loadFailed') || 'Failed to load directory');
    }
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    if (this.elements.filesList) this.elements.filesList.innerHTML = '';
    if (this.elements.filesLoading) this.elements.filesLoading.style.display = 'flex';
    if (this.elements.noFilesMessage) this.elements.noFilesMessage.style.display = 'none';
    if (this.elements.filesError) this.elements.filesError.style.display = 'none';
  }

  /**
   * 显示错误信息
   * @param {string} message 错误消息
   */
  showError(message) {
    if (this.elements.filesLoading) this.elements.filesLoading.style.display = 'none';
    if (this.elements.noFilesMessage) this.elements.noFilesMessage.style.display = 'none';
    if (this.elements.filesError) this.elements.filesError.style.display = 'flex';
    if (this.elements.filesErrorMessage) this.elements.filesErrorMessage.textContent = message;
  }

  /**
   * 渲染面包屑导航（简洁三段式）
   * 结构：[~] / [上一级目录] / [当前目录]
   * @param {string} relativePath 相对于工作目录的路径
   */
  renderBreadcrumb(relativePath) {
    if (!this.elements.filesBreadcrumb) {
      console.warn('[FilesPanel] Breadcrumb container not found');
      return;
    }
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 清空容器
    this.elements.filesBreadcrumb.innerHTML = '';
    
    // 解析路径段
    const normalizedRelativePath = (relativePath || '').trim();
    const segments = normalizedRelativePath.split(/[\/\\]/).filter(s => s && s.trim());
    const isAtRoot = segments.length === 0;
    
    console.log('[FilesPanel] renderBreadcrumb:', {
      relativePath,
      segments,
      isAtRoot,
      currentPath: this.currentPath,
      workspaceRoot: this.workspaceRoot
    });
    
    // 1. 根目录按钮（始终显示）
    const rootBtn = document.createElement('button');
    rootBtn.className = 'breadcrumb-item breadcrumb-root';
    rootBtn.title = this.workspaceRoot || t('common.workDir') || 'Working Directory';
    rootBtn.textContent = '~';
    
    if (!isAtRoot && this.workspaceRoot) {
      rootBtn.addEventListener('click', () => {
        console.log('[FilesPanel] Root button clicked, navigating to:', this.workspaceRoot);
        this.navigateTo(this.workspaceRoot);
      });
    } else {
      rootBtn.classList.add('breadcrumb-current');
      rootBtn.style.cursor = 'default';
    }
    
    this.elements.filesBreadcrumb.appendChild(rootBtn);
    
    // 如果在根目录，直接返回
    if (isAtRoot) {
      console.log('[FilesPanel] At root, breadcrumb rendered');
      return;
    }
    
    // 2. 如果有上一级目录（二级及以上），显示上一级目录
    if (segments.length >= 2) {
      // 添加分隔符
      const sep1 = document.createElement('span');
      sep1.className = 'breadcrumb-separator';
      sep1.textContent = '/';
      this.elements.filesBreadcrumb.appendChild(sep1);
      
      // 上一级目录按钮
      const parentName = segments[segments.length - 2];
      const parentBtn = document.createElement('button');
      parentBtn.className = 'breadcrumb-item';
      
      // 计算上一级目录的绝对路径
      const separator = window.platform?.isWindows ? '\\' : '/';
      const parentSegments = segments.slice(0, -1);
      const parentPath = this.workspaceRoot + separator + parentSegments.join(separator);
      
      parentBtn.title = parentPath;
      parentBtn.textContent = parentName;
      parentBtn.addEventListener('click', () => {
        console.log('[FilesPanel] Parent button clicked, navigating to:', parentPath);
        this.navigateTo(parentPath);
      });
      
      this.elements.filesBreadcrumb.appendChild(parentBtn);
    }
    
    // 3. 当前目录（始终显示，不可点击）
    // 添加分隔符
    const sep2 = document.createElement('span');
    sep2.className = 'breadcrumb-separator';
    sep2.textContent = '/';
    this.elements.filesBreadcrumb.appendChild(sep2);
    
    // 当前目录
    const currentName = segments[segments.length - 1];
    const currentBtn = document.createElement('span');
    currentBtn.className = 'breadcrumb-item breadcrumb-current';
    currentBtn.title = this.currentPath || '';
    currentBtn.textContent = currentName;
    
    this.elements.filesBreadcrumb.appendChild(currentBtn);
    
    console.log('[FilesPanel] Breadcrumb rendered:', {
      segments,
      hasParent: segments.length >= 2
    });
  }
  
  /**
   * 导航到上级目录
   */
  navigateUp() {
    console.log('[FilesPanel] navigateUp called:', {
      currentPath: this.currentPath,
      workspaceRoot: this.workspaceRoot
    });
    
    if (!this.currentPath) {
      console.warn('[FilesPanel] No current path, cannot navigate up');
      return;
    }
    
    if (this.currentPath === this.workspaceRoot) {
      console.log('[FilesPanel] Already at root, cannot navigate up');
      return;
    }
    
    try {
      // 获取上级目录路径
      const separator = window.platform?.isWindows ? '\\' : '/';
      const parts = this.currentPath.split(/[\/\\]/).filter(p => p && p.trim());
      
      if (parts.length === 0) {
        console.warn('[FilesPanel] Invalid path, navigating to root');
        this.navigateTo(this.workspaceRoot);
        return;
      }
      
      // 移除最后一个路径段
      parts.pop();
      const parentPath = parts.length > 0 ? parts.join(separator) : this.workspaceRoot;
      
      console.log('[FilesPanel] Calculated parent path:', parentPath);
      
      // 确保父路径不超出工作区根目录
      if (this.workspaceRoot && parentPath && parentPath.length >= this.workspaceRoot.length) {
        // 检查父路径是否以工作区根目录开头
        const normalizedParent = parentPath.replace(/\\/g, '/');
        const normalizedRoot = this.workspaceRoot.replace(/\\/g, '/');
        
        if (normalizedParent.startsWith(normalizedRoot) || normalizedParent === normalizedRoot) {
          this.navigateTo(parentPath);
        } else {
          console.warn('[FilesPanel] Parent path outside workspace, navigating to root');
          this.navigateTo(this.workspaceRoot);
        }
      } else {
        console.log('[FilesPanel] Parent path shorter than root, navigating to root');
        this.navigateTo(this.workspaceRoot);
      }
    } catch (error) {
      console.error('[FilesPanel] Error in navigateUp:', error);
      this.showError(error.message);
    }
  }

  /**
   * 简单的路径拼接
   * @param {string} base 基础路径
   * @param {string} segment 路径段
   * @returns {string} 拼接后的路径
   */
  joinPath(base, segment) {
    const separator = window.platform?.isWindows ? '\\' : '/';
    if (base.endsWith(separator) || base.endsWith('/') || base.endsWith('\\')) {
      return base + segment;
    }
    return base + separator + segment;
  }

  /**
   * 渲染文件列表
   * @param {Array} items 文件列表
   */
  renderFileList(items) {
    if (this.elements.filesLoading) this.elements.filesLoading.style.display = 'none';
    if (this.elements.filesError) this.elements.filesError.style.display = 'none';
    
    if (!items || items.length === 0) {
      if (this.elements.noFilesMessage) this.elements.noFilesMessage.style.display = 'flex';
      if (this.elements.filesList) this.elements.filesList.innerHTML = '';
      return;
    }
    
    if (this.elements.noFilesMessage) this.elements.noFilesMessage.style.display = 'none';
    if (!this.elements.filesList) return;
    
    this.elements.filesList.innerHTML = '';
    
    items.forEach(item => {
      const fileItem = this.createFileItemElement(item, 0);
      this.elements.filesList.appendChild(fileItem);
    });
  }

  /**
   * 切换目录展开/收缩状态
   * @param {string} dirPath 目录路径
   * @param {HTMLElement} toggleElement 展开按钮元素
   * @param {HTMLElement} fileItemElement 文件项元素
   */
  async toggleDirectory(dirPath, toggleElement, fileItemElement) {
    console.log('[FilesPanel] toggleDirectory:', dirPath);
    
    if (this.expandedDirs.has(dirPath)) {
      // 收缩目录
      this.expandedDirs.delete(dirPath);
      toggleElement.classList.remove('expanded');
      fileItemElement.classList.remove('expanded');
      
      // 移除子目录容器
      const childrenContainer = fileItemElement.nextElementSibling;
      if (childrenContainer && childrenContainer.classList.contains('folder-children')) {
        childrenContainer.remove();
      }
    } else {
      // 展开目录
      this.expandedDirs.add(dirPath);
      toggleElement.classList.add('expanded');
      fileItemElement.classList.add('expanded');
      
      // 加载并渲染子目录
      const level = parseInt(fileItemElement.dataset.level || '0', 10);
      await this.loadAndRenderChildren(dirPath, fileItemElement, level + 1);
    }
  }

  /**
   * 加载目录子项
   * @param {string} dirPath 目录路径
   * @returns {Promise<Array>} 子项列表
   */
  async loadChildren(dirPath) {
    // 检查缓存
    if (this.childrenCache.has(dirPath)) {
      console.log('[FilesPanel] loadChildren from cache:', dirPath);
      return this.childrenCache.get(dirPath);
    }
    
    console.log('[FilesPanel] loadChildren from API:', dirPath);
    
    try {
      const result = await window.appBridge.listDirectory(dirPath);
      
      if (result?.success && result.items) {
        // 缓存结果
        this.childrenCache.set(dirPath, result.items);
        return result.items;
      }
      
      return [];
    } catch (error) {
      console.error('[FilesPanel] Failed to load children:', error);
      return [];
    }
  }

  /**
   * 加载并渲染子目录内容
   * @param {string} dirPath 父目录路径
   * @param {HTMLElement} parentElement 父元素
   * @param {number} level 层级深度
   */
  async loadAndRenderChildren(dirPath, parentElement, level) {
    // 显示加载状态
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'folder-children folder-children-loading';
    loadingContainer.innerHTML = '<div class="loading-spinner-small"></div>';
    parentElement.after(loadingContainer);
    
    try {
      const children = await this.loadChildren(dirPath);
      
      // 移除加载状态
      loadingContainer.remove();
      
      if (children.length === 0) {
        // 空目录提示
        const emptyContainer = document.createElement('div');
        emptyContainer.className = 'folder-children folder-children-empty';
        emptyContainer.style.paddingLeft = `${level * 16 + 24}px`;
        emptyContainer.innerHTML = '<span class="empty-folder-hint">（空）</span>';
        parentElement.after(emptyContainer);
        return;
      }
      
      // 渲染子目录内容
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'folder-children';
      childrenContainer.dataset.parentPath = dirPath;
      
      children.forEach(item => {
        const childElement = this.createFileItemElement(item, level);
        childrenContainer.appendChild(childElement);
      });
      
      parentElement.after(childrenContainer);
      
    } catch (error) {
      loadingContainer.remove();
      console.error('[FilesPanel] Failed to render children:', error);
    }
  }

  /**
   * 创建文件项 DOM 元素 - VS Code 紧凑风格
   * @param {Object} item 文件信息
   * @param {number} level 层级深度（默认为0）
   * @returns {HTMLElement} 文件项元素
   */
  createFileItemElement(item, level = 0) {
    const div = document.createElement('div');
    div.className = `file-item ${item.isDirectory ? 'folder' : 'file'}`;
    div.dataset.path = item.path;
    div.dataset.name = item.name;
    div.dataset.isDirectory = item.isDirectory;
    div.dataset.level = level;
    
    // 计算缩进（每层 16px）
    const indent = level * 16;
    
    // 获取图标
    const icon = this.getFileIcon(item);
    
    // 检查目录是否已展开
    const isExpanded = item.isDirectory && this.expandedDirs.has(item.path);
    
    // VS Code 紧凑风格：展开箭头 + 图标 + 文件名
    if (item.isDirectory) {
      div.innerHTML = `
        <div class="folder-toggle${isExpanded ? ' expanded' : ''}" style="margin-left: ${indent}px;">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        </div>
      `;
      
      if (isExpanded) {
        div.classList.add('expanded');
      }
      
      // 绑定展开/收缩按钮事件
      const toggleBtn = div.querySelector('.folder-toggle');
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleDirectory(item.path, toggleBtn, div);
      });
    } else {
      // 文件项：添加与展开箭头相同宽度的占位符以保持对齐
      div.innerHTML = `
        <div class="folder-toggle-placeholder" style="margin-left: ${indent}px;"></div>
        <div class="file-icon">${icon}</div>
        <div class="file-info">
          <div class="file-name" title="${this.escapeHtml(item.name)}">${this.escapeHtml(item.name)}</div>
        </div>
      `;
    }
    
    // 绑定事件（操作通过右键菜单触发）
    div.addEventListener('click', (e) => {
      // 如果点击的是展开按钮，不触发选中
      if (!e.target.closest('.folder-toggle')) {
        this.handleFileClick(e, item);
      }
    });
    div.addEventListener('dblclick', (e) => this.handleFileDoubleClick(e, item));
    div.addEventListener('contextmenu', (e) => this.handleFileContextMenu(e, item));
    
    return div;
  }

  /**
   * 获取文件图标
   * @param {Object} item 文件信息
   * @returns {string} 图标字符
   */
  getFileIcon(item) {
    if (item.isDirectory) {
      return this.fileIconMap['folder'];
    }
    
    // 支持从 extension 属性或文件名中获取扩展名
    let ext = item.extension?.toLowerCase();
    if (!ext && item.name) {
      const parts = item.name.split('.');
      if (parts.length > 1) {
        ext = parts.pop().toLowerCase();
      }
    }
    
    if (ext && this.fileIconMap[ext]) {
      return this.fileIconMap[ext];
    }
    
    // 特殊文件名
    const name = (item.name || '').toLowerCase();
    if (name === '.gitignore' || name === '.env' || name === '.npmrc') {
      return this.fileIconMap[name] || this.fileIconMap['default'];
    }
    
    return this.fileIconMap['default'];
  }

  /**
   * 格式化文件大小
   * @param {number} bytes 字节数
   * @returns {string} 格式化后的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
  }

  /**
   * 格式化文件日期
   * @param {string} isoDate ISO 日期字符串
   * @returns {string} 格式化后的日期
   */
  formatFileDate(isoDate) {
    if (!isoDate) return '';
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }

  /**
   * HTML 转义
   * @param {string} text 文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 处理文件单击
   * @param {Event} e 事件对象
   * @param {Object} item 文件信息
   */
  handleFileClick(e, item) {
    // 清除之前的选中状态
    this.elements.filesList?.querySelectorAll('.file-item').forEach(el => {
      el.classList.remove('selected');
    });
    
    // 选中当前项
    e.currentTarget.classList.add('selected');
    this.selectedItem = item;
  }

  /**
   * 处理文件双击
   * @param {Event} e 事件对象
   * @param {Object} item 文件信息
   */
  handleFileDoubleClick(e, item) {
    e.preventDefault();
    this.openItem(item);
  }

  /**
   * 打开文件项
   * @param {Object} item 文件信息
   */
  async openItem(item) {
    if (item.isDirectory) {
      // 进入目录
      this.pathHistory.push(this.currentPath);
      await this.loadDirectory(item.path);
    } else {
      // 检查是否为可预览的文本文件
      const ext = item.name.split('.').pop()?.toLowerCase() || '';
      const previewableExts = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'less', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'sh', 'bash', 'zsh', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'vue', 'svelte', 'astro', 'log'];
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];
      const pdfExts = ['pdf'];
      
      if (previewableExts.includes(ext) || imageExts.includes(ext) || pdfExts.includes(ext)) {
        // 使用内置预览功能
        await this.app.openFilePreview(item.path);
      } else {
        // 用系统程序打开文件
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        try {
          const result = await window.appBridge?.openFile?.(item.path);
          if (!result?.success) {
            this.showNotification(result?.error || t('notifications.cannotOpenFile'), 'error');
          }
        } catch (error) {
          this.showNotification(t('notifications.openFileFailed') + ': ' + error.message, 'error');
        }
      }
    }
  }

  /**
   * 处理文件右键菜单
   * @param {Event} e 事件对象
   * @param {Object} item 文件信息
   */
  handleFileContextMenu(e, item) {
    e.preventDefault();
    e.stopPropagation();
    
    // 选中当前项
    this.handleFileClick(e, item);
    
    // 保存右键菜单目标
    this.contextMenuTarget = item;
    
    // 显示右键菜单
    this.showContextMenu(e.clientX, e.clientY, item);
  }

  /**
   * 显示文件右键菜单
   * @param {number} x X 坐标
   * @param {number} y Y 坐标
   * @param {Object} item 文件信息
   */
  showContextMenu(x, y, item) {
    if (!this.elements.fileContextMenu) return;
    
    // 更新菜单项显示
    const openItem = this.elements.fileContextMenu.querySelector('[data-action="open"]');
    const openWithItem = this.elements.fileContextMenu.querySelector('[data-action="openWith"]');
    const showInExplorerItem = this.elements.fileContextMenu.querySelector('[data-action="showInExplorer"]');
    
    if (openItem) {
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      // 文件夹显示"打开文件夹"，文件显示"打开"
      openItem.querySelector('span:last-child').textContent = item.isDirectory 
        ? (t('common.openFolder') || '打开文件夹') 
        : (t('files.open') || '打开');
    }
    
    // 在web环境下隐藏"用系统程序打开"和"在文件管理器中显示"菜单项
    // 检测环境：检查是否是web模式（polyfill模式）
    const isWebMode = window.appBridge?._isPolyfill === true ||
                      (typeof process === 'undefined' || !process.versions?.electron);
    
    if (openWithItem) {
      // 找到openWith项后面的分隔线
      const openWithDivider = openWithItem.nextElementSibling;
      if (isWebMode) {
        // Web模式下隐藏菜单项和后面的分隔线
        openWithItem.style.display = 'none';
        if (openWithDivider && openWithDivider.classList.contains('context-menu-divider')) {
          openWithDivider.style.display = 'none';
        }
      } else {
        // Electron模式下根据文件类型显示菜单项
        openWithItem.style.display = item.isDirectory ? 'none' : 'flex';
        if (openWithDivider && openWithDivider.classList.contains('context-menu-divider')) {
          openWithDivider.style.display = 'block';
        }
      }
    }
    
    if (showInExplorerItem) {
      // 找到showInExplorer项后面的分隔线（HTML结构中showInExplorer后面是分隔线）
      const showInExplorerDivider = showInExplorerItem.nextElementSibling;
      if (isWebMode) {
        // Web模式下隐藏菜单项和后面的分隔线
        showInExplorerItem.style.display = 'none';
        if (showInExplorerDivider && showInExplorerDivider.classList.contains('context-menu-divider')) {
          showInExplorerDivider.style.display = 'none';
        }
      } else {
        // Electron模式下显示菜单项和分隔线
        showInExplorerItem.style.display = 'flex';
        if (showInExplorerDivider && showInExplorerDivider.classList.contains('context-menu-divider')) {
          showInExplorerDivider.style.display = 'block';
        }
      }
    }
    
    // 定位菜单
    this.elements.fileContextMenu.style.left = x + 'px';
    this.elements.fileContextMenu.style.top = y + 'px';
    this.elements.fileContextMenu.style.display = 'block';
    
    // 确保菜单不超出屏幕
    const rect = this.elements.fileContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.elements.fileContextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.elements.fileContextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }
  }

  /**
   * 隐藏文件右键菜单
   */
  hideContextMenu() {
    if (this.elements.fileContextMenu) {
      this.elements.fileContextMenu.style.display = 'none';
    }
    this.contextMenuTarget = null;
  }

  /**
   * 处理空白区域右键菜单
   * @param {Event} e 事件对象
   */
  handleEmptyAreaContextMenu(e) {
    // 确保隐藏文件项右键菜单
    this.hideContextMenu();
    
    // 显示空白区域右键菜单
    this.showEmptyAreaContextMenu(e.clientX, e.clientY);
  }

  /**
   * 显示空白区域右键菜单
   * @param {number} x X 坐标
   * @param {number} y Y 坐标
   */
  showEmptyAreaContextMenu(x, y) {
    if (!this.elements.emptyAreaContextMenu) return;
    
    // 定位菜单
    this.elements.emptyAreaContextMenu.style.left = x + 'px';
    this.elements.emptyAreaContextMenu.style.top = y + 'px';
    this.elements.emptyAreaContextMenu.style.display = 'block';
    
    // 确保菜单不超出屏幕
    const rect = this.elements.emptyAreaContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.elements.emptyAreaContextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.elements.emptyAreaContextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }
  }

  /**
   * 隐藏空白区域右键菜单
   */
  hideEmptyAreaContextMenu() {
    if (this.elements.emptyAreaContextMenu) {
      this.elements.emptyAreaContextMenu.style.display = 'none';
    }
  }

  /**
   * 处理空白区域右键菜单动作
   * @param {string} action 动作名称
   */
  handleEmptyAreaContextMenuAction(action) {
    this.hideEmptyAreaContextMenu();
    
    switch (action) {
      case 'newFile':
        this.showNewFileDialog();
        break;
      case 'newFolder':
        this.showNewFolderDialog();
        break;
    }
  }

  /**
   * 处理右键菜单动作
   * @param {string} action 动作名称
   */
  async handleContextMenuAction(action) {
    const item = this.contextMenuTarget;
    this.hideContextMenu();
    
    if (!item) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    switch (action) {
      case 'open':
        this.openItem(item);
        break;
      case 'openWith':
        try {
          await window.appBridge?.openFile?.(item.path);
        } catch (error) {
          this.showNotification(t('notifications.openFailed') + ': ' + error.message, 'error');
        }
        break;
      case 'rename':
        this.showRenameDialog(item);
        break;
      case 'showInExplorer':
        try {
          await window.appBridge?.showInExplorer?.(item.path);
        } catch (error) {
          this.showNotification(t('notifications.operationFailed') + ': ' + error.message, 'error');
        }
        break;
      case 'delete':
        this.deleteItem(item);
        break;
    }
  }

  /**
   * 删除文件项
   * @param {Object} item 文件信息
   */
  async deleteItem(item) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      const result = await window.appBridge?.deleteItem?.(item.path);
      
      if (result?.success) {
        this.showNotification(t('notifications.deleteSuccess'), 'success');
        await this.refresh();
      } else if (result?.cancelled) {
        // 用户取消
      } else {
        this.showNotification(result?.error || t('notifications.deleteFailed'), 'error');
      }
    } catch (error) {
      this.showNotification(t('notifications.deleteFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 导航到指定路径
   * @param {string} path 目标路径
   */
  async navigateTo(path) {
    // 保存历史
    if (this.currentPath !== path) {
      this.pathHistory.push(this.currentPath);
    }
    await this.loadDirectory(path);
  }

  /**
   * 返回上级目录
   */
  async navigateBack() {
    // 优先从历史栈恢复
    if (this.pathHistory.length > 0) {
      const prevPath = this.pathHistory.pop();
      await this.loadDirectory(prevPath);
      return;
    }
    
    // 否则尝试返回上级目录
    if (this.currentPath && this.currentPath !== this.workspaceRoot) {
      // 获取上级目录路径
      const separator = window.platform?.isWindows ? '\\' : '/';
      const parts = this.currentPath.split(/[\/\\]/);
      parts.pop();
      const parentPath = parts.join(separator);
      
      if (parentPath && parentPath.startsWith(this.workspaceRoot)) {
        await this.loadDirectory(parentPath);
      }
    }
  }

  /**
   * 更新返回按钮状态
   * 注意：返回按钮现在是在面包屑中动态创建的，这个方法主要用于兼容性
   * 实际的状态控制由 renderBreadcrumb 方法处理
   */
  updateBackButtonState() {
    // 如果存在独立的返回按钮（旧版本），更新其状态
    if (this.elements.filesBackBtn) {
      const atRoot = this.currentPath === this.workspaceRoot;
      const hasHistory = this.pathHistory.length > 0;
      this.elements.filesBackBtn.disabled = atRoot && !hasHistory;
    }
    
    // 更新面包屑中的返回按钮状态（如果存在）
    const breadcrumbBackBtn = this.elements.filesBreadcrumb?.querySelector('.breadcrumb-back-btn');
    if (breadcrumbBackBtn) {
      const atRoot = this.currentPath === this.workspaceRoot;
      const hasHistory = this.pathHistory.length > 0;
      
      if (atRoot && !hasHistory) {
        breadcrumbBackBtn.disabled = true;
        breadcrumbBackBtn.style.opacity = '0.4';
        breadcrumbBackBtn.style.cursor = 'not-allowed';
      } else {
        breadcrumbBackBtn.disabled = false;
        breadcrumbBackBtn.style.opacity = '1';
        breadcrumbBackBtn.style.cursor = 'pointer';
      }
    }
    
    console.log('[FilesPanel] Back button state updated:', {
      currentPath: this.currentPath,
      workspaceRoot: this.workspaceRoot,
      atRoot: this.currentPath === this.workspaceRoot,
      hasHistory: this.pathHistory.length > 0,
      buttonExists: !!breadcrumbBackBtn
    });
  }

  /**
   * 刷新文件列表
   */
  async refresh() {
    await this.loadDirectory(this.currentPath);
  }

  /**
   * 显示新建文件夹对话框
   */
  showNewFolderDialog() {
    if (!this.elements.newFolderDialog) return;
    
    // 清空输入
    if (this.elements.newFolderNameInput) {
      this.elements.newFolderNameInput.value = '';
    }
    if (this.elements.newFolderError) {
      this.elements.newFolderError.style.display = 'none';
    }
    
    this.elements.newFolderDialog.style.display = 'flex';
    
    // 聚焦输入框
    setTimeout(() => {
      this.elements.newFolderNameInput?.focus();
    }, 100);
  }

  /**
   * 隐藏新建文件夹对话框
   */
  hideNewFolderDialog() {
    if (this.elements.newFolderDialog) {
      this.elements.newFolderDialog.style.display = 'none';
    }
  }

  /**
   * 创建新文件夹
   */
  async createNewFolder() {
    const name = this.elements.newFolderNameInput?.value?.trim();
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (!name) {
      if (this.elements.newFolderError) {
        this.elements.newFolderError.textContent = t('notifications.enterFolderName');
        this.elements.newFolderError.style.display = 'block';
      }
      return;
    }
    
    // 验证名称
    if (/[<>:"/\\|?*]/.test(name)) {
      if (this.elements.newFolderError) {
        this.elements.newFolderError.textContent = t('notifications.invalidFolderName');
        this.elements.newFolderError.style.display = 'block';
      }
      return;
    }
    
    try {
      const folderPath = this.joinPath(this.currentPath, name);
      const result = await window.appBridge?.createFolder?.(folderPath);
      
      if (result?.success) {
        this.hideNewFolderDialog();
        this.showNotification(t('notifications.folderCreated'), 'success');
        await this.refresh();
      } else {
        if (this.elements.newFolderError) {
          this.elements.newFolderError.textContent = result?.error || t('notifications.createFailed');
          this.elements.newFolderError.style.display = 'block';
        }
      }
    } catch (error) {
      if (this.elements.newFolderError) {
        this.elements.newFolderError.textContent = error.message;
        this.elements.newFolderError.style.display = 'block';
      }
    }
  }

  /**
   * 显示新建文件对话框
   */
  showNewFileDialog() {
    if (!this.elements.newFileDialog) return;
    
    // 清空输入
    if (this.elements.newFileNameInput) {
      this.elements.newFileNameInput.value = '';
    }
    if (this.elements.newFileError) {
      this.elements.newFileError.style.display = 'none';
    }
    
    this.elements.newFileDialog.style.display = 'flex';
    
    // 聚焦输入框
    setTimeout(() => {
      this.elements.newFileNameInput?.focus();
    }, 100);
  }

  /**
   * 隐藏新建文件对话框
   */
  hideNewFileDialog() {
    if (this.elements.newFileDialog) {
      this.elements.newFileDialog.style.display = 'none';
    }
  }

  /**
   * 创建新文件
   */
  async createNewFile() {
    const name = this.elements.newFileNameInput?.value?.trim();
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (!name) {
      if (this.elements.newFileError) {
        this.elements.newFileError.textContent = t('notifications.enterFileName') || 'Please enter a file name';
        this.elements.newFileError.style.display = 'block';
      }
      return;
    }
    
    // 验证名称
    if (/[<>:"/\\|?*]/.test(name)) {
      if (this.elements.newFileError) {
        this.elements.newFileError.textContent = t('notifications.invalidFileName') || 'Invalid file name';
        this.elements.newFileError.style.display = 'block';
      }
      return;
    }
    
    try {
      const filePath = this.joinPath(this.currentPath, name);
      // 使用 saveFileContent 创建文件，传入空字符串作为初始内容
      // API期望的参数格式是 { path: filePath, content: content }
      const result = await window.appBridge?.saveFileContent?.({ path: filePath, content: '' });
      
      if (result?.success) {
        this.hideNewFileDialog();
        this.showNotification(t('notifications.fileCreated') || 'File created successfully', 'success');
        await this.refresh();
      } else {
        if (this.elements.newFileError) {
          this.elements.newFileError.textContent = result?.error || t('notifications.createFailed') || 'Failed to create file';
          this.elements.newFileError.style.display = 'block';
        }
      }
    } catch (error) {
      if (this.elements.newFileError) {
        this.elements.newFileError.textContent = error.message;
        this.elements.newFileError.style.display = 'block';
      }
    }
  }

  /**
   * 显示重命名对话框
   * @param {Object} item 文件信息
   */
  showRenameDialog(item) {
    if (!this.elements.renameDialog) return;
    
    // 使用专门的变量保存重命名目标，避免被全局点击事件清除
    this.renameTarget = item;
    this.contextMenuTarget = item;
    
    // 设置当前名称
    if (this.elements.renameInput) {
      this.elements.renameInput.value = item.name;
    }
    if (this.elements.renameError) {
      this.elements.renameError.style.display = 'none';
    }
    
    this.elements.renameDialog.style.display = 'flex';
    
    // 聚焦并选中文件名（不包括扩展名）
    setTimeout(() => {
      if (this.elements.renameInput) {
        this.elements.renameInput.focus();
        // 如果是文件，选中扩展名之前的部分
        if (!item.isDirectory && item.extension) {
          const dotIndex = item.name.lastIndexOf('.');
          if (dotIndex > 0) {
            this.elements.renameInput.setSelectionRange(0, dotIndex);
          } else {
            this.elements.renameInput.select();
          }
        } else {
          this.elements.renameInput.select();
        }
      }
    }, 100);
  }

  /**
   * 隐藏重命名对话框
   */
  hideRenameDialog() {
    if (this.elements.renameDialog) {
      this.elements.renameDialog.style.display = 'none';
    }
    // 清除重命名目标
    this.renameTarget = null;
  }

  /**
   * 确认重命名
   */
  async confirmRename() {
    // 使用 renameTarget 而不是 contextMenuTarget，因为后者可能被全局点击事件清除
    const item = this.renameTarget || this.contextMenuTarget;
    const newName = this.elements.renameInput?.value?.trim();
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (!item || !newName) {
      if (this.elements.renameError) {
        this.elements.renameError.textContent = t('notifications.enterNewName');
        this.elements.renameError.style.display = 'block';
      }
      return;
    }
    
    // 名称没有变化
    if (newName === item.name) {
      this.hideRenameDialog();
      return;
    }
    
    // 验证名称
    if (/[<>:"/\\|?*]/.test(newName)) {
      if (this.elements.renameError) {
        this.elements.renameError.textContent = t('notifications.invalidName');
        this.elements.renameError.style.display = 'block';
      }
      return;
    }
    
    try {
      // 构造新路径
      const separator = window.platform?.isWindows ? '\\' : '/';
      const parts = item.path.split(/[\/\\]/);
      parts.pop();
      const newPath = parts.join(separator) + separator + newName;
      
      const result = await window.appBridge?.renameItem?.(item.path, newPath);
      
      if (result?.success) {
        this.hideRenameDialog();
        this.showNotification(t('notifications.renameSuccess'), 'success');
        await this.refresh();
      } else {
        if (this.elements.renameError) {
          this.elements.renameError.textContent = result?.error || t('notifications.renameFailed');
          this.elements.renameError.style.display = 'block';
        }
      }
    } catch (error) {
      if (this.elements.renameError) {
        this.elements.renameError.textContent = error.message;
        this.elements.renameError.style.display = 'block';
      }
    }
  }

  /**
   * 显示通知（委托给 app）
   * @param {string} message 消息
   * @param {string} type 类型
   */
  showNotification(message, type = 'info') {
    if (this.app?.showNotification) {
      this.app.showNotification(message, type);
    } else {
      console.log(`[FilesPanel] ${type}: ${message}`);
    }
  }

  /**
   * 销毁面板
   */
  destroy() {
    // 清理文件变化事件监听器
    if (this._unsubscribeFileChanged) {
      this._unsubscribeFileChanged();
      this._unsubscribeFileChanged = null;
    }
    
    // 清理防抖定时器
    if (this._fileChangeDebounceTimer) {
      clearTimeout(this._fileChangeDebounceTimer);
      this._fileChangeDebounceTimer = null;
    }
    
    console.log('[FilesPanel] Destroyed');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.FilesPanel = FilesPanel;
}
