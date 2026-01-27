#!/usr/bin/env node

/**
 * Browser Control Service Status Check Script
 * 
 * Usage: node check_status.js [--json]
 * 
 * Checks:
 * 1. Whether service is running
 * 2. Whether browser extension is connected
 * 3. Whether tabs are available
 */

const http = require('http');

const BASE_URL = 'http://localhost:3333';

/**
 * Send HTTP request
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
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Check service status
 */
async function checkStatus() {
    const result = {
        timestamp: new Date().toISOString(),
        service: { ok: false, message: '' },
        extension: { ok: false, message: '', connections: 0 },
        tabs: { ok: false, message: '', count: 0 }
    };
    
    // 1. Check service status
    try {
        const statusRes = await request(`${BASE_URL}/api/browser/status`);
        
        if (statusRes.status === 200 && statusRes.data?.status === 'success') {
            const data = statusRes.data.data;
            result.service.ok = data.isRunning === true;
            result.service.message = result.service.ok ? 'Service running' : 'Service not running';
            
            // Check extension connection
            const wsInfo = data.connections?.extensionWebSocket;
            if (wsInfo) {
                result.extension.connections = wsInfo.activeConnections || 0;
                result.extension.ok = result.extension.connections > 0;
                result.extension.message = result.extension.ok 
                    ? `${result.extension.connections} browser extension(s) connected`
                    : 'No browser extension connected';
            }
        } else {
            result.service.message = 'Service response abnormal';
        }
    } catch (err) {
        result.service.message = `Service unavailable: ${err.message}`;
    }
    
    // 2. Check tabs (only when service and extension are both OK)
    if (result.service.ok && result.extension.ok) {
        try {
            const tabsRes = await request(`${BASE_URL}/api/browser/tabs`);
            
            if (tabsRes.status === 200 && tabsRes.data?.status === 'success') {
                const tabs = tabsRes.data.tabs || [];
                result.tabs.count = tabs.length;
                result.tabs.ok = true;
                result.tabs.message = `${tabs.length} tab(s) accessible`;
            } else {
                result.tabs.message = 'Failed to get tabs';
            }
        } catch (err) {
            result.tabs.message = `Failed to get tabs: ${err.message}`;
        }
    } else {
        result.tabs.message = 'Skipped (service or extension not ready)';
    }
    
    return result;
}

/**
 * Format output
 */
function formatOutput(result, jsonMode) {
    if (jsonMode) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    
    const icon = (ok) => ok ? '✅' : '❌';
    
    console.log('\n=== Browser Control Status Check ===\n');
    console.log(`${icon(result.service.ok)} Service: ${result.service.message}`);
    console.log(`${icon(result.extension.ok)} Extension: ${result.extension.message}`);
    console.log(`${icon(result.tabs.ok)} Tabs: ${result.tabs.message}`);
    console.log(`\nCheck time: ${result.timestamp}`);
    
    const allOk = result.service.ok && result.extension.ok && result.tabs.ok;
    console.log(`\nOverall status: ${allOk ? '✅ OK' : '⚠️ Issues detected'}\n`);
    
    if (!allOk) {
        console.log('Troubleshooting tips:');
        if (!result.service.ok) {
            console.log('  - Ensure Browser Control Manager app is running');
            console.log('  - Check if port 3333 is occupied');
        }
        if (!result.extension.ok) {
            console.log('  - Ensure browser extension is installed and enabled');
            console.log('  - Check if extension WebSocket address is correct (ws://localhost:8080)');
        }
        console.log('');
    }
}

// Main function
async function main() {
    const jsonMode = process.argv.includes('--json');
    
    try {
        const result = await checkStatus();
        formatOutput(result, jsonMode);
        
        // Set exit code
        const allOk = result.service.ok && result.extension.ok && result.tabs.ok;
        process.exit(allOk ? 0 : 1);
    } catch (err) {
        if (jsonMode) {
            console.log(JSON.stringify({ error: err.message }));
        } else {
            console.error('Check failed:', err.message);
        }
        process.exit(1);
    }
}

main();
