/**
 * cleanup 命令 - 清理残留的 daemon 和 session 进程
 * 
 * 用于处理异常情况：
 * - 进程残留但无法通过正常方式停止
 * - PID 文件丢失但进程还在运行
 * - 需要强制清理所有相关进程
 * 
 * 创建时间: 2026-01-23
 */

import chalk from 'chalk';
import ora from 'ora';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getConfig } from '../index.mjs';
import { removePidFile, isProcessRunning, killProcess, waitForProcessExit } from '../utils/process.mjs';

const execAsync = promisify(exec);

/**
 * 清理命令
 */
export async function cleanupCommand(options) {
    const spinner = ora('Scanning for processes to clean up...').start();
    
    try {
        const config = await getConfig();
        const happyHomeDir = join(homedir(), '.happy');
        const isWindows = process.platform === 'win32';
        
        let daemonKilled = 0;
        let sessionsKilled = 0;
        let filesRemoved = 0;
        
        // 1. 尝试从状态文件获取 daemon PID
        const daemonStatePath = join(happyHomeDir, 'daemon.state.json');
        if (existsSync(daemonStatePath)) {
            try {
                const stateContent = readFileSync(daemonStatePath, 'utf8');
                const state = JSON.parse(stateContent);
                
                if (state.pid && isProcessRunning(state.pid)) {
                    spinner.text = `Killing daemon process (PID: ${state.pid})...`;
                    
                    if (isWindows) {
                        // Windows: 使用 taskkill /T 终止进程树
                        try {
                            await execAsync(`taskkill /PID ${state.pid} /F /T`, { timeout: 10000 });
                            daemonKilled++;
                        } catch (e) {
                            // 可能已经退出
                        }
                    } else {
                        killProcess(state.pid, 'SIGKILL');
                        await waitForProcessExit(state.pid, 5000);
                        daemonKilled++;
                    }
                }
            } catch (e) {
                // 状态文件解析失败，继续其他清理
            }
        }
        
        // 2. 清理孤儿 session 进程（通过命令行特征查找）
        spinner.text = 'Looking for orphaned session processes...';
        
        if (isWindows) {
            sessionsKilled = await cleanupWindowsProcesses(spinner);
        } else {
            sessionsKilled = await cleanupUnixProcesses(spinner);
        }
        
        // 3. 清理状态文件
        spinner.text = 'Cleaning up state files...';
        
        const filesToClean = [
            join(happyHomeDir, 'daemon.state.json'),
            join(happyHomeDir, 'daemon.lock'),
            join(happyHomeDir, 'daemon.starting.lock'),
            config.getPidFilePath()
        ];
        
        // 如果指定了 --all，也清理 sessions 状态
        if (options.all) {
            const dataDir = config.getDataDir();
            filesToClean.push(join(dataDir, 'sessions.json'));
        }
        
        for (const filePath of filesToClean) {
            if (existsSync(filePath)) {
                try {
                    unlinkSync(filePath);
                    filesRemoved++;
                } catch (e) {
                    // 忽略删除失败
                }
            }
        }
        
        // 4. 显示结果
        spinner.succeed('Cleanup completed');
        console.log('');
        console.log(chalk.green('  Cleanup Summary:'));
        console.log(chalk.dim(`    Daemon processes killed:  ${daemonKilled}`));
        console.log(chalk.dim(`    Session processes killed: ${sessionsKilled}`));
        console.log(chalk.dim(`    State files removed:      ${filesRemoved}`));
        
        if (daemonKilled === 0 && sessionsKilled === 0 && filesRemoved === 0) {
            console.log('');
            console.log(chalk.cyan('  No cleanup needed - system is clean.'));
        }
        
    } catch (error) {
        spinner.fail(`Cleanup failed: ${error.message}`);
        if (options.debug) {
            console.error(error);
        }
        process.exit(1);
    }
}

/**
 * Windows 下清理进程
 */
async function cleanupWindowsProcesses(spinner) {
    let killed = 0;
    
    // 方法 1: PowerShell Get-CimInstance（推荐）
    try {
        const { stdout } = await execAsync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*--started-by daemon*\' } | Select-Object -ExpandProperty ProcessId"',
            { timeout: 15000, windowsHide: true }
        );
        
        const pids = stdout.trim().split(/\r?\n/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
        
        if (pids.length > 0) {
            spinner.text = `Found ${pids.length} orphaned session processes, terminating...`;
            
            for (const pid of pids) {
                try {
                    await execAsync(`taskkill /PID ${pid} /F /T`, { timeout: 5000 });
                    killed++;
                } catch (e) {
                    // 进程可能已退出
                }
            }
        }
        
        return killed;
    } catch (e) {
        // PowerShell 失败，尝试 WMIC
    }
    
    // 方法 2: WMIC（旧版 Windows）
    try {
        const { stdout } = await execAsync(
            'wmic process where "commandline like \'%--started-by daemon%\'" get processid',
            { timeout: 10000, windowsHide: true }
        );
        
        const pids = stdout.split(/\r?\n/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
        
        if (pids.length > 0) {
            spinner.text = `Found ${pids.length} orphaned session processes, terminating...`;
            
            for (const pid of pids) {
                try {
                    await execAsync(`taskkill /PID ${pid} /F /T`, { timeout: 5000 });
                    killed++;
                } catch (e) {
                    // 进程可能已退出
                }
            }
        }
    } catch (e) {
        // WMIC 也失败了
    }
    
    return killed;
}

/**
 * Unix/Mac 下清理进程
 */
async function cleanupUnixProcesses(spinner) {
    let killed = 0;
    
    // 方法 1: pgrep
    try {
        const { stdout } = await execAsync(
            "pgrep -f -- '--started-by daemon'",
            { timeout: 5000 }
        );
        
        const pids = stdout.trim().split(/\n/).filter(Boolean);
        
        if (pids.length > 0) {
            spinner.text = `Found ${pids.length} orphaned session processes, terminating...`;
            
            for (const pid of pids) {
                try {
                    const pidNum = parseInt(pid);
                    if (!isNaN(pidNum) && pidNum > 0) {
                        process.kill(pidNum, 'SIGKILL');
                        killed++;
                    }
                } catch (e) {
                    // ESRCH 表示进程不存在
                }
            }
        }
        
        return killed;
    } catch (e) {
        // pgrep 找不到进程返回退出码 1，这是正常的
        if (e.code !== 1) {
            // 其他错误，尝试备用方法
        }
    }
    
    // 方法 2: ps + grep
    try {
        const { stdout } = await execAsync(
            "ps aux | grep -- '--started-by daemon' | grep -v grep | awk '{print $2}'",
            { timeout: 5000, shell: '/bin/sh' }
        );
        
        const pids = stdout.trim().split(/\n/).filter(Boolean);
        
        if (pids.length > 0) {
            spinner.text = `Found ${pids.length} orphaned session processes, terminating...`;
            
            for (const pid of pids) {
                try {
                    const pidNum = parseInt(pid);
                    if (!isNaN(pidNum) && pidNum > 0) {
                        process.kill(pidNum, 'SIGKILL');
                        killed++;
                    }
                } catch (e) {
                    // 进程可能已退出
                }
            }
        }
    } catch (e) {
        // 备用方法也失败了
    }
    
    return killed;
}

export default cleanupCommand;
