/**
 * start 命令 - 启动本地服务
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { getLocalService, getConfig, PROJECT_ROOT } from '../index.mjs';
import { checkPort, writePidFile, readPidFile, isProcessRunning } from '../utils/process.mjs';

/**
 * 启动服务命令
 */
export async function startCommand(options) {
    const spinner = ora('Starting DeepSeek Cowork...').start();
    
    try {
        // 获取配置
        const config = await getConfig();
        const httpPort = parseInt(options.port) || config.DEFAULT_HTTP_PORT;
        const wsPort = parseInt(options.wsPort) || config.DEFAULT_WS_PORT;
        const workDir = options.workDir || null;
        const debug = options.debug || false;
        
        // 检查是否已有服务运行
        const existingPid = readPidFile(config.getPidFilePath());
        if (existingPid && isProcessRunning(existingPid)) {
            spinner.fail(`DeepSeek Cowork is already running (PID: ${existingPid})`);
            console.log(chalk.yellow('\nUse `deepseek-cowork status` to check status'));
            console.log(chalk.yellow('Use `deepseek-cowork stop` to stop the service'));
            process.exit(1);
        }
        
        // 检查端口是否可用
        const httpPortAvailable = await checkPort(httpPort);
        if (!httpPortAvailable) {
            spinner.fail(`Port ${httpPort} is already in use`);
            console.log(chalk.yellow(`\nTry using a different port with --port <port>`));
            process.exit(1);
        }
        
        if (options.daemon) {
            // 后台模式运行
            spinner.text = 'Starting in background mode...';
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const startScript = join(__dirname, 'start-daemon.mjs');
            
            // 创建后台启动脚本（总是重新创建，确保路径正确）
            createDaemonScript(startScript, PROJECT_ROOT);
            
            // 启动后台进程
            const child = spawn(process.execPath, [
                '--no-warnings',
                startScript,
                '--port', httpPort.toString(),
                '--ws-port', wsPort.toString(),
                ...(workDir ? ['--work-dir', workDir] : []),
                ...(debug ? ['--debug'] : [])
            ], {
                detached: true,
                stdio: 'ignore',
                env: { ...process.env, FORCE_COLOR: '1' }
            });
            
            child.unref();
            
            // 保存 PID
            writePidFile(config.getPidFilePath(), child.pid);
            
            // 等待服务启动
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 检查服务是否启动成功
            try {
                const response = await fetch(`http://localhost:${httpPort}/api/ping`);
                if (response.ok) {
                    spinner.succeed('DeepSeek Cowork started in background');
                    console.log('');
                    console.log(chalk.green(`  PID:       ${child.pid}`));
                    console.log(chalk.green(`  HTTP:      http://localhost:${httpPort}`));
                    console.log(chalk.green(`  WebSocket: ws://localhost:${wsPort}`));
                    console.log('');
                    console.log(chalk.cyan('  Open web interface:'), chalk.white('deepseek-cowork open'));
                    console.log(chalk.cyan('  Check status:      '), chalk.white('deepseek-cowork status'));
                    console.log(chalk.cyan('  Stop service:      '), chalk.white('deepseek-cowork stop'));
                } else {
                    throw new Error('Service not responding');
                }
            } catch (e) {
                spinner.warn('Service started but may not be fully ready');
                console.log(chalk.yellow('\nCheck status with: deepseek-cowork status'));
            }
            
        } else {
            // 前台模式运行
            spinner.text = 'Initializing services...';
            
            const localService = await getLocalService();
            
            // 初始化服务
            const initResult = await localService.initialize({
                httpPort,
                wsPort,
                workDir,
                debug
            });
            
            if (!initResult.success) {
                spinner.fail(`Initialization failed: ${initResult.error}`);
                process.exit(1);
            }
            
            spinner.text = 'Starting HTTP server...';
            
            // 启动服务
            const startResult = await localService.start();
            
            if (!startResult.success) {
                spinner.fail(`Failed to start: ${startResult.error}`);
                process.exit(1);
            }
            
            // 保存 PID
            writePidFile(config.getPidFilePath(), process.pid);
            
            spinner.succeed('DeepSeek Cowork started');
            console.log('');
            console.log(chalk.green(`  HTTP:      http://localhost:${startResult.httpPort}`));
            console.log(chalk.green(`  WebSocket: ws://localhost:${startResult.wsPort}`));
            console.log('');
            console.log(chalk.dim('  Press Ctrl+C to stop'));
            console.log('');
            
            // 处理退出信号
            const cleanup = async () => {
                console.log('\n');
                const stopSpinner = ora('Stopping service...').start();
                // 停止服务时同时停止 daemon，避免孤儿进程
                await localService.stop({ stopDaemon: true });
                
                // 删除 PID 文件
                const fs = await import('fs');
                try {
                    fs.unlinkSync(config.getPidFilePath());
                } catch (e) {
                    // 忽略错误
                }
                
                stopSpinner.succeed('Service stopped');
                process.exit(0);
            };
            
            process.on('SIGINT', cleanup);
            process.on('SIGTERM', cleanup);
        }
        
    } catch (error) {
        spinner.fail(`Failed to start: ${error.message}`);
        if (options.debug) {
            console.error(error);
        }
        process.exit(1);
    }
}

/**
 * 创建后台启动脚本
 * @param {string} scriptPath 脚本保存路径
 * @param {string} packageRoot 包根目录（用于定位 lib/local-service）
 */
function createDaemonScript(scriptPath, packageRoot) {
    // 使用绝对路径，确保在任何位置都能正确找到模块
    const localServicePath = join(packageRoot, 'lib', 'local-service').replace(/\\/g, '/');
    
    const script = `#!/usr/bin/env node

/**
 * DeepSeek Cowork Daemon 启动脚本
 * 自动生成，请勿手动修改
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 使用绝对路径加载 local-service
const localService = require('${localServicePath}');

// 解析命令行参数
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') {
        options.httpPort = parseInt(args[++i]);
    } else if (args[i] === '--ws-port') {
        options.wsPort = parseInt(args[++i]);
    } else if (args[i] === '--work-dir') {
        options.workDir = args[++i];
    } else if (args[i] === '--debug') {
        options.debug = true;
    }
}

async function main() {
    try {
        await localService.initialize(options);
        await localService.start();
        console.log('DeepSeek Cowork daemon started');
    } catch (error) {
        console.error('Failed to start daemon:', error.message);
        process.exit(1);
    }
}

main();
`;

    writeFileSync(scriptPath, script, 'utf8');
}

export default startCommand;
