/**
 * English (US) Language Pack
 * Default language for DeepSeek Cowork
 */

(function() {
  const locale = {
    // Common shared texts
    common: {
      save: 'Save',
      cancel: 'Cancel',
      confirm: 'Confirm',
      ok: 'OK',
      close: 'Close',
      delete: 'Delete',
      create: 'Create',
      edit: 'Edit',
      refresh: 'Refresh',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      yes: 'Yes',
      no: 'No',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      skip: 'Skip',
      start: 'Start',
      stop: 'Stop',
      restart: 'Restart',
      saving: 'Saving...',
      connecting: 'Connecting...',
      disconnecting: 'Disconnecting...',
      connect: 'Connect',
      disconnect: 'Disconnect',
      copy: 'Copy',
      copied: 'Copied!',
      open: 'Open',
      openFolder: 'Open Folder',
      showInExplorer: 'Show in File Manager',
      rename: 'Rename',
      newFolder: 'New Folder',
      expandAll: 'Expand All',
      expandAllArrow: 'Expand All ▼',
      collapseArrow: 'Collapse ▲',
      collapse: 'Collapse',
      workDir: 'Working Directory',
      apply: 'Apply',
      reset: 'Reset',
      default: 'Default',
      custom: 'Custom',
      checking: 'Checking...',
      rechecking: 'Rechecking...',
      recheck: 'Recheck',
      verifying: 'Verifying...',
      processing: 'Processing...',
      confirmChange: 'Confirm Change',
      notSet: 'Not Set'
    },
    
    // Title bar
    titlebar: {
      close: 'Close',
      minimize: 'Minimize',
      maximize: 'Maximize'
    },
    
    // Sidebar navigation
    sidebar: {
      files: 'Files',
      browser: 'Browser',
      settings: 'Settings',
      fileManagement: 'File Management',
      browserManagement: 'Browser Management'
    },
    
    // Session Hub
    sessionHub: {
      title: 'Session Hub',
      switchDir: 'Switch to new directory',
      currentSession: 'Current',
      noSessions: 'No other active sessions',
      loading: 'Loading...',
      status: {
        idle: 'Idle',
        processing: 'Processing',
        connected: 'Connected',
        disconnected: 'Disconnected',
        thinking: 'Thinking',
        waiting: 'Waiting'
      }
    },
    
    // Chat panel
    chat: {
      title: 'Chat',
      agentStatus: 'Agent Status',
      connected: 'Connected',
      disconnected: 'Disconnected',
      notConnected: 'Not Connected',
      connect: 'Connect',
      disconnect: 'Disconnect',
      inputPlaceholder: 'Enter message...',
      send: 'Send',
      abort: 'Abort (Esc)',
      welcomeTitle: 'Welcome to DeepSeek Cowork',
      welcomeDesc: 'After connecting, you can chat with DeepSeek Cowork to perform tasks',
      contextInput: 'Input:',
      contextOutput: 'Output:',
      idle: 'idle',
      // Message related
      connectionFailed: 'Connection failed:',
      sendFailed: 'Send failed:',
      contextCleared: 'Context cleared',
      unknownError: 'Unknown error',
      // Agent status messages
      agentConnected: 'Agent connected',
      agentDisconnected: 'Agent disconnected',
      agentError: 'Agent error',
      unknownReason: 'Unknown reason',
      // Task control
      taskAborted: 'Task aborted',
      abortFailed: 'Abort failed',
      // Copy functionality
      copyCode: 'Copy code',
      copyMessage: 'Copy message',
      // Help commands
      availableCommands: 'Available commands:',
      noDescription: 'No description',
      unknownCommand: 'Unknown command:'
    },
    
    // Browser panel
    browser: {
      title: 'Browser',
      refresh: 'Refresh',
      refreshTabs: 'Refresh Tab List',
      activeTabs: 'Active Tabs',
      noTabs: 'No open tabs',
      noTabsHint: 'Please ensure the browser extension is installed and connected',
      // Button text
      getHtml: 'HTML',
      getCookies: 'Cookies',
      saveCookies: 'Save',
      savedCookies: 'Saved',
      injectScript: 'Inject',
      closeTab: 'Close',
      // Notification messages
      htmlRequestSent: 'HTML request sent',
      cookiesRequestSent: 'Cookies request sent',
      htmlRequestFailed: 'Failed to get HTML',
      cookiesRequestFailed: 'Failed to get Cookies',
      saveCookiesSuccess: 'Cookies saved',
      saveCookiesFailed: 'Failed to save Cookies',
      // Tab card info labels
      tabId: 'ID',
      tabWindow: 'Window',
      tabIndex: 'Index',
      tabStatus: 'Status'
    },
    
    // File panel
    files: {
      title: 'File Management',
      back: 'Go Back',
      refresh: 'Refresh',
      newFolder: 'New Folder',
      workingDir: 'Working Directory',
      emptyFolder: 'Folder is empty',
      emptyFolderHint: 'Click "New Folder" button to create a folder',
      loadFailed: 'Load Failed',
      open: 'Open',
      openWith: 'Open with System App',
      rename: 'Rename',
      showInExplorer: 'Show in File Manager',
      delete: 'Delete',
      newFile: 'New File',
      newFolder: 'New Folder',
      newFolderDialog: {
        title: 'New Folder',
        label: 'Folder Name',
        placeholder: 'Enter folder name...',
        create: 'Create',
        errorEmpty: 'Please enter a folder name',
        errorInvalid: 'Folder name contains invalid characters'
      },
      newFileDialog: {
        title: 'New File',
        label: 'File Name',
        placeholder: 'Enter file name...',
        create: 'Create'
      },
      renameDialog: {
        title: 'Rename',
        label: 'New Name',
        placeholder: 'Enter new name...'
      }
    },
    
    // Explorer service
    explorer: {
      status: {
        title: 'Explorer Service Status',
        online: 'Online',
        offline: 'Offline',
        connecting: 'Connecting',
        reconnecting: 'Reconnecting'
      },
      preview: {
        edit: 'Edit',
        save: 'Save',
        close: 'Close',
        unsaved: 'Unsaved',
        saved: 'Saved',
        unsavedConfirm: 'You have unsaved changes. Are you sure you want to close?',
        unsupported: 'This file type is not supported for preview',
        imageNotSupported: 'Image preview is not supported yet',
        sourceView: 'Source',
        renderedView: 'Preview',
        // PDF preview
        pdfPrev: 'Previous Page',
        pdfNext: 'Next Page',
        pdfPage: 'Page {current} of {total}',
        // Common zoom
        zoomIn: 'Zoom In',
        zoomOut: 'Zoom Out',
        fit: 'Fit to Window',
        actualSize: 'Actual Size'
      },
      layout: {
        splitView: 'Split View',
        singleView: 'Single View'
      },
      events: {
        fileChanged: 'File changed',
        fileAdded: 'File added',
        fileDeleted: 'File deleted',
        folderAdded: 'Folder added',
        folderDeleted: 'Folder deleted'
      },
      externalChange: {
        message: 'File has been modified externally',
        reload: 'Reload',
        keep: 'Keep Mine'
      },
      fileDeleted: 'File has been deleted'
    },
    
    // Settings panel
    settings: {
      title: 'Settings',
      
      // Environment section
      environment: 'Environment',
      refreshCheck: 'Refresh Check',
      systemVersion: 'System Version:',
      npmVersion: 'npm Version:',
      electronBuiltin: 'Electron Built-in:',
      notInstalled: 'Not Installed',
      notInstalledOptional: 'Not Installed (Optional)',
      checking: 'Checking...',
      version: 'Version:',
      source: 'Source:',
      path: 'Path:',
      installGuide: 'Installation Guide',
      connectionStatus: 'Connection Status',
      pid: 'PID:',
      port: 'Port:',
      startTime: 'Start Time:',
      running: 'Running',
      stopped: 'Stopped',
      daemonRunning: 'Daemon Running',
      
      // Server status
      serverStatus: 'Server Status',
      extensionConnections: 'Extension Connections',
      
      // Software Update
      softwareUpdate: 'Software Update',
      currentVersion: 'Current Version:',
      newVersion: 'New Version:',
      downloadProgress: 'Download Progress:',
      checkUpdate: 'Check for Updates',
      downloadUpdate: 'Download Now',
      installUpdate: 'Restart & Install',
      skipUpdate: 'Later',
      upToDate: 'Up to Date',
      updateAvailable: 'Update Available',
      downloading: 'Downloading...',
      updateReady: 'Update Ready',
      updateError: 'Update Error',
      updateCheckFailed: 'Failed to check for updates',
      downloadFailed: 'Failed to download update',
      
      rerunWizard: 'Re-run Setup Wizard',
      rerunWizardHint: 'If you encounter configuration issues, you can re-run the setup wizard',
      partialLimited: 'Some features will be limited',
      
      // Claude Code config section
      claudeCodeConfig: 'Claude Code Configuration',
      apiProvider: 'API Provider',
      providerAnthropic: 'Anthropic (Official)',
      providerDeepSeek: 'DeepSeek',
      providerCustom: 'Custom',
      apiEndpoint: 'API Endpoint',
      apiEndpointHint: 'Leave empty to use default endpoint',
      authToken: 'Auth Token',
      tokenPlaceholder: 'Enter Token...',
      showHide: 'Show/Hide',
      modelName: 'Model Name',
      timeout: 'Timeout',
      timeoutHint: 'Default 600000ms (10 minutes)',
      disableNonessential: 'Disable Non-essential Traffic',
      saveClaudeConfig: 'Save Claude Code Config',
      configuredDeepSeek: 'Configured (DeepSeek)',
      configuredCustom: 'Configured ({provider})',
      officialAnthropic: 'Official Anthropic',
      configured: 'Configured',
      installed: 'Installed',
      notInstalled: 'Not Installed',
      installedVersion: 'Installed v{version}',
      recommendedInstall: 'Recommended',
      apiProvider: 'API Provider',
      
      // Account management section
      accountManagement: 'Account Management',
      status: 'Status',
      anonymousId: 'Anonymous ID',
      accountServer: 'Account Server',
      notConfigured: 'Not Configured',
      connected: 'Connected',
      notConfiguredHint: 'To use Agent features, please configure your account first',
      createAccount: 'Create New Account',
      useExisting: 'Use Existing Account',
      secretKey: 'Secret Key',
      secretKeyHint: 'This is the only credential to recover your account, please keep it safe',
      show: 'Show',
      hide: 'Hide',
      switchAccount: 'Switch Account',
      changeServer: 'Change Server',
      logout: 'Logout',
      
      // Conversation settings section
      conversationSettings: 'Conversation Settings',
      permissionMode: 'Permission Mode',
      permissionDefault: 'Default (default)',
      permissionAcceptEdits: 'Accept Edits (acceptEdits)',
      permissionPlan: 'Plan Mode (plan)',
      permissionYolo: 'YOLO (bypassPermissions)',
      permissionHintDefault: 'Default mode: Requires confirmation for each operation',
      permissionHintAcceptEdits: 'Accept edits mode: Auto-accept file modifications',
      permissionHintPlan: 'Plan mode: Only generates plans, no execution',
      permissionHintYolo: 'YOLO mode: Execute all operations without confirmation',
      currentWorkDir: 'Current Working Directory',
      selectDir: 'Select Directory',
      resetDefault: 'Reset to Default',
      defaultDir: 'Default Directory',
      enterWorkspacePath: 'Enter the full path of the workspace directory:',
      
      // Appearance section
      appearance: 'Appearance',
      language: 'Language',
      themeMode: 'Theme Mode',
      themeSystem: 'Follow System',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeHint: 'Current: Follow system preference',
      themeHintLight: 'Current: Light mode',
      themeHintDark: 'Current: Dark mode',
      
      // Server settings section
      serverSettings: 'Server Settings',
      httpPort: 'HTTP Port',
      wsPort: 'WebSocket Port',
      serverActions: 'Server Actions',
      restartServer: 'Restart Server',
      
      // Logs section
      logs: 'Logs',
      clearLogs: 'Clear Logs',
      
      // Restart section
      restartRequired: 'Some settings require a restart to take effect',
      restartNow: 'Restart Now',
      restartLater: 'Restart Later'
    },
    
    // Dialogs
    dialogs: {
      // Welcome setup dialog
      welcomeSetup: {
        title: 'Setup Agent',
        description: 'To use Agent features, you need to configure API Secret.',
        createNew: 'Create New Account',
        createNewDesc: 'Generate a new Secret Key and start using',
        useExisting: 'Use Existing Secret Key',
        useExistingDesc: 'Enter your existing Secret Key to recover account',
        skipSetup: 'Setup Later',
        skipHint: '(Some features will not be available)'
      },
      
      // Secret backup dialog
      secretBackup: {
        title: 'Your Secret Key',
        importantNotice: 'Important Notice',
        backupWarning: 'This is the only way to recover your account, please save it in a safe place!',
        copyToClipboard: 'Copy to Clipboard',
        confirmSaved: 'I have saved the Secret Key in a safe place',
        confirmContinue: 'Confirm and Continue'
      },
      
      // Secret input dialog
      secretInput: {
        title: 'Enter Secret Key',
        formatHint: 'Supported formats:',
        formatSegmented: 'Segmented format: XXXXX-XXXXX-XXXXX-...',
        formatBase64: 'Base64URL format',
        placeholder: 'Enter or paste Secret Key...',
        verifyLogin: 'Verify and Login'
      },
      
      // Setup complete dialog
      setupComplete: {
        title: 'Setup Complete',
        message: 'Your account has been configured successfully!',
        hint: 'Setup complete, you can start using now.',
        startUsing: 'Start Using'
      },
      
      // Change server dialog
      changeServer: {
        title: 'Change Server Address',
        currentServer: 'Current Server',
        newServer: 'New Server Address',
        newServerPlaceholder: 'e.g.: api.deepseek-cowork.com',
        newServerHint: 'Leave empty to use default server (api.deepseek-cowork.com)',
        warning: 'Warning',
        warningText: 'Changing server will:',
        warningLogout: 'Logout current account',
        warningClearData: 'Clear all session data and chat history',
        warningReconfigure: 'Require reconfiguring API Secret',
        confirmChange: 'Confirm Change'
      }
    },
    
    // Setup wizard
    wizard: {
      title: 'Environment Setup Wizard',
      subtitle: 'Complete the following configuration to get started',
      
      // Steps
      step1: 'Environment Check',
      step2: 'Install Dependencies',
      step3: 'API Configuration',
      step4: 'Browser Extension',
      step5: 'Complete',
      
      // Step 1
      envCheckTitle: 'Environment Check Results',
      envCheckDesc: 'The following are the current environment check results',
      skipConfig: 'Configure Later',
      startConfig: 'Start Configuration',
      
      // Step 2
      installClaudeTitle: 'Install Claude Code',
      installClaudeDesc: 'Claude Code is a required DeepSeek Cowork component',
      viewDocs: 'View Official Documentation',
      recheck: 'Re-check',
      
      // Step 3
      apiConfigTitle: 'Configure API Key',
      apiConfigDesc: 'Select API provider and enter your API Key',
      apiProviderLabel: 'API Provider',
      apiEndpointLabel: 'API Endpoint',
      apiKeyLabel: 'API Key',
      apiKeyPlaceholder: 'Enter your API Key...',
      apiKeyHint: 'Please enter your DeepSeek API Key',
      apiKeyHintAnthropic: 'Please enter your Anthropic API Key',
      apiKeyHintCustom: 'Please enter your API Key',
      modelNameLabel: 'Model Name',
      saveConfig: 'Save Configuration',
      
      // Step 4 - JS-EYES Browser Extension
      installJsEyesTitle: 'Install JS-EYES Browser Extension',
      installJsEyesDesc: 'JS-EYES enables browser automation features (optional)',
      jsEyesOptionalHint: 'This step is optional, you can skip it',
      jsEyesFeatures: 'Features: Tab control, script execution, data extraction',
      jsEyesInstallSteps: 'Installation Steps',
      jsEyesStep1: 'Download the project from GitHub',
      jsEyesStep2: 'Open Chrome extensions page (chrome://extensions)',
      jsEyesStep3: 'Enable Developer Mode',
      jsEyesStep4: 'Click "Load unpacked"',
      jsEyesStep5: 'Select the downloaded js-eyes directory',
      openGithub: 'Open GitHub',
      
      // Step 5
      completeTitle: 'Configuration Complete',
      completeDesc: 'You have completed all necessary configurations and can start using',
      startUsingBtn: 'Start Using'
    },
    
    // Status bar
    status: {
      service: 'Service',
      serviceTitle: 'Service Status',
      agent: 'Agent',
      agentTitle: 'Agent Status',
      explorer: 'Explorer',
      explorerTitle: 'Explorer Status',
      claudeCode: 'Claude Code',
      claudeCodeTitle: 'Claude Code Status',
      mode: 'Mode',
      modeTitle: 'Mode',
      starting: 'Starting',
      running: 'Running',
      restarting: 'Restarting...',
      error: 'Error',
      stopped: 'Stopped',
      extension: 'Extension:',
      embedded: 'Embedded',
      workDirTooltip: 'Click to modify working directory'
    },
    
    // Tool names (for TOOL_CONFIGS)
    tools: {
      todoWrite: 'Task Plan',
      todoRead: 'Read Tasks',
      bash: 'Terminal',
      editFile: 'Edit File',
      multiEdit: 'Multi Edit',
      writeFile: 'Write File',
      readFile: 'Read File',
      globTool: 'File Search',
      grepTool: 'Content Search',
      lsTool: 'List Directory',
      subagent: 'Subtask',
      webSearch: 'Web Search',
      webFetch: 'Fetch Web Page',
      askUser: 'User Confirm',
      notebookEdit: 'Edit Notebook'
    },
    
    // Tool call rendering (ToolCallRenderer)
    toolCall: {
      // Tool content sections
      input: 'Input',
      output: 'Output',
      error: 'Error',
      executing: 'Executing...',
      
      // Common
      showMore: 'Show More',
      moreLines: '{count} more lines',
      moreFiles: '{count} more files',
      moreTools: '{count} more tools...',
      moreResults: '{count} more results',
      
      // Todo list
      noTodos: 'No todos',
      completed: 'Completed',
      inProgress: 'In Progress',
      pending: 'Pending',
      
      // Task subtasks
      noSubtasks: 'No subtasks',
      
      // AskUser questions
      noQuestion: 'No question content',
      questionNumber: 'Question {index}',
      submitAnswer: 'Submit Answer',
      
      // Search related
      search: 'Search:',
      noMatchingFiles: 'No matching files found',
      noMatchingContent: 'No matching content found',
      
      // Permission buttons
      permissionYes: 'Yes',
      permissionYesAllEdits: 'Yes, allow all edits',
      permissionYesForTool: 'Yes, for this tool',
      permissionNo: 'No',
      permissionFailed: 'Permission action failed:',
      
      // Copy functionality
      copy: 'Copy',
      copied: 'Copied!',
      copyCode: 'Copy code',
      copyMessage: 'Copy message'
    },
    
    // Error messages
    errors: {
      networkError: 'Network error, please check your connection',
      serverError: 'Server error, please try again later',
      authFailed: 'Authentication failed',
      invalidInput: 'Invalid input',
      operationFailed: 'Operation failed',
      loadFailed: 'Load failed',
      saveFailed: 'Save failed',
      connectionFailed: 'Connection failed',
      timeoutError: 'Request timeout',
      unknownError: 'Unknown error',
      pdfLoadFailed: 'Failed to load PDF',
      imageLoadFailed: 'Failed to load image',
      readFailed: 'Failed to read file'
    },
    
    // Daemon startup progress messages
    daemon: {
      startProgress: {
        acquiringLock: 'Preparing to start Daemon...',
        spawning: 'Starting Daemon process...',
        waitingState: 'Waiting for Daemon to be ready...',
        httpCheck: 'Verifying Daemon service...',
        creatingSession: 'Creating session...',
        connecting: 'Connecting to Agent...',
        ready: 'Agent is ready',
        error: 'Daemon startup failed'
      }
    },
    
    // Notifications
    notifications: {
      // Software update notifications
      updateAvailable: 'New version v{version} available',
      updateReady: 'Update downloaded, restart to apply',
      
      daemonStarting: 'Starting Daemon...',
      daemonStopping: 'Stopping Daemon...',
      daemonRestarting: 'Restarting Daemon...',
      daemonStarted: 'Daemon started successfully',
      daemonStartFailed: 'Daemon start failed',
      daemonStopped: 'Daemon stopped',
      daemonStopFailed: 'Daemon stop failed',
      daemonRestarted: 'Daemon restarted successfully',
      daemonRestartFailed: 'Daemon restart failed',
      starting: 'Starting...',
      stopping: 'Stopping...',
      restartingServer: 'Restarting server...',
      restartingApp: 'Restarting application...',
      applyingConfig: 'Applying configuration...',
      switchingWorkDir: 'Switching working directory...',
      resettingToDefault: 'Resetting to default directory...',
      workspaceDirReset: 'Reset to default directory',
      initializingAccount: 'Initializing account...',
      loginSuccess: 'Login successful',
      tokenSaved: 'Claude Auth Token saved',
      tokenDeleted: 'Claude Auth Token deleted',
      configSavedAndApplied: 'Claude Code configuration saved and applied',
      configSavedNeedsRestart: 'Claude Code configuration saved, restart required to take effect',
      configSaved: 'Claude Code configuration saved',
      dependencyRefreshed: 'Dependency status refreshed',
      refreshFailed: 'Refresh failed',
      saveFailed: 'Save failed',
      enterSecret: 'Please enter Secret',
      verifyFailed: 'Verification failed',
      invalidSecret: 'Invalid Secret',
      accountSwitched: 'Account switched successfully',
      secretSavedNeedsRestart: 'Secret saved, restart required to take effect',
      secretSaved: 'Secret saved',
      settingsSavedAndApplied: 'Settings saved and applied',
      saveSettingsFailed: 'Failed to save settings',
      restartFailed: 'Restart failed',
      workDirSwitched: 'Working directory switched',
      workspaceDirSet: 'Working directory set',
      switchDirFailed: 'Failed to switch directory',
      selectDirFailed: 'Failed to select directory',
      resetToDefault: 'Reset to default directory',
      resetFailed: 'Reset failed',
      cannotOpenFile: 'Cannot open file',
      openFileFailed: 'Failed to open file',
      openFailed: 'Open failed',
      operationFailed: 'Operation failed',
      deleteSuccess: 'Deleted successfully',
      deleteFailed: 'Delete failed',
      folderCreated: 'Folder created successfully',
      fileCreated: 'File created successfully',
      createFailed: 'Create failed',
      renameSuccess: 'Renamed successfully',
      renameFailed: 'Rename failed',
      enterFolderName: 'Please enter folder name',
      enterFileName: 'Please enter file name',
      invalidFolderName: 'Folder name contains invalid characters',
      invalidFileName: 'File name contains invalid characters',
      enterNewName: 'Please enter new name',
      invalidName: 'Name contains invalid characters',
      noAnonIdToCopy: 'No Anonymous ID to copy',
      anonIdCopied: 'Anonymous ID copied',
      copyFailed: 'Copy failed',
      cannotGetSecret: 'Cannot get Secret',
      getSecretFailed: 'Failed to get Secret',
      noSecretToCopy: 'No Secret to copy',
      serverChanged: 'Server changed, please reconfigure your account',
      changeServerFailed: 'Failed to change server',
      loggedOut: 'Logged out',
      logoutFailed: 'Logout failed',
      generateSecretFailed: 'Failed to generate Secret',
      createAccountFailed: 'Failed to create account',
      noPendingSecret: 'No pending Secret to save',
      saveSecretFailed: 'Failed to save Secret',
      claudeCodeDetected: 'Claude Code detected as installed',
      detectFailed: 'Detection failed',
      configLater: 'You can complete configuration in settings later',
      configComplete: 'Configuration complete, welcome!',
      cannotStartWizard: 'Cannot start setup wizard',
      secretCopied: 'Secret Key copied to clipboard',
      copyFailedManual: 'Copy failed, please copy manually',
      validatingFormat: 'Validating format...',
      formatValid: 'Format valid',
      validationFailed: 'Validation failed',
      connectingServer: 'Connecting to server for verification...',
      verifyAndLogin: 'Verify and Login',
      enterDeepSeekKey: 'Please enter your DeepSeek API Key',
      enterAnthropicKey: 'Please enter your Anthropic API Key',
      enterApiKey: 'Please enter API Key',
      saveConfig: 'Save Configuration',
      partialLimited: 'Some features will be limited',
      messagesRestored: 'Restored {count} history messages'
    }
  };
  
  // Register locale
  if (window.I18nLocales) {
    window.I18nLocales['en-US'] = locale;
  }
})();
