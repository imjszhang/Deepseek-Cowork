// 配置 - 更新为新的 API 路径
const API_BASE = '/api/scheduler';

// 状态管理
let serviceStatus = null;
let schedulerStatus = null;
let tasks = [];
let archivedTasks = [];
let currentTab = 'cron';
let isConnected = false;
let timezone = 'Asia/Shanghai';

// 任务执行状态管理
const taskExecutionStatus = new Map();

// Socket.IO连接
let socket = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    updateConnectionStatus('connecting');
    initSocket();
    
    // 设置定期状态更新（每30秒）
    setInterval(() => {
        if (socket && socket.connected) {
            socket.emit('getStatus');
        }
    }, 30000);
}

// 初始化Socket.IO连接 - 更新为新的命名空间
function initSocket() {
    socket = io('/scheduler');
    
    socket.on('connect', () => {
        console.log('Socket.IO连接已建立');
        updateConnectionStatus('online');
        
        // 请求初始数据
        socket.emit('getStatus');
        socket.emit('getTasks');
        socket.emit('getArchivedTasks');
    });
    
    socket.on('disconnect', () => {
        console.log('Socket.IO连接已断开');
        updateConnectionStatus('offline');
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket.IO连接错误:', error);
        updateConnectionStatus('offline');
    });
    
    // 监听服务状态更新
    socket.on('status', (status) => {
        serviceStatus = status;
        // 更新时区配置
        timezone = status.settings?.timezone || 'Asia/Shanghai';
        updateServiceStatusDisplay();
        updateSchedulerStatusDisplay();
    });
    
    // 监听任务列表更新
    socket.on('tasks', (taskList) => {
        tasks = taskList || [];
        updateTasksDisplay();
    });
    
    // 监听归档任务列表
    socket.on('archived_tasks', (taskList) => {
        archivedTasks = taskList || [];
        updateTasksDisplay();
    });

    // 监听实时事件
    socket.on('scheduler_started', () => {
        showAlert('调度器已启动', 'success');
        requestStatusUpdate();
        requestTasksUpdate();
    });
    
    socket.on('scheduler_stopped', () => {
        showAlert('调度器已停止', 'warning');
        requestStatusUpdate();
        requestTasksUpdate();
    });
    
    socket.on('task_added', (data) => {
        showAlert(`任务已添加: ${data.taskId}`, 'success');
        requestTasksUpdate();
    });
    
    socket.on('task_updated', (data) => {
        showAlert(`任务已更新: ${data.taskId}`, 'success');
        requestTasksUpdate();
    });
    
    socket.on('task_removed', (data) => {
        showAlert(`任务已删除: ${data.taskId}`, 'warning');
        requestTasksUpdate();
    });
    
    socket.on('task_toggled', (data) => {
        showAlert(`任务${data.enabled ? '已启用' : '已禁用'}: ${data.taskId}`, 'success');
        requestTasksUpdate();
    });
    
    socket.on('task_archived', (data) => {
        showAlert(`任务已归档: ${data.taskId}`, 'success');
        requestTasksUpdate();
    });

    socket.on('config_reloaded', (data) => {
        showAlert('配置已重新加载', 'success');
        requestStatusUpdate();
        requestTasksUpdate();
    });
    
    socket.on('log', (logEntry) => {
        console.log('[调度器日志]', logEntry);
    });
    
    // 监听任务执行状态更新
    socket.on('task_execution_started', (data) => {
        taskExecutionStatus.set(data.taskId, 'running');
        updateTasksDisplay();
        showAlert(`任务开始执行: ${data.taskId}`, 'success');
    });
    
    socket.on('task_execution_completed', (data) => {
        taskExecutionStatus.delete(data.taskId);
        removeTaskProgress(data.taskId);
        requestTasksUpdate();
        showAlert(`任务执行完成: ${data.taskId}`, 'success');
    });
    
    socket.on('task_execution_failed', (data) => {
        taskExecutionStatus.delete(data.taskId);
        removeTaskProgress(data.taskId);
        requestTasksUpdate();
        showAlert(`任务执行失败: ${data.taskId} - ${data.error}`, 'error');
    });
    
    socket.on('task_execution_progress', (data) => {
        updateTaskProgress(data.taskId, {
            runTime: data.runTime || 0,
            progress: data.progress || '正在执行...'
        });
    });
    
    // 监听任务取消响应
    socket.on('task_cancelled', (data) => {
        if (data.success) {
            showAlert(`任务已取消: ${data.taskId}`, 'success');
        } else {
            showAlert(`取消任务失败: ${data.taskId} - ${data.error}`, 'error');
        }
        taskExecutionStatus.delete(data.taskId);
        removeTaskProgress(data.taskId);
        requestTasksUpdate();
    });
    
    // 监听文件监控事件
    socket.on('fileChange', (data) => {
        if (data.watcherKey === 'scheduler-config' || data.path.includes('scheduler-config.json')) {
            const source = data.processed_by || data.source || '未知';
            const alertMessage = `配置文件变化: ${data.path} (来源: ${source})`;
            
            showAlert(alertMessage, 'warning');
            updateFileWatcherStatus();
            
            // 如果是来自 Explorer webhook 的事件，自动刷新任务列表和状态
            if (data.source === 'webhook' || data.processed_by === 'Scheduler') {
                console.log('检测到 Explorer webhook 事件，自动刷新数据');
                setTimeout(() => {
                    requestStatusUpdate();
                    requestTasksUpdate();
                }, 2000); // 延迟2秒刷新，等待配置重载完成
            }
        }
    });
    
    // 监听文件监控状态更新
    socket.on('filewatcher_status', (data) => {
        updateFileWatcherStatusDisplay(data);
    });
    
    // 监听文件监控重启响应
    socket.on('filewatcher_restarted', (data) => {
        if (data.success) {
            showAlert('文件监控重启成功', 'success');
        } else {
            showAlert(`文件监控重启失败: ${data.error}`, 'error');
        }
        updateFileWatcherStatus();
    });
}

// 请求状态更新
function requestStatusUpdate() {
    if (socket && socket.connected) {
        socket.emit('getStatus');
    }
}

// 请求任务列表更新
function requestTasksUpdate() {
    if (socket && socket.connected) {
        socket.emit('getTasks');
        socket.emit('getArchivedTasks');
    }
}

// 切换标签页
function switchTab(tab) {
    currentTab = tab;
    
    // 更新标签按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-white', 'text-black', 'shadow-lg', 'shadow-white/10');
        btn.classList.add('bg-neutral-900/50', 'text-neutral-400', 'hover:bg-neutral-800', 'hover:text-white', 'hover:border-white/20');
    });
    const activeBtn = document.getElementById(`tab-${tab}`);
    activeBtn.classList.remove('bg-neutral-900/50', 'text-neutral-400');
    activeBtn.classList.add('active', 'bg-white', 'text-black', 'shadow-lg', 'shadow-white/10');
    
    updateTasksDisplay();
}

// 更新连接状态
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    
    switch (status) {
        case 'connecting':
            statusEl.className = 'connection-status fixed top-5 right-5 px-4 py-2 rounded-full text-xs font-mono font-semibold z-[1000] backdrop-blur-xl border border-white/10 bg-red-500/20 text-red-300';
            statusEl.innerHTML = '<span class="status-indicator status-stopped"></span> 连接中...';
            isConnected = false;
            break;
        case 'online':
            statusEl.className = 'connection-status fixed top-5 right-5 px-4 py-2 rounded-full text-xs font-mono font-semibold z-[1000] backdrop-blur-xl border border-white/10 bg-green-500/20 text-green-300';
            statusEl.innerHTML = '<span class="status-indicator status-running"></span> 已连接';
            isConnected = true;
            break;
        case 'offline':
            statusEl.className = 'connection-status fixed top-5 right-5 px-4 py-2 rounded-full text-xs font-mono font-semibold z-[1000] backdrop-blur-xl border border-white/10 bg-red-500/20 text-red-300';
            statusEl.innerHTML = '<span class="status-indicator status-stopped"></span> 连接断开';
            isConnected = false;
            break;
    }
}

// 显示提示信息
function showAlert(message, type = 'success') {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    
    const baseClasses = 'px-5 py-3 rounded-lg mb-4 flex items-center gap-3 font-medium backdrop-blur-xl border';
    const typeClasses = {
        success: `${baseClasses} bg-green-500/10 text-green-300 border-green-500/30`,
        error: `${baseClasses} bg-red-500/10 text-red-300 border-red-500/30`,
        warning: `${baseClasses} bg-yellow-500/10 text-yellow-300 border-yellow-500/30`
    };
    
    alert.className = typeClasses[type] || typeClasses.success;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    alert.innerHTML = `${icon} ${message}`;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        if (container.contains(alert)) {
            container.removeChild(alert);
        }
    }, 5000);
}

// Socket.IO API调用封装
function socketEmit(event, data = {}) {
    return new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
            reject(new Error('Socket连接未建立'));
            return;
        }
        
        const timeout = setTimeout(() => {
            reject(new Error('请求超时'));
        }, 10000);
        
        socket.emit(event, data, (response) => {
            clearTimeout(timeout);
            if (response && response.success === false) {
                reject(new Error(response.error || '操作失败'));
            } else {
                resolve(response);
            }
        });
    });
}

// 刷新所有数据
async function refreshData() {
    const refreshIndicator = document.getElementById('refresh-indicator');
    refreshIndicator.classList.remove('hidden');
    
    try {
        if (socket && socket.connected) {
            socket.emit('getStatus');
            socket.emit('getTasks');
            socket.emit('getArchivedTasks');
            updateConnectionStatus('online');
        } else {
            updateConnectionStatus('offline');
        }
    } catch (error) {
        console.error('刷新数据失败:', error);
        updateConnectionStatus('offline');
    } finally {
        refreshIndicator.classList.add('hidden');
    }
}

// 更新服务状态显示
function updateServiceStatusDisplay() {
    if (!serviceStatus) return;
    
    const indicator = document.getElementById('service-status-indicator');
    const info = document.getElementById('service-status-info');
    
    // 更新状态指示器
    indicator.className = `status-indicator ${
        serviceStatus.service.isRunning ? 'status-running' : 'status-stopped'
    }`;
    
    // 更新服务信息
    info.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-2xl font-bold text-white mb-1">${serviceStatus.service.isRunning ? '🟢' : '🔴'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">服务状态</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${serviceStatus.service.name || 'Scheduler'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">服务名称</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${serviceStatus.service.uptime || '0秒'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">运行时间</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${Math.round((serviceStatus.system?.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">内存使用</div>
            </div>
        </div>
    `;
}

// 更新调度器状态显示
function updateSchedulerStatusDisplay() {
    if (!serviceStatus) return;
    
    const indicator = document.getElementById('scheduler-status-indicator');
    const info = document.getElementById('scheduler-status-info');
    const startBtn = document.getElementById('start-scheduler-btn');
    const stopBtn = document.getElementById('stop-scheduler-btn');
    
    // 从serviceStatus中获取调度器状态
    const schedulerData = serviceStatus.scheduler || {};
    
    // 更新状态指示器
    indicator.className = `status-indicator ${
        schedulerData.isRunning ? 'status-running' : 'status-stopped'
    }`;
    
    // 更新按钮状态
    if (startBtn) startBtn.disabled = schedulerData.isRunning;
    if (stopBtn) stopBtn.disabled = !schedulerData.isRunning;
    
    // 更新调度器信息
    info.innerHTML = `
        <div class="grid grid-cols-2 gap-3">
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-2xl font-bold text-white mb-1">${schedulerData.isRunning ? '🟢' : '🔴'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">调度器状态</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${schedulerData.tasksCount || 0}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">任务总数</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${serviceStatus.service?.uptime || '0秒'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">服务运行时间</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${serviceStatus.service?.name || 'Scheduler'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">服务名称</div>
            </div>
        </div>
    `;
    
    // 更新系统统计
    const systemStats = document.getElementById('system-stats');
    if (serviceStatus && systemStats) {
        const systemData = serviceStatus.system || {};
        systemStats.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                    <div class="text-lg font-bold text-white mb-1 font-mono">${systemData.logCount || 0}</div>
                    <div class="text-xs text-neutral-400 uppercase tracking-wide">日志条数</div>
                </div>
                <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                    <div class="text-lg font-bold text-white mb-1 font-mono">${systemData.wsConnections || 0}</div>
                    <div class="text-xs text-neutral-400 uppercase tracking-wide">Socket连接</div>
                </div>
                <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                    <div class="text-lg font-bold text-white mb-1 font-mono">${schedulerData.runningTasksCount || 0}</div>
                    <div class="text-xs text-neutral-400 uppercase tracking-wide">运行中任务</div>
                </div>
                <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                    <div class="text-lg font-bold text-white mb-1 font-mono">${formatTime(new Date())}</div>
                    <div class="text-xs text-neutral-400 uppercase tracking-wide">最后更新</div>
                </div>
            </div>
        `;
    }
    
    // 更新文件监控状态
    updateFileWatcherStatusDisplay();
}

// 更新文件监控状态显示
function updateFileWatcherStatusDisplay(fileWatcherData = null) {
    const indicator = document.getElementById('filewatcher-status-indicator');
    const info = document.getElementById('filewatcher-status-info');
    
    if (!indicator || !info) return;
    
    // 如果没有提供文件监控数据，使用默认状态
    const watcherData = fileWatcherData || {
        isActive: serviceStatus?.scheduler?.isRunning || false,
        configPath: 'scheduler-config.json',
        lastChange: null,
        changeCount: 0
    };
    
    // 更新状态指示器
    indicator.className = `status-indicator ${
        watcherData.isActive ? 'status-running' : 'status-stopped'
    }`;
    
    // 更新文件监控信息
    info.innerHTML = `
        <div class="grid grid-cols-3 gap-3 mb-3">
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-xl font-bold text-white mb-1">${watcherData.isActive ? '🟢' : '🔴'}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">监控状态</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-lg font-bold text-white mb-1 font-mono">${watcherData.changeCount || 0}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">变化次数</div>
            </div>
            <div class="text-center p-3 bg-black/30 rounded-lg border border-white/5">
                <div class="text-sm font-bold text-white mb-1 font-mono">${formatTime(watcherData.lastChange)}</div>
                <div class="text-xs text-neutral-400 uppercase tracking-wide">最后变化</div>
            </div>
        </div>
        <div class="text-xs text-neutral-500 font-mono">
            监控文件: ${watcherData.configPath || 'scheduler-config.json'}
        </div>
    `;
}

// 更新文件监控状态
function updateFileWatcherStatus() {
    // 请求文件监控状态更新
    if (socket && socket.connected) {
        socket.emit('getFileWatcherStatus');
    }
}

// 更新任务显示
function updateTasksDisplay() {
    const container = document.getElementById('tasks-container');
    
    let displayTasks = [];
    
    if (currentTab === 'archived') {
        displayTasks = archivedTasks;
    } else {
        displayTasks = tasks.filter(task => {
            const type = task.type || 'cron';
            return type === currentTab;
        });
    }
    
    if (!displayTasks || displayTasks.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-20">
                <div class="text-5xl mb-4 opacity-50">📋</div>
                <p class="text-neutral-400 text-lg font-mono">暂无${getTabName(currentTab)}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = displayTasks.map(task => {
        if (currentTab === 'archived') {
            return renderArchivedTaskCard(task);
        } else {
            return renderActiveTaskCard(task);
        }
    }).join('');
}

function getTabName(tab) {
    switch(tab) {
        case 'cron': return '周期任务';
        case 'once': return '一次性任务';
        case 'archived': return '归档任务';
        default: return '任务';
    }
}

function renderArchivedTaskCard(task) {
    return `
        <div class="glass-card rounded-2xl p-6 border-l-4 border-l-neutral-600/50 disabled task-card" data-task-id="${task.id}">
            <div class="flex justify-between items-center mb-4">
                <div class="text-lg font-bold text-neutral-200">${task.name}</div>
                <div class="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/30">📦 已归档</div>
            </div>
            
            <div class="space-y-2 mb-6 text-sm text-neutral-400">
                <div><span class="text-neutral-300 font-medium">📝 描述:</span> ${task.description || '无描述'}</div>
                <div><span class="text-neutral-300 font-medium">⏰ 原定时间:</span> ${(task.type || 'once') === 'once' ? formatDateTime(task.schedule) : task.schedule}</div>
                <div><span class="text-neutral-300 font-medium">📂 归档时间:</span> ${formatDateTime(task.archivedAt)}</div>
                <div><span class="text-neutral-300 font-medium">📄 脚本:</span> <span class="font-mono text-xs">${task.script}</span></div>
                ${task.tags && task.tags.length > 0 ? `<div><span class="text-neutral-300 font-medium">🏷️ 标签:</span> ${task.tags.join(', ')}</div>` : ''}
            </div>
            
            <div class="flex gap-2">
                <button class="btn btn-sm btn-primary px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" onclick="showTaskHistory('${task.id}')">
                    📋 执行历史
                </button>
            </div>
        </div>
    `;
}

function renderActiveTaskCard(task) {
    const isExecuting = taskExecutionStatus.get(task.id) === 'running';
    const cardClass = task.enabled ? 
        (isExecuting ? 'running executing border-l-yellow-500/50' : (task.isRunning ? 'running border-l-green-500/50' : 'border-l-blue-500/50')) : 
        'disabled border-l-neutral-600/50';
    
    return `
        <div class="glass-card rounded-2xl p-6 border-l-4 ${cardClass} task-card transition-all hover:scale-[1.02]" data-task-id="${task.id}">
            <div class="flex justify-between items-center mb-4">
                <div class="text-lg font-bold text-white">${task.name}</div>
                <div class="px-3 py-1 rounded-full text-xs font-semibold ${task.enabled ? 'bg-green-500/10 text-green-300 border border-green-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'}">
                    ${task.enabled ? '✅ 启用' : '⏸️ 禁用'}
                </div>
            </div>
            
            <div class="space-y-2 mb-6 text-sm text-neutral-400">
                <div><span class="text-neutral-300 font-medium">📝 描述:</span> ${task.description || '无描述'}</div>
                <div><span class="text-neutral-300 font-medium">⏰ 调度:</span> <span class="font-mono text-xs">${(task.type || 'cron') === 'once' ? formatDateTime(task.schedule) : task.schedule}</span></div>
                <div><span class="text-neutral-300 font-medium">📄 脚本:</span> <span class="font-mono text-xs">${task.script}</span></div>
                <div><span class="text-neutral-300 font-medium">🕐 上次运行:</span> ${formatDateTime(task.lastRun)}</div>
                <div><span class="text-neutral-300 font-medium">📊 统计:</span> 运行 ${task.runCount} 次 | 错误 ${task.errorCount} 次</div>
                ${task.tags && task.tags.length > 0 ? `<div><span class="text-neutral-300 font-medium">🏷️ 标签:</span> ${task.tags.join(', ')}</div>` : ''}
            </div>
            
            <div class="flex flex-wrap gap-2">
                ${isExecuting ? `
                    <button class="btn btn-sm btn-warning px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" onclick="cancelTask('${task.id}')">
                        ⏹️ 取消执行
                    </button>
                ` : `
                    <button class="btn btn-sm btn-primary px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" onclick="runTask('${task.id}')" id="run-btn-${task.id}">
                        ▶️ 立即执行
                    </button>
                `}
                <button class="btn btn-sm ${task.enabled ? 'btn-warning' : 'btn-success'} px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" 
                        onclick="toggleTask('${task.id}', ${!task.enabled})">
                    ${task.enabled ? '⏸️ 禁用' : '▶️ 启用'}
                </button>
                <button class="btn btn-sm btn-primary px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" onclick="showTaskHistory('${task.id}')">
                    📋 历史
                </button>
                ${(task.type || 'cron') === 'once' ? `
                    <button class="btn btn-sm btn-warning px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:scale-105 flex items-center gap-2" onclick="archiveTask('${task.id}')">
                        📦 归档
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// 启动调度器
async function startScheduler() {
    try {
        const response = await fetch(`${API_BASE}/scheduler/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('调度器启动成功');
        } else {
            throw new Error(data.error || '启动失败');
        }
    } catch (error) {
        showAlert(`启动调度器失败: ${error.message}`, 'error');
    }
}

// 停止调度器
async function stopScheduler() {
    if (!confirm('确定要停止调度器吗？这将停止所有定时任务。')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/scheduler/stop`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert('调度器停止成功');
        } else {
            throw new Error(data.error || '停止失败');
        }
    } catch (error) {
        showAlert(`停止调度器失败: ${error.message}`, 'error');
    }
}

// 重新加载配置
async function reloadConfig() {
    try {
        socket.emit('reloadConfig');
        showAlert('配置重新加载请求已发送');
    } catch (error) {
        showAlert(`重新加载配置失败: ${error.message}`, 'error');
    }
}

// 执行任务
async function runTask(taskId) {
    const button = document.getElementById(`run-btn-${taskId}`);
    
    if (taskExecutionStatus.get(taskId) === 'running') {
        showAlert(`任务 ${taskId} 正在执行中，请稍候`, 'warning');
        return;
    }
    
    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<div class="loading"></div> 执行中...';
        }
        taskExecutionStatus.set(taskId, 'running');
        
        const response = await fetch(`${API_BASE}/tasks/${taskId}/run`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showAlert(`任务 ${taskId} 开始执行`);
            // 开始监听任务状态更新
            startTaskStatusMonitoring(taskId);
        } else {
            throw new Error(data.error || '执行失败');
        }
        
    } catch (error) {
        resetTaskButton(taskId, button);
        taskExecutionStatus.delete(taskId);
        showAlert(`执行任务失败: ${error.message}`, 'error');
    }
}

// 开始监听任务状态
function startTaskStatusMonitoring(taskId) {
    // 通过Socket.IO实时监听任务状态变化
    // 当任务完成时，会通过Socket事件通知
    
    // 设置超时清理
    setTimeout(() => {
        if (taskExecutionStatus.has(taskId)) {
            taskExecutionStatus.delete(taskId);
            removeTaskProgress(taskId);
            requestTasksUpdate();
            showAlert(`任务 ${taskId} 执行超时`, 'warning');
        }
    }, 30 * 60 * 1000); // 30分钟超时
}

// 取消任务执行
async function cancelTask(taskId) {
    if (!confirm(`确定要取消正在执行的任务 ${taskId} 吗？`)) {
        return;
    }
    
    try {
        socket.emit('cancelTask', { taskId });
        
        taskExecutionStatus.delete(taskId);
        removeTaskProgress(taskId);
        
        showAlert(`任务取消请求已发送: ${taskId}`, 'success');
        requestTasksUpdate();
    } catch (error) {
        showAlert(`取消任务失败: ${error.message}`, 'error');
    }
}

// 切换任务状态
async function toggleTask(taskId, enabled) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });
        
        const data = await response.json();
        if (data.success) {
            showAlert(`任务 ${taskId} ${enabled ? '已启用' : '已禁用'}`);
        } else {
            throw new Error(data.error || '切换失败');
        }
    } catch (error) {
        showAlert(`切换任务状态失败: ${error.message}`, 'error');
    }
}

// 归档任务
async function archiveTask(taskId) {
    if (!confirm(`确定要归档任务 ${taskId} 吗？归档后任务将从活动列表中移除。`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}/archive`, {
            method: 'POST'
        });
        
        const data = await response.json();
        if (data.success) {
            showAlert(`任务 ${taskId} 已归档`, 'success');
            // 刷新任务列表和归档列表
            requestTasksUpdate();
        } else {
            throw new Error(data.error || '归档失败');
        }
    } catch (error) {
        showAlert(`归档任务失败: ${error.message}`, 'error');
    }
}

// 显示任务执行历史
async function showTaskHistory(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}/history?limit=20`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '获取历史失败');
        }
        
        const history = result.data.history;
        
        const modal = document.getElementById('history-modal');
        const title = document.getElementById('history-modal-title');
        const body = document.getElementById('history-modal-body');
        
        title.textContent = `任务执行历史 - ${taskId}`;
        
        if (history.length === 0) {
            body.innerHTML = `
                <div class="text-center py-20">
                    <div class="text-5xl mb-4 opacity-50">📋</div>
                    <p class="text-neutral-400 text-lg font-mono">暂无执行历史</p>
                </div>
            `;
        } else {
            body.innerHTML = history.map(record => `
                <div class="history-item p-4 mb-3 rounded-lg border-l-4 ${record.success ? 'success border-l-green-500 bg-green-500/5' : 'error border-l-red-500 bg-red-500/5'} transition-transform hover:translate-x-1">
                    <div class="font-semibold text-white mb-2">${formatDateTime(record.startTime)}</div>
                    <div class="flex gap-4 mb-2 text-sm">
                        <div class="font-semibold ${record.success ? 'text-green-300' : 'text-red-300'}">${record.success ? '✅ 成功' : '❌ 失败'}</div>
                        <div class="text-neutral-400">耗时: ${formatDuration(record.duration)}</div>
                        ${record.exitCode !== null && record.exitCode !== undefined ? `<div class="text-neutral-400">退出码: ${record.exitCode}</div>` : ''}
                    </div>
                    ${record.error ? `<div class="mt-2 p-3 rounded-lg bg-red-500/10 text-red-300 text-sm border border-red-500/20">错误: ${record.error}</div>` : ''}
                    ${record.output && record.output.trim() ? `
                        <div class="mt-2 text-xs text-neutral-400 max-h-24 overflow-y-auto bg-black/30 p-3 rounded-lg border border-white/5 font-mono">
                            输出: ${record.output.substring(0, 300)}${record.output.length > 300 ? '...' : ''}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }
        
        modal.classList.remove('hidden');
        
    } catch (error) {
        showAlert(`获取任务历史失败: ${error.message}`, 'error');
    }
}

// 关闭历史模态框
function closeHistoryModal() {
    document.getElementById('history-modal').classList.add('hidden');
}

// 显示配置目录结构
async function showConfigDirectory() {
    try {
        const response = await fetch(`${API_BASE}/config-directory`);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '获取配置目录失败');
        }
        
        const structure = result.data;
        
        const modal = document.getElementById('config-directory-modal');
        const body = document.getElementById('config-directory-body');
        
        if (Object.keys(structure).length === 0) {
            body.innerHTML = `
                <div class="text-center py-20">
                    <div class="text-5xl mb-4 opacity-50">📁</div>
                    <p class="text-neutral-400 text-lg font-mono">配置目录为空</p>
                </div>
            `;
        } else {
            body.innerHTML = `
                <div class="file-tree font-mono text-sm leading-relaxed bg-black/30 p-4 rounded-lg border border-white/10 max-h-96 overflow-y-auto">
                    ${renderFileTree(structure, 0)}
                </div>
                <div class="mt-4 p-3 bg-blue-500/10 text-blue-300 rounded-lg text-sm border border-blue-500/20">
                    <strong>💡 提示:</strong> 这是调度器配置文件所在的目录结构，文件监控正在实时监控此目录的变化。
                </div>
            `;
        }
        
        modal.classList.remove('hidden');
        
    } catch (error) {
        showAlert(`获取配置目录失败: ${error.message}`, 'error');
    }
}

// 渲染文件树
function renderFileTree(structure, depth = 0) {
    let html = '';
    const indent = '&nbsp;'.repeat(depth * 4);
    
    for (const [name, value] of Object.entries(structure)) {
        if (typeof value === 'object' && value !== null) {
            // 文件夹
            html += `<div class="py-1 text-neutral-300">
                ${indent}📁 <span class="text-purple-400 font-semibold">${name}/</span>
            </div>`;
            html += renderFileTree(value, depth + 1);
        } else {
            // 文件
            const icon = getFileIcon(name);
            html += `<div class="py-1 text-neutral-400">
                ${indent}${icon} <span class="text-neutral-300">${name}</span>
            </div>`;
        }
    }
    
    return html;
}

// 获取文件图标
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
        case 'json': return '📄';
        case 'js': return '📜';
        case 'log': return '📋';
        case 'md': return '📝';
        case 'txt': return '📄';
        default: return '📄';
    }
}

// 关闭配置目录模态框
function closeConfigDirectoryModal() {
    document.getElementById('config-directory-modal').classList.add('hidden');
}

// 重启文件监控
async function restartFileWatcher() {
    if (!confirm('确定要重启文件监控吗？这将重新初始化配置文件监控。')) {
        return;
    }
    
    try {
        socket.emit('restartFileWatcher');
        showAlert('文件监控重启请求已发送', 'success');
        
        // 延迟更新状态
        setTimeout(() => {
            updateFileWatcherStatus();
        }, 2000);
        
    } catch (error) {
        showAlert(`重启文件监控失败: ${error.message}`, 'error');
    }
}

// 重置任务按钮状态
function resetTaskButton(taskId, button) {
    if (button) {
        button.disabled = false;
        button.innerHTML = '▶️ 立即执行';
    }
}

// 更新任务进度显示
function updateTaskProgress(taskId, status) {
    const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskCard) return;
    
    let progressDiv = taskCard.querySelector('.task-progress');
    if (!progressDiv) {
        progressDiv = document.createElement('div');
        progressDiv.className = 'task-progress mt-3 p-3 bg-black/30 rounded-lg border-l-3 border-l-blue-500/50';
        taskCard.appendChild(progressDiv);
    }
    
    const runTime = formatDuration(status.runTime || 0);
    progressDiv.innerHTML = `
        <div class="flex items-center gap-3 text-sm text-neutral-300">
            <div class="loading"></div>
            <span>执行中... (运行时间: ${runTime})</span>
        </div>
        ${status.progress ? `<div class="mt-2 text-xs text-neutral-400">${status.progress}</div>` : ''}
    `;
}

// 移除任务进度显示
function removeTaskProgress(taskId) {
    const taskCard = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskCard) {
        const progressDiv = taskCard.querySelector('.task-progress');
        if (progressDiv) {
            progressDiv.remove();
        }
    }
}

// 格式化持续时间
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}秒`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
}

// 格式化日期时间（使用配置的时区）
function formatDateTime(date, options = {}) {
    if (!date) return '从未运行';
    const d = new Date(date);
    return d.toLocaleString('zh-CN', { 
        timeZone: timezone,
        ...options 
    });
}

// 格式化时间（仅时间部分，使用配置的时区）
function formatTime(date) {
    if (!date) return '无';
    const d = new Date(date);
    return d.toLocaleTimeString('zh-CN', { 
        timeZone: timezone
    });
}

// 点击模态框背景关闭
window.onclick = function(event) {
    const historyModal = document.getElementById('history-modal');
    const configModal = document.getElementById('config-directory-modal');
    
    if (event.target === historyModal) {
        historyModal.classList.add('hidden');
    }
    
    if (event.target === configModal) {
        configModal.classList.add('hidden');
    }
}
