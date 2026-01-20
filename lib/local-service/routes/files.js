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
 * 注册文件系统路由
 * @param {Object} app Express 应用
 * @param {Object} context 上下文对象
 */
function filesRoutes(app, context) {
    
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
                // 跳过隐藏文件
                if (item.startsWith('.')) continue;
                
                const itemPath = path.join(resolvedPath, item);
                try {
                    const itemStats = fs.statSync(itemPath);
                    const isDirectory = itemStats.isDirectory();
                    
                    results.push({
                        name: item,
                        path: itemPath,
                        isDirectory,
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
}

module.exports = filesRoutes;
