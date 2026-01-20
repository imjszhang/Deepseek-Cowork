#!/usr/bin/env node

/**
 * DeepSeek Cowork CLI 入口
 * 
 * 创建时间: 2026-01-20
 */

import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// 获取包根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

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

// 默认命令：显示帮助
program
    .action(() => {
        program.help();
    });

// 解析命令行参数
program.parse();
