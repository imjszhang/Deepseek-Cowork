/**
 * open 命令 - 打开 Web 界面
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { getConfig } from '../index.mjs';
import { readPidFile, isProcessRunning } from '../utils/process.mjs';

// 公域网站地址
const PUBLIC_URL = 'https://deepseek-cowork.com';

/**
 * 打开 Web 界面命令
 */
export async function openCommand(options) {
    try {
        const config = await getConfig();
        const port = config.DEFAULT_HTTP_PORT;
        
        // 检查本地服务是否运行
        const pid = readPidFile(config.getPidFilePath());
        const isRunning = pid && isProcessRunning(pid);
        
        let serviceAvailable = false;
        
        if (isRunning) {
            // 尝试连接本地服务
            try {
                const response = await fetch(`http://localhost:${port}/api/ping`, {
                    signal: AbortSignal.timeout(2000)
                });
                serviceAvailable = response.ok;
            } catch (e) {
                // 服务未响应
            }
        }
        
        if (!serviceAvailable) {
            console.log(chalk.yellow('⚠  Local service is not running'));
            console.log('');
            
            if (!options.local) {
                // 询问是否启动服务
                console.log('The web interface requires the local service to function properly.');
                console.log('');
                console.log(chalk.cyan('Start the service first:'));
                console.log(chalk.white('  deepseek-cowork start --daemon'));
                console.log('');
                console.log(chalk.dim('Or open the public website without local features:'));
                console.log(chalk.dim(`  ${PUBLIC_URL}`));
                console.log('');
                return;
            }
        }
        
        // 确定要打开的 URL
        let url;
        
        if (options.local) {
            // 打开本地界面（如果部署了本地前端）
            // 目前本地前端使用 Electron，这里打开的是公域网站连接本地服务
            url = `${PUBLIC_URL}?local=true`;
            console.log(chalk.dim('Opening local interface...'));
        } else {
            // 打开公域网站
            url = PUBLIC_URL;
            console.log(chalk.dim('Opening web interface...'));
        }
        
        // 打开浏览器
        await open(url);
        
        console.log('');
        console.log(chalk.green('✓'), `Opened ${chalk.cyan(url)}`);
        
        if (serviceAvailable) {
            console.log(chalk.dim(`  Local service: http://localhost:${port}`));
        }
        console.log('');
        
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

export default openCommand;
