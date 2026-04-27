/**
 * 依赖检查 API 路由
 * 
 * 创建时间: 2026-01-20
 */

const DependencyChecker = require('../../dependency-checker');

/**
 * 注册依赖检查路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function depsRoutes(app, context) {
    const { secureSettings } = context;
    
    /**
     * GET /api/deps/status
     * 获取所有依赖状态
     */
    app.get('/api/deps/status', (req, res) => {
        try {
            const deps = DependencyChecker.checkAllDependencies();
            res.json({
                success: true,
                ...deps
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/check
     * 检查所有依赖（刷新）
     */
    app.get('/api/deps/check', (req, res) => {
        try {
            const deps = DependencyChecker.checkAllDependencies();
            res.json({
                success: true,
                ...deps
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/nodejs
     * 检查 Node.js
     */
    app.get('/api/deps/nodejs', (req, res) => {
        try {
            const status = DependencyChecker.checkNodeJs();
            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/claude-code
     * 检查 Claude Code
     */
    app.get('/api/deps/claude-code', (req, res) => {
        try {
            const status = DependencyChecker.checkClaudeCode();
            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/happy-coder
     * 检查 happy-coder
     */
    app.get('/api/deps/happy-coder', (req, res) => {
        try {
            const status = DependencyChecker.checkHappyCoder();
            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/setup-requirements
     * 获取设置向导所需的配置项
     */
    app.get('/api/deps/setup-requirements', (req, res) => {
        try {
            const requirements = DependencyChecker.getSetupRequirements(secureSettings);
            res.json({
                success: true,
                ...requirements
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/deps/install-guide/:component
     * 获取安装指南
     */
    app.get('/api/deps/install-guide/:component', (req, res) => {
        try {
            const { component } = req.params;
            const guide = DependencyChecker.getInstallGuide(component);
            
            if (!guide) {
                return res.status(404).json({
                    success: false,
                    error: `Unknown component: ${component}`
                });
            }
            
            res.json({
                success: true,
                guide
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/deps/install/happy-coder
     * 安装 happy-coder
     */
    app.post('/api/deps/install/happy-coder', async (req, res) => {
        try {
            const result = await DependencyChecker.installHappyCoder();
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/deps/install/claude-code
     * 自动安装 Claude Code
     */
    app.post('/api/deps/install/claude-code', async (req, res) => {
        try {
            const result = await DependencyChecker.installClaudeCode();
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/deps/upgrade/claude-code
     * 自动升级 Claude Code
     */
    app.post('/api/deps/upgrade/claude-code', async (req, res) => {
        try {
            const result = await DependencyChecker.upgradeClaudeCode();
            res.json(result);
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    console.log('[Routes] Dependency check routes registered');
}

module.exports = depsRoutes;
