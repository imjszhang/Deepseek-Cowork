/**
 * API 路由入口
 * 
 * 统一注册所有 API 路由
 * 
 * 创建时间: 2026-01-20
 */

const aiRoutes = require('./ai');
const accountRoutes = require('./account');
const filesRoutes = require('./files');
const daemonRoutes = require('./daemon');
const settingsRoutes = require('./settings');
const browserRoutes = require('./browser');
const statusRoutes = require('./status');

/**
 * 注册所有 API 路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function setupRoutes(app, context) {
    // 健康检查
    app.get('/api/ping', (req, res) => {
        res.json({ 
            status: 'ok', 
            timestamp: Date.now(),
            version: require('../../../package.json').version
        });
    });
    
    // 状态路由
    statusRoutes(app, context);
    
    // AI 相关路由
    aiRoutes(app, context);
    
    // 账户相关路由
    accountRoutes(app, context);
    
    // 文件系统路由
    filesRoutes(app, context);
    
    // Daemon 管理路由
    daemonRoutes(app, context);
    
    // 设置路由
    settingsRoutes(app, context);
    
    // 浏览器控制路由
    browserRoutes(app, context);
    
    console.log('[Routes] All API routes registered');
}

module.exports = setupRoutes;
