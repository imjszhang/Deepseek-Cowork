/**
 * 启动本地服务器访问 dist 目录（GitHub Pages）
 * 用于本地预览 GitHub Pages 网站
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const PAGES_DIR = path.join(__dirname, '../dist');

// 检测端口是否可用
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// 查找可用端口
async function findAvailablePort(startPort) {
  let port = startPort;
  const maxPort = startPort + 100; // 最多尝试 100 个端口
  
  while (port <= maxPort) {
    const available = await checkPort(port);
    if (available) {
      return port;
    }
    port++;
  }
  
  throw new Error(`无法找到可用端口（尝试范围: ${startPort}-${maxPort}）`);
}

function startPagesServer() {
  const app = express();

  // 静态文件服务
  app.use(express.static(PAGES_DIR));

  // 处理 SPA 路由：所有非文件请求都返回 index.html
  // 这样可以支持 GitHub Pages 的单页应用路由
  app.get('*', (req, res, next) => {
    const filePath = path.join(PAGES_DIR, req.path);
    
    // 检查是否是文件请求（有扩展名）
    if (path.extname(req.path)) {
      return next();
    }
    
    // 检查文件是否存在
    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        return next();
      }
      
      // 对于目录或不存在的情况，返回 index.html（SPA 路由）
      const indexPath = path.join(PAGES_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  });

  // 启动服务器
  findAvailablePort(DEFAULT_PORT)
    .then((port) => {
      const server = app.listen(port, () => {
        console.log('🚀 GitHub Pages 服务器已启动');
        console.log(`📁 网站目录: ${PAGES_DIR}`);
        if (port !== DEFAULT_PORT) {
          console.log(`⚠️  端口 ${DEFAULT_PORT} 已被占用，使用端口 ${port}`);
        }
        console.log(`🌐 访问地址: http://localhost:${port}`);
        console.log(`\n按 Ctrl+C 停止服务器\n`);
      });

      // 清理函数
      const cleanup = () => {
        console.log('\n\n正在关闭服务器...');
        
        // 关闭所有连接
        server.close(() => {
          console.log('✅ HTTP 服务器已关闭');
          
          // 强制关闭所有连接（如果有未关闭的）
          server.closeAllConnections && server.closeAllConnections();
          
          // 移除所有事件监听器
          process.removeAllListeners('SIGINT');
          process.removeAllListeners('SIGTERM');
          
          console.log('✅ 资源清理完成');
          process.exit(0);
        });

        // 如果 5 秒内没有关闭，强制退出
        setTimeout(() => {
          console.log('⚠️  服务器关闭超时，强制退出...');
          process.exit(1);
        }, 5000);
      };

      // 优雅关闭 - SIGINT (Ctrl+C)
      process.on('SIGINT', cleanup);

      // 优雅关闭 - SIGTERM
      process.on('SIGTERM', cleanup);

      // 处理未捕获的异常
      process.on('uncaughtException', (error) => {
        console.error('❌ 未捕获的异常:', error);
        cleanup();
      });

      // 处理未处理的 Promise 拒绝
      process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ 未处理的 Promise 拒绝:', reason);
        cleanup();
      });
    })
    .catch((error) => {
      console.error('❌ 启动服务器失败:', error.message);
      process.exit(1);
    });
}


// 如果直接运行此脚本
if (require.main === module) {
  startPagesServer();
}

module.exports = { startPagesServer };
