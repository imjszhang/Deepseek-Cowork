/**
 * 浏览器控制 API 路由
 * 
 * 对应 Electron IPC: browser:* 通道
 * 
 * 注意：大部分浏览器控制功能已由 server/modules/browser 模块提供
 * 这里只添加额外的封装接口
 * 
 * 创建时间: 2026-01-20
 */

/**
 * 注册浏览器路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function browserRoutes(app, context) {
    const { localService } = context;
    
    /**
     * GET /api/browser/tabs
     * 获取浏览器标签页列表
     */
    app.get('/api/browser/tabs', async (req, res) => {
        try {
            const browserService = localService.getBrowserControlService();
            
            if (!browserService) {
                return res.json({
                    success: false,
                    error: 'BrowserControl service not available',
                    tabs: []
                });
            }
            
            // 尝试获取 tabsManager
            let tabsManager = null;
            if (typeof browserService.getTabsManager === 'function') {
                tabsManager = browserService.getTabsManager();
            } else if (browserService.tabsManager) {
                tabsManager = browserService.tabsManager;
            }
            
            if (tabsManager) {
                const result = await tabsManager.getTabs();
                res.json({
                    success: true,
                    ...result
                });
            } else {
                res.json({
                    success: false,
                    error: 'TabsManager not available',
                    tabs: []
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                tabs: []
            });
        }
    });
    
    /**
     * POST /api/browser/tab/close
     * 关闭浏览器标签页
     */
    app.post('/api/browser/tab/close', async (req, res) => {
        try {
            const { tabId } = req.body;
            
            if (!tabId) {
                return res.status(400).json({
                    success: false,
                    error: 'tabId is required'
                });
            }
            
            const browserService = localService.getBrowserControlService();
            
            if (!browserService) {
                return res.json({
                    success: false,
                    error: 'BrowserControl service not available'
                });
            }
            
            const extensionServer = browserService.getExtensionWebSocketServer?.();
            if (extensionServer) {
                const result = await extensionServer.sendMessage({
                    type: 'close_tab',
                    tabId: tabId,
                    requestId: `close_${tabId}_${Date.now()}`
                });
                res.json(result);
            } else {
                res.json({
                    success: false,
                    error: 'Extension server not available'
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
     * POST /api/browser/tab/open
     * 打开 URL
     */
    app.post('/api/browser/tab/open', async (req, res) => {
        try {
            const { url, tabId } = req.body;
            
            if (!url) {
                return res.status(400).json({
                    success: false,
                    error: 'url is required'
                });
            }
            
            const browserService = localService.getBrowserControlService();
            
            if (!browserService) {
                return res.json({
                    success: false,
                    error: 'BrowserControl service not available'
                });
            }
            
            const extensionServer = browserService.getExtensionWebSocketServer?.();
            if (extensionServer) {
                const result = await extensionServer.sendMessage({
                    type: 'open_url',
                    url: url,
                    tabId: tabId,
                    requestId: `open_${Date.now()}`
                });
                res.json(result);
            } else {
                res.json({
                    success: false,
                    error: 'Extension server not available'
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
     * GET /api/browser/extension/status
     * 获取浏览器扩展连接状态
     */
    app.get('/api/browser/extension/status', (req, res) => {
        try {
            const browserService = localService.getBrowserControlService();
            
            if (!browserService) {
                return res.json({
                    success: true,
                    connected: false,
                    connections: 0
                });
            }
            
            const extensionServer = browserService.getExtensionWebSocketServer?.();
            if (extensionServer) {
                const connections = extensionServer.getConnections?.() || 0;
                res.json({
                    success: true,
                    connected: connections > 0,
                    connections
                });
            } else {
                res.json({
                    success: true,
                    connected: false,
                    connections: 0
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = browserRoutes;
