/**
 * 设置相关 API 路由
 * 
 * 对应 Electron IPC: happy:getSettings, happy:saveSettings, config:* 等
 * 
 * 创建时间: 2026-01-20
 */

const HappyService = require('../../happy-service');
const userSettings = require('../user-settings-cli');
const secureSettings = require('../secure-settings-cli');
const { getDefaultWorkspaceDir, ensureDir } = require('../config');

/**
 * 注册设置路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function settingsRoutes(app, context) {
    
    /**
     * GET /api/settings
     * 获取所有设置
     */
    app.get('/api/settings', (req, res) => {
        try {
            const settings = userSettings.getAll();
            res.json({
                success: true,
                settings
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // 注意：通配符路由 /api/settings/:keyPath 移至文件末尾
    // 以避免与特定路由（如 /api/settings/claude）冲突
    
    /**
     * GET /api/settings/happy/all
     * 获取所有 Happy AI 设置
     */
    app.get('/api/settings/happy/all', (req, res) => {
        try {
            res.json({
                success: true,
                hasSecret: secureSettings.hasSecret('happy.secret'),
                permissionMode: userSettings.get('happy.permissionMode') || 'default',
                serverUrl: userSettings.get('happy.serverUrl'),
                workspaceDir: userSettings.get('happy.workspaceDir'),
                defaultWorkspaceDir: getDefaultWorkspaceDir(),
                currentWorkDir: HappyService.getCurrentWorkDir(),
                workDirs: HappyService.listWorkDirs(),
                autoMonitor: userSettings.get('happy.autoMonitor') !== false
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/settings/happy
     * 保存 Happy AI 设置
     */
    app.put('/api/settings/happy', async (req, res) => {
        try {
            const settings = req.body;
            
            // 保存非敏感设置
            if (settings.permissionMode !== undefined) {
                const oldValue = userSettings.get('happy.permissionMode');
                if (oldValue !== settings.permissionMode) {
                    userSettings.set('happy.permissionMode', settings.permissionMode);
                    
                    // 热切换权限模式
                    if (HappyService.isInitialized()) {
                        HappyService.setPermissionMode(settings.permissionMode);
                    }
                }
            }
            
            if (settings.autoMonitor !== undefined) {
                userSettings.set('happy.autoMonitor', settings.autoMonitor);
            }
            
            res.json({
                success: true,
                needsRestart: false
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/settings/workspace
     * 获取工作目录设置
     */
    app.get('/api/settings/workspace', (req, res) => {
        try {
            res.json({
                success: true,
                workspaceDir: userSettings.get('happy.workspaceDir'),
                defaultWorkspaceDir: getDefaultWorkspaceDir(),
                currentWorkDir: HappyService.getCurrentWorkDir()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/settings/workspace
     * 切换工作目录
     */
    app.put('/api/settings/workspace', async (req, res) => {
        try {
            const { path: newPath } = req.body;
            
            if (!newPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is required'
                });
            }
            
            // 确保目录存在
            ensureDir(newPath);
            
            // 执行热切换
            const result = await HappyService.switchWorkDir(newPath);
            
            if (result.success) {
                // 保存用户选择的目录
                userSettings.set('happy.workspaceDir', newPath);
                
                // 通知 Explorer 服务切换监控目录（热更新）
                const localService = context?.localService;
                if (localService?._explorerService) {
                    try {
                        const explorerResult = await localService._explorerService.switchWatchDir(newPath);
                        if (explorerResult.success) {
                            console.log('[Settings] Explorer watch directory switched to:', newPath);
                        } else {
                            console.warn('[Settings] Failed to switch explorer watch directory:', explorerResult.error);
                        }
                    } catch (e) {
                        console.warn('[Settings] Error switching explorer watch directory:', e.message);
                    }
                }
            }
            
            res.json(result);
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * DELETE /api/settings/workspace
     * 重置工作目录为默认
     */
    app.delete('/api/settings/workspace', async (req, res) => {
        try {
            const defaultDir = getDefaultWorkspaceDir();
            userSettings.set('happy.workspaceDir', null);
            
            // 热切换到默认目录
            if (HappyService.isInitialized()) {
                const result = await HappyService.switchWorkDir(defaultDir);
                
                // 通知 Explorer 服务切换监控目录（热更新）
                if (result.success) {
                    const localService = context?.localService;
                    if (localService?._explorerService) {
                        try {
                            await localService._explorerService.switchWatchDir(defaultDir);
                            console.log('[Settings] Explorer watch directory reset to:', defaultDir);
                        } catch (e) {
                            console.warn('[Settings] Error resetting explorer watch directory:', e.message);
                        }
                    }
                }
                
                return res.json({
                    success: result.success,
                    error: result.error,
                    path: defaultDir
                });
            }
            
            res.json({
                success: true,
                path: defaultDir
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/settings/workdirs
     * 获取所有已映射的工作目录
     */
    app.get('/api/settings/workdirs', (req, res) => {
        try {
            const workDirs = HappyService.listWorkDirs();
            res.json({
                success: true,
                workDirs
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/settings/claude
     * 获取 Claude Code 设置
     */
    app.get('/api/settings/claude', (req, res) => {
        try {
            const claudeCodeSettings = userSettings.get('happy.claudeCode') || {};
            const hasAuthToken = secureSettings.hasSecret('claude.authToken');
            
            res.json({
                success: true,
                ...claudeCodeSettings,
                hasAuthToken
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/settings/claude
     * 保存 Claude Code 设置
     */
    app.put('/api/settings/claude', async (req, res) => {
        try {
            const settings = req.body;
            const { authToken, ...otherSettings } = settings;
            
            // 更新各个设置项
            if (otherSettings.provider !== undefined) {
                userSettings.set('happy.claudeCode.provider', otherSettings.provider);
            }
            if (otherSettings.baseUrl !== undefined) {
                userSettings.set('happy.claudeCode.baseUrl', otherSettings.baseUrl || null);
            }
            if (otherSettings.model !== undefined) {
                userSettings.set('happy.claudeCode.model', otherSettings.model || null);
            }
            if (otherSettings.smallFastModel !== undefined) {
                userSettings.set('happy.claudeCode.smallFastModel', otherSettings.smallFastModel || null);
            }
            if (otherSettings.timeoutMs !== undefined) {
                userSettings.set('happy.claudeCode.timeoutMs', otherSettings.timeoutMs);
            }
            if (otherSettings.disableNonessential !== undefined) {
                userSettings.set('happy.claudeCode.disableNonessential', otherSettings.disableNonessential);
            }
            
            // 保存 Auth Token
            let authTokenChanged = false;
            console.log('[Settings] PUT /api/settings/claude - authToken received:', authToken ? `length=${authToken.length}, starts=${authToken.substring(0, 5)}` : 'undefined/empty');
            if (authToken !== undefined) {
                if (authToken) {
                    console.log('[Settings] Saving claude.authToken, length:', authToken.length, ', starts:', authToken.substring(0, 5));
                    authTokenChanged = true;
                    secureSettings.setSecret('claude.authToken', authToken);
                } else {
                    console.log('[Settings] Deleting claude.authToken (empty value)');
                    secureSettings.deleteSecret('claude.authToken');
                }
            } else {
                console.log('[Settings] authToken not in request body, skipping');
            }
            
            // 如果配置了非官方提供商，或者修改了 authToken，重启 daemon
            let daemonRestarted = false;
            const provider = otherSettings.provider || userSettings.get('happy.claudeCode.provider');
            console.log('[Settings] Checking restart: provider=', provider, ', authTokenChanged=', authTokenChanged, ', initialized=', HappyService.isInitialized());
            
            // 修改: 只要 provider 不是 anthropic，或者 authToken 有变化，都需要重启
            const shouldRestart = HappyService.isInitialized() && 
                (provider && provider !== 'anthropic');
            
            if (shouldRestart) {
                console.log('[Settings] Restarting daemon for provider:', provider);
                try {
                    const restartResult = await HappyService.restartDaemon();
                    daemonRestarted = restartResult.success;
                    console.log('[Settings] Daemon restart result:', restartResult);
                } catch (e) {
                    console.error('Error restarting daemon:', e);
                }
            }
            
            res.json({
                success: true,
                needsRestart: !daemonRestarted,
                daemonRestarted
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/settings/claude/presets
     * 获取 Claude Code 提供商预设
     */
    app.get('/api/settings/claude/presets', (req, res) => {
        try {
            const presets = userSettings.getAllClaudeCodePresets();
            res.json({
                success: true,
                presets
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/settings/reset
     * 重置所有设置为默认值
     */
    app.post('/api/settings/reset', (req, res) => {
        try {
            userSettings.reset();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    // ========== 通配符路由（必须放在最后） ==========
    
    /**
     * GET /api/settings/:keyPath
     * 获取指定设置项
     * 注意：此路由必须放在所有特定路由之后
     */
    app.get('/api/settings/:keyPath', (req, res) => {
        try {
            const { keyPath } = req.params;
            const value = userSettings.get(keyPath);
            res.json({
                success: true,
                key: keyPath,
                value
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/settings/:keyPath
     * 设置指定设置项
     * 注意：此路由必须放在所有特定路由之后
     */
    app.put('/api/settings/:keyPath', (req, res) => {
        try {
            const { keyPath } = req.params;
            const { value } = req.body;
            
            userSettings.set(keyPath, value);
            
            res.json({
                success: true,
                key: keyPath,
                value
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = settingsRoutes;
