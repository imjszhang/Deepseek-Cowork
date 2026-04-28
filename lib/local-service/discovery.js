/**
 * Local Service 发现与兼容性判断
 *
 * Electron 和 CLI 共用这层逻辑，避免各自把同源后端误判为端口冲突。
 */

const http = require('http');
const net = require('net');
const localConfig = require('./config');

function checkPortAvailable(port, host = 'localhost') {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });

        server.listen(port, host);
    });
}

function requestJson(url, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout }, (res) => {
            let body = '';

            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        data: body ? JSON.parse(body) : null
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Request timed out'));
        });
    });
}

function normalizeProtocolVersion(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const numeric = Number(value);
    return Number.isNaN(numeric) ? String(value) : numeric;
}

function isProtocolCompatible(protocolVersion) {
    const normalized = normalizeProtocolVersion(protocolVersion);
    return normalized === localConfig.PROTOCOL_VERSION;
}

function buildBaseUrl(port, host = 'localhost') {
    return `http://${host}:${port}`;
}

async function discoverService(options = {}) {
    const port = Number(options.port) || localConfig.DEFAULT_HTTP_PORT;
    const host = options.host || 'localhost';
    const timeout = options.timeout || 2000;
    const baseUrl = buildBaseUrl(port, host);

    const available = await checkPortAvailable(port, host);
    if (available) {
        return {
            available: true,
            running: false,
            sameApp: false,
            compatible: false,
            conflict: null,
            baseUrl,
            host,
            port
        };
    }

    try {
        const response = await requestJson(`${baseUrl}/api/ping`, timeout);
        const data = response.data || {};
        const sameApp = response.ok && data.app === localConfig.APP_NAME;
        const protocolVersion = normalizeProtocolVersion(data.protocolVersion);
        const compatible = sameApp && isProtocolCompatible(protocolVersion);

        return {
            available: false,
            running: sameApp,
            sameApp,
            compatible,
            conflict: sameApp ? (compatible ? null : 'incompatible') : 'other',
            baseUrl,
            host,
            port,
            mode: data.mode,
            startedBy: data.startedBy || data.mode,
            version: data.version,
            protocolVersion,
            pid: data.pid,
            httpPort: data.httpPort || port,
            wsPort: data.wsPort,
            serviceRole: data.serviceRole,
            ping: data
        };
    } catch (error) {
        return {
            available: false,
            running: false,
            sameApp: false,
            compatible: false,
            conflict: 'other',
            message: error.message,
            baseUrl,
            host,
            port
        };
    }
}

async function fetchServiceStatus(baseUrl, timeout = 3000) {
    const response = await requestJson(`${baseUrl}/api/status`, timeout);
    if (!response.ok) {
        throw new Error(`Status request failed with HTTP ${response.statusCode}`);
    }
    return response.data;
}

module.exports = {
    checkPortAvailable,
    discoverService,
    fetchServiceStatus,
    isProtocolCompatible,
    requestJson
};
