/**
 * DeepSeek Cowork 全局路由模块
 * 
 * 设置全局路由（首页、健康检查等）
 * 模块路由由各模块的 setupRoutes() 自行注册
 */

const path = require('path');
const fs = require('fs');
const modulesManager = require('../modulesManager');

// 服务列表配置
const servicesList = [
    { name: '本地服务', path: '/', description: '本地运行时与服务入口', icon: '🖥️', category: 'core' },
    { name: '文件浏览器', path: '/explorer', description: '文件系统浏览和管理', icon: '📁', category: 'core' },
    { name: 'AI 助手', path: '/ai', description: '本地 AI 会话与任务协作', icon: '🤖', category: 'ai' }
];

/**
 * 获取服务列表
 */
function getServices() {
    return servicesList;
}

/**
 * 设置全局路由
 * @param {Object} app Express 应用实例
 * @param {Object} config 配置对象
 * @param {Object} io Socket.IO 实例
 */
function setupRoutes(app, config, io) {
    
    // 设置 Socket.IO 命名空间用于实时更新（可选）
    if (io) {
        const dashboardNamespace = io.of('/dashboard');
        global.dashboardNamespace = dashboardNamespace;
        
        dashboardNamespace.on('connection', (socket) => {
            console.log('Dashboard WebSocket connected:', socket.id);
            
            // 发送当前服务列表
            socket.emit('services', getServices());
            
            socket.on('disconnect', () => {
                console.log('Dashboard WebSocket disconnected:', socket.id);
            });
            
            // 监听客户端请求刷新
            socket.on('refreshServices', () => {
                socket.emit('services', getServices());
            });
        });
    }
    
    // 主页路由 - 显示所有可用服务
    app.get('/', (req, res) => {
        const htmlPath = path.join(__dirname, 'html/index.html');
        if (fs.existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            // 如果没有自定义首页，返回简单的服务列表
            res.json({
                name: 'DeepSeek Cowork Server',
                version: '1.0.0',
                services: getServices()
            });
        }
    });

    // API - 获取仪表盘信息
    app.get('/api/dashboard/info', (req, res) => {
        res.json({
            services: getServices(),
            uptime: process.uptime(),
            version: '1.0.0'
        });
    });
    
    // 健康检查端点
    app.get('/api/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            services: {
                server: 'running'
            }
        });
    });

    // 获取服务器配置（不暴露敏感信息）
    app.get('/api/config/server', (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    host: config.server?.host || 'localhost',
                    port: config.server?.port || 3333,
                    baseUrl: config.server?.baseUrl
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ============================================================
    // 模块管理 API - 热加载功能
    // ============================================================

    // GET /api/modules - 列出所有已加载模块
    app.get('/api/modules', (req, res) => {
        try {
            const modules = modulesManager.getModulesStatus();
            res.json({
                success: true,
                data: modules
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/modules/load - 加载指定模块
    app.post('/api/modules/load', async (req, res) => {
        try {
            const { name } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing module name parameter (name)'
                });
            }
            
            const result = await modulesManager.loadSingleModule(name);
            
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/modules/unload - 卸载指定模块
    app.post('/api/modules/unload', async (req, res) => {
        try {
            const { name } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing module name parameter (name)'
                });
            }
            
            const result = await modulesManager.unloadSingleModule(name);
            
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // POST /api/modules/reload - 重载指定模块
    app.post('/api/modules/reload', async (req, res) => {
        try {
            const { name } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing module name parameter (name)'
                });
            }
            
            const result = await modulesManager.reloadModule(name);
            
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
           
    // 错误处理中间件
    app.use((err, req, res, next) => {
        console.error('Server error:', err);
        
        // 对 API 请求返回 JSON 格式的错误
        if (req.path.startsWith('/api')) {
            return res.status(500).json({
                success: false,
                error: 'Server error',
                message: err.message
            });
        }
        
        // 对非 API 请求返回简单错误页面
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Server Error</title></head>
            <body>
                <h1>Server Error</h1>
                <p>${err.message}</p>
            </body>
            </html>
        `);
    });
}

module.exports = {
    setupRoutes,
    getServices
};
