/**
 * Web 构建配置
 * 
 * 用于构建公域 Web 前端，移除 Electron 相关依赖
 * 
 * 创建时间: 2026-01-20
 */

const path = require('path');
const fs = require('fs');

// 源目录和输出目录
const SRC_DIR = path.join(__dirname, '../renderer');
const OUT_DIR = path.join(__dirname, '../docs/app');

// 需要复制的静态资源
const STATIC_ASSETS = [
    'css',
    'fonts',
    'index.html'
];

// 需要处理的 JS 文件
const JS_FILES = [
    'js/core/ThemeManager.js',
    'js/core/ModelConfig.js',
    'js/core/WindowController.js',
    'js/core/ApiAdapter.js',
    'js/core/WebSocketClient.js',
    'js/components/DialogManager.js',
    'js/components/NotificationManager.js',
    'js/components/LogViewer.js',
    'js/components/ConnectionGuide.js',
    'js/features/browser/BrowserControlModule.js',
    'js/features/browser/services/ExtensionService.js',
    'js/features/browser/services/ServerService.js',
    'js/features/explorer/ExplorerModule.js',
    'js/features/explorer/PreviewBackground.js',
    'js/features/explorer/services/ExplorerClient.js',
    'js/features/explorer/services/ExplorerSSE.js',
    'js/features/explorer/services/ExplorerManager.js',
    'js/features/happy-ai/HappyMessageHandler.js',
    'js/features/happy-ai/ToolCallRenderer.js',
    'js/features/happy-ai/UsageDisplay.js',
    'js/features/settings/ClaudeCodeSettings.js',
    'js/features/settings/DaemonManager.js',
    'js/features/settings/DependencyChecker.js',
    'js/features/settings/WorkspaceSettings.js',
    'js/features/command-suggestions/index.js',
    'js/i18n/index.js',
    'js/i18n/locales/en-US.js',
    'js/i18n/locales/zh-CN.js',
    'js/panels/BrowserPanel.js',
    'js/panels/ChatPanel.js',
    'js/panels/FilesPanel.js',
    'js/panels/SettingsPanel.js',
    'js/sync/normalizer.js',
    'js/sync/reducer.js',
    'js/sync/types.js',
    'js/utils/optionsParser.js',
    'js/wizards/AccountSetup.js',
    'js/wizards/SetupWizard.js',
    'js/app.js'
];

// Electron 相关代码的替换规则
// 注意：大部分替换已不需要，因为 ApiAdapter.js 中的 polyfill 会在 Web 模式下
// 自动创建 window.browserControlManager 兼容层
const ELECTRON_REPLACEMENTS = [
    // 移除 Electron 专用的窗口控制代码（最小化、最大化、关闭按钮）
    {
        pattern: /if\s*\(\s*window\.browserControlManager\s*\)\s*\{[^}]*browserControlManager\.(minimize|maximize|close)Window[^}]*\}/g,
        replacement: '/* Electron window controls removed for web build */'
    }
];

/**
 * 确保目录存在
 */
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * 复制目录
 */
function copyDir(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 处理 JS 文件
 */
function processJsFile(srcPath, destPath) {
    let content = fs.readFileSync(srcPath, 'utf8');
    
    // 应用替换规则
    for (const rule of ELECTRON_REPLACEMENTS) {
        content = content.replace(rule.pattern, rule.replacement);
    }
    
    // 确保目标目录存在
    ensureDir(path.dirname(destPath));
    
    // 写入处理后的文件
    fs.writeFileSync(destPath, content, 'utf8');
}

/**
 * 处理 HTML 文件
 */
function processHtml(srcPath, destPath) {
    let content = fs.readFileSync(srcPath, 'utf8');
    
    // 移除 Electron 专用的 CSP 元标签（或修改为 Web 版本）
    content = content.replace(
        /(<meta\s+http-equiv="Content-Security-Policy"[^>]*>)/,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' http://localhost:3333 ws://localhost:3333 https:; img-src 'self' data: blob: https:; font-src 'self' data:;">`
    );
    
    // 添加 Socket.IO 客户端库
    content = content.replace(
        '</head>',
        `    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>\n</head>`
    );
    
    // 添加新的 JS 文件引用（仅当不存在时）
    if (!content.includes('js/core/ApiAdapter.js')) {
        content = content.replace(
            '<script src="js/app.js"></script>',
            `<script src="js/core/ApiAdapter.js"></script>
    <script src="js/core/WebSocketClient.js"></script>
    <script src="js/components/ConnectionGuide.js"></script>
    <script src="js/app.js"></script>`
        );
    }
    
    // 添加连接指引样式（仅当不存在时）
    if (!content.includes('connection-guide.css')) {
        content = content.replace(
            '<link rel="stylesheet" href="css/main.css">',
            `<link rel="stylesheet" href="css/main.css">
    <link rel="stylesheet" href="css/components/connection-guide.css">`
        );
    }
    
    fs.writeFileSync(destPath, content, 'utf8');
}

/**
 * 构建 Web 版本
 */
async function build() {
    console.log('Building Web version...\n');
    
    // 清理输出目录
    if (fs.existsSync(OUT_DIR)) {
        fs.rmSync(OUT_DIR, { recursive: true, force: true });
    }
    ensureDir(OUT_DIR);
    
    // 复制静态资源
    console.log('Copying static assets...');
    for (const asset of STATIC_ASSETS) {
        const srcPath = path.join(SRC_DIR, asset);
        const destPath = path.join(OUT_DIR, asset);
        
        if (fs.existsSync(srcPath)) {
            if (fs.statSync(srcPath).isDirectory()) {
                copyDir(srcPath, destPath);
            } else if (asset === 'index.html') {
                processHtml(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
            console.log(`  ✓ ${asset}`);
        }
    }
    
    // 处理 JS 文件
    console.log('\nProcessing JS files...');
    for (const jsFile of JS_FILES) {
        const srcPath = path.join(SRC_DIR, jsFile);
        const destPath = path.join(OUT_DIR, jsFile);
        
        if (fs.existsSync(srcPath)) {
            processJsFile(srcPath, destPath);
            console.log(`  ✓ ${jsFile}`);
        } else {
            console.log(`  ⚠ ${jsFile} (not found)`);
        }
    }
    
    // 复制图标
    const iconsDir = path.join(__dirname, '../icons');
    const iconsDestDir = path.join(OUT_DIR, 'icons');
    if (fs.existsSync(iconsDir)) {
        copyDir(iconsDir, iconsDestDir);
        console.log('\n  ✓ icons');
    }
    
    // 复制 favicon.ico 到 app 根目录
    const faviconSrc = path.join(__dirname, '../icons/icon.ico');
    const faviconDest = path.join(OUT_DIR, 'favicon.ico');
    if (fs.existsSync(faviconSrc)) {
        fs.copyFileSync(faviconSrc, faviconDest);
        console.log('  ✓ favicon.ico');
    }
    
    // 创建 .nojekyll 文件（用于 GitHub Pages）
    fs.writeFileSync(path.join(OUT_DIR, '.nojekyll'), '', 'utf8');
    
    // 注意：CNAME 不需要复制到 app 子目录，已在 docs 根目录
    
    console.log('\n✅ Web build complete!');
    console.log(`   Output: ${OUT_DIR}`);
}

// 如果直接运行此脚本
if (require.main === module) {
    build().catch(console.error);
}

module.exports = { build };
