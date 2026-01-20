/**
 * logout 命令 - 登出账户
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getConfig, getSecureSettings, getUserSettings } from '../index.mjs';
import { readPidFile, isProcessRunning, killProcess, waitForProcessExit, removePidFile } from '../utils/process.mjs';

/**
 * 登出命令
 */
export async function logoutCommand(options) {
    const spinner = ora('Logging out...').start();
    
    try {
        const config = await getConfig();
        const secureSettings = await getSecureSettings();
        const userSettings = await getUserSettings();
        
        // 初始化设置
        userSettings.initialize();
        await secureSettings.initialize();
        
        // 检查是否已登录
        if (!secureSettings.hasSecret('happy.secret')) {
            spinner.info('You are not logged in');
            return;
        }
        
        // 检查服务是否运行，如果是则先停止
        const pid = readPidFile(config.getPidFilePath());
        if (pid && isProcessRunning(pid)) {
            spinner.text = 'Stopping service...';
            
            killProcess(pid, 'SIGTERM');
            await waitForProcessExit(pid, 5000);
            removePidFile(config.getPidFilePath());
        }
        
        // 删除 secret
        spinner.text = 'Removing credentials...';
        secureSettings.deleteSecret('happy.secret');
        secureSettings.deleteSecret('claude.authToken');
        
        // 删除 ~/.happy/access.key
        const accessKeyPath = join(homedir(), '.happy', 'access.key');
        if (existsSync(accessKeyPath)) {
            unlinkSync(accessKeyPath);
        }
        
        spinner.succeed('Logged out successfully');
        console.log('');
        console.log(chalk.dim('Your local data has been preserved.'));
        console.log(chalk.dim('To login again: deepseek-cowork login'));
        console.log('');
        
    } catch (error) {
        spinner.fail(`Logout failed: ${error.message}`);
        process.exit(1);
    }
}

export default logoutCommand;
