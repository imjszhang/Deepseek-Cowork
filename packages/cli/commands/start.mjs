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
import { getLocalService, getConfig, getDiscovery, PROJECT_ROOT } from '../index.mjs';
import { writePidFile, readPidFile, removePidFile, isProcessRunning } from '../utils/process.mjs';

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
        
        // 发现并复用已有同源服务
        spinner.text = 'Discovering local service...';
        const discovery = await getDiscovery();
        const service = await discovery.discoverService({ port: httpPort });
        if (!service.available && service.sameApp && service.compatible) {
            spinner.succeed(`DeepSeek Cowork service is already running (${service.startedBy || service.mode}, PID: ${service.pid || 'unknown'})`);
            console.log('');
            console.log(chalk.green(`  HTTP:      ${service.baseUrl}`));
            if (service.wsPort) {
                console.log(chalk.green(`  WebSocket: ws://localhost:${service.wsPort}`));
            }
            console.log(chalk.dim('  Reusing the existing local backend.'));
            return;
        }

        // 检查是否已有 CLI 记录的进程运行。PID 只作为辅助信息，端口发现才是服务事实。
        const existingPid = readPidFile(config.getPidFilePath());
        if (existingPid && isProcessRunning(existingPid)) {
            spinner.fail(`A previous CLI service process is still running (PID: ${existingPid}), but it is not responding on port ${httpPort}`);
            console.log(chalk.yellow('\nUse `deepseek-cowork status` to check details'));
            console.log(chalk.yellow('Use `deepseek-cowork stop` to stop the recorded CLI process'));
            process.exit(1);
        } else if (existingPid) {
            removePidFile(config.getPidFilePath());
        }

        if (!service.available) {
            if (service.sameApp && !service.compatible) {
                spinner.fail(`DeepSeek Cowork service on port ${httpPort} uses an incompatible protocol`);
                console.log(chalk.yellow('\nPlease update both Electron and CLI, then restart the local service.'));
            } else {
                spinner.fail(`Port ${httpPort} is already in use by another program`);
                console.log('');
                console.log(chalk.yellow('Please close the program using this port before starting CLI service.'));
                console.log(chalk.yellow(`Or try using a different port with --port <port>`));
            }
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
            
            // 创建日志文件用于捕获 daemon 输出
            const fs = await import('fs');
            const logDir = config.getDataDir();
            const logPath = join(logDir, 'daemon.log');
            
            // 确保日志目录存在
            if (!existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // 打开日志文件
            const logFile = fs.openSync(logPath, 'a');
            
            // 启动后台进程
            // 重要：在 Windows 上，使用 stdio 重定向到文件而不是 'ignore'
            // 这可以避免当子进程被终止时导致父进程崩溃的问题
            const child = spawn(process.execPath, [
                '--no-warnings',
                startScript,
                '--port', httpPort.toString(),
                '--ws-port', wsPort.toString(),
                ...(workDir ? ['--work-dir', workDir] : []),
                ...(debug ? ['--debug'] : [])
            ], {
                detached: true,
                stdio: ['ignore', logFile, logFile],
                env: { ...process.env, FORCE_COLOR: '1' }
            });
            
            child.unref();
            
            // 关闭父进程持有的日志文件句柄
            fs.closeSync(logFile);
            
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
                    console.log(chalk.cyan('  Open app interface:'), chalk.white('deepseek-cowork open'));
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
                debug,
                mode: 'cli'
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
                // 只停止主服务，不停止 daemon 进程（daemon 由 cleanup 命令清理）
                await localService.stop({ stopDaemon: false });
                
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
 * @param {string} packageRoot 包根目录（未使用，保留参数兼容性）
 */
function createDaemonScript(scriptPath, packageRoot) {
    // 生成使用动态路径解析的脚本，避免硬编码绝对路径
    // 脚本运行时会根据自身位置计算 local-service 路径
    const script = `#!/usr/bin/env node

/**
 * DeepSeek Cowork Daemon 启动脚本
 * 自动生成，请勿手动修改
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * 智能获取项目根目录
 * - 开发模式：packages/cli/commands -> 项目根目录
 * - 打包模式：检测 lib/ 目录位置
 */
function getProjectRoot() {
    // 方案1：开发模式（packages/cli/commands 结构）
    const devRoot = join(__dirname, '../../..');
    if (existsSync(join(devRoot, 'lib/local-service/index.js'))) {
        return devRoot;
    }
    
    // 方案2：打包后的结构（lib/ 在 cli.mjs 同级目录）
    const distRoot = join(__dirname, '..');
    if (existsSync(join(distRoot, 'lib/local-service/index.js'))) {
        return distRoot;
    }
    
    // 方案3：当前目录
    if (existsSync(join(__dirname, 'lib/local-service/index.js'))) {
        return __dirname;
    }
    
    throw new Error(
        'Cannot find lib/local-service module.\\n' +
        '  __dirname: ' + __dirname + '\\n' +
        '  Checked paths:\\n' +
        '    - ' + join(devRoot, 'lib/local-service/index.js') + '\\n' +
        '    - ' + join(distRoot, 'lib/local-service/index.js') + '\\n' +
        '    - ' + join(__dirname, 'lib/local-service/index.js')
    );
}

// 动态加载 local-service
const PROJECT_ROOT = getProjectRoot();
const localService = require(join(PROJECT_ROOT, 'lib/local-service'));

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
        options.mode = 'cli';
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
