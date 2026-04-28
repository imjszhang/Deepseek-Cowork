/**
 * open 命令 - 打开 Web 界面
 * 
 * 创建时间: 2026-01-20
 */

import chalk from 'chalk';
import open from 'open';
import { getConfig, getDiscovery } from '../index.mjs';

// 公域网站地址
const PUBLIC_URL = 'https://deepseek-cowork.com';

/**
 * 打开 Web 界面命令
 */
export async function openCommand(options) {
    try {
        const config = await getConfig();
        const discovery = await getDiscovery();
        const port = config.DEFAULT_HTTP_PORT;
        
        // 检查本地服务是否运行
        const service = await discovery.discoverService({ port });
        const serviceAvailable = service.sameApp && service.compatible;
        
        if (!serviceAvailable) {
            console.log(chalk.yellow('⚠  Local service is not running'));
            console.log('');
            
            if (!options.local) {
                // 询问是否启动服务
                console.log('The app interface requires the local service to function properly.');
                console.log('');
                console.log(chalk.cyan('Start the service first:'));
                console.log(chalk.white('  deepseek-cowork start --daemon'));
                console.log('');
                console.log(chalk.dim('Or open the public website without local features:'));
                console.log(chalk.dim(`  ${PUBLIC_URL}`));
                console.log('');
                return;
            }
        }
        
        // 确定要打开的 URL
        let url;
        
        if (options.local) {
            // 打开本地界面（如果部署了本地前端）
            // 目前本地前端使用 Electron，这里打开的是公域网站连接本地服务
            url = `${PUBLIC_URL}?local=true`;
            console.log(chalk.dim('Opening local app interface...'));
        } else {
            // 打开公域网站
            url = PUBLIC_URL;
            console.log(chalk.dim('Opening app web interface...'));
        }
        
        // 打开浏览器
        await open(url);
        
        console.log('');
        console.log(chalk.green('✓'), `Opened ${chalk.cyan(url)}`);
        
        if (serviceAvailable) {
            console.log(chalk.dim(`  Local service: ${service.baseUrl}`));
        }
        console.log('');
        
    } catch (error) {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
    }
}

export default openCommand;
