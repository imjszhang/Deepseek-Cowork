/**
 * Daemon 管理 API 路由
 * 
 * 对应 Electron IPC: daemon:* 通道
 * 
 * 创建时间: 2026-01-20
 */

const HappyService = require('../../happy-service');

/**
 * 注册 Daemon 路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function daemonRoutes(app, context) {
    
    /**
     * GET /api/daemon/status
     * 获取 Daemon 状态
     */
    app.get('/api/daemon/status', (req, res) => {
        try {
            if (!HappyService.isInitialized() || !HappyService.daemonManager) {
                return res.json({
                    success: true,
                    status: { running: false, error: 'HappyService not initialized' }
                });
            }
            
            const status = HappyService.daemonManager.getStatus();
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
     * GET /api/daemon/running
     * 检查 Daemon 是否运行
     */
    app.get('/api/daemon/running', async (req, res) => {
        try {
            const running = await HappyService.isDaemonRunning();
            res.json({
                success: true,
                running
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/daemon/start
     * 启动 Daemon
     */
    app.post('/api/daemon/start', async (req, res) => {
        try {
            if (!HappyService.isInitialized() || !HappyService.daemonManager) {
                return res.status(400).json({
                    success: false,
                    error: 'HappyService not initialized'
                });
            }
            
            console.log('[API] daemon:start - Starting daemon...');
            const started = await HappyService.daemonManager.startDaemon();
            const status = HappyService.daemonManager.getStatus();
            
            // 启动成功后创建 session
            let sessions = {};
            if (started && HappyService.sessionManager) {
                console.log('[API] daemon:start - Creating sessions...');
                sessions = await HappyService.sessionManager.createAllSessions({ wasDaemonRunning: false });
            }
            
            res.json({
                success: started,
                status,
                sessions
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/daemon/stop
     * 停止 Daemon
     */
    app.post('/api/daemon/stop', async (req, res) => {
        try {
            if (!HappyService.isInitialized() || !HappyService.daemonManager) {
                return res.status(400).json({
                    success: false,
                    error: 'HappyService not initialized'
                });
            }
            
            console.log('[API] daemon:stop - Stopping daemon...');
            const stopped = await HappyService.daemonManager.stopDaemon();
            const status = HappyService.daemonManager.getStatus();
            
            // 停止成功后清理本地状态
            if (stopped) {
                await HappyService.onDaemonStopped();
            }
            
            res.json({
                success: stopped,
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
     * POST /api/daemon/restart
     * 重启 Daemon
     */
    app.post('/api/daemon/restart', async (req, res) => {
        try {
            if (!HappyService.isInitialized()) {
                return res.status(400).json({
                    success: false,
                    error: 'HappyService not initialized'
                });
            }
            
            console.log('[API] daemon:restart - Restarting daemon...');
            const result = await HappyService.restartDaemon();
            
            res.json(result);
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = daemonRoutes;
