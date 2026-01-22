/**
 * 文件系统 API 路由
 * 
 * 对应 Electron IPC: fs:* 通道
 * 
 * 创建时间: 2026-01-20
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const userSettings = require('../user-settings-cli');
const { getDefaultWorkspaceDir, ensureDir } = require('../config');

// 文件图标映射（简化版）
const FILE_ICONS = {
    folder: 'folder',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'react',
    tsx: 'react',
    vue: 'vue',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    txt: 'text',
    pdf: 'pdf',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'svg',
    mp3: 'audio',
    wav: 'audio',
    mp4: 'video',
    avi: 'video',
    zip: 'archive',
    rar: 'archive',
    tar: 'archive',
    gz: 'archive',
    exe: 'executable',
    dll: 'library',
    sh: 'shell',
    bat: 'shell',
    ps1: 'powershell'
};

/**
 * 获取工作目录根路径
 */
function getWorkspaceRoot() {
    return userSettings.get('happy.workspaceDir') || getDefaultWorkspaceDir();
}

/**
 * 验证并解析路径（防止路径遍历攻击）
 */
function validatePath(inputPath) {
    const workspaceRoot = getWorkspaceRoot();
    
    // 如果是相对路径，相对于工作目录解析
    let resolvedPath;
    if (path.isAbsolute(inputPath)) {
        resolvedPath = path.normalize(inputPath);
    } else {
        resolvedPath = path.normalize(path.join(workspaceRoot, inputPath));
    }
    
    // 检查是否在允许的目录内
    // 注意：CLI 模式允许访问整个文件系统，但需要用户确认
    return resolvedPath;
}

/**
 * 获取文件图标
 */
function getFileIcon(fileName, isDirectory) {
    if (isDirectory) {
        return 'folder';
    }
    
    const ext = path.extname(fileName).toLowerCase().slice(1);
    return FILE_ICONS[ext] || 'file';
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取文件 MIME 类型
 */
function getMimeType(ext) {
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.tar': 'application/x-tar',
        '.gz': 'application/gzip'
    };
    return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * 注册文件系统路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function filesRoutes(app, context) {
    console.log('[FilesRoutes] Registering file system routes...');
    
    /**
     * GET /api/files/workspace
     * 获取工作目录根路径
     */
    app.get('/api/files/workspace', (req, res) => {
        try {
            const workspaceRoot = getWorkspaceRoot();
            ensureDir(workspaceRoot);
            
            res.json({
                success: true,
                path: workspaceRoot
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/files/list
     * 列出目录内容
     */
    app.get('/api/files/list', async (req, res) => {
        try {
            const dirPath = req.query.path || getWorkspaceRoot();
            const showHidden = req.query.showHidden === 'true';
            const resolvedPath = validatePath(dirPath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Directory not found'
                });
            }
            
            const stats = fs.statSync(resolvedPath);
            if (!stats.isDirectory()) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is not a directory'
                });
            }
            
            const items = fs.readdirSync(resolvedPath);
            const results = [];
            
            for (const item of items) {
                // 根据参数决定是否跳过隐藏文件（以 . 开头的文件）
                if (!showHidden && item.startsWith('.')) continue;
                
                const itemPath = path.join(resolvedPath, item);
                try {
                    const itemStats = fs.statSync(itemPath);
                    const isDirectory = itemStats.isDirectory();
                    
                    results.push({
                        name: item,
                        path: itemPath,
                        isDirectory,
                        isHidden: item.startsWith('.'),
                        size: isDirectory ? null : itemStats.size,
                        sizeFormatted: isDirectory ? null : formatFileSize(itemStats.size),
                        modified: itemStats.mtime.toISOString(),
                        created: itemStats.birthtime.toISOString(),
                        icon: getFileIcon(item, isDirectory)
                    });
                } catch (e) {
                    // 跳过无法访问的文件
                    console.warn(`Cannot access: ${itemPath}`);
                }
            }
            
            // 排序：目录在前，然后按名称排序
            results.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) return -1;
                if (!a.isDirectory && b.isDirectory) return 1;
                return a.name.localeCompare(b.name);
            });
            
            res.json({
                success: true,
                path: resolvedPath,
                items: results
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/files/folder
     * 创建文件夹
     */
    app.post('/api/files/folder', async (req, res) => {
        try {
            const { path: folderPath } = req.body;
            
            if (!folderPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Folder path is required'
                });
            }
            
            const resolvedPath = validatePath(folderPath);
            
            if (fs.existsSync(resolvedPath)) {
                return res.status(400).json({
                    success: false,
                    error: 'Folder already exists'
                });
            }
            
            fs.mkdirSync(resolvedPath, { recursive: true });
            
            res.json({
                success: true,
                path: resolvedPath
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * DELETE /api/files/item
     * 删除文件或文件夹
     */
    app.delete('/api/files/item', async (req, res) => {
        try {
            const itemPath = req.query.path;
            
            if (!itemPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Item path is required'
                });
            }
            
            const resolvedPath = validatePath(itemPath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Item not found'
                });
            }
            
            const stats = fs.statSync(resolvedPath);
            
            if (stats.isDirectory()) {
                fs.rmSync(resolvedPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(resolvedPath);
            }
            
            res.json({ success: true });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/files/rename
     * 重命名文件或文件夹
     */
    app.put('/api/files/rename', async (req, res) => {
        try {
            const { oldPath, newPath } = req.body;
            
            if (!oldPath || !newPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Both oldPath and newPath are required'
                });
            }
            
            const resolvedOldPath = validatePath(oldPath);
            const resolvedNewPath = validatePath(newPath);
            
            if (!fs.existsSync(resolvedOldPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Source item not found'
                });
            }
            
            if (fs.existsSync(resolvedNewPath)) {
                return res.status(400).json({
                    success: false,
                    error: 'Destination already exists'
                });
            }
            
            fs.renameSync(resolvedOldPath, resolvedNewPath);
            
            res.json({
                success: true,
                path: resolvedNewPath
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/files/content
     * 读取文件内容
     */
    app.get('/api/files/content', async (req, res) => {
        try {
            const filePath = req.query.path;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }
            
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            
            const stats = fs.statSync(resolvedPath);
            
            if (stats.isDirectory()) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is a directory'
                });
            }
            
            // 限制文件大小（10MB）
            if (stats.size > 10 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    error: 'File too large (max 10MB)'
                });
            }
            
            const content = fs.readFileSync(resolvedPath, 'utf8');
            
            res.json({
                success: true,
                path: filePath,
                content
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * PUT /api/files/content
     * 保存文件内容
     */
    app.put('/api/files/content', async (req, res) => {
        try {
            const { path: filePath, content } = req.body;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }
            
            const resolvedPath = validatePath(filePath);
            
            // 确保目录存在
            const dirPath = path.dirname(resolvedPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            fs.writeFileSync(resolvedPath, content || '', 'utf8');
            
            res.json({
                success: true,
                path: filePath,
                message: '文件已保存'
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/files/binary
     * 读取二进制文件内容（用于 PDF 等二进制文件预览）
     */
    console.log('[FilesRoutes] Registering /api/files/binary route');
    app.get('/api/files/binary', async (req, res) => {
        console.log('[FilesRoutes] /api/files/binary called with path:', req.query.path);
        try {
            const filePath = req.query.path;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }
            
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            
            const stats = fs.statSync(resolvedPath);
            
            if (stats.isDirectory()) {
                return res.status(400).json({
                    success: false,
                    error: 'Path is a directory'
                });
            }
            
            // 限制文件大小（50MB for binary files like PDF）
            if (stats.size > 50 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    error: 'File too large (max 50MB)'
                });
            }
            
            // 读取二进制文件并转为 Base64
            const buffer = fs.readFileSync(resolvedPath);
            const base64 = buffer.toString('base64');
            
            res.json({
                success: true,
                path: filePath,
                data: base64,
                size: stats.size,
                mimeType: getMimeType(path.extname(resolvedPath))
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/files/info
     * 获取文件/文件夹信息
     */
    app.get('/api/files/info', async (req, res) => {
        try {
            const itemPath = req.query.path;
            
            if (!itemPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Item path is required'
                });
            }
            
            const resolvedPath = validatePath(itemPath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Item not found'
                });
            }
            
            const stats = fs.statSync(resolvedPath);
            const isDirectory = stats.isDirectory();
            const name = path.basename(resolvedPath);
            
            res.json({
                success: true,
                info: {
                    name,
                    path: resolvedPath,
                    isDirectory,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    modified: stats.mtime.toISOString(),
                    created: stats.birthtime.toISOString(),
                    icon: getFileIcon(name, isDirectory)
                }
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/files/copy
     * 复制文件或文件夹
     */
    app.post('/api/files/copy', async (req, res) => {
        try {
            const { sourcePath, destPath } = req.body;
            
            if (!sourcePath || !destPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Both sourcePath and destPath are required'
                });
            }
            
            const resolvedSource = validatePath(sourcePath);
            const resolvedDest = validatePath(destPath);
            
            if (!fs.existsSync(resolvedSource)) {
                return res.status(404).json({
                    success: false,
                    error: 'Source item not found'
                });
            }
            
            // 递归复制
            fs.cpSync(resolvedSource, resolvedDest, { recursive: true });
            
            res.json({
                success: true,
                path: resolvedDest
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/files/move
     * 移动文件或文件夹
     */
    app.post('/api/files/move', async (req, res) => {
        try {
            const { sourcePath, destPath } = req.body;
            
            if (!sourcePath || !destPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Both sourcePath and destPath are required'
                });
            }
            
            const resolvedSource = validatePath(sourcePath);
            const resolvedDest = validatePath(destPath);
            
            if (!fs.existsSync(resolvedSource)) {
                return res.status(404).json({
                    success: false,
                    error: 'Source item not found'
                });
            }
            
            fs.renameSync(resolvedSource, resolvedDest);
            
            res.json({
                success: true,
                path: resolvedDest
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/files/open
     * 使用系统默认程序打开文件
     */
    app.post('/api/files/open', async (req, res) => {
        try {
            const { path: filePath } = req.body;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }
            
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            
            // 使用系统命令打开文件
            const platform = process.platform;
            let command;
            
            if (platform === 'win32') {
                command = `start "" "${resolvedPath}"`;
            } else if (platform === 'darwin') {
                command = `open "${resolvedPath}"`;
            } else {
                command = `xdg-open "${resolvedPath}"`;
            }
            
            exec(command, (error) => {
                if (error) {
                    console.error('Failed to open file:', error);
                }
            });
            
            res.json({ success: true });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * POST /api/files/showInExplorer
     * 在文件管理器中显示文件
     */
    app.post('/api/files/showInExplorer', async (req, res) => {
        try {
            const { path: filePath } = req.body;
            
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'File path is required'
                });
            }
            
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
            
            const platform = process.platform;
            let command;
            
            if (platform === 'win32') {
                command = `explorer /select,"${resolvedPath}"`;
            } else if (platform === 'darwin') {
                command = `open -R "${resolvedPath}"`;
            } else {
                // Linux: 打开包含文件的目录
                const dirPath = fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
                command = `xdg-open "${dirPath}"`;
            }
            
            exec(command, (error) => {
                if (error) {
                    console.error('Failed to show in explorer:', error);
                }
            });
            
            res.json({ success: true });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
    
    /**
     * GET /api/files/serve
     * 直接提供文件内容（用于在浏览器中预览 HTML 等文件）
     * 支持相对路径资源加载
     */
    app.get('/api/files/serve', async (req, res) => {
        try {
            const filePath = req.query.path;
            
            if (!filePath) {
                return res.status(400).send('File path is required');
            }
            
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).send('File not found');
            }
            
            const stats = fs.statSync(resolvedPath);
            
            if (stats.isDirectory()) {
                // 如果是目录，尝试加载 index.html
                const indexPath = path.join(resolvedPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    return res.sendFile(indexPath);
                }
                return res.status(400).send('Path is a directory');
            }
            
            // 获取文件扩展名
            const ext = path.extname(resolvedPath).toLowerCase();
            
            // MIME 类型映射
            const mimeTypes = {
                '.html': 'text/html',
                '.htm': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.mjs': 'application/javascript',
                '.json': 'application/json',
                '.xml': 'application/xml',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.ico': 'image/x-icon',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.eot': 'application/vnd.ms-fontobject',
                '.otf': 'font/otf',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.md': 'text/plain'
            };
            
            let contentType = mimeTypes[ext] || 'application/octet-stream';
            
            // 对于 HTML 文件，注入 base 标签以支持相对路径资源加载
            if (ext === '.html' || ext === '.htm') {
                let content = fs.readFileSync(resolvedPath, 'utf8');
                const dirPath = path.dirname(resolvedPath);
                // 将本地路径转换为 serve URL
                const baseUrl = `/api/files/serve?path=${encodeURIComponent(dirPath)}/`;
                
                // 在 <head> 中注入 <base> 标签（如果没有的话）
                if (!/<base\s/i.test(content)) {
                    if (/<head[^>]*>/i.test(content)) {
                        content = content.replace(/<head[^>]*>/i, `$&\n    <base href="${baseUrl}">`);
                    } else if (/<html[^>]*>/i.test(content)) {
                        content = content.replace(/<html[^>]*>/i, `$&\n<head>\n    <base href="${baseUrl}">\n</head>`);
                    } else {
                        content = `<head>\n    <base href="${baseUrl}">\n</head>\n` + content;
                    }
                }
                
                // 设置响应头，确保包含 charset
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('X-Content-Type-Options', 'nosniff');
                return res.send(content);
            }
            
            // 设置响应头
            res.setHeader('Content-Type', contentType);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            // 其他文件直接发送
            res.sendFile(resolvedPath);
            
        } catch (error) {
            console.error('Failed to serve file:', error);
            res.status(500).send('Failed to serve file: ' + error.message);
        }
    });
    
    /**
     * GET /api/files/serve/*
     * 支持路径形式的文件访问（用于相对路径资源加载）
     */
    app.get('/api/files/serve/*', async (req, res) => {
        try {
            // 从 URL 路径提取文件路径
            const relativePath = req.params[0];
            
            if (!relativePath) {
                return res.status(400).send('File path is required');
            }
            
            // 解码 URL 编码的路径
            const filePath = decodeURIComponent(relativePath);
            const resolvedPath = validatePath(filePath);
            
            if (!fs.existsSync(resolvedPath)) {
                return res.status(404).send('File not found');
            }
            
            const stats = fs.statSync(resolvedPath);
            
            if (stats.isDirectory()) {
                return res.status(400).send('Path is a directory');
            }
            
            // 获取文件扩展名
            const ext = path.extname(resolvedPath).toLowerCase();
            
            // MIME 类型映射（简化版）
            const mimeTypes = {
                '.html': 'text/html', '.htm': 'text/html',
                '.css': 'text/css', '.js': 'application/javascript',
                '.json': 'application/json', '.xml': 'application/xml',
                '.svg': 'image/svg+xml', '.png': 'image/png',
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp',
                '.ico': 'image/x-icon', '.woff': 'font/woff',
                '.woff2': 'font/woff2', '.ttf': 'font/ttf'
            };
            
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.sendFile(resolvedPath);
            
        } catch (error) {
            console.error('Failed to serve file:', error);
            res.status(500).send('Failed to serve file: ' + error.message);
        }
    });
}

module.exports = filesRoutes;
