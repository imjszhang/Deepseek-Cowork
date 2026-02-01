#!/usr/bin/env node

/**
 * 示例调度任务脚本
 * 
 * 这是一个简单的示例脚本，用于演示如何编写调度器任务
 * 
 * 移植自: agent-kaichi/kaichi/server/modules/schedulerManager/example-task.js
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    message: '这是一个示例任务',
    logFile: null,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--message':
      case '-m':
        options.message = args[++i];
        break;
      case '--log-file':
      case '-l':
        options.logFile = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

// 打印帮助信息
function printHelp() {
  console.log(`
示例调度任务脚本

用法:
  node example-task.js [选项]

选项:
  -m, --message <text>     自定义消息内容（默认: "这是一个示例任务"）
  -l, --log-file <path>    指定日志文件路径
  -v, --verbose            详细输出模式
  -h, --help               显示此帮助信息

示例:
  node example-task.js --message "Hello World" --verbose
  node example-task.js --log-file ./logs/task.log
`);
}

// 记录日志
function log(message, options) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  // 输出到控制台
  console.log(logMessage);
  
  // 如果指定了日志文件，写入文件
  if (options.logFile) {
    try {
      const logDir = path.dirname(options.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(options.logFile, logMessage + '\n', 'utf8');
    } catch (error) {
      console.error(`写入日志文件失败: ${error.message}`);
    }
  }
}

// 主函数
async function main() {
  const options = parseArgs();
  
  try {
    log('========== 任务开始 ==========', options);
    
    if (options.verbose) {
      log(`进程 PID: ${process.pid}`, options);
      log(`工作目录: ${process.cwd()}`, options);
      log(`Node 版本: ${process.version}`, options);
    }
    
    log(`执行消息: ${options.message}`, options);
    
    // 模拟一些工作
    log('正在执行任务...', options);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 任务完成
    log('任务执行成功', options);
    log('========== 任务完成 ==========', options);
    
    // 成功退出
    process.exit(0);
    
  } catch (error) {
    log(`任务执行失败: ${error.message}`, options);
    log(`错误堆栈: ${error.stack}`, options);
    log('========== 任务失败 ==========', options);
    
    // 失败退出
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
