/**
 * status 命令 - 显示服务状态
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import { getConfig } from '../index.mjs';
import { readPidFile, isProcessRunning } from '../utils/process.mjs';

/**
 * 状态命令
 */
export async function statusCommand(options) {
    try {
        const config = await getConfig();
        const pidPath = config.getPidFilePath();
        const pid = readPidFile(pidPath);
        const port = config.DEFAULT_HTTP_PORT;
        
        // 基础状态
        const status = {
            pid: pid,
            running: false,
            httpPort: port,
            wsPort: config.DEFAULT_WS_PORT,
            dataDir: config.getDataDir(),
            service: null
        };
        
        // 检查进程是否运行
        if (pid && isProcessRunning(pid)) {
            status.running = true;
            
            // 尝试获取详细状态
            try {
                const response = await fetch(`http://localhost:${port}/api/status`, {
                    signal: AbortSignal.timeout(3000)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    status.service = data.status;
                }
            } catch (e) {
                // 服务可能未完全启动或未响应
            }
        }
        
        // JSON 输出
        if (options.json) {
            console.log(JSON.stringify(status, null, 2));
            return;
        }
        
        // 人类可读输出
        console.log('');
        console.log(chalk.bold('DeepSeek Cowork Status'));
        console.log(chalk.dim('─'.repeat(40)));
        
        if (status.running) {
            console.log(chalk.green('● Service:      Running'));
            console.log(chalk.white(`  PID:          ${status.pid}`));
            console.log(chalk.white(`  HTTP:         http://localhost:${status.httpPort}`));
            console.log(chalk.white(`  WebSocket:    ws://localhost:${status.wsPort}`));
            
            if (status.service) {
                console.log('');
                console.log(chalk.dim('Components:'));
                
                // HappyService 状态
                if (status.service.happy) {
                    const happy = status.service.happy;
                    const connStatus = happy.clientConnected ? chalk.green('Connected') : chalk.yellow('Disconnected');
                    console.log(`  Happy AI:     ${connStatus}`);
                    
                    if (happy.eventStatus) {
                        console.log(`  Event Status: ${happy.eventStatus}`);
                    }
                }
                
                // Daemon 状态
                if (status.service.happy?.daemon) {
                    const daemon = status.service.happy.daemon;
                    const daemonStatus = daemon.running ? chalk.green('Running') : chalk.red('Stopped');
                    console.log(`  Daemon:       ${daemonStatus}`);
                }
                
                // BrowserControl 状态
                if (status.service.browserControl) {
                    const bcStatus = status.service.browserControl === 'running' ? chalk.green('Running') : chalk.red('Stopped');
                    console.log(`  Browser:      ${bcStatus}`);
                }
                
                // Explorer 状态
                if (status.service.explorer) {
                    const expStatus = status.service.explorer === 'running' ? chalk.green('Running') : chalk.red('Stopped');
                    console.log(`  Explorer:     ${expStatus}`);
                }
            }
        } else {
            console.log(chalk.red('○ Service:      Not running'));
            
            if (pid) {
                console.log(chalk.dim(`  (Stale PID file found: ${pid})`));
            }
        }
        
        console.log('');
        console.log(chalk.dim('Data Directory:'));
        console.log(`  ${status.dataDir}`);
        console.log('');
        
        // 提示命令
        if (!status.running) {
            console.log(chalk.cyan('Start service:'), chalk.white('deepseek-cowork start'));
        } else {
            console.log(chalk.cyan('Stop service: '), chalk.white('deepseek-cowork stop'));
            console.log(chalk.cyan('Open web UI:  '), chalk.white('deepseek-cowork open'));
        }
        console.log('');
        
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

export default statusCommand;
