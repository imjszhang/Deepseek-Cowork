const fs = require('fs');
const path = require('path');

/**
 * 文件管理器类
 * 提供文件系统操作功能
 */
class FileManager {
  /**
   * 创建文件管理器实例
   * @param {string} workDir - 工作目录
   */
  constructor(workDir) {
    this.workDir = workDir || process.cwd();
  }

  /**
   * 验证路径安全性
   * @param {string} targetPath - 目标路径
   * @returns {string|null} 安全的绝对路径或null
   */
  validatePath(targetPath) {
    try {
      // 验证路径：防止路径遍历攻击
      const normalizedPath = path.normalize(targetPath);
      if (normalizedPath.includes('..')) {
        console.error(`错误：不允许使用相对路径跳转(..)`);
        return null;
      }

      const absolutePath = path.join(this.workDir, normalizedPath);
      
      // 确保路径在工作目录内，防止路径遍历
      const resolvedWorkDir = path.resolve(this.workDir);
      const resolvedPath = path.resolve(absolutePath);
      if (!resolvedPath.startsWith(resolvedWorkDir)) {
        console.error(`错误：访问路径超出工作目录范围`);
        return null;
      }
      
      return absolutePath;
    } catch (error) {
      console.error(`路径验证失败:`, error);
      return null;
    }
  }

  /**
   * 检查文件是否存在
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {boolean} 文件是否存在
   */
  fileExists(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (error) {
      console.error(`检查文件是否存在失败:`, error);
      return false;
    }
  }

  /**
   * 检查目录是否存在
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {boolean} 目录是否存在
   */
  directoryExists(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch (error) {
      console.error(`检查目录是否存在失败:`, error);
      return false;
    }
  }

  /**
   * 列出目录内容
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {Array|null} 文件详情数组或null
   */
  listDirectory(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    try {
      if (!fs.existsSync(dirPath)) {
        console.error(`错误：目录不存在: ${dirPath}`);
        return null;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        console.error(`错误：路径不是目录: ${dirPath}`);
        return null;
      }
      
      const files = fs.readdirSync(dirPath);
      return files.map(file => {
        try {
          const itemPath = path.join(dirPath, file);
          const stats = fs.statSync(itemPath);
          // 返回相对路径
          const relItemPath = path.join(relativePath, file).replace(/\\/g, '/');
          
          return {
            name: file,
            path: relItemPath,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
        } catch (err) {
          console.error(`无法访问文件 ${file}:`, err);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      console.error(`列出目录内容失败:`, error);
      return null;
    }
  }

  /**
   * 读取文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {string|null} 文件内容或null
   */
  readFile(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`错误：文件不存在: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`错误：路径是目录而非文件: ${filePath}`);
        return null;
      }
      
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`读取文件内容失败:`, error);
      return null;
    }
  }

  /**
   * 异步读取文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {Promise<string|null>} 文件内容或null的Promise
   */
  async readFileAsync(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return null;

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`错误：文件不存在: ${filePath}`);
        return null;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`错误：路径是目录而非文件: ${filePath}`);
        return null;
      }
      
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      console.error(`异步读取文件内容失败:`, error);
      return null;
    }
  }

  /**
   * 保存文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @param {string} content - 文件内容
   * @returns {boolean} 保存是否成功
   */
  saveFile(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        console.error(`错误：保存文件时需要提供内容`);
        return false;
      }
      
      // 确保目录存在
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      // 写入文件
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`文件已成功保存: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`保存文件失败:`, error);
      return false;
    }
  }

  /**
   * 异步保存文件内容
   * @param {string} relativePath - 相对工作目录的文件路径
   * @param {string} content - 文件内容
   * @returns {Promise<boolean>} 保存是否成功的Promise
   */
  async saveFileAsync(relativePath, content) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (content === undefined || content === null) {
        console.error(`错误：保存文件时需要提供内容`);
        return false;
      }
      
      // 确保目录存在
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        await fs.promises.mkdir(dirPath, { recursive: true });
      }
      
      // 写入文件
      await fs.promises.writeFile(filePath, content, 'utf8');
      console.log(`文件已成功保存: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`异步保存文件失败:`, error);
      return false;
    }
  }

  /**
   * 删除文件
   * @param {string} relativePath - 相对工作目录的文件路径
   * @returns {boolean} 删除是否成功
   */
  deleteFile(relativePath) {
    const filePath = this.validatePath(relativePath);
    if (!filePath) return false;

    try {
      if (!fs.existsSync(filePath)) {
        console.error(`错误：文件不存在: ${filePath}`);
        return false;
      }
      
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.error(`错误：路径是目录而非文件: ${filePath}`);
        return false;
      }
      
      fs.unlinkSync(filePath);
      console.log(`文件已成功删除: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`删除文件失败:`, error);
      return false;
    }
  }

  /**
   * 删除目录
   * @param {string} relativePath - 相对工作目录的路径
   * @param {boolean} recursive - 是否递归删除内容
   * @returns {boolean} 删除是否成功
   */
  deleteDirectory(relativePath, recursive = false) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return false;

    try {
      if (!fs.existsSync(dirPath)) {
        console.error(`错误：目录不存在: ${dirPath}`);
        return false;
      }
      
      if (!fs.statSync(dirPath).isDirectory()) {
        console.error(`错误：路径不是目录: ${dirPath}`);
        return false;
      }
      
      if (recursive) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } else {
        fs.rmdirSync(dirPath);
      }
      
      console.log(`目录已成功删除: ${relativePath}`);
      return true;
    } catch (error) {
      console.error(`删除目录失败:`, error);
      return false;
    }
  }

  /**
   * 构建文件系统结构
   * @param {string} relativePath - 相对工作目录的路径
   * @returns {Object|null} 文件系统结构对象或null
   */
  buildFileSystemStructure(relativePath) {
    const dirPath = this.validatePath(relativePath);
    if (!dirPath) return null;

    const structure = {};
    try {
      const items = fs.readdirSync(dirPath);
      items.forEach(item => {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        
        const relPath = path.join(relativePath, item).replace(/\\/g, '/');

        if (stat.isDirectory()) {
          structure[item] = this.buildFileSystemStructure(relPath);
        } else {
          structure[item] = true;
        }
      });
    } catch (err) {
      console.error(`读取目录失败 ${dirPath}:`, err);
    }
    return structure;
  }

  /**
   * 获取相对路径
   * @param {string} fullPath - 完整路径
   * @returns {string|null} 相对工作目录的路径或null
   */
  getRelativePath(fullPath) {
    try {
      const resolvedFullPath = path.resolve(fullPath);
      const resolvedWorkDir = path.resolve(this.workDir);
      
      if (!resolvedFullPath.startsWith(resolvedWorkDir)) {
        console.error(`错误：路径不在工作目录内`);
        return null;
      }
      
      return path.relative(this.workDir, fullPath).replace(/\\/g, '/');
    } catch (error) {
      console.error(`获取相对路径失败:`, error);
      return null;
    }
  }
}

module.exports = FileManager;
