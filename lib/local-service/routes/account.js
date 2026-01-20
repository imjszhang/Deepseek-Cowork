/**
 * 账户相关 API 路由
 * 
 * 对应 Electron IPC: happy:hasSecret, happy:saveSecret, happy:logout 等
 * 
 * 创建时间: 2026-01-20
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const HappyService = require('../../happy-service');
const secureSettings = require('../secure-settings-cli');
const userSettings = require('../user-settings-cli');

/**
 * 注册账户路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function accountRoutes(app, context) {
    
    /**
     * GET /api/account
     * 获取账户信息
     */
    app.get('/api/account', async (req, res) => {
        try {
            const hasSecret = secureSettings.hasSecret('happy.secret');
            const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
            const serviceStatus = HappyService.getStatus();
            
            // 如果有 Secret，生成匿名 ID
            let anonId = null;
            if (hasSecret) {
                try {
                    const secret = secureSettings.getSecret('happy.secret');
                    if (secret) {
                        const CryptoUtils = require('../../happy-client/utils/CryptoUtils');
                        const KeyUtils = require('../../happy-client/utils/KeyUtils');
                        
                        let secretBytes;
                        try {
                            const normalized = KeyUtils.normalizeSecretKey(secret);
                            secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
                        } catch (e) {
                            secretBytes = Buffer.from(CryptoUtils.decodeBase64(secret, 'base64url'));
                        }
                        
                        const derivedKey = await CryptoUtils.deriveKey(secretBytes, 'Happy Coder', ['analytics', 'id']);
                        anonId = derivedKey.toString('hex').slice(0, 16).toLowerCase();
                    }
                } catch (e) {
                    console.error('Failed to derive anon ID:', e);
                }
            }
            
            res.json({
                success: true,
                hasSecret,
                isConnected: serviceStatus.clientConnected || false,
                anonId,
                serverUrl,
                sessionId: serviceStatus.currentSessionId || null,
                eventStatus: serviceStatus.eventStatus || 'idle'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/account/hasSecret
     * 检查是否已配置 Secret
     */
    app.get('/api/account/hasSecret', (req, res) => {
        try {
            const hasSecret = secureSettings.hasSecret('happy.secret');
            res.json({
                success: true,
                hasSecret
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/generateSecret
     * 生成新的 Secret
     */
    app.post('/api/account/generateSecret', (req, res) => {
        try {
            const SecretGenerator = require('../../happy-client/utils/SecretGenerator');
            const result = SecretGenerator.generateSecretWithFormats();
            res.json({
                success: true,
                formatted: result.formatted,
                base64url: result.base64url
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/validateSecret
     * 验证 Secret 格式
     */
    app.post('/api/account/validateSecret', (req, res) => {
        try {
            const { secret } = req.body;
            const SecretGenerator = require('../../happy-client/utils/SecretGenerator');
            const result = SecretGenerator.validateSecretFormat(secret);
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/verifySecret
     * 验证 Secret 有效性（尝试获取 Token）
     */
    app.post('/api/account/verifySecret', async (req, res) => {
        try {
            const { secret } = req.body;
            const SecretGenerator = require('../../happy-client/utils/SecretGenerator');
            const Auth = require('../../happy-client/core/Auth');
            
            // 验证格式
            const validation = SecretGenerator.validateSecretFormat(secret);
            if (!validation.valid) {
                return res.json({ success: false, error: validation.error });
            }
            
            // 尝试获取 Token
            const auth = new Auth();
            const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
            const masterSecret = Buffer.from(validation.normalized, 'base64url');
            
            try {
                const token = await auth.getToken(masterSecret, serverUrl);
                if (token) {
                    res.json({
                        success: true,
                        normalized: validation.normalized,
                        token: token
                    });
                } else {
                    res.json({
                        success: false,
                        error: '无法获取 Token，请检查 Secret 是否正确'
                    });
                }
            } catch (authError) {
                res.json({
                    success: false,
                    error: authError.message
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/secret
     * 保存 Secret
     */
    app.post('/api/account/secret', async (req, res) => {
        try {
            const { secret, token } = req.body;
            const SecretGenerator = require('../../happy-client/utils/SecretGenerator');
            
            // 验证格式
            const validation = SecretGenerator.validateSecretFormat(secret);
            if (!validation.valid) {
                return res.json({ success: false, error: validation.error });
            }
            
            // 检查是否是账户切换
            let isAccountSwitching = false;
            const hasExistingSecret = secureSettings.hasSecret('happy.secret');
            if (hasExistingSecret) {
                const existingSecret = secureSettings.getSecret('happy.secret');
                if (existingSecret !== validation.normalized) {
                    isAccountSwitching = true;
                    
                    // 断开现有连接
                    if (HappyService.isInitialized()) {
                        await HappyService.disconnectClient();
                    }
                    
                    // 清理状态
                    if (HappyService.sessionManager) {
                        HappyService.sessionManager._accountChanged = true;
                        HappyService.sessionManager.removeStateFile();
                        HappyService.sessionManager.clearSessions();
                    }
                    
                    HappyService.clearMessages();
                }
            }
            
            // 保存 Secret
            secureSettings.setSecret('happy.secret', validation.normalized);
            
            // 同步凭证到 ~/.happy/access.key
            let tokenToSync = token;
            if (!tokenToSync) {
                try {
                    const Auth = require('../../happy-client/core/Auth');
                    const auth = new Auth();
                    const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
                    const masterSecret = Buffer.from(validation.normalized, 'base64url');
                    tokenToSync = await auth.getToken(masterSecret, serverUrl);
                } catch (e) {
                    console.warn('Failed to get token for sync:', e.message);
                }
            }
            
            if (tokenToSync) {
                syncCredentialsToHappyDir(validation.normalized, tokenToSync, 
                    userSettings.get('happy.serverUrl'), isAccountSwitching);
            }
            
            // 如果 HappyService 已初始化，尝试重启
            if (isAccountSwitching && hasExistingSecret && HappyService.isInitialized()) {
                try {
                    const restartResult = await HappyService.restartDaemon();
                    if (restartResult.success) {
                        await HappyService.connectToSession('main');
                        return res.json({
                            success: true,
                            needsRestart: false,
                            hotSwitched: true
                        });
                    }
                } catch (e) {
                    console.warn('Hot switch failed:', e.message);
                }
            }
            
            res.json({
                success: true,
                needsRestart: isAccountSwitching && hasExistingSecret
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/logout
     * 登出账户
     */
    app.post('/api/account/logout', async (req, res) => {
        try {
            // 断开连接
            if (HappyService.isInitialized()) {
                await HappyService.disconnectClient();
                
                // 清理状态
                if (HappyService.sessionManager) {
                    HappyService.sessionManager.removeStateFile();
                    HappyService.sessionManager.clearSessions();
                }
                
                HappyService.clearMessages();
            }
            
            // 删除 Secret
            secureSettings.deleteSecret('happy.secret');
            
            // 停止 Daemon
            if (HappyService.daemonManager) {
                await HappyService.daemonManager.stopDaemon();
            }
            
            // 删除 ~/.happy/access.key
            const accessKeyPath = path.join(os.homedir(), '.happy', 'access.key');
            if (fs.existsSync(accessKeyPath)) {
                fs.unlinkSync(accessKeyPath);
            }
            
            // 重置 HappyService
            HappyService.reset();
            
            res.json({
                success: true,
                needsRestart: true
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/account/changeServer
     * 更改服务器地址
     */
    app.post('/api/account/changeServer', async (req, res) => {
        try {
            const { serverUrl } = req.body;
            
            // 断开连接并清理
            if (HappyService.isInitialized()) {
                await HappyService.disconnectClient();
                
                if (HappyService.sessionManager) {
                    HappyService.sessionManager.removeStateFile();
                    HappyService.sessionManager.clearSessions();
                }
                
                HappyService.clearMessages();
            }
            
            // 删除 Secret
            secureSettings.deleteSecret('happy.secret');
            
            // 停止 Daemon
            if (HappyService.daemonManager) {
                await HappyService.daemonManager.stopDaemon();
            }
            
            // 删除 ~/.happy/access.key
            const accessKeyPath = path.join(os.homedir(), '.happy', 'access.key');
            if (fs.existsSync(accessKeyPath)) {
                fs.unlinkSync(accessKeyPath);
            }
            
            // 重置 HappyService
            HappyService.reset();
            
            // 保存新服务器地址
            userSettings.set('happy.serverUrl', serverUrl || null);
            
            res.json({ success: true });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/account/formattedSecret
     * 获取格式化的 Secret（用于备份显示）
     */
    app.get('/api/account/formattedSecret', (req, res) => {
        try {
            if (!secureSettings.hasSecret('happy.secret')) {
                return res.json({ success: false, error: '未配置 Secret' });
            }
            
            const secret = secureSettings.getSecret('happy.secret');
            if (!secret) {
                return res.json({ success: false, error: '无法读取 Secret' });
            }
            
            const SecretGenerator = require('../../happy-client/utils/SecretGenerator');
            const CryptoUtils = require('../../happy-client/utils/CryptoUtils');
            const KeyUtils = require('../../happy-client/utils/KeyUtils');
            
            let secretBytes;
            
            // 尝试解码
            try {
                secretBytes = Buffer.from(CryptoUtils.decodeBase64(secret, 'base64url'));
                if (secretBytes.length === 32) {
                    const formatted = SecretGenerator.formatSecretForBackup(secretBytes);
                    return res.json({ success: true, formatted });
                }
            } catch (e) {
                // 继续尝试其他格式
            }
            
            try {
                const normalized = KeyUtils.normalizeSecretKey(secret);
                secretBytes = Buffer.from(CryptoUtils.decodeBase64(normalized, 'base64url'));
                if (secretBytes.length === 32) {
                    const formatted = SecretGenerator.formatSecretForBackup(secretBytes);
                    return res.json({ success: true, formatted });
                }
            } catch (e) {
                // 格式无效
            }
            
            res.json({ success: false, error: 'Secret 格式无效，请重新配置账户' });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * 同步凭证到 ~/.happy/access.key 和 settings.json
 */
function syncCredentialsToHappyDir(secretBase64url, token, serverUrl, clearMachineId = false) {
    const happyHomeDir = path.join(os.homedir(), '.happy');
    const accessKeyPath = path.join(happyHomeDir, 'access.key');
    const settingsPath = path.join(happyHomeDir, 'settings.json');
    
    // 确保目录存在
    if (!fs.existsSync(happyHomeDir)) {
        fs.mkdirSync(happyHomeDir, { recursive: true });
    }
    
    // 转换格式
    const secretBytes = Buffer.from(secretBase64url, 'base64url');
    const secretBase64 = secretBytes.toString('base64');
    
    // 写入凭证文件
    const credentials = {
        secret: secretBase64,
        token: token
    };
    
    fs.writeFileSync(accessKeyPath, JSON.stringify(credentials, null, 2), 'utf8');
    
    // 更新 settings.json
    const DEFAULT_SERVER_URL = 'https://api.deepseek-cowork.com/';
    try {
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }
        
        settings.serverUrl = serverUrl || DEFAULT_SERVER_URL;
        
        if (clearMachineId && settings.machineId) {
            delete settings.machineId;
            delete settings.machineIdConfirmedByServer;
        }
        
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.warn('Failed to update settings.json:', e.message);
    }
}

module.exports = accountRoutes;
