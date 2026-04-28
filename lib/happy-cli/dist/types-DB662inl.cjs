'use strict';

var axios = require('axios');
var chalk = require('chalk');
var fs = require('fs');
var node_util = require('node:util');
var node_fs = require('node:fs');
var os = require('node:os');
var node_path = require('node:path');
var node_events = require('node:events');
var socket_ioClient = require('socket.io-client');
var z = require('zod');
var happyWire = require('@slopus/happy-wire');
var node_crypto = require('node:crypto');
var tweetnacl = require('tweetnacl');
var child_process = require('child_process');
var util = require('util');
var fs$1 = require('fs/promises');
var crypto = require('crypto');
var path = require('path');
var spawn = require('cross-spawn');
var url = require('url');
var os$1 = require('os');
var cuid2 = require('@paralleldrive/cuid2');
var expoServerSdk = require('expo-server-sdk');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
var name = "happy";
var version = "1.1.8-1";
var description = "Mobile and Web client for Claude Code and Codex";
var author = "Kirill Dubovitskiy";
var license = "MIT";
var type = "module";
var homepage = "https://happy.engineering";
var bugs = "https://github.com/slopus/happy/issues";
var repository = {
	type: "git",
	url: "https://github.com/slopus/happy"
};
var bin = {
	happy: "./bin/happy.mjs",
	"happy-mcp": "./bin/happy-mcp.mjs"
};
var main = "./dist/index.cjs";
var module$1 = "./dist/index.mjs";
var types = "./dist/index.d.cts";
var exports$1 = {
	".": {
		require: {
			types: "./dist/index.d.cts",
			"default": "./dist/index.cjs"
		},
		"import": {
			types: "./dist/index.d.mts",
			"default": "./dist/index.mjs"
		}
	},
	"./lib": {
		require: {
			types: "./dist/lib.d.cts",
			"default": "./dist/lib.cjs"
		},
		"import": {
			types: "./dist/lib.d.mts",
			"default": "./dist/lib.mjs"
		}
	},
	"./codex/happyMcpStdioBridge": {
		require: {
			types: "./dist/codex/happyMcpStdioBridge.d.cts",
			"default": "./dist/codex/happyMcpStdioBridge.cjs"
		},
		"import": {
			types: "./dist/codex/happyMcpStdioBridge.d.mts",
			"default": "./dist/codex/happyMcpStdioBridge.mjs"
		}
	}
};
var files = [
	"dist",
	"bin",
	"scripts",
	"tools",
	"package.json"
];
var scripts = {
	typecheck: "tsc --noEmit",
	build: "shx rm -rf dist && tsc --noEmit && pkgroll",
	test: "pnpm run build && vitest run",
	"cli:install": "node scripts/install-local.cjs",
	prepublishOnly: "pnpm test",
	postinstall: "node scripts/unpack-tools.cjs"
};
var dependencies = {
	"@agentclientprotocol/sdk": "^0.14.1",
	"@anthropic-ai/claude-agent-sdk": "^0.2.96",
	"@anthropic-ai/sandbox-runtime": "^0.0.37",
	"@modelcontextprotocol/sdk": "1.25.3",
	"@noble/ed25519": "^3.0.0",
	"@noble/hashes": "^2.0.1",
	"@paralleldrive/cuid2": "^2.2.2",
	"@slopus/happy-wire": "workspace:*",
	"@stablelib/base64": "^2.0.1",
	"@stablelib/hex": "^2.0.1",
	"@types/cross-spawn": "^6.0.6",
	"@types/http-proxy": "^1.17.17",
	"@types/qrcode-terminal": "^0.12.2",
	"@types/react": "^19.2.7",
	"@types/tmp": "^0.2.6",
	ai: "^5.0.107",
	axios: "^1.13.2",
	chalk: "^5.6.2",
	"cross-spawn": "^7.0.6",
	"expo-server-sdk": "^3.15.0",
	fastify: "^5.6.2",
	"fastify-type-provider-zod": "4.0.2",
	"http-proxy": "^1.18.1",
	"http-proxy-middleware": "^3.0.5",
	ink: "^6.5.1",
	inquirer: "^13.2.2",
	open: "^10.2.0",
	"ps-list": "^8.1.1",
	"qrcode-terminal": "^0.12.0",
	react: "^19.2.0",
	"socket.io-client": "^4.8.1",
	tar: "^7.5.2",
	tmp: "^0.2.5",
	tweetnacl: "^1.0.3",
	ws: "^8.19.0",
	zod: "3.25.76"
};
var devDependencies = {
	"@eslint/compat": "^1",
	"@types/inquirer": "^9.0.9",
	"@types/node": ">=20",
	"@types/ws": "^8.18.1",
	"cross-env": "^10.1.0",
	dotenv: "^16.6.1",
	eslint: "^9",
	"eslint-config-prettier": "^10",
	pkgroll: "^2.14.2",
	shx: "^0.3.3",
	"ts-node": "^10",
	tsx: "^4.20.6",
	typescript: "5.9.3",
	vitest: "^3.2.4"
};
var publishConfig = {
	registry: "https://registry.npmjs.org"
};
var packageManager = "pnpm@10.11.0";
var packageJson = {
	name: name,
	version: version,
	description: description,
	author: author,
	license: license,
	type: type,
	homepage: homepage,
	bugs: bugs,
	repository: repository,
	bin: bin,
	main: main,
	module: module$1,
	types: types,
	exports: exports$1,
	files: files,
	scripts: scripts,
	dependencies: dependencies,
	devDependencies: devDependencies,
	publishConfig: publishConfig,
	packageManager: packageManager
};

class Configuration {
  serverUrl;
  webappUrl;
  isDaemonProcess;
  // Directories and paths (from persistence)
  happyHomeDir;
  logsDir;
  settingsFile;
  privateKeyFile;
  daemonStateFile;
  daemonLockFile;
  sessionsFile;
  currentCliVersion;
  isExperimentalEnabled;
  disableCaffeinate;
  constructor() {
    this.serverUrl = process.env.HAPPY_SERVER_URL || "https://api.cluster-fluster.com";
    this.webappUrl = process.env.HAPPY_WEBAPP_URL || "https://app.happy.engineering";
    const args = process.argv.slice(2);
    this.isDaemonProcess = args.length >= 2 && args[0] === "daemon" && args[1] === "start-sync";
    if (process.env.HAPPY_HOME_DIR) {
      const expandedPath = process.env.HAPPY_HOME_DIR.replace(/^~/, os.homedir());
      this.happyHomeDir = expandedPath;
    } else {
      this.happyHomeDir = node_path.join(os.homedir(), ".happy");
    }
    this.logsDir = node_path.join(this.happyHomeDir, "logs");
    this.settingsFile = node_path.join(this.happyHomeDir, "settings.json");
    this.privateKeyFile = node_path.join(this.happyHomeDir, "access.key");
    this.daemonStateFile = node_path.join(this.happyHomeDir, "daemon.state.json");
    this.daemonLockFile = node_path.join(this.happyHomeDir, "daemon.state.json.lock");
    this.sessionsFile = node_path.join(this.happyHomeDir, "sessions.json");
    this.isExperimentalEnabled = ["true", "1", "yes"].includes(process.env.HAPPY_EXPERIMENTAL?.toLowerCase() || "");
    this.disableCaffeinate = ["true", "1", "yes"].includes(process.env.HAPPY_DISABLE_CAFFEINATE?.toLowerCase() || "");
    this.currentCliVersion = packageJson.version;
    const variant = process.env.HAPPY_VARIANT || "stable";
    if (!this.isDaemonProcess && variant === "dev") {
      console.log("\x1B[33m\u{1F527} DEV MODE\x1B[0m - Data: " + this.happyHomeDir);
    }
    if (!node_fs.existsSync(this.happyHomeDir)) {
      node_fs.mkdirSync(this.happyHomeDir, { recursive: true });
    }
    if (!node_fs.existsSync(this.logsDir)) {
      node_fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }
}
const configuration = new Configuration();

function createTimestampForFilename(date = /* @__PURE__ */ new Date()) {
  return date.toLocaleString("sv-SE", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).replace(/[: ]/g, "-").replace(/,/g, "") + "-pid-" + process.pid;
}
function createTimestampForLogEntry(date = /* @__PURE__ */ new Date()) {
  return date.toLocaleTimeString("en-US", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
}
function getSessionLogPath() {
  const timestamp = createTimestampForFilename();
  const filename = configuration.isDaemonProcess ? `${timestamp}-daemon.log` : `${timestamp}.log`;
  return node_path.join(configuration.logsDir, filename);
}
class Logger {
  constructor(logFilePath = getSessionLogPath()) {
    this.logFilePath = logFilePath;
    if (process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING && process.env.HAPPY_SERVER_URL) {
      this.dangerouslyUnencryptedServerLoggingUrl = process.env.HAPPY_SERVER_URL;
      console.log(chalk.yellow("[REMOTE LOGGING] Sending logs to server for AI debugging"));
    }
  }
  dangerouslyUnencryptedServerLoggingUrl;
  // Use local timezone for simplicity of locating the logs,
  // in practice you will not need absolute timestamps
  localTimezoneTimestamp() {
    return createTimestampForLogEntry();
  }
  debug(message, ...args) {
    this.logToFile(`[${this.localTimezoneTimestamp()}]`, message, ...args);
  }
  debugLargeJson(message, object, maxStringLength = 100, maxArrayLength = 10) {
    if (!process.env.DEBUG) {
      this.debug(`In production, skipping message inspection`);
    }
    const truncateStrings = (obj) => {
      if (typeof obj === "string") {
        return obj.length > maxStringLength ? obj.substring(0, maxStringLength) + "... [truncated for logs]" : obj;
      }
      if (Array.isArray(obj)) {
        const truncatedArray = obj.map((item) => truncateStrings(item)).slice(0, maxArrayLength);
        if (obj.length > maxArrayLength) {
          truncatedArray.push(`... [truncated array for logs up to ${maxArrayLength} items]`);
        }
        return truncatedArray;
      }
      if (obj && typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === "usage") {
            continue;
          }
          result[key] = truncateStrings(value);
        }
        return result;
      }
      return obj;
    };
    const truncatedObject = truncateStrings(object);
    const json = JSON.stringify(truncatedObject, null, 2);
    this.logToFile(`[${this.localTimezoneTimestamp()}]`, message, "\n", json);
  }
  info(message, ...args) {
    this.logToConsole("info", "", message, ...args);
    this.debug(message, args);
  }
  infoDeveloper(message, ...args) {
    this.debug(message, ...args);
    if (process.env.DEBUG) {
      this.logToConsole("info", "[DEV]", message, ...args);
    }
  }
  warn(message, ...args) {
    this.logToConsole("warn", "", message, ...args);
    this.debug(`[WARN] ${message}`, ...args);
  }
  getLogPath() {
    return this.logFilePath;
  }
  logToConsole(level, prefix, message, ...args) {
    switch (level) {
      case "debug": {
        console.log(chalk.gray(prefix), message, ...args);
        break;
      }
      case "error": {
        console.error(chalk.red(prefix), message, ...args);
        break;
      }
      case "info": {
        console.log(chalk.blue(prefix), message, ...args);
        break;
      }
      case "warn": {
        console.log(chalk.yellow(prefix), message, ...args);
        break;
      }
      default: {
        this.debug("Unknown log level:", level);
        console.log(chalk.blue(prefix), message, ...args);
        break;
      }
    }
  }
  async sendToRemoteServer(level, message, ...args) {
    if (!this.dangerouslyUnencryptedServerLoggingUrl) return;
    try {
      await fetch(this.dangerouslyUnencryptedServerLoggingUrl + "/logs-combined-from-cli-and-mobile-for-simple-ai-debugging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level,
          message: `${message} ${args.map(
            (a) => typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)
          ).join(" ")}`,
          source: "cli",
          platform: process.platform
        })
      });
    } catch (error) {
    }
  }
  logToFile(prefix, message, ...args) {
    const logLine = `${prefix} ${message} ${args.map(
      (arg) => typeof arg === "string" ? arg : node_util.inspect(arg, { depth: 5, breakLength: 120 })
    ).join(" ")}
`;
    if (this.dangerouslyUnencryptedServerLoggingUrl) {
      let level = "info";
      if (prefix.includes(this.localTimezoneTimestamp())) {
        level = "debug";
      }
      this.sendToRemoteServer(level, message, ...args).catch(() => {
      });
    }
    try {
      fs.appendFileSync(this.logFilePath, logLine);
    } catch (appendError) {
      if (process.env.DEBUG) {
        console.error("[DEV MODE ONLY THROWING] Failed to append to log file:", appendError);
        throw appendError;
      }
    }
  }
}
let logger = new Logger();
async function listDaemonLogFiles(limit = 50) {
  try {
    const logsDir = configuration.logsDir;
    if (!node_fs.existsSync(logsDir)) {
      return [];
    }
    const logs = node_fs.readdirSync(logsDir).filter((file) => file.endsWith("-daemon.log")).map((file) => {
      const fullPath = node_path.join(logsDir, file);
      const stats = node_fs.statSync(fullPath);
      return { file, path: fullPath, modified: stats.mtime };
    }).sort((a, b) => b.modified.getTime() - a.modified.getTime());
    try {
      const { readDaemonState } = await Promise.resolve().then(function () { return require('./persistence-CoLu_Clg.cjs'); });
      const state = await readDaemonState();
      if (!state) {
        return logs;
      }
      if (state.daemonLogPath && node_fs.existsSync(state.daemonLogPath)) {
        const stats = node_fs.statSync(state.daemonLogPath);
        const persisted = {
          file: node_path.basename(state.daemonLogPath),
          path: state.daemonLogPath,
          modified: stats.mtime
        };
        const idx = logs.findIndex((l) => l.path === persisted.path);
        if (idx >= 0) {
          const [found] = logs.splice(idx, 1);
          logs.unshift(found);
        } else {
          logs.unshift(persisted);
        }
      }
    } catch {
    }
    return logs.slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}
async function getLatestDaemonLog() {
  const [latest] = await listDaemonLogFiles(1);
  return latest || null;
}

z.z.object({
  host: z.z.string(),
  platform: z.z.string(),
  happyCliVersion: z.z.string(),
  homeDir: z.z.string(),
  happyHomeDir: z.z.string(),
  happyLibDir: z.z.string(),
  cliAvailability: z.z.object({
    claude: z.z.boolean(),
    codex: z.z.boolean(),
    gemini: z.z.boolean(),
    openclaw: z.z.boolean(),
    detectedAt: z.z.number()
  }).optional(),
  resumeSupport: z.z.object({
    rpcAvailable: z.z.boolean(),
    requiresSameMachine: z.z.boolean(),
    requiresHappyAgentAuth: z.z.boolean(),
    happyAgentAuthenticated: z.z.boolean(),
    detectedAt: z.z.number()
  }).optional()
});
z.z.object({
  status: z.z.union([
    z.z.enum(["running", "shutting-down"]),
    z.z.string()
    // Forward compatibility
  ]),
  pid: z.z.number().optional(),
  httpPort: z.z.number().optional(),
  startedAt: z.z.number().optional(),
  shutdownRequestedAt: z.z.number().optional(),
  shutdownSource: z.z.union([
    z.z.enum(["mobile-app", "cli", "os-signal", "unknown"]),
    z.z.string()
    // Forward compatibility
  ]).optional()
});
const MessageMetaSchema = z.z.object({
  sentFrom: z.z.string().optional(),
  // Source identifier
  permissionMode: z.z.enum(["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]).optional(),
  // Permission mode for this message
  model: z.z.string().nullable().optional(),
  // Model name for this message (null = reset)
  fallbackModel: z.z.string().nullable().optional(),
  // Fallback model for this message (null = reset)
  customSystemPrompt: z.z.string().nullable().optional(),
  // Custom system prompt for this message (null = reset)
  appendSystemPrompt: z.z.string().nullable().optional(),
  // Append to system prompt for this message (null = reset)
  allowedTools: z.z.array(z.z.string()).nullable().optional(),
  // Allowed tools for this message (null = reset)
  disallowedTools: z.z.array(z.z.string()).nullable().optional()
  // Disallowed tools for this message (null = reset)
});
z.z.object({
  session: z.z.object({
    id: z.z.string(),
    tag: z.z.string(),
    seq: z.z.number(),
    createdAt: z.z.number(),
    updatedAt: z.z.number(),
    metadata: z.z.string(),
    metadataVersion: z.z.number(),
    agentState: z.z.string().nullable(),
    agentStateVersion: z.z.number()
  })
});
const UserMessageSchema = z.z.object({
  role: z.z.literal("user"),
  content: z.z.object({
    type: z.z.literal("text"),
    text: z.z.string()
  }),
  localKey: z.z.string().optional(),
  // Mobile messages include this
  meta: MessageMetaSchema.optional()
});
const AgentMessageSchema = z.z.object({
  role: z.z.literal("agent"),
  content: z.z.object({
    type: z.z.literal("output"),
    data: z.z.any()
  }),
  meta: MessageMetaSchema.optional()
});
z.z.union([UserMessageSchema, AgentMessageSchema]);

function encodeBase64(buffer, variant = "base64") {
  if (variant === "base64url") {
    return encodeBase64Url(buffer);
  }
  return Buffer.from(buffer).toString("base64");
}
function encodeBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decodeBase64(base64, variant = "base64") {
  if (variant === "base64url") {
    const base64Standard = base64.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - base64.length % 4) % 4);
    return new Uint8Array(Buffer.from(base64Standard, "base64"));
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}
function getRandomBytes(size) {
  return new Uint8Array(node_crypto.randomBytes(size));
}
function libsodiumEncryptForPublicKey(data, recipientPublicKey) {
  const ephemeralKeyPair = tweetnacl.box.keyPair();
  const nonce = getRandomBytes(tweetnacl.box.nonceLength);
  const encrypted = tweetnacl.box(data, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);
  const result = new Uint8Array(ephemeralKeyPair.publicKey.length + nonce.length + encrypted.length);
  result.set(ephemeralKeyPair.publicKey, 0);
  result.set(nonce, ephemeralKeyPair.publicKey.length);
  result.set(encrypted, ephemeralKeyPair.publicKey.length + nonce.length);
  return result;
}
function encryptLegacy(data, secret) {
  const nonce = getRandomBytes(tweetnacl.secretbox.nonceLength);
  const encrypted = tweetnacl.secretbox(new TextEncoder().encode(JSON.stringify(data)), nonce, secret);
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}
function decryptLegacy(data, secret) {
  const nonce = data.slice(0, tweetnacl.secretbox.nonceLength);
  const encrypted = data.slice(tweetnacl.secretbox.nonceLength);
  const decrypted = tweetnacl.secretbox.open(encrypted, nonce, secret);
  if (!decrypted) {
    return null;
  }
  return JSON.parse(new TextDecoder().decode(decrypted));
}
function encryptWithDataKey(data, dataKey) {
  const nonce = getRandomBytes(12);
  const cipher = node_crypto.createCipheriv("aes-256-gcm", dataKey, nonce);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  const bundle = new Uint8Array(12 + encrypted.length + 16 + 1);
  bundle.set([0], 0);
  bundle.set(nonce, 1);
  bundle.set(new Uint8Array(encrypted), 13);
  bundle.set(new Uint8Array(authTag), 13 + encrypted.length);
  return bundle;
}
function decryptWithDataKey(bundle, dataKey) {
  if (bundle.length < 1) {
    return null;
  }
  if (bundle[0] !== 0) {
    return null;
  }
  if (bundle.length < 12 + 16 + 1) {
    return null;
  }
  const nonce = bundle.slice(1, 13);
  const authTag = bundle.slice(bundle.length - 16);
  const ciphertext = bundle.slice(13, bundle.length - 16);
  try {
    const decipher = node_crypto.createDecipheriv("aes-256-gcm", dataKey, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (error) {
    return null;
  }
}
function encrypt(key, variant, data) {
  if (variant === "legacy") {
    return encryptLegacy(data, key);
  } else {
    return encryptWithDataKey(data, key);
  }
}
function decrypt(key, variant, data) {
  if (variant === "legacy") {
    return decryptLegacy(data, key);
  } else {
    return decryptWithDataKey(data, key);
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function exponentialBackoffDelay(currentFailureCount, minDelay, maxDelay, maxFailureCount) {
  let maxDelayRet = minDelay + (maxDelay - minDelay) / maxFailureCount * Math.min(currentFailureCount, maxFailureCount);
  return Math.round(Math.random() * maxDelayRet);
}
function createBackoff(opts) {
  return async (callback) => {
    let currentFailureCount = 0;
    const minDelay = opts && opts.minDelay !== void 0 ? opts.minDelay : 250;
    const maxDelay = opts && opts.maxDelay !== void 0 ? opts.maxDelay : 1e3;
    const maxFailureCount = opts && opts.maxFailureCount !== void 0 ? opts.maxFailureCount : 50;
    while (true) {
      try {
        return await callback();
      } catch (e) {
        if (currentFailureCount < maxFailureCount) {
          currentFailureCount++;
        }
        if (opts && opts.onError) {
          opts.onError(e, currentFailureCount);
        }
        let waitForRequest = exponentialBackoffDelay(currentFailureCount, minDelay, maxDelay, maxFailureCount);
        await delay(waitForRequest);
      }
    }
  };
}
let backoff = createBackoff({
  onError: (e, failuresCount) => {
    logger.debug(`[BACKOFF] retry ${failuresCount}:`, e?.message || e);
  }
});

class AsyncLock {
  permits = 1;
  promiseResolverQueue = [];
  async inLock(func) {
    try {
      await this.lock();
      return await func();
    } finally {
      this.unlock();
    }
  }
  async lock() {
    if (this.permits > 0) {
      this.permits = this.permits - 1;
      return;
    }
    await new Promise((resolve) => this.promiseResolverQueue.push(resolve));
  }
  unlock() {
    this.permits += 1;
    if (this.permits > 1 && this.promiseResolverQueue.length > 0) {
      throw new Error("this.permits should never be > 0 when there is someone waiting.");
    } else if (this.permits === 1 && this.promiseResolverQueue.length > 0) {
      this.permits -= 1;
      const nextResolver = this.promiseResolverQueue.shift();
      if (nextResolver) {
        setTimeout(() => {
          nextResolver(true);
        }, 0);
      }
    }
  }
}

class RpcHandlerManager {
  handlers = /* @__PURE__ */ new Map();
  scopePrefix;
  encryptionKey;
  encryptionVariant;
  logger;
  socket = null;
  constructor(config) {
    this.scopePrefix = config.scopePrefix;
    this.encryptionKey = config.encryptionKey;
    this.encryptionVariant = config.encryptionVariant;
    this.logger = config.logger || ((msg, data) => logger.debug(msg, data));
  }
  /**
   * Register an RPC handler for a specific method
   * @param method - The method name (without prefix)
   * @param handler - The handler function
   */
  registerHandler(method, handler) {
    const prefixedMethod = this.getPrefixedMethod(method);
    this.handlers.set(prefixedMethod, handler);
    if (this.socket) {
      this.socket.emit("rpc-register", { method: prefixedMethod });
    }
  }
  unregisterHandler(method) {
    const prefixedMethod = this.getPrefixedMethod(method);
    this.handlers.delete(prefixedMethod);
    if (this.socket) {
      this.socket.emit("rpc-unregister", { method: prefixedMethod });
    }
  }
  /**
   * Handle an incoming RPC request
   * @param request - The RPC request data
   * @param callback - The response callback
   */
  async handleRequest(request) {
    try {
      const handler = this.handlers.get(request.method);
      if (!handler) {
        this.logger("[RPC] [ERROR] Method not found", { method: request.method });
        const errorResponse = { error: "Method not found" };
        const encryptedError = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, errorResponse));
        return encryptedError;
      }
      const decryptedParams = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(request.params));
      this.logger("[RPC] Calling handler", { method: request.method });
      const result = await handler(decryptedParams);
      this.logger("[RPC] Handler returned", { method: request.method, hasResult: result !== void 0 });
      const encryptedResponse = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, result));
      this.logger("[RPC] Sending encrypted response", { method: request.method, responseLength: encryptedResponse.length });
      return encryptedResponse;
    } catch (error) {
      this.logger("[RPC] [ERROR] Error handling request", { error });
      const errorResponse = {
        error: error instanceof Error ? error.message : "Unknown error"
      };
      return encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, errorResponse));
    }
  }
  onSocketConnect(socket) {
    this.socket = socket;
    for (const [prefixedMethod] of this.handlers) {
      socket.emit("rpc-register", { method: prefixedMethod });
    }
  }
  onSocketDisconnect() {
    this.socket = null;
  }
  /**
   * Get the number of registered handlers
   */
  getHandlerCount() {
    return this.handlers.size;
  }
  /**
   * Check if a handler is registered
   * @param method - The method name (without prefix)
   */
  hasHandler(method) {
    const prefixedMethod = this.getPrefixedMethod(method);
    return this.handlers.has(prefixedMethod);
  }
  /**
   * Clear all handlers
   */
  clearHandlers() {
    this.handlers.clear();
    this.logger("Cleared all RPC handlers");
  }
  /**
   * Get the prefixed method name
   * @param method - The method name
   */
  getPrefixedMethod(method) {
    return `${this.scopePrefix}:${method}`;
  }
}

const __dirname$1 = path.dirname(url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('types-DB662inl.cjs', document.baseURI).href))));
function projectPath() {
  const path$1 = path.resolve(__dirname$1, "..");
  return path$1;
}

function run$1(args, options) {
  const RUNNER_PATH = path.resolve(path.join(projectPath(), "scripts", "ripgrep_launcher.cjs"));
  return new Promise((resolve2, reject) => {
    const child = spawn.spawn("node", [RUNNER_PATH, JSON.stringify(args)], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options?.cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      resolve2({
        exitCode: code || 0,
        stdout,
        stderr
      });
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
}

function getBinaryPath() {
  const platformName = os$1.platform();
  const binaryName = platformName === "win32" ? "difft.exe" : "difft";
  return path.resolve(path.join(projectPath(), "tools", "unpacked", binaryName));
}
function run(args, options) {
  const binaryPath = getBinaryPath();
  return new Promise((resolve2, reject) => {
    const child = child_process.spawn(binaryPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: options?.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // Force color output when needed
        FORCE_COLOR: "1"
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("close", (code) => {
      resolve2({
        exitCode: code || 0,
        stdout,
        stderr
      });
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
}

function validatePath(targetPath, workingDirectory) {
  const resolvedTarget = path.resolve(workingDirectory, targetPath);
  const resolvedWorkingDir = path.resolve(workingDirectory);
  if (!resolvedTarget.startsWith(resolvedWorkingDir + path.sep) && resolvedTarget !== resolvedWorkingDir) {
    return {
      valid: false,
      resolvedPath: resolvedTarget,
      error: `Access denied: Path '${targetPath}' is outside the working directory`
    };
  }
  return { valid: true, resolvedPath: resolvedTarget };
}

const execAsync = util.promisify(child_process.exec);
function registerCommonHandlers(rpcHandlerManager, workingDirectory) {
  rpcHandlerManager.registerHandler("bash", async (data) => {
    logger.debug("Shell command request:", data.command);
    if (data.cwd && data.cwd !== "/") {
      const validation = validatePath(data.cwd, workingDirectory);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      data.cwd = validation.resolvedPath;
    }
    try {
      const options = {
        cwd: data.cwd === "/" ? void 0 : data.cwd,
        timeout: data.timeout || 3e4,
        // Default 30 seconds timeout
        windowsHide: true
        // Prevent cmd.exe popup on Windows for every RPC bash call
      };
      logger.debug("Shell command executing...", { cwd: options.cwd, timeout: options.timeout });
      const { stdout, stderr } = await execAsync(data.command, options);
      logger.debug("Shell command executed, processing result...");
      const result = {
        success: true,
        stdout: stdout ? stdout.toString() : "",
        stderr: stderr ? stderr.toString() : "",
        exitCode: 0
      };
      logger.debug("Shell command result:", {
        success: true,
        exitCode: 0,
        stdoutLen: result.stdout.length,
        stderrLen: result.stderr.length
      });
      return result;
    } catch (error) {
      const execError = error;
      if (execError.code === "ETIMEDOUT" || execError.killed) {
        const result2 = {
          success: false,
          stdout: execError.stdout || "",
          stderr: execError.stderr || "",
          exitCode: typeof execError.code === "number" ? execError.code : -1,
          error: "Command timed out"
        };
        logger.debug("Shell command timed out:", {
          success: false,
          exitCode: result2.exitCode,
          error: "Command timed out"
        });
        return result2;
      }
      const result = {
        success: false,
        stdout: execError.stdout ? execError.stdout.toString() : "",
        stderr: execError.stderr ? execError.stderr.toString() : execError.message || "Command failed",
        exitCode: typeof execError.code === "number" ? execError.code : 1,
        error: execError.message || "Command failed"
      };
      logger.debug("Shell command failed:", {
        success: false,
        exitCode: result.exitCode,
        error: result.error,
        stdoutLen: result.stdout.length,
        stderrLen: result.stderr.length
      });
      return result;
    }
  });
  rpcHandlerManager.registerHandler("readFile", async (data) => {
    logger.debug("Read file request:", data.path);
    const validation = validatePath(data.path, workingDirectory);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    try {
      const buffer = await fs$1.readFile(validation.resolvedPath);
      const content = buffer.toString("base64");
      return { success: true, content };
    } catch (error) {
      logger.debug("Failed to read file:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to read file" };
    }
  });
  rpcHandlerManager.registerHandler("writeFile", async (data) => {
    logger.debug("Write file request:", data.path);
    const validation = validatePath(data.path, workingDirectory);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    try {
      if (data.expectedHash !== null && data.expectedHash !== void 0) {
        try {
          const existingBuffer = await fs$1.readFile(validation.resolvedPath);
          const existingHash = crypto.createHash("sha256").update(existingBuffer).digest("hex");
          if (existingHash !== data.expectedHash) {
            return {
              success: false,
              error: `File hash mismatch. Expected: ${data.expectedHash}, Actual: ${existingHash}`
            };
          }
        } catch (error) {
          const nodeError = error;
          if (nodeError.code !== "ENOENT") {
            throw error;
          }
          return {
            success: false,
            error: "File does not exist but hash was provided"
          };
        }
      } else {
        try {
          await fs$1.stat(validation.resolvedPath);
          return {
            success: false,
            error: "File already exists but was expected to be new"
          };
        } catch (error) {
          const nodeError = error;
          if (nodeError.code !== "ENOENT") {
            throw error;
          }
        }
      }
      const buffer = Buffer.from(data.content, "base64");
      await fs$1.writeFile(validation.resolvedPath, buffer);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      return { success: true, hash };
    } catch (error) {
      logger.debug("Failed to write file:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to write file" };
    }
  });
  rpcHandlerManager.registerHandler("listDirectory", async (data) => {
    logger.debug("List directory request:", data.path);
    const validation = validatePath(data.path, workingDirectory);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    try {
      const directoryPath = validation.resolvedPath;
      const entries = await fs$1.readdir(directoryPath, { withFileTypes: true });
      const directoryEntries = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(directoryPath, entry.name);
          let type = "other";
          let size;
          let modified;
          if (entry.isDirectory()) {
            type = "directory";
          } else if (entry.isFile()) {
            type = "file";
          }
          try {
            const stats = await fs$1.stat(fullPath);
            size = stats.size;
            modified = stats.mtime.getTime();
          } catch (error) {
            logger.debug(`Failed to stat ${fullPath}:`, error);
          }
          return {
            name: entry.name,
            type,
            size,
            modified
          };
        })
      );
      directoryEntries.sort((a, b) => {
        if (a.type === "directory" && b.type !== "directory") return -1;
        if (a.type !== "directory" && b.type === "directory") return 1;
        return a.name.localeCompare(b.name);
      });
      return { success: true, entries: directoryEntries };
    } catch (error) {
      logger.debug("Failed to list directory:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to list directory" };
    }
  });
  rpcHandlerManager.registerHandler("getDirectoryTree", async (data) => {
    logger.debug("Get directory tree request:", data.path, "maxDepth:", data.maxDepth);
    const validation = validatePath(data.path, workingDirectory);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    async function buildTree(path$1, name, currentDepth) {
      try {
        const stats = await fs$1.stat(path$1);
        const node = {
          name,
          path: path$1,
          type: stats.isDirectory() ? "directory" : "file",
          size: stats.size,
          modified: stats.mtime.getTime()
        };
        if (stats.isDirectory() && currentDepth < data.maxDepth) {
          const entries = await fs$1.readdir(path$1, { withFileTypes: true });
          const children = [];
          await Promise.all(
            entries.map(async (entry) => {
              if (entry.isSymbolicLink()) {
                logger.debug(`Skipping symlink: ${path.join(path$1, entry.name)}`);
                return;
              }
              const childPath = path.join(path$1, entry.name);
              const childNode = await buildTree(childPath, entry.name, currentDepth + 1);
              if (childNode) {
                children.push(childNode);
              }
            })
          );
          children.sort((a, b) => {
            if (a.type === "directory" && b.type !== "directory") return -1;
            if (a.type !== "directory" && b.type === "directory") return 1;
            return a.name.localeCompare(b.name);
          });
          node.children = children;
        }
        return node;
      } catch (error) {
        logger.debug(`Failed to process ${path$1}:`, error instanceof Error ? error.message : String(error));
        return null;
      }
    }
    try {
      if (data.maxDepth < 0) {
        return { success: false, error: "maxDepth must be non-negative" };
      }
      const rootPath = validation.resolvedPath;
      const baseName = rootPath === "/" ? "/" : rootPath.split("/").pop() || rootPath;
      const tree = await buildTree(rootPath, baseName, 0);
      if (!tree) {
        return { success: false, error: "Failed to access the specified path" };
      }
      return { success: true, tree };
    } catch (error) {
      logger.debug("Failed to get directory tree:", error);
      return { success: false, error: error instanceof Error ? error.message : "Failed to get directory tree" };
    }
  });
  rpcHandlerManager.registerHandler("ripgrep", async (data) => {
    logger.debug("Ripgrep request with args:", data.args, "cwd:", data.cwd);
    if (data.cwd) {
      const validation = validatePath(data.cwd, workingDirectory);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      data.cwd = validation.resolvedPath;
    }
    try {
      const result = await run$1(data.args, { cwd: data.cwd });
      return {
        success: true,
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString()
      };
    } catch (error) {
      logger.debug("Failed to run ripgrep:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to run ripgrep"
      };
    }
  });
  rpcHandlerManager.registerHandler("difftastic", async (data) => {
    logger.debug("Difftastic request with args:", data.args, "cwd:", data.cwd);
    if (data.cwd) {
      const validation = validatePath(data.cwd, workingDirectory);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      data.cwd = validation.resolvedPath;
    }
    try {
      const result = await run(data.args, { cwd: data.cwd });
      return {
        success: true,
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString()
      };
    } catch (error) {
      logger.debug("Failed to run difftastic:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to run difftastic"
      };
    }
  });
}

const PRICING = {
  // --- Claude 4 & Future Models ---
  "claude-4.5-opus": {
    input: 5,
    output: 25,
    cache_write: 6.25,
    cache_read: 0.5
  },
  "claude-4.1-opus": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 1.5
  },
  "claude-4-opus": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 1.5
  },
  "claude-4.5-sonnet": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3
  },
  "claude-4-sonnet": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3
  },
  "claude-4.5-haiku": {
    input: 1,
    output: 5,
    cache_write: 1.25,
    cache_read: 0.1
  },
  // --- Legacy / Claude 3 ---
  "claude-3-opus-20240229": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 1.5
  },
  "claude-3-sonnet-20240229": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3
  },
  "claude-3-5-sonnet-20240620": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3
  },
  // New Sonnet 3.5 updated model
  "claude-3-5-sonnet-20241022": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
    cache_write: 0.3125,
    cache_read: 0.025
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4,
    cache_write: 1,
    // Approx based on 1.25x rule usually or custom
    cache_read: 0.08
  }
};
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
function calculateCost(usage, modelId) {
  let pricing = PRICING[modelId];
  if (!pricing) {
    if (modelId?.includes("opus")) {
      if (modelId.includes("4.5")) pricing = PRICING["claude-4.5-opus"];
      else if (modelId.includes("4.1")) pricing = PRICING["claude-4.1-opus"];
      else if (modelId.includes("4")) pricing = PRICING["claude-4-opus"];
      else pricing = PRICING["claude-3-opus-20240229"];
    } else if (modelId?.includes("sonnet")) {
      if (modelId.includes("4.5")) pricing = PRICING["claude-4.5-sonnet"];
      else if (modelId.includes("4")) pricing = PRICING["claude-4-sonnet"];
      else pricing = PRICING["claude-3-5-sonnet-20241022"];
    } else if (modelId?.includes("haiku")) {
      if (modelId.includes("4.5")) pricing = PRICING["claude-4.5-haiku"];
      else if (modelId.includes("3.5")) pricing = PRICING["claude-3-5-haiku-20241022"];
      else pricing = PRICING["claude-3-haiku-20240307"];
    } else pricing = PRICING[DEFAULT_MODEL];
  }
  const inputCost = usage.input_tokens / 1e6 * pricing.input;
  const outputCost = usage.output_tokens / 1e6 * pricing.output;
  const cacheWriteCost = (usage.cache_creation_input_tokens || 0) / 1e6 * pricing.cache_write;
  const cacheReadCost = (usage.cache_read_input_tokens || 0) / 1e6 * pricing.cache_read;
  const totalInputCost = inputCost + cacheWriteCost + cacheReadCost;
  return {
    total: totalInputCost + outputCost,
    input: totalInputCost,
    output: outputCost
  };
}

function hasNetworkConnectivity() {
  const interfaces = os$1.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (!iface.internal && iface.family === "IPv4") return true;
    }
  }
  return false;
}
function isLidClosed() {
  if (process.platform !== "darwin") return false;
  try {
    const output = child_process.execSync("ioreg -r -k AppleClamshellState -d 4", {
      timeout: 5e3,
      encoding: "utf-8"
    });
    return output.includes('"AppleClamshellState" = Yes');
  } catch {
    return false;
  }
}
function hasExternalDisplay() {
  if (process.platform !== "darwin") return false;
  try {
    const output = child_process.execSync("system_profiler SPDisplaysDataType -json 2>/dev/null", {
      timeout: 1e4,
      encoding: "utf-8"
    });
    const data = JSON.parse(output);
    const gpus = data.SPDisplaysDataType || [];
    for (const gpu of gpus) {
      const displays = gpu.spdisplays_ndrvs || [];
      for (const display of displays) {
        const isBuiltIn = display.spdisplays_builtin === "spdisplays_yes" || display.spdisplays_connection_type === "spdisplays_internal";
        if (!isBuiltIn) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
function shouldReconnect() {
  if (!hasNetworkConnectivity()) return false;
  if (isLidClosed() && !hasExternalDisplay()) return false;
  return true;
}

function isSubagentTool(name) {
  return name === "Task" || name === "Agent";
}
function shouldHideParentToolCall(name) {
  return name === "Task";
}
function pickProviderSubagent(message) {
  const raw = message;
  if (typeof raw.parent_tool_use_id === "string" && raw.parent_tool_use_id.length > 0) {
    return raw.parent_tool_use_id;
  }
  if (typeof raw.parentToolUseId === "string" && raw.parentToolUseId.length > 0) {
    return raw.parentToolUseId;
  }
  return void 0;
}
function getUuidToProviderSubagent(state) {
  if (!state.uuidToProviderSubagent) {
    state.uuidToProviderSubagent = /* @__PURE__ */ new Map();
  }
  return state.uuidToProviderSubagent;
}
function getTaskPromptToSubagents(state) {
  if (!state.taskPromptToSubagents) {
    state.taskPromptToSubagents = /* @__PURE__ */ new Map();
  }
  return state.taskPromptToSubagents;
}
function getProviderSubagentToSessionSubagent(state) {
  if (!state.providerSubagentToSessionSubagent) {
    state.providerSubagentToSessionSubagent = /* @__PURE__ */ new Map();
  }
  return state.providerSubagentToSessionSubagent;
}
function getSessionSubagentIdForProviderSubagent(state, providerSubagent) {
  return getProviderSubagentToSessionSubagent(state).get(providerSubagent);
}
function ensureSessionSubagentIdForProviderSubagent(state, providerSubagent) {
  const existing = getSessionSubagentIdForProviderSubagent(state, providerSubagent);
  if (existing) {
    return existing;
  }
  const created = cuid2.createId();
  getProviderSubagentToSessionSubagent(state).set(providerSubagent, created);
  return created;
}
function getSubagentTitles(state) {
  if (!state.subagentTitles) {
    state.subagentTitles = /* @__PURE__ */ new Map();
  }
  return state.subagentTitles;
}
function getBufferedSubagentMessages(state) {
  if (!state.bufferedSubagentMessages) {
    state.bufferedSubagentMessages = /* @__PURE__ */ new Map();
  }
  return state.bufferedSubagentMessages;
}
function getHiddenParentToolCalls(state) {
  if (!state.hiddenParentToolCalls) {
    state.hiddenParentToolCalls = /* @__PURE__ */ new Set();
  }
  return state.hiddenParentToolCalls;
}
function bufferSubagentMessage(state, subagent, message) {
  const buffer = getBufferedSubagentMessages(state);
  const queue = buffer.get(subagent) ?? [];
  queue.push(message);
  buffer.set(subagent, queue);
}
function consumeBufferedSubagentMessages(state, subagent) {
  const buffer = getBufferedSubagentMessages(state);
  const queue = buffer.get(subagent) ?? [];
  buffer.delete(subagent);
  return queue;
}
function getStartedSubagents(state) {
  if (!state.startedSubagents) {
    state.startedSubagents = /* @__PURE__ */ new Set();
  }
  return state.startedSubagents;
}
function getActiveSubagents(state) {
  if (!state.activeSubagents) {
    state.activeSubagents = /* @__PURE__ */ new Set();
  }
  return state.activeSubagents;
}
function pickUuid(message) {
  const raw = message;
  if (typeof raw.uuid === "string" && raw.uuid.length > 0) {
    return raw.uuid;
  }
  return void 0;
}
function pickParentUuid(message) {
  const raw = message;
  if (typeof raw.parentUuid === "string" && raw.parentUuid.length > 0) {
    return raw.parentUuid;
  }
  if (typeof raw.parentUUID === "string" && raw.parentUUID.length > 0) {
    return raw.parentUUID;
  }
  return void 0;
}
function isSidechainMessage(message) {
  const raw = message;
  return raw.isSidechain === true;
}
function normalizePrompt(prompt) {
  return prompt.trim();
}
function queueTaskPromptSubagent(state, prompt, subagent) {
  const normalized = normalizePrompt(prompt);
  if (normalized.length === 0) {
    return;
  }
  const promptMap = getTaskPromptToSubagents(state);
  const queue = promptMap.get(normalized) ?? [];
  if (!queue.includes(subagent)) {
    queue.push(subagent);
  }
  promptMap.set(normalized, queue);
}
function consumeTaskPromptSubagent(state, prompt) {
  const normalized = normalizePrompt(prompt);
  if (normalized.length === 0) {
    return void 0;
  }
  const promptMap = getTaskPromptToSubagents(state);
  const queue = promptMap.get(normalized);
  if (!queue || queue.length === 0) {
    return void 0;
  }
  const subagent = queue.shift();
  if (queue.length === 0) {
    promptMap.delete(normalized);
  }
  return subagent;
}
function consumeSinglePendingTaskSubagent(state) {
  const promptMap = getTaskPromptToSubagents(state);
  let candidateKey = null;
  let candidateSubagent = null;
  for (const [prompt, queue2] of promptMap.entries()) {
    if (queue2.length === 0) {
      continue;
    }
    if (candidateKey !== null) {
      return void 0;
    }
    candidateKey = prompt;
    candidateSubagent = queue2[0] ?? null;
  }
  if (!candidateKey || !candidateSubagent) {
    return void 0;
  }
  const queue = promptMap.get(candidateKey);
  if (!queue || queue.length === 0) {
    return void 0;
  }
  queue.shift();
  if (queue.length === 0) {
    promptMap.delete(candidateKey);
  }
  return candidateSubagent;
}
function pickSidechainRootPrompt(message) {
  if (message.type !== "user") {
    return void 0;
  }
  if (typeof message.message?.content === "string") {
    const normalized = normalizePrompt(message.message.content);
    return normalized.length > 0 ? normalized : void 0;
  }
  return void 0;
}
function resolveProviderSubagent(message, state) {
  const explicitSubagent = pickProviderSubagent(message);
  if (explicitSubagent) {
    return explicitSubagent;
  }
  const parentUuid = pickParentUuid(message);
  if (parentUuid) {
    const inheritedSubagent = getUuidToProviderSubagent(state).get(parentUuid);
    if (inheritedSubagent) {
      return inheritedSubagent;
    }
  }
  if (!isSidechainMessage(message)) {
    return void 0;
  }
  const prompt = pickSidechainRootPrompt(message);
  if (prompt) {
    const matchedSubagent = consumeTaskPromptSubagent(state, prompt);
    if (matchedSubagent) {
      return matchedSubagent;
    }
  }
  if (!parentUuid) {
    return consumeSinglePendingTaskSubagent(state);
  }
  return void 0;
}
function rememberSubagentForMessage(message, state, providerSubagent) {
  if (!providerSubagent) {
    return;
  }
  const uuid = pickUuid(message);
  if (!uuid) {
    return;
  }
  getUuidToProviderSubagent(state).set(uuid, providerSubagent);
}
function pickTaskPrompt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return void 0;
  }
  const prompt = input.prompt;
  if (typeof prompt !== "string") {
    return void 0;
  }
  const normalized = normalizePrompt(prompt);
  return normalized.length > 0 ? normalized : void 0;
}
function pickTaskTitle(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return void 0;
  }
  const candidateKeys = ["description", "title", "subagent_type"];
  for (const key of candidateKeys) {
    const value = input[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return void 0;
}
function setSubagentTitle(state, subagent, title) {
  if (!title || title.trim().length === 0) {
    return;
  }
  getSubagentTitles(state).set(subagent, title.trim());
}
function maybeEmitSubagentStart(state, turn, subagent, envelopes) {
  if (!subagent) {
    return;
  }
  const started = getStartedSubagents(state);
  if (started.has(subagent)) {
    return;
  }
  const title = getSubagentTitles(state).get(subagent);
  envelopes.push(happyWire.createEnvelope("agent", {
    t: "start",
    ...title ? { title } : {}
  }, { turn, subagent }));
  started.add(subagent);
  getActiveSubagents(state).add(subagent);
}
function maybeEmitSubagentStop(state, turn, subagent, envelopes) {
  const active = getActiveSubagents(state);
  if (!active.has(subagent)) {
    return;
  }
  envelopes.push(happyWire.createEnvelope("agent", { t: "stop" }, { turn, subagent }));
  active.delete(subagent);
}
function clearSubagentTracking(state) {
  getUuidToProviderSubagent(state).clear();
  getTaskPromptToSubagents(state).clear();
  getProviderSubagentToSessionSubagent(state).clear();
  getSubagentTitles(state).clear();
  getBufferedSubagentMessages(state).clear();
  getHiddenParentToolCalls(state).clear();
  getStartedSubagents(state).clear();
  getActiveSubagents(state).clear();
}
function ensureTurn(state, envelopes) {
  if (state.currentTurnId) {
    return state.currentTurnId;
  }
  const turnId = cuid2.createId();
  envelopes.push(happyWire.createEnvelope("agent", { t: "turn-start" }, { turn: turnId }));
  state.currentTurnId = turnId;
  return turnId;
}
function closeTurn(state, status, envelopes) {
  if (!state.currentTurnId) {
    return;
  }
  envelopes.push(happyWire.createEnvelope("agent", { t: "turn-end", status }, { turn: state.currentTurnId }));
  state.currentTurnId = null;
  clearSubagentTracking(state);
}
function toolTitle(name, input) {
  if (input && typeof input === "object") {
    const description = input.description;
    if (typeof description === "string" && description.trim().length > 0) {
      return description.length > 80 ? `${description.slice(0, 77)}...` : description;
    }
  }
  return `${name} call`;
}
function toToolArgs(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input;
  }
  if (input === void 0) {
    return {};
  }
  return { input };
}
function closeClaudeTurnWithStatus(state, status) {
  const envelopes = [];
  closeTurn(state, status, envelopes);
  return {
    currentTurnId: state.currentTurnId,
    envelopes
  };
}
function mapClaudeLogMessageToSessionEnvelopes(message, state) {
  return mapClaudeLogMessageToSessionEnvelopesInternal(message, state);
}
function mapClaudeLogMessageToSessionEnvelopesInternal(message, state) {
  const envelopes = [];
  const providerSubagent = resolveProviderSubagent(message, state);
  const subagent = providerSubagent ? getSessionSubagentIdForProviderSubagent(state, providerSubagent) : void 0;
  rememberSubagentForMessage(message, state, providerSubagent);
  if (providerSubagent && !subagent) {
    bufferSubagentMessage(state, providerSubagent, message);
    return {
      currentTurnId: state.currentTurnId,
      envelopes: []
    };
  }
  if (message.type === "summary") {
    return {
      currentTurnId: state.currentTurnId,
      envelopes
    };
  }
  if (message.type === "system") {
    return {
      currentTurnId: state.currentTurnId,
      envelopes
    };
  }
  if (message.type === "assistant") {
    const turnId = ensureTurn(state, envelopes);
    maybeEmitSubagentStart(state, turnId, subagent, envelopes);
    const blocks = Array.isArray(message.message?.content) ? message.message.content : [];
    for (const block of blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        envelopes.push(happyWire.createEnvelope("agent", { t: "text", text: block.text }, { turn: turnId, subagent }));
        continue;
      }
      if (block.type === "thinking" && typeof block.thinking === "string") {
        envelopes.push(happyWire.createEnvelope("agent", { t: "text", text: block.thinking, thinking: true }, { turn: turnId, subagent }));
        continue;
      }
      if (block.type === "tool_use") {
        const call = typeof block.id === "string" && block.id.length > 0 ? block.id : cuid2.createId();
        const name = typeof block.name === "string" && block.name.length > 0 ? block.name : "unknown";
        const baseArgs = toToolArgs(block.input);
        const title = toolTitle(name, block.input);
        const sessionSubagentForCall = ensureSessionSubagentIdForProviderSubagent(state, call);
        if (isSubagentTool(name)) {
          const prompt = pickTaskPrompt(block.input);
          if (prompt) {
            queueTaskPromptSubagent(state, prompt, call);
          }
          setSubagentTitle(state, sessionSubagentForCall, pickTaskTitle(block.input) ?? prompt);
        }
        if (shouldHideParentToolCall(name)) {
          getHiddenParentToolCalls(state).add(call);
          const buffered2 = consumeBufferedSubagentMessages(state, call);
          for (const bufferedMessage of buffered2) {
            const replay = mapClaudeLogMessageToSessionEnvelopesInternal(bufferedMessage, state);
            envelopes.push(...replay.envelopes);
          }
          continue;
        }
        const args = isSubagentTool(name) ? { ...baseArgs, sessionSubagent: sessionSubagentForCall } : baseArgs;
        envelopes.push(happyWire.createEnvelope("agent", {
          t: "tool-call-start",
          call,
          name,
          title,
          description: title,
          args
        }, { turn: turnId, subagent }));
        const buffered = consumeBufferedSubagentMessages(state, call);
        for (const bufferedMessage of buffered) {
          const replay = mapClaudeLogMessageToSessionEnvelopesInternal(bufferedMessage, state);
          envelopes.push(...replay.envelopes);
        }
      }
    }
    return {
      currentTurnId: state.currentTurnId,
      envelopes
    };
  }
  if (message.type === "user") {
    if (typeof message.message.content === "string") {
      if (message.isSidechain) {
        const turnId2 = ensureTurn(state, envelopes);
        maybeEmitSubagentStart(state, turnId2, subagent, envelopes);
        envelopes.push(happyWire.createEnvelope("agent", { t: "text", text: message.message.content }, { turn: turnId2, subagent }));
      } else {
        closeTurn(state, "completed", envelopes);
        envelopes.push(happyWire.createEnvelope("user", { t: "text", text: message.message.content }));
      }
      return {
        currentTurnId: state.currentTurnId,
        envelopes
      };
    }
    const blocks = Array.isArray(message.message.content) ? message.message.content : [];
    if (blocks.length === 0) {
      return {
        currentTurnId: state.currentTurnId,
        envelopes
      };
    }
    const turnId = ensureTurn(state, envelopes);
    if (message.isSidechain) {
      maybeEmitSubagentStart(state, turnId, subagent, envelopes);
    }
    for (const block of blocks) {
      if (block.type === "tool_result" && typeof block.tool_use_id === "string" && block.tool_use_id.length > 0) {
        const sessionSubagentForToolResult = getSessionSubagentIdForProviderSubagent(state, block.tool_use_id);
        if (!message.isSidechain) {
          if (getHiddenParentToolCalls(state).has(block.tool_use_id)) {
            if (sessionSubagentForToolResult) {
              maybeEmitSubagentStop(state, turnId, sessionSubagentForToolResult, envelopes);
            }
            getHiddenParentToolCalls(state).delete(block.tool_use_id);
            continue;
          }
          if (sessionSubagentForToolResult) {
            maybeEmitSubagentStop(state, turnId, sessionSubagentForToolResult, envelopes);
          }
        }
        envelopes.push(happyWire.createEnvelope("agent", {
          t: "tool-call-end",
          call: block.tool_use_id
        }, { turn: turnId, subagent }));
        continue;
      }
      if (block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
        envelopes.push(happyWire.createEnvelope("agent", { t: "text", text: block.text }, { turn: turnId, subagent }));
      }
    }
    return {
      currentTurnId: state.currentTurnId,
      envelopes
    };
  }
  return {
    currentTurnId: state.currentTurnId,
    envelopes
  };
}

class InvalidateSync {
  _invalidated = false;
  _invalidatedDouble = false;
  _stopped = false;
  _command;
  _pendings = [];
  constructor(command) {
    this._command = command;
  }
  invalidate() {
    if (this._stopped) {
      return;
    }
    if (!this._invalidated) {
      this._invalidated = true;
      this._invalidatedDouble = false;
      this._doSync();
    } else {
      if (!this._invalidatedDouble) {
        this._invalidatedDouble = true;
      }
    }
  }
  async invalidateAndAwait() {
    if (this._stopped) {
      return;
    }
    await new Promise((resolve) => {
      this._pendings.push(resolve);
      this.invalidate();
    });
  }
  stop() {
    if (this._stopped) {
      return;
    }
    this._notifyPendings();
    this._stopped = true;
  }
  _notifyPendings = () => {
    for (let pending of this._pendings) {
      pending();
    }
    this._pendings = [];
  };
  _doSync = async () => {
    await backoff(async () => {
      if (this._stopped) {
        return;
      }
      await this._command();
    });
    if (this._stopped) {
      this._notifyPendings();
      return;
    }
    if (this._invalidatedDouble) {
      this._invalidatedDouble = false;
      this._doSync();
    } else {
      this._invalidated = false;
      this._notifyPendings();
    }
  };
}

class ApiSessionClient extends node_events.EventEmitter {
  token;
  sessionId;
  metadata;
  metadataVersion;
  agentState;
  agentStateVersion;
  socket;
  pendingMessages = [];
  pendingMessageCallback = null;
  rpcHandlerManager;
  agentStateLock = new AsyncLock();
  metadataLock = new AsyncLock();
  encryptionKey;
  encryptionVariant;
  reconnectInterval = null;
  ignoreArchiveSignal = false;
  skipInitialMessages = false;
  claudeSessionProtocolState = {
    currentTurnId: null,
    uuidToProviderSubagent: /* @__PURE__ */ new Map(),
    taskPromptToSubagents: /* @__PURE__ */ new Map(),
    providerSubagentToSessionSubagent: /* @__PURE__ */ new Map(),
    subagentTitles: /* @__PURE__ */ new Map(),
    bufferedSubagentMessages: /* @__PURE__ */ new Map(),
    hiddenParentToolCalls: /* @__PURE__ */ new Set(),
    startedSubagents: /* @__PURE__ */ new Set(),
    activeSubagents: /* @__PURE__ */ new Set()
  };
  lastSeq = 0;
  pendingOutbox = [];
  sendSync;
  receiveSync;
  constructor(token, session) {
    super();
    this.token = token;
    this.sessionId = session.id;
    this.metadata = session.metadata;
    this.metadataVersion = session.metadataVersion;
    this.agentState = session.agentState;
    this.agentStateVersion = session.agentStateVersion;
    this.encryptionKey = session.encryptionKey;
    this.encryptionVariant = session.encryptionVariant;
    this.sendSync = new InvalidateSync(() => this.flushOutbox());
    this.receiveSync = new InvalidateSync(() => this.fetchMessages());
    this.rpcHandlerManager = new RpcHandlerManager({
      scopePrefix: this.sessionId,
      encryptionKey: this.encryptionKey,
      encryptionVariant: this.encryptionVariant,
      logger: (msg, data) => logger.debug(msg, data)
    });
    registerCommonHandlers(this.rpcHandlerManager, this.metadata.path);
    this.socket = socket_ioClient.io(configuration.serverUrl, {
      auth: {
        token: this.token,
        clientType: "session-scoped",
        sessionId: this.sessionId,
        happyClient: `cli-coding-session/${configuration.currentCliVersion}`
      },
      path: "/v1/updates",
      reconnection: false,
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false
    });
    this.socket.on("connect", () => {
      logger.debug("Socket connected successfully");
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
      this.rpcHandlerManager.onSocketConnect(this.socket);
      this.receiveSync.invalidate();
    });
    this.socket.on("rpc-request", async (data, callback) => {
      callback(await this.rpcHandlerManager.handleRequest(data));
    });
    this.socket.on("disconnect", (reason) => {
      logger.debug(`[API] Socket disconnected: ${reason}`);
      this.rpcHandlerManager.onSocketDisconnect();
      this.startSmartReconnect();
    });
    this.socket.on("connect_error", (error) => {
      logger.debug("[API] Socket connection error:", error);
      this.rpcHandlerManager.onSocketDisconnect();
    });
    this.socket.on("update", (data) => {
      try {
        logger.debugLargeJson("[SOCKET] [UPDATE] Received update:", data);
        if (!data.body) {
          logger.debug("[SOCKET] [UPDATE] [ERROR] No body in update!");
          return;
        }
        if (data.body.t === "new-message") {
          const messageSeq = data.body.message?.seq;
          if (this.lastSeq === 0) {
            this.receiveSync.invalidate();
            return;
          }
          if (typeof messageSeq !== "number" || messageSeq !== this.lastSeq + 1 || data.body.message.content.t !== "encrypted") {
            this.receiveSync.invalidate();
            return;
          }
          const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.message.content.c));
          logger.debugLargeJson("[SOCKET] [UPDATE] Received update:", body);
          this.routeIncomingMessage(body);
          this.lastSeq = messageSeq;
        } else if (data.body.t === "update-session") {
          if (data.body.metadata && data.body.metadata.version > this.metadataVersion) {
            this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.metadata.value));
            this.metadataVersion = data.body.metadata.version;
            const meta = this.metadata;
            if (meta?.lifecycleState === "archiveRequested" || meta?.lifecycleState === "archived") {
              if (this.ignoreArchiveSignal) {
                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}) but suppressed for reconnect`);
                this.ignoreArchiveSignal = false;
              } else {
                logger.debug(`[SOCKET] Session archived (${meta.lifecycleState}), exiting...`);
                this.emit("archived");
              }
            }
          }
          if (data.body.agentState && data.body.agentState.version > this.agentStateVersion) {
            this.agentState = data.body.agentState.value ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(data.body.agentState.value)) : null;
            this.agentStateVersion = data.body.agentState.version;
          }
        } else if (data.body.t === "update-machine") {
          logger.debug(`[SOCKET] WARNING: Session client received unexpected machine update - ignoring`);
        } else {
          this.emit("message", data.body);
        }
      } catch (error) {
        logger.debug("[SOCKET] [UPDATE] [ERROR] Error handling update", { error });
      }
    });
    this.socket.on("error", (error) => {
      logger.debug("[API] Socket error:", error);
    });
    this.socket.connect();
  }
  onUserMessage(callback) {
    this.pendingMessageCallback = callback;
    while (this.pendingMessages.length > 0) {
      callback(this.pendingMessages.shift());
    }
  }
  authHeaders() {
    return {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "X-Happy-Client": `cli-coding-session/${configuration.currentCliVersion}`
    };
  }
  routeIncomingMessage(message) {
    const userResult = UserMessageSchema.safeParse(message);
    if (userResult.success) {
      if (this.pendingMessageCallback) {
        this.pendingMessageCallback(userResult.data);
      } else {
        this.pendingMessages.push(userResult.data);
      }
      return;
    }
    this.emit("message", message);
  }
  async fetchMessages() {
    const skipRouting = this.skipInitialMessages;
    if (skipRouting) {
      this.skipInitialMessages = false;
      logger.debug("[API] Reconnect mode: skipping existing messages, advancing lastSeq");
    }
    let afterSeq = this.lastSeq;
    while (true) {
      const response = await axios.get(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
        {
          params: {
            after_seq: afterSeq,
            limit: 100
          },
          headers: this.authHeaders(),
          timeout: 6e4
        }
      );
      const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
      let maxSeq = afterSeq;
      for (const message of messages) {
        if (message.seq > maxSeq) {
          maxSeq = message.seq;
        }
        if (skipRouting) continue;
        if (message.content?.t !== "encrypted") {
          continue;
        }
        try {
          const body = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(message.content.c));
          this.routeIncomingMessage(body);
        } catch (error) {
          logger.debug("[API] Failed to decrypt fetched message", {
            sessionId: this.sessionId,
            seq: message.seq,
            error
          });
        }
      }
      this.lastSeq = Math.max(this.lastSeq, maxSeq);
      const hasMore = !!response.data.hasMore;
      if (hasMore && maxSeq === afterSeq) {
        logger.debug("[API] fetchMessages pagination stalled, stopping to avoid infinite loop", {
          sessionId: this.sessionId,
          afterSeq
        });
        break;
      }
      afterSeq = maxSeq;
      if (!hasMore) {
        break;
      }
    }
  }
  static MAX_OUTBOX_BATCH_SIZE = 50;
  async flushOutbox() {
    while (this.pendingOutbox.length > 0) {
      const batchSize = Math.min(this.pendingOutbox.length, ApiSessionClient.MAX_OUTBOX_BATCH_SIZE);
      const batchStart = this.pendingOutbox.length - batchSize;
      const batch = this.pendingOutbox.slice(batchStart);
      const response = await axios.post(
        `${configuration.serverUrl}/v3/sessions/${encodeURIComponent(this.sessionId)}/messages`,
        {
          messages: batch
        },
        {
          headers: this.authHeaders(),
          timeout: 6e4
        }
      );
      const messages = Array.isArray(response.data.messages) ? response.data.messages : [];
      const maxSeq = messages.reduce((acc, message) => message.seq > acc ? message.seq : acc, this.lastSeq);
      this.lastSeq = maxSeq;
      this.pendingOutbox.splice(batchStart, batch.length);
    }
  }
  enqueueMessage(content, invalidate = true) {
    const encrypted = encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, content));
    this.pendingOutbox.push({
      content: encrypted,
      localId: node_crypto.randomUUID()
    });
    if (invalidate) {
      this.sendSync.invalidate();
    }
  }
  /**
   * Send message to session
   * @param body - Message body (can be MessageContent or raw content for agent messages)
   */
  sendClaudeSessionMessage(body) {
    const mapped = mapClaudeLogMessageToSessionEnvelopes(body, this.claudeSessionProtocolState);
    this.claudeSessionProtocolState.currentTurnId = mapped.currentTurnId;
    for (const envelope of mapped.envelopes) {
      this.sendSessionProtocolMessage(envelope);
    }
    if (body.type === "assistant" && body.message?.usage) {
      try {
        this.sendUsageData(body.message.usage, body.message.model);
      } catch (error) {
        logger.debug("[SOCKET] Failed to send usage data:", error);
      }
    }
    if (body.type === "summary" && "summary" in body && "leafUuid" in body) {
      this.updateMetadata((metadata) => ({
        ...metadata,
        summary: {
          text: body.summary,
          updatedAt: Date.now()
        }
      }));
    }
  }
  closeClaudeSessionTurn(status = "completed") {
    const mapped = closeClaudeTurnWithStatus(this.claudeSessionProtocolState, status);
    this.claudeSessionProtocolState.currentTurnId = mapped.currentTurnId;
    for (const envelope of mapped.envelopes) {
      this.sendSessionProtocolMessage(envelope);
    }
  }
  sendCodexMessage(body) {
    let content = {
      role: "agent",
      content: {
        type: "codex",
        data: body
        // This wraps the entire Claude message
      },
      meta: {
        sentFrom: "cli"
      }
    };
    this.enqueueMessage(content);
  }
  enqueueSessionProtocolEnvelope(envelope, invalidate = true) {
    const content = {
      role: "session",
      content: envelope,
      meta: {
        sentFrom: "cli"
      }
    };
    this.enqueueMessage(content, invalidate);
  }
  sendSessionProtocolMessage(envelope) {
    if (envelope.role !== "user") {
      this.enqueueSessionProtocolEnvelope(envelope);
      return;
    }
    if (envelope.ev.t !== "text") {
      this.enqueueSessionProtocolEnvelope(envelope);
      return;
    }
    this.enqueueSessionProtocolEnvelope(envelope);
  }
  /**
   * Send a generic agent message to the session using ACP (Agent Communication Protocol) format.
   * Works for any agent type (Gemini, Codex, Claude, etc.) - CLI normalizes to unified ACP format.
   * 
   * @param provider - The agent provider sending the message (e.g., 'gemini', 'codex', 'claude')
   * @param body - The message payload (type: 'message' | 'reasoning' | 'tool-call' | 'tool-result')
   */
  sendAgentMessage(provider, body) {
    let content = {
      role: "agent",
      content: {
        type: "acp",
        provider,
        data: body
      },
      meta: {
        sentFrom: "cli"
      }
    };
    logger.debug(`[SOCKET] Sending ACP message from ${provider}:`, { type: body.type, hasMessage: "message" in body });
    this.enqueueMessage(content);
  }
  sendSessionEvent(event, id) {
    let content = {
      role: "agent",
      content: {
        id: id ?? node_crypto.randomUUID(),
        type: "event",
        data: event
      }
    };
    this.enqueueMessage(content);
  }
  /**
   * Send a ping message to keep the connection alive
   */
  keepAlive(thinking, mode) {
    if (process.env.DEBUG) {
      logger.debug(`[API] Sending keep alive message: ${thinking}`);
    }
    this.socket.volatile.emit("session-alive", {
      sid: this.sessionId,
      time: Date.now(),
      thinking,
      mode
    });
  }
  /**
   * Send session death message
   */
  sendSessionDeath() {
    this.socket.emit("session-end", { sid: this.sessionId, time: Date.now() });
  }
  /**
   * Send usage data to the server
   */
  sendUsageData(usage, model) {
    const totalTokens = usage.input_tokens + usage.output_tokens + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const costs = calculateCost(usage, model);
    const usageReport = {
      key: "claude-session",
      sessionId: this.sessionId,
      tokens: {
        total: totalTokens,
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache_creation: usage.cache_creation_input_tokens || 0,
        cache_read: usage.cache_read_input_tokens || 0
      },
      cost: {
        total: costs.total,
        input: costs.input,
        output: costs.output
      }
    };
    logger.debugLargeJson("[SOCKET] Sending usage data:", usageReport);
    this.socket.emit("usage-report", usageReport);
  }
  /**
   * Returns the latest session metadata known to the client.
   */
  getMetadata() {
    return this.metadata;
  }
  /**
   * Update session metadata
   * @param handler - Handler function that returns the updated metadata
   */
  suppressNextArchiveSignal() {
    this.ignoreArchiveSignal = true;
  }
  skipExistingMessages() {
    this.skipInitialMessages = true;
  }
  updateMetadata(handler) {
    this.metadataLock.inLock(async () => {
      await backoff(async () => {
        let updated = handler(this.metadata);
        const answer = await this.socket.emitWithAck("update-metadata", { sid: this.sessionId, expectedVersion: this.metadataVersion, metadata: encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)) });
        if (answer.result === "success") {
          this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
          this.metadataVersion = answer.version;
        } else if (answer.result === "version-mismatch") {
          if (answer.version > this.metadataVersion) {
            this.metadataVersion = answer.version;
            this.metadata = decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.metadata));
          }
          throw new Error("Metadata version mismatch");
        } else if (answer.result === "error") ;
      });
    });
  }
  /**
   * Update session agent state
   * @param handler - Handler function that returns the updated agent state
   */
  updateAgentState(handler) {
    logger.debugLargeJson("Updating agent state", this.agentState);
    this.agentStateLock.inLock(async () => {
      await backoff(async () => {
        let updated = handler(this.agentState || {});
        const answer = await this.socket.emitWithAck("update-state", { sid: this.sessionId, expectedVersion: this.agentStateVersion, agentState: updated ? encodeBase64(encrypt(this.encryptionKey, this.encryptionVariant, updated)) : null });
        if (answer.result === "success") {
          this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
          this.agentStateVersion = answer.version;
          logger.debug("Agent state updated", this.agentState);
        } else if (answer.result === "version-mismatch") {
          if (answer.version > this.agentStateVersion) {
            this.agentStateVersion = answer.version;
            this.agentState = answer.agentState ? decrypt(this.encryptionKey, this.encryptionVariant, decodeBase64(answer.agentState)) : null;
          }
          throw new Error("Agent state version mismatch");
        } else if (answer.result === "error") ;
      });
    });
  }
  /**
   * Wait for socket buffer to flush
   */
  async flush() {
    await Promise.race([
      this.sendSync.invalidateAndAwait(),
      delay(1e4)
    ]);
    if (!this.socket.connected) {
      return;
    }
    return new Promise((resolve) => {
      this.socket.emit("ping", () => {
        resolve();
      });
      setTimeout(() => {
        resolve();
      }, 1e4);
    });
  }
  async close() {
    logger.debug("[API] socket.close() called");
    this.sendSync.stop();
    this.receiveSync.stop();
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    this.socket.close();
  }
  startSmartReconnect() {
    if (this.reconnectInterval) return;
    this.reconnectInterval = setInterval(() => {
      if (this.socket.connected) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
        return;
      }
      if (!shouldReconnect()) {
        logger.debug("[API] Still not ready to reconnect");
        return;
      }
      logger.debug("[API] Attempting reconnect");
      this.socket.connect();
    }, 3e3);
    if (shouldReconnect()) {
      logger.debug("[API] Network up + lid open \u2014 reconnecting in 1s");
      setTimeout(() => {
        if (!this.socket.connected) this.socket.connect();
      }, 1e3);
    }
  }
}

function detectCLIAvailability() {
  const isWindows = os$1.platform() === "win32";
  if (isWindows) {
    return detectWindows();
  }
  return detectPosix();
}
function commandExists(command) {
  try {
    child_process.execSync(`command -v ${command} >/dev/null 2>&1`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function detectPosix() {
  const claude = commandExists("claude");
  const codex = commandExists("codex");
  const gemini = commandExists("gemini");
  const openclawCommand = commandExists("openclaw");
  const openclawConfig = fs.existsSync(path.join(os$1.homedir(), ".openclaw", "openclaw.json"));
  const openclawEnv = !!process.env.OPENCLAW_GATEWAY_URL;
  const openclaw = openclawCommand || openclawConfig || openclawEnv;
  return { claude, codex, gemini, openclaw, detectedAt: Date.now() };
}
function detectWindows() {
  const checkCommand = (name) => {
    try {
      child_process.execSync(`powershell -NoProfile -Command "Get-Command ${name} -ErrorAction SilentlyContinue"`, { stdio: "ignore", windowsHide: true });
      return true;
    } catch {
      return false;
    }
  };
  const claude = checkCommand("claude");
  const codex = checkCommand("codex");
  const gemini = checkCommand("gemini");
  const openclawCommand = checkCommand("openclaw");
  const openclawConfig = fs.existsSync(path.join(process.env.USERPROFILE || os$1.homedir(), ".openclaw", "openclaw.json"));
  const openclawEnv = !!process.env.OPENCLAW_GATEWAY_URL;
  const openclaw = openclawCommand || openclawConfig || openclawEnv;
  return { claude, codex, gemini, openclaw, detectedAt: Date.now() };
}

const AgentCredentialsSchema = z.z.object({
  token: z.z.string().min(1),
  secret: z.z.string().min(1)
});
function hmacSha512(key, data) {
  const hmac = node_crypto.createHmac("sha512", key);
  hmac.update(data);
  return new Uint8Array(hmac.digest());
}
function deriveKey(master, usage, path) {
  const root = hmacSha512(new TextEncoder().encode(`${usage} Master Seed`), master);
  let state = {
    key: root.slice(0, 32),
    chainCode: root.slice(32)
  };
  for (const index of path) {
    const data = new Uint8Array([0, ...new TextEncoder().encode(index)]);
    const derived = hmacSha512(state.chainCode, data);
    state = {
      key: derived.slice(0, 32),
      chainCode: derived.slice(32)
    };
  }
  return state.key;
}
function deriveContentKeyPair(secret) {
  const seed = deriveKey(secret, "Happy EnCoder", ["content"]);
  const hashedSeed = new Uint8Array(node_crypto.createHash("sha512").update(seed).digest());
  const secretKey = hashedSeed.slice(0, 32);
  const keyPair = tweetnacl.box.keyPair.fromSecretKey(secretKey);
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey
  };
}
function getLocalHappyAgentCredentialPath(happyHomeDir = configuration.happyHomeDir) {
  return node_path.join(happyHomeDir, "agent.key");
}
function readLocalHappyAgentCredentials(happyHomeDir = configuration.happyHomeDir) {
  const credentialPath = getLocalHappyAgentCredentialPath(happyHomeDir);
  if (!node_fs.existsSync(credentialPath)) {
    return null;
  }
  try {
    const parsed = AgentCredentialsSchema.parse(JSON.parse(node_fs.readFileSync(credentialPath, "utf8")));
    const secret = decodeBase64(parsed.secret);
    return {
      token: parsed.token,
      secret,
      contentKeyPair: deriveContentKeyPair(secret)
    };
  } catch {
    return null;
  }
}
function hasLocalHappyAgentAuth(happyHomeDir = configuration.happyHomeDir) {
  return readLocalHappyAgentCredentials(happyHomeDir) !== null;
}
function detectResumeSupport(happyHomeDir = configuration.happyHomeDir) {
  const happyAgentAuthenticated = hasLocalHappyAgentAuth(happyHomeDir);
  return {
    rpcAvailable: happyAgentAuthenticated,
    requiresSameMachine: true,
    requiresHappyAgentAuth: true,
    happyAgentAuthenticated,
    detectedAt: Date.now()
  };
}

class ApiMachineClient {
  constructor(token, machine) {
    this.token = token;
    this.machine = machine;
    this.rpcHandlerManager = new RpcHandlerManager({
      scopePrefix: this.machine.id,
      encryptionKey: this.machine.encryptionKey,
      encryptionVariant: this.machine.encryptionVariant,
      logger: (msg, data) => logger.debug(msg, data)
    });
    registerCommonHandlers(this.rpcHandlerManager, process.cwd());
  }
  socket;
  keepAliveInterval = null;
  lastKnownCLIAvailability = null;
  lastKnownResumeSupport = null;
  rpcHandlerManager;
  resumeSessionHandler = null;
  reconnectInterval = null;
  setRPCHandlers({
    spawnSession,
    resumeSession,
    stopSession,
    requestShutdown
  }) {
    this.resumeSessionHandler = resumeSession ?? null;
    this.rpcHandlerManager.registerHandler("spawn-happy-session", async (params) => {
      const { directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token } = params || {};
      logger.debug(`[API MACHINE] Spawning session with params: ${JSON.stringify(params)}`);
      if (!directory) {
        throw new Error("Directory is required");
      }
      const result = await spawnSession({ directory, sessionId, machineId, approvedNewDirectoryCreation, agent, environmentVariables, token });
      switch (result.type) {
        case "success":
          logger.debug(`[API MACHINE] Spawned session ${result.sessionId}`);
          return { type: "success", sessionId: result.sessionId };
        case "requestToApproveDirectoryCreation":
          logger.debug(`[API MACHINE] Requesting directory creation approval for: ${result.directory}`);
          return { type: "requestToApproveDirectoryCreation", directory: result.directory };
        case "error":
          throw new Error(result.errorMessage);
      }
    });
    this.syncResumeSessionRpcRegistration();
    this.rpcHandlerManager.registerHandler("stop-session", (params) => {
      const { sessionId } = params || {};
      if (!sessionId) {
        throw new Error("Session ID is required");
      }
      const success = stopSession(sessionId);
      if (!success) {
        throw new Error("Session not found or failed to stop");
      }
      logger.debug(`[API MACHINE] Stopped session ${sessionId}`);
      return { message: "Session stopped" };
    });
    this.rpcHandlerManager.registerHandler("stop-daemon", () => {
      logger.debug("[API MACHINE] Received stop-daemon RPC request");
      setTimeout(() => {
        logger.debug("[API MACHINE] Initiating daemon shutdown from RPC");
        requestShutdown();
      }, 100);
      return { message: "Daemon stop request acknowledged, starting shutdown sequence..." };
    });
  }
  syncResumeSessionRpcRegistration() {
    const method = "resume-happy-session";
    if (this.resumeSessionHandler) {
      if (!this.rpcHandlerManager.hasHandler(method)) {
        this.rpcHandlerManager.registerHandler(method, async (params) => {
          const { sessionId, model, permissionMode } = params || {};
          if (!sessionId || typeof sessionId !== "string") {
            throw new Error("Session ID is required");
          }
          const handler = this.resumeSessionHandler;
          if (!handler) {
            throw new Error("Resume session handler not available");
          }
          const result = await handler(sessionId, { model, permissionMode });
          switch (result.type) {
            case "success":
              return { type: "success", sessionId: result.sessionId };
            case "requestToApproveDirectoryCreation":
              return result;
            case "error":
              throw new Error(result.errorMessage);
          }
        });
      }
      return;
    }
    if (this.rpcHandlerManager.hasHandler(method)) {
      this.rpcHandlerManager.unregisterHandler(method);
    }
  }
  /**
   * Update machine metadata
   * Currently unused, changes from the mobile client are more likely
   * for example to set a custom name.
   */
  async updateMachineMetadata(handler) {
    await backoff(async () => {
      const updated = handler(this.machine.metadata);
      const answer = await this.socket.emitWithAck("machine-update-metadata", {
        machineId: this.machine.id,
        metadata: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
        expectedVersion: this.machine.metadataVersion
      });
      if (answer.result === "success") {
        this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
        this.machine.metadataVersion = answer.version;
        logger.debug("[API MACHINE] Metadata updated successfully");
      } else if (answer.result === "version-mismatch") {
        if (answer.version > this.machine.metadataVersion) {
          this.machine.metadataVersion = answer.version;
          this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.metadata));
        }
        throw new Error("Metadata version mismatch");
      }
    });
  }
  /**
   * Update daemon state (runtime info) - similar to session updateAgentState
   * Simplified without lock - relies on backoff for retry
   */
  async updateDaemonState(handler) {
    await backoff(async () => {
      const updated = handler(this.machine.daemonState);
      const answer = await this.socket.emitWithAck("machine-update-state", {
        machineId: this.machine.id,
        daemonState: encodeBase64(encrypt(this.machine.encryptionKey, this.machine.encryptionVariant, updated)),
        expectedVersion: this.machine.daemonStateVersion
      });
      if (answer.result === "success") {
        this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
        this.machine.daemonStateVersion = answer.version;
        logger.debug("[API MACHINE] Daemon state updated successfully");
      } else if (answer.result === "version-mismatch") {
        if (answer.version > this.machine.daemonStateVersion) {
          this.machine.daemonStateVersion = answer.version;
          this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(answer.daemonState));
        }
        throw new Error("Daemon state version mismatch");
      }
    });
  }
  connect() {
    const serverUrl = configuration.serverUrl.replace(/^http/, "ws");
    logger.debug(`[API MACHINE] Connecting to ${serverUrl}`);
    this.socket = socket_ioClient.io(serverUrl, {
      transports: ["websocket"],
      auth: {
        token: this.token,
        clientType: "machine-scoped",
        machineId: this.machine.id,
        happyClient: `cli-daemon/${configuration.currentCliVersion}`
      },
      path: "/v1/updates",
      reconnection: false
    });
    this.socket.on("connect", () => {
      logger.debug("[API MACHINE] Connected to server");
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
      this.updateDaemonState((state) => ({
        ...state,
        status: "running",
        pid: process.pid,
        httpPort: this.machine.daemonState?.httpPort,
        startedAt: Date.now()
      }));
      this.rpcHandlerManager.onSocketConnect(this.socket);
      this.syncResumeSessionRpcRegistration();
      this.startKeepAlive();
    });
    this.socket.on("disconnect", (reason) => {
      logger.debug(`[API MACHINE] Disconnected from server \u2014 reason: ${reason}`);
      this.rpcHandlerManager.onSocketDisconnect();
      this.stopKeepAlive();
      this.startSmartReconnect();
    });
    this.socket.on("rpc-request", async (data, callback) => {
      logger.debugLargeJson(`[API MACHINE] Received RPC request:`, data);
      callback(await this.rpcHandlerManager.handleRequest(data));
    });
    this.socket.on("update", (data) => {
      if (data.body.t === "update-machine" && data.body.machineId === this.machine.id) {
        const update = data.body;
        if (update.metadata) {
          logger.debug("[API MACHINE] Received external metadata update");
          this.machine.metadata = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.metadata.value));
          this.machine.metadataVersion = update.metadata.version;
        }
        if (update.daemonState) {
          logger.debug("[API MACHINE] Received external daemon state update");
          this.machine.daemonState = decrypt(this.machine.encryptionKey, this.machine.encryptionVariant, decodeBase64(update.daemonState.value));
          this.machine.daemonStateVersion = update.daemonState.version;
        }
      } else {
        logger.debug(`[API MACHINE] Received unknown update type: ${data.body.t}`);
      }
    });
    this.socket.on("connect_error", (error) => {
      logger.debug(`[API MACHINE] Connection error: ${error.message}`);
    });
    this.socket.io.on("error", (error) => {
      logger.debug("[API MACHINE] Socket error:", error);
    });
  }
  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      const payload = {
        machineId: this.machine.id,
        time: Date.now()
      };
      if (process.env.DEBUG) {
        logger.debugLargeJson(`[API MACHINE] Emitting machine-alive`, payload);
      }
      this.socket.emit("machine-alive", payload);
      const newAvailability = detectCLIAvailability();
      const prev = this.lastKnownCLIAvailability;
      const newResumeSupport = detectResumeSupport();
      const prevResume = this.lastKnownResumeSupport;
      const cliAvailabilityChanged = !prev || prev.claude !== newAvailability.claude || prev.codex !== newAvailability.codex || prev.gemini !== newAvailability.gemini || prev.openclaw !== newAvailability.openclaw;
      const resumeSupportChanged = !prevResume || prevResume.rpcAvailable !== newResumeSupport.rpcAvailable || prevResume.happyAgentAuthenticated !== newResumeSupport.happyAgentAuthenticated;
      if (cliAvailabilityChanged || resumeSupportChanged) {
        this.lastKnownCLIAvailability = newAvailability;
        this.lastKnownResumeSupport = newResumeSupport;
        this.updateMachineMetadata((metadata) => ({
          ...metadata || {},
          cliAvailability: newAvailability,
          resumeSupport: { ...newResumeSupport, rpcAvailable: !!this.resumeSessionHandler }
        })).catch((err) => {
          logger.debug("[API MACHINE] Failed to update machine capabilities:", err);
        });
      }
    }, 2e4);
    logger.debug("[API MACHINE] Keep-alive started (20s interval)");
  }
  startSmartReconnect() {
    if (this.reconnectInterval) return;
    this.reconnectInterval = setInterval(() => {
      if (this.socket.connected) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
        return;
      }
      if (!shouldReconnect()) {
        logger.debug("[API MACHINE] Still not ready to reconnect");
        return;
      }
      logger.debug("[API MACHINE] Attempting reconnect");
      this.socket.connect();
    }, 3e3);
    if (shouldReconnect()) {
      logger.debug("[API MACHINE] Network up + lid open \u2014 reconnecting in 1s");
      setTimeout(() => {
        if (!this.socket.connected) this.socket.connect();
      }, 1e3);
    }
  }
  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.debug("[API MACHINE] Keep-alive stopped");
    }
  }
  shutdown() {
    logger.debug("[API MACHINE] Shutting down");
    this.stopKeepAlive();
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.socket) {
      this.socket.close();
      logger.debug("[API MACHINE] Socket closed");
    }
  }
}

function getSessionTitle(metadata) {
  const summaryText = metadata?.summary?.text?.trim();
  if (summaryText) {
    return summaryText;
  }
  const path = metadata?.path?.trim();
  if (!path) {
    return "Session";
  }
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || "Session";
}
function getSessionNotificationUrl(data) {
  const sessionId = data?.sessionId;
  if (typeof sessionId !== "string") {
    return null;
  }
  const trimmedSessionId = sessionId.trim();
  if (!trimmedSessionId) {
    return null;
  }
  return `/session/${encodeURIComponent(trimmedSessionId)}`;
}
function getSessionNotificationTitle(kind) {
  switch (kind) {
    case "done":
      return "It's ready!";
    case "permission":
      return "Permission request";
    case "question":
      return "Clarification needed";
  }
}
function getSessionNotificationBody(metadata) {
  return getSessionTitle(metadata);
}
function getSessionNotificationCopy(kind, metadata) {
  return {
    title: getSessionNotificationTitle(kind),
    body: getSessionNotificationBody(metadata)
  };
}
class PushNotificationClient {
  token;
  baseUrl;
  expo;
  constructor(token, baseUrl = "https://api.cluster-fluster.com") {
    this.token = token;
    this.baseUrl = baseUrl;
    this.expo = new expoServerSdk.Expo();
  }
  /**
   * Fetch all push tokens for the authenticated user.
   * Retries up to 3 times with exponential backoff on transient errors.
   */
  async fetchPushTokens() {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/v1/push-tokens`,
          {
            headers: {
              "Authorization": `Bearer ${this.token}`,
              "Content-Type": "application/json",
              "X-Happy-Client": `cli-daemon/${configuration.currentCliVersion}`
            }
          }
        );
        logger.debug(`Fetched ${response.data.tokens.length} push tokens`);
        response.data.tokens.forEach((token, index) => {
          logger.debug(`[PUSH] Token ${index + 1}: id=${token.id}, created=${new Date(token.createdAt).toISOString()}, updated=${new Date(token.updatedAt).toISOString()}`);
        });
        return response.data.tokens;
      } catch (error) {
        logger.debug(`[PUSH] [ERROR] Failed to fetch push tokens (attempt ${attempt}/${maxAttempts}):`, error);
        if (attempt < maxAttempts) {
          const delay = 1e3 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    logger.debug("[PUSH] [ERROR] All push token fetch attempts failed");
    return [];
  }
  /**
   * Send push notification via Expo Push API with retry
   * @param messages - Array of push messages to send
   */
  async sendPushNotifications(messages) {
    logger.debug(`Sending ${messages.length} push notifications`);
    const validMessages = messages.filter((message) => {
      if (Array.isArray(message.to)) {
        return message.to.every((token) => expoServerSdk.Expo.isExpoPushToken(token));
      }
      return expoServerSdk.Expo.isExpoPushToken(message.to);
    });
    if (validMessages.length === 0) {
      logger.debug("No valid Expo push tokens found");
      return;
    }
    const chunks = this.expo.chunkPushNotifications(validMessages);
    for (const chunk of chunks) {
      const startTime = Date.now();
      const timeout = 3e5;
      let attempt = 0;
      while (true) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          const errors = ticketChunk.filter((ticket) => ticket.status === "error");
          if (errors.length > 0) {
            const errorDetails = errors.map((e) => ({ message: e.message, details: e.details }));
            logger.debug("[PUSH] Some notifications failed:", errorDetails);
          }
          if (errors.length === ticketChunk.length) {
            throw new Error("All push notifications in chunk failed");
          }
          break;
        } catch (error) {
          const elapsed = Date.now() - startTime;
          if (elapsed >= timeout) {
            logger.debug("[PUSH] Timeout reached after 5 minutes, giving up on chunk");
            break;
          }
          attempt++;
          const delay = Math.min(1e3 * Math.pow(2, attempt), 3e4);
          const remainingTime = timeout - elapsed;
          const waitTime = Math.min(delay, remainingTime);
          if (waitTime > 0) {
            logger.debug(`[PUSH] Retrying in ${waitTime}ms (attempt ${attempt})`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }
    }
    logger.debug(`Push notifications sent successfully`);
  }
  /**
   * Send a push notification to all registered devices for the user
   * @param title - Notification title
   * @param body - Notification body
   * @param data - Additional data to send with the notification
   */
  sendToAllDevices(title, body, data) {
    logger.debug(`[PUSH] sendToAllDevices called with title: "${title}", body: "${body ?? ""}"`);
    (async () => {
      try {
        logger.debug("[PUSH] Fetching push tokens...");
        const tokens = await this.fetchPushTokens();
        logger.debug(`[PUSH] Fetched ${tokens.length} push tokens`);
        tokens.forEach((token, index) => {
          logger.debug(`[PUSH] Using token ${index + 1}: id=${token.id}`);
        });
        if (tokens.length === 0) {
          logger.debug("No push tokens found for user");
          return;
        }
        const messages = tokens.map((token, index) => {
          logger.debug(`[PUSH] Creating message ${index + 1} for token`);
          return {
            to: token.token,
            title,
            body: body && body.length > 0 ? body : void 0,
            data,
            // TODO: For brutalist session artwork, attach rich media via a public HTTPS image URL.
            // Bundled app asset paths / require(...) / local file paths will not work in push payloads.
            // iOS also needs a Notification Service Extension to render richContent.image reliably.
            sound: "default",
            priority: "high"
          };
        });
        logger.debug(`[PUSH] Sending ${messages.length} push notifications...`);
        await this.sendPushNotifications(messages);
        logger.debug("[PUSH] Push notifications sent successfully");
      } catch (error) {
        logger.debug("[PUSH] Error sending to all devices:", error);
      }
    })();
  }
  sendSessionNotification(params) {
    const { title, body } = getSessionNotificationCopy(params.kind, params.metadata);
    const sessionTitle = getSessionNotificationBody(params.metadata);
    const url = getSessionNotificationUrl(params.data);
    this.sendToAllDevices(title, body, {
      ...params.data,
      kind: params.kind,
      sessionTitle,
      ...url ? { url } : {}
    });
  }
}

function startOfflineReconnection(config) {
  let reconnected = false;
  let session = null;
  let timeoutId = null;
  let failureCount = 0;
  let cancelled = false;
  const defaultHealthCheck = async () => {
    await axios.get(`${config.serverUrl}/v1/sessions`, {
      timeout: 5e3,
      validateStatus: (status) => status < 500,
      // 4xx = server is up, 5xx = server error
      headers: {
        "X-Happy-Client": `cli-daemon/${configuration.currentCliVersion}`
      }
    });
  };
  const healthCheck = config.healthCheck ?? defaultHealthCheck;
  const initialDelayMs = config.initialDelayMs ?? 5e3;
  const attemptReconnect = async () => {
    if (reconnected || cancelled) return;
    try {
      await healthCheck();
      if (cancelled) return;
      session = await config.onReconnected();
      if (cancelled) return;
      reconnected = true;
      config.onNotify("\u2705 Reconnected! Session syncing in background.");
      logger.debug("[OfflineReconnection] Successfully reconnected");
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        logger.debug("[OfflineReconnection] Authentication error, stopping retries");
        config.onNotify("\u274C Authentication failed. Please re-authenticate with `happy auth`.");
        return;
      }
      failureCount++;
      const delay = exponentialBackoffDelay(failureCount, 5e3, 6e4, 10);
      logger.debug(`[OfflineReconnection] Attempt ${failureCount} failed, retrying in ${delay}ms`);
      if (!cancelled) {
        timeoutId = setTimeout(attemptReconnect, delay);
      }
    }
  };
  timeoutId = setTimeout(attemptReconnect, initialDelayMs);
  return {
    cancel: () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      config.onCleanup?.();
    },
    getSession: () => session,
    isReconnected: () => reconnected
  };
}
const NETWORK_ERROR_CODES = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH"
];
function isNetworkError(code) {
  return code !== void 0 && NETWORK_ERROR_CODES.includes(code);
}
const ERROR_DESCRIPTIONS = {
  // Network errors (Node.js)
  ECONNREFUSED: "server not accepting connections",
  ENOTFOUND: "server hostname not found",
  ETIMEDOUT: "connection timed out",
  ECONNRESET: "connection reset by server",
  EHOSTUNREACH: "server host unreachable",
  ENETUNREACH: "network unreachable",
  // HTTP errors
  "401": "authentication failed - run `happy auth`",
  "403": "access forbidden",
  "404": "endpoint not found, check server deployment",
  "500": "server internal error",
  "502": "bad gateway",
  "503": "service unavailable"
};
class OfflineState {
  state = "online";
  failures = /* @__PURE__ */ new Map();
  // Dedupe by operation
  backend = "Claude";
  /** Report failure - accumulates context, prints once on first offline transition */
  fail(failure) {
    this.failures.set(failure.operation, failure);
    if (this.state === "online") {
      this.state = "offline";
      this.print();
    }
  }
  /** Reset on reconnection */
  recover() {
    this.state = "online";
    this.failures.clear();
  }
  /** Set backend name before API calls */
  setBackend(name) {
    this.backend = name;
  }
  /** Check current state */
  isOffline() {
    return this.state === "offline";
  }
  /** Reset for testing - clears all state */
  reset() {
    this.state = "online";
    this.failures.clear();
    this.backend = "Claude";
  }
  print() {
    const summary = [...this.failures.values()].map((f) => {
      const desc = f.errorCode ? `${f.errorCode} - ${ERROR_DESCRIPTIONS[f.errorCode] || "unknown error"}` : "unknown error";
      const url = f.url ? ` at ${f.url}` : "";
      return `${f.operation} failed: ${desc}${url}`;
    }).join("; ");
    console.log(`\u26A0\uFE0F  Happy server unreachable, offline mode with auto-reconnect enabled - error details: ${summary}`);
    const allDetails = [...this.failures.values()].flatMap((f) => f.details || []);
    allDetails.forEach((line) => console.log(chalk.yellow(`   \u2192 ${line}`)));
  }
}
const connectionState = new OfflineState();

class ApiClient {
  static async create(credential) {
    return new ApiClient(credential);
  }
  credential;
  pushClient;
  constructor(credential) {
    this.credential = credential;
    this.pushClient = new PushNotificationClient(credential.token, configuration.serverUrl);
  }
  /**
   * Create a new session or load existing one with the given tag
   */
  async getOrCreateSession(opts) {
    let dataEncryptionKey = null;
    let encryptionKey;
    let encryptionVariant;
    if (this.credential.encryption.type === "dataKey") {
      encryptionKey = getRandomBytes(32);
      encryptionVariant = "dataKey";
      let encryptedDataKey = libsodiumEncryptForPublicKey(encryptionKey, this.credential.encryption.publicKey);
      dataEncryptionKey = new Uint8Array(encryptedDataKey.length + 1);
      dataEncryptionKey.set([0], 0);
      dataEncryptionKey.set(encryptedDataKey, 1);
    } else {
      encryptionKey = this.credential.encryption.secret;
      encryptionVariant = "legacy";
    }
    try {
      const response = await axios.post(
        `${configuration.serverUrl}/v1/sessions`,
        {
          tag: opts.tag,
          metadata: encodeBase64(encrypt(encryptionKey, encryptionVariant, opts.metadata)),
          agentState: opts.state ? encodeBase64(encrypt(encryptionKey, encryptionVariant, opts.state)) : null,
          dataEncryptionKey: dataEncryptionKey ? encodeBase64(dataEncryptionKey) : null
        },
        {
          headers: {
            "Authorization": `Bearer ${this.credential.token}`,
            "Content-Type": "application/json",
            "X-Happy-Client": `cli-coding-session/${configuration.currentCliVersion}`
          },
          timeout: 6e4
          // 1 minute timeout for very bad network connections
        }
      );
      logger.debug(`Session created/loaded: ${response.data.session.id} (tag: ${opts.tag})`);
      let raw = response.data.session;
      let session = {
        id: raw.id,
        seq: raw.seq,
        metadata: decrypt(encryptionKey, encryptionVariant, decodeBase64(raw.metadata)),
        metadataVersion: raw.metadataVersion,
        agentState: raw.agentState ? decrypt(encryptionKey, encryptionVariant, decodeBase64(raw.agentState)) : null,
        agentStateVersion: raw.agentStateVersion,
        encryptionKey,
        encryptionVariant
      };
      return session;
    } catch (error) {
      logger.debug("[API] [ERROR] Failed to get or create session:", error);
      if (error && typeof error === "object" && "code" in error) {
        const errorCode = error.code;
        if (isNetworkError(errorCode)) {
          connectionState.fail({
            operation: "Session creation",
            caller: "api.getOrCreateSession",
            errorCode,
            url: `${configuration.serverUrl}/v1/sessions`
          });
          return null;
        }
      }
      const is404Error = axios.isAxiosError(error) && error.response?.status === 404 || error && typeof error === "object" && "response" in error && error.response?.status === 404;
      if (is404Error) {
        connectionState.fail({
          operation: "Session creation",
          errorCode: "404",
          url: `${configuration.serverUrl}/v1/sessions`
        });
        return null;
      }
      if (axios.isAxiosError(error) && error.response?.status) {
        const status = error.response.status;
        if (status >= 500) {
          connectionState.fail({
            operation: "Session creation",
            errorCode: String(status),
            url: `${configuration.serverUrl}/v1/sessions`,
            details: ["Server encountered an error, will retry automatically"]
          });
          return null;
        }
      }
      throw new Error(`Failed to get or create session: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Register or update machine with the server
   * Returns the current machine state from the server with decrypted metadata and daemonState
   */
  async getOrCreateMachine(opts) {
    let dataEncryptionKey = null;
    let encryptionKey;
    let encryptionVariant;
    if (this.credential.encryption.type === "dataKey") {
      encryptionVariant = "dataKey";
      encryptionKey = this.credential.encryption.machineKey;
      let encryptedDataKey = libsodiumEncryptForPublicKey(this.credential.encryption.machineKey, this.credential.encryption.publicKey);
      dataEncryptionKey = new Uint8Array(encryptedDataKey.length + 1);
      dataEncryptionKey.set([0], 0);
      dataEncryptionKey.set(encryptedDataKey, 1);
    } else {
      encryptionKey = this.credential.encryption.secret;
      encryptionVariant = "legacy";
    }
    const createMinimalMachine = () => ({
      id: opts.machineId,
      encryptionKey,
      encryptionVariant,
      metadata: opts.metadata,
      metadataVersion: 0,
      daemonState: opts.daemonState || null,
      daemonStateVersion: 0
    });
    try {
      const response = await axios.post(
        `${configuration.serverUrl}/v1/machines`,
        {
          id: opts.machineId,
          metadata: encodeBase64(encrypt(encryptionKey, encryptionVariant, opts.metadata)),
          daemonState: opts.daemonState ? encodeBase64(encrypt(encryptionKey, encryptionVariant, opts.daemonState)) : void 0,
          dataEncryptionKey: dataEncryptionKey ? encodeBase64(dataEncryptionKey) : void 0
        },
        {
          headers: {
            "Authorization": `Bearer ${this.credential.token}`,
            "Content-Type": "application/json",
            "X-Happy-Client": `cli-coding-session/${configuration.currentCliVersion}`
          },
          timeout: 6e4
          // 1 minute timeout for very bad network connections
        }
      );
      const raw = response.data.machine;
      logger.debug(`[API] Machine ${opts.machineId} registered/updated with server`);
      const machine = {
        id: raw.id,
        encryptionKey,
        encryptionVariant,
        metadata: raw.metadata ? decrypt(encryptionKey, encryptionVariant, decodeBase64(raw.metadata)) : null,
        metadataVersion: raw.metadataVersion || 0,
        daemonState: raw.daemonState ? decrypt(encryptionKey, encryptionVariant, decodeBase64(raw.daemonState)) : null,
        daemonStateVersion: raw.daemonStateVersion || 0
      };
      return machine;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code && isNetworkError(error.code)) {
        connectionState.fail({
          operation: "Machine registration",
          caller: "api.getOrCreateMachine",
          errorCode: error.code,
          url: `${configuration.serverUrl}/v1/machines`
        });
        return createMinimalMachine();
      }
      if (axios.isAxiosError(error) && error.response?.status) {
        const status = error.response.status;
        if (status === 403 || status === 409) {
          console.log(chalk.yellow(
            `\u26A0\uFE0F  Machine registration rejected by the server with status ${status}`
          ));
          console.log(chalk.yellow(
            `   \u2192 This machine ID is already registered to another account on the server`
          ));
          console.log(chalk.yellow(
            `   \u2192 This usually happens after re-authenticating with a different account`
          ));
          console.log(chalk.yellow(
            `   \u2192 Run 'happy doctor clean' to reset local state and generate a new machine ID`
          ));
          console.log(chalk.yellow(
            `   \u2192 Open a GitHub issue if this problem persists`
          ));
          return createMinimalMachine();
        }
        if (status >= 500) {
          connectionState.fail({
            operation: "Machine registration",
            errorCode: String(status),
            url: `${configuration.serverUrl}/v1/machines`,
            details: ["Server encountered an error, will retry automatically"]
          });
          return createMinimalMachine();
        }
        if (status === 404) {
          connectionState.fail({
            operation: "Machine registration",
            errorCode: "404",
            url: `${configuration.serverUrl}/v1/machines`
          });
          return createMinimalMachine();
        }
      }
      throw error;
    }
  }
  sessionSyncClient(session) {
    return new ApiSessionClient(this.credential.token, session);
  }
  machineSyncClient(machine) {
    return new ApiMachineClient(this.credential.token, machine);
  }
  push() {
    return this.pushClient;
  }
  /**
   * Register a vendor API token with the server
   * The token is sent as a JSON string - server handles encryption
   */
  async registerVendorToken(vendor, apiKey) {
    try {
      const response = await axios.post(
        `${configuration.serverUrl}/v1/connect/${vendor}/register`,
        {
          token: JSON.stringify(apiKey)
        },
        {
          headers: {
            "Authorization": `Bearer ${this.credential.token}`,
            "Content-Type": "application/json",
            "X-Happy-Client": `cli-coding-session/${configuration.currentCliVersion}`
          },
          timeout: 5e3
        }
      );
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Server returned status ${response.status}`);
      }
      logger.debug(`[API] Vendor token for ${vendor} registered successfully`);
    } catch (error) {
      logger.debug(`[API] [ERROR] Failed to register vendor token:`, error);
      throw new Error(`Failed to register vendor token: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Get vendor API token from the server
   * Returns the token if it exists, null otherwise
   */
  async getVendorToken(vendor) {
    try {
      const response = await axios.get(
        `${configuration.serverUrl}/v1/connect/${vendor}/token`,
        {
          headers: {
            "Authorization": `Bearer ${this.credential.token}`,
            "Content-Type": "application/json",
            "X-Happy-Client": `cli-coding-session/${configuration.currentCliVersion}`
          },
          timeout: 5e3
        }
      );
      if (response.status === 404) {
        logger.debug(`[API] No vendor token found for ${vendor}`);
        return null;
      }
      if (response.status !== 200) {
        throw new Error(`Server returned status ${response.status}`);
      }
      logger.debug(`[API] Raw vendor token response:`, {
        status: response.status,
        dataKeys: Object.keys(response.data || {}),
        hasToken: "token" in (response.data || {}),
        tokenType: typeof response.data?.token
      });
      let tokenData = null;
      if (response.data?.token) {
        if (typeof response.data.token === "string") {
          try {
            tokenData = JSON.parse(response.data.token);
          } catch (parseError) {
            logger.debug(`[API] Failed to parse token as JSON, using as string:`, parseError);
            tokenData = response.data.token;
          }
        } else if (response.data.token !== null) {
          tokenData = response.data.token;
        } else {
          logger.debug(`[API] Token is null for ${vendor}, treating as not found`);
          return null;
        }
      } else if (response.data && typeof response.data === "object") {
        if (response.data.token === null && Object.keys(response.data).length === 1) {
          logger.debug(`[API] Response contains only null token for ${vendor}, treating as not found`);
          return null;
        }
        tokenData = response.data;
      }
      if (tokenData === null || tokenData && typeof tokenData === "object" && tokenData.token === null && Object.keys(tokenData).length === 1) {
        logger.debug(`[API] Token data is null for ${vendor}`);
        return null;
      }
      logger.debug(`[API] Vendor token for ${vendor} retrieved successfully`, {
        tokenDataType: typeof tokenData,
        tokenDataKeys: tokenData && typeof tokenData === "object" ? Object.keys(tokenData) : "not an object"
      });
      return tokenData;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug(`[API] No vendor token found for ${vendor}`);
        return null;
      }
      logger.debug(`[API] [ERROR] Failed to get vendor token:`, error);
      return null;
    }
  }
}

var api = /*#__PURE__*/Object.freeze({
  __proto__: null,
  ApiClient: ApiClient
});

const UsageSchema = z.z.object({
  input_tokens: z.z.number().int().nonnegative(),
  cache_creation_input_tokens: z.z.number().int().nonnegative().optional(),
  cache_read_input_tokens: z.z.number().int().nonnegative().optional(),
  output_tokens: z.z.number().int().nonnegative(),
  service_tier: z.z.string().optional()
}).passthrough();
const RawJSONLinesSchema = z.z.discriminatedUnion("type", [
  // User message - validates uuid and message.content
  z.z.object({
    type: z.z.literal("user"),
    isSidechain: z.z.boolean().optional(),
    isMeta: z.z.boolean().optional(),
    uuid: z.z.string(),
    // Used in getMessageKey()
    message: z.z.object({
      content: z.z.union([z.z.string(), z.z.any()])
      // Used in sessionScanner.ts
    }).passthrough()
  }).passthrough(),
  // Assistant message - only validates uuid and type
  // message object is optional to handle synthetic error messages (isApiErrorMessage: true)
  // which may have different structure than normal assistant messages
  z.z.object({
    uuid: z.z.string(),
    type: z.z.literal("assistant"),
    message: z.z.object({
      usage: UsageSchema.optional(),
      // Used in apiSession.ts
      model: z.z.string().optional()
      // Used for cost calculation
    }).passthrough().optional()
  }).passthrough(),
  // Summary message - validates summary and leafUuid
  z.z.object({
    type: z.z.literal("summary"),
    summary: z.z.string(),
    // Used in apiSession.ts
    leafUuid: z.z.string()
    // Used in getMessageKey()
  }).passthrough(),
  // System message - validates uuid
  z.z.object({
    type: z.z.literal("system"),
    uuid: z.z.string()
    // Used in getMessageKey()
  }).passthrough()
]);

exports.ApiClient = ApiClient;
exports.ApiSessionClient = ApiSessionClient;
exports.AsyncLock = AsyncLock;
exports.InvalidateSync = InvalidateSync;
exports.RawJSONLinesSchema = RawJSONLinesSchema;
exports.api = api;
exports.configuration = configuration;
exports.connectionState = connectionState;
exports.decodeBase64 = decodeBase64;
exports.decrypt = decrypt;
exports.decryptLegacy = decryptLegacy;
exports.decryptWithDataKey = decryptWithDataKey;
exports.delay = delay;
exports.detectCLIAvailability = detectCLIAvailability;
exports.detectResumeSupport = detectResumeSupport;
exports.encodeBase64 = encodeBase64;
exports.encodeBase64Url = encodeBase64Url;
exports.getLatestDaemonLog = getLatestDaemonLog;
exports.getLocalHappyAgentCredentialPath = getLocalHappyAgentCredentialPath;
exports.logger = logger;
exports.packageJson = packageJson;
exports.projectPath = projectPath;
exports.readLocalHappyAgentCredentials = readLocalHappyAgentCredentials;
exports.startOfflineReconnection = startOfflineReconnection;
