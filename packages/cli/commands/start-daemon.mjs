#!/usr/bin/env node

/**
 * DeepSeek Cowork Daemon 启动脚本
 * 自动生成，请勿手动修改
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 使用绝对路径加载 local-service
const localService = require('D:/github/My/deepseek-cowork/lib/local-service');

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
