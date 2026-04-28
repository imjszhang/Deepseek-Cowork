/**
 * DeepSeek Cowork - 渲染进程应用逻辑
 * 更新时间: 2026-01-16
 * 
 * 模块化重构：
 * Core:
 * - ThemeManager -> core/ThemeManager.js
 * - ModelConfig -> core/ModelConfig.js
 * - WindowController -> core/WindowController.js
 * 
 * Components:
 * - NotificationManager -> components/NotificationManager.js
 * - DialogManager -> components/DialogManager.js
 * - LogViewer -> components/LogViewer.js
 * 
 * Panels:
 * - ChatPanel -> panels/ChatPanel.js
 * - FilesPanel -> panels/FilesPanel.js
 * - SettingsPanel -> panels/SettingsPanel.js
 * 
 * Features:
 * - ExplorerModule -> features/explorer/ExplorerModule.js
 * - ExplorerClient -> features/explorer/services/ExplorerClient.js
 * - ExplorerSSE -> features/explorer/services/ExplorerSSE.js
 * - ExplorerManager -> features/explorer/services/ExplorerManager.js
 * - HappyMessageHandler -> features/happy-ai/HappyMessageHandler.js
 * - ToolCallRenderer -> features/happy-ai/ToolCallRenderer.js
 * - UsageDisplay -> features/happy-ai/UsageDisplay.js
 * - DaemonManager -> features/settings/DaemonManager.js
 * - WorkspaceSettings -> features/settings/WorkspaceSettings.js
 * - ClaudeCodeSettings -> features/settings/ClaudeCodeSettings.js
 * - DependencyChecker -> features/settings/DependencyChecker.js
 * 
 * Wizards:
 * - SetupWizard -> wizards/SetupWizard.js
 * - AccountSetup -> wizards/AccountSetup.js
 */

class DeepSeekCoworkApp {
  constructor() {
    // LogViewer 实例
    this.logViewer = new LogViewer({
      containerSelector: '#logs-list',
      scrollContainerSelector: '#logs-container-inline',
      maxLogs: 500
    });
    
    // 兼容性：保留 logs 引用
    this.logs = this.logViewer.logs;
    this.maxDisplayLogs = 500;
    
    // HappyMessageHandler 实例
    this.happyMessageHandler = new HappyMessageHandler({
      app: this,
      maxDisplayedIds: 500,
      statusTimeoutMs: 120000
    });
    
    // ToolCallRenderer 实例
    this.toolCallRenderer = new ToolCallRenderer({ app: this });
    
    // UsageDisplay 实例
    this.usageDisplay = new UsageDisplay({ app: this });
    
    // 注意：FilePreviewManager 和 TabManager 已被 ExplorerModule 替代，不再单独实例化
    
    // DaemonManager 实例
    this.daemonManager = new DaemonManager({ app: this });
    
    // WorkspaceSettings 实例
    this.workspaceSettings = new WorkspaceSettings({ app: this });
    
    // ClaudeCodeSettings 实例
    this.claudeCodeSettings = new ClaudeCodeSettings({ app: this });
    
    // DependencyChecker 实例
    this.dependencyChecker = new DependencyChecker({ app: this });
    
    // SetupWizard 实例
    this.setupWizard = new SetupWizard({ app: this });
    
    // AccountSetup 实例
    this.accountSetup = new AccountSetup({ app: this });
    
    // SessionHub 实例
    this.sessionHub = new SessionHub({ app: this });
    
    // MobileDrawer 实例（移动版侧边栏抽屉）
    this.mobileDrawer = null; // 延迟初始化，在 init() 中创建
    
    // ChatPanel 实例
    this.chatPanel = new ChatPanel(this);
    
    // ExplorerModule 实例
    this.explorerModule = new ExplorerModule({ app: this });
    
    // FilesPanel 实例
    this.filesPanel = new FilesPanel(this);
    
    // 当前面板（默认对话模式）
    this.currentPanel = 'chat';
    
    // 对话模式下展示区是否展开
    this.displayPanelExpanded = false;
    
    // 展示区显示的内容（默认文件）
    this.activeDisplayContent = 'files';
    
    // 对话模式文件展示区状态
    this.chatShowcaseOpen = false;
    this.showcaseTabs = [];
    this.activeShowcaseTabId = null;
    this.showcaseIsEditing = false;
    this.showcaseUnsaved = false;
    this.showcaseViewMode = 'source'; // 'source' | 'rendered'
    this.sessionFiles = []; // 会话中创建/编辑的文件列表
    
    // 当前设置分区（默认环境分区）
    this.currentSettingsSection = 'environment';

    // AI 相关状态
    this.aiConnected = false;
    this.aiMessages = [];
    this.currentSessionId = null;
    this._connectedMessageShown = false;  // 防止重复显示"已连接"消息
    this._historyLoaded = false;  // 防止重复加载历史消息
    
    // Happy AI 消息去重
    this.displayedMessageIds = new Set();
    this.maxDisplayedIds = 500;
    
    // Happy AI 事件状态
    this.happyEventStatus = 'idle';
    
    // 中止状态（防重复点击）
    this.isAborting = false;
    
    // 工具卡片计时器管理
    this.toolTimers = {};
    
    // 工具消息 ID 映射（用于更新工具状态）
    this.toolElements = new Map();
    
    // 滚动状态管理
    this.isUserScrolling = false;
    this.scrollTimeout = null;
    
    // Happy AI 状态超时定时器（防止状态永久停留在 processing）
    this.happyStatusTimeoutId = null;
    this.happyStatusTimeoutMs = 120000; // 2 分钟超时
    
    // 事件监听器取消函数
    this.unsubscribers = [];
    
    // Explorer 模块相关状态
    this.explorerManager = null;
    this.explorerConnected = false;
    this.filePreviewPath = null;
    this.previewedFileContent = null;  // 预览文件的内容
    this.isFileEditing = false;
    this.filePreviewUnsaved = false;
    
    // 多文件标签页状态
    this.openTabs = [];  // [{id, path, name, type, isDirty, content, previewFileType}]
    this.activeTabId = null;
    this.fileRefreshDebounceTimer = null;
    
    // 分栏布局相关状态
    this.viewMode = 'list';  // 'list' | 'split'
    this.previewViewMode = 'source';  // 'source' | 'rendered'
    this.previewFileType = 'text';  // 'text' | 'html' | 'markdown'
    this.splitWidth = parseInt(localStorage.getItem('files-split-width')) || 280;  // 文件列表宽度（像素）
    this.isResizing = false;  // 是否正在拖拽调整
    
    // 上下文使用量数据
    this.usageData = null;
    this.alwaysShowContextSize = true; // 是否始终显示上下文大小
    
    // 模型配置状态
    this.currentModel = null;        // 当前模型 ID (如 'deepseek-v4-pro[1m]')
    this.currentProvider = null;     // 当前 provider (如 'deepseek')
    this.currentModelConfig = MODEL_CONFIGS['default']; // 当前模型配置
    
    // 工具配置映射 (仿 happy 的 knownTools)
    this.knownTools = {
      'TodoWrite': {
        icon: '💡',
        title: '任务计划',
        noStatus: true,
        customRenderer: 'renderTodoList'
      },
      'TodoRead': {
        icon: '☑️',
        title: '读取任务',
        noStatus: true
      },
      'Bash': {
        icon: '💻',
        title: '终端'
      },
      'Edit': {
        icon: '✏️',
        title: '编辑文件'
      },
      'Write': {
        icon: '📄',
        title: '写入文件'
      },
      'Read': {
        icon: '📖',
        title: '读取文件'
      },
      'Glob': {
        icon: '🔍',
        title: '搜索文件'
      },
      'Grep': {
        icon: '🔎',
        title: '搜索内容'
      },
      'LS': {
        icon: '📁',
        title: '列出目录'
      },
      'Task': {
        icon: '📋',
        title: '子任务'
      },
      'WebSearch': {
        icon: '🌐',
        title: '网页搜索'
      },
      'WebFetch': {
        icon: '📥',
        title: '获取网页'
      },
      'AskUserQuestion': {
        icon: '❓',
        title: '用户问答'
      }
    };
    
    // 文件管理器状态
    this.currentFilePath = null;      // 当前浏览路径
    this.workspaceRoot = null;        // 工作目录根路径
    this.filePathHistory = [];        // 路径历史栈
    this.selectedFileItem = null;     // 当前选中的文件项
    this.fileContextMenuTarget = null; // 右键菜单目标
    
    // 文件图标映射
    this.fileIconMap = {
      // 文件夹
      'folder': '📁',
      // 代码文件
      '.js': '📜',
      '.ts': '📜',
      '.jsx': '📜',
      '.tsx': '📜',
      '.vue': '📜',
      '.py': '🐍',
      '.rb': '💎',
      '.go': '🔷',
      '.rs': '🦀',
      '.java': '☕',
      '.c': '⚙️',
      '.cpp': '⚙️',
      '.h': '⚙️',
      '.cs': '🔷',
      '.php': '🐘',
      // 数据文件
      '.json': '📋',
      '.xml': '📋',
      '.yaml': '📋',
      '.yml': '📋',
      '.toml': '📋',
      '.csv': '📊',
      // 文档
      '.md': '📝',
      '.txt': '📄',
      '.pdf': '📕',
      '.doc': '📘',
      '.docx': '📘',
      '.xls': '📗',
      '.xlsx': '📗',
      '.ppt': '📙',
      '.pptx': '📙',
      // 图片
      '.png': '🖼️',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.gif': '🖼️',
      '.svg': '🖼️',
      '.webp': '🖼️',
      '.ico': '🖼️',
      // 音视频
      '.mp3': '🎵',
      '.wav': '🎵',
      '.flac': '🎵',
      '.mp4': '🎬',
      '.mov': '🎬',
      '.avi': '🎬',
      '.mkv': '🎬',
      '.webm': '🎬',
      // 压缩文件
      '.zip': '📦',
      '.rar': '📦',
      '.7z': '📦',
      '.tar': '📦',
      '.gz': '📦',
      // 配置文件
      '.env': '🔐',
      '.gitignore': '🔒',
      '.npmrc': '📋',
      // 默认
      'default': '📄'
    };
    
    this.init();
  }
  
  /**
   * 生成消息去重 key（委托给 ChatPanel）
   * @deprecated 使用 Reducer 架构后不再需要手动去重
   * @param {Object} data 消息数据
   * @returns {string} 去重 key
   */
  generateMessageKey(data) {
    return this.chatPanel?.generateMessageKey?.(data) || '';
  }

  /**
   * 初始化应用
   */
  async init() {
    // 设置平台类，用于 CSS 平台适配
    this.setupPlatformClass();
    
    // 初始化 LogViewer
    this.logViewer.init();
    
    // 初始化 ChatPanel
    this.chatPanel.init();
    
    // 初始化 DaemonManager
    this.daemonManager.init();
    
    // 初始化 WorkspaceSettings
    this.workspaceSettings.init();
    
    // 初始化 ClaudeCodeSettings
    this.claudeCodeSettings.init();
    
    // 初始化 DependencyChecker
    this.dependencyChecker.init();
    
    // 注意：FilesPanel 和 ExplorerModule 的初始化在后面 await 调用
    
    this.bindElements();
    this.bindEvents();
    
    // 更新应用版本号
    await this.updateAppVersion();
    
    // 初始化更新 UI
    await this.initUpdateUI();
    
    // 初始化 SetupWizard 和 AccountSetup 模块
    this.setupWizard.init();
    this.accountSetup.init();
    
    // 初始化 SessionHub
    this.sessionHub.init();
    
    // 初始化 MobileDrawer（移动版侧边栏抽屉）
    if (typeof MobileDrawer !== 'undefined') {
      this.mobileDrawer = new MobileDrawer({ app: this });
      window.mobileDrawer = this.mobileDrawer; // 挂载到全局供 switchPanel 使用
    }
    
    // 初始化移动版面板状态
    if (this.isMobileView()) {
      // 默认显示对话面板
      this.updateMobilePanelVisibility(true);
    }
    
    // 设置其余通用事件监听器
    this.setupEventListeners();
    
    // 主进程可能在渲染层监听就绪前已经完成服务启动，主动拉取一次状态兜底。
    await this.loadServerStatus();
    
    // 在 Web 模式下初始化 WebSocket 连接
    await this.initWebSocket();
    
    // 检查 AI 状态
    await this.checkAIStatus();
    
    // 默认面板是 chat，激活聊天面板背景
    if (this.currentPanel === 'chat' && this.chatPanel) {
      this.chatPanel.onPanelActivate();
    }
    
    // 加载工作目录设置
    await this.loadWorkspaceSettings();
    
    // 加载 Daemon 状态
    await this.loadDaemonStatus();
    
    // 加载依赖状态（Node.js、Claude Code 等）
    await this.loadDependencyStatus();
    
    // 检查是否需要显示设置向导（委托给 SetupWizard 模块）
    await this.setupWizard.checkAndShow();
    
    // 加载账户信息（委托给 AccountSetup 模块）
    // 只有在本地服务已连接时才检查账户状态
    if (window.apiAdapter?.isConnected()) {
      await this.accountSetup.loadAccountInfo();
    }
    
    // 初始化默认面板（文件面板）
    await this.initFilesPanel();
    
    // 初始化 Explorer 模块
    await this.initExplorerModule();
    
    // Initialize i18n tool titles
    this.updateToolConfigTitles();
    
    // 初始化对话模式展示区事件
    this.initChatShowcaseEvents();
    
    console.log('DeepSeek Cowork App initialized');
  }
  
  /**
   * 设置平台类到 body，用于 CSS 平台适配
   */
  setupPlatformClass() {
    const platform = window.platform?.platform || 'win32';
    document.body.classList.add(`platform-${platform}`);
    console.log(`Platform detected: ${platform}`);
  }

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    // 产品版本信息（标题栏）
    this.productVersion = document.getElementById('product-version');
    
    // 窗口控制按钮 - macOS
    this.minimizeBtnMac = document.getElementById('minimize-btn');
    this.maximizeBtnMac = document.getElementById('maximize-btn');
    this.closeBtnMac = document.getElementById('close-btn');
    
    // 窗口控制按钮 - Windows/Linux
    this.minimizeBtnWin = document.getElementById('minimize-btn-win');
    this.maximizeBtnWin = document.getElementById('maximize-btn-win');
    this.closeBtnWin = document.getElementById('close-btn-win');
    
    // 导航栏
    this.navButtons = document.querySelectorAll('.nav-btn');
    this.panels = document.querySelectorAll('#display-panel .panel');
    
    // 加载覆盖层（浏览器面板内的局部遮罩）
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingText = this.loadingOverlay?.querySelector('.loading-text');
    
    // 全屏加载遮罩
    this.globalLoadingOverlay = document.getElementById('global-loading-overlay');
    this.globalLoadingText = this.globalLoadingOverlay?.querySelector('.loading-text');
    
    // 状态栏元素已简化，由通用服务器状态更新逻辑管理
    
    // 日志面板
    this.logsList = document.getElementById('logs-list');
    this.clearLogsBtn = document.getElementById('clear-logs-btn');
    
    // AI 面板元素
    this.aiStatus = document.getElementById('ai-status');
    this.aiConnectBtn = document.getElementById('ai-connect-btn');
    this.aiMessages = document.getElementById('ai-messages');
    this.aiInput = document.getElementById('ai-input');
    this.aiSendBtn = document.getElementById('ai-send-btn');
    this.aiAbortBtn = document.getElementById('ai-abort-btn');
    
    // AI 侧边栏
    
    // 浏览器面板
    
    // 设置面板 - 运行环境
    this.refreshDepsBtn = document.getElementById('btn-refresh-deps');
    // Node.js
    this.nodejsBadge = document.getElementById('nodejs-badge');
    this.nodejsVersion = document.getElementById('nodejs-version');
    this.npmVersion = document.getElementById('npm-version');
    this.electronNodeVersion = document.getElementById('electron-node-version');
    this.nodejsActions = document.getElementById('nodejs-actions');
    this.installNodejsBtn = document.getElementById('btn-install-nodejs');
    // Daemon 管理（连接状态）
    this.daemonStatusDot = document.getElementById('daemon-status-dot');
    this.daemonStatusText = document.getElementById('daemon-status-text');
    this.daemonPid = document.getElementById('daemon-pid');
    this.daemonPort = document.getElementById('daemon-port');
    this.daemonStartTime = document.getElementById('daemon-start-time');
    this.btnDaemonStart = document.getElementById('btn-daemon-start');
    this.btnDaemonStop = document.getElementById('btn-daemon-stop');
    this.btnDaemonRestart = document.getElementById('btn-daemon-restart');
    // Claude Code
    this.claudeCodeBadge = document.getElementById('claude-code-badge');
    this.claudeCodeVersion = document.getElementById('claude-code-version');
    this.claudeCodeSource = document.getElementById('claude-code-source');
    this.claudeCodePath = document.getElementById('claude-code-path');
    this.claudeCodeActions = document.getElementById('claude-code-actions');
    this.installClaudeCodeBtn = document.getElementById('btn-install-claude-code');
    // 软件更新
    this.updateBadge = document.getElementById('update-badge');
    this.updateCurrentVersion = document.getElementById('update-current-version');
    this.updateNewVersionRow = document.getElementById('update-new-version-row');
    this.updateNewVersion = document.getElementById('update-new-version');
    this.updateProgressRow = document.getElementById('update-progress-row');
    this.updateProgressText = document.getElementById('update-progress-text');
    this.updateProgressBar = document.getElementById('update-progress-bar');
    this.updateProgressFill = document.getElementById('update-progress-fill');
    this.btnCheckUpdate = document.getElementById('btn-check-update');
    this.btnDownloadUpdate = document.getElementById('btn-download-update');
    this.btnInstallUpdate = document.getElementById('btn-install-update');
    this.btnSkipUpdate = document.getElementById('btn-skip-update');
    // 设置向导入口
    this.rerunSetupWizardBtn = document.getElementById('btn-rerun-setup-wizard');
    
    // 设置面板 - Claude Code 配置
    this.claudeProviderSelect = document.getElementById('claude-provider');
    this.claudeBaseurlItem = document.getElementById('claude-baseurl-item');
    this.claudeBaseurlInput = document.getElementById('claude-baseurl');
    this.claudeAuthTokenInput = document.getElementById('claude-auth-token');
    this.toggleClaudeTokenBtn = document.getElementById('btn-toggle-claude-token');
    this.saveClaudeTokenBtn = document.getElementById('btn-save-claude-token');
    this.claudeTokenStatus = document.getElementById('claude-token-status');
    this.claudeModelItem = document.getElementById('claude-model-item');
    this.claudeModelInput = document.getElementById('claude-model');
    this.claudeTimeoutInput = document.getElementById('claude-timeout');
    this.claudeDisableNonessentialCheckbox = document.getElementById('claude-disable-nonessential');
    this.saveClaudeSettingsBtn = document.getElementById('btn-save-claude-settings');

    // 设置面板 - 工作目录
    this.workspaceDirInput = document.getElementById('workspace-dir');
    this.defaultWorkspaceDirInput = document.getElementById('default-workspace-dir');
    this.selectWorkspaceBtn = document.getElementById('btn-select-workspace');
    this.resetWorkspaceBtn = document.getElementById('btn-reset-workspace');
    
    // 状态栏 - 工作目录
    this.serverStatusDot = document.getElementById('server-status-dot');
    this.serverStatusValue = document.getElementById('server-status-value');
    this.workspaceStatus = document.getElementById('workspace-status');
    this.statusWorkspacePath = document.getElementById('status-workspace-path');
    
    // ============ 账户管理元素 ============
    this.accountCard = document.getElementById('account-card');
    this.accountLoggedIn = document.getElementById('account-logged-in');
    this.accountNotLoggedIn = document.getElementById('account-not-logged-in');
    this.accountStatusDot = document.getElementById('account-status-dot');
    this.accountStatusText = document.getElementById('account-status-text');
    this.accountAnonId = document.getElementById('account-anon-id');
    this.accountServer = document.getElementById('account-server');
    this.btnCopyAnonId = document.getElementById('btn-copy-anon-id');
    this.btnAccountCreate = document.getElementById('btn-account-create');
    this.btnAccountImport = document.getElementById('btn-account-import');
    // 备份区域
    this.accountBackupSection = document.getElementById('account-backup-section');
    this.btnToggleSecretDisplay = document.getElementById('btn-toggle-secret-display');
    this.secretToggleIcon = document.getElementById('secret-toggle-icon');
    this.secretToggleText = document.getElementById('secret-toggle-text');
    this.secretDisplaySection = document.getElementById('secret-display-section');
    this.accountSecretDisplay = document.getElementById('account-secret-display');
    this.btnCopySecretKey = document.getElementById('btn-copy-secret-key');
    this.secretCopyHint = document.getElementById('secret-copy-hint');
    // 账户操作
    this.accountActionsSection = document.getElementById('account-actions-section');
    this.btnSwitchAccount = document.getElementById('btn-switch-account');
    this.btnChangeServer = document.getElementById('btn-change-server');
    this.btnLogout = document.getElementById('btn-logout');
    // 修改服务器对话框
    this.changeServerDialog = document.getElementById('change-server-dialog');
    this.currentServerDisplay = document.getElementById('current-server-display');
    this.newServerInput = document.getElementById('new-server-input');
    this.btnChangeServerCancel = document.getElementById('btn-change-server-cancel');
    this.btnChangeServerConfirm = document.getElementById('btn-change-server-confirm');
    
    // 设置面板 - 分栏导航
    this.settingsNav = document.getElementById('settings-nav');
    this.settingsNavItems = document.querySelectorAll('.settings-nav-item');
    this.settingsContent = document.getElementById('settings-content');
    this.settingsSections = document.querySelectorAll('.settings-content .settings-section');
    
    // 设置面板 - Happy Coder 设置 (会话设置分区)
    this.permissionModeSelect = document.getElementById('happy-permission-mode');
    this.permissionModeHint = document.getElementById('permission-mode-hint');
    this.restartSection = document.getElementById('restart-section');
    this.restartNowBtn = document.getElementById('btn-restart-now');
    this.restartLaterBtn = document.getElementById('btn-restart-later');
    this.restartServerBtn = document.getElementById('btn-restart-server');
    
    // 文件管理器面板
    this.filesBackBtn = document.getElementById('files-back-btn');
    this.filesRefreshBtn = document.getElementById('files-refresh-btn');
    this.filesNewFolderBtn = document.getElementById('files-newfolder-btn');
    this.filesBreadcrumb = document.getElementById('files-breadcrumb');
    this.filesContainer = document.getElementById('files-container');
    this.filesList = document.getElementById('files-list');
    this.filesLoading = document.getElementById('files-loading');
    this.noFilesMessage = document.getElementById('no-files-message');
    this.filesError = document.getElementById('files-error');
    this.filesErrorMessage = document.getElementById('files-error-message');
    
    // Explorer 状态已移至设置面板服务器状态区块
    
    // 分栏布局相关元素
    this.filesSplitContainer = document.getElementById('files-split-container');
    this.filesListPane = document.getElementById('files-list-pane');
    this.filesResizer = document.getElementById('files-resizer');
    this.filePreviewPane = document.getElementById('file-preview-pane');
    
    // 文件预览面板
    this.filePreviewContainer = document.getElementById('file-preview-container');
    this.previewIcon = document.getElementById('preview-icon');
    this.previewFilename = document.getElementById('preview-filename');
    this.previewEditBtn = document.getElementById('preview-edit-btn');
    this.previewSaveBtn = document.getElementById('preview-save-btn');
    this.previewCancelBtn = document.getElementById('preview-cancel-btn');
    this.previewCloseBtn = document.getElementById('preview-close-btn');
    this.filePreviewContent = document.getElementById('file-preview-content');
    this.filePreviewCode = document.getElementById('file-preview-code');
    this.fileEditArea = document.getElementById('file-edit-area');
    this.previewFileSize = document.getElementById('preview-file-size');
    this.previewFileModified = document.getElementById('preview-file-modified');
    this.previewUnsaved = document.getElementById('preview-unsaved');
    
    // HTML/Markdown 预览相关元素
    this.previewViewToggle = document.getElementById('preview-view-toggle');
    this.previewSourceBtn = document.getElementById('preview-source-btn');
    this.previewRenderBtn = document.getElementById('preview-render-btn');
    this.filePreviewIframe = document.getElementById('file-preview-iframe');
    this.markdownPreview = document.getElementById('markdown-preview');
    
    // 多文件标签页元素
    this.fileTabsBar = document.getElementById('file-tabs-bar');
    this.fileTabsScroll = document.getElementById('file-tabs-scroll');
    
    // 文件右键菜单
    this.fileContextMenu = document.getElementById('file-context-menu');
    
    // 新建文件夹对话框
    this.newFolderDialog = document.getElementById('new-folder-dialog');
    this.newFolderNameInput = document.getElementById('new-folder-name');
    this.newFolderError = document.getElementById('new-folder-error');
    this.newFolderCreateBtn = document.getElementById('new-folder-create-btn');
    this.newFolderCancelBtn = document.getElementById('new-folder-cancel-btn');
    this.newFolderCancelBtn2 = document.getElementById('new-folder-cancel-btn2');
    
    // 重命名对话框
    this.renameDialog = document.getElementById('rename-dialog');
    this.renameInput = document.getElementById('rename-input');
    this.renameError = document.getElementById('rename-error');
    this.renameConfirmBtn = document.getElementById('rename-confirm-btn');
    this.renameCancelBtn = document.getElementById('rename-cancel-btn');
    this.renameCancelBtn2 = document.getElementById('rename-cancel-btn2');
    
    // ============ Welcome Setup 对话框元素 ============
    // 欢迎设置对话框
    this.welcomeSetupDialog = document.getElementById('welcome-setup-dialog');
    this.btnCreateAccount = document.getElementById('btn-create-account');
    this.btnImportSecret = document.getElementById('btn-import-secret');
    this.btnSkipSetup = document.getElementById('btn-skip-setup');
    
    // Secret 备份对话框
    this.secretBackupDialog = document.getElementById('secret-backup-dialog');
    this.secretDisplay = document.getElementById('secret-display');
    this.btnCopySecret = document.getElementById('btn-copy-secret');
    this.copyStatus = document.getElementById('copy-status');
    this.backupConfirmedCheckbox = document.getElementById('backup-confirmed');
    this.btnBackupCancel = document.getElementById('btn-backup-cancel');
    this.btnBackupContinue = document.getElementById('btn-backup-continue');
    
    // Secret 输入对话框
    this.secretInputDialog = document.getElementById('secret-input-dialog');
    this.secretInputField = document.getElementById('secret-input-field');
    this.secretInputStatus = document.getElementById('secret-input-status');
    this.btnSecretInputCancel = document.getElementById('btn-secret-input-cancel');
    this.btnSecretInputVerify = document.getElementById('btn-secret-input-verify');
    this.secretInputCloseBtn = document.getElementById('secret-input-close-btn');
    
    // 设置完成对话框
    this.setupCompleteDialog = document.getElementById('setup-complete-dialog');
    this.btnSetupComplete = document.getElementById('btn-setup-complete');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 窗口控制 - macOS 按钮
    this.minimizeBtnMac?.addEventListener('click', () => this.minimizeWindow());
    this.maximizeBtnMac?.addEventListener('click', () => this.maximizeWindow());
    this.closeBtnMac?.addEventListener('click', () => this.closeWindow());
    
    // 窗口控制 - Windows/Linux 按钮
    this.minimizeBtnWin?.addEventListener('click', () => this.minimizeWindow());
    this.maximizeBtnWin?.addEventListener('click', () => this.maximizeWindow());
    this.closeBtnWin?.addEventListener('click', () => this.closeWindow());
    
    // 导航栏事件
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('data-panel');
        this.switchPanel(panelId);
      });
    });
    
    // 设置面板导航事件
    this.settingsNavItems?.forEach(item => {
      item.addEventListener('click', () => {
        const sectionId = item.dataset.section;
        this.switchSettingsSection(sectionId);
      });
    });
    
    // 日志面板事件
    this.clearLogsBtn?.addEventListener('click', () => this.clearLogs());
    
    // 注意：AI 面板事件已由 ChatPanel.bindEvents() 处理，此处不再重复绑定
    
    // 设置面板 - 运行环境事件（已移至 DependencyChecker 模块）
    // 注意：refreshDepsBtn, installNodejsBtn, installClaudeCodeBtn 事件由 DependencyChecker.init() 处理
    this.installHappyCoderBtn?.addEventListener('click', () => this.installHappyCoder());
    
    // 设置向导入口
    this.rerunSetupWizardBtn?.addEventListener('click', () => this.rerunSetupWizard());
    
    // 软件更新按钮事件
    this.btnCheckUpdate?.addEventListener('click', () => this.checkForUpdates());
    this.btnDownloadUpdate?.addEventListener('click', () => this.downloadUpdate());
    this.btnInstallUpdate?.addEventListener('click', () => this.quitAndInstall());
    this.btnSkipUpdate?.addEventListener('click', () => this.skipUpdate());

    // Daemon 控制按钮事件
    this.btnDaemonStart?.addEventListener('click', () => this.startDaemon());
    this.btnDaemonStop?.addEventListener('click', () => this.stopDaemon());
    this.btnDaemonRestart?.addEventListener('click', () => this.restartDaemon());

    // 设置面板 - Claude Code 配置事件（已移至 ClaudeCodeSettings 模块）
    // 注意：claudeProviderSelect, toggleClaudeTokenBtn, saveClaudeTokenBtn, saveClaudeSettingsBtn 事件由 ClaudeCodeSettings.init() 处理

    // 设置面板 - 工作目录事件（已移至 WorkspaceSettings 模块）
    // 注意：selectWorkspaceBtn, resetWorkspaceBtn, toggleSecretBtn, saveSecretBtn, permissionModeSelect 事件由 WorkspaceSettings.init() 处理
    
    // 设置面板 - 重启按钮事件
    this.restartNowBtn?.addEventListener('click', () => this.restartApp());
    this.restartLaterBtn?.addEventListener('click', () => this.hideRestartPrompt());
    this.restartServerBtn?.addEventListener('click', () => this.restartServer());
    
    // 状态栏 - 工作目录点击事件（跳转到对话设置）
    this.workspaceStatus?.addEventListener('click', () => this.navigateToConversationSettings());

    // 主题切换事件
    const themeModeSelect = document.getElementById('theme-mode');
    const themeHint = document.getElementById('theme-hint');
    
    if (themeModeSelect) {
      // 初始化选择器值
      themeModeSelect.value = ThemeManager.getMode();
      this.updateThemeHint(themeHint, ThemeManager.getMode());
      
      themeModeSelect.addEventListener('change', (e) => {
        ThemeManager.setMode(e.target.value);
        this.updateThemeHint(themeHint, e.target.value);
      });
    }
    
    // 监听主题变化事件（系统主题变化时更新提示）
    window.addEventListener('themechange', (e) => {
      this.updateThemeHint(themeHint, e.detail.mode);
    });

    // 监听窗口尺寸变化（移动版/桌面版切换）
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.handleResize(), 100);
    });

    // Language selector event
    const languageSelect = document.getElementById('language-select');
    if (languageSelect && typeof I18nManager !== 'undefined') {
      // Initialize selector value
      languageSelect.value = I18nManager.getLocale();
      
      languageSelect.addEventListener('change', (e) => {
        I18nManager.setLocale(e.target.value);
      });
    }
    
    // Listen for locale change event to update dynamic content
    window.addEventListener('localechange', (e) => {
      // Update TOOL_CONFIGS titles when language changes
      this.updateToolConfigTitles();
      // Update permission mode hint
      this.onPermissionModeChange();
      // Update AI status text (connected/disconnected)
      this.updateAIStatus({ isConnected: this.aiConnected });
      // Update server status text
      if (this._serverStatus) {
        this.updateServerStatus(this._serverStatus);
      }
    });

    // 文件管理器事件
    this.filesBackBtn?.addEventListener('click', () => this.navigateFileBack());
    this.filesRefreshBtn?.addEventListener('click', () => this.refreshFileList());
    this.filesNewFolderBtn?.addEventListener('click', () => this.showNewFolderDialog());
    
    // 新建文件夹对话框事件
    this.newFolderCreateBtn?.addEventListener('click', () => this.createNewFolder());
    this.newFolderCancelBtn?.addEventListener('click', () => this.hideNewFolderDialog());
    this.newFolderCancelBtn2?.addEventListener('click', () => this.hideNewFolderDialog());
    this.newFolderNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.createNewFolder();
      } else if (e.key === 'Escape') {
        this.hideNewFolderDialog();
      }
    });
    
    // 重命名对话框事件
    this.renameConfirmBtn?.addEventListener('click', () => this.confirmRename());
    this.renameCancelBtn?.addEventListener('click', () => this.hideRenameDialog());
    this.renameCancelBtn2?.addEventListener('click', () => this.hideRenameDialog());
    this.renameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmRename();
      } else if (e.key === 'Escape') {
        this.hideRenameDialog();
      }
    });
    
    // 右键菜单事件
    this.fileContextMenu?.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.handleFileContextMenuAction(action);
      });
    });
    
    // 点击空白处关闭右键菜单
    document.addEventListener('click', (e) => {
      if (this.fileContextMenu && !this.fileContextMenu.contains(e.target)) {
        this.hideFileContextMenu();
      }
    });
    
    // 文件预览面板事件
    this.previewEditBtn?.addEventListener('click', () => this.toggleFileEdit(true));
    this.previewSaveBtn?.addEventListener('click', () => this.saveFileContent());
    this.previewCancelBtn?.addEventListener('click', () => this.toggleFileEdit(false));
    this.previewCloseBtn?.addEventListener('click', () => this.closeFilePreview());
    
    // HTML 预览视图切换事件
    this.previewSourceBtn?.addEventListener('click', () => this.togglePreviewView('source'));
    this.previewRenderBtn?.addEventListener('click', () => this.togglePreviewView('rendered'));
    
    // 分栏拖拽条事件
    this.initResizer();
    
    // 编辑区内容变化监听
    this.fileEditArea?.addEventListener('input', () => {
      if (this.isFileEditing) {
        this.filePreviewUnsaved = true;
        if (this.previewUnsaved) {
          this.previewUnsaved.style.display = 'inline';
        }
        // 更新标签页脏状态
        this.updateCurrentTabDirty();
      }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  /**
   * 初始化 WebSocket 连接（Web 模式）
   * 用于接收实时消息和事件
   */
  async initWebSocket() {
    // 检查是否是 Web 模式
    if (window.apiAdapter?.getMode?.() !== 'web') {
      console.log('[App] Not in web mode, skipping WebSocket init');
      return;
    }
    
    // 检查 WebSocketClient 是否可用
    if (typeof WebSocketClient === 'undefined') {
      console.warn('[App] WebSocketClient not available');
      return;
    }
    
    try {
      // 使用 Socket.IO 的 URL（与后端的 WebSocket 端口一致）
      const wsUrl = 'ws://localhost:3333';
      console.log('[App] Initializing WebSocket connection to', wsUrl);
      
      this.wsClient = new WebSocketClient({ url: wsUrl });
      
      // 注册事件监听器用于调试日志
      // 注意：WebSocketClient._emit() 会自动转发事件到 apiAdapter，
      // 这里仅用于日志输出，不要再手动转发，否则会导致消息重复
      this.wsClient.on('happy:message', (data) => {
        console.log('[App] WS happy:message', data);
      });
      
      this.wsClient.on('happy:connected', (data) => {
        console.log('[App] WS happy:connected', data);
      });
      
      this.wsClient.on('happy:disconnected', (data) => {
        console.log('[App] WS happy:disconnected', data);
      });
      
      this.wsClient.on('happy:eventStatus', (data) => {
        console.log('[App] WS happy:eventStatus', data);
      });
      
      this.wsClient.on('happy:error', (data) => {
        console.log('[App] WS happy:error', data);
      });
      
      this.wsClient.on('happy:usage', (data) => {
        console.log('[App] WS happy:usage', data);
      });
      
      this.wsClient.on('happy:messagesRestored', (data) => {
        console.log('[App] WS happy:messagesRestored', data);
      });
      
      this.wsClient.on('daemon:statusChanged', (data) => {
        console.log('[App] WS daemon:statusChanged', data);
      });
      
      this.wsClient.on('happy:initialized', (data) => {
        console.log('[App] WS happy:initialized', data);
      });
      
      this.wsClient.on('happy:status', (data) => {
        console.log('[App] WS happy:status', data);
      });
      
      // 连接 WebSocket
      await this.wsClient.connect();
      
      // 设置到 apiAdapter
      window.apiAdapter?.setWebSocketClient?.(this.wsClient);
      
      console.log('[App] WebSocket connected');
    } catch (error) {
      console.error('[App] WebSocket connection failed:', error);
    }
  }

  /**
   * 设置事件监听器
   * 设置应用级事件监听器
   */
  setupEventListeners() {
    // Check if API is available
    if (typeof window.appBridge === 'undefined') {
      console.error('appBridge API not available');
      return;
    }

    const serverStatusUnsub = window.appBridge.onServerStatusChanged?.((status) => {
      this._serverStatus = status || null;
      if (status) {
        this.updateServerStatus(status);
      }
    });
    if (serverStatusUnsub) this.unsubscribers.push(serverStatusUnsub);

    // ============ Happy AI 实时事件监听 ============
    
    // 监听 Happy AI 消息
    const unsubHappyMessage = window.appBridge.onHappyMessage?.((data) => {
      this.handleHappyMessage(data);
    });
    if (unsubHappyMessage) this.unsubscribers.push(unsubHappyMessage);
    
    // 监听 Happy AI 连接状态
    const unsubHappyConnected = window.appBridge.onHappyConnected?.(async (data) => {
      console.log('Happy AI connected:', data);
      this.aiConnected = true;
      this.currentSessionId = data.sessionId;
      this.updateAIStatus({ isConnected: true });
      
      // 连接成功后加载历史消息
      // 注意：先设置标志再 await，防止竞态条件（happy:status 事件可能同时触发）
      if (!this._historyLoaded) {
        this._historyLoaded = true;
        await this.loadHappyMessageHistory();
      }
      
      // 加载最新的 usage 数据
      await this.loadLatestUsage();
      
      // 显示 Agent 已就绪消息（与进度消息保持一致，只显示一次）
      if (!this._connectedMessageShown) {
        this._connectedMessageShown = true;
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.addAIMessage('system', t('daemon.startProgress.ready'));
      }
    });
    if (unsubHappyConnected) this.unsubscribers.push(unsubHappyConnected);
    
    // 监听 Happy AI 断开连接
    const unsubHappyDisconnected = window.appBridge.onHappyDisconnected?.((data) => {
      console.log('Happy AI disconnected:', data);
      this.aiConnected = false;
      this._connectedMessageShown = false;  // 重置标志，以便重新连接时再次显示消息
      this._historyLoaded = false;  // 重置历史加载标志
      this.updateAIStatus({ isConnected: false });
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.addAIMessage('system', `${t('chat.agentDisconnected')}: ${data.reason || t('chat.unknownReason')}`);
    });
    if (unsubHappyDisconnected) this.unsubscribers.push(unsubHappyDisconnected);
    
    // 监听 Happy AI 事件状态
    // 后端已经延迟 100ms 发送 ready 事件，确保消息先被处理
    const unsubHappyEventStatus = window.appBridge.onHappyEventStatus?.((data) => {
      console.log('[App] Received happy:eventStatus:', data.eventType);
      this.updateHappyEventStatus(data.eventType);
    });
    if (unsubHappyEventStatus) this.unsubscribers.push(unsubHappyEventStatus);
    
    // 监听 Happy AI 错误
    const unsubHappyError = window.appBridge.onHappyError?.((data) => {
      console.error('Happy AI error:', data);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.addAIMessage('system', `${t('chat.agentError')}: ${data.message}`);
    });
    if (unsubHappyError) this.unsubscribers.push(unsubHappyError);
    
    // 监听 Happy AI 使用量更新（上下文窗口使用情况）
    const unsubUsageUpdate = window.appBridge.onUsageUpdate?.((data) => {
      console.log('[Usage Update]', data);
      this.updateUsageDisplay(data);
    });
    if (unsubUsageUpdate) this.unsubscribers.push(unsubUsageUpdate);
    
    // 监听消息恢复完成事件（从记忆系统恢复历史对话后刷新界面）
    const unsubMessagesRestored = window.appBridge.onHappyMessagesRestored?.(async (data) => {
      console.log('[MessagesRestored] Restored messages:', data);
      // 清空当前显示并重新加载
      this.clearAIMessages();
      await this.loadHappyMessageHistory();
      
      // 显示恢复成功提示
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.showNotification(t('notifications.messagesRestored', { count: data.count }), 'success');
    });
    if (unsubMessagesRestored) this.unsubscribers.push(unsubMessagesRestored);
    
    // 监听 daemon 状态变化
    const unsubDaemonStatus = window.appBridge.onDaemonStatusChanged?.((data) => {
      console.log('Daemon status changed:', data);
      this.updateDaemonUI(data);
    });
    if (unsubDaemonStatus) this.unsubscribers.push(unsubDaemonStatus);
    
    // 监听 daemon 启动进度
    const unsubDaemonProgress = window.appBridge.onDaemonStartProgress?.((data) => {
      console.log('Daemon start progress:', data);
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      // 将进度消息显示为系统消息
      const message = t(data.message) || data.message;
      this.addAIMessage('system', message);
    });
    if (unsubDaemonProgress) this.unsubscribers.push(unsubDaemonProgress);
    
    // 监听 Happy Service 热初始化完成事件（首次登录热初始化）
    const unsubHappyInitialized = window.appBridge.onHappyInitialized?.(async (data) => {
      console.log('[HappyInitialized] Hot initialization completed:', data);
      if (data.success) {
        // 刷新账户信息
        await this.loadAccountInfo?.();
        // 刷新设置面板
        await this.loadHappySettings?.();
        // 刷新 daemon 状态（兜底保障，确保 UI 状态与后端同步）
        await this.daemonManager?.loadStatus?.();
        // 显示成功提示
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.showNotification(t('notifications.loginSuccess'), 'success');
        // 更新 AI 状态
        this.updateAIStatus({ isConnected: false }); // 等待 happy:connected 事件更新
      }
    });
    if (unsubHappyInitialized) this.unsubscribers.push(unsubHappyInitialized);
    
    // 监听 Happy 初始状态事件（WebSocket 连接时发送）
    // 此事件在 WebSocket 连接建立时由后端发送，包含当前 AI 连接状态
    const unsubHappyStatus = window.appBridge.onHappyStatus?.(async (data) => {
      console.log('[HappyStatus] Initial status received:', data);
      // 更新 AI 连接状态
      if (data.clientConnected !== undefined) {
        this.aiConnected = data.clientConnected;
        this.currentSessionId = data.sessionId || this.currentSessionId;
        this.updateAIStatus({ 
          isConnected: data.clientConnected,
          eventStatus: data.eventStatus
        });
        
        // 如果已连接，加载历史消息并显示连接提示
        // 注意：先设置标志再 await，防止竞态条件（happy:connected 事件可能同时触发）
        if (data.clientConnected) {
          if (!this._historyLoaded) {
            this._historyLoaded = true;
            await this.loadHappyMessageHistory();
          }
          await this.loadLatestUsage();
          
          // 显示 Agent 已就绪消息（与进度消息保持一致，只显示一次）
          if (!this._connectedMessageShown) {
            this._connectedMessageShown = true;
            const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
            this.addAIMessage('system', t('daemon.startProgress.ready'));
          }
        }
      }
    });
    if (unsubHappyStatus) this.unsubscribers.push(unsubHappyStatus);
    
    // ============ 软件更新事件监听 ============
    
    // 监听更新检查中
    const unsubUpdateChecking = window.appBridge.onUpdateChecking?.(() => {
      this.updateUpdateUI({ status: 'checking' });
    });
    if (unsubUpdateChecking) this.unsubscribers.push(unsubUpdateChecking);
    
    // 监听有新版本可用
    const unsubUpdateAvailable = window.appBridge.onUpdateAvailable?.((data) => {
      console.log('[Update] New version available:', data.version);
      this.updateUpdateUI({ status: 'available', updateInfo: data });
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.showNotification(t('notifications.updateAvailable', { version: data.version }), 'info');
    });
    if (unsubUpdateAvailable) this.unsubscribers.push(unsubUpdateAvailable);
    
    // 监听无更新
    const unsubUpdateNotAvailable = window.appBridge.onUpdateNotAvailable?.((data) => {
      this.updateUpdateUI({ status: 'not-available', updateInfo: data });
    });
    if (unsubUpdateNotAvailable) this.unsubscribers.push(unsubUpdateNotAvailable);
    
    // 监听下载进度
    const unsubUpdateProgress = window.appBridge.onUpdateDownloadProgress?.((data) => {
      this.updateUpdateUI({ status: 'downloading', downloadProgress: data });
    });
    if (unsubUpdateProgress) this.unsubscribers.push(unsubUpdateProgress);
    
    // 监听下载完成
    const unsubUpdateDownloaded = window.appBridge.onUpdateDownloaded?.((data) => {
      console.log('[Update] Download complete:', data.version);
      this.updateUpdateUI({ status: 'downloaded', updateInfo: data });
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      this.showNotification(t('notifications.updateReady'), 'success');
    });
    if (unsubUpdateDownloaded) this.unsubscribers.push(unsubUpdateDownloaded);
    
    // 监听更新错误
    const unsubUpdateError = window.appBridge.onUpdateError?.((data) => {
      console.error('[Update] Error:', data.message);
      this.updateUpdateUI({ status: 'error', error: data });
    });
    if (unsubUpdateError) this.unsubscribers.push(unsubUpdateError);
  }
  
  /**
   * 处理 Happy AI 消息（委托给 HappyMessageHandler）
   * @param {Object} data 消息数据
   */
  handleHappyMessage(data) {
    this.happyMessageHandler.handleMessage(data);
  }
  
  /**
   * 更新 Happy AI 事件状态（委托给 HappyMessageHandler）
   * @param {string} status 状态 (idle, processing, ready)
   */
  updateHappyEventStatus(status) {
    this.happyEventStatus = status;
    this.happyMessageHandler.updateEventStatus(status);
  }
  
  /**
   * 更新中止按钮显示状态（委托给 HappyMessageHandler）
   * @param {string} status 当前状态
   */
  updateAbortButton(status) {
    this.happyMessageHandler.updateAbortButton(status);
  }
  
  /**
   * 中止 AI 会话
   */
  async abortAISession() {
    if (!['processing', 'thinking', 'waiting'].includes(this.happyEventStatus)) {
      return;
    }
    
    // 防重复点击
    if (this.isAborting) return;
    this.isAborting = true;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      // 添加抖动动画
      if (this.aiAbortBtn) {
        this.aiAbortBtn.classList.add('aborting');
      }
      
      const result = await window.appBridge?.abortSession?.(this.currentSessionId);
      
      if (result?.success) {
        this.addAIMessage('system', t('chat.taskAborted'));
        this.updateHappyEventStatus('ready');
      } else {
        // 中止失败，添加抖动效果
        if (this.aiAbortBtn) {
          this.aiAbortBtn.classList.add('shake');
          setTimeout(() => this.aiAbortBtn.classList.remove('shake'), 500);
        }
        this.addAIMessage('system', `${t('chat.abortFailed')}: ${result?.error || t('errors.unknownError')}`);
      }
    } catch (error) {
      console.error('Failed to abort session:', error);
      this.addAIMessage('system', `${t('chat.abortFailed')}: ${error.message}`);
    } finally {
      if (this.aiAbortBtn) {
        this.aiAbortBtn.classList.remove('aborting');
      }
      this.isAborting = false;
    }
  }

  // ============ 面板导航 ============

  /**
   * 检测当前是否为移动视图
   * @returns {boolean}
   */
  isMobileView() {
    return window.innerWidth < 900;
  }

  /**
   * 切换展示栏面板
   */
  switchPanel(panelId) {
    const previousPanel = this.currentPanel;
    
    // 移动版：对话面板和展示面板互斥全屏显示
    if (this.isMobileView()) {
      this.currentPanel = panelId;
      
      if (panelId === 'chat') {
        // 显示对话面板，隐藏展示面板
        this.updateMobilePanelVisibility(true);
        // 激活聊天面板背景
        if (this.chatPanel) {
          this.chatPanel.onPanelActivate();
        }
      } else {
        // 隐藏对话面板，显示展示面板
        this.activeDisplayContent = panelId;
        this.updateMobilePanelVisibility(false);
        this.showDisplayPanel(panelId);
        // 取消激活聊天面板背景
        if (previousPanel === 'chat' && this.chatPanel) {
          this.chatPanel.onPanelDeactivate();
        }
      }
      
      // 关闭可能打开的抽屉
      if (window.mobileDrawer) {
        window.mobileDrawer.hide();
      }
    } else {
      // 桌面版：原有逻辑
      if (panelId === 'chat') {
        // 对话模式
        if (this.currentPanel === 'chat' && this.displayPanelExpanded) {
          // 已在对话模式且展示区展开，则折叠
          this.displayPanelExpanded = false;
          this.setDisplayPanelVisible(false);
        } else if (this.currentPanel !== 'chat') {
          // 从其他模式切换到对话模式
          this.currentPanel = 'chat';
          this.displayPanelExpanded = false;
          this.setDisplayPanelVisible(false);
        }
        // 激活聊天面板背景
        if (this.chatPanel) {
          this.chatPanel.onPanelActivate();
        }
        // 如果已在对话模式且展示区折叠，保持不变
      } else {
        // 其他模式：显示展示区
        this.currentPanel = panelId;
        this.activeDisplayContent = panelId;
        this.displayPanelExpanded = true;
        this.setDisplayPanelVisible(true);
        this.showDisplayPanel(panelId);
        // 取消激活聊天面板背景
        if (previousPanel === 'chat' && this.chatPanel) {
          this.chatPanel.onPanelDeactivate();
        }
      }
    }
    
    this.updateNavButtons();
  }

  /**
   * 更新移动版面板可见性
   * @param {boolean} showChat - 是否显示对话面板
   */
  updateMobilePanelVisibility(showChat) {
    const chatPanel = document.getElementById('chat-panel');
    const displayPanel = document.getElementById('display-panel');
    
    if (showChat) {
      chatPanel?.classList.remove('mobile-panel-hidden');
      displayPanel?.classList.remove('mobile-panel-visible');
    } else {
      chatPanel?.classList.add('mobile-panel-hidden');
      displayPanel?.classList.add('mobile-panel-visible');
    }
  }

  /**
   * 处理窗口尺寸变化（桌面/移动模式切换）
   */
  handleResize() {
    const isMobile = this.isMobileView();
    const chatPanel = document.getElementById('chat-panel');
    const displayPanel = document.getElementById('display-panel');
    
    if (isMobile) {
      // 切换到移动模式
      if (this.currentPanel === 'chat') {
        chatPanel?.classList.remove('mobile-panel-hidden');
        displayPanel?.classList.remove('mobile-panel-visible');
      } else {
        chatPanel?.classList.add('mobile-panel-hidden');
        displayPanel?.classList.add('mobile-panel-visible');
      }
      
      // 关闭抽屉
      if (window.mobileDrawer) {
        window.mobileDrawer.hide();
      }
    } else {
      // 切换到桌面模式，清除移动版样式类
      chatPanel?.classList.remove('mobile-panel-hidden');
      displayPanel?.classList.remove('mobile-panel-visible');
      
      // 恢复桌面版的展示区状态
      if (this.displayPanelExpanded) {
        this.setDisplayPanelVisible(true);
      } else {
        this.setDisplayPanelVisible(false);
      }
    }
  }
  
  /**
   * 设置展示区可见性
   * @param {boolean} visible 是否可见
   */
  setDisplayPanelVisible(visible) {
    const mainContainer = document.getElementById('main-container');
    const displayPanel = document.getElementById('display-panel');
    
    if (visible) {
      mainContainer?.classList.remove('chat-fullwidth');
      if (displayPanel) displayPanel.style.display = '';
    } else {
      mainContainer?.classList.add('chat-fullwidth');
      if (displayPanel) displayPanel.style.display = 'none';
    }
  }
  
  /**
   * 展开展示区（保持对话模式）
   * 供 SessionHub 等外部调用
   */
  expandDisplayPanel() {
    if (this.currentPanel === 'chat' && !this.displayPanelExpanded) {
      this.displayPanelExpanded = true;
      this.setDisplayPanelVisible(true);
      this.showDisplayPanel(this.activeDisplayContent);
    }
  }
  
  /**
   * 显示指定的展示面板内容
   * @param {string} panelId 面板 ID (files, browser, settings)
   */
  showDisplayPanel(panelId) {
    // 切换展示栏内的面板
    this.panels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `panel-${panelId}`);
    });

    // 特定面板的初始化
    if (panelId === 'settings') {
      // 切换到设置面板时加载依赖状态、Claude Code 设置和 Daemon 状态
      this.loadDependencyStatus();
      this.loadClaudeCodeSettings();
      this.loadDaemonStatus();
      // 如果当前选中的是日志分区，滚动到底部
      if (this.currentSettingsSection === 'logs') {
        this.scrollLogsToBottom();
      }
    } else if (panelId === 'files') {
      // 切换到文件面板时初始化
      // 如果 workspaceRoot 为 null（表示目录已切换），会重新获取
      this.initFilesPanel();
    }
  }
  
  /**
   * 更新导航按钮状态
   */
  updateNavButtons() {
    this.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-panel') === this.currentPanel);
    });
  }

  /**
   * 导航到对话设置页面（从状态栏点击工作目录触发）
   */
  navigateToConversationSettings() {
    // 先切换到设置面板
    this.switchPanel('settings');
    // 再切换到对话设置分区
    this.switchSettingsSection('conversation');
  }

  /**
   * 更新状态栏工作目录显示
   * @param {string} path 工作目录路径
   */
  updateStatusBarWorkspace(path) {
    if (!this.statusWorkspacePath) return;
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    if (path) {
      this.statusWorkspacePath.textContent = path;
      this.statusWorkspacePath.title = path;
      // 更新父元素的 title（完整路径提示）
      if (this.workspaceStatus) {
        this.workspaceStatus.title = `${t('status.workDirTooltip')}\n${path}`;
      }
    } else {
      this.statusWorkspacePath.textContent = t('common.notSet') || '-';
      if (this.workspaceStatus) {
        this.workspaceStatus.title = t('status.workDirTooltip');
      }
    }
  }

  /**
   * 切换设置面板分区
   * @param {string} sectionId - 分区 ID (environment, claude-code, account, conversation, appearance, server, logs)
   */
  switchSettingsSection(sectionId) {
    // 更新导航项状态
    this.settingsNavItems?.forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });
    
    // 切换内容分区
    this.settingsSections?.forEach(section => {
      section.classList.toggle('active', section.id === `settings-${sectionId}`);
    });
    
    // 记录当前选中的分区
    this.currentSettingsSection = sectionId;
    
    // 分区特定的初始化
    if (sectionId === 'logs') {
      // 切换到日志分区时滚动到底部
      this.scrollLogsToBottom();
    } else if (sectionId === 'environment') {
      // 切换到环境分区时刷新依赖状态
      this.loadDependencyStatus();
      this.loadDaemonStatus();
    } else if (sectionId === 'claude-code') {
      // 切换到 Claude Code 配置分区时加载设置
      this.loadClaudeCodeSettings();
    } else if (sectionId === 'account') {
      // 切换到账户管理分区时加载账户信息
      this.loadAccountInfo();
    }
  }

  // ============ 窗口控制 ============
  // 已移至 core/WindowController.js，此处保留委托方法以保持兼容性

  minimizeWindow() {
    WindowController.minimize();
  }

  maximizeWindow() {
    WindowController.maximize();
  }

  closeWindow() {
    WindowController.close();
  }

  // ============ 服务器状态 ============

  /**
   * 获取服务器状态
   * @returns {Object}
   */
  get serverStatus() {
    return this._serverStatus || null;
  }

  /**
   * 主动加载本地服务状态，用于补齐渲染进程错过启动事件的情况
   */
  async loadServerStatus() {
    try {
      const status = await window.appBridge?.getServerStatus?.();
      if (status) {
        this._serverStatus = status;
        this.updateServerStatus(status);
      }
    } catch (error) {
      console.error('[App] Failed to load server status:', error);
      this.updateServerStatus({ running: false, error: error.message });
    }
  }

  /**
   * 更新底部状态栏的本地服务状态
   * @param {Object} status 服务状态
   */
  updateServerStatus(status = {}) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const dot = this.serverStatusDot || document.getElementById('server-status-dot');
    const value = this.serverStatusValue || document.getElementById('server-status-value');

    if (!dot || !value) {
      return;
    }

    let state = 'stopped';
    let textKey = 'status.stopped';

    if (status.restarting) {
      state = 'starting';
      textKey = 'status.restarting';
    } else if (status.running) {
      state = 'running';
      textKey = 'status.running';
    } else if (status.error) {
      state = 'error';
      textKey = 'status.error';
    }

    dot.className = `status-dot state-${state}`;
    value.textContent = t(textKey);
    value.title = status.error || '';
  }

  /**
   * 刷新管理界面
   */
  async refreshView() {
    return window.appBridge?.refreshView?.();
  }

  /**
   * 重启服务器
   */
  async restartServer() {
    return window.appBridge?.restartServer?.();
  }

  /**
   * 切换开发者工具
   */
  async toggleDevTools() {
    return window.appBridge?.toggleDevTools?.();
  }

  /**
   * 显示全屏加载覆盖层
   * @param {string} message 加载提示文字
   */
  showLoadingOverlay(message = null) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (this.globalLoadingText) this.globalLoadingText.textContent = message || t('common.loading');
    this.globalLoadingOverlay?.classList.remove('hidden');
  }

  /**
   * 隐藏全屏加载覆盖层
   */
  hideLoadingOverlay() {
    this.globalLoadingOverlay?.classList.add('hidden');
  }

  /**
   * 显示加载错误
   */
  showLoadingError(message) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    if (this.loadingText) this.loadingText.textContent = t('errors.loadFailed') + ': ' + message;
    const spinner = this.loadingOverlay?.querySelector('.loading-spinner');
    if (spinner) spinner.style.display = 'none';
  }

  // ============ AI 面板 ============
  // 已迁移到 panels/ChatPanel.js，以下为委托方法

  /**
   * 检查 AI 状态（委托给 ChatPanel）
   */
  async checkAIStatus() {
    await this.chatPanel.checkAIStatus();
  }

  /**
   * 更新应用版本号显示
   */
  async updateAppVersion() {
    try {
      if (this.productVersion) {
        // 检查 getAppVersion 方法是否存在且为函数
        if (typeof window.appBridge?.getAppVersion === 'function') {
          const versionInfo = await window.appBridge.getAppVersion();
          if (versionInfo && versionInfo.version) {
            this.productVersion.textContent = `V${versionInfo.version}`;
          }
        } else {
          // Web 模式下使用固定标识
          this.productVersion.textContent = 'Web';
        }
      }
    } catch (error) {
      console.error('Failed to update app version:', error);
      // 出错时也显示 Web 标识
      if (this.productVersion) {
        this.productVersion.textContent = 'Web';
      }
    }
  }
  
  /**
   * 加载 Happy AI 历史消息（委托给 ChatPanel）
   */
  async loadHappyMessageHistory() {
    await this.chatPanel.loadHappyMessageHistory();
  }

  /**
   * 清空对话框消息（委托给 ChatPanel）
   */
  clearAIMessages() {
    this.chatPanel.clearAIMessages();
  }

  /**
   * 更新 AI 状态显示（委托给 ChatPanel）
   */
  updateAIStatus(status) {
    this.chatPanel.updateAIStatus(status);
  }
  
  /**
   * 加载最新的使用量数据（委托给 ChatPanel）
   */
  async loadLatestUsage() {
    await this.chatPanel.loadLatestUsage();
  }

  /**
   * 切换 AI 连接（委托给 ChatPanel）
   */
  async toggleAIConnection() {
    await this.chatPanel.toggleAIConnection();
  }

  /**
   * 更新发送按钮状态（委托给 ChatPanel）
   */
  updateAISendButton() {
    this.chatPanel.updateAISendButton();
  }

  /**
   * 发送 AI 消息（委托给 ChatPanel）
   */
  async sendAIMessage() {
    await this.chatPanel.sendAIMessage();
  }

  /**
   * 添加 AI 消息到界面（委托给 ChatPanel）
   */
  addAIMessage(role, content, data = {}) {
    this.chatPanel.addAIMessage(role, content, data);
  }
  
  // ============ 工具卡片渲染 ============
  // 已迁移到 features/happy-ai/ToolCallRenderer.js，以下为委托方法

  /**
   * 添加工具调用消息（委托给 ToolCallRenderer）
   */
  addToolCallMessage(data) {
    this.toolCallRenderer.addToolCallMessage(data);
  }
  
  /**
   * 更新工具卡片状态（委托给 ToolCallRenderer）
   */
  updateToolCard(toolCard, tool) {
    this.toolCallRenderer.updateToolCard(toolCard, tool);
  }
  
  /**
   * 获取工具图标（委托给 ToolCallRenderer）
   */
  getToolIcon(toolName) {
    return this.toolCallRenderer.getToolIcon(toolName);
  }
  
  /**
   * 获取状态图标（委托给 ToolCallRenderer）
   */
  getStatusIcon(state) {
    return this.toolCallRenderer.getStatusIcon(state);
  }
  
  /**
   * 渲染工具内容（委托给 ToolCallRenderer）
   */
  renderToolContent(tool) {
    return this.toolCallRenderer.renderToolContent(tool);
  }
  
  /**
   * 渲染待办列表（委托给 ToolCallRenderer）
   */
  renderTodoList(tool) {
    return this.toolCallRenderer.renderTodoList(tool);
  }
  
  /**
   * 获取待办状态图标（委托给 ToolCallRenderer）
   */
  getTodoStatusIcon(status) {
    return this.toolCallRenderer.getTodoStatusIcon(status);
  }
  
  /**
   * 格式化工具输入显示（委托给 ToolCallRenderer）
   */
  formatToolInput(tool) {
    return this.toolCallRenderer.formatToolInput(tool);
  }
  
  /**
   * 格式化工具结果显示（委托给 ToolCallRenderer）
   */
  formatToolResult(tool) {
    return this.toolCallRenderer.formatToolResult(tool);
  }
  
  /**
   * 缩短路径显示（委托给 ToolCallRenderer）
   */
  shortenPath(path) {
    return this.toolCallRenderer.shortenPath(path);
  }
  
  /**
   * 启动工具计时器（委托给 ToolCallRenderer）
   */
  startToolTimer(toolId, startTime) {
    this.toolCallRenderer.startToolTimer(toolId, startTime);
  }
  
  /**
   * 停止工具计时器（委托给 ToolCallRenderer）
   */
  stopToolTimer(toolId) {
    this.toolCallRenderer.stopToolTimer(toolId);
  }
  
  /**
   * 渲染权限确认按钮（委托给 ToolCallRenderer）
   */
  renderPermissionFooter(tool) {
    return this.toolCallRenderer.renderPermissionFooter(tool);
  }
  
  /**
   * 绑定权限按钮事件（委托给 ToolCallRenderer）
   */
  bindPermissionButtons(toolCard, tool) {
    this.toolCallRenderer.bindPermissionButtons(toolCard, tool);
  }
  
  /**
   * 处理权限操作（委托给 ToolCallRenderer）
   */
  async handlePermissionAction(tool, action) {
    await this.toolCallRenderer.handlePermissionAction(tool, action);
  }
  
  /**
   * 为代码块添加复制按钮
   * @param {HTMLElement} container 容器元素
   */
  addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
      // 避免重复添加
      if (pre.querySelector('.code-copy-btn')) return;
      
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        try {
          const code = pre.querySelector('code')?.textContent || pre.textContent;
          await navigator.clipboard.writeText(code);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        } catch (error) {
          console.error('Copy failed:', error);
          btn.textContent = 'Failed';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        }
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }
  
  /**
   * 处理消息列表滚动事件
   */
  handleMessagesScroll() {
    if (!this.aiMessages) return;
    
    // 检查是否滚动到底部（允许 50px 误差）
    const isAtBottom = this.aiMessages.scrollHeight - this.aiMessages.scrollTop - this.aiMessages.clientHeight < 50;
    
    // 如果用户向上滚动，标记为用户滚动状态
    if (!isAtBottom) {
      this.isUserScrolling = true;
      
      // 清除之前的超时
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
      }
      
      // 5 秒后如果用户没有继续滚动，自动恢复
      this.scrollTimeout = setTimeout(() => {
        // 再次检查是否在底部
        const stillNotAtBottom = this.aiMessages.scrollHeight - this.aiMessages.scrollTop - this.aiMessages.clientHeight > 50;
        if (!stillNotAtBottom) {
          this.isUserScrolling = false;
        }
      }, 5000);
    } else {
      // 用户已滚动到底部，恢复自动滚动
      this.isUserScrolling = false;
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = null;
      }
    }
  }
  
  /**
   * 智能滚动到底部
   * 只有当用户没有主动向上滚动时才自动滚动
   */
  smartScrollToBottom() {
    if (!this.aiMessages) return;
    
    // 如果用户正在向上滚动查看历史，不自动滚动
    if (this.isUserScrolling) return;
    
    // 平滑滚动到底部
    this.aiMessages.scrollTo({
      top: this.aiMessages.scrollHeight,
      behavior: 'smooth'
    });
  }
  
  /**
   * 渲染 Markdown 内容
   * @param {string} text 原始文本
   * @returns {string} 渲染后的 HTML
   */
  renderMarkdown(text) {
    if (!text) return '';
    
    try {
      if (typeof marked !== 'undefined') {
        return marked.parse(text);
      }
      // 如果 marked 未加载，使用简单的换行转换
      return this.escapeHtml(text).replace(/\n/g, '<br>');
    } catch (e) {
      console.error('Markdown render failed:', e);
      return '<pre>' + this.escapeHtml(text) + '</pre>';
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
   * 高亮代码块
   * @param {HTMLElement} container 容器元素
   */
  highlightCodeBlocks(container) {
    if (typeof hljs !== 'undefined') {
      container.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  }

  // ============ 日志面板 ============
  // 已迁移到 components/LogViewer.js，以下为委托方法

  /**
   * 添加日志条目（委托给 LogViewer）
   */
  appendLog(log, autoScroll = true) {
    const shouldScroll = autoScroll && this.currentPanel === 'settings' && this.currentSettingsSection === 'logs';
    this.logViewer.append(log, shouldScroll);
  }

  /**
   * 创建日志条目元素（委托给 LogViewer）
   */
  createLogEntry(log) {
    return this.logViewer.createEntry(log);
  }

  /**
   * 渲染所有日志（委托给 LogViewer）
   */
  renderLogs() {
    this.logViewer.render();
  }

  /**
   * 清除日志（委托给 LogViewer）
   */
  async clearLogs() {
    await this.logViewer.clear(async () => {
      await window.appBridge.clearServerLogs?.();
    });
  }

  /**
   * 滚动日志到底部（委托给 LogViewer）
   */
  scrollLogsToBottom() {
    this.logViewer.scrollToBottom();
  }

  /**
   * 格式化时间（委托给 LogViewer）
   */
  formatTime(timestamp) {
    return this.logViewer.formatTime(timestamp);
  }

  // ============ 键盘快捷键 ============

  /**
   * 处理键盘事件
   */
handleKeyDown(e) {
    // F5 刷新
    if (e.key === 'F5') {
      e.preventDefault();
      // 如果在文件面板，刷新文件列表
      if (this.currentPanel === 'files') {
        this.refreshFileList();
      } else {
        this.refreshView();
      }
    }

    // Ctrl+Shift+I 开发者工具
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      this.toggleDevTools();
    }

    // Ctrl+1-3 切换展示栏面板
    if (e.ctrlKey && e.key >= '1' && e.key <= '3') {
      e.preventDefault();
      const panels = ['files', 'settings'];
      const index = parseInt(e.key) - 1;
      if (panels[index]) {
        this.switchPanel(panels[index]);
      }
    }

    // Ctrl+L 切换到设置面板（查看日志）
    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      this.switchPanel('settings');
    }
    
    // 文件面板快捷键
    if (this.currentPanel === 'files') {
      // Backspace 返回上级
      if (e.key === 'Backspace' && !this.isInputFocused()) {
        e.preventDefault();
        this.navigateFileBack();
      }
      
      // Delete 删除选中项
      if (e.key === 'Delete' && this.selectedFileItem && !this.isInputFocused()) {
        e.preventDefault();
        this.deleteFileItem(this.selectedFileItem);
      }
      
      // F2 重命名选中项
      if (e.key === 'F2' && this.selectedFileItem && !this.isInputFocused()) {
        e.preventDefault();
        this.showRenameDialog(this.selectedFileItem);
      }
      
      // Enter 打开选中项
      if (e.key === 'Enter' && this.selectedFileItem && !this.isInputFocused()) {
        e.preventDefault();
        this.openFileItem(this.selectedFileItem);
      }
      
      // Ctrl+W 关闭当前标签
      if (e.ctrlKey && e.key === 'w' && this.activeTabId) {
        e.preventDefault();
        this.closeFileTab(this.activeTabId);
      }
      
      // Ctrl+Tab / Ctrl+Shift+Tab 切换标签
      if (e.ctrlKey && e.key === 'Tab' && this.openTabs.length > 1) {
        e.preventDefault();
        const currentIndex = this.openTabs.findIndex(tab => tab.id === this.activeTabId);
        let nextIndex;
        if (e.shiftKey) {
          // 向前切换
          nextIndex = currentIndex > 0 ? currentIndex - 1 : this.openTabs.length - 1;
        } else {
          // 向后切换
          nextIndex = currentIndex < this.openTabs.length - 1 ? currentIndex + 1 : 0;
        }
        this.switchToTab(this.openTabs[nextIndex].id);
      }
    }
  }
  
  /**
   * 检查是否有输入框获得焦点
   * @returns {boolean}
   */
  isInputFocused() {
    const activeEl = document.activeElement;
    return activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );
  }

  // ============ Happy AI 设置方法 ============

  // ============ Claude Code 配置相关 ============

  // ============ Claude Code 配置相关（委托给 ClaudeCodeSettings 模块） ============

  /**
   * 加载 Claude Code 设置（委托给 ClaudeCodeSettings）
   */
  async loadClaudeCodeSettings() {
    await this.claudeCodeSettings?.load();
  }

  /**
   * 处理 Claude 提供商切换（委托给 ClaudeCodeSettings）
   */
  async onClaudeProviderChange() {
    await this.claudeCodeSettings?.onProviderChange();
  }

  /**
   * 切换 Claude Auth Token 显示/隐藏（委托给 ClaudeCodeSettings）
   */
  toggleClaudeTokenVisibility() {
    this.claudeCodeSettings?.toggleTokenVisibility();
  }

  /**
   * 更新 Claude Token 状态显示（委托给 ClaudeCodeSettings）
   * @param {boolean} hasToken 是否已配置
   */
  updateClaudeTokenStatus(hasToken) {
    this.claudeCodeSettings?.updateTokenStatus(hasToken);
  }

  /**
   * 保存 Claude Auth Token（委托给 ClaudeCodeSettings）
   */
  async saveClaudeAuthToken() {
    await this.claudeCodeSettings?.saveToken();
  }

  /**
   * 保存 Claude Code 设置（委托给 ClaudeCodeSettings）
   */
  async saveClaudeCodeSettings() {
    await this.claudeCodeSettings?.saveSettings();
  }

  // ============ 依赖检测相关（委托给 DependencyChecker 模块） ============

  /**
   * 加载依赖状态（委托给 DependencyChecker）
   */
  async loadDependencyStatus() {
    await this.dependencyChecker?.load();
  }

  /**
   * 刷新依赖状态（委托给 DependencyChecker）
   */
  async refreshDependencyStatus() {
    await this.dependencyChecker?.refresh();
  }

  /**
   * 更新 Node.js UI（委托给 DependencyChecker）
   * @param {Object} nodejs Node.js 状态
   */
  updateNodeJsUI(nodejs) {
    this.dependencyChecker?.updateNodeJsUI(nodejs);
  }

  /**
   * 更新 Happy Coder UI（委托给 DependencyChecker）
   * @param {Object} happyCoder Happy Coder 状态
   */
  updateHappyCoderUI(happyCoder) {
    this.dependencyChecker?.updateHappyCoderUI(happyCoder);
  }

  // ============ 软件更新方法 ============

  /**
   * 初始化更新 UI（显示当前版本）
   */
  async initUpdateUI() {
    try {
      // 检查 getAppVersion 方法是否存在且为函数
      if (typeof window.appBridge?.getAppVersion === 'function') {
        const versionInfo = await window.appBridge.getAppVersion();
        if (versionInfo && this.updateCurrentVersion) {
          this.updateCurrentVersion.textContent = `v${versionInfo.version}`;
        }
      } else if (this.updateCurrentVersion) {
        // Web 模式下显示 Web 标识
        this.updateCurrentVersion.textContent = 'Web';
      }
    } catch (error) {
      console.error('[Update] Failed to get app version:', error);
      // 出错时也显示 Web 标识
      if (this.updateCurrentVersion) {
        this.updateCurrentVersion.textContent = 'Web';
      }
    }
  }

  /**
   * 检查更新
   */
  async checkForUpdates() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      this.updateUpdateUI({ status: 'checking' });
      
      const result = await window.appBridge?.checkForUpdates();
      
      if (!result?.success) {
        this.updateUpdateUI({ status: 'error', error: { message: result?.error || t('settings.updateCheckFailed') } });
      }
    } catch (error) {
      console.error('[Update] Check failed:', error);
      this.updateUpdateUI({ status: 'error', error: { message: error.message } });
    }
  }

  /**
   * 下载更新
   */
  async downloadUpdate() {
    try {
      this.updateUpdateUI({ status: 'downloading', downloadProgress: { percent: 0 } });
      
      const result = await window.appBridge?.downloadUpdate();
      
      if (!result?.success) {
        const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
        this.updateUpdateUI({ status: 'error', error: { message: result?.error || t('settings.downloadFailed') } });
      }
    } catch (error) {
      console.error('[Update] Download failed:', error);
      this.updateUpdateUI({ status: 'error', error: { message: error.message } });
    }
  }

  /**
   * 退出并安装更新
   */
  quitAndInstall() {
    try {
      window.appBridge?.quitAndInstall();
    } catch (error) {
      console.error('[Update] Quit and install failed:', error);
    }
  }

  /**
   * 跳过更新（稍后提醒）
   */
  skipUpdate() {
    this.updateUpdateUI({ status: 'idle' });
    // 隐藏下载和跳过按钮
    if (this.btnDownloadUpdate) this.btnDownloadUpdate.style.display = 'none';
    if (this.btnSkipUpdate) this.btnSkipUpdate.style.display = 'none';
    if (this.btnCheckUpdate) this.btnCheckUpdate.style.display = '';
  }

  /**
   * 更新更新 UI 显示
   * @param {Object} data 状态数据 { status, updateInfo?, downloadProgress?, error? }
   */
  updateUpdateUI(data) {
    const { status, updateInfo, downloadProgress, error } = data;
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 更新徽章
    if (this.updateBadge) {
      // 移除所有状态类
      this.updateBadge.classList.remove('installed', 'update-available', 'update-downloading', 'update-ready', 'update-error');
      
      switch (status) {
        case 'checking':
          this.updateBadge.textContent = t('settings.checking');
          break;
        case 'available':
          this.updateBadge.classList.add('update-available');
          this.updateBadge.textContent = t('settings.updateAvailable');
          break;
        case 'not-available':
          this.updateBadge.classList.add('installed');
          this.updateBadge.textContent = t('settings.upToDate');
          break;
        case 'downloading':
          this.updateBadge.classList.add('update-downloading');
          this.updateBadge.textContent = t('settings.downloading');
          break;
        case 'downloaded':
          this.updateBadge.classList.add('update-ready');
          this.updateBadge.textContent = t('settings.updateReady');
          break;
        case 'error':
          this.updateBadge.classList.add('update-error');
          this.updateBadge.textContent = t('settings.updateError');
          break;
        default:
          this.updateBadge.classList.add('installed');
          this.updateBadge.textContent = t('settings.upToDate');
      }
    }
    
    // 更新新版本信息
    if (this.updateNewVersionRow && this.updateNewVersion) {
      if (updateInfo?.version && (status === 'available' || status === 'downloading' || status === 'downloaded')) {
        this.updateNewVersionRow.style.display = '';
        this.updateNewVersion.textContent = `v${updateInfo.version}`;
      } else {
        this.updateNewVersionRow.style.display = 'none';
      }
    }
    
    // 更新下载进度
    if (this.updateProgressRow && this.updateProgressText && this.updateProgressBar && this.updateProgressFill) {
      if (status === 'downloading' && downloadProgress) {
        this.updateProgressRow.style.display = '';
        this.updateProgressBar.style.display = '';
        const percent = Math.round(downloadProgress.percent || 0);
        this.updateProgressText.textContent = `${percent}%`;
        this.updateProgressFill.style.width = `${percent}%`;
      } else {
        this.updateProgressRow.style.display = 'none';
        this.updateProgressBar.style.display = 'none';
      }
    }
    
    // 更新按钮显示
    if (this.btnCheckUpdate) {
      this.btnCheckUpdate.style.display = (status === 'idle' || status === 'not-available' || status === 'error') ? '' : 'none';
      this.btnCheckUpdate.disabled = status === 'checking';
      if (status === 'checking') {
        this.btnCheckUpdate.textContent = t('settings.checking');
      } else {
        this.btnCheckUpdate.textContent = t('settings.checkUpdate');
      }
    }
    
    if (this.btnDownloadUpdate) {
      this.btnDownloadUpdate.style.display = status === 'available' ? '' : 'none';
    }
    
    if (this.btnInstallUpdate) {
      this.btnInstallUpdate.style.display = status === 'downloaded' ? '' : 'none';
    }
    
    if (this.btnSkipUpdate) {
      this.btnSkipUpdate.style.display = status === 'available' ? '' : 'none';
    }
  }

  // ============ Daemon 管理方法 ============
  // 已迁移到 features/settings/DaemonManager.js，以下为委托方法

  /**
   * 加载 daemon 状态（委托给 DaemonManager）
   */
  async loadDaemonStatus() {
    await this.daemonManager.loadStatus();
    // 同时加载 Claude Code 配置状态
    await this.updateDaemonClaudeCodeStatus();
  }

  /**
   * 更新 daemon UI 显示（委托给 DaemonManager）
   */
  updateDaemonUI(status) {
    this.daemonManager.updateUI(status);
  }

  /**
   * 更新 daemon Claude Code 注入状态显示
   * 注：此方法保留在 app.js 中，因为涉及特定 UI 元素
   */
  async updateDaemonClaudeCodeStatus() {
    try {
      const settings = await window.appBridge.getClaudeCodeSettings();
      const provider = settings?.provider || 'anthropic';
      const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
      
      if (this.daemonClaudeCodeStatus) {
        if (provider === 'anthropic') {
          this.daemonClaudeCodeStatus.textContent = t('settings.officialAnthropic');
          this.daemonClaudeCodeStatus.className = 'env-value';
        } else if (provider === 'deepseek') {
          this.daemonClaudeCodeStatus.textContent = t('settings.configuredDeepSeek');
          this.daemonClaudeCodeStatus.className = 'env-value configured';
        } else {
          this.daemonClaudeCodeStatus.textContent = t('settings.configuredCustom', { provider });
          this.daemonClaudeCodeStatus.className = 'env-value configured';
        }
      }
    } catch (error) {
      console.error('[updateDaemonClaudeCodeStatus] Error:', error);
    }
  }

  /**
   * 更新 daemon 控制按钮状态（委托给 DaemonManager）
   */
  updateDaemonButtons(isRunning, isOperating) {
    this.daemonManager.updateButtons(isRunning, isOperating);
  }

  /**
   * 启动 daemon（委托给 DaemonManager）
   */
  async startDaemon() {
    await this.daemonManager.start();
  }

  /**
   * 停止 daemon（委托给 DaemonManager）
   */
  async stopDaemon() {
    await this.daemonManager.stop();
  }

  /**
   * 重启 daemon（委托给 DaemonManager）
   */
  async restartDaemon() {
    await this.daemonManager.restart();
  }

  /**
   * 更新 Claude Code UI（委托给 DependencyChecker）
   * @param {Object} claudeCode Claude Code 状态
   */
  updateClaudeCodeUI(claudeCode) {
    this.dependencyChecker?.updateClaudeCodeUI(claudeCode);
  }

  /**
   * 格式化来源显示（委托给 DependencyChecker）
   * @param {string} source 来源
   * @returns {string}
   */
  formatSource(source) {
    return this.dependencyChecker?.formatSource(source) || source || '-';
  }

  /**
   * 缩短路径显示（委托给 DependencyChecker）
   * @param {string} path 路径
   * @returns {string}
   */
  shortenPath(path) {
    return this.dependencyChecker?.shortenPath(path) || path || '-';
  }

  /**
   * 打开 Node.js 安装指南（委托给 DependencyChecker）
   */
  async openNodeJsGuide() {
    await this.dependencyChecker?.openNodeJsGuide();
  }

  /**
   * 安装 Happy Coder（已弃用，功能移除）
   */
  async installHappyCoder() {
    // Happy Coder 安装功能已移除
    console.log('[installHappyCoder] Feature removed');
  }

  /**
   * 打开 Claude Code 安装指南（委托给 DependencyChecker）
   */
  async openClaudeCodeGuide() {
    await this.dependencyChecker?.openClaudeCodeGuide();
  }

  // ============ 设置相关（委托给 WorkspaceSettings 模块） ============

  /**
   * 加载所有 Happy AI 设置（委托给 WorkspaceSettings）
   */
  async loadWorkspaceSettings() {
    await this.workspaceSettings?.load();
    // 同步更新状态栏工作目录显示
    const workspaceDir = this.workspaceSettings?.getWorkspaceDir();
    this.updateStatusBarWorkspace(workspaceDir);
  }

  /**
   * 更新 Secret 状态显示（委托给 WorkspaceSettings）
   * @param {boolean} hasSecret 是否已配置
   */
  updateSecretStatus(hasSecret) {
    this.workspaceSettings?.updateSecretStatus(hasSecret);
  }

  /**
   * 切换 Secret 显示/隐藏（委托给 WorkspaceSettings）
   */
  toggleSecretVisibility() {
    this.workspaceSettings?.toggleSecretVisibility();
  }

  /**
   * 保存 Happy Secret（委托给 WorkspaceSettings）
   */
  async saveHappySecret() {
    await this.workspaceSettings?.saveHappySecret();
  }

  /**
   * 权限模式变更处理（委托给 WorkspaceSettings）
   */
  async onPermissionModeChange() {
    await this.workspaceSettings?.onPermissionModeChange();
  }

  /**
   * 更新权限模式提示（委托给 WorkspaceSettings）
   * @param {string} mode Permission mode
   */
  updatePermissionModeHint(mode) {
    this.workspaceSettings?.updatePermissionModeHint(mode);
  }

  /**
   * Update theme mode hint
   * @param {HTMLElement} hintEl Hint element
   * @param {string} mode Theme mode
   */
  updateThemeHint(hintEl, mode) {
    if (!hintEl) return;

    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    const currentTheme = ThemeManager.getTheme();
    const themeText = currentTheme === 'dark' ? t('settings.themeDark') : t('settings.themeLight');

    const hints = {
      'system': `${t('settings.themeHint').split(':')[0]}: ${themeText}`,
      'light': t('settings.themeHintLight'),
      'dark': t('settings.themeHintDark')
    };

    hintEl.textContent = hints[mode] || '';
  }
  
  /**
   * Update TOOL_CONFIGS titles when language changes
   */
  updateToolConfigTitles() {
    if (typeof I18nManager === 'undefined') return;
    
    const t = I18nManager.t.bind(I18nManager);
    
    // Update knownTools titles
    if (this.knownTools) {
      this.knownTools['TodoWrite'].title = t('tools.todoWrite');
      this.knownTools['TodoRead'].title = t('tools.todoRead');
      this.knownTools['Bash'].title = t('tools.bash');
      this.knownTools['Edit'].title = t('tools.editFile');
      this.knownTools['Write'].title = t('tools.writeFile');
      this.knownTools['Read'].title = t('tools.readFile');
      this.knownTools['Glob'].title = t('tools.globTool');
      this.knownTools['Grep'].title = t('tools.grepTool');
      this.knownTools['LS'].title = t('tools.lsTool');
      this.knownTools['Task'].title = t('tools.subagent');
      this.knownTools['WebSearch'].title = t('tools.webSearch');
      this.knownTools['WebFetch'].title = t('tools.webFetch');
      this.knownTools['AskUserQuestion'].title = t('tools.askUser');
    }
  }

  /**
   * 保存 Happy AI 设置（委托给 WorkspaceSettings）
   */
  async saveHappySettings() {
    await this.workspaceSettings?.saveHappySettings();
  }

  /**
   * 显示重启提示
   */
  showRestartPrompt() {
    if (this.restartSection) {
      this.restartSection.style.display = 'block';
    }
  }

  /**
   * 隐藏重启提示
   */
  hideRestartPrompt() {
    if (this.restartSection) {
      this.restartSection.style.display = 'none';
    }
  }

  /**
   * 重启应用
   */
  async restartApp() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    try {
      this.showNotification(t('notifications.restartingApp'), 'info');
      await window.appBridge.restartApp();
    } catch (error) {
      console.error('[restartApp] Error:', error);
      this.showNotification(t('notifications.restartFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 选择工作目录
   */
  async selectWorkspaceDir() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      const result = await window.appBridge?.selectWorkspaceDir?.();

      if (result?.success && result.path) {
        console.log('[selectWorkspaceDir] Selected:', result.path);

        // 显示切换中状态
        this.showNotification(t('notifications.switchingWorkDir'), 'info');
        
        // 热切换工作目录
        const switchResult = await window.appBridge?.switchWorkDir?.(result.path);

        if (switchResult?.success) {
          // 更新显示
          if (this.workspaceDirInput) {
            this.workspaceDirInput.value = result.path;
          }
          
          // 更新状态栏工作目录显示
          this.updateStatusBarWorkspace(result.path);

          // 重置文件面板状态并强制刷新
          this.workspaceRoot = null;
          this.currentFilePath = null;
          this.filePathHistory = [];
          
          // 强制刷新文件面板（无论当前在哪个面板）
          await this.initFilesPanel();

          // 清空对话框并重新加载对话历史
          this.clearAIMessages();
          await this.loadHappyMessageHistory();

          this.showNotification(t('notifications.workDirSwitched'), 'success');
          console.log('[selectWorkspaceDir] Switched to:', result.path, 'session:', switchResult?.sessionName);
        } else {
          this.showNotification(t('notifications.switchDirFailed') + ': ' + (switchResult?.error || t('errors.unknownError')), 'error');
        }
      }
    } catch (error) {
      console.error('[selectWorkspaceDir] Error:', error);
      this.showNotification(t('notifications.selectDirFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 重置为默认工作目录
   */
  async resetWorkspaceDir() {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      // 显示切换中状态
      this.showNotification(t('notifications.resettingToDefault'), 'info');
      
      const result = await window.appBridge?.resetWorkspaceDir?.();

      if (result?.success) {
        console.log('[resetWorkspaceDir] Reset successful');

        // 重新加载设置以更新显示（这会同步更新状态栏）
        await this.loadWorkspaceSettings();

        // 重置文件面板状态并强制刷新
        this.workspaceRoot = null;
        this.currentFilePath = null;
        this.filePathHistory = [];
        
        // 强制刷新文件面板（无论当前在哪个面板）
        await this.initFilesPanel();

        // 清空对话框并重新加载对话历史
        this.clearAIMessages();
        await this.loadHappyMessageHistory();

        this.showNotification(t('notifications.resetToDefault'), 'success');
      } else {
        this.showNotification(t('notifications.resetFailed') + ': ' + (result?.error || t('errors.unknownError')), 'error');
      }
    } catch (error) {
      console.error('[resetWorkspaceDir] Error:', error);
      this.showNotification(t('notifications.resetFailed') + ': ' + error.message, 'error');
    }
  }

  /**
   * 显示通知（委托给 NotificationManager）
   * @param {string} message 消息内容
   * @param {string} type 类型 ('info', 'success', 'error', 'warning')
   */
  showNotification(message, type = 'info') {
    NotificationManager.show(message, type);
  }

  // ============ 上下文使用量显示 ============

  // ============ 使用量显示 ============
  // 已迁移到 features/happy-ai/UsageDisplay.js，以下为委托方法

  /**
   * 从设置加载当前模型配置（委托给 UsageDisplay）
   */
  async loadModelConfig() {
    await this.usageDisplay.loadModelConfig();
    // 同步状态到 app（兼容性）
    this.currentModel = this.usageDisplay.currentModel;
    this.currentProvider = this.usageDisplay.currentProvider;
    this.currentModelConfig = this.usageDisplay.currentModelConfig;
  }

  /**
   * 获取当前模型的最大上下文大小（委托给 UsageDisplay）
   */
  getMaxContextSize() {
    return this.usageDisplay.getMaxContextSize();
  }

  /**
   * 获取当前模型名称（委托给 UsageDisplay）
   */
  getCurrentModelName() {
    return this.usageDisplay.getCurrentModelName();
  }

  /**
   * 计算上下文警告级别（委托给 UsageDisplay）
   */
  getContextWarning(contextSize) {
    return this.usageDisplay.getContextWarning(contextSize);
  }

  /**
   * 格式化 token 数量显示（委托给 UsageDisplay）
   */
  formatTokensDisplay(tokens) {
    return this.usageDisplay.formatTokensDisplay(tokens);
  }

  /**
   * 更新上下文使用量显示（委托给 UsageDisplay）
   */
  updateUsageDisplay(usage) {
    this.usageData = usage;
    this.usageDisplay.updateUsageDisplay(usage);
  }

  /**
   * 隐藏上下文使用量显示（委托给 UsageDisplay）
   */
  hideUsageDisplay() {
    this.usageDisplay.hideUsageDisplay();
  }

  // ============ Explorer 模块方法 ============
  // 已迁移到 features/explorer/ExplorerModule.js，以下为委托方法

  /**
   * 初始化 Explorer 模块（委托给 ExplorerModule）
   */
  async initExplorerModule() {
    try {
      await this.explorerModule.init();
      console.log('[Explorer] Explorer module initialized via ExplorerModule');
    } catch (error) {
      console.error('[Explorer] Failed to initialize ExplorerModule:', error);
    }
  }

  /**
   * 连接 Explorer SSE（委托给 ExplorerModule）
   */
  async connectExplorerSSE() {
    await this.explorerModule.connectSSE();
  }

  /**
   * 设置 Explorer SSE 事件监听（委托给 ExplorerModule）
   */
  setupExplorerEvents() {
    this.explorerModule.setupSSEEvents();
  }

  /**
   * 更新 Explorer 状态（委托给 ExplorerModule）
   */
  updateExplorerStatus(state) {
    this.explorerModule.updateStatus(state);
  }

  /**
   * 处理文件变化事件（委托给 ExplorerModule）
   */
  handleFileChangeEvent(data) {
    this.explorerModule.handleFileChangeEvent(data);
  }

  /**
   * 处理结构更新事件（委托给 ExplorerModule）
   */
  handleStructureUpdateEvent(data) {
    this.explorerModule.handleStructureUpdateEvent(data);
  }

  /**
   * 高亮变化的文件（委托给 ExplorerModule）
   */
  highlightChangedFile(filePath, changeType) {
    this.explorerModule.highlightChangedFile(filePath, changeType);
  }

  /**
   * 打开文件预览（委托给 ExplorerModule）
   */
  async openFilePreview(filePath) {
    await this.explorerModule.openFilePreview(filePath);
  }

  /**
   * 关闭文件预览（委托给 ExplorerModule）
   */
  closeFilePreview() {
    this.explorerModule.closeFilePreview();
  }

  // ============ 对话模式展示区（Chat Showcase）============

  /**
   * 打开对话模式文件预览
   * 当用户在对话中点击文件引用标签时调用
   * @param {string} filePath 文件路径
   */
  async openChatFilePreview(filePath) {
    console.log('[App] Opening chat file preview:', filePath);
    
    // 打开展示区
    this.openChatShowcase();
    
    // 读取文件内容并显示
    await this.loadFileIntoShowcase(filePath);
  }

  /**
   * 打开对话模式展示区
   */
  openChatShowcase() {
    const showcase = document.getElementById('chat-showcase');
    if (showcase) {
      showcase.classList.add('open');
      this.chatShowcaseOpen = true;
      console.log('[App] Chat showcase opened');
    }
  }

  /**
   * 关闭对话模式展示区
   */
  closeChatShowcase() {
    const showcase = document.getElementById('chat-showcase');
    if (showcase) {
      showcase.classList.remove('open');
      this.chatShowcaseOpen = false;
      this.showcaseTabs = [];
      this.activeShowcaseTabId = null;
      console.log('[App] Chat showcase closed');
    }
  }

  /**
   * 切换对话模式展示区
   */
  toggleChatShowcase() {
    if (this.chatShowcaseOpen) {
      this.closeChatShowcase();
    } else {
      this.openChatShowcase();
    }
  }

  /**
   * 加载文件到展示区
   * @param {string} filePath 文件路径
   */
  async loadFileIntoShowcase(filePath) {
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    // 获取文件名和图标
    const fileName = window.FileTagParser?.getFileNameFromPath?.(filePath) || filePath.split(/[\/\\]/).pop() || filePath;
    const fileIcon = window.FileTagParser?.getDefaultFileIcon?.(filePath) || '📄';
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    
    // 重置编辑状态
    this.toggleShowcaseEdit(false);
    
    // 更新 UI
    const previewIcon = document.getElementById('showcase-preview-icon');
    const previewFilename = document.getElementById('showcase-preview-filename');
    const previewCode = document.getElementById('showcase-preview-code');
    const markdownPreview = document.getElementById('showcase-markdown-preview');
    const previewIframe = document.getElementById('showcase-preview-iframe');
    const editArea = document.getElementById('showcase-edit-area');
    
    if (previewIcon) previewIcon.textContent = fileIcon;
    if (previewFilename) previewFilename.textContent = fileName;
    if (previewCode) previewCode.innerHTML = `<code>${t('common.loading') || 'Loading...'}</code>`;
    
    // 隐藏所有预览元素
    if (previewCode) previewCode.style.display = 'none';
    if (markdownPreview) markdownPreview.style.display = 'none';
    if (previewIframe) previewIframe.style.display = 'none';
    if (editArea) editArea.style.display = 'none';
    
    // 添加或激活 Tab
    this.addOrActivateShowcaseTab(filePath, fileName, fileIcon);
    
    try {
      let content = null;
      
      // 优先使用 Explorer HTTP API
      if (this.explorerModule?.explorerManager && this.explorerModule.explorerConnected) {
        try {
          const result = await this.explorerModule.explorerManager.readFile(filePath);
          if (result.status === 'success') {
            content = result.content;
          }
        } catch (e) {
          console.warn('[App] Showcase HTTP API failed:', e.message);
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
      
      // 更新 Tab 内容缓存
      const tab = this.showcaseTabs?.find(t => t.path === filePath);
      if (tab) {
        tab.content = content;
        tab.originalContent = content;
      }
      
      // 渲染内容
      const markdownExts = ['md', 'markdown'];
      const htmlExts = ['html', 'htm'];
      const isMarkdown = markdownExts.includes(ext);
      const isHtml = htmlExts.includes(ext);
      const renderableExts = [...markdownExts, ...htmlExts];
      
      // 根据视图模式和文件类型渲染
      if (isMarkdown || isHtml) {
        // HTML/Markdown 默认显示渲染模式
        this.showcaseViewMode = 'rendered';
        
        // 显示视图切换按钮
        const viewToggle = document.getElementById('showcase-view-toggle');
        if (viewToggle) viewToggle.style.display = 'inline-flex';
        
        // 更新切换按钮状态
        const sourceBtn = document.getElementById('showcase-source-btn');
        const renderBtn = document.getElementById('showcase-render-btn');
        sourceBtn?.classList.remove('active');
        renderBtn?.classList.add('active');
        
        // 隐藏源码，显示渲染
        if (previewCode) previewCode.style.display = 'none';
        
        if (isMarkdown && markdownPreview) {
          markdownPreview.style.display = 'block';
          if (typeof marked !== 'undefined') {
            markdownPreview.innerHTML = marked.parse(content || '');
            // 语法高亮代码块
            if (typeof hljs !== 'undefined') {
              markdownPreview.querySelectorAll('pre code').forEach(block => {
                try { hljs.highlightElement(block); } catch (e) {}
              });
            }
          } else {
            markdownPreview.innerHTML = `<pre>${this.escapeHtml(content || '')}</pre>`;
          }
        } else if (isHtml && previewIframe) {
          // 渲染 HTML 到 iframe
          const tab = this.showcaseTabs?.find(t => t.path === filePath);
          if (tab) {
            tab.content = content;
            this.renderShowcaseHtmlPreview(tab);
          }
        }
      } else {
        // 代码文件渲染
        if (previewCode) {
          previewCode.style.display = 'block';
          const code = previewCode.querySelector('code') || previewCode;
          code.textContent = content;
          
          // 语法高亮
          if (typeof hljs !== 'undefined') {
            hljs.highlightElement(code);
          }
        }
        // 隐藏视图切换按钮
        const viewToggle = document.getElementById('showcase-view-toggle');
        if (viewToggle) viewToggle.style.display = 'none';
      }
      
    } catch (error) {
      console.error('[App] Failed to load file:', error);
      if (previewCode) {
        previewCode.style.display = 'block';
        previewCode.innerHTML = `<code class="error">${t('errors.loadFailed')}: ${error.message}</code>`;
      }
    }
  }

  /**
   * 添加或激活展示区 Tab
   * @param {string} filePath 文件路径
   * @param {string} fileName 文件名
   * @param {string} fileIcon 文件图标
   */
  addOrActivateShowcaseTab(filePath, fileName, fileIcon) {
    if (!this.showcaseTabs) {
      this.showcaseTabs = [];
    }
    
    // 检查是否已存在
    let tab = this.showcaseTabs.find(t => t.path === filePath);
    
    if (!tab) {
      // 创建新 Tab
      tab = {
        id: `showcase-tab-${Date.now()}`,
        path: filePath,
        name: fileName,
        icon: fileIcon,
        content: null,
        originalContent: null,
        isDirty: false
      };
      this.showcaseTabs.push(tab);
    }
    
    // 激活此 Tab
    this.activeShowcaseTabId = tab.id;
    
    // 渲染 Tab 栏
    this.renderShowcaseTabs();
  }

  /**
   * 渲染展示区 Tab 栏
   */
  renderShowcaseTabs() {
    const container = document.getElementById('showcase-tabs-scroll');
    if (!container || !this.showcaseTabs) return;
    
    container.innerHTML = '';
    
    this.showcaseTabs.forEach(tab => {
      const tabEl = document.createElement('div');
      const classes = ['showcase-tab'];
      if (tab.id === this.activeShowcaseTabId) classes.push('active');
      if (tab.isDirty) classes.push('dirty');
      tabEl.className = classes.join(' ');
      tabEl.dataset.tabId = tab.id;
      tabEl.dataset.filePath = tab.path;
      
      tabEl.innerHTML = `
        <span class="showcase-tab-icon">${tab.icon}</span>
        <span class="showcase-tab-name">${this.escapeHtml(tab.name)}</span>
        <span class="showcase-tab-close">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </span>
      `;
      
      // Tab 点击事件（切换）
      tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.showcase-tab-close')) {
          this.switchShowcaseTab(tab.id);
        }
      });
      
      // 关闭按钮事件
      const closeBtn = tabEl.querySelector('.showcase-tab-close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeShowcaseTab(tab.id);
      });
      
      container.appendChild(tabEl);
    });
  }

  /**
   * 切换展示区 Tab
   * @param {string} tabId Tab ID
   */
  async switchShowcaseTab(tabId) {
    const tab = this.showcaseTabs?.find(t => t.id === tabId);
    if (!tab) return;
    
    this.activeShowcaseTabId = tabId;
    this.renderShowcaseTabs();
    
    // 如果有缓存内容，直接显示；否则重新加载
    if (tab.content) {
      this.displayShowcaseContent(tab);
    } else {
      await this.loadFileIntoShowcase(tab.path);
    }
  }

  /**
   * 显示展示区内容（使用缓存）
   * @param {Object} tab Tab 对象
   */
  displayShowcaseContent(tab) {
    const ext = tab.path.split('.').pop()?.toLowerCase() || '';
    const previewIcon = document.getElementById('showcase-preview-icon');
    const previewFilename = document.getElementById('showcase-preview-filename');
    const previewCode = document.getElementById('showcase-preview-code');
    const markdownPreview = document.getElementById('showcase-markdown-preview');
    const previewIframe = document.getElementById('showcase-preview-iframe');
    const editArea = document.getElementById('showcase-edit-area');
    
    if (previewIcon) previewIcon.textContent = tab.icon;
    if (previewFilename) previewFilename.textContent = tab.name;
    
    // 隐藏所有预览元素
    if (previewCode) previewCode.style.display = 'none';
    if (markdownPreview) markdownPreview.style.display = 'none';
    if (previewIframe) previewIframe.style.display = 'none';
    if (editArea) editArea.style.display = 'none';
    
    // 退出编辑模式
    this.toggleShowcaseEdit(false);
    
    // 更新未保存状态
    const unsavedEl = document.getElementById('showcase-unsaved');
    if (unsavedEl) unsavedEl.style.display = tab.isDirty ? 'inline' : 'none';
    
    const markdownExts = ['md', 'markdown'];
    const htmlExts = ['html', 'htm'];
    const isMarkdown = markdownExts.includes(ext);
    const isHtml = htmlExts.includes(ext);
    const renderableExts = [...markdownExts, ...htmlExts];
    
    // 显示/隐藏视图切换按钮
    const viewToggle = document.getElementById('showcase-view-toggle');
    if (viewToggle) {
      viewToggle.style.display = renderableExts.includes(ext) ? 'inline-flex' : 'none';
    }
    
    const sourceBtn = document.getElementById('showcase-source-btn');
    const renderBtn = document.getElementById('showcase-render-btn');
    
    if (isMarkdown || isHtml) {
      // HTML/Markdown 默认显示渲染模式
      this.showcaseViewMode = 'rendered';
      sourceBtn?.classList.remove('active');
      renderBtn?.classList.add('active');
      
      if (isMarkdown && markdownPreview) {
        markdownPreview.style.display = 'block';
        if (typeof marked !== 'undefined') {
          markdownPreview.innerHTML = marked.parse(tab.content || '');
          if (typeof hljs !== 'undefined') {
            markdownPreview.querySelectorAll('pre code').forEach(block => {
              try { hljs.highlightElement(block); } catch (e) {}
            });
          }
        } else {
          markdownPreview.innerHTML = `<pre>${this.escapeHtml(tab.content || '')}</pre>`;
        }
      } else if (isHtml) {
        this.renderShowcaseHtmlPreview(tab);
      }
    } else {
      // 其他文件显示源码
      this.showcaseViewMode = 'source';
      sourceBtn?.classList.add('active');
      renderBtn?.classList.remove('active');
      
      if (previewCode) {
        previewCode.style.display = 'block';
        const code = previewCode.querySelector('code') || previewCode;
        code.textContent = tab.content;
        if (typeof hljs !== 'undefined') {
          hljs.highlightElement(code);
        }
      }
    }
  }

  /**
   * 关闭展示区 Tab
   * @param {string} tabId Tab ID
   */
  closeShowcaseTab(tabId) {
    if (!this.showcaseTabs) return;
    
    const tabIndex = this.showcaseTabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    this.showcaseTabs.splice(tabIndex, 1);
    
    // 如果没有 Tab 了，关闭展示区
    if (this.showcaseTabs.length === 0) {
      this.closeChatShowcase();
      return;
    }
    
    // 如果关闭的是当前激活的 Tab，切换到相邻 Tab
    if (this.activeShowcaseTabId === tabId) {
      const newIndex = Math.min(tabIndex, this.showcaseTabs.length - 1);
      this.switchShowcaseTab(this.showcaseTabs[newIndex].id);
    } else {
      this.renderShowcaseTabs();
    }
  }

  /**
   * 初始化展示区事件
   */
  initChatShowcaseEvents() {
    // 顶栏展示区切换按钮
    const toggleBtn = document.getElementById('showcase-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
      this.toggleChatShowcase();
      this.updateShowcaseToggleBtn();
    });
    
    // 关闭按钮
    const closeBtn = document.getElementById('showcase-close-btn');
    closeBtn?.addEventListener('click', () => {
      this.closeChatShowcase();
      this.updateShowcaseToggleBtn();
    });
    
    // 编辑按钮
    const editBtn = document.getElementById('showcase-edit-btn');
    editBtn?.addEventListener('click', () => {
      this.toggleShowcaseEdit(true);
    });
    
    // 保存按钮
    const saveBtn = document.getElementById('showcase-save-btn');
    saveBtn?.addEventListener('click', () => {
      this.saveShowcaseFile();
    });
    
    // 取消按钮
    const cancelBtn = document.getElementById('showcase-cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      this.cancelShowcaseEdit();
    });
    
    // 编辑区内容变化监听
    const editArea = document.getElementById('showcase-edit-area');
    editArea?.addEventListener('input', () => {
      this.showcaseUnsaved = true;
      const unsavedEl = document.getElementById('showcase-unsaved');
      if (unsavedEl) unsavedEl.style.display = 'inline';
      
      // 更新 Tab 脏状态
      const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
      if (tab) {
        tab.isDirty = true;
        tab.content = editArea.value;
        this.renderShowcaseTabs();
      }
    });
    
    // 视图切换按钮
    const sourceBtn = document.getElementById('showcase-source-btn');
    const renderBtn = document.getElementById('showcase-render-btn');
    
    sourceBtn?.addEventListener('click', () => {
      this.switchShowcaseView('source');
    });
    
    renderBtn?.addEventListener('click', () => {
      this.switchShowcaseView('rendered');
    });
    
    // 会话文件侧边栏折叠按钮
    const sidebarToggle = document.getElementById('session-files-toggle');
    sidebarToggle?.addEventListener('click', () => {
      this.toggleSessionFilesSidebar();
    });
  }

  // ============ 会话文件管理 ============

  /**
   * 添加会话文件记录
   * @param {string} filePath 文件路径
   * @param {string} action 操作类型: 'created' | 'edited' | 'read'
   */
  addSessionFile(filePath, action = 'edited') {
    if (!filePath) return;
    
    // 检查是否已存在
    const existingIndex = this.sessionFiles.findIndex(f => f.path === filePath);
    
    if (existingIndex >= 0) {
      // 更新操作类型（优先级：created > edited > read）
      const existing = this.sessionFiles[existingIndex];
      if (action === 'created' || (action === 'edited' && existing.action === 'read')) {
        existing.action = action;
      }
      existing.timestamp = Date.now();
    } else {
      // 添加新文件
      const fileName = window.FileTagParser?.getFileNameFromPath?.(filePath) || filePath.split(/[\/\\]/).pop() || filePath;
      const fileIcon = window.FileTagParser?.getDefaultFileIcon?.(filePath) || '📄';
      
      this.sessionFiles.push({
        path: filePath,
        name: fileName,
        icon: fileIcon,
        action: action,
        timestamp: Date.now()
      });
    }
    
    // 渲染侧边栏
    this.renderSessionFiles();
  }

  /**
   * 渲染会话文件列表
   */
  renderSessionFiles() {
    const container = document.getElementById('session-files-list');
    const emptyEl = document.getElementById('session-files-empty');
    
    if (!container) return;
    
    // 清空列表（保留空状态元素）
    const items = container.querySelectorAll('.session-file-item');
    items.forEach(item => item.remove());
    
    if (this.sessionFiles.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
      return;
    }
    
    if (emptyEl) emptyEl.style.display = 'none';
    
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    const actionLabels = {
      created: t('toolCall.fileCreated') || 'Created',
      edited: t('toolCall.fileEdited') || 'Edited',
      read: t('toolCall.fileRead') || 'Read'
    };
    
    // 按时间倒序排列
    const sortedFiles = [...this.sessionFiles].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedFiles.forEach(file => {
      const item = document.createElement('div');
      item.className = 'session-file-item';
      item.dataset.filePath = file.path;
      
      // 检查是否是当前活动的文件
      const activeTab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
      if (activeTab && activeTab.path === file.path) {
        item.classList.add('active');
      }
      
      item.innerHTML = `
        <span class="session-file-icon">${file.icon}</span>
        <div class="session-file-info">
          <span class="session-file-name" title="${this.escapeHtml(file.path)}">${this.escapeHtml(file.name)}</span>
          <span class="session-file-action ${file.action}">${actionLabels[file.action] || file.action}</span>
        </div>
      `;
      
      // 双击打开文件
      item.addEventListener('dblclick', () => {
        this.openChatFilePreview(file.path);
      });
      
      // 单击选中
      item.addEventListener('click', () => {
        container.querySelectorAll('.session-file-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      
      container.appendChild(item);
    });
  }

  /**
   * 切换会话文件侧边栏折叠状态
   */
  toggleSessionFilesSidebar() {
    const sidebar = document.getElementById('session-files-sidebar');
    sidebar?.classList.toggle('collapsed');
  }

  /**
   * 清空会话文件列表
   */
  clearSessionFiles() {
    this.sessionFiles = [];
    this.renderSessionFiles();
  }

  /**
   * 更新展示区切换按钮状态
   */
  updateShowcaseToggleBtn() {
    const toggleBtn = document.getElementById('showcase-toggle-btn');
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', this.chatShowcaseOpen);
    }
  }

  /**
   * 切换展示区视图模式
   * @param {string} mode 'source' | 'rendered'
   */
  switchShowcaseView(mode) {
    this.showcaseViewMode = mode;
    
    const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
    if (!tab) return;
    
    const ext = tab.path.split('.').pop()?.toLowerCase() || '';
    const previewCode = document.getElementById('showcase-preview-code');
    const markdownPreview = document.getElementById('showcase-markdown-preview');
    const previewIframe = document.getElementById('showcase-preview-iframe');
    const sourceBtn = document.getElementById('showcase-source-btn');
    const renderBtn = document.getElementById('showcase-render-btn');
    
    const markdownExts = ['md', 'markdown'];
    const htmlExts = ['html', 'htm'];
    const isMarkdown = markdownExts.includes(ext);
    const isHtml = htmlExts.includes(ext);
    
    if (mode === 'source') {
      sourceBtn?.classList.add('active');
      renderBtn?.classList.remove('active');
      
      if (previewCode) previewCode.style.display = 'block';
      if (markdownPreview) markdownPreview.style.display = 'none';
      if (previewIframe) previewIframe.style.display = 'none';
    } else {
      sourceBtn?.classList.remove('active');
      renderBtn?.classList.add('active');
      
      if (previewCode) previewCode.style.display = 'none';
      
      if (isMarkdown && markdownPreview) {
        markdownPreview.style.display = 'block';
        if (previewIframe) previewIframe.style.display = 'none';
        if (typeof marked !== 'undefined') {
          markdownPreview.innerHTML = marked.parse(tab.content || '');
          // 语法高亮代码块
          if (typeof hljs !== 'undefined') {
            markdownPreview.querySelectorAll('pre code').forEach(block => {
              try { hljs.highlightElement(block); } catch (e) {}
            });
          }
        } else {
          markdownPreview.innerHTML = `<pre>${this.escapeHtml(tab.content || '')}</pre>`;
        }
      } else if (isHtml && previewIframe) {
        if (markdownPreview) markdownPreview.style.display = 'none';
        this.renderShowcaseHtmlPreview(tab);
      }
    }
  }

  /**
   * 渲染 HTML 预览到 iframe
   * @param {Object} tab Tab 对象
   */
  renderShowcaseHtmlPreview(tab) {
    const iframe = document.getElementById('showcase-preview-iframe');
    if (!iframe) return;
    
    iframe.style.display = 'block';
    
    // 检测运行环境
    const isWebMode = window.appBridge?._isPolyfill === true;
    
    if (tab.path && isWebMode) {
      // Web 模式：使用 HTTP 代理服务文件
      const baseUrl = window.apiAdapter?._baseUrl || 'http://localhost:3333';
      const filePath = tab.path.replace(/\\/g, '/');
      const serveUrl = `${baseUrl}/api/files/serve?path=${encodeURIComponent(filePath)}`;
      iframe.src = serveUrl;
    } else if (tab.path) {
      // Electron 模式：使用 file:// 协议
      const filePath = tab.path.replace(/\\/g, '/');
      const fileUrl = filePath.match(/^[a-zA-Z]:/) 
        ? `file:///${filePath}` 
        : `file://${filePath}`;
      iframe.src = fileUrl;
    } else if (tab.content) {
      // 只有内容没有路径时使用 srcdoc
      iframe.srcdoc = tab.content;
    }
  }

  /**
   * 切换展示区编辑模式
   * @param {boolean} editing 是否编辑中
   */
  toggleShowcaseEdit(editing) {
    this.showcaseIsEditing = editing;
    
    const previewCode = document.getElementById('showcase-preview-code');
    const markdownPreview = document.getElementById('showcase-markdown-preview');
    const previewIframe = document.getElementById('showcase-preview-iframe');
    const editArea = document.getElementById('showcase-edit-area');
    const editBtn = document.getElementById('showcase-edit-btn');
    const saveBtn = document.getElementById('showcase-save-btn');
    const cancelBtn = document.getElementById('showcase-cancel-btn');
    const viewToggle = document.getElementById('showcase-view-toggle');
    
    if (editing) {
      // 进入编辑模式
      const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
      
      if (previewCode) previewCode.style.display = 'none';
      if (markdownPreview) markdownPreview.style.display = 'none';
      if (previewIframe) previewIframe.style.display = 'none';
      if (editArea) {
        editArea.style.display = 'block';
        editArea.value = tab?.content || '';
        editArea.focus();
      }
      if (editBtn) editBtn.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'inline-block';
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      if (viewToggle) viewToggle.style.display = 'none';
    } else {
      // 退出编辑模式
      if (editArea) editArea.style.display = 'none';
      if (editBtn) editBtn.style.display = 'inline-block';
      if (saveBtn) saveBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      this.showcaseUnsaved = false;
      
      // 恢复视图切换按钮（如果是可渲染文件）
      const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
      if (tab) {
        const ext = tab.path.split('.').pop()?.toLowerCase() || '';
        const renderableExts = ['md', 'markdown', 'html', 'htm'];
        if (viewToggle && renderableExts.includes(ext)) {
          viewToggle.style.display = 'inline-flex';
        }
      }
    }
  }

  /**
   * 保存展示区文件
   */
  async saveShowcaseFile() {
    const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
    if (!tab) return;
    
    const editArea = document.getElementById('showcase-edit-area');
    const content = editArea?.value || '';
    const t = typeof I18nManager !== 'undefined' ? I18nManager.t.bind(I18nManager) : (k) => k;
    
    try {
      let success = false;
      
      // 优先使用 Explorer HTTP API
      if (this.explorerModule?.explorerManager && this.explorerModule.explorerConnected) {
        try {
          const result = await this.explorerModule.explorerManager.saveFile(tab.path, content);
          success = result.status === 'success';
        } catch (e) {
          console.warn('[App] Showcase HTTP API save failed:', e.message);
        }
      }
      
      // 回退到 IPC
      if (!success) {
        const result = await window.appBridge?.saveFileContent?.(tab.path, content);
        success = result?.success;
        if (!success) {
          throw new Error(result?.error || t('errors.saveFailed'));
        }
      }
      
      // 更新 Tab 状态
      tab.content = content;
      tab.originalContent = content;
      tab.isDirty = false;
      
      // 更新 UI
      const unsavedEl = document.getElementById('showcase-unsaved');
      if (unsavedEl) unsavedEl.style.display = 'none';
      
      this.renderShowcaseTabs();
      this.toggleShowcaseEdit(false);
      
      // 重新渲染内容
      const ext = tab.path.split('.').pop()?.toLowerCase() || '';
      const previewCode = document.getElementById('showcase-preview-code');
      if (previewCode) {
        previewCode.style.display = 'block';
        const code = previewCode.querySelector('code') || previewCode;
        code.textContent = content;
        if (typeof hljs !== 'undefined') {
          hljs.highlightElement(code);
        }
      }
      
      console.log('[App] Showcase file saved successfully');
      
    } catch (error) {
      console.error('[App] Failed to save showcase file:', error);
      alert(t('errors.saveFailed') + ': ' + error.message);
    }
  }

  /**
   * 取消展示区编辑
   */
  cancelShowcaseEdit() {
    const tab = this.showcaseTabs?.find(t => t.id === this.activeShowcaseTabId);
    if (tab) {
      // 恢复原始内容
      tab.content = tab.originalContent;
      tab.isDirty = false;
    }
    
    const unsavedEl = document.getElementById('showcase-unsaved');
    if (unsavedEl) unsavedEl.style.display = 'none';
    
    this.renderShowcaseTabs();
    this.toggleShowcaseEdit(false);
    
    // 重新显示内容
    if (tab) {
      this.displayShowcaseContent(tab);
    }
  }

  // ============ 委托方法（继续） ============

  /**
   * 生成唯一的标签 ID（委托给 ExplorerModule）
   */
  generateTabId() {
    return this.explorerModule.generateTabId();
  }

  /**
   * 根据文件路径查找标签（委托给 ExplorerModule）
   */
  findTabByPath(filePath) {
    return this.explorerModule.findTabByPath(filePath);
  }

  /**
   * 根据 ID 查找标签（委托给 ExplorerModule）
   */
  findTabById(tabId) {
    return this.explorerModule.findTabById(tabId);
  }

  /**
   * 创建新标签或激活已存在的标签（委托给 ExplorerModule）
   */
  createOrActivateTab(filePath, content, fileType) {
    return this.explorerModule.createOrActivateTab(filePath, content, fileType);
  }

  /**
   * 关闭文件标签页（委托给 ExplorerModule）
   */
  closeFileTab(tabId, force = false) {
    return this.explorerModule.closeTab(tabId, force);
  }

  /**
   * 关闭预览面板但不清空标签数据（委托给 ExplorerModule）
   */
  closeFilePreviewWithoutTabClear() {
    this.explorerModule.closeFilePreviewWithoutTabClear();
  }

  /**
   * 切换到指定标签（委托给 ExplorerModule）
   */
  async switchToTab(tabId) {
    await this.explorerModule.switchToTab(tabId);
  }

  /**
   * 渲染代码内容（委托给 ExplorerModule）
   */
  renderCodeContent(content, ext) {
    this.explorerModule.renderCodeContent(content, ext);
  }

  /**
   * 渲染标签栏（委托给 ExplorerModule）
   */
  renderTabs() {
    this.explorerModule.renderTabs();
  }

  /**
   * 重新排序标签（委托给 ExplorerModule）
   */
  reorderTabs(draggedTabId, targetTabId) {
    this.explorerModule.reorderTabs(draggedTabId, targetTabId);
  }

  /**
   * 显示标签右键菜单（委托给 ExplorerModule）
   */
  showTabContextMenu(e, tabId) {
    this.explorerModule.showTabContextMenu(e, tabId);
  }

  /**
   * 关闭其他标签（委托给 ExplorerModule）
   */
  closeOtherTabs(keepTabId) {
    this.explorerModule.closeOtherTabs(keepTabId);
  }

  /**
   * 关闭右侧标签（委托给 ExplorerModule）
   */
  closeTabsToRight(tabId) {
    this.explorerModule.closeTabsToRight(tabId);
  }

  /**
   * 关闭所有标签（委托给 ExplorerModule）
   */
  closeAllTabs() {
    this.explorerModule.closeAllTabs();
  }

  /**
   * 更新当前标签的脏状态（委托给 ExplorerModule）
   */
  updateCurrentTabDirty() {
    this.explorerModule.updateCurrentTabDirty();
  }

  /**
   * 切换文件编辑模式（委托给 ExplorerModule）
   */
  toggleFileEdit(editing) {
    this.explorerModule.toggleFileEdit(editing);
  }

  /**
   * 切换到分栏视图模式（委托给 ExplorerModule）
   */
  switchToSplitView() {
    this.explorerModule.switchToSplitView();
  }

  /**
   * 切换到单栏列表视图模式（委托给 ExplorerModule）
   */
  switchToListView() {
    this.explorerModule.switchToListView();
  }

  /**
   * 应用分栏宽度（委托给 ExplorerModule）
   */
  applySplitWidth() {
    this.explorerModule.applySplitWidth();
  }

  /**
   * 初始化分栏拖拽条（委托给 ExplorerModule）
   */
  initResizer() {
    this.explorerModule.initResizer();
  }

  /**
   * 切换预览视图模式（委托给 ExplorerModule）
   */
  togglePreviewView(mode) {
    this.explorerModule.togglePreviewView(mode);
  }

  /**
   * 渲染 HTML 内容到 iframe（委托给 ExplorerModule）
   */
  renderHtmlPreview(htmlContent) {
    this.explorerModule.renderHtmlPreview(htmlContent);
  }

  /**
   * 渲染 Markdown 内容（委托给 ExplorerModule）
   */
  renderMarkdownPreview(markdownContent) {
    this.explorerModule.renderMarkdownPreview(markdownContent);
  }

  /**
   * 渲染图片预览（委托给 ExplorerModule）
   */
  async renderImagePreview(filePath, ext, fileInfo) {
    await this.explorerModule.renderImagePreview(filePath, ext, fileInfo);
  }

  /**
   * 保存文件内容（委托给 ExplorerModule）
   */
  async saveFileContent() {
    await this.explorerModule.saveFileContent();
  }

  // ============ 文件管理器方法 ============
  // 已迁移到 panels/FilesPanel.js，以下为委托方法

  /**
   * 初始化文件面板（委托给 FilesPanel）
   */
  async initFilesPanel() {
    try {
      await this.filesPanel.init();
    } catch (error) {
      console.error('[initFilesPanel] Failed to initialize FilesPanel:', error);
    }
  }

  /**
   * 加载目录内容（委托给 FilesPanel）
   */
  async loadDirectory(dirPath) {
    await this.filesPanel.loadDirectory(dirPath);
  }

  /**
   * 显示文件加载中状态（委托给 FilesPanel）
   */
  showFilesLoading() {
    this.filesPanel.showLoading();
  }

  /**
   * 显示文件加载错误（委托给 FilesPanel）
   */
  showFilesError(message) {
    this.filesPanel.showError(message);
  }

  /**
   * 渲染面包屑导航（委托给 FilesPanel）
   */
  renderBreadcrumb(relativePath) {
    this.filesPanel.renderBreadcrumb(relativePath);
  }

  /**
   * 路径拼接（委托给 FilesPanel）
   */
  joinPath(base, segment) {
    return this.filesPanel.joinPath(base, segment);
  }

  /**
   * 渲染文件列表（委托给 FilesPanel）
   */
  renderFileList(items) {
    this.filesPanel.renderFileList(items);
  }

  /**
   * 创建文件项 DOM 元素（委托给 FilesPanel）
   */
  createFileItemElement(item) {
    return this.filesPanel.createFileItemElement(item);
  }

  /**
   * 获取文件图标（委托给 FilesPanel）
   */
  getFileIcon(item) {
    return this.filesPanel.getFileIcon(item);
  }

  /**
   * 格式化文件大小（委托给 FilesPanel）
   */
  formatFileSize(bytes) {
    return this.filesPanel.formatFileSize(bytes);
  }

  /**
   * 格式化文件日期（委托给 FilesPanel）
   */
  formatFileDate(isoDate) {
    return this.filesPanel.formatFileDate(isoDate);
  }

  /**
   * 处理文件单击（委托给 FilesPanel）
   */
  handleFileClick(e, item) {
    this.filesPanel.handleFileClick(e, item);
  }

  /**
   * 处理文件双击（委托给 FilesPanel）
   */
  handleFileDoubleClick(e, item) {
    this.filesPanel.handleFileDoubleClick(e, item);
  }

  /**
   * 打开文件项（委托给 FilesPanel）
   */
  async openFileItem(item) {
    await this.filesPanel.openItem(item);
  }

  /**
   * 处理文件右键菜单（委托给 FilesPanel）
   */
  handleFileContextMenu(e, item) {
    this.filesPanel.handleFileContextMenu(e, item);
  }

  /**
   * 显示文件右键菜单（委托给 FilesPanel）
   */
  showFileContextMenu(x, y, item) {
    this.filesPanel.showContextMenu(x, y, item);
  }

  /**
   * 隐藏文件右键菜单（委托给 FilesPanel）
   */
  hideFileContextMenu() {
    this.filesPanel.hideContextMenu();
  }

  /**
   * 处理右键菜单动作（委托给 FilesPanel）
   */
  async handleFileContextMenuAction(action) {
    await this.filesPanel.handleContextMenuAction(action);
  }

  /**
   * 删除文件项（委托给 FilesPanel）
   */
  async deleteFileItem(item) {
    await this.filesPanel.deleteItem(item);
  }

  /**
   * 导航到指定路径（委托给 FilesPanel）
   */
  async navigateToPath(path) {
    await this.filesPanel.navigateTo(path);
  }

  /**
   * 返回上级目录（委托给 FilesPanel）
   */
  async navigateFileBack() {
    await this.filesPanel.navigateBack();
  }

  /**
   * 更新返回按钮状态（委托给 FilesPanel）
   */
  updateBackButtonState() {
    this.filesPanel.updateBackButtonState();
  }

  /**
   * 刷新文件列表（委托给 FilesPanel）
   */
  async refreshFileList() {
    await this.filesPanel.refresh();
  }

  /**
   * 显示新建文件夹对话框（委托给 FilesPanel）
   */
  showNewFolderDialog() {
    this.filesPanel.showNewFolderDialog();
  }

  /**
   * 隐藏新建文件夹对话框（委托给 FilesPanel）
   */
  hideNewFolderDialog() {
    this.filesPanel.hideNewFolderDialog();
  }

  /**
   * 创建新文件夹（委托给 FilesPanel）
   */
  async createNewFolder() {
    await this.filesPanel.createNewFolder();
  }

  /**
   * 显示重命名对话框（委托给 FilesPanel）
   */
  showRenameDialog(item) {
    this.filesPanel.showRenameDialog(item);
  }

  /**
   * 隐藏重命名对话框（委托给 FilesPanel）
   */
  hideRenameDialog() {
    this.filesPanel.hideRenameDialog();
  }

  /**
   * 确认重命名（委托给 FilesPanel）
   */
  async confirmRename() {
    await this.filesPanel.confirmRename();
  }

  // ============================================================================
  // 账户管理方法（委托给 AccountSetup 模块）
  // ============================================================================

  /**
   * 加载账户信息（委托）
   */
  async loadAccountInfo() {
    return this.accountSetup?.loadAccountInfo();
  }

  /**
   * 显示重启提示（委托）
   */
  showRestartPrompt() {
    return this.accountSetup?.showRestartPrompt();
  }

  // ============ 设置向导相关方法（委托给 SetupWizard 模块） ============

  /**
   * 从设置页重新运行设置向导（委托）
   */
  async rerunSetupWizard() {
    return this.setupWizard?.rerun();
  }

  /**
   * 销毁应用
   */
  destroy() {
    // 取消所有事件监听
    this.unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    this.unsubscribers = [];
  }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  // 初始化主题管理器（优先执行，避免闪烁）
  ThemeManager.init();
  window.ThemeManager = ThemeManager;
  
  // 初始化应用
  window.app = new DeepSeekCoworkApp();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
  if (window.app) {
    window.app.destroy();
  }
});
