/**
 * 简体中文语言包
 * DeepSeek Cowork 中文界面
 */

(function() {
  const locale = {
    // 通用文本
    common: {
      save: '保存',
      cancel: '取消',
      confirm: '确定',
      ok: '确定',
      close: '关闭',
      delete: '删除',
      create: '创建',
      edit: '编辑',
      refresh: '刷新',
      loading: '加载中...',
      error: '错误',
      success: '成功',
      warning: '警告',
      info: '信息',
      yes: '是',
      no: '否',
      back: '返回',
      next: '下一步',
      previous: '上一步',
      skip: '跳过',
      start: '启动',
      stop: '停止',
      restart: '重启',
      saving: '保存中...',
      connecting: '连接中...',
      disconnecting: '断开中...',
      connect: '连接',
      disconnect: '断开',
      copy: '复制',
      copied: '已复制!',
      open: '打开',
      openFolder: '打开文件夹',
      showInExplorer: '在文件管理器中显示',
      rename: '重命名',
      newFolder: '新建文件夹',
      expandAll: '展开全部',
      expandAllArrow: '展开全部 ▼',
      collapseArrow: '收起 ▲',
      collapse: '收起',
      workDir: '工作目录',
      apply: '应用',
      reset: '重置',
      default: '默认',
      custom: '自定义',
      checking: '检测中...',
      rechecking: '重新检测中...',
      recheck: '重新检测',
      verifying: '验证中...',
      processing: '处理中...',
      confirmChange: '确认修改',
      notSet: '未设置'
    },
    
    // 标题栏
    titlebar: {
      close: '关闭',
      minimize: '最小化',
      maximize: '最大化'
    },
    
    // 侧边栏导航
    sidebar: {
      chat: '对话',
      files: '文件',
      browser: '浏览器',
      settings: '设置',
      fileManagement: '文件管理',
      browserManagement: '浏览器管理'
    },
    
    // 会话中心
    sessionHub: {
      title: '会话中心',
      switchDir: '切换到新工作目录',
      currentSession: '当前会话',
      noSessions: '暂无其他活动会话',
      loading: '加载中...',
      status: {
        idle: '空闲',
        processing: '处理中',
        connected: '已连接',
        disconnected: '未连接',
        thinking: '思考中',
        waiting: '等待中'
      }
    },
    
    // 对话面板
    chat: {
      title: '对话',
      agentStatus: 'Agent 状态',
      connected: '已连接',
      disconnected: '未连接',
      notConnected: '未连接',
      connect: '连接',
      disconnect: '断开',
      inputPlaceholder: '输入消息...',
      send: '发送',
      abort: '中止 (Esc)',
      welcomeTitle: '欢迎使用 DeepSeek Cowork',
      welcomeDesc: '连接后，您可以与 DeepSeek Cowork 对话来执行任务',
      homeWelcome: '欢迎使用 DeepSeek Cowork',
      homeTitle: '有什么可以帮您的？',
      homeInputPlaceholder: '描述您想要做什么...',
      contextInput: 'Input:',
      contextOutput: 'Output:',
      idle: 'idle',
      // 消息相关
      connectionFailed: '连接失败:',
      sendFailed: '发送失败:',
      contextCleared: '上下文已清空',
      unknownError: '未知错误',
      // Agent 状态消息
      agentConnected: 'Agent 已连接',
      agentDisconnected: 'Agent 连接已断开',
      agentError: 'Agent 错误',
      unknownReason: '未知原因',
      // 任务控制
      taskAborted: '任务已中止',
      abortFailed: '中止失败',
      // 复制功能
      copyCode: '复制代码',
      copyMessage: '复制消息',
      // 帮助命令
      availableCommands: '可用命令:',
      noDescription: '无描述',
      unknownCommand: '未知命令:'
    },
    
    // 浏览器面板
    browser: {
      title: '浏览器',
      refresh: '刷新',
      refreshTabs: '刷新标签页列表',
      activeTabs: '活动标签页',
      noTabs: '暂无打开的标签页',
      noTabsHint: '请确保浏览器扩展已安装并连接',
      // 按钮文本
      getHtml: 'HTML',
      getCookies: 'Cookies',
      saveCookies: '保存',
      savedCookies: '已保存',
      injectScript: '注入',
      closeTab: '关闭',
      // 通知消息
      htmlRequestSent: 'HTML 请求已发送',
      cookiesRequestSent: 'Cookies 请求已发送',
      htmlRequestFailed: '获取 HTML 失败',
      cookiesRequestFailed: '获取 Cookies 失败',
      saveCookiesSuccess: 'Cookies 已保存',
      saveCookiesFailed: '保存 Cookies 失败',
      // 标签卡片信息
      tabId: 'ID',
      tabWindow: '窗口',
      tabIndex: '索引',
      tabStatus: '状态'
    },
    
    // 文件面板
    files: {
      title: '文件管理',
      back: '返回上级',
      refresh: '刷新',
      newFolder: '新建',
      workingDir: '工作目录',
      emptyFolder: '文件夹为空',
      emptyFolderHint: '可以点击"新建"按钮创建文件夹',
      loadFailed: '加载失败',
      open: '打开',
      openWith: '用系统程序打开',
      rename: '重命名',
      showInExplorer: '在文件管理器中显示',
      delete: '删除',
      newFile: '新建文件',
      newFolder: '新建文件夹',
      newFolderDialog: {
        title: '新建文件夹',
        label: '文件夹名称',
        placeholder: '输入文件夹名称...',
        create: '创建',
        errorEmpty: '请输入文件夹名称',
        errorInvalid: '文件夹名称包含非法字符'
      },
      newFileDialog: {
        title: '新建文件',
        label: '文件名称',
        placeholder: '输入文件名称...',
        create: '创建'
      },
      renameDialog: {
        title: '重命名',
        label: '新名称',
        placeholder: '输入新名称...'
      }
    },
    
    // Explorer 服务
    explorer: {
      status: {
        title: 'Explorer 服务状态',
        online: '在线',
        offline: '离线',
        connecting: '连接中',
        reconnecting: '重连中'
      },
      preview: {
        edit: '编辑',
        save: '保存',
        close: '关闭',
        unsaved: '未保存',
        saved: '已保存',
        unsavedConfirm: '有未保存的更改，确定关闭吗？',
        unsupported: '此文件类型不支持预览',
        imageNotSupported: '图片预览暂不支持',
        sourceView: '源码',
        renderedView: '预览',
        // PDF 预览
        pdfPrev: '上一页',
        pdfNext: '下一页',
        pdfPage: '第 {current} 页，共 {total} 页',
        // 通用缩放
        zoomIn: '放大',
        zoomOut: '缩小',
        fit: '适应窗口',
        actualSize: '实际大小'
      },
      layout: {
        splitView: '分栏视图',
        singleView: '单栏视图'
      },
      events: {
        fileChanged: '文件已修改',
        fileAdded: '新增文件',
        fileDeleted: '文件已删除',
        folderAdded: '新增文件夹',
        folderDeleted: '文件夹已删除'
      },
      externalChange: {
        message: '文件已在外部被修改',
        reload: '重新载入',
        keep: '保留我的修改'
      },
      fileDeleted: '文件已被删除'
    },
    
    // 设置面板
    settings: {
      title: '设置',
      
      // 运行环境
      environment: '运行环境',
      refreshCheck: '刷新检测',
      systemVersion: '系统版本:',
      npmVersion: 'npm 版本:',
      electronBuiltin: 'Electron 内置:',
      notInstalled: '未安装',
      notInstalledOptional: '未安装（可选）',
      checking: '检测中...',
      version: '版本:',
      source: '来源:',
      path: '路径:',
      installGuide: '安装指南',
      connectionStatus: '连接状态',
      pid: 'PID:',
      port: '端口:',
      startTime: '启动时间:',
      running: '运行中',
      stopped: '已停止',
      daemonRunning: 'Daemon 运行中',
      
      // 服务器状态
      serverStatus: '服务器状态',
      extensionConnections: '扩展连接',
      
      // 软件更新
      softwareUpdate: '软件更新',
      currentVersion: '当前版本:',
      newVersion: '新版本:',
      downloadProgress: '下载进度:',
      checkUpdate: '检查更新',
      downloadUpdate: '立即下载',
      installUpdate: '重启并安装',
      skipUpdate: '稍后提醒',
      upToDate: '已是最新版本',
      updateAvailable: '有新版本',
      downloading: '下载中...',
      updateReady: '更新就绪',
      updateError: '更新失败',
      updateCheckFailed: '检查更新失败',
      downloadFailed: '下载更新失败',
      
      rerunWizard: '重新运行设置向导',
      rerunWizardHint: '如果遇到配置问题，可以重新运行设置向导',
      partialLimited: '部分功能将受限',
      
      // Claude Code 配置
      claudeCodeConfig: 'Claude Code 配置',
      apiProvider: 'API 提供商',
      providerAnthropic: 'Anthropic (官方)',
      providerDeepSeek: 'DeepSeek',
      providerCustom: '自定义',
      apiEndpoint: 'API 端点',
      apiEndpointHint: '留空使用默认端点',
      authToken: 'Auth Token',
      tokenPlaceholder: '输入 Token...',
      showHide: '显示/隐藏',
      modelName: '模型名称',
      timeout: '超时时间',
      timeoutHint: '默认 600000ms (10分钟)',
      disableNonessential: '禁用非必要流量',
      saveClaudeConfig: '保存 Claude Code 配置',
      configuredDeepSeek: '已配置 (DeepSeek)',
      configuredCustom: '已配置 ({provider})',
      officialAnthropic: '官方 Anthropic',
      configured: '已配置',
      installed: '已安装',
      notInstalled: '未安装',
      installedVersion: '已安装 v{version}',
      recommendedInstall: '推荐安装',
      apiProvider: 'API 提供商',
      
      // 账户管理
      accountManagement: '账户管理',
      status: '状态',
      anonymousId: '匿名 ID',
      accountServer: '账户服务器',
      notConfigured: '未配置',
      notConfiguredHint: '要使用 Agent 功能，请先配置账户',
      connected: '已连接',
      createAccount: '创建新账户',
      useExisting: '使用已有账户',
      secretKey: 'Secret Key',
      secretKeyHint: '这是恢复账户的唯一凭证，请妥善保管',
      show: '显示',
      hide: '隐藏',
      switchAccount: '切换账户',
      changeServer: '修改服务器',
      logout: '退出登录',
      
      // 对话设置
      conversationSettings: '对话设置',
      permissionMode: '权限模式',
      permissionDefault: '默认 (default)',
      permissionAcceptEdits: '接受编辑 (acceptEdits)',
      permissionPlan: '计划模式 (plan)',
      permissionYolo: 'YOLO (bypassPermissions)',
      permissionHintDefault: '默认模式：需要确认每个操作',
      permissionHintAcceptEdits: '接受编辑模式：自动接受文件修改',
      permissionHintPlan: '计划模式：仅生成计划，不执行',
      permissionHintYolo: 'YOLO 模式：执行所有操作无需确认',
      currentWorkDir: '当前工作目录',
      selectDir: '选择目录',
      resetDefault: '重置为默认',
      defaultDir: '默认目录',
      enterWorkspacePath: '请输入工作目录的完整路径：',
      
      // 外观设置
      appearance: '外观设置',
      language: '界面语言',
      themeMode: '主题模式',
      themeSystem: '跟随系统',
      themeLight: '浅色',
      themeDark: '深色',
      themeHint: '当前：跟随系统偏好',
      themeHintLight: '当前：浅色模式',
      themeHintDark: '当前：深色模式',
      
      // 服务器设置
      serverSettings: '服务器设置',
      httpPort: 'HTTP 端口',
      wsPort: 'WebSocket 端口',
      serverActions: '服务操作',
      restartServer: '重启服务',
      
      // 运行日志
      logs: '运行日志',
      clearLogs: '清除日志',
      
      // 重启提示
      restartRequired: '部分设置需要重启应用才能生效',
      restartNow: '立即重启',
      restartLater: '稍后重启'
    },
    
    // 对话框
    dialogs: {
      // 欢迎设置对话框
      welcomeSetup: {
        title: '设置 Agent',
        description: '要使用 Agent 功能，您需要配置 API Secret。',
        createNew: '创建新账户',
        createNewDesc: '生成新的 Secret Key，开始使用',
        useExisting: '使用已有 Secret Key',
        useExistingDesc: '输入您已有的 Secret Key 恢复账户',
        skipSetup: '稍后设置',
        skipHint: '（部分功能将不可用）'
      },
      
      // Secret 备份对话框
      secretBackup: {
        title: '您的 Secret Key',
        importantNotice: '重要提示',
        backupWarning: '这是恢复账户的唯一方式，请务必保存在安全的地方！',
        copyToClipboard: '复制到剪贴板',
        confirmSaved: '我已将 Secret Key 保存在安全的地方',
        confirmContinue: '确认并继续'
      },
      
      // Secret 输入对话框
      secretInput: {
        title: '输入 Secret Key',
        formatHint: '支持以下格式：',
        formatSegmented: '分段格式：XXXXX-XXXXX-XXXXX-...',
        formatBase64: 'Base64URL 格式',
        placeholder: '输入或粘贴 Secret Key...',
        verifyLogin: '验证并登录'
      },
      
      // 设置完成对话框
      setupComplete: {
        title: '设置完成',
        message: '您的账户已配置成功！',
        hint: '设置完成，现在可以开始使用了。',
        startUsing: '开始使用'
      },
      
      // 修改服务器对话框
      changeServer: {
        title: '修改服务器地址',
        currentServer: '当前服务器',
        newServer: '新服务器地址',
        newServerPlaceholder: '例如: api.deepseek-cowork.com',
        newServerHint: '留空使用默认服务器 (api.deepseek-cowork.com)',
        warning: '警告',
        warningText: '修改服务器将会：',
        warningLogout: '退出当前账户',
        warningClearData: '清除所有会话数据和聊天记录',
        warningReconfigure: '需要重新配置 API Secret',
        confirmChange: '确认修改'
      }
    },
    
    // 设置向导
    wizard: {
      title: '环境配置向导',
      subtitle: '完成以下配置以开始使用',
      
      // 步骤
      step1: '环境检测',
      step2: '安装依赖',
      step3: 'API 配置',
      step4: '浏览器扩展',
      step5: '完成',
      
      // 第一步
      envCheckTitle: '环境检测结果',
      envCheckDesc: '以下是当前环境的检测结果',
      skipConfig: '稍后配置',
      startConfig: '开始配置',
      
      // 第二步
      installClaudeTitle: '安装 Claude Code',
      installClaudeDesc: 'Claude Code 是必需的 DeepSeek Cowork 组件',
      viewDocs: '查看官方文档',
      recheck: '重新检测',
      
      // 第三步
      apiConfigTitle: '配置 API Key',
      apiConfigDesc: '选择 API 提供商并输入您的 API Key',
      apiProviderLabel: 'API 提供商',
      apiEndpointLabel: 'API 端点',
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: '输入您的 API Key...',
      apiKeyHint: '请输入您的 DeepSeek API Key',
      apiKeyHintAnthropic: '请输入您的 Anthropic API Key',
      apiKeyHintCustom: '请输入您的 API Key',
      modelNameLabel: '模型名称',
      saveConfig: '保存配置',
      
      // 第四步 - JS-EYES 浏览器扩展
      installJsEyesTitle: '安装 JS-EYES 浏览器扩展',
      installJsEyesDesc: 'JS-EYES 用于浏览器自动化功能（可选）',
      jsEyesOptionalHint: '此步骤为可选，您可以跳过',
      jsEyesFeatures: '功能：控制标签页、执行脚本、提取数据',
      jsEyesInstallSteps: '安装步骤',
      jsEyesStep1: '从 GitHub 下载项目',
      jsEyesStep2: '打开 Chrome 扩展管理页面 (chrome://extensions)',
      jsEyesStep3: '开启开发者模式',
      jsEyesStep4: '点击"加载已解压的扩展程序"',
      jsEyesStep5: '选择下载的 js-eyes 目录',
      openGithub: '打开 GitHub',
      
      // 第五步
      completeTitle: '配置完成',
      completeDesc: '您已完成所有必要配置，可以开始使用了',
      startUsingBtn: '开始使用'
    },
    
    // 状态栏
    status: {
      service: '服务',
      serviceTitle: '服务状态',
      agent: 'Agent',
      agentTitle: 'Agent 状态',
      explorer: 'Explorer',
      explorerTitle: 'Explorer 状态',
      claudeCode: 'Claude Code',
      claudeCodeTitle: 'Claude Code 状态',
      mode: '模式',
      modeTitle: '运行模式',
      starting: '启动中',
      running: '运行中',
      restarting: '重启中...',
      error: '错误',
      stopped: '已停止',
      extension: '扩展:',
      embedded: '内嵌',
      workDirTooltip: '点击修改工作目录'
    },
    
    // 工具名称 (用于 TOOL_CONFIGS)
    tools: {
      todoWrite: '任务计划',
      todoRead: '读取任务',
      bash: '终端',
      editFile: '编辑文件',
      multiEdit: '批量编辑',
      writeFile: '写入文件',
      readFile: '读取文件',
      globTool: '文件搜索',
      grepTool: '内容搜索',
      lsTool: '列目录',
      subagent: '子任务',
      webSearch: '网络搜索',
      webFetch: '获取网页',
      askUser: '用户确认',
      notebookEdit: '编辑笔记本'
    },
    
    // 工具调用渲染 (ToolCallRenderer)
    toolCall: {
      // 工具内容区块
      input: '输入',
      output: '输出',
      error: '错误',
      executing: '执行中...',
      
      // 通用
      showMore: '显示更多',
      moreLines: '还有 {count} 行',
      moreFiles: '还有 {count} 个文件',
      moreTools: '还有 {count} 个工具...',
      moreResults: '还有 {count} 个结果',
      
      // Todo 列表
      noTodos: '无待办项',
      completed: '完成',
      inProgress: '进行中',
      pending: '待处理',
      
      // Task 子任务
      noSubtasks: '暂无子任务',
      
      // AskUser 用户问答
      noQuestion: '无问题内容',
      questionNumber: '问题 {index}',
      submitAnswer: '提交答案',
      
      // 搜索相关
      search: '搜索:',
      noMatchingFiles: '未找到匹配文件',
      noMatchingContent: '未找到匹配内容',
      
      // 权限按钮
      permissionYes: '允许',
      permissionYesAllEdits: '允许所有编辑',
      permissionYesForTool: '允许此工具',
      permissionNo: '拒绝',
      permissionFailed: '权限操作失败:',
      
      // 复制功能
      copy: '复制',
      copied: '已复制!',
      copyCode: '复制代码',
      copyMessage: '复制消息'
    },
    
    // 错误消息
    errors: {
      networkError: '网络错误，请检查您的连接',
      serverError: '服务器错误，请稍后重试',
      authFailed: '认证失败',
      invalidInput: '输入无效',
      operationFailed: '操作失败',
      loadFailed: '加载失败',
      saveFailed: '保存失败',
      connectionFailed: '连接失败',
      timeoutError: '请求超时',
      unknownError: '未知错误',
      pdfLoadFailed: '加载 PDF 失败',
      imageLoadFailed: '加载图片失败',
      readFailed: '读取文件失败'
    },
    
    // Daemon 启动进度消息
    daemon: {
      startProgress: {
        acquiringLock: '正在准备启动 Daemon...',
        spawning: '正在启动 Daemon 进程...',
        waitingState: '正在等待 Daemon 就绪...',
        httpCheck: '正在验证 Daemon 服务...',
        creatingSession: '正在创建会话...',
        connecting: '正在连接 Agent...',
        ready: 'Agent 已就绪',
        error: 'Daemon 启动失败'
      }
    },
    
    // 通知消息
    notifications: {
      // 软件更新通知
      updateAvailable: '发现新版本 v{version}，可以下载更新',
      updateReady: '更新已下载完成，重启后生效',
      
      daemonStarting: '正在启动 Daemon...',
      daemonStopping: '正在停止 Daemon...',
      daemonRestarting: '正在重启 Daemon...',
      daemonStarted: 'Daemon 启动成功',
      daemonStartFailed: 'Daemon 启动失败',
      daemonStopped: 'Daemon 已停止',
      daemonStopFailed: 'Daemon 停止失败',
      daemonRestarted: 'Daemon 重启成功',
      daemonRestartFailed: 'Daemon 重启失败',
      starting: '启动中...',
      stopping: '停止中...',
      restartingServer: '正在重启服务器...',
      restartingApp: '正在重启应用...',
      applyingConfig: '正在应用配置...',
      switchingWorkDir: '正在切换工作目录...',
      resettingToDefault: '正在重置为默认目录...',
      workspaceDirReset: '已恢复为默认目录',
      initializingAccount: '正在初始化账户...',
      loginSuccess: '登录成功',
      tokenSaved: 'Claude Auth Token 已保存',
      tokenDeleted: 'Claude Auth Token 已删除',
      configSavedAndApplied: 'Claude Code 配置已保存并生效',
      configSavedNeedsRestart: 'Claude Code 配置已保存，需要重启应用才能完全生效',
      configSaved: 'Claude Code 配置已保存',
      dependencyRefreshed: '依赖状态已刷新',
      refreshFailed: '刷新失败',
      saveFailed: '保存失败',
      enterSecret: '请输入 Secret',
      verifyFailed: '验证失败',
      invalidSecret: '无效的 Secret',
      accountSwitched: '账号切换成功',
      secretSavedNeedsRestart: 'Secret 已保存，重启应用后生效',
      secretSaved: 'Secret 已保存',
      settingsSavedAndApplied: '设置已保存并生效',
      saveSettingsFailed: '保存设置失败',
      restartFailed: '重启失败',
      workDirSwitched: '工作目录已切换',
      workspaceDirSet: '工作目录已设置',
      switchDirFailed: '切换目录失败',
      selectDirFailed: '选择目录失败',
      resetToDefault: '已重置为默认目录',
      resetFailed: '重置失败',
      cannotOpenFile: '无法打开文件',
      openFileFailed: '打开文件失败',
      openFailed: '打开失败',
      operationFailed: '操作失败',
      deleteSuccess: '删除成功',
      deleteFailed: '删除失败',
      folderCreated: '文件夹创建成功',
      fileCreated: '文件创建成功',
      createFailed: '创建失败',
      renameSuccess: '重命名成功',
      renameFailed: '重命名失败',
      enterFolderName: '请输入文件夹名称',
      enterFileName: '请输入文件名称',
      invalidFolderName: '文件夹名称包含非法字符',
      invalidFileName: '文件名称包含非法字符',
      enterNewName: '请输入新名称',
      invalidName: '名称包含非法字符',
      noAnonIdToCopy: '无可复制的匿名 ID',
      anonIdCopied: '匿名 ID 已复制',
      copyFailed: '复制失败',
      cannotGetSecret: '无法获取 Secret',
      getSecretFailed: '获取 Secret 失败',
      noSecretToCopy: '无可复制的 Secret',
      serverChanged: '服务器已更改，请重新配置账户',
      changeServerFailed: '修改服务器失败',
      loggedOut: '已退出登录',
      logoutFailed: '退出登录失败',
      generateSecretFailed: '生成 Secret 失败',
      createAccountFailed: '创建账户失败',
      noPendingSecret: '没有待保存的 Secret',
      saveSecretFailed: '保存 Secret 失败',
      claudeCodeDetected: '检测到 Claude Code 已安装',
      detectFailed: '检测失败',
      configLater: '您可以稍后在设置中完成配置',
      configComplete: '配置完成，欢迎使用！',
      cannotStartWizard: '无法启动设置向导',
      secretCopied: 'Secret Key 已复制到剪贴板',
      copyFailedManual: '复制失败，请手动复制',
      validatingFormat: '验证格式中...',
      formatValid: '格式有效',
      validationFailed: '验证失败',
      connectingServer: '连接服务器验证中...',
      verifyAndLogin: '验证并登录',
      enterDeepSeekKey: '请输入您的 DeepSeek API Key',
      enterAnthropicKey: '请输入您的 Anthropic API Key',
      enterApiKey: '请输入 API Key',
      saveConfig: '保存配置',
      partialLimited: '部分功能将受限',
      messagesRestored: '已恢复 {count} 条历史消息'
    }
  };
  
  // Register locale
  if (window.I18nLocales) {
    window.I18nLocales['zh-CN'] = locale;
  }
})();
