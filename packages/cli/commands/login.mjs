/**
 * login 命令 - 登录账户
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import { getConfig, getSecureSettings, getUserSettings } from '../index.mjs';

/**
 * 登录命令
 */
export async function loginCommand(options) {
    const spinner = ora();
    
    try {
        const config = await getConfig();
        const secureSettings = await getSecureSettings();
        const userSettings = await getUserSettings();
        
        // 初始化设置
        config.initializeDirectories();
        userSettings.initialize();
        await secureSettings.initialize();
        
        // 检查是否已登录
        if (secureSettings.hasSecret('happy.secret')) {
            console.log(chalk.yellow('⚠  You are already logged in'));
            console.log('');
            console.log(chalk.dim('To switch accounts, logout first:'));
            console.log(chalk.white('  deepseek-cowork logout'));
            console.log('');
            return;
        }
        
        let secret = options.secret;
        
        // 如果没有通过参数提供 secret，提示用户输入
        if (!secret) {
            console.log('');
            console.log(chalk.bold('DeepSeek Cowork Login'));
            console.log(chalk.dim('─'.repeat(40)));
            console.log('');
            console.log('Please enter your Happy AI Secret.');
            console.log(chalk.dim('You can find it at: https://deepseek-cowork.com/account'));
            console.log('');
            
            secret = await promptSecret('Secret: ');
            console.log('');
        }
        
        if (!secret || secret.trim() === '') {
            console.log(chalk.red('Error: Secret is required'));
            process.exit(1);
        }
        
        // 动态导入验证模块
        spinner.start('Validating secret...');
        
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const SecretGenerator = require(config.getDataDir() + '/../../lib/happy-client/utils/SecretGenerator');
        
        // 验证格式
        const validation = SecretGenerator.validateSecretFormat(secret.trim());
        
        if (!validation.valid) {
            spinner.fail(`Invalid secret format: ${validation.error}`);
            process.exit(1);
        }
        
        spinner.text = 'Verifying with server...';
        
        // 尝试获取 Token 验证有效性
        try {
            const Auth = require(config.getDataDir() + '/../../lib/happy-client/core/Auth');
            const auth = new Auth();
            const serverUrl = userSettings.get('happy.serverUrl') || 'https://api.deepseek-cowork.com';
            const masterSecret = Buffer.from(validation.normalized, 'base64url');
            
            const token = await auth.getToken(masterSecret, serverUrl);
            
            if (!token) {
                spinner.fail('Failed to verify secret with server');
                process.exit(1);
            }
            
            spinner.text = 'Saving credentials...';
            
            // 保存 secret
            secureSettings.setSecret('happy.secret', validation.normalized);
            
            // 同步到 ~/.happy/access.key
            const path = await import('path');
            const fs = await import('fs');
            const os = await import('os');
            
            const happyHomeDir = path.join(os.homedir(), '.happy');
            const accessKeyPath = path.join(happyHomeDir, 'access.key');
            
            if (!fs.existsSync(happyHomeDir)) {
                fs.mkdirSync(happyHomeDir, { recursive: true });
            }
            
            const secretBytes = Buffer.from(validation.normalized, 'base64url');
            const credentials = {
                secret: secretBytes.toString('base64'),
                token: token
            };
            
            fs.writeFileSync(accessKeyPath, JSON.stringify(credentials, null, 2), 'utf8');
            
            spinner.succeed('Login successful!');
            console.log('');
            console.log(chalk.green('You are now logged in.'));
            console.log('');
            console.log(chalk.cyan('Start the service:'), chalk.white('deepseek-cowork start'));
            console.log(chalk.cyan('Open web interface:'), chalk.white('deepseek-cowork open'));
            console.log('');
            
        } catch (error) {
            spinner.fail(`Verification failed: ${error.message}`);
            process.exit(1);
        }
        
    } catch (error) {
        spinner.fail(`Login failed: ${error.message}`);
        process.exit(1);
    }
}

/**
 * 提示用户输入（隐藏输入）
 */
async function promptSecret(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        // 隐藏输入
        process.stdout.write(prompt);
        
        // 在 Windows 上可能不支持隐藏输入，使用普通输入
        rl.question('', (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

export default loginCommand;
