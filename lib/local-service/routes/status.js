/**
 * 状态相关 API 路由
 * 
 * 创建时间: 2026-01-20
 */

const HappyService = require('../../happy-service');

/**
 * 注册状态路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function statusRoutes(app, context) {
    const { localService } = context;
    
    /**
     * GET /api/status
     * 获取服务总体状态
     */
    app.get('/api/status', (req, res) => {
        try {
            const status = localService.getStatus();
            res.json({
                success: true,
                status
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/version
     * 获取版本信息
     */
    app.get('/api/version', (req, res) => {
        try {
            const packageJson = require('../../../package.json');
            res.json({
                success: true,
                version: packageJson.version,
                name: packageJson.name,
                description: packageJson.description
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = statusRoutes;
