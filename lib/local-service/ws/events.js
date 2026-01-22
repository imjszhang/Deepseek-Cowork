/**
 * WebSocket 事件转发模块
 * 
 * 将 HappyService 的事件转发到 WebSocket 客户端
 * 
 * 创建时间: 2026-01-20
 */

const HappyService = require('../../happy-service');

/**
 * 设置 WebSocket 事件转发
 * @param {Object} io Socket.IO 服务器实例
 * @param {Object} context 上下文对象
 */
function setupEventForwarding(io, context) {
    const { localService } = context;
    
    // 存储已连接的客户端
    const clients = new Set();
    
    // Socket.IO 连接处理
    io.on('connection', (socket) => {
        console.log('[WS Events] Client connected:', socket.id);
        clients.add(socket);
        
        // 发送当前状态
        socket.emit('happy:status', {
            initialized: HappyService.isInitialized(),
            ...HappyService.getStatus()
        });
        
        // 处理客户端断开
        socket.on('disconnect', () => {
            console.log('[WS Events] Client disconnected:', socket.id);
            clients.delete(socket);
        });
        
        // 处理客户端请求订阅事件
        socket.on('subscribe', (events) => {
            console.log('[WS Events] Client subscribed to:', events);
            // 可以实现更细粒度的事件订阅
        });
        
        // 处理 ping 请求
        socket.on('ping', (callback) => {
            if (typeof callback === 'function') {
                callback({ timestamp: Date.now() });
            }
        });
    });
    
    // 转发 HappyService 事件
    const eventsToForward = [
        'happy:connected',
        'happy:disconnected',
        'happy:message',
        'happy:error',
        'happy:eventStatus',
        'happy:usage',
        'happy:messagesRestored',
        'happy:secretChanged',
        'happy:workDirSwitched',
        'happy:initialized',
        'memory:saved',
        // daemon 相关事件（由 HappyService 转发）
        'daemon:statusChanged',
        'daemon:startProgress'
    ];
    
    eventsToForward.forEach(eventName => {
        HappyService.on(eventName, (data) => {
            // 广播给所有连接的客户端
            io.emit(eventName, data);
        });
    });
    
    console.log('[WS Events] Event forwarding configured');
    
    return {
        /**
         * 获取已连接的客户端数量
         */
        getClientCount() {
            return clients.size;
        },
        
        /**
         * 向所有客户端广播事件
         * @param {string} event 事件名称
         * @param {*} data 事件数据
         */
        broadcast(event, data) {
            io.emit(event, data);
        },
        
        /**
         * 关闭所有连接
         */
        close() {
            clients.forEach(socket => {
                socket.disconnect(true);
            });
            clients.clear();
        }
    };
}

/**
 * 创建独立的 WebSocket 事件服务器
 * 用于不使用 Socket.IO 的场景
 * @param {number} port WebSocket 端口
 * @param {Object} context 上下文对象
 */
function createWsEventServer(port, context) {
    const WebSocket = require('ws');
    
    const wss = new WebSocket.Server({ port });
    const clients = new Set();
    
    wss.on('connection', (ws) => {
        console.log('[WS Events] Raw WebSocket client connected');
        clients.add(ws);
        
        // 发送当前状态
        ws.send(JSON.stringify({
            type: 'happy:status',
            data: {
                initialized: HappyService.isInitialized(),
                ...HappyService.getStatus()
            }
        }));
        
        ws.on('close', () => {
            console.log('[WS Events] Raw WebSocket client disconnected');
            clients.delete(ws);
        });
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message.toString());
                
                // 处理 ping
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                }
            } catch (e) {
                console.error('[WS Events] Failed to parse message:', e.message);
            }
        });
    });
    
    // 广播函数
    function broadcast(event, data) {
        const message = JSON.stringify({ type: event, data });
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
    
    // 转发 HappyService 事件
    const eventsToForward = [
        'happy:connected',
        'happy:disconnected',
        'happy:message',
        'happy:error',
        'happy:eventStatus',
        'happy:usage',
        'happy:messagesRestored',
        'happy:secretChanged',
        'happy:workDirSwitched',
        'happy:initialized',
        'memory:saved',
        // daemon 相关事件（由 HappyService 转发）
        'daemon:statusChanged',
        'daemon:startProgress'
    ];
    
    eventsToForward.forEach(eventName => {
        HappyService.on(eventName, (data) => {
            broadcast(eventName, data);
        });
    });
    
    console.log(`[WS Events] Raw WebSocket server started on port ${port}`);
    
    return {
        wss,
        getClientCount() {
            return clients.size;
        },
        broadcast,
        close() {
            clients.forEach(client => {
                client.close();
            });
            wss.close();
        }
    };
}

module.exports = {
    setupEventForwarding,
    createWsEventServer
};
