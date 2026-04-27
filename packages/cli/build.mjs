#!/usr/bin/env node

/**
 * CLI 构建脚本
 * 
 * 构建 CLI 并复制所有必需的运行时依赖
 * 
 * 创建时间: 2026-01-21
 */

import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { rmSync, mkdirSync, existsSync, copyFileSync, writeFileSync, readdirSync, statSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 项目根目录
const PROJECT_ROOT = join(__dirname, '../..');

// 输出目录
const DIST_DIR = join(__dirname, 'dist');

// 清理输出目录
if (existsSync(DIST_DIR)) {
    rmSync(DIST_DIR, { recursive: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log('Building DeepSeek Cowork CLI...');
console.log('Project root:', PROJECT_ROOT);
console.log('Output directory:', DIST_DIR);

/**
 * 递归复制目录
 * @param {string} src 源目录
 * @param {string} dest 目标目录
 * @param {Object} options 选项
 * @param {string[]} options.exclude 排除的文件/目录名或模式
 * @param {string[]} options.alwaysInclude 始终包含的目录名（不受 exclude 影响）
 * @param {boolean} options.debug 是否输出调试日志
 */
function copyDirSync(src, dest, options = {}) {
    const { exclude = [], alwaysInclude = [], debug = false } = options;
    
    if (!existsSync(src)) {
        console.warn(`  Warning: Source not found: ${src}`);
        return;
    }
    
    mkdirSync(dest, { recursive: true });
    
    const entries = readdirSync(src);
    for (const entry of entries) {
        // 白名单优先：如果在 alwaysInclude 中，跳过排除检查
        const isWhitelisted = alwaysInclude.includes(entry);
        
        // 检查是否排除（白名单项不检查）
        const shouldExclude = !isWhitelisted && exclude.some(pattern => {
            if (pattern.startsWith('*.')) {
                return entry.endsWith(pattern.slice(1));
            }
            return entry === pattern;
        });
        
        if (shouldExclude) {
            continue;
        }
        
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        const stat = statSync(srcPath);
        
        if (stat.isDirectory()) {
            copyDirSync(srcPath, destPath, options);
        } else {
            copyFileSync(srcPath, destPath);
        }
    }
}

// 需要保持为外部依赖的包（运行时安装）
const externalDeps = [
    // Node.js 内置模块
    'fs', 'path', 'os', 'http', 'https', 'net', 'events', 'crypto', 'url',
    'child_process', 'stream', 'util', 'buffer', 'querystring', 'zlib',
    'module', 'worker_threads', 'cluster', 'dgram', 'dns', 'tls',
    
    // 第三方依赖 - 这些会在运行时需要
    'express',
    'cors',
    'socket.io',
    'socket.io-client',
    'chokidar',
    'node-cron',
    'ws',
    'sql.js',
    'axios',
    'libsodium-wrappers',
    
    // CLI 自己的依赖
    'chalk',
    'commander',
    'open',
    'ora',
];

try {
    // 1. 构建 CLI 主入口文件（只打包 CLI 代码，不打包 lib/）
    console.log('\n📦 Building CLI bundle...');
    
    await esbuild.build({
        entryPoints: [join(__dirname, 'bin/cli.mjs')],
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'esm',
        outfile: join(DIST_DIR, 'cli.mjs'),
        external: externalDeps,
        mainFields: ['module', 'main'],
        sourcemap: false,
        minify: false,
        logLevel: 'info',
        // 不添加 banner，因为源文件已有 shebang
        // esbuild 会保留源文件开头的 shebang
    });
    
    console.log('✓ CLI bundle created: dist/cli.mjs');
    
    // 2. 复制 lib/ 目录（包含 local-service, happy-service 等）
    console.log('\n📁 Copying lib/ directory...');
    copyDirSync(
        join(PROJECT_ROOT, 'lib'),
        join(DIST_DIR, 'lib'),
        { 
            exclude: [
                '*.md',           // 排除文档
                'unpacked',       // 排除解压后的二进制文件（150MB+）
                'node_modules',   // 排除 node_modules（会在安装时重新安装）
                'yarn.lock',      // 排除 lock 文件
                'package-lock.json'
            ],
            // 白名单：这些目录即使匹配排除规则也会被复制
            alwaysInclude: [
                'dist',           // happy-cli/dist 必须包含（编译后的代码）
                'archives'        // happy-cli/tools/archives 必须包含（工具压缩包）
            ]
        }
    );
    
    // 在 lib/ 目录创建 package.json 声明 CommonJS 模式
    writeFileSync(
        join(DIST_DIR, 'lib/package.json'),
        JSON.stringify({ type: "commonjs" }, null, 2),
        'utf8'
    );
    console.log('✓ lib/ directory copied (CommonJS mode)');
    
    // 3. 复制 server/ 目录（modules、utils、modulesManager、modulesConfig）
    console.log('\n📁 Copying server/ directory...');
    
    // 3.1 复制 server/modules/ 子目录
    copyDirSync(
        join(PROJECT_ROOT, 'server/modules'),
        join(DIST_DIR, 'server/modules'),
        { exclude: ['*.md'] }
    );
    
    // 3.2 复制 server/utils/ 子目录
    copyDirSync(
        join(PROJECT_ROOT, 'server/utils'),
        join(DIST_DIR, 'server/utils'),
        { exclude: ['*.md'] }
    );
    
    // 3.3 复制 modulesManager.js 和 modulesConfig.js
    copyFileSync(
        join(PROJECT_ROOT, 'server/modulesManager.js'),
        join(DIST_DIR, 'server/modulesManager.js')
    );
    copyFileSync(
        join(PROJECT_ROOT, 'server/modulesConfig.js'),
        join(DIST_DIR, 'server/modulesConfig.js')
    );
    
    // 在 server/ 目录创建 package.json 声明 CommonJS 模式
    writeFileSync(
        join(DIST_DIR, 'server/package.json'),
        JSON.stringify({ type: "commonjs" }, null, 2),
        'utf8'
    );
    console.log('✓ server/ directory copied (CommonJS mode)');
    
    // 4. 复制 config/ 目录
    console.log('\n📁 Copying config/ directory...');
    copyDirSync(
        join(PROJECT_ROOT, 'config'),
        join(DIST_DIR, 'config'),
        { exclude: ['local.js', 'local.example.js'] }  // 排除本地配置
    );
    
    // 在 config/ 目录创建 package.json 声明 CommonJS 模式
    writeFileSync(
        join(DIST_DIR, 'config/package.json'),
        JSON.stringify({ type: "commonjs" }, null, 2),
        'utf8'
    );
    console.log('✓ config/ directory copied (CommonJS mode)');
    
    // 5. 复制 deploy/ 目录（skills 和 user-server-modules）
    console.log('\n📁 Copying deploy/ directory...');
    copyDirSync(
        join(PROJECT_ROOT, 'deploy'),
        join(DIST_DIR, 'deploy'),
        { exclude: ['node_modules'] }
    );
    console.log('✓ deploy/ directory copied');
    
    // 6. 创建 dist/package.json
    console.log('\n📄 Creating package.json...');
    
    // 读取当前版本和根目录的 overrides 配置
    const currentPkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
    const rootPkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));
    
    const dependencies = {
        // CLI 依赖
        "chalk": "^5.3.0",
        "commander": "^12.1.0",
        "open": "^10.1.0",
        "ora": "^8.0.1",
        
        // 服务依赖
        "express": "^4.22.1",
        "cors": "^2.8.5",
        "socket.io": "^4.8.3",
        "socket.io-client": "^4.8.3",
        "chokidar": "^3.6.0",
        "node-cron": "^4.2.1",
        "ws": "^8.20.0",
        "sql.js": "^1.14.1",
        "axios": "^1.15.2",
        "libsodium-wrappers": "^0.7.13",
        
        // happy-cli 工具解压依赖
        "tar": "^7.5.13",
        
        // happy-cli 运行时依赖（daemon 启动所需）
        "@agentclientprotocol/sdk": "^0.8.0",
        "@modelcontextprotocol/sdk": "^1.22.0",
        "@stablelib/base64": "^2.0.1",
        "@stablelib/hex": "^2.0.1",
        "ai": "^5.0.107",
        "cross-spawn": "^7.0.6",
        "expo-server-sdk": "^3.15.0",
        "fastify": "^5.6.2",
        "fastify-type-provider-zod": "4.0.2",
        "http-proxy": "^1.18.1",
        "http-proxy-middleware": "^3.0.5",
        "ink": "^6.5.1",
        "ps-list": "^8.1.1",
        "qrcode-terminal": "^0.12.0",
        "react": "^19.2.0",
        "tmp": "^0.2.5",
        "tweetnacl": "^1.0.3",
        "zod": "^3.23.8"
    };
    
    // 处理 overrides：如果某个包在 dependencies 中已存在，则从 overrides 中移除以避免冲突
    const processOverrides = () => {
        const overrides = rootPkg.overrides ? JSON.parse(JSON.stringify(rootPkg.overrides)) : {};
        
        // 移除在 dependencies 中已存在的包的 override
        const removeOverride = (obj, key) => {
            if (typeof obj === 'object' && obj !== null) {
                if (key in obj) {
                    delete obj[key];
                }
                for (const k in obj) {
                    if (typeof obj[k] === 'object') {
                        removeOverride(obj[k], key);
                    }
                }
            }
        };
        
        Object.keys(dependencies).forEach(depName => {
            removeOverride(overrides, depName);
        });
        
        return overrides;
    };
    
    const distPackageJson = {
        name: "deepseek-cowork",
        version: currentPkg.version,
        description: "Open-Source Alternative to Claude Cowork - CLI Tool",
        author: "imjszhang",
        license: "MIT",
        type: "module",
        bin: {
            "deepseek-cowork": "cli.mjs",
            "dsc": "cli.mjs"
        },
        main: "cli.mjs",
        scripts: {
            // 安装后自动解压 ripgrep/difftastic 工具
            "postinstall": "node lib/happy-cli/scripts/unpack-tools.cjs"
        },
        files: [
            "cli.mjs",
            "lib",
            "server",
            "config",
            "deploy"
        ],
        keywords: [
            "deepseek",
            "claude-cowork",
            "open-source",
            "ai-assistant",
            "browser-automation",
            "file-management",
            "llm",
            "claude-code",
            "cli"
        ],
        dependencies: dependencies,
        // 继承根目录的 overrides 配置，确保依赖版本统一
        // 如果某个包在 dependencies 中已存在，则从 overrides 中移除以避免冲突
        overrides: processOverrides(),
        engines: {
            node: ">=18.0.0"
        },
        repository: {
            type: "git",
            url: "git+https://github.com/imjszhang/deepseek-cowork.git"
        },
        homepage: "https://deepseek-cowork.com",
        bugs: {
            url: "https://github.com/imjszhang/deepseek-cowork/issues"
        },
        publishConfig: {
            registry: "https://registry.npmjs.org",
            access: "public"
        }
    };
    
    writeFileSync(
        join(DIST_DIR, 'package.json'),
        JSON.stringify(distPackageJson, null, 2),
        'utf8'
    );
    console.log('✓ package.json created');
    
    // 7. 复制 README
    const readmePath = join(PROJECT_ROOT, 'README.md');
    if (existsSync(readmePath)) {
        copyFileSync(readmePath, join(DIST_DIR, 'README.md'));
        console.log('✓ README.md copied');
    }
    
    // 8. 统计输出
    console.log('\n' + '='.repeat(50));
    console.log('✅ Build completed successfully!');
    console.log('='.repeat(50));
    
    // 计算目录大小
    function getDirSize(dir) {
        let size = 0;
        const files = readdirSync(dir);
        for (const file of files) {
            const filePath = join(dir, file);
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                size += getDirSize(filePath);
            } else {
                size += stat.size;
            }
        }
        return size;
    }
    
    const totalSize = getDirSize(DIST_DIR);
    console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('\nTo test locally:');
    console.log('  cd dist && npm link');
    console.log('  dsc --help');
    
    console.log('\nTo publish:');
    console.log('  cd dist');
    console.log('  npm publish');
    
} catch (error) {
    console.error('❌ Build failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}
