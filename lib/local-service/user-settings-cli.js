/**
 * CLI 模式用户设置模块
 * 
 * 使用简单 JSON 文件存储用户设置（无需 Electron）
 * 
 * 创建时间: 2026-01-20
 */

const fs = require('fs');
const path = require('path');
const { getDataDir, getDefaultWorkspaceDir, ensureDir } = require('./config');

// 默认设置
const DEFAULT_SETTINGS = {
    happy: {
        workspaceDir: null,  // null 表示使用默认目录
        sessionName: 'main',
        autoMonitor: true,
        // Happy AI 配置
        permissionMode: 'default',  // 权限模式: default, acceptEdits, plan, bypassPermissions
        serverUrl: null,  // null 表示使用默认服务器
        debug: false,  // 调试模式
        // Claude Code 配置
        claudeCode: {
            provider: 'anthropic',     // 'anthropic' | 'deepseek' | 'custom'
            baseUrl: null,             // ANTHROPIC_BASE_URL
            model: null,               // ANTHROPIC_MODEL
            smallFastModel: null,      // ANTHROPIC_SMALL_FAST_MODEL
            timeoutMs: 600000,         // API_TIMEOUT_MS (10分钟)
            disableNonessential: false // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
        }
    },
    server: {
        httpPort: 3333,
        wsPort: 8080,
        autoStart: false
    }
};

// Claude Code 提供商预设
const CLAUDE_CODE_PRESETS = {
    anthropic: {
        baseUrl: null,
        model: null,
        smallFastModel: null
    },
    deepseek: {
        baseUrl: 'https://api.deepseek.com/anthropic',
        model: 'deepseek-chat',
        smallFastModel: 'deepseek-chat'
    }
};

/**
 * CLI 模式用户设置管理器
 */
class UserSettingsCLI {
    constructor() {
        this._settings = null;
        this._settingsPath = null;
        this._dataDir = null;
    }

    /**
     * 初始化
     * @param {string} [customDataDir] 可选的自定义数据目录
     */
    initialize(customDataDir = null) {
        this._dataDir = customDataDir || getDataDir();
        ensureDir(this._dataDir);
        
        this._settingsPath = path.join(this._dataDir, 'settings.json');
        this._load();
    }

    /**
     * 获取数据目录路径
     * @returns {string} 数据目录路径
     */
    getDataDir() {
        return this._dataDir;
    }

    /**
     * 获取默认工作目录
     * @returns {string} 默认工作目录路径
     */
    getDefaultWorkspaceDir() {
        return getDefaultWorkspaceDir();
    }

    /**
     * 加载设置
     * @private
     */
    _load() {
        try {
            if (fs.existsSync(this._settingsPath)) {
                const content = fs.readFileSync(this._settingsPath, 'utf8');
                this._settings = JSON.parse(content);
                // 合并默认设置（确保新增的设置项有默认值）
                this._settings = this._deepMerge(DEFAULT_SETTINGS, this._settings);
            } else {
                this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
            }
        } catch (error) {
            console.error('[UserSettingsCLI] Failed to load settings:', error.message);
            this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
    }

    /**
     * 保存设置
     * @private
     */
    _save() {
        try {
            const dir = path.dirname(this._settingsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this._settingsPath, JSON.stringify(this._settings, null, 2), 'utf8');
        } catch (error) {
            console.error('[UserSettingsCLI] Failed to save settings:', error.message);
        }
    }

    /**
     * 深度合并对象
     * @param {Object} target 目标对象
     * @param {Object} source 源对象
     * @returns {Object} 合并后的对象
     * @private
     */
    _deepMerge(target, source) {
        const result = { ...target };
        
        for (const key of Object.keys(source)) {
            if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (target[key] && typeof target[key] === 'object') {
                    result[key] = this._deepMerge(target[key], source[key]);
                } else {
                    result[key] = source[key];
                }
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    /**
     * 获取设置值
     * @param {string} keyPath 键路径，如 'happy.workspaceDir'
     * @returns {*} 设置值
     */
    get(keyPath) {
        if (!this._settings) {
            return undefined;
        }
        
        const keys = keyPath.split('.');
        let value = this._settings;
        
        for (const key of keys) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[key];
        }
        
        return value;
    }

    /**
     * 设置值
     * @param {string} keyPath 键路径，如 'happy.workspaceDir'
     * @param {*} value 值
     */
    set(keyPath, value) {
        if (!this._settings) {
            this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
        
        const keys = keyPath.split('.');
        let obj = this._settings;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!obj[key] || typeof obj[key] !== 'object') {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        obj[keys[keys.length - 1]] = value;
        this._save();
    }

    /**
     * 获取所有设置
     * @returns {Object} 所有设置
     */
    getAll() {
        return this._settings ? { ...this._settings } : {};
    }

    /**
     * 重置所有设置为默认值
     */
    reset() {
        this._settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        this._save();
    }

    /**
     * 获取设置文件路径
     * @returns {string} 设置文件路径
     */
    getSettingsPath() {
        return this._settingsPath;
    }

    /**
     * 获取 Claude Code 提供商预设
     * @param {string} provider 提供商名称
     * @returns {Object|null} 预设配置
     */
    getClaudeCodePreset(provider) {
        return CLAUDE_CODE_PRESETS[provider] || null;
    }

    /**
     * 获取所有 Claude Code 提供商预设
     * @returns {Object} 所有预设配置
     */
    getAllClaudeCodePresets() {
        return { ...CLAUDE_CODE_PRESETS };
    }
}

// 导出单例
module.exports = new UserSettingsCLI();
