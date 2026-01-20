/**
 * 进程管理工具
 * 
 * 创建时间: 2026-01-20
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import net from 'net';

/**
 * 检查端口是否可用
 * @param {number} port 端口号
 * @returns {Promise<boolean>} 是否可用
 */
export async function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            } else {
                resolve(true);
            }
        });
        
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        
        server.listen(port, 'localhost');
    });
}

/**
 * 写入 PID 文件
 * @param {string} pidPath PID 文件路径
 * @param {number} pid 进程 ID
 */
export function writePidFile(pidPath, pid) {
    try {
        const dir = dirname(pidPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(pidPath, pid.toString(), 'utf8');
    } catch (error) {
        console.error('Failed to write PID file:', error.message);
    }
}

/**
 * 读取 PID 文件
 * @param {string} pidPath PID 文件路径
 * @returns {number|null} 进程 ID 或 null
 */
export function readPidFile(pidPath) {
    try {
        if (existsSync(pidPath)) {
            const content = readFileSync(pidPath, 'utf8').trim();
            const pid = parseInt(content);
            return isNaN(pid) ? null : pid;
        }
    } catch (error) {
        // 忽略读取错误
    }
    return null;
}

/**
 * 删除 PID 文件
 * @param {string} pidPath PID 文件路径
 */
export function removePidFile(pidPath) {
    try {
        if (existsSync(pidPath)) {
            unlinkSync(pidPath);
        }
    } catch (error) {
        // 忽略删除错误
    }
}

/**
 * 检查进程是否运行
 * @param {number} pid 进程 ID
 * @returns {boolean} 是否运行
 */
export function isProcessRunning(pid) {
    if (!pid) return false;
    
    try {
        // 发送信号 0 检查进程是否存在
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 终止进程
 * @param {number} pid 进程 ID
 * @param {string} signal 信号（默认 SIGTERM）
 * @returns {boolean} 是否成功
 */
export function killProcess(pid, signal = 'SIGTERM') {
    if (!pid) return false;
    
    try {
        process.kill(pid, signal);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 等待进程退出
 * @param {number} pid 进程 ID
 * @param {number} timeout 超时时间（毫秒）
 * @returns {Promise<boolean>} 是否退出
 */
export async function waitForProcessExit(pid, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        if (!isProcessRunning(pid)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return !isProcessRunning(pid);
}

export default {
    checkPort,
    writePidFile,
    readPidFile,
    removePidFile,
    isProcessRunning,
    killProcess,
    waitForProcessExit
};
