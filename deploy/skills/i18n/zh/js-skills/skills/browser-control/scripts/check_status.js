#!/usr/bin/env node

/**
 * Browser Control 服务状态检查脚本
 * 
 * 用法：node check_status.js [--json]
 * 
 * 检查项：
 * 1. 服务是否运行
 * 2. 浏览器扩展是否连接
 * 3. 标签页是否可用
 */

const http = require('http');

const BASE_URL = 'http://localhost:3333';

/**
 * 发送 HTTP 请求
 */
function request(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
    });
}

/**
 * 检查服务状态
 */
async function checkStatus() {
    const result = {
        timestamp: new Date().toISOString(),
        service: { ok: false, message: '' },
        extension: { ok: false, message: '', connections: 0 },
        tabs: { ok: false, message: '', count: 0 }
    };
    
    // 1. 检查服务状态
    try {
        const statusRes = await request(`${BASE_URL}/api/browser/status`);
        
        if (statusRes.status === 200 && statusRes.data?.status === 'success') {
            const data = statusRes.data.data;
            result.service.ok = data.isRunning === true;
            result.service.message = result.service.ok ? '服务运行中' : '服务未运行';
            
            // 检查扩展连接
            const wsInfo = data.connections?.extensionWebSocket;
            if (wsInfo) {
                result.extension.connections = wsInfo.activeConnections || 0;
                result.extension.ok = result.extension.connections > 0;
                result.extension.message = result.extension.ok 
                    ? `已连接 ${result.extension.connections} 个浏览器扩展`
                    : '无浏览器扩展连接';
            }
        } else {
            result.service.message = '服务响应异常';
        }
    } catch (err) {
        result.service.message = `服务不可用: ${err.message}`;
    }
    
    // 2. 检查标签页（仅在服务和扩展都正常时）
    if (result.service.ok && result.extension.ok) {
        try {
            const tabsRes = await request(`${BASE_URL}/api/browser/tabs`);
            
            if (tabsRes.status === 200 && tabsRes.data?.status === 'success') {
                const tabs = tabsRes.data.tabs || [];
                result.tabs.count = tabs.length;
                result.tabs.ok = true;
                result.tabs.message = `可访问 ${tabs.length} 个标签页`;
            } else {
                result.tabs.message = '获取标签页失败';
            }
        } catch (err) {
            result.tabs.message = `获取标签页失败: ${err.message}`;
        }
    } else {
        result.tabs.message = '跳过（服务或扩展未就绪）';
    }
    
    return result;
}

/**
 * 格式化输出
 */
function formatOutput(result, jsonMode) {
    if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    
    const icon = (ok) => ok ? '✅' : '❌';
    
    console.log('\n=== Browser Control 状态检查 ===\n');
    console.log(`${icon(result.service.ok)} 服务: ${result.service.message}`);
    console.log(`${icon(result.extension.ok)} 扩展: ${result.extension.message}`);
    console.log(`${icon(result.tabs.ok)} 标签页: ${result.tabs.message}`);
    console.log(`\n检查时间: ${result.timestamp}`);
    
    const allOk = result.service.ok && result.extension.ok && result.tabs.ok;
    console.log(`\n总体状态: ${allOk ? '✅ 正常' : '⚠️ 存在问题'}\n`);
    
    if (!allOk) {
        console.log('排查建议:');
        if (!result.service.ok) {
            console.log('  - 确认 Browser Control Manager 应用已启动');
            console.log('  - 检查端口 3333 是否被占用');
        }
        if (!result.extension.ok) {
            console.log('  - 确认浏览器扩展已安装并启用');
            console.log('  - 检查扩展的 WebSocket 连接地址是否正确 (ws://localhost:8080)');
        }
        console.log('');
    }
}

// 主函数
async function main() {
    const jsonMode = process.argv.includes('--json');
    
    try {
        const result = await checkStatus();
        formatOutput(result, jsonMode);
        
        // 设置退出码
        const allOk = result.service.ok && result.extension.ok && result.tabs.ok;
        process.exit(allOk ? 0 : 1);
    } catch (err) {
        if (jsonMode) {
            console.log(JSON.stringify({ error: err.message }));
        } else {
            console.error('检查失败:', err.message);
        }
        process.exit(1);
    }
}

main();
