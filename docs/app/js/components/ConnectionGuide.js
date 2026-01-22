/**
 * 连接指引组件
 * 
 * 在 Web 模式下检测本地服务连接状态，显示安装和连接指引
 * 
 * 创建时间: 2026-01-20
 */

class ConnectionGuide {
    constructor() {
        this._overlay = null;
        this._visible = false;
        this._checkInterval = null;
        this._platform = this._detectPlatform();
        this._connectionStatus = 'disconnected';
    }

    /**
     * 初始化连接指引
     */
    async initialize() {
        // 检测环境
        if (window.apiAdapter && window.apiAdapter.getMode() === 'electron') {
            console.log('[ConnectionGuide] Running in Electron mode, skipping');
            return;
        }

        console.log('[ConnectionGuide] Running in Web mode, checking local service...');
        
        // 创建 UI
        this._createOverlay();
        
        // 检查连接
        const connected = await this._checkConnection();
        
        if (!connected) {
            this.show();
            this._startConnectionCheck();
        }
    }

    /**
     * 检测操作系统平台
     */
    _detectPlatform() {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('win')) return 'windows';
        if (ua.includes('mac')) return 'macos';
        return 'linux';
    }

    /**
     * 创建遮罩层 UI
     */
    _createOverlay() {
        if (this._overlay) return;

        this._overlay = document.createElement('div');
        this._overlay.className = 'connection-guide-overlay';
        this._overlay.innerHTML = this._getHTML();
        
        document.body.appendChild(this._overlay);
        
        // 绑定事件
        this._bindEvents();
    }

    /**
     * 获取 HTML 内容
     */
    _getHTML() {
        return `
            <div class="connection-guide-card">
                <div class="connection-guide-header">
                    <div class="connection-guide-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                    </div>
                    <h2>连接本地服务</h2>
                    <p>DeepSeek Cowork 需要本地服务来支持 AI 对话、文件管理和浏览器控制功能。</p>
                </div>
                
                <div class="connection-status">
                    <span class="connection-status-dot" id="connectionStatusDot"></span>
                    <span class="connection-status-text" id="connectionStatusText">正在检测本地服务...</span>
                </div>
                
                <div class="installation-steps">
                    <div class="installation-step">
                        <div class="step-number">1</div>
                        <div class="step-content">
                            <h4>安装本地服务</h4>
                            <p>使用 npm 全局安装 DeepSeek Cowork CLI 工具：</p>
                            <div class="code-block">
                                <code>npm install -g deepseek-cowork</code>
                                <button class="copy-btn" data-copy="npm install -g deepseek-cowork">复制</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="installation-step">
                        <div class="step-number">2</div>
                        <div class="step-content">
                            <h4>启动服务</h4>
                            <p>在终端中运行以下命令启动本地服务：</p>
                            <div class="code-block">
                                <code>deepseek-cowork start --daemon</code>
                                <button class="copy-btn" data-copy="deepseek-cowork start --daemon">复制</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="connection-guide-actions">
                    <button class="btn-primary" id="retryConnectionBtn">
                        <span id="retryBtnText">检测连接</span>
                    </button>
                    <button class="btn-secondary" id="continueOfflineBtn">
                        离线浏览
                    </button>
                </div>
                
                <div class="help-links">
                    <a href="https://github.com/imjszhang/deepseek-cowork#installation" target="_blank">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                        </svg>
                        安装指南
                    </a>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 重试连接按钮
        const retryBtn = this._overlay.querySelector('#retryConnectionBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this._retryConnection());
        }
        
        // 离线浏览按钮
        const continueBtn = this._overlay.querySelector('#continueOfflineBtn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => this.hide());
        }
        
        // 复制按钮
        const copyBtns = this._overlay.querySelectorAll('.copy-btn');
        copyBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this._copyToClipboard(e));
        });
    }

    /**
     * 复制到剪贴板
     */
    async _copyToClipboard(event) {
        const btn = event.target;
        const text = btn.dataset.copy;
        
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = '已复制';
            btn.classList.add('copied');
            
            setTimeout(() => {
                btn.textContent = '复制';
                btn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    }

    /**
     * 检查连接
     */
    async _checkConnection() {
        try {
            const response = await fetch('http://localhost:3333/api/ping', {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                this._updateStatus('connected');
                return true;
            }
        } catch (error) {
            // 连接失败
        }
        
        this._updateStatus('disconnected');
        return false;
    }

    /**
     * 重试连接
     */
    async _retryConnection() {
        const btn = this._overlay.querySelector('#retryConnectionBtn');
        const btnText = this._overlay.querySelector('#retryBtnText');
        
        btn.disabled = true;
        btnText.textContent = '检测中...';
        this._updateStatus('connecting');
        
        const connected = await this._checkConnection();
        
        if (connected) {
            btnText.textContent = '已连接';
            
            // 连接成功，初始化 WebSocket 并隐藏指引
            setTimeout(async () => {
                await this._initializeConnection();
                this.hide();
            }, 500);
        } else {
            btn.disabled = false;
            btnText.textContent = '重试连接';
        }
    }

    /**
     * 初始化连接（WebSocket 等）
     */
    async _initializeConnection() {
        // 初始化 WebSocket 客户端
        if (window.WebSocketClient && !window.wsClient) {
            window.wsClient = new WebSocketClient({
                url: 'ws://localhost:3333'
            });
            
            try {
                await window.wsClient.connect();
                
                // 关联到 ApiAdapter
                if (window.apiAdapter) {
                    window.apiAdapter.setWebSocketClient(window.wsClient);
                }
            } catch (error) {
                console.warn('[ConnectionGuide] WebSocket connection failed:', error);
            }
        }
        
        // 刷新应用状态 - 触发账户登录检查
        if (window.app && window.app.accountSetup) {
            await window.app.accountSetup.loadAccountInfo();
        }
    }

    /**
     * 更新状态显示
     */
    _updateStatus(status) {
        this._connectionStatus = status;
        
        const dot = this._overlay.querySelector('#connectionStatusDot');
        const text = this._overlay.querySelector('#connectionStatusText');
        
        if (!dot || !text) return;
        
        dot.className = 'connection-status-dot';
        
        switch (status) {
            case 'connected':
                dot.classList.add('connected');
                text.textContent = '本地服务已连接';
                break;
            case 'connecting':
                dot.classList.add('connecting');
                text.textContent = '正在连接...';
                break;
            default:
                text.textContent = '本地服务未连接';
        }
    }

    /**
     * 开始定期检查连接
     */
    _startConnectionCheck() {
        if (this._checkInterval) return;
        
        this._checkInterval = setInterval(async () => {
            const connected = await this._checkConnection();
            
            if (connected) {
                this._stopConnectionCheck();
                await this._initializeConnection();
                this.hide();
            }
        }, 5000);
    }

    /**
     * 停止定期检查
     */
    _stopConnectionCheck() {
        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
    }

    /**
     * 显示指引
     */
    show() {
        if (!this._overlay) return;
        
        this._visible = true;
        this._overlay.classList.add('visible');
    }

    /**
     * 隐藏指引
     */
    hide() {
        if (!this._overlay) return;
        
        this._visible = false;
        this._overlay.classList.remove('visible');
        this._stopConnectionCheck();
    }

    /**
     * 切换显示
     */
    toggle() {
        if (this._visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * 是否可见
     */
    isVisible() {
        return this._visible;
    }

    /**
     * 销毁组件
     */
    destroy() {
        this._stopConnectionCheck();
        
        if (this._overlay) {
            this._overlay.remove();
            this._overlay = null;
        }
    }
}

// 导出
window.ConnectionGuide = ConnectionGuide;
