/**
 * stop 命令 - 停止本地服务
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import ora from 'ora';
import { getConfig } from '../index.mjs';
import { readPidFile, removePidFile, isProcessRunning, killProcess, waitForProcessExit } from '../utils/process.mjs';

/**
 * 停止服务命令
 */
export async function stopCommand(options) {
    const spinner = ora('Stopping DeepSeek Cowork...').start();
    
    try {
        const config = await getConfig();
        const pidPath = config.getPidFilePath();
        const pid = readPidFile(pidPath);
        
        if (!pid) {
            spinner.info('No running service found');
            removePidFile(pidPath);
            return;
        }
        
        if (!isProcessRunning(pid)) {
            spinner.info('Service is not running (stale PID file removed)');
            removePidFile(pidPath);
            return;
        }
        
        // 首先尝试通过 API 优雅关闭
        try {
            spinner.text = 'Requesting graceful shutdown...';
            
            // 获取端口配置
            const port = config.DEFAULT_HTTP_PORT;
            
            const response = await fetch(`http://localhost:${port}/api/status`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                // 服务正在运行，尝试优雅关闭
                // 注意：实际的停止 API 需要在服务端实现
                // 这里先直接发送 SIGTERM
            }
        } catch (e) {
            // 服务可能已经不响应，直接终止进程
        }
        
        // 发送 SIGTERM 信号
        spinner.text = 'Sending stop signal...';
        killProcess(pid, 'SIGTERM');
        
        // 等待进程退出
        spinner.text = 'Waiting for service to stop...';
        const stopped = await waitForProcessExit(pid, 10000);
        
        if (stopped) {
            removePidFile(pidPath);
            spinner.succeed('DeepSeek Cowork stopped');
        } else {
            // 强制终止
            spinner.text = 'Force stopping...';
            killProcess(pid, 'SIGKILL');
            
            const forceStopped = await waitForProcessExit(pid, 3000);
            
            if (forceStopped) {
                removePidFile(pidPath);
                spinner.succeed('DeepSeek Cowork force stopped');
            } else {
                spinner.fail('Failed to stop service');
                console.log(chalk.yellow(`\nProcess ${pid} may still be running`));
                console.log(chalk.yellow('You may need to kill it manually'));
            }
        }
        
    } catch (error) {
        spinner.fail(`Failed to stop: ${error.message}`);
        process.exit(1);
    }
}

export default stopCommand;
