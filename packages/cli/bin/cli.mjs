#!/usr/bin/env node

/**
 * DeepSeek Cowork CLI 入口
 * 
 * 创建时间: 2026-01-20
 */

import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

// 获取包根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 智能查找 package.json
// - 打包后: cli.mjs 和 package.json 在同一目录
// - 开发模式: cli.mjs 在 bin/ 子目录，package.json 在父目录
function findPackageRoot() {
    // 先检查当前目录
    if (existsSync(join(__dirname, 'package.json'))) {
        return __dirname;
    }
    // 再检查父目录（开发模式）
    if (existsSync(join(__dirname, '..', 'package.json'))) {
        return join(__dirname, '..');
    }
    // 默认返回当前目录
    return __dirname;
}

const packageRoot = findPackageRoot();

// 读取 package.json
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

// 导入命令
import { startCommand } from '../commands/start.mjs';
import { stopCommand } from '../commands/stop.mjs';
import { statusCommand } from '../commands/status.mjs';
import { configCommand } from '../commands/config.mjs';
import { openCommand } from '../commands/open.mjs';
import { loginCommand } from '../commands/login.mjs';
import { logoutCommand } from '../commands/logout.mjs';
import { cleanupCommand } from '../commands/cleanup.mjs';

// 配置程序
program
    .name('deepseek-cowork')
    .description('Open-Source Alternative to Claude Cowork - CLI Tool')
    .version(packageJson.version);

// 注册命令
program
    .command('start')
    .description('Start the local service')
    .option('-d, --daemon', 'Run in background as daemon')
    .option('-p, --port <port>', 'HTTP port', '3333')
    .option('--ws-port <port>', 'WebSocket port', '8080')
    .option('-w, --work-dir <path>', 'Working directory')
    .option('--debug', 'Enable debug mode')
    .action(startCommand);

program
    .command('stop')
    .description('Stop the local service')
    .action(stopCommand);

program
    .command('status')
    .description('Show service status')
    .option('-j, --json', 'Output as JSON')
    .action(statusCommand);

program
    .command('config')
    .description('Manage configuration')
    .argument('[action]', 'Action: list, get, set', 'list')
    .argument('[key]', 'Configuration key')
    .argument('[value]', 'Configuration value')
    .action(configCommand);

program
    .command('open')
    .description('Open web interface in browser')
    .option('-l, --local', 'Open local interface instead of public website')
    .action(openCommand);

program
    .command('login')
    .description('Login with your Happy AI account')
    .option('-s, --secret <secret>', 'Provide secret directly')
    .action(loginCommand);

program
    .command('logout')
    .description('Logout from your account')
    .action(logoutCommand);

program
    .command('cleanup')
    .description('Clean up orphaned daemon and session processes')
    .option('-a, --all', 'Also clean up session state files')
    .option('--debug', 'Show debug information')
    .action(cleanupCommand);

// 默认命令：显示帮助
program
    .action(() => {
        program.help();
    });

// 解析命令行参数
program.parse();
