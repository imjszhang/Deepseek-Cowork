#!/usr/bin/env node

/**
 * Browser Control 脚本执行辅助工具
 * 
 * 用法：
 *   方式 1：传入完整的请求 JSON 文件
 *   node run_script.js request.json
 * 
 *   方式 2：传入 tabId 和脚本文件
 *   node run_script.js --tabId 123456789 script.js
 * 
 *   方式 3：从库中读取脚本执行
 *   node run_script.js --from-library xiaohongshu.com/get_note_info.js --tabId 123456789
 * 
 *   方式 4：执行并自动归档
 *   node run_script.js --tabId 123456789 script.js --auto-archive \
 *     --url "https://..." --name "my_script" --purpose "描述" --keywords "关键词"
 * 
 *   方式 5：执行脚本并启用视觉反馈
 *   node run_script.js --tabId 123456789 script.js --visual-feedback
 * 
 * 功能：
 *   - 读取文件内容（正确处理 UTF-8 编码）
 *   - 从脚本库读取可复用脚本
 *   - 构造 HTTP 请求
 *   - 发送请求并自动轮询获取结果
 *   - 执行成功后自动归档到脚本库
 *   - 支持视觉反馈（高亮显示操作的元素）
 *   - 输出执行结果
 * 
 * @created 2026-01-11
 * @updated 2026-01-12
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 延迟加载路径模块（避免在未安装时报错）
let pathsModule = null;
let archiveModule = null;
let updateIndexModule = null;
let visualFeedbackModule = null;

function loadModules() {
  if (!pathsModule) {
    try {
      pathsModule = require('./paths');
      archiveModule = require('./archive_script');
      updateIndexModule = require('./update_index');
    } catch (e) {
      // 模块不可用时忽略
    }
  }
}

/**
 * 获取视觉反馈模块代码
 * @returns {string|null} 视觉反馈模块代码
 */
function getVisualFeedbackCode() {
  if (visualFeedbackModule === null) {
    try {
      const vfModule = require('./visual-feedback');
      if (vfModule.getVisualFeedbackCode) {
        visualFeedbackModule = vfModule.getVisualFeedbackCode();
      } else {
        visualFeedbackModule = false;
      }
    } catch (e) {
      visualFeedbackModule = false;
    }
  }
  return visualFeedbackModule || null;
}

/**
 * 将视觉反馈模块注入到脚本中
 * @param {string} code - 原始脚本代码
 * @returns {string} 注入后的代码
 */
function injectVisualFeedback(code) {
  const vfCode = getVisualFeedbackCode();
  if (!vfCode) {
    console.warn('警告：视觉反馈模块不可用，将不注入视觉反馈功能');
    return code;
  }
  
  // 将视觉反馈模块代码放在用户脚本前面
  // 用户脚本可以直接使用 __bcHighlight API
  return `${vfCode}\n\n${code}`;
}

const BASE_URL = 'http://localhost:3333';
const POLL_INTERVAL = 500;  // 轮询间隔 (ms)
const MAX_POLL_ATTEMPTS = 20;  // 最大轮询次数

/**
 * 发送 HTTP 请求
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * 轮询获取回调结果
 */
async function pollResult(requestId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    
    try {
      const res = await request(`${BASE_URL}/api/browser/callback_response/${requestId}`);
      if (res.status === 200 && res.data?.status === 'success') {
        return res.data;
      }
    } catch (e) {
      // 继续轮询
    }
  }
  return { status: 'error', message: '轮询超时，未获取到结果' };
}

/**
 * 从脚本库读取脚本
 * @param {string} libraryPath - 库路径，如 xiaohongshu.com/get_note_info.js
 * @returns {string|null} 脚本代码
 */
function readFromLibrary(libraryPath) {
  loadModules();
  
  if (!pathsModule) {
    console.error('错误：路径模块不可用');
    return null;
  }
  
  const libraryDir = pathsModule.getLibraryDir();
  const fullPath = path.join(libraryDir, libraryPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`错误：库脚本不存在 - ${fullPath}`);
    return null;
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  // 提取实际代码部分（跳过元信息注释）
  const codeStart = content.indexOf('(() =>');
  if (codeStart !== -1) {
    return content.substring(codeStart).trim();
  }
  
  // 尝试另一种格式
  const funcStart = content.indexOf('(function');
  if (funcStart !== -1) {
    return content.substring(funcStart).trim();
  }
  
  // 没有找到标准格式，返回全部内容（移除注释头）
  const lines = content.split('\n');
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('*/')) {
      startLine = i + 1;
      break;
    }
  }
  
  return lines.slice(startLine).join('\n').trim();
}

/**
 * 更新脚本使用次数
 * @param {string} libraryPath - 库路径
 */
function incrementUsageCount(libraryPath) {
  loadModules();
  
  if (!pathsModule) return;
  
  const libraryDir = pathsModule.getLibraryDir();
  const fullPath = path.join(libraryDir, libraryPath);
  
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  
  // 更新 usageCount
  const match = content.match(/@usageCount\s+(\d+)/);
  if (match) {
    const currentCount = parseInt(match[1], 10);
    content = content.replace(/@usageCount\s+\d+/, `@usageCount ${currentCount + 1}`);
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * 执行脚本请求
 */
async function executeScript(requestBody, options = {}) {
  // 生成 requestId（如果没有提供）
  if (!requestBody.requestId) {
    requestBody.requestId = `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  console.log('发送请求...');
  console.log(`  tabId: ${requestBody.tabId}`);
  console.log(`  requestId: ${requestBody.requestId}`);
  console.log(`  code: ${requestBody.code.substring(0, 100)}${requestBody.code.length > 100 ? '...' : ''}`);

  try {
    const res = await request(`${BASE_URL}/api/browser/execute_script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (res.status !== 200 || res.data?.status !== 'success') {
      console.error('请求失败:', res.data);
      return { success: false, error: res.data };
    }

    console.log('请求已发送，等待结果...');

    // 轮询获取结果
    const result = await pollResult(requestBody.requestId);
    
    console.log('\n执行结果:');
    console.log(JSON.stringify(result, null, 2));
    
    // 判断执行是否成功
    const isSuccess = result.status === 'success' && 
      (result.result?.success === true || result.result?.success === undefined);
    
    // 如果开启自动归档且执行成功
    if (options.autoArchive && isSuccess) {
      await handleAutoArchive(requestBody.code, options);
    }
    
    // 如果是从库中读取的脚本，更新使用次数
    if (options.fromLibrary && isSuccess) {
      incrementUsageCount(options.fromLibrary);
    }
    
    return { success: isSuccess, result };
  } catch (err) {
    console.error('执行失败:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 处理自动归档
 */
async function handleAutoArchive(code, options) {
  loadModules();
  
  if (!archiveModule) {
    console.log('\n提示：归档模块不可用，跳过自动归档');
    return;
  }
  
  const { url, name, purpose, keywords } = options;
  
  if (!name) {
    console.log('\n提示：未提供脚本名称 (--name)，跳过自动归档');
    return;
  }
  
  if (!url && !options.common) {
    console.log('\n提示：未提供 URL (--url) 或 --common，跳过自动归档');
    return;
  }
  
  console.log('\n正在归档脚本...');
  
  const archiveResult = archiveModule.archiveScript({
    code,
    url,
    name,
    purpose: purpose || '',
    keywords: keywords || [],
    common: options.common || false
  });
  
  if (archiveResult.success) {
    console.log(`✓ ${archiveResult.message}`);
    console.log(`  路径: ${archiveResult.path}`);
    
    // 更新索引
    if (updateIndexModule) {
      updateIndexModule.updateIndex();
      console.log('✓ 索引已更新');
    }
  } else {
    console.log(`⚠ 归档失败: ${archiveResult.error}`);
  }
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // 检查是否是 --help
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const config = {
    mode: null,
    tabId: null,
    scriptFile: null,
    jsonFile: null,
    fromLibrary: null,
    autoArchive: false,
    visualFeedback: false,
    url: null,
    name: null,
    purpose: null,
    keywords: [],
    common: false
  };
  
  // 解析参数
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tabId':
        config.tabId = parseInt(args[++i], 10);
        break;
      case '--from-library':
        config.fromLibrary = args[++i];
        config.mode = 'library';
        break;
      case '--auto-archive':
        config.autoArchive = true;
        break;
      case '--visual-feedback':
      case '--vf':
        config.visualFeedback = true;
        break;
      case '--url':
        config.url = args[++i];
        break;
      case '--name':
        config.name = args[++i];
        break;
      case '--purpose':
        config.purpose = args[++i];
        break;
      case '--keywords':
        config.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        config.common = true;
        break;
      default:
        // 非选项参数
        if (!args[i].startsWith('--')) {
          if (args[i].endsWith('.json')) {
            config.jsonFile = args[i];
            if (!config.mode) config.mode = 'json';
          } else if (args[i].endsWith('.js')) {
            config.scriptFile = args[i];
            if (!config.mode) config.mode = 'script';
          }
        }
    }
  }
  
  // 验证参数
  if (config.mode === 'library' && !config.tabId) {
    console.error('错误：--from-library 需要同时提供 --tabId');
    process.exit(1);
  }
  
  if (config.mode === 'script' && !config.tabId) {
    console.error('错误：脚本模式需要同时提供 --tabId');
    process.exit(1);
  }
  
  if (!config.mode && config.tabId) {
    console.error('错误：需要提供脚本文件或 --from-library 参数');
    process.exit(1);
  }
  
  if (!config.mode) {
    console.error('错误：需要提供请求文件、脚本文件或 --from-library 参数');
    printUsage();
    process.exit(1);
  }
  
  return config;
}

/**
 * 打印使用说明
 */
function printUsage() {
  console.log(`
Browser Control 脚本执行辅助工具

用法:
  方式 1：传入完整的请求 JSON 文件
  node run_script.js <request.json>

  方式 2：传入 tabId 和脚本文件
  node run_script.js --tabId <tabId> <script.js>

  方式 3：从脚本库读取执行
  node run_script.js --from-library <domain/script.js> --tabId <tabId>

  方式 4：执行并自动归档（新脚本）
  node run_script.js --tabId <tabId> <script.js> --auto-archive \\
    --url <url> --name <name> --purpose <desc> --keywords <kw1,kw2>

  方式 5：启用视觉反馈执行脚本
  node run_script.js --tabId <tabId> <script.js> --visual-feedback

示例:
  # 从 JSON 文件执行
  node run_script.js script_request.json

  # 从脚本文件执行
  node run_script.js --tabId 123456789 get_title.js

  # 从库中读取执行
  node run_script.js --from-library xiaohongshu.com/get_note_info.js --tabId 123456789

  # 执行并归档到特定站点
  node run_script.js --tabId 123456789 my_script.js --auto-archive \\
    --url "https://www.xiaohongshu.com/..." \\
    --name "get_note_info" \\
    --purpose "提取笔记信息" \\
    --keywords "笔记,标题,点赞"

  # 执行并归档到通用目录
  node run_script.js --tabId 123456789 scroll.js --auto-archive \\
    --common --name "scroll_to_bottom" --purpose "滚动到底部"

  # 启用视觉反馈执行脚本（高亮显示操作的元素）
  node run_script.js --tabId 123456789 click_button.js --visual-feedback

JSON 请求文件格式:
  {
    "tabId": 123456789,
    "code": "document.title"
  }

选项:
  --tabId <id>              指定目标标签页 ID
  --from-library <path>     从脚本库读取（如 xiaohongshu.com/get_note_info.js）
  --auto-archive            执行成功后自动归档
  --visual-feedback, --vf   启用视觉反馈（高亮显示操作的元素）
  --url <url>               目标页面 URL（用于确定归档域名）
  --name <name>             脚本名称（用于归档）
  --purpose <desc>          脚本用途描述（用于归档）
  --keywords <kw1,kw2>      关键词，逗号分隔（用于归档）
  --common                  归档到通用脚本目录
  --help, -h                显示此帮助信息

视觉反馈说明:
  启用 --visual-feedback 后，脚本中可以使用 __bcHighlight API：
  - __bcHighlight.show(element, options)    显示高亮
  - __bcHighlight.hide(element)             隐藏高亮
  - __bcHighlight.success(element)          成功反馈（绿色）
  - __bcHighlight.fail(element)             失败反馈（红色）
  - __bcHighlight.withFeedback(el, fn)      自动包装操作
  - __bcHighlight.batch(elements, fn)       批量操作带序号
  - __bcHighlight.cleanup()                 清理所有高亮
`);
}

/**
 * 主函数
 */
async function main() {
  const config = parseArgs();
  let requestBody;
  let code;

  if (config.mode === 'json') {
    // 方式 1：读取 JSON 请求文件
    const filePath = path.resolve(config.jsonFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`错误：文件不存在 - ${filePath}`);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      requestBody = JSON.parse(content);
    } catch (e) {
      console.error(`错误：无法解析 JSON 文件 - ${e.message}`);
      process.exit(1);
    }

    if (!requestBody.tabId || !requestBody.code) {
      console.error('错误：JSON 文件必须包含 tabId 和 code 字段');
      process.exit(1);
    }
    
    code = requestBody.code;
    
  } else if (config.mode === 'library') {
    // 方式 3：从脚本库读取
    code = readFromLibrary(config.fromLibrary);
    
    if (!code) {
      process.exit(1);
    }
    
    requestBody = {
      tabId: config.tabId,
      code: code
    };
    
    console.log(`从库中读取脚本: ${config.fromLibrary}`);
    
  } else {
    // 方式 2：读取脚本文件并构造请求
    const filePath = path.resolve(config.scriptFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`错误：脚本文件不存在 - ${filePath}`);
      process.exit(1);
    }

    try {
      code = fs.readFileSync(filePath, 'utf-8').trim();
      requestBody = {
        tabId: config.tabId,
        code: code
      };
    } catch (e) {
      console.error(`错误：无法读取脚本文件 - ${e.message}`);
      process.exit(1);
    }
  }

  // 如果启用视觉反馈，注入视觉反馈模块
  if (config.visualFeedback) {
    console.log('启用视觉反馈模式...');
    requestBody.code = injectVisualFeedback(requestBody.code);
  }

  const result = await executeScript(requestBody, {
    autoArchive: config.autoArchive,
    fromLibrary: config.fromLibrary,
    url: config.url,
    name: config.name,
    purpose: config.purpose,
    keywords: config.keywords,
    common: config.common
  });
  
  if (!result.success) {
    process.exit(1);
  }
}

main();
