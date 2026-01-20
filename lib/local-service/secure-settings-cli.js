/**
 * CLI 模式安全设置存储模块
 * 
 * 使用 libsodium 加密存储敏感数据（无需 Electron）
 * 加密后的数据以 Base64 存储在 secure-settings.json 中
 * 
 * 创建时间: 2026-01-20
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getDataDir, ensureDir } = require('./config');

// libsodium 延迟加载
let sodium = null;

/**
 * 获取或生成机器密钥
 * 使用机器 ID 和用户信息派生一个稳定的加密密钥
 * @returns {Buffer} 32 字节密钥
 */
function getMachineKey() {
    // 收集机器信息作为熵源
    const machineInfo = [
        os.hostname(),
        os.homedir(),
        os.platform(),
        os.arch(),
        // 使用用户目录作为稳定标识
        process.env.USER || process.env.USERNAME || 'default'
    ].join(':');
    
    // 使用 SHA-256 派生 32 字节密钥
    return crypto.createHash('sha256').update(machineInfo).digest();
}

/**
 * CLI 模式安全设置管理器
 */
class SecureSettingsCLI {
    constructor() {
        this._settings = null;
        this._settingsPath = null;
        this._initialized = false;
        this._encryptionKey = null;
    }

    /**
     * 初始化
     * @param {string} [customDataDir] 可选的自定义数据目录
     */
    async initialize(customDataDir = null) {
        // 加载 libsodium
        try {
            sodium = require('libsodium-wrappers');
            await sodium.ready;
        } catch (error) {
            console.warn('[SecureSettingsCLI] libsodium not available, using fallback encryption');
        }
        
        const dataDir = customDataDir || getDataDir();
        ensureDir(dataDir);
        
        this._settingsPath = path.join(dataDir, 'secure-settings.json');
        this._encryptionKey = getMachineKey();
        this._load();
        this._initialized = true;
    }

    /**
     * 同步初始化（用于兼容现有代码）
     * @param {string} dataDir 数据目录
     */
    initializeSync(dataDir) {
        ensureDir(dataDir);
        
        this._settingsPath = path.join(dataDir, 'secure-settings.json');
        this._encryptionKey = getMachineKey();
        this._load();
        this._initialized = true;
        
        // 异步加载 sodium
        this._loadSodiumAsync();
    }

    /**
     * 异步加载 sodium
     * @private
     */
    async _loadSodiumAsync() {
        try {
            sodium = require('libsodium-wrappers');
            await sodium.ready;
        } catch (error) {
            // 忽略错误，使用回退加密
        }
    }

    /**
     * 检查是否已初始化
     * @returns {boolean}
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * 检查加密是否可用
     * @returns {boolean}
     */
    isEncryptionAvailable() {
        return sodium !== null || this._encryptionKey !== null;
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
            } else {
                this._settings = {};
            }
        } catch (error) {
            console.error('[SecureSettingsCLI] Failed to load settings:', error.message);
            this._settings = {};
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
            console.error('[SecureSettingsCLI] Failed to save settings:', error.message);
        }
    }

    /**
     * 使用 Node.js crypto 加密数据
     * @param {string} plaintext 明文
     * @returns {string} Base64 编码的加密数据
     * @private
     */
    _encryptWithCrypto(plaintext) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this._encryptionKey, iv);
        
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag();
        
        // 格式: iv(16) + authTag(16) + encrypted
        return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64');
    }

    /**
     * 使用 Node.js crypto 解密数据
     * @param {string} encryptedData Base64 编码的加密数据
     * @returns {string} 明文
     * @private
     */
    _decryptWithCrypto(encryptedData) {
        const data = Buffer.from(encryptedData, 'base64');
        
        const iv = data.subarray(0, 16);
        const authTag = data.subarray(16, 32);
        const encrypted = data.subarray(32);
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', this._encryptionKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * 使用 libsodium 加密数据
     * @param {string} plaintext 明文
     * @returns {string} Base64 编码的加密数据
     * @private
     */
    _encryptWithSodium(plaintext) {
        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
        const encrypted = sodium.crypto_secretbox_easy(
            sodium.from_string(plaintext),
            nonce,
            this._encryptionKey
        );
        
        // 格式: nonce + encrypted
        const combined = new Uint8Array(nonce.length + encrypted.length);
        combined.set(nonce);
        combined.set(encrypted, nonce.length);
        
        return sodium.to_base64(combined);
    }

    /**
     * 使用 libsodium 解密数据
     * @param {string} encryptedData Base64 编码的加密数据
     * @returns {string} 明文
     * @private
     */
    _decryptWithSodium(encryptedData) {
        const combined = sodium.from_base64(encryptedData);
        
        const nonceLength = sodium.crypto_secretbox_NONCEBYTES;
        const nonce = combined.subarray(0, nonceLength);
        const encrypted = combined.subarray(nonceLength);
        
        const decrypted = sodium.crypto_secretbox_open_easy(
            encrypted,
            nonce,
            this._encryptionKey
        );
        
        return sodium.to_string(decrypted);
    }

    /**
     * 加密并存储敏感数据
     * @param {string} key 键名
     * @param {string} value 明文值
     * @returns {boolean} 是否成功
     */
    setSecret(key, value) {
        if (!this._initialized) {
            throw new Error('SecureSettingsCLI not initialized');
        }
        
        if (!value || typeof value !== 'string') {
            throw new Error('Value must be a non-empty string');
        }
        
        try {
            let encryptedData;
            let method;
            
            if (sodium) {
                encryptedData = this._encryptWithSodium(value);
                method = 'sodium';
            } else {
                encryptedData = this._encryptWithCrypto(value);
                method = 'crypto';
            }
            
            this._settings[key] = {
                encrypted: true,
                method: method,
                data: encryptedData
            };
            
            this._save();
            return true;
        } catch (error) {
            console.error(`[SecureSettingsCLI] Failed to encrypt ${key}:`, error.message);
            return false;
        }
    }

    /**
     * 解密并读取敏感数据
     * @param {string} key 键名
     * @returns {string|null} 明文值，不存在返回 null
     */
    getSecret(key) {
        if (!this._initialized) {
            throw new Error('SecureSettingsCLI not initialized');
        }
        
        const entry = this._settings[key];
        if (!entry || !entry.data) {
            return null;
        }
        
        try {
            if (!entry.encrypted) {
                // 未加密数据（兼容旧格式）
                return Buffer.from(entry.data, 'base64').toString('utf8');
            }
            
            if (entry.method === 'sodium' && sodium) {
                return this._decryptWithSodium(entry.data);
            } else {
                return this._decryptWithCrypto(entry.data);
            }
        } catch (error) {
            console.error(`[SecureSettingsCLI] Failed to decrypt ${key}:`, error.message);
            return null;
        }
    }

    /**
     * 检查是否存在指定的敏感数据
     * @param {string} key 键名
     * @returns {boolean}
     */
    hasSecret(key) {
        if (!this._initialized) {
            return false;
        }
        
        const entry = this._settings[key];
        return entry && entry.data ? true : false;
    }

    /**
     * 删除敏感数据
     * @param {string} key 键名
     * @returns {boolean} 是否成功
     */
    deleteSecret(key) {
        if (!this._initialized) {
            throw new Error('SecureSettingsCLI not initialized');
        }
        
        if (this._settings[key]) {
            delete this._settings[key];
            this._save();
            return true;
        }
        
        return false;
    }

    /**
     * 获取所有已存储的键名
     * @returns {string[]}
     */
    getKeys() {
        if (!this._initialized) {
            return [];
        }
        return Object.keys(this._settings);
    }

    /**
     * 清空所有敏感数据
     */
    clear() {
        if (!this._initialized) {
            throw new Error('SecureSettingsCLI not initialized');
        }
        
        this._settings = {};
        this._save();
    }

    /**
     * 获取设置文件路径
     * @returns {string}
     */
    getSettingsPath() {
        return this._settingsPath;
    }
}

// 导出单例
module.exports = new SecureSettingsCLI();
