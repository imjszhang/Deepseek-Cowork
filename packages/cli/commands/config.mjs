/**
 * config 命令 - 管理配置
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import { getConfig, getUserSettings } from '../index.mjs';

/**
 * 配置管理命令
 */
export async function configCommand(action = 'list', key = null, value = null) {
    try {
        const config = await getConfig();
        const userSettings = await getUserSettings();
        
        // 初始化用户设置
        userSettings.initialize();
        
        switch (action) {
            case 'list':
                listConfig(userSettings, config);
                break;
                
            case 'get':
                if (!key) {
                    console.error(chalk.red('Error: Key is required'));
                    console.log(chalk.dim('Usage: deepseek-cowork config get <key>'));
                    process.exit(1);
                }
                getConfigValue(userSettings, key);
                break;
                
            case 'set':
                if (!key) {
                    console.error(chalk.red('Error: Key is required'));
                    console.log(chalk.dim('Usage: deepseek-cowork config set <key> <value>'));
                    process.exit(1);
                }
                setConfigValue(userSettings, key, value);
                break;
                
            default:
                console.error(chalk.red(`Unknown action: ${action}`));
                console.log(chalk.dim('Available actions: list, get, set'));
                process.exit(1);
        }
        
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

/**
 * 列出所有配置
 */
function listConfig(userSettings, config) {
    const settings = userSettings.getAll();
    
    console.log('');
    console.log(chalk.bold('DeepSeek Cowork Configuration'));
    console.log(chalk.dim('─'.repeat(50)));
    
    // 服务器配置
    console.log('');
    console.log(chalk.cyan('Server:'));
    console.log(`  server.httpPort:       ${settings.server?.httpPort || config.DEFAULT_HTTP_PORT}`);
    console.log(`  server.wsPort:         ${settings.server?.wsPort || config.DEFAULT_WS_PORT}`);
    console.log(`  server.autoStart:      ${settings.server?.autoStart || false}`);
    
    // Happy AI 配置
    console.log('');
    console.log(chalk.cyan('Happy AI:'));
    console.log(`  happy.workspaceDir:    ${settings.happy?.workspaceDir || '(default)'}`);
    console.log(`  happy.permissionMode:  ${settings.happy?.permissionMode || 'default'}`);
    console.log(`  happy.serverUrl:       ${settings.happy?.serverUrl || '(default)'}`);
    console.log(`  happy.autoMonitor:     ${settings.happy?.autoMonitor !== false}`);
    console.log(`  happy.debug:           ${settings.happy?.debug || false}`);
    
    // Claude Code 配置
    console.log('');
    console.log(chalk.cyan('Claude Code:'));
    const claudeCode = settings.happy?.claudeCode || {};
    console.log(`  happy.claudeCode.provider:         ${claudeCode.provider || 'anthropic'}`);
    console.log(`  happy.claudeCode.baseUrl:          ${claudeCode.baseUrl || '(default)'}`);
    console.log(`  happy.claudeCode.model:            ${claudeCode.model || '(default)'}`);
    console.log(`  happy.claudeCode.smallFastModel:   ${claudeCode.smallFastModel || '(default)'}`);
    console.log(`  happy.claudeCode.timeoutMs:        ${claudeCode.timeoutMs || 600000}`);
    
    // 路径信息
    console.log('');
    console.log(chalk.cyan('Paths:'));
    console.log(`  Data directory:        ${config.getDataDir()}`);
    console.log(`  Settings file:         ${userSettings.getSettingsPath()}`);
    console.log(`  Default workspace:     ${config.getDefaultWorkspaceDir()}`);
    
    console.log('');
    console.log(chalk.dim('To modify a setting:'));
    console.log(chalk.dim('  deepseek-cowork config set <key> <value>'));
    console.log('');
}

/**
 * 获取配置值
 */
function getConfigValue(userSettings, key) {
    const value = userSettings.get(key);
    
    if (value === undefined) {
        console.log(chalk.yellow(`Key "${key}" is not set`));
    } else if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
    } else {
        console.log(value);
    }
}

/**
 * 设置配置值
 */
function setConfigValue(userSettings, key, value) {
    // 解析值类型
    let parsedValue = value;
    
    if (value === 'true') {
        parsedValue = true;
    } else if (value === 'false') {
        parsedValue = false;
    } else if (value === 'null' || value === null) {
        parsedValue = null;
    } else if (!isNaN(value) && value !== '') {
        // 尝试解析为数字
        const num = parseFloat(value);
        if (!isNaN(num)) {
            parsedValue = num;
        }
    }
    
    // 保存设置
    userSettings.set(key, parsedValue);
    
    console.log(chalk.green('✓'), `Set ${chalk.cyan(key)} = ${chalk.white(JSON.stringify(parsedValue))}`);
    
    // 某些设置可能需要重启服务
    const needsRestart = ['server.httpPort', 'server.wsPort', 'happy.serverUrl'];
    if (needsRestart.includes(key)) {
        console.log(chalk.yellow('\nNote: This change will take effect after restarting the service'));
        console.log(chalk.dim('  deepseek-cowork stop && deepseek-cowork start'));
    }
}

export default configCommand;
