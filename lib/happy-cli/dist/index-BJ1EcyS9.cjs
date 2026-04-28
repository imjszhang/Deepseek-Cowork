'use strict';

var chalk = require('chalk');
var os = require('node:os');
var node_crypto = require('node:crypto');
var api = require('./types-DB662inl.cjs');
var spawn = require('cross-spawn');
var node_path = require('node:path');
var node_readline = require('node:readline');
var node_fs = require('node:fs');
var sandboxRuntime = require('@anthropic-ai/sandbox-runtime');
var promises = require('node:fs/promises');
var fs = require('fs/promises');
var ink = require('ink');
var React = require('react');
var claudeAgentSdk = require('@anthropic-ai/claude-agent-sdk');
var axios = require('axios');
require('node:events');
require('socket.io-client');
var tweetnacl = require('tweetnacl');
var os$1 = require('os');
var child_process = require('child_process');
var cuid2 = require('@paralleldrive/cuid2');
var happyWire = require('@slopus/happy-wire');
var fs$1 = require('fs');
var path = require('path');
require('expo-server-sdk');
var node_child_process = require('node:child_process');
var persistence = require('./persistence-CoLu_Clg.cjs');
var crypto = require('crypto');
var psList = require('ps-list');
var tmp = require('tmp');
var qrcode = require('qrcode-terminal');
var open = require('open');
var fastify = require('fastify');
var z = require('zod');
var fastifyTypeProviderZod = require('fastify-type-provider-zod');
var mcp_js = require('@modelcontextprotocol/sdk/server/mcp.js');
var node_http = require('node:http');
var streamableHttp_js = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
var http = require('http');
var util = require('util');
var inquirer = require('inquirer');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var tmp__namespace = /*#__PURE__*/_interopNamespaceDefault(tmp);

class Session {
  path;
  logPath;
  api;
  client;
  queue;
  claudeEnvVars;
  claudeArgs;
  // Made mutable to allow filtering
  mcpServers;
  allowedTools;
  sandboxConfig;
  _onModeChange;
  /** Path to temporary settings file with SessionStart hook (required for session tracking) */
  hookSettingsPath;
  /** JavaScript runtime to use for spawning Claude Code (default: 'node') */
  jsRuntime;
  sessionId;
  mode = "local";
  thinking = false;
  /** Callbacks to be notified when session ID is found/changed */
  sessionFoundCallbacks = [];
  /** Keep alive interval reference for cleanup */
  keepAliveInterval;
  constructor(opts) {
    this.path = opts.path;
    this.api = opts.api;
    this.client = opts.client;
    this.logPath = opts.logPath;
    this.sessionId = opts.sessionId;
    this.queue = opts.messageQueue;
    this.claudeEnvVars = opts.claudeEnvVars;
    this.claudeArgs = opts.claudeArgs;
    this.mcpServers = opts.mcpServers;
    this.allowedTools = opts.allowedTools;
    this.sandboxConfig = opts.sandboxConfig;
    this._onModeChange = opts.onModeChange;
    this.hookSettingsPath = opts.hookSettingsPath;
    this.jsRuntime = opts.jsRuntime ?? "node";
    this.client.keepAlive(this.thinking, this.mode);
    this.keepAliveInterval = setInterval(() => {
      this.client.keepAlive(this.thinking, this.mode);
    }, 2e3);
  }
  /**
   * Cleanup resources (call when session is no longer needed)
   */
  cleanup = () => {
    clearInterval(this.keepAliveInterval);
    this.sessionFoundCallbacks = [];
    api.logger.debug("[Session] Cleaned up resources");
  };
  onThinkingChange = (thinking) => {
    this.thinking = thinking;
    this.client.keepAlive(thinking, this.mode);
  };
  onModeChange = (mode) => {
    this.mode = mode;
    this.client.keepAlive(this.thinking, mode);
    this._onModeChange(mode);
  };
  /**
   * Called when Claude session ID is discovered or changed.
   * 
   * This is triggered by the SessionStart hook when:
   * - Claude starts a new session (fresh start)
   * - Claude resumes a session (--continue, --resume flags)
   * - Claude forks a session (/compact, double-escape fork)
   * 
   * Updates internal state, syncs to API metadata, and notifies
   * all registered callbacks (e.g., SessionScanner) about the change.
   */
  onSessionFound = (sessionId) => {
    this.sessionId = sessionId;
    this.client.updateMetadata((metadata) => ({
      ...metadata,
      claudeSessionId: sessionId
    }));
    api.logger.debug(`[Session] Claude Code session ID ${sessionId} added to metadata`);
    for (const callback of this.sessionFoundCallbacks) {
      callback(sessionId);
    }
  };
  /**
   * Register a callback to be notified when session ID is found/changed
   */
  addSessionFoundCallback = (callback) => {
    this.sessionFoundCallbacks.push(callback);
  };
  /**
   * Remove a session found callback
   */
  removeSessionFoundCallback = (callback) => {
    const index = this.sessionFoundCallbacks.indexOf(callback);
    if (index !== -1) {
      this.sessionFoundCallbacks.splice(index, 1);
    }
  };
  /**
   * Clear the current session ID (used by /clear command)
   */
  clearSessionId = () => {
    this.sessionId = null;
    api.logger.debug("[Session] Session ID cleared");
  };
  /**
   * Consume one-time Claude flags from claudeArgs after Claude spawn
   * Handles: --resume (with or without session ID), --continue
   */
  consumeOneTimeFlags = () => {
    if (!this.claudeArgs) return;
    const filteredArgs = [];
    for (let i = 0; i < this.claudeArgs.length; i++) {
      const arg = this.claudeArgs[i];
      if (arg === "--continue") {
        api.logger.debug("[Session] Consumed --continue flag");
        continue;
      }
      if (arg === "--resume") {
        if (i + 1 < this.claudeArgs.length) {
          const nextArg = this.claudeArgs[i + 1];
          if (!nextArg.startsWith("-") && nextArg.includes("-")) {
            i++;
            api.logger.debug(`[Session] Consumed --resume flag with session ID: ${nextArg}`);
          } else {
            api.logger.debug("[Session] Consumed --resume flag (no session ID)");
          }
        } else {
          api.logger.debug("[Session] Consumed --resume flag (no session ID)");
        }
        continue;
      }
      filteredArgs.push(arg);
    }
    this.claudeArgs = filteredArgs.length > 0 ? filteredArgs : void 0;
    api.logger.debug(`[Session] Consumed one-time flags, remaining args:`, this.claudeArgs);
  };
}

function ensureLocalProxyBypass(env) {
  const existing = env.NO_PROXY ?? env.no_proxy ?? "";
  const entries = existing.split(",").map((s) => s.trim()).filter(Boolean);
  const toAdd = ["127.0.0.1", "localhost", "::1"].filter((h) => !entries.includes(h));
  if (toAdd.length === 0) return;
  const updated = existing ? `${existing},${toAdd.join(",")}` : toAdd.join(",");
  env.NO_PROXY = updated;
  env.no_proxy = updated;
}

function getProjectPath(workingDirectory) {
  const projectId = node_path.resolve(workingDirectory).replace(/[^a-zA-Z0-9-]/g, "-");
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || node_path.join(os.homedir(), ".claude");
  return node_path.join(claudeConfigDir, "projects", projectId);
}

function claudeCheckSession(sessionId, path) {
  const projectDir = getProjectPath(path);
  const sessionFile = node_path.join(projectDir, `${sessionId}.jsonl`);
  const sessionExists = node_fs.existsSync(sessionFile);
  if (!sessionExists) {
    api.logger.debug(`[claudeCheckSession] Path ${sessionFile} does not exist`);
    return false;
  }
  const sessionData = node_fs.readFileSync(sessionFile, "utf-8").split("\n");
  const hasGoodMessage = !!sessionData.find((v, index) => {
    if (!v.trim()) return false;
    try {
      const parsed = JSON.parse(v);
      return typeof parsed.uuid === "string" && parsed.uuid.length > 0 || // Claude Code 2.1.x
      typeof parsed.messageId === "string" && parsed.messageId.length > 0 || // Older Claude Code
      typeof parsed.leafUuid === "string" && parsed.leafUuid.length > 0;
    } catch (e) {
      api.logger.debug(`[claudeCheckSession] Malformed JSON at line ${index + 1}:`, e);
      return false;
    }
  });
  api.logger.debug(`[claudeCheckSession] Session ${sessionId}: ${hasGoodMessage ? "valid" : "invalid"}`);
  return hasGoodMessage;
}

function claudeFindLastSession(workingDirectory) {
  try {
    const projectDir = getProjectPath(workingDirectory);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const files = node_fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl")).map((f) => {
      const sessionId = f.replace(".jsonl", "");
      if (!uuidPattern.test(sessionId)) {
        return null;
      }
      if (claudeCheckSession(sessionId, workingDirectory)) {
        return {
          name: f,
          sessionId,
          mtime: node_fs.statSync(node_path.join(projectDir, f)).mtime.getTime()
        };
      }
      return null;
    }).filter((f) => f !== null).sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].sessionId : null;
  } catch (e) {
    api.logger.debug("[claudeFindLastSession] Error finding sessions:", e);
    return null;
  }
}

function trimIdent(text) {
  const lines = text.split("\n");
  while (lines.length > 0 && lines[0].trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  const minSpaces = lines.reduce((min, line) => {
    if (line.trim() === "") {
      return min;
    }
    const leadingSpaces = line.match(/^\s*/)[0].length;
    return Math.min(min, leadingSpaces);
  }, Infinity);
  const trimmedLines = lines.map((line) => line.slice(minSpaces));
  return trimmedLines.join("\n");
}

function getClaudeSettingsPath() {
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || node_path.join(os.homedir(), ".claude");
  return node_path.join(claudeConfigDir, "settings.json");
}
function readClaudeSettings() {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!node_fs.existsSync(settingsPath)) {
      api.logger.debug(`[ClaudeSettings] No Claude settings file found at ${settingsPath}`);
      return null;
    }
    const settingsContent = node_fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(settingsContent);
    api.logger.debug(`[ClaudeSettings] Successfully read Claude settings from ${settingsPath}`);
    api.logger.debug(`[ClaudeSettings] includeCoAuthoredBy: ${settings.includeCoAuthoredBy}`);
    return settings;
  } catch (error) {
    api.logger.debug(`[ClaudeSettings] Error reading Claude settings: ${error}`);
    return null;
  }
}
function shouldIncludeCoAuthoredBy() {
  const settings = readClaudeSettings();
  if (!settings || settings.includeCoAuthoredBy === void 0) {
    return true;
  }
  return settings.includeCoAuthoredBy;
}

const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    ALWAYS when you start a new chat - you must call a tool "mcp__happy__change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a change to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.
`))();
const CO_AUTHORED_CREDITS = (() => trimIdent(`
    When making commit messages, instead of just giving co-credit to Claude, also give credit to Happy like so:

    <main commit message>

    Generated with [Claude Code](https://claude.ai/code)
    via [Happy](https://happy.engineering)

    Co-Authored-By: Claude <noreply@anthropic.com>
    Co-Authored-By: Happy <yesreply@happy.engineering>
`))();
const systemPrompt = (() => {
  const includeCoAuthored = shouldIncludeCoAuthoredBy();
  if (includeCoAuthored) {
    return BASE_SYSTEM_PROMPT + "\n\n" + CO_AUTHORED_CREDITS;
  } else {
    return BASE_SYSTEM_PROMPT;
  }
})();

function expandPath(pathValue, sessionPath) {
  const expandedHome = pathValue.replace(/^~(?=\/|$)/, os.homedir());
  if (node_path.isAbsolute(expandedHome)) {
    return expandedHome;
  }
  return node_path.resolve(sessionPath, expandedHome);
}
function resolvePaths(paths, sessionPath) {
  return paths.map((pathValue) => expandPath(pathValue, sessionPath));
}
function getSharedAgentStatePaths(sessionPath) {
  const codexHome = process.env.CODEX_HOME || "~/.codex";
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || "~/.claude";
  return [
    expandPath(codexHome, sessionPath),
    expandPath(claudeConfigDir, sessionPath)
  ];
}
function uniquePaths(paths) {
  return [...new Set(paths)];
}
function buildSandboxRuntimeConfig(sandboxConfig, sessionPath) {
  const extraWritePaths = resolvePaths(sandboxConfig.extraWritePaths, sessionPath);
  const sharedAgentStatePaths = getSharedAgentStatePaths(sessionPath);
  const allowWrite = (() => {
    switch (sandboxConfig.sessionIsolation) {
      case "strict":
        return uniquePaths([node_path.resolve(sessionPath), ...extraWritePaths, ...sharedAgentStatePaths]);
      case "workspace": {
        const workspaceRoot = sandboxConfig.workspaceRoot ? expandPath(sandboxConfig.workspaceRoot, sessionPath) : node_path.resolve(sessionPath);
        return uniquePaths([workspaceRoot, node_path.resolve(sessionPath), ...extraWritePaths, ...sharedAgentStatePaths]);
      }
      case "custom":
        return uniquePaths([
          ...resolvePaths(sandboxConfig.customWritePaths, sessionPath),
          ...extraWritePaths,
          ...sharedAgentStatePaths
        ]);
    }
  })();
  const network = (() => {
    switch (sandboxConfig.networkMode) {
      case "blocked":
        return {
          allowedDomains: [],
          deniedDomains: [],
          allowLocalBinding: sandboxConfig.allowLocalBinding,
          allowUnixSockets: []
        };
      case "allowed":
        return {
          allowedDomains: void 0,
          deniedDomains: [],
          allowLocalBinding: sandboxConfig.allowLocalBinding,
          allowUnixSockets: []
        };
      case "custom":
        return {
          allowedDomains: sandboxConfig.allowedDomains,
          deniedDomains: sandboxConfig.deniedDomains,
          allowLocalBinding: sandboxConfig.allowLocalBinding,
          allowUnixSockets: []
        };
    }
  })();
  const enableWeakerNetworkIsolation = sandboxConfig.networkMode === "allowed" ? true : void 0;
  return {
    allowPty: true,
    enableWeakerNetworkIsolation,
    network,
    filesystem: {
      denyRead: resolvePaths(sandboxConfig.denyReadPaths, sessionPath),
      allowWrite,
      denyWrite: resolvePaths(sandboxConfig.denyWritePaths, sessionPath)
    }
  };
}

async function initializeSandbox(sandboxConfig, sessionPath) {
  const runtimeConfig = buildSandboxRuntimeConfig(sandboxConfig, sessionPath);
  await sandboxRuntime.SandboxManager.initialize(runtimeConfig);
  return async () => {
    await sandboxRuntime.SandboxManager.reset();
  };
}
async function wrapCommand(command) {
  return sandboxRuntime.SandboxManager.wrapWithSandbox(command);
}
async function wrapForMcpTransport(command, args) {
  const wrappedCommand = await wrapCommand(`${command} ${args.join(" ")}`.trim());
  return {
    command: "sh",
    args: ["-c", wrappedCommand]
  };
}

class ExitCodeError extends Error {
  exitCode;
  constructor(exitCode) {
    super(`Process exited with code: ${exitCode}`);
    this.name = "ExitCodeError";
    this.exitCode = exitCode;
  }
}
const claudeCliPath = node_path.resolve(node_path.join(api.projectPath(), "scripts", "claude_local_launcher.cjs"));
function quoteShellArg(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
async function claudeLocal(opts) {
  const projectDir = getProjectPath(opts.path);
  node_fs.mkdirSync(projectDir, { recursive: true });
  const hasContinueFlag = opts.claudeArgs?.includes("--continue");
  const hasResumeFlag = opts.claudeArgs?.includes("--resume");
  const hasUserSessionControl = hasContinueFlag || hasResumeFlag;
  let startFrom = opts.sessionId;
  const extractFlag = (flags, withValue = false) => {
    if (!opts.claudeArgs) return { found: false };
    for (const flag of flags) {
      const index = opts.claudeArgs.indexOf(flag);
      if (index !== -1) {
        if (withValue && index + 1 < opts.claudeArgs.length) {
          const nextArg = opts.claudeArgs[index + 1];
          if (!nextArg.startsWith("-")) {
            const value = nextArg;
            opts.claudeArgs = opts.claudeArgs.filter((_, i) => i !== index && i !== index + 1);
            return { found: true, value };
          }
        }
        if (!withValue) {
          opts.claudeArgs = opts.claudeArgs.filter((_, i) => i !== index);
          return { found: true };
        }
        return { found: false };
      }
    }
    return { found: false };
  };
  const sessionIdFlag = extractFlag(["--session-id"], true);
  if (sessionIdFlag.found && sessionIdFlag.value) {
    startFrom = null;
    api.logger.debug(`[ClaudeLocal] Using explicit --session-id: ${sessionIdFlag.value}`);
  }
  if (!startFrom && !sessionIdFlag.value) {
    const resumeFlag = extractFlag(["--resume", "-r"], true);
    if (resumeFlag.found) {
      if (resumeFlag.value) {
        startFrom = resumeFlag.value;
        api.logger.debug(`[ClaudeLocal] Using provided session ID from --resume: ${startFrom}`);
      } else {
        const lastSession = claudeFindLastSession(opts.path);
        if (lastSession) {
          startFrom = lastSession;
          api.logger.debug(`[ClaudeLocal] --resume: Found last session: ${lastSession}`);
        }
      }
    }
  }
  if (!startFrom && !sessionIdFlag.value) {
    const continueFlag = extractFlag(["--continue", "-c"], false);
    if (continueFlag.found) {
      const lastSession = claudeFindLastSession(opts.path);
      if (lastSession) {
        startFrom = lastSession;
        api.logger.debug(`[ClaudeLocal] --continue: Found last session: ${lastSession}`);
      }
    }
  }
  const explicitSessionId = sessionIdFlag.value || null;
  let newSessionId = null;
  let effectiveSessionId = startFrom;
  if (!opts.hookSettingsPath) {
    newSessionId = startFrom ? null : explicitSessionId || node_crypto.randomUUID();
    effectiveSessionId = startFrom || newSessionId;
    if (startFrom) {
      api.logger.debug(`[ClaudeLocal] Resuming session: ${startFrom}`);
      opts.onSessionFound(startFrom);
    } else if (explicitSessionId) {
      api.logger.debug(`[ClaudeLocal] Using explicit session ID: ${explicitSessionId}`);
      opts.onSessionFound(explicitSessionId);
    } else {
      api.logger.debug(`[ClaudeLocal] Generated new session ID: ${newSessionId}`);
      opts.onSessionFound(newSessionId);
    }
  } else {
    if (startFrom) {
      api.logger.debug(`[ClaudeLocal] Will resume existing session: ${startFrom}`);
    } else if (hasUserSessionControl) {
      api.logger.debug(`[ClaudeLocal] User passed ${hasContinueFlag ? "--continue" : "--resume"} flag, session ID will be determined by hook`);
    } else {
      api.logger.debug(`[ClaudeLocal] Fresh start, session ID will be provided by hook`);
    }
  }
  let thinking = false;
  let stopThinkingTimeout = null;
  const updateThinking = (newThinking) => {
    if (thinking !== newThinking) {
      thinking = newThinking;
      api.logger.debug(`[ClaudeLocal] Thinking state changed to: ${thinking}`);
      if (opts.onThinkingChange) {
        opts.onThinkingChange(thinking);
      }
    }
  };
  try {
    process.stdin.pause();
    await new Promise((r, reject) => {
      const args = [];
      if (!opts.hookSettingsPath) {
        const hasResumeFlag2 = opts.claudeArgs?.includes("--resume") || opts.claudeArgs?.includes("-r");
        if (startFrom) {
          args.push("--resume", startFrom);
        } else if (!hasResumeFlag2 && newSessionId) {
          args.push("--session-id", newSessionId);
        }
      } else {
        if (startFrom) {
          args.push("--resume", startFrom);
        }
      }
      args.push("--append-system-prompt", systemPrompt);
      if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
        args.push("--mcp-config", JSON.stringify({ mcpServers: opts.mcpServers }));
      }
      if (opts.allowedTools && opts.allowedTools.length > 0) {
        args.push("--allowedTools", opts.allowedTools.join(","));
      }
      if (opts.claudeArgs) {
        args.push(...opts.claudeArgs);
      }
      if (opts.hookSettingsPath) {
        args.push("--settings", opts.hookSettingsPath);
        api.logger.debug(`[ClaudeLocal] Using hook settings: ${opts.hookSettingsPath}`);
      }
      if (!claudeCliPath || !node_fs.existsSync(claudeCliPath)) {
        throw new Error("Claude local launcher not found. Please ensure HAPPY_PROJECT_ROOT is set correctly for development.");
      }
      const env = {
        ...process.env,
        ...opts.claudeEnvVars
      };
      if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
        ensureLocalProxyBypass(env);
      }
      api.logger.debug(`[ClaudeLocal] Spawning launcher: ${claudeCliPath}`);
      api.logger.debug(`[ClaudeLocal] Args: ${JSON.stringify(args)}`);
      (async () => {
        let cleanupSandbox = null;
        let spawnCommand = null;
        let spawnArgs = [claudeCliPath, ...args];
        let spawnWithShell = false;
        if (opts.sandboxConfig?.enabled) {
          if (process.platform === "win32") {
            api.logger.warn("[ClaudeLocal] Sandbox is not supported on Windows; continuing without sandbox.");
          } else {
            try {
              cleanupSandbox = await initializeSandbox(opts.sandboxConfig, opts.path);
              if (!spawnArgs.includes("--dangerously-skip-permissions")) {
                spawnArgs = [...spawnArgs, "--dangerously-skip-permissions"];
              }
              const fullCommand = [
                "node",
                ...spawnArgs.map((arg) => quoteShellArg(arg))
              ].join(" ");
              spawnCommand = await wrapCommand(fullCommand);
              spawnWithShell = true;
              api.logger.info(
                `[ClaudeLocal] Sandbox enabled: workspace=${opts.sandboxConfig.workspaceRoot ?? opts.path}, network=${opts.sandboxConfig.networkMode}`
              );
            } catch (error) {
              api.logger.warn("[ClaudeLocal] Failed to initialize sandbox; continuing without sandbox.", error);
              cleanupSandbox = null;
              spawnCommand = null;
              spawnWithShell = false;
              spawnArgs = [claudeCliPath, ...args];
            }
          }
        }
        const child = spawn.spawn(
          spawnWithShell && spawnCommand ? spawnCommand : "node",
          spawnWithShell ? [] : spawnArgs,
          {
            stdio: ["inherit", "inherit", "inherit", "pipe"],
            signal: opts.abort,
            cwd: opts.path,
            env,
            shell: spawnWithShell,
            windowsHide: true
          }
        );
        if (child.stdio[3]) {
          const rl = node_readline.createInterface({
            input: child.stdio[3],
            crlfDelay: Infinity
          });
          const activeFetches = /* @__PURE__ */ new Map();
          rl.on("line", (line) => {
            try {
              const message = JSON.parse(line);
              switch (message.type) {
                case "fetch-start":
                  activeFetches.set(message.id, {
                    hostname: message.hostname,
                    path: message.path,
                    startTime: message.timestamp
                  });
                  if (stopThinkingTimeout) {
                    clearTimeout(stopThinkingTimeout);
                    stopThinkingTimeout = null;
                  }
                  updateThinking(true);
                  break;
                case "fetch-end":
                  activeFetches.delete(message.id);
                  if (activeFetches.size === 0 && thinking && !stopThinkingTimeout) {
                    stopThinkingTimeout = setTimeout(() => {
                      if (activeFetches.size === 0) {
                        updateThinking(false);
                      }
                      stopThinkingTimeout = null;
                    }, 500);
                  }
                  break;
                default:
                  api.logger.debug(`[ClaudeLocal] Unknown message type: ${message.type}`);
              }
            } catch (e) {
              api.logger.debug(`[ClaudeLocal] Non-JSON line from fd3: ${line}`);
            }
          });
          rl.on("error", (err) => {
            console.error("Error reading from fd 3:", err);
          });
          child.on("exit", () => {
            if (stopThinkingTimeout) {
              clearTimeout(stopThinkingTimeout);
            }
            updateThinking(false);
          });
        }
        child.on("error", (error) => {
        });
        child.on("exit", async (code, signal) => {
          if (cleanupSandbox) {
            try {
              await cleanupSandbox();
            } catch (error) {
              api.logger.warn("[ClaudeLocal] Failed to reset sandbox after session exit.", error);
            }
          }
          if (signal === "SIGTERM" && opts.abort.aborted) {
            r();
          } else if (signal) {
            reject(new Error(`Process terminated with signal: ${signal}`));
          } else if (code !== 0 && code !== null) {
            reject(new ExitCodeError(code));
          } else {
            r();
          }
        });
      })().catch(reject);
    });
  } finally {
    process.stdin.resume();
    if (stopThinkingTimeout) {
      clearTimeout(stopThinkingTimeout);
      stopThinkingTimeout = null;
    }
    updateThinking(false);
  }
  return effectiveSessionId;
}

class Future {
  _resolve;
  _reject;
  _promise;
  constructor() {
    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  resolve(value) {
    this._resolve(value);
  }
  reject(reason) {
    this._reject(reason);
  }
  get promise() {
    return this._promise;
  }
}

function startFileWatcher(file, onFileChange) {
  const abortController = new AbortController();
  void (async () => {
    while (true) {
      try {
        api.logger.debug(`[FILE_WATCHER] Starting watcher for ${file}`);
        const watcher = fs.watch(file, { persistent: true, signal: abortController.signal });
        for await (const event of watcher) {
          if (abortController.signal.aborted) {
            return;
          }
          api.logger.debug(`[FILE_WATCHER] File changed: ${file}`);
          onFileChange(file);
        }
      } catch (e) {
        if (abortController.signal.aborted) {
          return;
        }
        api.logger.debug(`[FILE_WATCHER] Watch error: ${e.message}, restarting watcher in a second`);
        await api.delay(1e3);
      }
    }
  })();
  return () => {
    abortController.abort();
  };
}

const INTERNAL_CLAUDE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "file-history-snapshot",
  "change",
  "queue-operation"
]);
async function createSessionScanner(opts) {
  const projectDir = getProjectPath(opts.workingDirectory);
  let finishedSessions = /* @__PURE__ */ new Set();
  let pendingSessions = /* @__PURE__ */ new Set();
  let currentSessionId = null;
  let watchers = /* @__PURE__ */ new Map();
  let processedMessageKeys = /* @__PURE__ */ new Set();
  if (opts.sessionId) {
    let messages = await readSessionLog(projectDir, opts.sessionId);
    api.logger.debug(`[SESSION_SCANNER] Marking ${messages.length} existing messages as processed from session ${opts.sessionId}`);
    for (let m of messages) {
      processedMessageKeys.add(messageKey(m));
    }
    currentSessionId = opts.sessionId;
  }
  const sync = new api.InvalidateSync(async () => {
    let sessions = [];
    for (let p of pendingSessions) {
      sessions.push(p);
    }
    if (currentSessionId && !pendingSessions.has(currentSessionId)) {
      sessions.push(currentSessionId);
    }
    for (let [sessionId] of watchers) {
      if (!sessions.includes(sessionId)) {
        sessions.push(sessionId);
      }
    }
    for (let session of sessions) {
      const sessionMessages = await readSessionLog(projectDir, session);
      let skipped = 0;
      let sent = 0;
      for (let file of sessionMessages) {
        let key = messageKey(file);
        if (processedMessageKeys.has(key)) {
          skipped++;
          continue;
        }
        processedMessageKeys.add(key);
        api.logger.debug(`[SESSION_SCANNER] Sending new message: type=${file.type}, uuid=${file.type === "summary" ? file.leafUuid : file.uuid}`);
        opts.onMessage(file);
        sent++;
      }
      if (sessionMessages.length > 0) {
        api.logger.debug(`[SESSION_SCANNER] Session ${session}: found=${sessionMessages.length}, skipped=${skipped}, sent=${sent}`);
      }
    }
    for (let p of sessions) {
      if (pendingSessions.has(p)) {
        pendingSessions.delete(p);
        finishedSessions.add(p);
      }
    }
    for (let p of sessions) {
      if (!watchers.has(p)) {
        api.logger.debug(`[SESSION_SCANNER] Starting watcher for session: ${p}`);
        watchers.set(p, startFileWatcher(node_path.join(projectDir, `${p}.jsonl`), () => {
          sync.invalidate();
        }));
      }
    }
  });
  await sync.invalidateAndAwait();
  const intervalId = setInterval(() => {
    sync.invalidate();
  }, 3e3);
  return {
    cleanup: async () => {
      clearInterval(intervalId);
      for (let w of watchers.values()) {
        w();
      }
      watchers.clear();
      await sync.invalidateAndAwait();
      sync.stop();
    },
    onNewSession: (sessionId) => {
      if (currentSessionId === sessionId) {
        api.logger.debug(`[SESSION_SCANNER] New session: ${sessionId} is the same as the current session, skipping`);
        return;
      }
      if (finishedSessions.has(sessionId)) {
        api.logger.debug(`[SESSION_SCANNER] New session: ${sessionId} is already finished, skipping`);
        return;
      }
      if (pendingSessions.has(sessionId)) {
        api.logger.debug(`[SESSION_SCANNER] New session: ${sessionId} is already pending, skipping`);
        return;
      }
      if (currentSessionId) {
        pendingSessions.add(currentSessionId);
      }
      api.logger.debug(`[SESSION_SCANNER] New session: ${sessionId}`);
      currentSessionId = sessionId;
      sync.invalidate();
    }
  };
}
function messageKey(message) {
  if (message.type === "user") {
    return message.uuid;
  } else if (message.type === "assistant") {
    return message.uuid;
  } else if (message.type === "summary") {
    return "summary: " + message.leafUuid + ": " + message.summary;
  } else if (message.type === "system") {
    return message.uuid;
  } else {
    throw Error();
  }
}
async function readSessionLog(projectDir, sessionId) {
  const expectedSessionFile = node_path.join(projectDir, `${sessionId}.jsonl`);
  api.logger.debug(`[SESSION_SCANNER] Reading session file: ${expectedSessionFile}`);
  let file;
  try {
    file = await promises.readFile(expectedSessionFile, "utf-8");
  } catch (error) {
    api.logger.debug(`[SESSION_SCANNER] Session file not found: ${expectedSessionFile}`);
    return [];
  }
  let lines = file.split("\n");
  let messages = [];
  for (let l of lines) {
    try {
      if (l.trim() === "") {
        continue;
      }
      let message = JSON.parse(l);
      if (message.type && INTERNAL_CLAUDE_EVENT_TYPES.has(message.type)) {
        continue;
      }
      let parsed = api.RawJSONLinesSchema.safeParse(message);
      if (!parsed.success) {
        continue;
      }
      messages.push(parsed.data);
    } catch (e) {
      api.logger.debug(`[SESSION_SCANNER] Error processing message: ${e}`);
      continue;
    }
  }
  return messages;
}

async function claudeLocalLauncher(session) {
  const scanner = await createSessionScanner({
    sessionId: session.sessionId,
    workingDirectory: session.path,
    onMessage: (message) => {
      if (message.type !== "summary") {
        session.client.sendClaudeSessionMessage(message);
      }
    }
  });
  const scannerSessionCallback = (sessionId) => {
    scanner.onNewSession(sessionId);
  };
  session.addSessionFoundCallback(scannerSessionCallback);
  let exitReason = null;
  const processAbortController = new AbortController();
  let exutFuture = new Future();
  try {
    async function abort() {
      if (!processAbortController.signal.aborted) {
        processAbortController.abort();
      }
      await exutFuture.promise;
    }
    async function doAbort() {
      api.logger.debug("[local]: doAbort");
      if (!exitReason) {
        exitReason = { type: "switch" };
      }
      session.client.closeClaudeSessionTurn("cancelled");
      session.queue.reset();
      await abort();
    }
    async function doSwitch() {
      api.logger.debug("[local]: doSwitch");
      if (!exitReason) {
        exitReason = { type: "switch" };
      }
      session.client.closeClaudeSessionTurn("cancelled");
      await abort();
    }
    session.client.rpcHandlerManager.registerHandler("abort", doAbort);
    session.client.rpcHandlerManager.registerHandler("switch", doSwitch);
    session.queue.setOnMessage((message, mode) => {
      doSwitch();
    });
    if (session.queue.size() > 0) {
      return { type: "switch" };
    }
    const handleSessionStart = (sessionId) => {
      session.onSessionFound(sessionId);
      scanner.onNewSession(sessionId);
    };
    while (true) {
      if (exitReason) {
        return exitReason;
      }
      api.logger.debug("[local]: launch");
      try {
        await claudeLocal({
          path: session.path,
          sessionId: session.sessionId,
          onSessionFound: handleSessionStart,
          onThinkingChange: session.onThinkingChange,
          abort: processAbortController.signal,
          claudeEnvVars: session.claudeEnvVars,
          claudeArgs: session.claudeArgs,
          mcpServers: session.mcpServers,
          allowedTools: session.allowedTools,
          hookSettingsPath: session.hookSettingsPath,
          sandboxConfig: session.sandboxConfig
        });
        session.consumeOneTimeFlags();
        if (!exitReason) {
          session.client.closeClaudeSessionTurn("completed");
          exitReason = { type: "exit", code: 0 };
          break;
        }
      } catch (e) {
        api.logger.debug("[local]: launch error", e);
        if (e instanceof ExitCodeError) {
          if (exitReason) {
            break;
          }
          session.client.closeClaudeSessionTurn("failed");
          exitReason = { type: "exit", code: e.exitCode };
          break;
        }
        if (!exitReason) {
          session.client.sendSessionEvent({ type: "message", message: "Process exited unexpectedly" });
          continue;
        } else {
          break;
        }
      }
      api.logger.debug("[local]: launch done");
    }
  } finally {
    exutFuture.resolve(void 0);
    session.client.rpcHandlerManager.registerHandler("abort", async () => {
    });
    session.client.rpcHandlerManager.registerHandler("switch", async () => {
    });
    session.queue.setOnMessage(null);
    session.removeSessionFoundCallback(scannerSessionCallback);
    await scanner.cleanup();
  }
  return exitReason || { type: "exit", code: 0 };
}

class MessageBuffer {
  messages = [];
  listeners = [];
  nextId = 1;
  addMessage(content, type = "assistant") {
    const message = {
      id: `msg-${this.nextId++}`,
      timestamp: /* @__PURE__ */ new Date(),
      content,
      type
    };
    this.messages.push(message);
    this.notifyListeners();
  }
  /**
   * Update the last message of a specific type by appending content to it
   * Useful for streaming responses where deltas should accumulate in one message
   */
  updateLastMessage(contentDelta, type = "assistant") {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) {
        const oldMessage = this.messages[i];
        const updatedMessage = {
          ...oldMessage,
          content: oldMessage.content + contentDelta
        };
        this.messages[i] = updatedMessage;
        this.notifyListeners();
        return;
      }
    }
    this.addMessage(contentDelta, type);
  }
  /**
   * Remove the last message of a specific type
   * Useful for removing placeholder messages like "Thinking..." when actual response starts
   */
  removeLastMessage(type) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) {
        this.messages.splice(i, 1);
        this.notifyListeners();
        return true;
      }
    }
    return false;
  }
  getMessages() {
    return [...this.messages];
  }
  clear() {
    this.messages = [];
    this.nextId = 1;
    this.notifyListeners();
  }
  onUpdate(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  notifyListeners() {
    const messages = this.getMessages();
    this.listeners.forEach((listener) => listener(messages));
  }
}

const RemoteModeDisplay = ({ messageBuffer, logPath, onExit, onSwitchToLocal }) => {
  const [messages, setMessages] = React.useState([]);
  const [confirmationMode, setConfirmationMode] = React.useState(null);
  const [actionInProgress, setActionInProgress] = React.useState(null);
  const confirmationTimeoutRef = React.useRef(null);
  const { stdout } = ink.useStdout();
  const terminalWidth = stdout.columns || 80;
  const terminalHeight = stdout.rows || 24;
  React.useEffect(() => {
    setMessages(messageBuffer.getMessages());
    const unsubscribe = messageBuffer.onUpdate((newMessages) => {
      setMessages(newMessages);
    });
    return () => {
      unsubscribe();
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
    };
  }, [messageBuffer]);
  const resetConfirmation = React.useCallback(() => {
    setConfirmationMode(null);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
  }, []);
  const setConfirmationWithTimeout = React.useCallback((mode) => {
    setConfirmationMode(mode);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
    }
    confirmationTimeoutRef.current = setTimeout(() => {
      resetConfirmation();
    }, 15e3);
  }, [resetConfirmation]);
  ink.useInput(React.useCallback(async (input, key) => {
    if (actionInProgress) return;
    if (key.ctrl && input === "c") {
      if (confirmationMode === "exit") {
        resetConfirmation();
        setActionInProgress("exiting");
        await new Promise((resolve) => setTimeout(resolve, 100));
        onExit?.();
      } else {
        setConfirmationWithTimeout("exit");
      }
      return;
    }
    if (input === " ") {
      if (confirmationMode === "switch") {
        resetConfirmation();
        setActionInProgress("switching");
        await new Promise((resolve) => setTimeout(resolve, 100));
        onSwitchToLocal?.();
      } else {
        setConfirmationWithTimeout("switch");
      }
      return;
    }
    if (confirmationMode) {
      resetConfirmation();
    }
  }, [confirmationMode, actionInProgress, onExit, onSwitchToLocal, setConfirmationWithTimeout, resetConfirmation]));
  const getMessageColor = (type) => {
    switch (type) {
      case "user":
        return "magenta";
      case "assistant":
        return "cyan";
      case "system":
        return "blue";
      case "tool":
        return "yellow";
      case "result":
        return "green";
      case "status":
        return "gray";
      default:
        return "white";
    }
  };
  const formatMessage = (msg) => {
    const lines = msg.content.split("\n");
    const maxLineLength = terminalWidth - 10;
    return lines.map((line) => {
      if (line.length <= maxLineLength) return line;
      const chunks = [];
      for (let i = 0; i < line.length; i += maxLineLength) {
        chunks.push(line.slice(i, i + maxLineLength));
      }
      return chunks.join("\n");
    }).join("\n");
  };
  return /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", width: terminalWidth, height: terminalHeight }, /* @__PURE__ */ React.createElement(
    ink.Box,
    {
      flexDirection: "column",
      width: terminalWidth,
      height: terminalHeight - 4,
      borderStyle: "round",
      borderColor: "gray",
      paddingX: 1,
      overflow: "hidden"
    },
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "\u{1F4E1} Remote Mode - Claude Messages"), /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "\u2500".repeat(Math.min(terminalWidth - 4, 60)))),
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", height: terminalHeight - 10, overflow: "hidden" }, messages.length === 0 ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Waiting for messages...") : (
      // Show only the last messages that fit in the available space
      messages.slice(-Math.max(1, terminalHeight - 10)).map((msg) => /* @__PURE__ */ React.createElement(ink.Box, { key: msg.id, flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { color: getMessageColor(msg.type), dimColor: true }, formatMessage(msg))))
    ))
  ), /* @__PURE__ */ React.createElement(
    ink.Box,
    {
      width: terminalWidth,
      borderStyle: "round",
      borderColor: actionInProgress ? "gray" : confirmationMode === "exit" ? "red" : confirmationMode === "switch" ? "yellow" : "green",
      paddingX: 2,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column"
    },
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", alignItems: "center" }, actionInProgress === "exiting" ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "Exiting...") : actionInProgress === "switching" ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "Switching to local mode...") : confirmationMode === "exit" ? /* @__PURE__ */ React.createElement(ink.Text, { color: "red", bold: true }, "\u26A0\uFE0F  Press Ctrl-C again to exit completely") : confirmationMode === "switch" ? /* @__PURE__ */ React.createElement(ink.Text, { color: "yellow", bold: true }, "\u23F8\uFE0F  Press space again to switch to local mode") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ink.Text, { color: "green", bold: true }, "\u{1F4F1} Press space to switch to local mode \u2022 Ctrl-C to exit")), process.env.DEBUG && logPath && /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Debug logs: ", logPath))
  ));
};

function query(params) {
  const opts = params.options;
  let systemPrompt = void 0;
  if (opts?.customSystemPrompt) {
    systemPrompt = opts.customSystemPrompt;
  } else if (opts?.appendSystemPrompt) {
    systemPrompt = {
      type: "preset",
      preset: "claude_code",
      append: opts.appendSystemPrompt
    };
  }
  const sdkOptions = {
    cwd: opts?.cwd,
    resume: opts?.resume,
    continue: opts?.continue,
    model: opts?.model,
    fallbackModel: opts?.fallbackModel,
    maxTurns: opts?.maxTurns,
    permissionMode: opts?.permissionMode,
    allowedTools: opts?.allowedTools,
    disallowedTools: opts?.disallowedTools,
    mcpServers: opts?.mcpServers,
    systemPrompt,
    settings: opts?.settingsPath,
    strictMcpConfig: opts?.strictMcpConfig,
    sessionId: void 0
  };
  if (opts?.abort) {
    const controller = new AbortController();
    opts.abort.addEventListener("abort", () => controller.abort(), { once: true });
    sdkOptions.abortController = controller;
  }
  if (opts?.mcpServers && Object.keys(opts.mcpServers).length > 0) {
    const env = { ...process.env };
    ensureLocalProxyBypass(env);
    sdkOptions.env = env;
  }
  if (opts?.canCallTool) {
    const callback = opts.canCallTool;
    sdkOptions.canUseTool = async (toolName, input, options) => {
      return callback(toolName, input, options);
    };
  }
  return claudeAgentSdk.query({
    prompt: params.prompt,
    options: sdkOptions
  });
}

function mapToClaudeMode(mode) {
  const codexToClaudeMap = {
    "yolo": "bypassPermissions",
    "safe-yolo": "default",
    "read-only": "default"
  };
  return codexToClaudeMap[mode] ?? mode;
}
const VALID_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
  "read-only",
  "safe-yolo",
  "yolo"
];
function isPermissionMode(value) {
  return !!value && VALID_PERMISSION_MODES.includes(value);
}
function extractPermissionModeFromClaudeArgs(claudeArgs) {
  if (!claudeArgs || claudeArgs.length === 0) {
    return void 0;
  }
  let found = void 0;
  for (let i = 0; i < claudeArgs.length; i++) {
    const arg = claudeArgs[i];
    if (arg === "--permission-mode") {
      const next = claudeArgs[i + 1];
      if (isPermissionMode(next)) {
        found = next;
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--permission-mode=")) {
      const value = arg.slice("--permission-mode=".length);
      if (isPermissionMode(value)) {
        found = value;
      }
    }
  }
  return found;
}
function resolveInitialClaudePermissionMode(optionMode, claudeArgs) {
  if (claudeArgs?.includes("--dangerously-skip-permissions")) {
    return "bypassPermissions";
  }
  return extractPermissionModeFromClaudeArgs(claudeArgs) ?? optionMode;
}
function applySandboxPermissionPolicy(mode, sandboxEnabled) {
  if (!sandboxEnabled) {
    return mode;
  }
  return "bypassPermissions";
}

function parseCompact(message) {
  const trimmed = message.trim();
  if (trimmed === "/compact") {
    return {
      isCompact: true,
      originalMessage: trimmed
    };
  }
  if (trimmed.startsWith("/compact ")) {
    return {
      isCompact: true,
      originalMessage: trimmed
    };
  }
  return {
    isCompact: false,
    originalMessage: message
  };
}
function parseClear(message) {
  const trimmed = message.trim();
  return {
    isClear: trimmed === "/clear"
  };
}
function parseSpecialCommand(message) {
  const compactResult = parseCompact(message);
  if (compactResult.isCompact) {
    return {
      type: "compact",
      originalMessage: compactResult.originalMessage
    };
  }
  const clearResult = parseClear(message);
  if (clearResult.isClear) {
    return {
      type: "clear"
    };
  }
  const trimmed = message.trim().toLowerCase();
  if (trimmed === "/mcp") {
    return { type: "mcp" };
  }
  if (trimmed === "/skills") {
    return { type: "skills" };
  }
  return {
    type: null
  };
}

class PushableAsyncIterable {
  queue = [];
  waiters = [];
  isDone = false;
  error = null;
  started = false;
  constructor() {
  }
  /**
   * Push a value to the iterable
   */
  push(value) {
    if (this.isDone) {
      throw new Error("Cannot push to completed iterable");
    }
    if (this.error) {
      throw this.error;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
    } else {
      this.queue.push(value);
    }
  }
  /**
   * Mark the iterable as complete
   */
  end() {
    if (this.isDone) {
      return;
    }
    this.isDone = true;
    this.cleanup();
  }
  /**
   * Set an error on the iterable
   */
  setError(err) {
    if (this.isDone) {
      return;
    }
    this.error = err;
    this.isDone = true;
    this.cleanup();
  }
  /**
   * Cleanup waiting consumers
   */
  cleanup() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (this.error) {
        waiter.reject(this.error);
      } else {
        waiter.resolve({ done: true, value: void 0 });
      }
    }
  }
  /**
   * AsyncIterableIterator implementation
   */
  async next() {
    if (this.queue.length > 0) {
      return { done: false, value: this.queue.shift() };
    }
    if (this.isDone) {
      if (this.error) {
        throw this.error;
      }
      return { done: true, value: void 0 };
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
  /**
   * AsyncIterableIterator return implementation
   */
  async return(_value) {
    this.end();
    return { done: true, value: void 0 };
  }
  /**
   * AsyncIterableIterator throw implementation
   */
  async throw(e) {
    this.setError(e instanceof Error ? e : new Error(String(e)));
    throw this.error;
  }
  /**
   * Make this iterable
   */
  [Symbol.asyncIterator]() {
    if (this.started) {
      throw new Error("PushableAsyncIterable can only be iterated once");
    }
    this.started = true;
    return this;
  }
  /**
   * Check if the iterable is done
   */
  get done() {
    return this.isDone;
  }
  /**
   * Check if the iterable has an error
   */
  get hasError() {
    return this.error !== null;
  }
  /**
   * Get the current queue size
   */
  get queueSize() {
    return this.queue.length;
  }
  /**
   * Get the number of waiting consumers
   */
  get waiterCount() {
    return this.waiters.length;
  }
}

async function awaitFileExist(file, timeout = 1e4) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      await fs.access(file);
      return true;
    } catch (e) {
      await api.delay(1e3);
    }
  }
  return false;
}

async function claudeRemote(opts) {
  let startFrom = opts.sessionId;
  if (opts.sessionId && !claudeCheckSession(opts.sessionId, opts.path)) {
    startFrom = null;
  }
  if (!startFrom && opts.claudeArgs) {
    for (let i = 0; i < opts.claudeArgs.length; i++) {
      if (opts.claudeArgs[i] === "--resume") {
        if (i + 1 < opts.claudeArgs.length) {
          const nextArg = opts.claudeArgs[i + 1];
          if (!nextArg.startsWith("-") && nextArg.includes("-")) {
            startFrom = nextArg;
            api.logger.debug(`[claudeRemote] Found --resume with session ID: ${startFrom}`);
            break;
          } else {
            api.logger.debug("[claudeRemote] Found --resume without session ID - not supported in remote mode");
            break;
          }
        } else {
          api.logger.debug("[claudeRemote] Found --resume without session ID - not supported in remote mode");
          break;
        }
      }
    }
  }
  if (opts.claudeEnvVars) {
    Object.entries(opts.claudeEnvVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
  const initial = await opts.nextMessage();
  if (!initial) {
    return;
  }
  const specialCommand = parseSpecialCommand(initial.message);
  if (specialCommand.type === "clear") {
    if (opts.onCompletionEvent) {
      opts.onCompletionEvent("Context was reset");
    }
    if (opts.onSessionReset) {
      opts.onSessionReset();
    }
    return;
  }
  let isCompactCommand = false;
  if (specialCommand.type === "compact") {
    api.logger.debug("[claudeRemote] /compact command detected - will process as normal but with compaction behavior");
    isCompactCommand = true;
    if (opts.onCompletionEvent) {
      opts.onCompletionEvent("Compaction started");
    }
  }
  let mode = initial.mode;
  const sdkOptions = {
    cwd: opts.path,
    resume: startFrom ?? void 0,
    mcpServers: opts.mcpServers,
    permissionMode: mapToClaudeMode(initial.mode.permissionMode),
    model: initial.mode.model,
    fallbackModel: initial.mode.fallbackModel,
    customSystemPrompt: initial.mode.customSystemPrompt ? initial.mode.customSystemPrompt + "\n\n" + systemPrompt : void 0,
    appendSystemPrompt: initial.mode.appendSystemPrompt ? initial.mode.appendSystemPrompt + "\n\n" + systemPrompt : systemPrompt,
    allowedTools: initial.mode.allowedTools ? initial.mode.allowedTools.concat(opts.allowedTools) : opts.allowedTools,
    disallowedTools: initial.mode.disallowedTools,
    canCallTool: (toolName, input, options) => opts.canCallTool(toolName, input, mode, options),
    abort: opts.signal,
    settingsPath: opts.hookSettingsPath
  };
  let thinking = false;
  const updateThinking = (newThinking) => {
    if (thinking !== newThinking) {
      thinking = newThinking;
      api.logger.debug(`[claudeRemote] Thinking state changed to: ${thinking}`);
      if (opts.onThinkingChange) {
        opts.onThinkingChange(thinking);
      }
    }
  };
  let messages = new PushableAsyncIterable();
  messages.push({
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: initial.message
    }
  });
  const response = query({
    prompt: messages,
    options: sdkOptions
  });
  if (opts.onQueryReady) {
    opts.onQueryReady({
      setPermissionMode: (mode2) => response.setPermissionMode(mode2)
    });
  }
  updateThinking(true);
  try {
    api.logger.debug(`[claudeRemote] Starting to iterate over response`);
    for await (const message of response) {
      api.logger.debugLargeJson(`[claudeRemote] Message ${message.type}`, message);
      opts.onMessage(message);
      if (message.type === "system" && message.subtype === "init") {
        updateThinking(true);
        const systemInit = message;
        if (opts.onSDKMetadata) {
          opts.onSDKMetadata({
            tools: systemInit.tools,
            slashCommands: systemInit.slash_commands,
            mcpServers: systemInit.mcp_servers?.map((s) => ({ name: s.name, status: s.status })),
            skills: systemInit.skills
          });
        }
        if (systemInit.session_id) {
          api.logger.debug(`[claudeRemote] Waiting for session file to be written to disk: ${systemInit.session_id}`);
          const projectDir = getProjectPath(opts.path);
          const found = await awaitFileExist(node_path.join(projectDir, `${systemInit.session_id}.jsonl`));
          api.logger.debug(`[claudeRemote] Session file found: ${systemInit.session_id} ${found}`);
          opts.onSessionFound(systemInit.session_id);
        }
      }
      if (message.type === "result") {
        updateThinking(false);
        api.logger.debug("[claudeRemote] Result received");
        if (isCompactCommand) {
          api.logger.debug("[claudeRemote] Compaction completed");
          if (opts.onCompletionEvent) {
            opts.onCompletionEvent("Compaction completed");
          }
          isCompactCommand = false;
        }
        opts.onReady();
        opts.nextMessage().then((next) => {
          if (!next) {
            messages.end();
          } else {
            mode = next.mode;
            messages.push({ type: "user", parent_tool_use_id: null, message: { role: "user", content: next.message } });
          }
        }).catch(() => {
          messages.end();
        });
      }
      if (message.type === "user") {
        const msg = message;
        if (msg.message.role === "user" && Array.isArray(msg.message.content)) {
          for (let c of msg.message.content) {
            if (c.type === "tool_result" && c.tool_use_id && opts.isAborted(c.tool_use_id)) {
              api.logger.debug("[claudeRemote] Tool aborted, exiting claudeRemote");
              return;
            }
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof claudeAgentSdk.AbortError) {
      api.logger.debug(`[claudeRemote] Aborted`);
    } else {
      throw e;
    }
  } finally {
    updateThinking(false);
  }
}

function getToolDescriptor(toolName) {
  if (toolName === "exit_plan_mode" || toolName === "ExitPlanMode") {
    return { edit: false, exitPlan: true, dangerous: false };
  }
  if (toolName === "Edit" || toolName === "MultiEdit" || toolName === "Write" || toolName === "NotebookEdit") {
    return { edit: true, exitPlan: false, dangerous: true };
  }
  if (toolName === "Bash") {
    return { edit: false, exitPlan: false, dangerous: true };
  }
  return { edit: false, exitPlan: false, dangerous: false };
}

class PermissionHandler {
  responses = /* @__PURE__ */ new Map();
  pendingRequests = /* @__PURE__ */ new Map();
  session;
  allowedTools = /* @__PURE__ */ new Set();
  allowedBashLiterals = /* @__PURE__ */ new Set();
  allowedBashPrefixes = /* @__PURE__ */ new Set();
  permissionMode = "default";
  onPermissionRequestCallback;
  /** Callback to change permission mode on the active query (set by claudeRemote) */
  setPermissionModeCallback;
  constructor(session) {
    this.session = session;
    this.setupClientHandler();
  }
  /**
   * Set callback to trigger when permission request is made
   */
  setOnPermissionRequest(callback) {
    this.onPermissionRequestCallback = callback;
  }
  handleModeChange(mode) {
    this.permissionMode = mode;
  }
  /**
   * Set callback to dynamically change permission mode on the active query.
   * Called by claudeRemote after the Query object is created.
   */
  setPermissionModeUpdater(callback) {
    this.setPermissionModeCallback = callback;
  }
  /**
   * Handler response
   */
  handlePermissionResponse(response, pending) {
    if (response.allowTools && response.allowTools.length > 0) {
      response.allowTools.forEach((tool) => {
        if (tool.startsWith("Bash(") || tool === "Bash") {
          this.parseBashPermission(tool);
        } else {
          this.allowedTools.add(tool);
        }
      });
    }
    if (response.mode) {
      this.permissionMode = response.mode;
    }
    if (pending.toolName === "exit_plan_mode" || pending.toolName === "ExitPlanMode") {
      api.logger.debug("Plan mode result received", response);
      if (response.approved) {
        const newMode = response.mode && ["default", "acceptEdits", "bypassPermissions"].includes(response.mode) ? response.mode : "default";
        api.logger.debug(`Plan approved - switching to ${newMode} mode and allowing ExitPlanMode`);
        if (this.setPermissionModeCallback) {
          this.setPermissionModeCallback(newMode).catch((err) => {
            api.logger.debug("Failed to set permission mode via SDK:", err);
          });
        }
        this.permissionMode = newMode;
        pending.resolve({ behavior: "allow", updatedInput: pending.input || {} });
      } else {
        pending.resolve({ behavior: "deny", message: response.reason || "Plan rejected" });
      }
    } else {
      const originalInput = pending.input || {};
      const updatedInput = response.updatedInput ? { ...originalInput, ...response.updatedInput } : originalInput;
      const result = response.approved ? { behavior: "allow", updatedInput } : { behavior: "deny", message: response.reason || `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.` };
      pending.resolve(result);
    }
  }
  /**
   * Creates the canCallTool callback for the SDK.
   * Uses toolUseID from official SDK callback options directly.
   */
  handleToolCall = async (toolName, input, mode, options) => {
    const toolCallId = options.toolUseID;
    if (toolName === "AskUserQuestion") {
      return this.handlePermissionRequest(toolCallId, toolName, input, options.signal);
    }
    if (toolName === "Bash") {
      const inputObj = input;
      if (inputObj?.command) {
        if (this.allowedBashLiterals.has(inputObj.command)) {
          return { behavior: "allow", updatedInput: input };
        }
        for (const prefix of this.allowedBashPrefixes) {
          if (inputObj.command.startsWith(prefix)) {
            return { behavior: "allow", updatedInput: input };
          }
        }
      }
    } else if (this.allowedTools.has(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }
    const descriptor = getToolDescriptor(toolName);
    if (descriptor.exitPlan) {
      return this.handlePermissionRequest(toolCallId, toolName, input, options.signal);
    }
    if (this.permissionMode === "bypassPermissions") {
      return { behavior: "allow", updatedInput: input };
    }
    if (this.permissionMode === "acceptEdits" && descriptor.edit) {
      return { behavior: "allow", updatedInput: input };
    }
    if (this.permissionMode === "plan" && !descriptor.dangerous) {
      return { behavior: "allow", updatedInput: input };
    }
    return this.handlePermissionRequest(toolCallId, toolName, input, options.signal);
  };
  /**
   * Handles individual permission requests
   */
  async handlePermissionRequest(id, toolName, input, signal) {
    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        this.pendingRequests.delete(id);
        reject(new Error("Permission request aborted"));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      this.pendingRequests.set(id, {
        resolve: (result) => {
          signal.removeEventListener("abort", abortHandler);
          resolve(result);
        },
        reject: (error) => {
          signal.removeEventListener("abort", abortHandler);
          reject(error);
        },
        toolName,
        input
      });
      if (this.onPermissionRequestCallback) {
        this.onPermissionRequestCallback(id);
      }
      this.session.api.push().sendSessionNotification({
        kind: "permission",
        metadata: this.session.client.getMetadata(),
        data: {
          sessionId: this.session.client.sessionId,
          requestId: id,
          tool: toolName,
          type: "permission_request",
          provider: "claude"
        }
      });
      this.session.client.updateAgentState((currentState) => ({
        ...currentState,
        requests: {
          ...currentState.requests,
          [id]: {
            tool: toolName,
            arguments: input,
            createdAt: Date.now()
          }
        }
      }));
      api.logger.debug(`Permission request sent for tool call ${id}: ${toolName}`);
    });
  }
  /**
   * Parses Bash permission strings into literal and prefix sets
   */
  parseBashPermission(permission) {
    if (permission === "Bash") {
      return;
    }
    const bashPattern = /^Bash\((.+?)\)$/;
    const match = permission.match(bashPattern);
    if (!match) {
      return;
    }
    const command = match[1];
    if (command.endsWith(":*")) {
      const prefix = command.slice(0, -2);
      this.allowedBashPrefixes.add(prefix);
    } else {
      this.allowedBashLiterals.add(command);
    }
  }
  /**
   * Checks if a tool call is rejected
   */
  isAborted(toolCallId) {
    if (this.responses.get(toolCallId)?.approved === false) {
      return true;
    }
    return false;
  }
  /**
   * Resets all state for new sessions
   */
  reset() {
    this.responses.clear();
    this.allowedTools.clear();
    this.allowedBashLiterals.clear();
    this.allowedBashPrefixes.clear();
    this.permissionMode = "default";
    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error("Session reset"));
    }
    this.pendingRequests.clear();
    this.session.client.updateAgentState((currentState) => {
      const pendingRequests = currentState.requests || {};
      const completedRequests = { ...currentState.completedRequests };
      for (const [id, request] of Object.entries(pendingRequests)) {
        completedRequests[id] = {
          ...request,
          completedAt: Date.now(),
          status: "canceled",
          reason: "Session switched to local mode"
        };
      }
      return {
        ...currentState,
        requests: {},
        // Clear all pending requests
        completedRequests
      };
    });
  }
  /**
   * Sets up the client handler for permission responses
   */
  setupClientHandler() {
    this.session.client.rpcHandlerManager.registerHandler("permission", async (message) => {
      api.logger.debug(`Permission response: ${JSON.stringify(message)}`);
      const id = message.id;
      const pending = this.pendingRequests.get(id);
      if (!pending) {
        api.logger.debug("Permission request not found or already resolved");
        return;
      }
      this.responses.set(id, { ...message, receivedAt: Date.now() });
      this.pendingRequests.delete(id);
      this.handlePermissionResponse(message, pending);
      this.session.client.updateAgentState((currentState) => {
        const request = currentState.requests?.[id];
        if (!request) return currentState;
        let r = { ...currentState.requests };
        delete r[id];
        return {
          ...currentState,
          requests: r,
          completedRequests: {
            ...currentState.completedRequests,
            [id]: {
              ...request,
              completedAt: Date.now(),
              status: message.approved ? "approved" : "denied",
              reason: message.reason,
              mode: message.mode,
              allowTools: message.allowTools
            }
          }
        };
      });
    });
  }
  /**
   * Gets the responses map (for compatibility with existing code)
   */
  getResponses() {
    return this.responses;
  }
}

function formatClaudeMessageForInk(message, messageBuffer, onAssistantResult) {
  api.logger.debugLargeJson("[CLAUDE INK] Message from remote mode:", message);
  switch (message.type) {
    case "system": {
      const sysMsg = message;
      if (sysMsg.subtype === "init") {
        messageBuffer.addMessage("\u2500".repeat(40), "status");
        messageBuffer.addMessage(`\u{1F680} Session initialized: ${sysMsg.session_id}`, "system");
        messageBuffer.addMessage(`  Model: ${sysMsg.model}`, "status");
        messageBuffer.addMessage(`  CWD: ${sysMsg.cwd}`, "status");
        if (sysMsg.tools && sysMsg.tools.length > 0) {
          messageBuffer.addMessage(`  Tools: ${sysMsg.tools.join(", ")}`, "status");
        }
        messageBuffer.addMessage("\u2500".repeat(40), "status");
      }
      break;
    }
    case "user": {
      const userMsg = message;
      if (userMsg.message && typeof userMsg.message === "object" && "content" in userMsg.message) {
        const content = userMsg.message.content;
        if (typeof content === "string") {
          messageBuffer.addMessage(`\u{1F464} User: ${content}`, "user");
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              messageBuffer.addMessage(`\u{1F464} User: ${block.text}`, "user");
            } else if (block.type === "tool_result") {
              messageBuffer.addMessage(`\u2705 Tool Result (ID: ${block.tool_use_id})`, "result");
              if (block.content) {
                const outputStr = typeof block.content === "string" ? block.content : JSON.stringify(block.content, null, 2);
                const maxLength = 200;
                if (outputStr.length > maxLength) {
                  messageBuffer.addMessage(outputStr.substring(0, maxLength) + "... (truncated)", "result");
                } else {
                  messageBuffer.addMessage(outputStr, "result");
                }
              }
            }
          }
        } else {
          messageBuffer.addMessage(`\u{1F464} User: ${JSON.stringify(content, null, 2)}`, "user");
        }
      }
      break;
    }
    case "assistant": {
      const assistantMsg = message;
      if (assistantMsg.message && assistantMsg.message.content) {
        messageBuffer.addMessage("\u{1F916} Assistant:", "assistant");
        for (const block of assistantMsg.message.content) {
          if (block.type === "text") {
            messageBuffer.addMessage(block.text || "", "assistant");
          } else if (block.type === "tool_use") {
            messageBuffer.addMessage(`\u{1F527} Tool: ${block.name}`, "tool");
            if (block.input) {
              const inputStr = JSON.stringify(block.input, null, 2);
              const maxLength = 500;
              if (inputStr.length > maxLength) {
                messageBuffer.addMessage(`Input: ${inputStr.substring(0, maxLength)}... (truncated)`, "tool");
              } else {
                messageBuffer.addMessage(`Input: ${inputStr}`, "tool");
              }
            }
          }
        }
      }
      break;
    }
    case "result": {
      const resultMsg = message;
      if (resultMsg.subtype === "success") {
        if ("result" in resultMsg && resultMsg.result) {
          messageBuffer.addMessage("\u2728 Summary:", "result");
          messageBuffer.addMessage(resultMsg.result || "", "result");
        }
        if (resultMsg.usage) {
          messageBuffer.addMessage("\u{1F4CA} Session Stats:", "status");
          messageBuffer.addMessage(`  \u2022 Turns: ${resultMsg.num_turns}`, "status");
          messageBuffer.addMessage(`  \u2022 Input tokens: ${resultMsg.usage.input_tokens}`, "status");
          messageBuffer.addMessage(`  \u2022 Output tokens: ${resultMsg.usage.output_tokens}`, "status");
          if (resultMsg.usage.cache_read_input_tokens) {
            messageBuffer.addMessage(`  \u2022 Cache read tokens: ${resultMsg.usage.cache_read_input_tokens}`, "status");
          }
          if (resultMsg.usage.cache_creation_input_tokens) {
            messageBuffer.addMessage(`  \u2022 Cache creation tokens: ${resultMsg.usage.cache_creation_input_tokens}`, "status");
          }
          messageBuffer.addMessage(`  \u2022 Cost: $${resultMsg.total_cost_usd.toFixed(4)}`, "status");
          messageBuffer.addMessage(`  \u2022 Duration: ${resultMsg.duration_ms}ms`, "status");
        }
      } else if (resultMsg.subtype === "error_max_turns") {
        messageBuffer.addMessage("\u274C Error: Maximum turns reached", "result");
        messageBuffer.addMessage(`Completed ${resultMsg.num_turns} turns`, "status");
      } else if (resultMsg.subtype === "error_during_execution") {
        messageBuffer.addMessage("\u274C Error during execution", "result");
        messageBuffer.addMessage(`Completed ${resultMsg.num_turns} turns before error`, "status");
        api.logger.debugLargeJson("[RESULT] Error during execution", resultMsg);
      }
      break;
    }
    default: {
      if (process.env.DEBUG) {
        messageBuffer.addMessage(`[Unknown message type: ${message.type}]`, "status");
      }
    }
  }
}

function getGitBranch(cwd) {
  try {
    const branch = node_child_process.execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    }).trim();
    return branch || void 0;
  } catch {
    return void 0;
  }
}
class SDKToLogConverter {
  lastUuid = null;
  context;
  responses;
  sidechainLastUUID = /* @__PURE__ */ new Map();
  constructor(context, responses) {
    this.context = {
      ...context,
      gitBranch: context.gitBranch ?? getGitBranch(context.cwd),
      version: context.version ?? process.env.npm_package_version ?? "0.0.0",
      parentUuid: null
    };
    this.responses = responses;
  }
  /**
   * Update session ID (for when session changes during resume)
   */
  updateSessionId(sessionId) {
    this.context.sessionId = sessionId;
  }
  /**
   * Reset parent chain (useful when starting new conversation)
   */
  resetParentChain() {
    this.lastUuid = null;
    this.context.parentUuid = null;
  }
  /**
   * Convert SDK message to log format
   */
  convert(sdkMessage) {
    const uuid = node_crypto.randomUUID();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    let parentUuid = this.lastUuid;
    let isSidechain = false;
    const parentToolUseId = sdkMessage.parent_tool_use_id;
    if (parentToolUseId) {
      isSidechain = true;
      parentUuid = this.sidechainLastUUID.get(parentToolUseId) ?? null;
      this.sidechainLastUUID.set(parentToolUseId, uuid);
    }
    const baseFields = {
      parentUuid,
      isSidechain,
      userType: "external",
      cwd: this.context.cwd,
      sessionId: this.context.sessionId,
      version: this.context.version,
      gitBranch: this.context.gitBranch,
      uuid,
      timestamp
    };
    let logMessage = null;
    switch (sdkMessage.type) {
      case "user": {
        const userMsg = sdkMessage;
        logMessage = {
          ...baseFields,
          type: "user",
          message: userMsg.message,
          ...userMsg.parent_tool_use_id ? { parent_tool_use_id: userMsg.parent_tool_use_id } : {}
        };
        if (Array.isArray(userMsg.message.content)) {
          for (const content of userMsg.message.content) {
            if (content.type === "tool_result" && content.tool_use_id && this.responses?.has(content.tool_use_id)) {
              const response = this.responses.get(content.tool_use_id);
              if (response?.mode) {
                logMessage.mode = response.mode;
              }
            }
          }
        } else if (typeof userMsg.message.content === "string") ;
        break;
      }
      case "assistant": {
        const assistantMsg = sdkMessage;
        logMessage = {
          ...baseFields,
          type: "assistant",
          message: assistantMsg.message,
          // Assistant messages often have additional fields
          requestId: assistantMsg.requestId,
          ...assistantMsg.parent_tool_use_id ? { parent_tool_use_id: assistantMsg.parent_tool_use_id } : {}
        };
        break;
      }
      case "system": {
        const systemMsg = sdkMessage;
        if (systemMsg.subtype === "init" && systemMsg.session_id) {
          this.updateSessionId(systemMsg.session_id);
        }
        logMessage = {
          ...baseFields,
          type: "system",
          subtype: systemMsg.subtype,
          model: systemMsg.model,
          tools: systemMsg.tools,
          // Include all other fields
          ...systemMsg
        };
        break;
      }
      case "result": {
        break;
      }
      default:
        logMessage = {
          ...baseFields,
          ...sdkMessage,
          type: sdkMessage.type
          // Override type last to ensure it's set
        };
    }
    if (logMessage && logMessage.type !== "summary") {
      this.lastUuid = uuid;
    }
    return logMessage;
  }
  /**
   * Convert multiple SDK messages to log format
   */
  convertMany(sdkMessages) {
    return sdkMessages.map((msg) => this.convert(msg)).filter((msg) => msg !== null);
  }
  /**
   * Convert a simple string content to a sidechain user message
   * Used for Task tool sub-agent prompts
   */
  convertSidechainUserMessage(toolUseId, content) {
    const uuid = node_crypto.randomUUID();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    this.sidechainLastUUID.set(toolUseId, uuid);
    return {
      parentUuid: null,
      isSidechain: true,
      parent_tool_use_id: toolUseId,
      userType: "external",
      cwd: this.context.cwd,
      sessionId: this.context.sessionId,
      version: this.context.version,
      gitBranch: this.context.gitBranch,
      type: "user",
      message: {
        role: "user",
        content
      },
      uuid,
      timestamp
    };
  }
  /**
   * Generate an interrupted tool result message
   * Used when a tool call is interrupted by the user
   * @param toolUseId - The ID of the tool that was interrupted
   * @param parentToolUseId - Optional parent tool ID if this is a sidechain tool
   */
  generateInterruptedToolResult(toolUseId, parentToolUseId) {
    const uuid = node_crypto.randomUUID();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const errorMessage = "[Request interrupted by user for tool use]";
    let isSidechain = false;
    let parentUuid = this.lastUuid;
    if (parentToolUseId) {
      isSidechain = true;
      parentUuid = this.sidechainLastUUID.get(parentToolUseId) ?? null;
      this.sidechainLastUUID.set(parentToolUseId, uuid);
    }
    const logMessage = {
      type: "user",
      isSidechain,
      ...parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {},
      uuid,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUseId
          }
        ]
      },
      parentUuid,
      userType: "external",
      cwd: this.context.cwd,
      sessionId: this.context.sessionId,
      version: this.context.version,
      gitBranch: this.context.gitBranch,
      timestamp,
      toolUseResult: `Error: ${errorMessage}`
    };
    this.lastUuid = uuid;
    return logMessage;
  }
}

class OutgoingMessageQueue {
  constructor(sendFunction) {
    this.sendFunction = sendFunction;
  }
  queue = [];
  nextId = 1;
  lock = new api.AsyncLock();
  processTimer;
  delayTimers = /* @__PURE__ */ new Map();
  /**
   * Add message to queue
   */
  enqueue(logMessage, options) {
    this.lock.inLock(async () => {
      const item = {
        id: this.nextId++,
        logMessage,
        delayed: !!options?.delay,
        delayMs: options?.delay || 0,
        toolCallIds: options?.toolCallIds,
        released: !options?.delay,
        // Not delayed = already released
        sent: false
      };
      this.queue.push(item);
      if (item.delayed) {
        const timer = setTimeout(() => {
          this.releaseItem(item.id);
        }, item.delayMs);
        this.delayTimers.set(item.id, timer);
      }
    });
    this.scheduleProcessing();
  }
  /**
   * Release specific item by ID
   */
  async releaseItem(itemId) {
    await this.lock.inLock(async () => {
      const item = this.queue.find((i) => i.id === itemId);
      if (item && !item.released) {
        item.released = true;
        const timer = this.delayTimers.get(itemId);
        if (timer) {
          clearTimeout(timer);
          this.delayTimers.delete(itemId);
        }
      }
    });
    this.scheduleProcessing();
  }
  /**
   * Release all messages with specific tool call ID
   */
  async releaseToolCall(toolCallId) {
    await this.lock.inLock(async () => {
      for (const item of this.queue) {
        if (item.toolCallIds?.includes(toolCallId) && !item.released) {
          item.released = true;
          const timer = this.delayTimers.get(item.id);
          if (timer) {
            clearTimeout(timer);
            this.delayTimers.delete(item.id);
          }
        }
      }
    });
    this.scheduleProcessing();
  }
  /**
   * Process queue - send messages in ID order that are released
   * (Internal implementation without lock)
   */
  processQueueInternal() {
    this.queue.sort((a, b) => a.id - b.id);
    while (this.queue.length > 0) {
      const item = this.queue[0];
      if (!item.released) {
        break;
      }
      if (!item.sent) {
        if (item.logMessage.type !== "system") {
          this.sendFunction(item.logMessage);
        }
        item.sent = true;
      }
      this.queue.shift();
    }
  }
  /**
   * Process queue - send messages in ID order that are released
   */
  async processQueue() {
    await this.lock.inLock(async () => {
      this.processQueueInternal();
    });
  }
  /**
   * Flush all messages immediately (for cleanup)
   */
  async flush() {
    await this.lock.inLock(async () => {
      for (const timer of this.delayTimers.values()) {
        clearTimeout(timer);
      }
      this.delayTimers.clear();
      for (const item of this.queue) {
        item.released = true;
      }
      this.processQueueInternal();
    });
  }
  /**
   * Schedule processing on next tick
   */
  scheduleProcessing() {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }
    this.processTimer = setTimeout(() => {
      this.processQueue();
    }, 0);
  }
  /**
   * Cleanup timers and resources
   */
  destroy() {
    if (this.processTimer) {
      clearTimeout(this.processTimer);
    }
    for (const timer of this.delayTimers.values()) {
      clearTimeout(timer);
    }
    this.delayTimers.clear();
  }
}

function getAskUserQuestionToolCallIds(message) {
  if (message.type !== "assistant") {
    return [];
  }
  const assistantMessage = message;
  const content = assistantMessage.message.content;
  if (!Array.isArray(content)) {
    return [];
  }
  const ids = [];
  for (const block of content) {
    if (block.type === "tool_use" && block.name === "AskUserQuestion" && typeof block.id === "string" && block.id.length > 0) {
      ids.push(block.id);
    }
  }
  return ids;
}

async function claudeRemoteLauncher(session) {
  api.logger.debug("[claudeRemoteLauncher] Starting remote launcher");
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  api.logger.debug(`[claudeRemoteLauncher] TTY available: ${hasTTY}`);
  let messageBuffer = new MessageBuffer();
  let inkInstance = null;
  if (hasTTY) {
    console.clear();
    inkInstance = ink.render(React.createElement(RemoteModeDisplay, {
      messageBuffer,
      logPath: process.env.DEBUG ? session.logPath : void 0,
      onExit: async () => {
        api.logger.debug("[remote]: Exiting client via Ctrl-C");
        if (!exitReason) {
          exitReason = "exit";
        }
        await abort();
      },
      onSwitchToLocal: () => {
        api.logger.debug("[remote]: Switching to local mode via double space");
        doSwitch();
      }
    }), {
      exitOnCtrlC: false,
      patchConsole: false
    });
  }
  if (hasTTY) {
    process.stdin.resume();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
  }
  let exitReason = null;
  let abortController = null;
  let abortFuture = null;
  async function abort() {
    if (abortController && !abortController.signal.aborted) {
      abortController.abort();
    }
    await abortFuture?.promise;
  }
  async function doAbort() {
    api.logger.debug("[remote]: doAbort");
    await abort();
  }
  async function doSwitch() {
    api.logger.debug("[remote]: doSwitch");
    if (!exitReason) {
      exitReason = "switch";
    }
    await abort();
  }
  session.client.rpcHandlerManager.registerHandler("abort", doAbort);
  session.client.rpcHandlerManager.registerHandler("switch", doSwitch);
  const permissionHandler = new PermissionHandler(session);
  const messageQueue = new OutgoingMessageQueue(
    (logMessage) => session.client.sendClaudeSessionMessage(logMessage)
  );
  permissionHandler.setOnPermissionRequest((toolCallId) => {
    messageQueue.releaseToolCall(toolCallId);
  });
  const sdkToLogConverter = new SDKToLogConverter({
    sessionId: session.sessionId || "unknown",
    cwd: session.path,
    version: process.env.npm_package_version
  }, permissionHandler.getResponses());
  let ongoingToolCalls = /* @__PURE__ */ new Map();
  let notifiedQuestionToolCalls = /* @__PURE__ */ new Set();
  let runtimeErrorNotified = false;
  function onMessage(message) {
    formatClaudeMessageForInk(message, messageBuffer);
    if (!runtimeErrorNotified && message.type === "system" && (message.error_status || message.error)) {
      runtimeErrorNotified = true;
      const status = message.error_status ? ` (${message.error_status})` : "";
      const detail = message.error || message.subtype || "unknown_error";
      const text = `Claude SDK error${status}: ${detail}`;
      api.logger.warn("[remote]: runtime system error", {
        subtype: message.subtype,
        error_status: message.error_status,
        error: message.error
      });
      session.client.sendSessionEvent({ type: "message", message: text });
    }
    if (message.type === "assistant") {
      let umessage = message;
      if (umessage.message.content && Array.isArray(umessage.message.content)) {
        for (let c of umessage.message.content) {
          if (c.type === "tool_use") {
            api.logger.debug("[remote]: detected tool use " + c.id + " parent: " + umessage.parent_tool_use_id);
            ongoingToolCalls.set(c.id, { parentToolCallId: umessage.parent_tool_use_id ?? null });
          }
        }
      }
    }
    for (const toolCallId of getAskUserQuestionToolCallIds(message)) {
      if (notifiedQuestionToolCalls.has(toolCallId)) {
        continue;
      }
      notifiedQuestionToolCalls.add(toolCallId);
      session.api.push().sendSessionNotification({
        kind: "question",
        metadata: session.client.getMetadata(),
        data: {
          sessionId: session.client.sessionId,
          tool: "AskUserQuestion",
          toolCallId,
          type: "question_request",
          provider: "claude"
        }
      });
    }
    if (message.type === "user") {
      let umessage = message;
      if (umessage.message.content && Array.isArray(umessage.message.content)) {
        for (let c of umessage.message.content) {
          if (c.type === "tool_result" && c.tool_use_id) {
            ongoingToolCalls.delete(c.tool_use_id);
            messageQueue.releaseToolCall(c.tool_use_id);
          }
        }
      }
    }
    const logMessage = sdkToLogConverter.convert(message);
    if (logMessage) {
      if (logMessage.type === "user" && logMessage.message?.content) {
        const content = Array.isArray(logMessage.message.content) ? logMessage.message.content : [];
        for (let i = 0; i < content.length; i++) {
          const c = content[i];
          if (c.type === "tool_result" && c.tool_use_id) {
            const responses = permissionHandler.getResponses();
            const response = responses.get(c.tool_use_id);
            if (response) {
              const permissions = {
                date: response.receivedAt || Date.now(),
                result: response.approved ? "approved" : "denied"
              };
              if (response.mode) {
                permissions.mode = response.mode;
              }
              if (response.allowTools && response.allowTools.length > 0) {
                permissions.allowedTools = response.allowTools;
              }
              content[i] = {
                ...c,
                permissions
              };
            }
          }
        }
      }
      if (logMessage.type === "assistant" && message.type === "assistant") {
        const assistantMsg = message;
        const toolCallIds = [];
        if (assistantMsg.message.content && Array.isArray(assistantMsg.message.content)) {
          for (const block of assistantMsg.message.content) {
            if (block.type === "tool_use" && block.id) {
              toolCallIds.push(block.id);
            }
          }
        }
        if (toolCallIds.length > 0) {
          const isSidechain = assistantMsg.parent_tool_use_id !== void 0;
          if (!isSidechain) {
            messageQueue.enqueue(logMessage, {
              delay: 250,
              toolCallIds
            });
            return;
          }
        }
      }
      messageQueue.enqueue(logMessage);
    }
    if (message.type === "assistant") {
      let umessage = message;
      if (umessage.message.content && Array.isArray(umessage.message.content)) {
        for (let c of umessage.message.content) {
          if (c.type === "tool_use" && c.name === "Task" && c.input && typeof c.input.prompt === "string") {
            const logMessage2 = sdkToLogConverter.convertSidechainUserMessage(c.id, c.input.prompt);
            if (logMessage2) {
              messageQueue.enqueue(logMessage2);
            }
          }
        }
      }
    }
  }
  try {
    let pending = null;
    let previousSessionId = null;
    while (!exitReason) {
      api.logger.debug("[remote]: launch");
      messageBuffer.addMessage("\u2550".repeat(40), "status");
      const isNewSession = session.sessionId !== previousSessionId;
      if (isNewSession) {
        messageBuffer.addMessage("Starting new Claude session...", "status");
        permissionHandler.reset();
        sdkToLogConverter.resetParentChain();
        api.logger.debug(`[remote]: New session detected (previous: ${previousSessionId}, current: ${session.sessionId})`);
      } else {
        messageBuffer.addMessage("Continuing Claude session...", "status");
        api.logger.debug(`[remote]: Continuing existing session: ${session.sessionId}`);
      }
      previousSessionId = session.sessionId;
      const controller = new AbortController();
      abortController = controller;
      abortFuture = new Future();
      let modeHash = null;
      let mode = null;
      try {
        const remoteResult = await claudeRemote({
          sessionId: session.sessionId,
          path: session.path,
          allowedTools: session.allowedTools ?? [],
          mcpServers: session.mcpServers,
          hookSettingsPath: session.hookSettingsPath,
          jsRuntime: session.jsRuntime,
          canCallTool: permissionHandler.handleToolCall,
          isAborted: (toolCallId) => {
            return permissionHandler.isAborted(toolCallId);
          },
          nextMessage: async () => {
            if (pending) {
              let p = pending;
              pending = null;
              permissionHandler.handleModeChange(p.mode.permissionMode);
              return p;
            }
            let msg = await session.queue.waitForMessagesAndGetAsString(controller.signal);
            if (msg) {
              if (modeHash && msg.hash !== modeHash || msg.isolate) {
                api.logger.debug("[remote]: mode has changed, pending message");
                pending = msg;
                return null;
              }
              modeHash = msg.hash;
              mode = msg.mode;
              permissionHandler.handleModeChange(mode.permissionMode);
              return {
                message: msg.message,
                mode: msg.mode
              };
            }
            return null;
          },
          onSessionFound: (sessionId) => {
            sdkToLogConverter.updateSessionId(sessionId);
            session.onSessionFound(sessionId);
          },
          onSDKMetadata: (metadata) => {
            api.logger.debug("[remote] SDK metadata received, updating session:", metadata);
            session.client.updateMetadata((currentMetadata) => ({
              ...currentMetadata,
              tools: metadata.tools,
              slashCommands: metadata.slashCommands,
              mcpServers: metadata.mcpServers,
              skills: metadata.skills
            }));
          },
          onQueryReady: (q) => {
            permissionHandler.setPermissionModeUpdater(async (mode2) => {
              await q.setPermissionMode(mode2);
            });
          },
          onThinkingChange: session.onThinkingChange,
          claudeEnvVars: session.claudeEnvVars,
          claudeArgs: session.claudeArgs,
          onMessage,
          onCompletionEvent: (message) => {
            api.logger.debug(`[remote]: Completion event: ${message}`);
            session.client.sendSessionEvent({ type: "message", message });
          },
          onSessionReset: () => {
            api.logger.debug("[remote]: Session reset");
            session.clearSessionId();
          },
          onReady: () => {
            session.client.closeClaudeSessionTurn("completed");
            if (!pending && session.queue.size() === 0) {
              session.api.push().sendSessionNotification({
                kind: "done",
                metadata: session.client.getMetadata(),
                data: {
                  sessionId: session.client.sessionId,
                  type: "ready",
                  provider: "claude"
                }
              });
            }
          },
          signal: abortController.signal
        });
        session.consumeOneTimeFlags();
        if (!exitReason && abortController.signal.aborted) {
          session.client.closeClaudeSessionTurn("cancelled");
          session.client.sendSessionEvent({ type: "message", message: "Aborted by user" });
        }
      } catch (e) {
        const launchErrorDetails = {
          name: e?.name,
          message: e?.message || String(e),
          stack: e?.stack,
          cause: e?.cause?.message || e?.cause
        };
        api.logger.debug("[remote]: launch error", launchErrorDetails);
        api.logger.warn("[remote]: launch error details", launchErrorDetails);
        if (!exitReason) {
          session.client.closeClaudeSessionTurn("failed");
          session.client.sendSessionEvent({ type: "message", message: "Process exited unexpectedly" });
          continue;
        }
      } finally {
        api.logger.debug("[remote]: launch finally");
        for (let [toolCallId, { parentToolCallId }] of ongoingToolCalls) {
          const converted = sdkToLogConverter.generateInterruptedToolResult(toolCallId, parentToolCallId);
          if (converted) {
            api.logger.debug("[remote]: terminating tool call " + toolCallId + " parent: " + parentToolCallId);
            session.client.sendClaudeSessionMessage(converted);
          }
        }
        ongoingToolCalls.clear();
        api.logger.debug("[remote]: flushing message queue");
        await messageQueue.flush();
        messageQueue.destroy();
        api.logger.debug("[remote]: message queue flushed");
        abortController = null;
        abortFuture?.resolve(void 0);
        abortFuture = null;
        api.logger.debug("[remote]: launch done");
        permissionHandler.reset();
        modeHash = null;
        mode = null;
      }
    }
  } finally {
    permissionHandler.reset();
    process.stdin.off("data", abort);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (inkInstance) {
      inkInstance.unmount();
    }
    messageBuffer.clear();
    if (abortFuture) {
      abortFuture.resolve(void 0);
    }
  }
  return exitReason || "exit";
}

async function loop(opts) {
  const logPath = api.logger.logFilePath;
  let session = new Session({
    api: opts.api,
    client: opts.session,
    path: opts.path,
    sessionId: null,
    claudeEnvVars: opts.claudeEnvVars,
    claudeArgs: opts.claudeArgs,
    mcpServers: opts.mcpServers,
    logPath,
    messageQueue: opts.messageQueue,
    allowedTools: opts.allowedTools,
    sandboxConfig: opts.sandboxConfig,
    onModeChange: opts.onModeChange,
    hookSettingsPath: opts.hookSettingsPath,
    jsRuntime: opts.jsRuntime
  });
  opts.onSessionReady?.(session);
  let mode = opts.startingMode ?? "local";
  while (true) {
    api.logger.debug(`[loop] Iteration with mode: ${mode}`);
    switch (mode) {
      case "local": {
        const result = await claudeLocalLauncher(session);
        switch (result.type) {
          case "switch":
            mode = "remote";
            opts.onModeChange?.(mode);
            break;
          case "exit":
            return result.code;
        }
        break;
      }
      case "remote": {
        const reason = await claudeRemoteLauncher(session);
        switch (reason) {
          case "exit":
            return 0;
          case "switch":
            mode = "local";
            opts.onModeChange?.(mode);
            break;
        }
        break;
      }
    }
  }
}

class MessageQueue2 {
  queue = [];
  // Made public for testing
  waiter = null;
  closed = false;
  onMessageHandler = null;
  modeHasher;
  constructor(modeHasher, onMessageHandler = null) {
    this.modeHasher = modeHasher;
    this.onMessageHandler = onMessageHandler;
    api.logger.debug(`[MessageQueue2] Initialized`);
  }
  /**
   * Set a handler that will be called when a message arrives
   */
  setOnMessage(handler) {
    this.onMessageHandler = handler;
  }
  /**
   * Push a message to the queue with a mode.
   */
  push(message, mode) {
    if (this.closed) {
      throw new Error("Cannot push to closed queue");
    }
    const modeHash = this.modeHasher(mode);
    api.logger.debug(`[MessageQueue2] push() called with mode hash: ${modeHash}`);
    this.queue.push({
      message,
      mode,
      modeHash,
      isolate: false
    });
    if (this.onMessageHandler) {
      this.onMessageHandler(message, mode);
    }
    if (this.waiter) {
      api.logger.debug(`[MessageQueue2] Notifying waiter`);
      const waiter = this.waiter;
      this.waiter = null;
      waiter(true);
    }
    api.logger.debug(`[MessageQueue2] push() completed. Queue size: ${this.queue.length}`);
  }
  /**
   * Push a message immediately without batching delay.
   * Does not clear the queue or enforce isolation.
   */
  pushImmediate(message, mode) {
    if (this.closed) {
      throw new Error("Cannot push to closed queue");
    }
    const modeHash = this.modeHasher(mode);
    api.logger.debug(`[MessageQueue2] pushImmediate() called with mode hash: ${modeHash}`);
    this.queue.push({
      message,
      mode,
      modeHash,
      isolate: false
    });
    if (this.onMessageHandler) {
      this.onMessageHandler(message, mode);
    }
    if (this.waiter) {
      api.logger.debug(`[MessageQueue2] Notifying waiter for immediate message`);
      const waiter = this.waiter;
      this.waiter = null;
      waiter(true);
    }
    api.logger.debug(`[MessageQueue2] pushImmediate() completed. Queue size: ${this.queue.length}`);
  }
  /**
   * Push a message that must be processed in complete isolation.
   * Clears any pending messages and ensures this message is never batched with others.
   * Used for special commands that require dedicated processing.
   */
  pushIsolateAndClear(message, mode) {
    if (this.closed) {
      throw new Error("Cannot push to closed queue");
    }
    const modeHash = this.modeHasher(mode);
    api.logger.debug(`[MessageQueue2] pushIsolateAndClear() called with mode hash: ${modeHash} - clearing ${this.queue.length} pending messages`);
    this.queue = [];
    this.queue.push({
      message,
      mode,
      modeHash,
      isolate: true
    });
    if (this.onMessageHandler) {
      this.onMessageHandler(message, mode);
    }
    if (this.waiter) {
      api.logger.debug(`[MessageQueue2] Notifying waiter for isolated message`);
      const waiter = this.waiter;
      this.waiter = null;
      waiter(true);
    }
    api.logger.debug(`[MessageQueue2] pushIsolateAndClear() completed. Queue size: ${this.queue.length}`);
  }
  /**
   * Push a message to the beginning of the queue with a mode.
   */
  unshift(message, mode) {
    if (this.closed) {
      throw new Error("Cannot unshift to closed queue");
    }
    const modeHash = this.modeHasher(mode);
    api.logger.debug(`[MessageQueue2] unshift() called with mode hash: ${modeHash}`);
    this.queue.unshift({
      message,
      mode,
      modeHash,
      isolate: false
    });
    if (this.onMessageHandler) {
      this.onMessageHandler(message, mode);
    }
    if (this.waiter) {
      api.logger.debug(`[MessageQueue2] Notifying waiter`);
      const waiter = this.waiter;
      this.waiter = null;
      waiter(true);
    }
    api.logger.debug(`[MessageQueue2] unshift() completed. Queue size: ${this.queue.length}`);
  }
  /**
   * Reset the queue - clears all messages and resets to empty state
   */
  reset() {
    api.logger.debug(`[MessageQueue2] reset() called. Clearing ${this.queue.length} messages`);
    this.queue = [];
    this.closed = false;
    this.waiter = null;
  }
  /**
   * Close the queue - no more messages can be pushed
   */
  close() {
    api.logger.debug(`[MessageQueue2] close() called`);
    this.closed = true;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(false);
    }
  }
  /**
   * Check if the queue is closed
   */
  isClosed() {
    return this.closed;
  }
  /**
   * Get the current queue size
   */
  size() {
    return this.queue.length;
  }
  /**
   * Wait for messages and return all messages with the same mode as a single string
   * Returns { message: string, mode: T } or null if aborted/closed
   */
  async waitForMessagesAndGetAsString(abortSignal) {
    if (this.queue.length > 0) {
      return this.collectBatch();
    }
    if (this.closed || abortSignal?.aborted) {
      return null;
    }
    const hasMessages = await this.waitForMessages(abortSignal);
    if (!hasMessages) {
      return null;
    }
    return this.collectBatch();
  }
  /**
   * Collect a batch of messages with the same mode, respecting isolation requirements
   */
  collectBatch() {
    if (this.queue.length === 0) {
      return null;
    }
    const firstItem = this.queue[0];
    const sameModeMessages = [];
    let mode = firstItem.mode;
    let isolate = firstItem.isolate ?? false;
    const targetModeHash = firstItem.modeHash;
    if (firstItem.isolate) {
      const item = this.queue.shift();
      sameModeMessages.push(item.message);
      api.logger.debug(`[MessageQueue2] Collected isolated message with mode hash: ${targetModeHash}`);
    } else {
      while (this.queue.length > 0 && this.queue[0].modeHash === targetModeHash && !this.queue[0].isolate) {
        const item = this.queue.shift();
        sameModeMessages.push(item.message);
      }
      api.logger.debug(`[MessageQueue2] Collected batch of ${sameModeMessages.length} messages with mode hash: ${targetModeHash}`);
    }
    const combinedMessage = sameModeMessages.join("\n");
    return {
      message: combinedMessage,
      mode,
      hash: targetModeHash,
      isolate
    };
  }
  /**
   * Wait for messages to arrive
   */
  waitForMessages(abortSignal) {
    return new Promise((resolve) => {
      let abortHandler = null;
      if (abortSignal) {
        abortHandler = () => {
          api.logger.debug("[MessageQueue2] Wait aborted");
          if (this.waiter === waiterFunc) {
            this.waiter = null;
          }
          resolve(false);
        };
        abortSignal.addEventListener("abort", abortHandler);
      }
      const waiterFunc = (hasMessages) => {
        if (abortHandler && abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        resolve(hasMessages);
      };
      if (this.queue.length > 0) {
        if (abortHandler && abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        resolve(true);
        return;
      }
      if (this.closed || abortSignal?.aborted) {
        if (abortHandler && abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        resolve(false);
        return;
      }
      this.waiter = waiterFunc;
      api.logger.debug("[MessageQueue2] Waiting for messages...");
    });
  }
}

function deterministicStringify(obj, options = {}) {
  const {
    undefinedBehavior = "omit",
    sortArrays = false,
    replacer,
    includeSymbols = false
  } = options;
  const seen = /* @__PURE__ */ new WeakSet();
  function processValue(value, key) {
    if (replacer && key !== void 0) {
      value = replacer(key, value);
    }
    if (value === null) return null;
    if (value === void 0) {
      switch (undefinedBehavior) {
        case "omit":
          return void 0;
        case "null":
          return null;
        case "throw":
          throw new Error(`Undefined value at key: ${key}`);
      }
    }
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof RegExp) {
      return value.toString();
    }
    if (typeof value === "function") {
      return void 0;
    }
    if (typeof value === "symbol") {
      return includeSymbols ? value.toString() : void 0;
    }
    if (typeof value === "bigint") {
      return value.toString() + "n";
    }
    if (seen.has(value)) {
      throw new Error("Circular reference detected");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const processed2 = value.map((item, index) => processValue(item, String(index))).filter((item) => item !== void 0);
      if (sortArrays) {
        processed2.sort((a, b) => {
          const aStr = JSON.stringify(processValue(a));
          const bStr = JSON.stringify(processValue(b));
          return aStr.localeCompare(bStr);
        });
      }
      seen.delete(value);
      return processed2;
    }
    if (value.constructor === Object || value.constructor === void 0) {
      const processed2 = {};
      const keys = Object.keys(value).sort();
      for (const k of keys) {
        const processedValue = processValue(value[k], k);
        if (processedValue !== void 0) {
          processed2[k] = processedValue;
        }
      }
      seen.delete(value);
      return processed2;
    }
    try {
      const plain = { ...value };
      seen.delete(value);
      return processValue(plain, key);
    } catch {
      seen.delete(value);
      return String(value);
    }
  }
  const processed = processValue(obj);
  return JSON.stringify(processed);
}
function hashObject(obj, options, encoding = "hex") {
  const jsonString = deterministicStringify(obj, options);
  return crypto.createHash("sha256").update(jsonString).digest(encoding);
}

async function daemonPost(path, body) {
  const state = await persistence.readDaemonState();
  if (!state?.httpPort) {
    const errorMessage = "No daemon running, no state file found";
    api.logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    };
  }
  try {
    process.kill(state.pid, 0);
  } catch (error) {
    const errorMessage = "Daemon is not running, file is stale";
    api.logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    };
  }
  try {
    const timeout = process.env.HAPPY_DAEMON_HTTP_TIMEOUT ? parseInt(process.env.HAPPY_DAEMON_HTTP_TIMEOUT) : 1e4;
    const response = await fetch(`http://127.0.0.1:${state.httpPort}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      // Mostly increased for stress test
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) {
      const errorMessage = `Request failed: ${path}, HTTP ${response.status}`;
      api.logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
      return {
        error: errorMessage
      };
    }
    return await response.json();
  } catch (error) {
    const errorMessage = `Request failed: ${path}, ${error instanceof Error ? error.message : "Unknown error"}`;
    api.logger.debug(`[CONTROL CLIENT] ${errorMessage}`);
    return {
      error: errorMessage
    };
  }
}
const SESSION_STARTED_RETRY_TIMEOUT_MS = 3e3;
const SESSION_STARTED_RETRY_INTERVAL_MS = 100;
async function notifyDaemonSessionStarted(sessionId, metadata, encryption) {
  const payload = { sessionId, metadata, encryption };
  const deadline = Date.now() + SESSION_STARTED_RETRY_TIMEOUT_MS;
  let result;
  while (true) {
    result = await daemonPost("/session-started", payload);
    if (!result?.error) {
      return result;
    }
    if (Date.now() >= deadline) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, SESSION_STARTED_RETRY_INTERVAL_MS));
  }
}
async function listDaemonSessions() {
  const result = await daemonPost("/list");
  return result.children || [];
}
async function stopDaemonSession(sessionId) {
  const result = await daemonPost("/stop-session", { sessionId });
  return result.success || false;
}
async function stopDaemonHttp() {
  await daemonPost("/stop");
}
async function checkIfDaemonRunningAndCleanupStaleState() {
  const state = await persistence.readDaemonState();
  if (!state) {
    return false;
  }
  try {
    process.kill(state.pid, 0);
  } catch {
    api.logger.debug("[DAEMON RUN] Daemon PID not running, cleaning up state");
    await cleanupDaemonState();
    return false;
  }
  if (state.httpPort) {
    try {
      const response = await fetch(`http://127.0.0.1:${state.httpPort}/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(2e3)
      });
      if (response.ok) {
        return true;
      }
    } catch {
      api.logger.debug(`[DAEMON RUN] PID ${state.pid} is alive but HTTP health check failed on port ${state.httpPort}, cleaning up stale state`);
      await cleanupDaemonState();
      return false;
    }
  }
  return true;
}
async function isDaemonRunningCurrentlyInstalledHappyVersion() {
  api.logger.debug("[DAEMON CONTROL] Checking if daemon is running same version");
  const runningDaemon = await checkIfDaemonRunningAndCleanupStaleState();
  if (!runningDaemon) {
    api.logger.debug("[DAEMON CONTROL] No daemon running, returning false");
    return false;
  }
  const state = await persistence.readDaemonState();
  if (!state) {
    api.logger.debug("[DAEMON CONTROL] No daemon state found, returning false");
    return false;
  }
  const currentCliVersion = api.configuration.currentCliVersion;
  api.logger.debug(`[DAEMON CONTROL] Current CLI version: ${currentCliVersion}, Daemon started with version: ${state.startedWithCliVersion}`);
  return currentCliVersion === state.startedWithCliVersion;
}
async function cleanupDaemonState() {
  try {
    await persistence.clearDaemonState();
    api.logger.debug("[DAEMON RUN] Daemon state file removed");
  } catch (error) {
    api.logger.debug("[DAEMON RUN] Error cleaning up daemon metadata", error);
  }
}
async function stopDaemon() {
  try {
    const state = await persistence.readDaemonState();
    if (!state) {
      api.logger.debug("No daemon state found");
      return;
    }
    api.logger.debug(`Stopping daemon with PID ${state.pid}`);
    try {
      await stopDaemonHttp();
      await waitForProcessDeath(state.pid, 2e3);
      api.logger.debug("Daemon stopped gracefully via HTTP");
      return;
    } catch (error) {
      api.logger.debug("HTTP stop failed, will force kill", error);
    }
    try {
      process.kill(state.pid, "SIGKILL");
      api.logger.debug("Force killed daemon");
    } catch (error) {
      api.logger.debug("Daemon already dead");
    }
  } catch (error) {
    api.logger.debug("Error stopping daemon", error);
  }
}
async function waitForProcessDeath(pid, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return;
    }
  }
  throw new Error("Process did not die within timeout");
}

async function findAllHappyProcesses() {
  try {
    const processes = await psList();
    const allProcesses = [];
    for (const proc of processes) {
      const cmd = proc.cmd || "";
      const name = proc.name || "";
      const isHappy = name.includes("happy") || name === "node" && (cmd.includes("happy-cli") || cmd.includes("dist/index.mjs")) || cmd.includes("happy.mjs") || cmd.includes("happy-coder") || // legacy npm package name
      cmd.includes("/happy/") || cmd.includes("tsx") && cmd.includes("src/index.ts") && cmd.includes("happy-cli");
      if (!isHappy) continue;
      let type = "unknown";
      if (proc.pid === process.pid) {
        type = "current";
      } else if (cmd.includes("--version")) {
        type = cmd.includes("tsx") ? "dev-daemon-version-check" : "daemon-version-check";
      } else if (cmd.includes("daemon start-sync") || cmd.includes("daemon start")) {
        type = cmd.includes("tsx") ? "dev-daemon" : "daemon";
      } else if (cmd.includes("--started-by daemon")) {
        type = cmd.includes("tsx") ? "dev-daemon-spawned" : "daemon-spawned-session";
      } else if (cmd.includes("doctor")) {
        type = cmd.includes("tsx") ? "dev-doctor" : "doctor";
      } else if (cmd.includes("--yolo")) {
        type = "dev-session";
      } else {
        type = cmd.includes("tsx") ? "dev-related" : "user-session";
      }
      allProcesses.push({ pid: proc.pid, command: cmd || name, type });
    }
    return allProcesses;
  } catch (error) {
    return [];
  }
}
async function findRunawayHappyProcesses() {
  const allProcesses = await findAllHappyProcesses();
  return allProcesses.filter(
    (p) => p.pid !== process.pid && (p.type === "daemon" || p.type === "dev-daemon" || p.type === "daemon-spawned-session" || p.type === "dev-daemon-spawned" || p.type === "daemon-version-check" || p.type === "dev-daemon-version-check")
  ).map((p) => ({ pid: p.pid, command: p.command }));
}
async function killRunawayHappyProcesses() {
  const runawayProcesses = await findRunawayHappyProcesses();
  const errors = [];
  let killed = 0;
  for (const { pid, command } of runawayProcesses) {
    try {
      console.log(`Killing runaway process PID ${pid}: ${command}`);
      if (process.platform === "win32") {
        const result = spawn.sync("taskkill", ["/F", "/PID", pid.toString()], { stdio: "pipe" });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`taskkill exited with code ${result.status}`);
      } else {
        process.kill(pid, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        const processes = await psList();
        const stillAlive = processes.find((p) => p.pid === pid);
        if (stillAlive) {
          console.log(`Process PID ${pid} ignored SIGTERM, using SIGKILL`);
          process.kill(pid, "SIGKILL");
        }
      }
      console.log(`Successfully killed runaway process PID ${pid}`);
      killed++;
    } catch (error) {
      const errorMessage = error.message;
      errors.push({ pid, error: errorMessage });
      console.log(`Failed to kill process PID ${pid}: ${errorMessage}`);
    }
  }
  return { killed, errors };
}

function getEnvironmentInfo() {
  return {
    PWD: process.env.PWD,
    HAPPY_HOME_DIR: process.env.HAPPY_HOME_DIR,
    HAPPY_VARIANT: process.env.HAPPY_VARIANT,
    HAPPY_SERVER_URL: process.env.HAPPY_SERVER_URL,
    HAPPY_PROJECT_ROOT: process.env.HAPPY_PROJECT_ROOT,
    DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING: process.env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING,
    NODE_ENV: process.env.NODE_ENV,
    DEBUG: process.env.DEBUG,
    workingDirectory: process.cwd(),
    processArgv: process.argv,
    happyDir: api.configuration?.happyHomeDir,
    serverUrl: api.configuration?.serverUrl,
    logsDir: api.configuration?.logsDir,
    processPid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    user: process.env.USER,
    home: process.env.HOME,
    shell: process.env.SHELL,
    terminal: process.env.TERM
  };
}
function getLogFiles(logDir) {
  if (!node_fs.existsSync(logDir)) {
    return [];
  }
  try {
    return node_fs.readdirSync(logDir).filter((file) => file.endsWith(".log")).map((file) => {
      const path = node_path.join(logDir, file);
      const stats = node_fs.statSync(path);
      return { file, path, modified: stats.mtime };
    }).sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch {
    return [];
  }
}
async function runDoctorDaemon() {
  console.log(chalk.bold("\n\u{1F916} Daemon Status"));
  try {
    const isRunning = await checkIfDaemonRunningAndCleanupStaleState();
    const state = await persistence.readDaemonState();
    if (isRunning && state) {
      console.log(chalk.green("\u2713 Daemon is running"));
      console.log(`  PID:     ${state.pid}`);
      console.log(`  Port:    ${state.httpPort}`);
      console.log(`  Started: ${new Date(state.startTime).toLocaleString()}`);
      console.log(`  Version: ${state.startedWithCliVersion}`);
    } else if (state && !isRunning) {
      console.log(chalk.yellow("\u26A0\uFE0F  Daemon state exists but process not running (stale)"));
    } else {
      console.log(chalk.red("\u274C Daemon is not running"));
    }
    if (state) {
      console.log(chalk.bold("\n\u{1F4C4} Daemon State:"));
      console.log(chalk.blue(`Location: ${api.configuration.daemonStateFile}`));
      console.log(chalk.gray(JSON.stringify(state, null, 2)));
    }
  } catch (error) {
    console.log(chalk.red("\u274C Error checking daemon status"));
  }
  console.log(chalk.gray("\nRun `happy doctor` for full diagnostics.\n"));
}
async function runDoctorCommand() {
  console.log(chalk.bold.cyan("\n\u{1FA7A} Happy CLI Doctor\n"));
  try {
    const allProcesses = await findAllHappyProcesses();
    if (allProcesses.length > 0) {
      console.log(chalk.bold("\u{1F50D} All Happy CLI Processes"));
      const grouped = allProcesses.reduce((groups, process2) => {
        if (!groups[process2.type]) groups[process2.type] = [];
        groups[process2.type].push(process2);
        return groups;
      }, {});
      Object.entries(grouped).forEach(([type, processes]) => {
        const typeLabels = {
          "current": "\u{1F4CD} Current Process",
          "daemon": "\u{1F916} Daemon",
          "daemon-version-check": "\u{1F50D} Daemon Version Check (stuck)",
          "daemon-spawned-session": "\u{1F517} Daemon-Spawned Sessions",
          "user-session": "\u{1F464} User Sessions",
          "dev-daemon": "\u{1F6E0}\uFE0F  Dev Daemon",
          "dev-daemon-version-check": "\u{1F6E0}\uFE0F  Dev Daemon Version Check (stuck)",
          "dev-session": "\u{1F6E0}\uFE0F  Dev Sessions",
          "dev-doctor": "\u{1F6E0}\uFE0F  Dev Doctor",
          "dev-related": "\u{1F6E0}\uFE0F  Dev Related",
          "doctor": "\u{1FA7A} Doctor",
          "unknown": "\u2753 Unknown"
        };
        console.log(chalk.blue(`
${typeLabels[type] || type}:`));
        processes.forEach(({ pid, command }) => {
          const color = type === "current" ? chalk.green : type.startsWith("dev") ? chalk.cyan : type.includes("daemon") ? chalk.blue : chalk.gray;
          console.log(`  ${color(`PID ${pid}`)}: ${chalk.gray(command)}`);
        });
      });
      if (allProcesses.length > 1) {
        console.log(chalk.bold("\n\u{1F4A1} Process Management"));
        console.log(chalk.gray("To clean up runaway processes: happy doctor clean"));
      }
    } else {
      console.log(chalk.red("\u274C No happy processes found"));
    }
  } catch (error) {
    console.log(chalk.red("\u274C Error listing processes"));
  }
  console.log(chalk.bold("\n\u{1F4DD} Log Files"));
  const allLogs = getLogFiles(api.configuration.logsDir);
  if (allLogs.length > 0) {
    const daemonLogs = allLogs.filter(({ file }) => file.includes("daemon"));
    const regularLogs = allLogs.filter(({ file }) => !file.includes("daemon"));
    if (regularLogs.length > 0) {
      console.log(chalk.blue("\nRecent Logs:"));
      const logsToShow = regularLogs.slice(0, 10);
      logsToShow.forEach(({ file, path, modified }) => {
        console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
        console.log(chalk.gray(`    ${path}`));
      });
      if (regularLogs.length > 10) {
        console.log(chalk.gray(`  ... and ${regularLogs.length - 10} more log files`));
      }
    }
    if (daemonLogs.length > 0) {
      console.log(chalk.blue("\nDaemon Logs:"));
      const daemonLogsToShow = daemonLogs.slice(0, 5);
      daemonLogsToShow.forEach(({ file, path, modified }) => {
        console.log(`  ${chalk.green(file)} - ${modified.toLocaleString()}`);
        console.log(chalk.gray(`    ${path}`));
      });
      if (daemonLogs.length > 5) {
        console.log(chalk.gray(`  ... and ${daemonLogs.length - 5} more daemon log files`));
      }
    } else {
      console.log(chalk.yellow("\nNo daemon log files found"));
    }
  } else {
    console.log(chalk.yellow("No log files found"));
  }
  console.log(chalk.bold("\n\u{1F527} Daemon Spawn Diagnostics"));
  const projectRoot = api.projectPath();
  const wrapperPath = node_path.join(projectRoot, "bin", "happy.mjs");
  const cliEntrypoint = node_path.join(projectRoot, "dist", "index.mjs");
  console.log(`Project Root: ${chalk.blue(projectRoot)}`);
  console.log(`Wrapper Script: ${chalk.blue(wrapperPath)}`);
  console.log(`CLI Entrypoint: ${chalk.blue(cliEntrypoint)}`);
  console.log(`Wrapper Exists: ${node_fs.existsSync(wrapperPath) ? chalk.green("\u2713 Yes") : chalk.red("\u274C No")}`);
  console.log(`CLI Exists: ${node_fs.existsSync(cliEntrypoint) ? chalk.green("\u2713 Yes") : chalk.red("\u274C No")}`);
  console.log(chalk.bold("\n\u{1F30D} Environment Variables"));
  const env = getEnvironmentInfo();
  console.log(`HAPPY_HOME_DIR: ${env.HAPPY_HOME_DIR ? chalk.green(env.HAPPY_HOME_DIR) : chalk.gray("not set")}`);
  console.log(`HAPPY_SERVER_URL: ${env.HAPPY_SERVER_URL ? chalk.green(env.HAPPY_SERVER_URL) : chalk.gray("not set")}`);
  console.log(`DANGEROUSLY_LOG_TO_SERVER: ${env.DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING ? chalk.yellow("ENABLED") : chalk.gray("not set")}`);
  console.log(`DEBUG: ${env.DEBUG ? chalk.green(env.DEBUG) : chalk.gray("not set")}`);
  console.log(`NODE_ENV: ${env.NODE_ENV ? chalk.green(env.NODE_ENV) : chalk.gray("not set")}`);
  try {
    const settings = await persistence.readSettings();
    console.log(chalk.bold("\n\u{1F4C4} Settings (settings.json):"));
    console.log(chalk.gray(JSON.stringify(settings, null, 2)));
  } catch (error) {
    console.log(chalk.bold("\n\u{1F4C4} Settings:"));
    console.log(chalk.red("\u274C Failed to read settings"));
  }
  console.log(chalk.bold("\n\u{1F41B} Support & Bug Reports"));
  console.log(`Report issues: ${chalk.blue("https://github.com/slopus/happy-cli/issues")}`);
  console.log(`Documentation: ${chalk.blue("https://happy.engineering/")}`);
  console.log(chalk.bold("\n\u{1F4CB} Basic Information"));
  console.log(`Happy CLI Version: ${chalk.green(api.packageJson.version)}`);
  console.log(`Platform: ${chalk.green(process.platform)} ${process.arch}`);
  console.log(`Node.js Version: ${chalk.green(process.version)}`);
  console.log(chalk.bold("\n\u2699\uFE0F  Configuration"));
  console.log(`Happy Home: ${chalk.blue(api.configuration.happyHomeDir)}`);
  console.log(`Server URL: ${chalk.blue(api.configuration.serverUrl)}`);
  console.log(`Logs Dir: ${chalk.blue(api.configuration.logsDir)}`);
  console.log(chalk.bold("\n\u{1F510} Authentication"));
  try {
    const credentials = await persistence.readCredentials();
    if (credentials) {
      console.log(chalk.green("\u2713 Authenticated (credentials found)"));
    } else {
      console.log(chalk.yellow("\u26A0\uFE0F  Not authenticated (no credentials)"));
    }
  } catch (error) {
    console.log(chalk.red("\u274C Error reading credentials"));
  }
  console.log(chalk.bold("\n\u{1F916} Daemon Status"));
  try {
    const isRunning = await checkIfDaemonRunningAndCleanupStaleState();
    const state = await persistence.readDaemonState();
    if (isRunning && state) {
      console.log(chalk.green("\u2713 Daemon is running"));
      console.log(`  PID:     ${state.pid}`);
      console.log(`  Port:    ${state.httpPort}`);
      console.log(`  Started: ${new Date(state.startTime).toLocaleString()}`);
      console.log(`  Version: ${state.startedWithCliVersion}`);
    } else if (state && !isRunning) {
      console.log(chalk.yellow("\u26A0\uFE0F  Daemon state exists but process not running (stale)"));
    } else {
      console.log(chalk.red("\u274C Daemon is not running"));
    }
    if (state) {
      console.log(chalk.bold("\n\u{1F4C4} Daemon State:"));
      console.log(chalk.blue(`Location: ${api.configuration.daemonStateFile}`));
      console.log(chalk.gray(JSON.stringify(state, null, 2)));
    }
  } catch (error) {
    console.log(chalk.red("\u274C Error checking daemon status"));
  }
  console.log(chalk.green("\n\u2705 Doctor diagnosis complete!\n"));
}

function displayQRCode(url) {
  console.log("=".repeat(80));
  console.log("\u{1F4F1} To authenticate, scan this QR code with your mobile device:");
  console.log("=".repeat(80));
  qrcode.generate(url, { small: true }, (qr) => {
    for (let l of qr.split("\n")) {
      console.log(" ".repeat(10) + l);
    }
  });
  console.log("=".repeat(80));
}

function generateWebAuthUrl(publicKey) {
  const publicKeyBase64 = api.encodeBase64(publicKey, "base64url");
  return `${api.configuration.webappUrl}/terminal/connect#key=${publicKeyBase64}`;
}

async function openBrowser(url) {
  try {
    if (!process.stdout.isTTY || process.env.CI || process.env.HEADLESS) {
      api.logger.debug("[browser] Headless environment detected, skipping browser open");
      return false;
    }
    api.logger.debug(`[browser] Attempting to open URL: ${url}`);
    await open(url);
    api.logger.debug("[browser] Browser opened successfully");
    return true;
  } catch (error) {
    api.logger.debug("[browser] Failed to open browser:", error);
    return false;
  }
}

const AuthSelector = ({ onSelect, onCancel }) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const options = [
    {
      method: "mobile",
      label: "Mobile App"
    },
    {
      method: "web",
      label: "Web Browser"
    }
  ];
  ink.useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(options[selectedIndex].method);
    } else if (key.escape || key.ctrl && input === "c") {
      onCancel();
    } else if (input === "1") {
      setSelectedIndex(0);
      onSelect("mobile");
    } else if (input === "2") {
      setSelectedIndex(1);
      onSelect("web");
    }
  });
  return /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", paddingY: 1 }, /* @__PURE__ */ React.createElement(ink.Box, { marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, null, "How would you like to authenticate?")), /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column" }, options.map((option, index) => {
    const isSelected = selectedIndex === index;
    return /* @__PURE__ */ React.createElement(ink.Box, { key: option.method, marginY: 0 }, /* @__PURE__ */ React.createElement(ink.Text, { color: isSelected ? "cyan" : "gray" }, isSelected ? "\u203A " : "  ", index + 1, ". ", option.label));
  })), /* @__PURE__ */ React.createElement(ink.Box, { marginTop: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { dimColor: true }, "Use arrows or 1-2 to select, Enter to confirm")));
};

async function doAuth() {
  console.clear();
  const authMethod = await selectAuthenticationMethod();
  if (!authMethod) {
    console.log("\nAuthentication cancelled.\n");
    process.exit(0);
  }
  const secret = new Uint8Array(node_crypto.randomBytes(32));
  const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);
  try {
    if (process.env.DEBUG) {
      console.log(`[AUTH DEBUG] Sending auth request to: ${api.configuration.serverUrl}/v1/auth/request`);
      console.log(`[AUTH DEBUG] Public key: ${api.encodeBase64(keypair.publicKey).substring(0, 20)}...`);
    }
    await axios.post(`${api.configuration.serverUrl}/v1/auth/request`, {
      publicKey: api.encodeBase64(keypair.publicKey),
      supportsV2: true
    }, {
      headers: {
        "X-Happy-Client": `cli/${api.configuration.currentCliVersion}`
      }
    });
    if (process.env.DEBUG) {
      console.log(`[AUTH DEBUG] Auth request sent successfully`);
    }
  } catch (error) {
    if (process.env.DEBUG) {
      console.log(`[AUTH DEBUG] Failed to send auth request:`, error);
    }
    console.log("Failed to create authentication request, please try again later.");
    return null;
  }
  if (authMethod === "mobile") {
    return await doMobileAuth(keypair);
  } else {
    return await doWebAuth(keypair);
  }
}
function selectAuthenticationMethod() {
  return new Promise((resolve) => {
    let hasResolved = false;
    const onSelect = (method) => {
      if (!hasResolved) {
        hasResolved = true;
        app.unmount();
        resolve(method);
      }
    };
    const onCancel = () => {
      if (!hasResolved) {
        hasResolved = true;
        app.unmount();
        resolve(null);
      }
    };
    const app = ink.render(React.createElement(AuthSelector, { onSelect, onCancel }), {
      exitOnCtrlC: false,
      patchConsole: false
    });
  });
}
async function doMobileAuth(keypair) {
  console.clear();
  console.log("\nMobile Authentication\n");
  console.log("Scan this QR code with your Happy mobile app:\n");
  const authUrl = "happy://terminal?" + api.encodeBase64Url(keypair.publicKey);
  displayQRCode(authUrl);
  console.log("\nOr manually enter this URL:");
  console.log(authUrl);
  console.log("");
  return await waitForAuthentication(keypair);
}
async function doWebAuth(keypair) {
  console.clear();
  console.log("\nWeb Authentication\n");
  const webUrl = generateWebAuthUrl(keypair.publicKey);
  console.log("Opening your browser...");
  const browserOpened = await openBrowser(webUrl);
  if (browserOpened) {
    console.log("\u2713 Browser opened\n");
    console.log("Complete authentication in your browser window.");
  } else {
    console.log("Could not open browser automatically.");
  }
  console.log("\nIf the browser did not open, please copy and paste this URL:");
  console.log(webUrl);
  console.log("");
  return await waitForAuthentication(keypair);
}
async function waitForAuthentication(keypair) {
  process.stdout.write("Waiting for authentication");
  let dots = 0;
  let cancelled = false;
  const handleInterrupt = () => {
    cancelled = true;
    console.log("\n\nAuthentication cancelled.");
    process.exit(0);
  };
  process.on("SIGINT", handleInterrupt);
  try {
    while (!cancelled) {
      try {
        const response = await axios.post(`${api.configuration.serverUrl}/v1/auth/request`, {
          publicKey: api.encodeBase64(keypair.publicKey),
          supportsV2: true
        }, {
          headers: {
            "X-Happy-Client": `cli/${api.configuration.currentCliVersion}`
          }
        });
        if (response.data.state === "authorized") {
          let token = response.data.token;
          let r = api.decodeBase64(response.data.response);
          let decrypted = decryptWithEphemeralKey(r, keypair.secretKey);
          if (decrypted) {
            if (decrypted.length === 32) {
              const credentials = {
                secret: decrypted,
                token
              };
              await persistence.writeCredentialsLegacy(credentials);
              console.log("\n\n\u2713 Authentication successful\n");
              return {
                encryption: {
                  type: "legacy",
                  secret: decrypted
                },
                token
              };
            } else {
              if (decrypted[0] === 0) {
                const credentials = {
                  publicKey: decrypted.slice(1, 33),
                  machineKey: node_crypto.randomBytes(32),
                  token
                };
                await persistence.writeCredentialsDataKey(credentials);
                console.log("\n\n\u2713 Authentication successful\n");
                return {
                  encryption: {
                    type: "dataKey",
                    publicKey: credentials.publicKey,
                    machineKey: credentials.machineKey
                  },
                  token
                };
              } else {
                console.log("\n\nFailed to decrypt response. Please try again.");
                return null;
              }
            }
          } else {
            console.log("\n\nFailed to decrypt response. Please try again.");
            return null;
          }
        }
      } catch (error) {
        console.log("\n\nFailed to check authentication status. Please try again.");
        return null;
      }
      process.stdout.write("\rWaiting for authentication" + ".".repeat(dots % 3 + 1) + "   ");
      dots++;
      await api.delay(1e3);
    }
  } finally {
    process.off("SIGINT", handleInterrupt);
  }
  return null;
}
function decryptWithEphemeralKey(encryptedBundle, recipientSecretKey) {
  const ephemeralPublicKey = encryptedBundle.slice(0, 32);
  const nonce = encryptedBundle.slice(32, 32 + tweetnacl.box.nonceLength);
  const encrypted = encryptedBundle.slice(32 + tweetnacl.box.nonceLength);
  const decrypted = tweetnacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
  if (!decrypted) {
    return null;
  }
  return decrypted;
}
async function authAndSetupMachineIfNeeded() {
  api.logger.debug("[AUTH] Starting auth and machine setup...");
  let credentials = await persistence.readCredentials();
  let newAuth = false;
  if (!credentials) {
    api.logger.debug("[AUTH] No credentials found, starting authentication flow...");
    const authResult = await doAuth();
    if (!authResult) {
      throw new Error("Authentication failed or was cancelled");
    }
    credentials = authResult;
    newAuth = true;
  } else {
    api.logger.debug("[AUTH] Using existing credentials");
  }
  const settings = await persistence.updateSettings(async (s) => {
    if (newAuth || !s.machineId) {
      return {
        ...s,
        machineId: node_crypto.randomUUID()
      };
    }
    return s;
  });
  api.logger.debug(`[AUTH] Machine ID: ${settings.machineId}`);
  return { credentials, machineId: settings.machineId };
}

let caffeinateProcess = null;
function startCaffeinate() {
  if (api.configuration.disableCaffeinate) {
    api.logger.debug("[caffeinate] Caffeinate disabled via HAPPY_DISABLE_CAFFEINATE environment variable");
    return false;
  }
  if (process.platform !== "darwin") {
    api.logger.debug("[caffeinate] Not on macOS, skipping caffeinate");
    return false;
  }
  if (caffeinateProcess && !caffeinateProcess.killed) {
    api.logger.debug("[caffeinate] Caffeinate already running");
    return true;
  }
  killOrphanedCaffeinateProcesses();
  try {
    caffeinateProcess = child_process.spawn("caffeinate", ["-im"], {
      stdio: "ignore",
      detached: false
    });
    caffeinateProcess.on("error", (error) => {
      api.logger.debug("[caffeinate] Error starting caffeinate:", error);
      caffeinateProcess = null;
    });
    caffeinateProcess.on("exit", (code, signal) => {
      api.logger.debug(`[caffeinate] Process exited with code ${code}, signal ${signal}`);
      caffeinateProcess = null;
    });
    api.logger.debug(`[caffeinate] Started with PID ${caffeinateProcess.pid}`);
    setupCleanupHandlers();
    return true;
  } catch (error) {
    api.logger.debug("[caffeinate] Failed to start caffeinate:", error);
    return false;
  }
}
let isStopping = false;
async function stopCaffeinate() {
  if (isStopping) {
    api.logger.debug("[caffeinate] Already stopping, skipping");
    return;
  }
  if (caffeinateProcess && !caffeinateProcess.killed) {
    isStopping = true;
    api.logger.debug(`[caffeinate] Stopping caffeinate process PID ${caffeinateProcess.pid}`);
    try {
      caffeinateProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      if (caffeinateProcess && !caffeinateProcess.killed) {
        api.logger.debug("[caffeinate] Force killing caffeinate process");
        caffeinateProcess.kill("SIGKILL");
      }
      caffeinateProcess = null;
      isStopping = false;
    } catch (error) {
      api.logger.debug("[caffeinate] Error stopping caffeinate:", error);
      isStopping = false;
    }
  }
}
let cleanupHandlersSet = false;
function setupCleanupHandlers() {
  if (cleanupHandlersSet) {
    return;
  }
  cleanupHandlersSet = true;
  const cleanup = () => {
    stopCaffeinate();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGUSR1", cleanup);
  process.on("SIGUSR2", cleanup);
  process.on("uncaughtException", (error) => {
    api.logger.debug("[caffeinate] Uncaught exception, cleaning up:", error);
    cleanup();
  });
  process.on("unhandledRejection", (reason, promise) => {
    api.logger.debug("[caffeinate] Unhandled rejection, cleaning up:", reason);
    cleanup();
  });
}
function killOrphanedCaffeinateProcesses() {
  if (process.platform !== "darwin") return;
  try {
    child_process.execSync('pkill -f "caffeinate -im"', { timeout: 5e3, stdio: "ignore" });
    api.logger.debug("[caffeinate] Killed orphaned caffeinate processes");
  } catch {
  }
}

let cachedRuntime = null;
function getRuntime() {
  if (cachedRuntime) return cachedRuntime;
  if (typeof globalThis.Bun !== "undefined") {
    cachedRuntime = "bun";
    return cachedRuntime;
  }
  if (typeof globalThis.Deno !== "undefined") {
    cachedRuntime = "deno";
    return cachedRuntime;
  }
  if (process?.versions?.bun) {
    cachedRuntime = "bun";
    return cachedRuntime;
  }
  if (process?.versions?.deno) {
    cachedRuntime = "deno";
    return cachedRuntime;
  }
  if (process?.versions?.node) {
    cachedRuntime = "node";
    return cachedRuntime;
  }
  cachedRuntime = "unknown";
  return cachedRuntime;
}
const isBun = () => getRuntime() === "bun";

function spawnHappyCLI(args, options = {}) {
  const projectRoot = api.projectPath();
  const entrypoint = node_path.join(projectRoot, "dist", "index.mjs");
  let directory;
  if ("cwd" in options) {
    directory = options.cwd;
  } else {
    directory = process.cwd();
  }
  const fullCommand = `happy ${args.join(" ")}`;
  api.logger.debug(`[SPAWN HAPPY CLI] Spawning: ${fullCommand} in ${directory}`);
  const nodeArgs = [
    "--no-warnings",
    "--no-deprecation",
    entrypoint,
    ...args
  ];
  if (!node_fs.existsSync(entrypoint)) {
    const errorMessage = `Entrypoint ${entrypoint} does not exist`;
    api.logger.debug(`[SPAWN HAPPY CLI] ${errorMessage}`);
    throw new Error(errorMessage);
  }
  const runtime = isBun() ? "bun" : "node";
  return spawn.spawn(runtime, nodeArgs, {
    windowsHide: true,
    ...options
  });
}

function startDaemonControlServer({
  getChildren,
  stopSession,
  spawnSession,
  requestShutdown,
  onHappySessionWebhook
}) {
  return new Promise((resolve) => {
    const app = fastify({
      logger: false
      // We use our own logger
    });
    app.setValidatorCompiler(fastifyTypeProviderZod.validatorCompiler);
    app.setSerializerCompiler(fastifyTypeProviderZod.serializerCompiler);
    const typed = app.withTypeProvider();
    typed.post("/session-started", {
      schema: {
        body: z.z.object({
          sessionId: z.z.string(),
          metadata: z.z.any(),
          encryption: z.z.object({
            encryptionKey: z.z.string(),
            encryptionVariant: z.z.enum(["legacy", "dataKey"]),
            seq: z.z.number(),
            metadataVersion: z.z.number(),
            agentStateVersion: z.z.number()
          }).optional()
        }),
        response: {
          200: z.z.object({
            status: z.z.literal("ok")
          })
        }
      }
    }, async (request) => {
      const { sessionId, metadata, encryption } = request.body;
      api.logger.debug(`[CONTROL SERVER] Session started: ${sessionId}`);
      let encryptionData;
      if (encryption) {
        encryptionData = {
          encryptionKey: api.decodeBase64(encryption.encryptionKey),
          encryptionVariant: encryption.encryptionVariant,
          seq: encryption.seq,
          metadataVersion: encryption.metadataVersion,
          agentStateVersion: encryption.agentStateVersion
        };
      }
      onHappySessionWebhook(sessionId, metadata, encryptionData);
      return { status: "ok" };
    });
    typed.post("/list", {
      schema: {
        response: {
          200: z.z.object({
            children: z.z.array(z.z.object({
              startedBy: z.z.string(),
              happySessionId: z.z.string(),
              pid: z.z.number()
            }))
          })
        }
      }
    }, async () => {
      const children = getChildren();
      api.logger.debug(`[CONTROL SERVER] Listing ${children.length} sessions`);
      return {
        children: children.filter((child) => child.happySessionId !== void 0).map((child) => ({
          startedBy: child.startedBy,
          happySessionId: child.happySessionId,
          pid: child.pid
        }))
      };
    });
    typed.post("/stop-session", {
      schema: {
        body: z.z.object({
          sessionId: z.z.string()
        }),
        response: {
          200: z.z.object({
            success: z.z.boolean()
          })
        }
      }
    }, async (request) => {
      const { sessionId } = request.body;
      api.logger.debug(`[CONTROL SERVER] Stop session request: ${sessionId}`);
      const success = stopSession(sessionId);
      return { success };
    });
    typed.post("/spawn-session", {
      schema: {
        body: z.z.object({
          directory: z.z.string(),
          sessionId: z.z.string().optional(),
          agent: z.z.enum(["claude", "codex", "gemini", "openclaw"]).optional(),
          environmentVariables: z.z.record(z.z.string(), z.z.string()).optional()
        }),
        response: {
          200: z.z.object({
            success: z.z.boolean(),
            sessionId: z.z.string().optional(),
            approvedNewDirectoryCreation: z.z.boolean().optional()
          }),
          409: z.z.object({
            success: z.z.boolean(),
            requiresUserApproval: z.z.boolean().optional(),
            actionRequired: z.z.string().optional(),
            directory: z.z.string().optional()
          }),
          500: z.z.object({
            success: z.z.boolean(),
            error: z.z.string().optional()
          })
        }
      }
    }, async (request, reply) => {
      const { directory, sessionId, agent, environmentVariables } = request.body;
      api.logger.debug(`[CONTROL SERVER] Spawn session request: dir=${directory}, sessionId=${sessionId || "new"}, agent=${agent || "default"}`);
      const result = await spawnSession({ directory, sessionId, agent, environmentVariables });
      switch (result.type) {
        case "success":
          if (!result.sessionId) {
            reply.code(500);
            return {
              success: false,
              error: "Failed to spawn session: no session ID returned"
            };
          }
          return {
            success: true,
            sessionId: result.sessionId,
            approvedNewDirectoryCreation: true
          };
        case "requestToApproveDirectoryCreation":
          reply.code(409);
          return {
            success: false,
            requiresUserApproval: true,
            actionRequired: "CREATE_DIRECTORY",
            directory: result.directory
          };
        case "error":
          reply.code(500);
          return {
            success: false,
            error: result.errorMessage
          };
      }
    });
    typed.post("/stop", {
      schema: {
        response: {
          200: z.z.object({
            status: z.z.string()
          })
        }
      }
    }, async () => {
      api.logger.debug("[CONTROL SERVER] Stop daemon request received");
      setTimeout(() => {
        api.logger.debug("[CONTROL SERVER] Triggering daemon shutdown");
        requestShutdown();
      }, 50);
      return { status: "stopping" };
    });
    app.listen({ port: 0, host: "127.0.0.1" }, (err, address) => {
      if (err) {
        api.logger.debug("[CONTROL SERVER] Failed to start:", err);
        throw err;
      }
      const port = parseInt(address.split(":").pop());
      api.logger.debug(`[CONTROL SERVER] Started on port ${port}`);
      resolve({
        port,
        stop: async () => {
          api.logger.debug("[CONTROL SERVER] Stopping server");
          await app.close();
          api.logger.debug("[CONTROL SERVER] Server stopped");
        }
      });
    });
  });
}

class TmuxSessionIdentifierError extends Error {
  constructor(message) {
    super(message);
    this.name = "TmuxSessionIdentifierError";
  }
}
function parseTmuxSessionIdentifier(identifier) {
  if (!identifier || typeof identifier !== "string") {
    throw new TmuxSessionIdentifierError("Session identifier must be a non-empty string");
  }
  const parts = identifier.split(":");
  if (parts.length === 0 || !parts[0]) {
    throw new TmuxSessionIdentifierError("Invalid session identifier: missing session name");
  }
  const result = {
    session: parts[0].trim()
  };
  if (!/^[a-zA-Z0-9._-]+$/.test(result.session)) {
    throw new TmuxSessionIdentifierError(`Invalid session name: "${result.session}". Only alphanumeric characters, dots, hyphens, and underscores are allowed.`);
  }
  if (parts.length > 1) {
    const windowAndPane = parts[1].split(".");
    result.window = windowAndPane[0]?.trim();
    if (result.window && !/^[a-zA-Z0-9._-]+$/.test(result.window)) {
      throw new TmuxSessionIdentifierError(`Invalid window name: "${result.window}". Only alphanumeric characters, dots, hyphens, and underscores are allowed.`);
    }
    if (windowAndPane.length > 1) {
      result.pane = windowAndPane[1]?.trim();
      if (result.pane && !/^[0-9]+$/.test(result.pane)) {
        throw new TmuxSessionIdentifierError(`Invalid pane identifier: "${result.pane}". Only numeric values are allowed.`);
      }
    }
  }
  return result;
}
function formatTmuxSessionIdentifier(identifier) {
  if (!identifier.session) {
    throw new TmuxSessionIdentifierError("Session identifier must have a session name");
  }
  let result = identifier.session;
  if (identifier.window) {
    result += `:${identifier.window}`;
    if (identifier.pane) {
      result += `.${identifier.pane}`;
    }
  }
  return result;
}
const WIN_OPS = {
  // Navigation and window management
  "new-window": "new-window",
  "new": "new-window",
  "nw": "new-window",
  "select-window": "select-window -t",
  "sw": "select-window -t",
  "window": "select-window -t",
  "w": "select-window -t",
  "next-window": "next-window",
  "n": "next-window",
  "prev-window": "previous-window",
  "p": "previous-window",
  "pw": "previous-window",
  // Pane management
  "split-window": "split-window",
  "split": "split-window",
  "sp": "split-window",
  "vsplit": "split-window -h",
  "vsp": "split-window -h",
  "select-pane": "select-pane -t",
  "pane": "select-pane -t",
  "next-pane": "select-pane -t :.+",
  "np": "select-pane -t :.+",
  "prev-pane": "select-pane -t :.-",
  "pp": "select-pane -t :.-",
  // Session management
  "new-session": "new-session",
  "ns": "new-session",
  "new-sess": "new-session",
  "attach-session": "attach-session -t",
  "attach": "attach-session -t",
  "as": "attach-session -t",
  "detach-client": "detach-client",
  "detach": "detach-client",
  "dc": "detach-client",
  // Layout and display
  "select-layout": "select-layout",
  "layout": "select-layout",
  "sl": "select-layout",
  "clock-mode": "clock-mode",
  "clock": "clock-mode",
  // Copy mode
  "copy-mode": "copy-mode",
  "copy": "copy-mode",
  // Search and navigation in copy mode
  "search-forward": "search-forward",
  "search-backward": "search-backward",
  // Misc operations
  "list-windows": "list-windows",
  "lw": "list-windows",
  "list-sessions": "list-sessions",
  "ls": "list-sessions",
  "list-panes": "list-panes",
  "lp": "list-panes",
  "rename-window": "rename-window",
  "rename": "rename-window",
  "kill-window": "kill-window",
  "kw": "kill-window",
  "kill-pane": "kill-pane",
  "kp": "kill-pane",
  "kill-session": "kill-session",
  "ks": "kill-session",
  // Display and info
  "display-message": "display-message",
  "display": "display-message",
  "dm": "display-message",
  "show-options": "show-options",
  "show": "show-options",
  "so": "show-options",
  // Control and scripting
  "send-keys": "send-keys",
  "send": "send-keys",
  "sk": "send-keys",
  "capture-pane": "capture-pane",
  "capture": "capture-pane",
  "cp": "capture-pane",
  "pipe-pane": "pipe-pane",
  "pipe": "pipe-pane",
  // Buffer operations
  "list-buffers": "list-buffers",
  "lb": "list-buffers",
  "save-buffer": "save-buffer",
  "sb": "save-buffer",
  "delete-buffer": "delete-buffer",
  "db": "delete-buffer",
  // Advanced operations
  "resize-pane": "resize-pane",
  "resize": "resize-pane",
  "rp": "resize-pane",
  "swap-pane": "swap-pane",
  "swap": "swap-pane",
  "join-pane": "join-pane",
  "join": "join-pane",
  "break-pane": "break-pane",
  "break": "break-pane"
};
const COMMANDS_SUPPORTING_TARGET = /* @__PURE__ */ new Set([
  "send-keys",
  "capture-pane",
  "new-window",
  "kill-window",
  "select-window",
  "split-window",
  "select-pane",
  "kill-pane",
  "select-layout",
  "display-message",
  "attach-session",
  "detach-client",
  "new-session",
  "kill-session",
  "list-windows",
  "list-panes"
]);
const CONTROL_SEQUENCES = /* @__PURE__ */ new Set([
  "C-m",
  "C-c",
  "C-l",
  "C-u",
  "C-w",
  "C-a",
  "C-b",
  "C-d",
  "C-e",
  "C-f",
  "C-g",
  "C-h",
  "C-i",
  "C-j",
  "C-k",
  "C-n",
  "C-o",
  "C-p",
  "C-q",
  "C-r",
  "C-s",
  "C-t",
  "C-v",
  "C-x",
  "C-y",
  "C-z",
  "C-\\",
  "C-]",
  "C-[",
  "C-]"
]);
class TmuxUtilities {
  /** Default session name to prevent interference */
  static DEFAULT_SESSION_NAME = "happy";
  controlState = "normal" /* NORMAL */;
  sessionName;
  constructor(sessionName) {
    this.sessionName = sessionName || TmuxUtilities.DEFAULT_SESSION_NAME;
  }
  /**
   * Detect tmux environment from TMUX environment variable
   */
  detectTmuxEnvironment() {
    const tmuxEnv = process.env.TMUX;
    if (!tmuxEnv) {
      return null;
    }
    try {
      const parts = tmuxEnv.split(",");
      if (parts.length >= 3) {
        const socketPath = parts[0];
        const pathParts = parts[1].split("/");
        const sessionAndWindow = pathParts[pathParts.length - 1] || parts[1];
        const pane = parts[2];
        let session;
        let window;
        if (sessionAndWindow.includes(".")) {
          const parts2 = sessionAndWindow.split(".", 2);
          session = parts2[0];
          window = parts2[1] || "0";
        } else {
          session = sessionAndWindow;
          window = "0";
        }
        return {
          session,
          window,
          pane,
          socket_path: socketPath
        };
      }
    } catch (error) {
      api.logger.debug("[TMUX] Failed to parse TMUX environment variable:", error);
    }
    return null;
  }
  /**
   * Execute tmux command with proper session targeting and socket handling
   */
  async executeTmuxCommand(cmd, session, window, pane, socketPath) {
    const targetSession = session || this.sessionName;
    let baseCmd = ["tmux"];
    if (socketPath) {
      baseCmd = ["tmux", "-S", socketPath];
    }
    if (cmd.length > 0 && cmd[0] === "send-keys") {
      const fullCmd = [...baseCmd, cmd[0]];
      let target = targetSession;
      if (window) target += `:${window}`;
      if (pane) target += `.${pane}`;
      fullCmd.push("-t", target);
      fullCmd.push(...cmd.slice(1));
      return this.executeCommand(fullCmd);
    } else {
      const fullCmd = [...baseCmd, ...cmd];
      if (cmd.length > 0 && COMMANDS_SUPPORTING_TARGET.has(cmd[0])) {
        let target = targetSession;
        if (window) target += `:${window}`;
        if (pane) target += `.${pane}`;
        fullCmd.push("-t", target);
      }
      return this.executeCommand(fullCmd);
    }
  }
  /**
   * Execute command with subprocess and return result
   */
  async executeCommand(cmd) {
    try {
      const result = await this.runCommand(cmd);
      return {
        returncode: result.exitCode,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        command: cmd
      };
    } catch (error) {
      api.logger.debug("[TMUX] Command execution failed:", error);
      return null;
    }
  }
  /**
   * Run command using Node.js child_process.spawn
   */
  runCommand(args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = child_process.spawn(args[0], args.slice(1), {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5e3,
        shell: false,
        windowsHide: true,
        ...options
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("close", (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr
        });
      });
      child.on("error", (error) => {
        reject(error);
      });
    });
  }
  /**
   * Parse control sequences in text (^ for escape, ^^ for literal ^)
   */
  parseControlSequences(text) {
    const result = [];
    let i = 0;
    let localState = this.controlState;
    while (i < text.length) {
      const char = text[i];
      if (localState === "normal" /* NORMAL */) {
        if (char === "^") {
          if (i + 1 < text.length && text[i + 1] === "^") {
            result.push("^");
            i += 2;
          } else {
            localState = "escape" /* ESCAPE */;
            i += 1;
          }
        } else {
          result.push(char);
          i += 1;
        }
      } else if (localState === "escape" /* ESCAPE */) {
        result.push(char);
        i += 1;
        localState = "normal" /* NORMAL */;
      } else {
        result.push(char);
        i += 1;
      }
    }
    this.controlState = localState;
    return [result.join(""), localState];
  }
  /**
   * Execute window operation using WIN_OPS dispatch with type safety
   */
  async executeWinOp(operation, args = [], session, window, pane) {
    const tmuxCmd = WIN_OPS[operation];
    if (!tmuxCmd) {
      api.logger.debug(`[TMUX] Unknown operation: ${operation}`);
      return false;
    }
    const cmdParts = tmuxCmd.split(" ");
    cmdParts.push(...args);
    const result = await this.executeTmuxCommand(cmdParts, session, window, pane);
    return result !== null && result.returncode === 0;
  }
  /**
   * Ensure session exists, create if needed
   */
  async ensureSessionExists(sessionName) {
    const targetSession = sessionName || this.sessionName;
    const result = await this.executeTmuxCommand(["has-session", "-t", targetSession]);
    if (result && result.returncode === 0) {
      return true;
    }
    const createResult = await this.executeTmuxCommand(["new-session", "-d", "-s", targetSession]);
    return createResult !== null && createResult.returncode === 0;
  }
  /**
   * Capture current input from tmux pane
   */
  async captureCurrentInput(session, window, pane) {
    const result = await this.executeTmuxCommand(["capture-pane", "-p"], session, window, pane);
    if (result && result.returncode === 0) {
      const lines = result.stdout.trim().split("\n");
      return lines[lines.length - 1] || "";
    }
    return "";
  }
  /**
   * Check if user is actively typing
   */
  async isUserTyping(checkInterval = 500, maxChecks = 3, session, window, pane) {
    const initialInput = await this.captureCurrentInput(session, window, pane);
    for (let i = 0; i < maxChecks - 1; i++) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      const currentInput = await this.captureCurrentInput(session, window, pane);
      if (currentInput !== initialInput) {
        return true;
      }
    }
    return false;
  }
  /**
   * Send keys to tmux pane with proper control sequence handling and type safety
   */
  async sendKeys(keys, session, window, pane) {
    if (!keys || typeof keys !== "string") {
      api.logger.debug("[TMUX] Invalid keys provided to sendKeys");
      return false;
    }
    if (CONTROL_SEQUENCES.has(keys)) {
      const result = await this.executeTmuxCommand(["send-keys", keys], session, window, pane);
      return result !== null && result.returncode === 0;
    } else {
      const result = await this.executeTmuxCommand(["send-keys", keys], session, window, pane);
      return result !== null && result.returncode === 0;
    }
  }
  /**
   * Send multiple keys to tmux pane with proper control sequence handling
   */
  async sendMultipleKeys(keys, session, window, pane) {
    if (!Array.isArray(keys) || keys.length === 0) {
      api.logger.debug("[TMUX] Invalid keys array provided to sendMultipleKeys");
      return false;
    }
    for (const key of keys) {
      const success = await this.sendKeys(key, session, window, pane);
      if (!success) {
        return false;
      }
    }
    return true;
  }
  /**
   * Get comprehensive session information
   */
  async getSessionInfo(sessionName) {
    const targetSession = sessionName || this.sessionName;
    const envInfo = this.detectTmuxEnvironment();
    const info = {
      target_session: targetSession,
      session: targetSession,
      window: "unknown",
      pane: "unknown",
      socket_path: void 0,
      tmux_active: envInfo !== null,
      current_session: envInfo?.session,
      available_sessions: []
    };
    if (envInfo && envInfo.session === targetSession) {
      info.window = envInfo.window;
      info.pane = envInfo.pane;
      info.socket_path = envInfo.socket_path;
    } else if (envInfo) {
      info.env_session = envInfo.session;
      info.env_window = envInfo.window;
      info.env_pane = envInfo.pane;
    }
    const result = await this.executeTmuxCommand(["list-sessions"]);
    if (result && result.returncode === 0) {
      info.available_sessions = result.stdout.trim().split("\n").filter((line) => line.trim()).map((line) => line.split(":")[0]);
    }
    return info;
  }
  /**
   * Spawn process in tmux session with environment variables.
   *
   * IMPORTANT: Unlike Node.js spawn(), env is a separate parameter.
   * This is intentional because:
   * - Tmux windows inherit environment from the tmux server
   * - Only NEW or DIFFERENT variables need to be set via -e flag
   * - Passing all of process.env would create 50+ unnecessary -e flags
   *
   * @param args - Command and arguments to execute (as array, will be joined)
   * @param options - Spawn options (tmux-specific, excludes env)
   * @param env - Environment variables to set in window (only pass what's different!)
   * @returns Result with success status and session identifier
   */
  async spawnInTmux(args, options = {}, env) {
    try {
      const tmuxCheck = await this.executeTmuxCommand(["list-sessions"]);
      if (!tmuxCheck) {
        throw new Error("tmux not available");
      }
      let sessionName = options.sessionName !== void 0 && options.sessionName !== "" ? options.sessionName : null;
      if (!sessionName) {
        const listResult = await this.executeTmuxCommand(["list-sessions", "-F", "#{session_name}"]);
        if (listResult && listResult.returncode === 0 && listResult.stdout.trim()) {
          const firstSession = listResult.stdout.trim().split("\n")[0];
          sessionName = firstSession;
          api.logger.debug(`[TMUX] Using first existing session: ${sessionName}`);
        } else {
          sessionName = "happy";
          api.logger.debug(`[TMUX] No existing sessions, using default: ${sessionName}`);
        }
      }
      const windowName = options.windowName || `happy-${Date.now()}`;
      await this.ensureSessionExists(sessionName);
      const fullCommand = args.join(" ");
      const createWindowArgs = ["new-window", "-n", windowName];
      if (options.cwd) {
        const cwdPath = typeof options.cwd === "string" ? options.cwd : options.cwd.pathname;
        createWindowArgs.push("-c", cwdPath);
      }
      if (env && Object.keys(env).length > 0) {
        for (const [key, value] of Object.entries(env)) {
          if (value === void 0 || value === null) {
            api.logger.warn(`[TMUX] Skipping undefined/null environment variable: ${key}`);
            continue;
          }
          if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
            api.logger.warn(`[TMUX] Skipping invalid environment variable name: ${key}`);
            continue;
          }
          const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
          createWindowArgs.push("-e", `${key}="${escapedValue}"`);
        }
        api.logger.debug(`[TMUX] Setting ${Object.keys(env).length} environment variables in tmux window`);
      }
      createWindowArgs.push(fullCommand);
      createWindowArgs.push("-P");
      createWindowArgs.push("-F", "#{pane_pid}");
      const createResult = await this.executeTmuxCommand(createWindowArgs, sessionName);
      if (!createResult || createResult.returncode !== 0) {
        throw new Error(`Failed to create tmux window: ${createResult?.stderr}`);
      }
      const panePid = parseInt(createResult.stdout.trim());
      if (isNaN(panePid)) {
        throw new Error(`Failed to extract PID from tmux output: ${createResult.stdout}`);
      }
      api.logger.debug(`[TMUX] Spawned command in tmux session ${sessionName}, window ${windowName}, PID ${panePid}`);
      const sessionIdentifier = {
        session: sessionName,
        window: windowName
      };
      return {
        success: true,
        sessionId: formatTmuxSessionIdentifier(sessionIdentifier),
        pid: panePid
      };
    } catch (error) {
      api.logger.debug("[TMUX] Failed to spawn in tmux:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  /**
   * Get session info for a given session identifier string
   */
  async getSessionInfoFromString(sessionIdentifier) {
    try {
      const parsed = parseTmuxSessionIdentifier(sessionIdentifier);
      const info = await this.getSessionInfo(parsed.session);
      return info;
    } catch (error) {
      if (error instanceof TmuxSessionIdentifierError) {
        api.logger.debug(`[TMUX] Invalid session identifier: ${error.message}`);
      } else {
        api.logger.debug("[TMUX] Error getting session info:", error);
      }
      return null;
    }
  }
  /**
   * Kill a tmux window safely with proper error handling
   */
  async killWindow(sessionIdentifier) {
    try {
      const parsed = parseTmuxSessionIdentifier(sessionIdentifier);
      if (!parsed.window) {
        throw new TmuxSessionIdentifierError(`Window identifier required: ${sessionIdentifier}`);
      }
      const result = await this.executeWinOp("kill-window", [parsed.window], parsed.session);
      return result;
    } catch (error) {
      if (error instanceof TmuxSessionIdentifierError) {
        api.logger.debug(`[TMUX] Invalid window identifier: ${error.message}`);
      } else {
        api.logger.debug("[TMUX] Error killing window:", error);
      }
      return false;
    }
  }
  /**
   * List windows in a session
   */
  async listWindows(sessionName) {
    const targetSession = sessionName || this.sessionName;
    const result = await this.executeTmuxCommand(["list-windows", "-t", targetSession]);
    if (!result || result.returncode !== 0) {
      return [];
    }
    const windows = [];
    const lines = result.stdout.trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^\d+:\s+(\w+)/);
      if (match) {
        windows.push(match[1]);
      }
    }
    return windows;
  }
}
let _tmuxUtils = null;
function getTmuxUtilities(sessionName) {
  if (!_tmuxUtils || sessionName && sessionName !== _tmuxUtils.sessionName) {
    _tmuxUtils = new TmuxUtilities(sessionName);
  }
  return _tmuxUtils;
}
async function isTmuxAvailable() {
  try {
    const utils = new TmuxUtilities();
    const result = await utils.executeTmuxCommand(["list-sessions"]);
    return result !== null;
  } catch {
    return false;
  }
}

function expandEnvironmentVariables(envVars, sourceEnv = process.env) {
  const expanded = {};
  const undefinedVars = [];
  for (const [key, value] of Object.entries(envVars)) {
    const expandedValue = value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
      const colonDashIndex = expr.indexOf(":-");
      let varName;
      let defaultValue;
      if (colonDashIndex !== -1) {
        varName = expr.substring(0, colonDashIndex);
        defaultValue = expr.substring(colonDashIndex + 2);
      } else {
        varName = expr;
      }
      const resolvedValue = sourceEnv[varName];
      if (resolvedValue !== void 0) {
        const isSensitive = varName.toLowerCase().includes("token") || varName.toLowerCase().includes("key") || varName.toLowerCase().includes("secret");
        const displayValue = isSensitive ? resolvedValue ? `<${resolvedValue.length} chars>` : "<empty>" : resolvedValue;
        api.logger.debug(`[EXPAND ENV] Expanded ${varName} from daemon env: ${displayValue}`);
        if (resolvedValue === "") {
          api.logger.warn(`[EXPAND ENV] WARNING: ${varName} is set but EMPTY in daemon environment`);
        }
        return resolvedValue;
      } else if (defaultValue !== void 0) {
        api.logger.debug(`[EXPAND ENV] Using default value for ${varName}: ${defaultValue}`);
        return defaultValue;
      } else {
        undefinedVars.push(varName);
        return match;
      }
    });
    expanded[key] = expandedValue;
  }
  if (undefinedVars.length > 0) {
    api.logger.warn(`[EXPAND ENV] Undefined variables referenced in profile environment: ${undefinedVars.join(", ")}`);
    api.logger.warn(`[EXPAND ENV] Session may fail to authenticate. Set these in daemon environment before launching:`);
    undefinedVars.forEach((varName) => {
      api.logger.warn(`[EXPAND ENV]   ${varName}=<your-value>`);
    });
  }
  return expanded;
}

const ResumableMetadataSchema = z.z.object({
  path: z.z.string().min(1),
  flavor: z.z.string().optional(),
  claudeSessionId: z.z.string().optional(),
  codexThreadId: z.z.string().optional()
}).passthrough();
function resolveSessionRecordByPrefix(records, sessionId) {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    throw new Error("Happy session ID is required: happy resume <session-id>");
  }
  const matches = records.filter((record) => record.id.startsWith(trimmed));
  if (matches.length === 0) {
    throw new Error(`No Happy session found matching "${trimmed}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Ambiguous Happy session "${trimmed}" matches ${matches.length} sessions. Be more specific.`);
  }
  return matches[0];
}
function decryptBoxBundle(bundle, recipientSecretKey) {
  if (bundle.length < 56) {
    return null;
  }
  const ephemeralPublicKey = bundle.slice(0, 32);
  const nonce = bundle.slice(32, 56);
  const ciphertext = bundle.slice(56);
  const decrypted = tweetnacl.box.open(ciphertext, nonce, ephemeralPublicKey, recipientSecretKey);
  return decrypted ? new Uint8Array(decrypted) : null;
}
function readAgentCredentials() {
  const credentialPath = api.getLocalHappyAgentCredentialPath();
  const credentials = api.readLocalHappyAgentCredentials();
  if (!credentials) {
    throw new Error(
      `Cannot resume historical Happy sessions without ${credentialPath}. Run \`happy-agent auth login\` in this environment first.`
    );
  }
  return credentials;
}
function resolveSessionEncryption(session, credentials) {
  if (session.dataEncryptionKey) {
    const encrypted = api.decodeBase64(session.dataEncryptionKey);
    const sessionKey = decryptBoxBundle(encrypted.slice(1), credentials.contentKeyPair.secretKey);
    if (!sessionKey) {
      throw new Error(`Failed to decrypt data key for Happy session ${session.id}`);
    }
    return {
      key: sessionKey,
      variant: "dataKey"
    };
  }
  return {
    key: credentials.secret,
    variant: "legacy"
  };
}
function decryptSessionMetadata(session, credentials) {
  const encryption = resolveSessionEncryption(session, credentials);
  const encryptedMetadata = api.decodeBase64(session.metadata);
  const metadata = encryption.variant === "dataKey" ? api.decryptWithDataKey(encryptedMetadata, encryption.key) : api.decryptLegacy(encryptedMetadata, encryption.key);
  if (!metadata) {
    throw new Error(`Failed to decrypt metadata for Happy session ${session.id}`);
  }
  try {
    return ResumableMetadataSchema.parse(metadata);
  } catch {
    throw new Error(`Happy session ${session.id} is missing resumable metadata.`);
  }
}
async function fetchSessions(credentials) {
  try {
    const response = await axios.get(`${api.configuration.serverUrl}/v1/sessions`, {
      headers: {
        Authorization: `Bearer ${credentials.token}`,
        "X-Happy-Client": `cli-coding-session/${api.configuration.currentCliVersion}`
      }
    });
    return response.data.sessions;
  } catch (error) {
    if (error instanceof axios.AxiosError) {
      if (error.response?.status === 401) {
        throw new Error("Happy session lookup authentication expired. Run `happy-agent auth login` in this environment.");
      }
      throw new Error(`Failed to load Happy sessions: ${error.message}`);
    }
    throw error;
  }
}
async function resolveHappySession(sessionId) {
  const credentials = readAgentCredentials();
  const sessions = await fetchSessions(credentials);
  const matched = resolveSessionRecordByPrefix(sessions, sessionId);
  return {
    id: matched.id,
    active: matched.active,
    metadata: decryptSessionMetadata(matched, credentials)
  };
}

function parseResumeCommandArgs(args) {
  if (args.includes("-h") || args.includes("--help")) {
    return {
      showHelp: true,
      sessionId: ""
    };
  }
  if (args.length === 0) {
    throw new Error("Happy session ID is required: happy resume <session-id>");
  }
  if (args.length > 1) {
    throw new Error(`Unexpected arguments for happy resume: ${args.slice(1).join(" ")}`);
  }
  return {
    showHelp: false,
    sessionId: args[0]
  };
}
function resolveFlavor(metadata) {
  if (metadata.flavor === "codex" || metadata.codexThreadId) {
    return "codex";
  }
  if (metadata.flavor === "claude" || metadata.claudeSessionId) {
    return "claude";
  }
  return null;
}
function buildResumeLaunch(session, options = {}) {
  const { metadata } = session;
  const flavor = resolveFlavor(metadata);
  if (flavor === "codex") {
    if (!metadata.codexThreadId) {
      throw new Error(`Happy session ${session.id} is missing its Codex thread ID.`);
    }
    const args = ["codex", "--resume", metadata.codexThreadId];
    if (options.startedBy) {
      args.push("--started-by", options.startedBy);
    }
    return {
      cwd: metadata.path,
      args
    };
  }
  if (flavor === "claude") {
    if (!metadata.claudeSessionId) {
      throw new Error(`Happy session ${session.id} is missing its Claude session ID.`);
    }
    const args = ["claude"];
    if (options.claudeStartingMode) {
      args.push("--happy-starting-mode", options.claudeStartingMode);
    }
    if (options.startedBy) {
      args.push("--started-by", options.startedBy);
    }
    args.push("--resume", metadata.claudeSessionId);
    return {
      cwd: metadata.path,
      args
    };
  }
  throw new Error(`Happy session ${session.id} uses unsupported flavor "${metadata.flavor ?? "unknown"}".`);
}
function formatResumeHelp() {
  return [
    "happy resume - Resume a previous Happy session",
    "",
    "Usage:",
    "  happy resume <happy-session-id>",
    "",
    "Examples:",
    "  happy resume cmmij8olq00dp5jcxr3wtbpau",
    "  happy resume cmmij8",
    "",
    "This reuses the saved worktree/path and resumes the underlying agent session",
    "when the backend supports it."
  ].join("\n");
}
function spawnResumeChild(launch) {
  return new Promise((resolve, reject) => {
    const child = spawnHappyCLI(launch.args, {
      cwd: launch.cwd,
      env: process.env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Resumed session exited via signal ${signal}`));
        return;
      }
      resolve(code);
    });
  });
}
async function handleResumeCommand(args) {
  const parsed = parseResumeCommandArgs(args);
  if (parsed.showHelp) {
    console.log(formatResumeHelp());
    return;
  }
  const session = await resolveHappySession(parsed.sessionId);
  const launch = buildResumeLaunch(session);
  if (!node_fs.existsSync(launch.cwd)) {
    throw new Error(`Saved session path does not exist: ${launch.cwd}`);
  }
  const exitCode = await spawnResumeChild(launch);
  if (typeof exitCode === "number" && exitCode !== 0) {
    process.exit(exitCode);
  }
}

const hostSuffix = process.env.HAPPY_VARIANT === "dev" ? "-dev" : "";
const initialMachineMetadata = {
  host: os$1.hostname() + hostSuffix,
  platform: os$1.platform(),
  happyCliVersion: api.packageJson.version,
  homeDir: os$1.homedir(),
  happyHomeDir: api.configuration.happyHomeDir,
  happyLibDir: api.projectPath(),
  cliAvailability: api.detectCLIAvailability(),
  resumeSupport: { ...api.detectResumeSupport(), rpcAvailable: true }
};
async function startDaemon() {
  let requestShutdown;
  let resolvesWhenShutdownRequested = new Promise((resolve) => {
    requestShutdown = (source, errorMessage) => {
      api.logger.debug(`[DAEMON RUN] Requesting shutdown (source: ${source}, errorMessage: ${errorMessage})`);
      setTimeout(async () => {
        api.logger.debug("[DAEMON RUN] Startup malfunctioned, forcing exit with code 1");
        await new Promise((resolve2) => setTimeout(resolve2, 100));
        process.exit(1);
      }, 1e3);
      resolve({ source, errorMessage });
    };
  });
  process.on("SIGINT", () => {
    api.logger.debug("[DAEMON RUN] Received SIGINT");
    requestShutdown("os-signal");
  });
  process.on("SIGTERM", () => {
    api.logger.debug("[DAEMON RUN] Received SIGTERM");
    requestShutdown("os-signal");
  });
  process.on("uncaughtException", (error) => {
    api.logger.debug("[DAEMON RUN] FATAL: Uncaught exception", error);
    api.logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown("exception", error.message);
  });
  process.on("unhandledRejection", (reason, promise) => {
    api.logger.debug("[DAEMON RUN] FATAL: Unhandled promise rejection", reason);
    api.logger.debug(`[DAEMON RUN] Rejected promise:`, promise);
    const error = reason instanceof Error ? reason : new Error(`Unhandled promise rejection: ${reason}`);
    api.logger.debug(`[DAEMON RUN] Stack trace: ${error.stack}`);
    requestShutdown("exception", error.message);
  });
  process.on("exit", (code) => {
    api.logger.debug(`[DAEMON RUN] Process exiting with code: ${code}`);
  });
  process.on("beforeExit", (code) => {
    api.logger.debug(`[DAEMON RUN] Process about to exit with code: ${code}`);
  });
  api.logger.debug("[DAEMON RUN] Starting daemon process...");
  api.logger.debugLargeJson("[DAEMON RUN] Environment", getEnvironmentInfo());
  const runningDaemonVersionMatches = await isDaemonRunningCurrentlyInstalledHappyVersion();
  if (!runningDaemonVersionMatches) {
    api.logger.debug("[DAEMON RUN] Daemon version mismatch detected, restarting daemon with current CLI version");
    await stopDaemon();
  } else {
    api.logger.debug("[DAEMON RUN] Daemon version matches, keeping existing daemon");
    console.log("Daemon already running with matching version");
    process.exit(0);
  }
  const daemonLockHandle = await persistence.acquireDaemonLock(5, 200);
  if (!daemonLockHandle) {
    api.logger.debug("[DAEMON RUN] Daemon lock file already held, another daemon is running");
    process.exit(0);
  }
  try {
    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
      api.logger.debug("[DAEMON RUN] Sleep prevention enabled");
    }
    const { credentials, machineId } = await authAndSetupMachineIfNeeded();
    api.logger.debug("[DAEMON RUN] Auth and machine setup complete");
    const pidToTrackedSession = /* @__PURE__ */ new Map();
    const sessionIdToFinishedSession = /* @__PURE__ */ new Map();
    const persisted = persistence.readPersistedSessions();
    for (const [id, s] of Object.entries(persisted)) {
      sessionIdToFinishedSession.set(id, {
        startedBy: "persisted",
        happySessionId: id,
        happySessionMetadataFromLocalWebhook: s.metadata,
        encryption: {
          encryptionKey: api.decodeBase64(s.encryptionKey),
          encryptionVariant: s.encryptionVariant,
          seq: s.seq,
          metadataVersion: s.metadataVersion,
          agentStateVersion: s.agentStateVersion
        },
        pid: 0
      });
    }
    if (Object.keys(persisted).length > 0) {
      api.logger.debug(`[DAEMON RUN] Loaded ${Object.keys(persisted).length} persisted sessions from disk`);
    }
    const pidToAwaiter = /* @__PURE__ */ new Map();
    const getCurrentChildren = () => Array.from(pidToTrackedSession.values());
    const onHappySessionWebhook = (sessionId, sessionMetadata, encryption) => {
      api.logger.debugLargeJson(`[DAEMON RUN] Session reported`, sessionMetadata);
      const pid = sessionMetadata.hostPid;
      if (!pid) {
        api.logger.debug(`[DAEMON RUN] Session webhook missing hostPid for sessionId: ${sessionId}`);
        return;
      }
      api.logger.debug(`[DAEMON RUN] Session webhook: ${sessionId}, PID: ${pid}, started by: ${sessionMetadata.startedBy || "unknown"}, hasEncryption: ${!!encryption}`);
      api.logger.debug(`[DAEMON RUN] Current tracked sessions before webhook: ${Array.from(pidToTrackedSession.keys()).join(", ")}`);
      if (encryption) {
        persistence.persistSession(sessionId, {
          encryptionKey: api.encodeBase64(encryption.encryptionKey),
          encryptionVariant: encryption.encryptionVariant,
          seq: encryption.seq,
          metadataVersion: encryption.metadataVersion,
          agentStateVersion: encryption.agentStateVersion,
          metadata: sessionMetadata,
          savedAt: Date.now()
        });
      }
      const existingSession = pidToTrackedSession.get(pid);
      if (existingSession && existingSession.startedBy === "daemon") {
        existingSession.happySessionId = sessionId;
        existingSession.happySessionMetadataFromLocalWebhook = sessionMetadata;
        existingSession.encryption = encryption;
        api.logger.debug(`[DAEMON RUN] Updated daemon-spawned session ${sessionId} with metadata`);
        const awaiter = pidToAwaiter.get(pid);
        if (awaiter) {
          pidToAwaiter.delete(pid);
          awaiter(existingSession);
          api.logger.debug(`[DAEMON RUN] Resolved session awaiter for PID ${pid}`);
        }
      } else if (!existingSession) {
        const trackedSession = {
          startedBy: "happy directly - likely by user from terminal",
          happySessionId: sessionId,
          happySessionMetadataFromLocalWebhook: sessionMetadata,
          encryption,
          pid
        };
        pidToTrackedSession.set(pid, trackedSession);
        api.logger.debug(`[DAEMON RUN] Registered externally-started session ${sessionId}`);
      }
    };
    const spawnSession = async (options) => {
      api.logger.debugLargeJson("[DAEMON RUN] Spawning session", options);
      const { directory, sessionId, machineId: machineId2, approvedNewDirectoryCreation = true } = options;
      let directoryCreated = false;
      try {
        await fs.access(directory);
        api.logger.debug(`[DAEMON RUN] Directory exists: ${directory}`);
      } catch (error) {
        api.logger.debug(`[DAEMON RUN] Directory doesn't exist, creating: ${directory}`);
        if (!approvedNewDirectoryCreation) {
          api.logger.debug(`[DAEMON RUN] Directory creation not approved for: ${directory}`);
          return {
            type: "requestToApproveDirectoryCreation",
            directory
          };
        }
        try {
          await fs.mkdir(directory, { recursive: true });
          api.logger.debug(`[DAEMON RUN] Successfully created directory: ${directory}`);
          directoryCreated = true;
        } catch (mkdirError) {
          let errorMessage = `Unable to create directory at '${directory}'. `;
          if (mkdirError.code === "EACCES") {
            errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`;
          } else if (mkdirError.code === "ENOTDIR") {
            errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`;
          } else if (mkdirError.code === "ENOSPC") {
            errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`;
          } else if (mkdirError.code === "EROFS") {
            errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`;
          } else {
            errorMessage += `System error: ${mkdirError.message || mkdirError}. Please verify the path is valid and you have the necessary permissions.`;
          }
          api.logger.debug(`[DAEMON RUN] Directory creation failed: ${errorMessage}`);
          return {
            type: "error",
            errorMessage
          };
        }
      }
      try {
        const authEnv = {};
        if (options.token) {
          if (options.agent === "codex") {
            const codexHomeDir = tmp__namespace.dirSync();
            await fs.writeFile(path.join(codexHomeDir.name, "auth.json"), options.token);
            authEnv.CODEX_HOME = codexHomeDir.name;
          } else {
            authEnv.CLAUDE_CODE_OAUTH_TOKEN = options.token;
          }
        }
        let extraEnv = {
          ...authEnv,
          ...options.environmentVariables ?? {}
        };
        api.logger.debug(`[DAEMON RUN] Environment variable keys (before expansion) (${Object.keys(extraEnv).length}): ${Object.keys(extraEnv).join(", ")}`);
        extraEnv = expandEnvironmentVariables(extraEnv, process.env);
        api.logger.debug(`[DAEMON RUN] After variable expansion: ${Object.keys(extraEnv).join(", ")}`);
        const unresolvedEnvEntries = Object.entries(extraEnv).flatMap(([key, value]) => {
          if (typeof value !== "string" || !value.includes("${")) {
            return [];
          }
          const unresolvedMatch = value.match(/\$\{([^}]+)\}/);
          if (!unresolvedMatch) {
            return [];
          }
          const expression = unresolvedMatch[1];
          const defaultSeparatorIndex = expression.indexOf(":-");
          const missingVar = defaultSeparatorIndex === -1 ? expression : expression.slice(0, defaultSeparatorIndex);
          return [`${key} references \${${missingVar}} which is not defined`];
        });
        if (unresolvedEnvEntries.length > 0) {
          const errorMessage = `Session environment is invalid - environment variables not found in daemon: ${unresolvedEnvEntries.join("; ")}. Ensure these variables are set in the daemon's environment before starting sessions.`;
          api.logger.warn(`[DAEMON RUN] ${errorMessage}`);
          return {
            type: "error",
            errorMessage
          };
        }
        const tmuxAvailable = await isTmuxAvailable();
        let useTmux = tmuxAvailable;
        let tmuxSessionName = extraEnv.TMUX_SESSION_NAME;
        if (!tmuxAvailable || tmuxSessionName === void 0) {
          useTmux = false;
          if (tmuxSessionName !== void 0) {
            api.logger.debug(`[DAEMON RUN] tmux session name specified but tmux not available, falling back to regular spawning`);
          }
        }
        if (useTmux && tmuxSessionName !== void 0) {
          const sessionDesc = tmuxSessionName || "current/most recent session";
          api.logger.debug(`[DAEMON RUN] Attempting to spawn session in tmux: ${sessionDesc}`);
          const tmux = getTmuxUtilities(tmuxSessionName);
          const cliPath = path.join(api.projectPath(), "dist", "index.mjs");
          const agent = options.agent === "gemini" ? "gemini" : options.agent === "codex" ? "codex" : options.agent === "openclaw" ? "openclaw" : "claude";
          const fullCommand = `node --no-warnings --no-deprecation ${cliPath} ${agent} --happy-starting-mode remote --started-by daemon`;
          const windowName = `happy-${Date.now()}-${agent}`;
          const tmuxEnv = {};
          for (const [key, value] of Object.entries(process.env)) {
            if (value !== void 0) {
              tmuxEnv[key] = value;
            }
          }
          Object.assign(tmuxEnv, extraEnv);
          const tmuxResult = await tmux.spawnInTmux([fullCommand], {
            sessionName: tmuxSessionName,
            windowName,
            cwd: directory
          }, tmuxEnv);
          if (tmuxResult.success) {
            api.logger.debug(`[DAEMON RUN] Successfully spawned in tmux session: ${tmuxResult.sessionId}, PID: ${tmuxResult.pid}`);
            if (!tmuxResult.pid) {
              throw new Error("Tmux window created but no PID returned");
            }
            const trackedSession = {
              startedBy: "daemon",
              pid: tmuxResult.pid,
              // Real PID from tmux -P flag
              tmuxSessionId: tmuxResult.sessionId,
              directoryCreated,
              message: directoryCreated ? `The path '${directory}' did not exist. We created a new folder and spawned a new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.` : `Spawned new session in tmux session '${tmuxSessionName}'. Use 'tmux attach -t ${tmuxSessionName}' to view the session.`
            };
            pidToTrackedSession.set(tmuxResult.pid, trackedSession);
            api.logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${tmuxResult.pid} (tmux)`);
            return new Promise((resolve) => {
              const timeout = setTimeout(() => {
                pidToAwaiter.delete(tmuxResult.pid);
                api.logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${tmuxResult.pid} (tmux)`);
                resolve({
                  type: "error",
                  errorMessage: `Session webhook timeout for PID ${tmuxResult.pid} (tmux)`
                });
              }, 15e3);
              pidToAwaiter.set(tmuxResult.pid, (completedSession) => {
                clearTimeout(timeout);
                api.logger.debug(`[DAEMON RUN] Session ${completedSession.happySessionId} fully spawned with webhook (tmux)`);
                resolve({
                  type: "success",
                  sessionId: completedSession.happySessionId
                });
              });
            });
          } else {
            api.logger.debug(`[DAEMON RUN] Failed to spawn in tmux: ${tmuxResult.error}, falling back to regular spawning`);
            useTmux = false;
          }
        }
        if (!useTmux) {
          api.logger.debug(`[DAEMON RUN] Using regular process spawning`);
          let agentCommand;
          switch (options.agent) {
            case "claude":
            case void 0:
              agentCommand = "claude";
              break;
            case "codex":
              agentCommand = "codex";
              break;
            case "gemini":
              agentCommand = "gemini";
              break;
            case "openclaw":
              agentCommand = "openclaw";
              break;
            default:
              return {
                type: "error",
                errorMessage: `Unsupported agent type: '${options.agent}'. Please update your CLI to the latest version.`
              };
          }
          const args = [
            agentCommand,
            "--happy-starting-mode",
            "remote",
            "--started-by",
            "daemon"
          ];
          return spawnTrackedHappyProcess({
            args,
            cwd: directory,
            env: {
              ...process.env,
              ...extraEnv
            },
            directoryCreated,
            message: directoryCreated ? `The path '${directory}' did not exist. We created a new folder and spawned a new session there.` : void 0
          });
        }
        return {
          type: "error",
          errorMessage: "Unexpected error in session spawning"
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        api.logger.debug("[DAEMON RUN] Failed to spawn session:", error);
        return {
          type: "error",
          errorMessage: `Failed to spawn session: ${errorMessage}`
        };
      }
    };
    const spawnTrackedHappyProcess = ({
      args,
      cwd,
      env,
      directoryCreated = false,
      message
    }) => {
      const happyProcess = spawnHappyCLI(args, {
        cwd,
        detached: true,
        stdio: "ignore",
        env
      });
      if (!happyProcess.pid) {
        api.logger.debug("[DAEMON RUN] Failed to spawn process - no PID returned");
        return Promise.resolve({
          type: "error",
          errorMessage: "Failed to spawn Happy process - no PID returned"
        });
      }
      api.logger.debug(`[DAEMON RUN] Spawned process with PID ${happyProcess.pid}`);
      const trackedSession = {
        startedBy: "daemon",
        pid: happyProcess.pid,
        childProcess: happyProcess,
        directoryCreated,
        message
      };
      pidToTrackedSession.set(happyProcess.pid, trackedSession);
      happyProcess.on("exit", (code, signal) => {
        api.logger.debug(`[DAEMON RUN] Child PID ${happyProcess.pid} exited with code ${code}, signal ${signal}`);
        if (happyProcess.pid) {
          onChildExited(happyProcess.pid);
        }
      });
      happyProcess.on("error", (error) => {
        api.logger.debug(`[DAEMON RUN] Child process error:`, error);
        if (happyProcess.pid) {
          onChildExited(happyProcess.pid);
        }
      });
      api.logger.debug(`[DAEMON RUN] Waiting for session webhook for PID ${happyProcess.pid}`);
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pidToAwaiter.delete(happyProcess.pid);
          api.logger.debug(`[DAEMON RUN] Session webhook timeout for PID ${happyProcess.pid}`);
          resolve({
            type: "error",
            errorMessage: `Session webhook timeout for PID ${happyProcess.pid}`
          });
        }, 15e3);
        pidToAwaiter.set(happyProcess.pid, (completedSession) => {
          clearTimeout(timeout);
          api.logger.debug(`[DAEMON RUN] Session ${completedSession.happySessionId} fully spawned with webhook`);
          resolve({
            type: "success",
            sessionId: completedSession.happySessionId
          });
        });
      });
    };
    const findTrackedSessionById = (happySessionId) => {
      for (const session of pidToTrackedSession.values()) {
        if (session.happySessionId === happySessionId) return session;
      }
      return sessionIdToFinishedSession.get(happySessionId);
    };
    const fetchServerSessionMetadata = async (sessionId, encryptionKey, encryptionVariant) => {
      try {
        const response = await axios.get(`${api.configuration.serverUrl}/v1/sessions`, {
          headers: { Authorization: `Bearer ${credentials.token}` },
          timeout: 1e4
        });
        const sessions = response.data.sessions;
        const matched = sessions.find((s) => s.id === sessionId);
        if (!matched) return null;
        const decrypted = api.decrypt(encryptionKey, encryptionVariant, api.decodeBase64(matched.metadata));
        return decrypted;
      } catch (error) {
        api.logger.debug(`[DAEMON RUN] Failed to fetch session metadata from server: ${error instanceof Error ? error.message : error}`);
        return null;
      }
    };
    const resumeSession = async (happySessionId, options) => {
      try {
        const tracked = findTrackedSessionById(happySessionId);
        if (!tracked) {
          return { type: "error", errorMessage: `Session ${happySessionId} is not tracked by this daemon. It may have been started before the daemon or on another machine.` };
        }
        if (!tracked.happySessionMetadataFromLocalWebhook) {
          return { type: "error", errorMessage: `Session ${happySessionId} has no metadata. Cannot resume.` };
        }
        if (!tracked.encryption) {
          return { type: "error", errorMessage: `Session ${happySessionId} has no stored encryption data. It was likely started before this feature was available. Restart the daemon and start a new session to enable resume.` };
        }
        let metadata = tracked.happySessionMetadataFromLocalWebhook;
        const needsFetch = !metadata.claudeSessionId && (!metadata.flavor || metadata.flavor === "claude") || !metadata.codexThreadId && metadata.flavor === "codex";
        if (needsFetch) {
          api.logger.debug(`[DAEMON RUN] Session ${happySessionId} missing agent session ID in webhook metadata, fetching from server`);
          const serverMetadata = await fetchServerSessionMetadata(happySessionId, tracked.encryption.encryptionKey, tracked.encryption.encryptionVariant);
          if (serverMetadata) {
            metadata = serverMetadata;
            tracked.happySessionMetadataFromLocalWebhook = serverMetadata;
          }
        }
        const launch = buildResumeLaunch(
          { id: happySessionId, active: true, metadata },
          { startedBy: "daemon", claudeStartingMode: "remote" }
        );
        if (options?.model) {
          launch.args.push("--model", options.model);
        }
        if (options?.permissionMode) {
          launch.args.push("--permission-mode", options.permissionMode);
        }
        await fs.access(launch.cwd);
        return spawnTrackedHappyProcess({
          args: launch.args,
          cwd: launch.cwd,
          env: {
            ...process.env,
            HAPPY_RECONNECT_SESSION_ID: happySessionId,
            HAPPY_RECONNECT_ENCRYPTION_KEY: api.encodeBase64(tracked.encryption.encryptionKey),
            HAPPY_RECONNECT_ENCRYPTION_VARIANT: tracked.encryption.encryptionVariant,
            HAPPY_RECONNECT_SEQ: String(tracked.encryption.seq),
            HAPPY_RECONNECT_METADATA_VERSION: String(tracked.encryption.metadataVersion),
            HAPPY_RECONNECT_AGENT_STATE_VERSION: String(tracked.encryption.agentStateVersion)
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : error && typeof error === "object" ? JSON.stringify(error) : String(error);
        api.logger.debug(`[DAEMON RUN] Failed to resume session: ${errorMessage}`, error instanceof Error ? error.stack : void 0);
        return {
          type: "error",
          errorMessage: `Failed to resume session: ${errorMessage}`
        };
      }
    };
    const stopSession = (sessionId) => {
      api.logger.debug(`[DAEMON RUN] Attempting to stop session ${sessionId}`);
      for (const [pid, session] of pidToTrackedSession.entries()) {
        if (session.happySessionId === sessionId || sessionId.startsWith("PID-") && pid === parseInt(sessionId.replace("PID-", ""))) {
          if (session.startedBy === "daemon" && session.childProcess) {
            try {
              session.childProcess.kill("SIGTERM");
              api.logger.debug(`[DAEMON RUN] Sent SIGTERM to daemon-spawned session ${sessionId}`);
            } catch (error) {
              api.logger.debug(`[DAEMON RUN] Failed to kill session ${sessionId}:`, error);
            }
          } else {
            try {
              process.kill(pid, "SIGTERM");
              api.logger.debug(`[DAEMON RUN] Sent SIGTERM to external session PID ${pid}`);
            } catch (error) {
              api.logger.debug(`[DAEMON RUN] Failed to kill external session PID ${pid}:`, error);
            }
          }
          pidToTrackedSession.delete(pid);
          api.logger.debug(`[DAEMON RUN] Removed session ${sessionId} from tracking`);
          return true;
        }
      }
      api.logger.debug(`[DAEMON RUN] Session ${sessionId} not found`);
      return false;
    };
    const onChildExited = (pid) => {
      const session = pidToTrackedSession.get(pid);
      if (session?.happySessionId && session.encryption) {
        sessionIdToFinishedSession.set(session.happySessionId, session);
        api.logger.debug(`[DAEMON RUN] Process PID ${pid} exited, preserved session ${session.happySessionId} for resume`);
      } else {
        api.logger.debug(`[DAEMON RUN] Removing exited process PID ${pid} from tracking`);
      }
      pidToTrackedSession.delete(pid);
    };
    const { port: controlPort, stop: stopControlServer } = await startDaemonControlServer({
      getChildren: getCurrentChildren,
      stopSession,
      spawnSession,
      requestShutdown: () => requestShutdown("happy-cli"),
      onHappySessionWebhook
    });
    const fileState = {
      pid: process.pid,
      httpPort: controlPort,
      startTime: (/* @__PURE__ */ new Date()).toLocaleString(),
      startedWithCliVersion: api.packageJson.version,
      daemonLogPath: api.logger.logFilePath
    };
    persistence.writeDaemonState(fileState);
    api.logger.debug("[DAEMON RUN] Daemon state written");
    const bundlePath = path.join(api.projectPath(), "dist", "index.mjs");
    let initialBundleMtimeMs = 0;
    try {
      initialBundleMtimeMs = fs$1.statSync(bundlePath).mtimeMs;
    } catch {
      api.logger.debug(`[DAEMON RUN] Bundle at ${bundlePath} not found; self-restart on upgrade disabled`);
    }
    const initialDaemonState = {
      status: "offline",
      pid: process.pid,
      httpPort: controlPort,
      startedAt: Date.now()
    };
    const api$1 = await api.ApiClient.create(credentials);
    const machine = await api$1.getOrCreateMachine({
      machineId,
      metadata: initialMachineMetadata,
      daemonState: initialDaemonState
    });
    api.logger.debug(`[DAEMON RUN] Machine registered: ${machine.id}`);
    const apiMachine = api$1.machineSyncClient(machine);
    apiMachine.setRPCHandlers({
      spawnSession,
      resumeSession,
      stopSession,
      requestShutdown: () => requestShutdown("happy-app")
    });
    apiMachine.connect();
    const heartbeatIntervalMs = parseInt(process.env.HAPPY_DAEMON_HEARTBEAT_INTERVAL || "60000");
    let heartbeatRunning = false;
    const restartOnStaleVersionAndHeartbeat = setInterval(async () => {
      if (heartbeatRunning) {
        return;
      }
      heartbeatRunning = true;
      if (process.env.DEBUG) {
        api.logger.debug(`[DAEMON RUN] Health check started at ${(/* @__PURE__ */ new Date()).toLocaleString()}`);
      }
      for (const [pid, _] of pidToTrackedSession.entries()) {
        try {
          process.kill(pid, 0);
        } catch (error) {
          api.logger.debug(`[DAEMON RUN] Removing stale session with PID ${pid} (process no longer exists)`);
          pidToTrackedSession.delete(pid);
        }
      }
      let bundleReplaced = false;
      if (initialBundleMtimeMs > 0) {
        try {
          const currentMtimeMs = fs$1.statSync(bundlePath).mtimeMs;
          bundleReplaced = currentMtimeMs !== initialBundleMtimeMs;
        } catch {
        }
      }
      if (bundleReplaced) {
        api.logger.debug("[DAEMON RUN] Daemon bundle replaced on disk, handing off to new daemon");
        clearInterval(restartOnStaleVersionAndHeartbeat);
        apiMachine.shutdown();
        await stopControlServer();
        await cleanupDaemonState();
        await persistence.releaseDaemonLock(daemonLockHandle);
        await stopCaffeinate();
        try {
          spawnHappyCLI(["daemon", "start"], {
            detached: true,
            stdio: "ignore"
          });
        } catch (error) {
          api.logger.debug("[DAEMON RUN] Failed to spawn new daemon, this is quite likely to happen during integration tests as we are cleaning out dist/ directory", error);
        }
        process.exit(0);
      }
      const daemonState = await persistence.readDaemonState();
      if (daemonState && daemonState.pid !== process.pid) {
        api.logger.debug("[DAEMON RUN] Somehow a different daemon was started without killing us. We should kill ourselves.");
        requestShutdown("exception", "A different daemon was started without killing us. We should kill ourselves.");
      }
      try {
        const updatedState = {
          pid: process.pid,
          httpPort: controlPort,
          startTime: fileState.startTime,
          startedWithCliVersion: api.packageJson.version,
          lastHeartbeat: (/* @__PURE__ */ new Date()).toLocaleString(),
          daemonLogPath: fileState.daemonLogPath
        };
        persistence.writeDaemonState(updatedState);
        if (process.env.DEBUG) {
          api.logger.debug(`[DAEMON RUN] Health check completed at ${updatedState.lastHeartbeat}`);
        }
      } catch (error) {
        api.logger.debug("[DAEMON RUN] Failed to write heartbeat", error);
      }
      heartbeatRunning = false;
    }, heartbeatIntervalMs);
    const cleanupAndShutdown = async (source, errorMessage) => {
      api.logger.debug(`[DAEMON RUN] Starting proper cleanup (source: ${source}, errorMessage: ${errorMessage})...`);
      if (restartOnStaleVersionAndHeartbeat) {
        clearInterval(restartOnStaleVersionAndHeartbeat);
        api.logger.debug("[DAEMON RUN] Health check interval cleared");
      }
      await apiMachine.updateDaemonState((state) => ({
        ...state,
        status: "shutting-down",
        shutdownRequestedAt: Date.now(),
        shutdownSource: source
      }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      apiMachine.shutdown();
      await stopControlServer();
      await cleanupDaemonState();
      await stopCaffeinate();
      await persistence.releaseDaemonLock(daemonLockHandle);
      api.logger.debug("[DAEMON RUN] Cleanup completed, exiting process");
      process.exit(0);
    };
    api.logger.debug("[DAEMON RUN] Daemon started successfully, waiting for shutdown request");
    const shutdownRequest = await resolvesWhenShutdownRequested;
    await cleanupAndShutdown(shutdownRequest.source, shutdownRequest.errorMessage);
  } catch (error) {
    api.logger.debug("[DAEMON RUN][FATAL] Failed somewhere unexpectedly - exiting with code 1", error);
    process.exit(1);
  }
}

function createMcpServer(handler) {
  const mcp = new mcp_js.McpServer({
    name: "Happy MCP",
    version: "1.0.0"
  });
  mcp.registerTool("change_title", {
    description: "Change the title of the current chat session",
    title: "Change Chat Title",
    inputSchema: {
      title: z.z.string().describe("The new title for the chat session")
    }
  }, async (args) => {
    const response = await handler(args.title);
    api.logger.debug("[happyMCP] Response:", response);
    if (response.success) {
      return {
        content: [
          {
            type: "text",
            text: `Successfully changed chat title to: "${args.title}"`
          }
        ],
        isError: false
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `Failed to change chat title: ${response.error || "Unknown error"}`
          }
        ],
        isError: true
      };
    }
  });
  return mcp;
}
async function startHappyServer(client) {
  api.logger.debug(`[happyMCP] server:start sessionId=${client.sessionId}`);
  const handler = async (title) => {
    api.logger.debug("[happyMCP] Changing title to:", title);
    try {
      client.sendClaudeSessionMessage({
        type: "summary",
        summary: title,
        leafUuid: node_crypto.randomUUID()
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  };
  const server = node_http.createServer(async (req, res) => {
    const mcp = createMcpServer(handler);
    try {
      const transport = new streamableHttp_js.StreamableHTTPServerTransport({
        sessionIdGenerator: void 0
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
      res.on("close", () => {
        transport.close();
        mcp.close();
      });
    } catch (error) {
      api.logger.debug("Error handling request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end();
      }
      mcp.close();
    }
  });
  const baseUrl = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(new URL(`http://127.0.0.1:${addr.port}`));
    });
  });
  api.logger.debug(`[happyMCP] server:ready sessionId=${client.sessionId} url=${baseUrl.toString()}`);
  return {
    url: baseUrl.toString(),
    toolNames: ["change_title"],
    stop: () => {
      api.logger.debug(`[happyMCP] server:stop sessionId=${client.sessionId}`);
      server.close();
    }
  };
}

async function startHookServer(options) {
  const { onSessionHook } = options;
  return new Promise((resolve, reject) => {
    const server = node_http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/hook/session-start") {
        const timeout = setTimeout(() => {
          if (!res.headersSent) {
            api.logger.debug("[hookServer] Request timeout");
            res.writeHead(408).end("timeout");
          }
        }, 5e3);
        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          clearTimeout(timeout);
          const body = Buffer.concat(chunks).toString("utf-8");
          api.logger.debug("[hookServer] Received session hook:", body);
          let data = {};
          try {
            data = JSON.parse(body);
          } catch (parseError) {
            api.logger.debug("[hookServer] Failed to parse hook data as JSON:", parseError);
          }
          const sessionId = data.session_id || data.sessionId;
          if (sessionId) {
            api.logger.debug(`[hookServer] Session hook received session ID: ${sessionId}`);
            onSessionHook(sessionId, data);
          } else {
            api.logger.debug("[hookServer] Session hook received but no session_id found in data");
          }
          res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        } catch (error) {
          clearTimeout(timeout);
          api.logger.debug("[hookServer] Error handling session hook:", error);
          if (!res.headersSent) {
            res.writeHead(500).end("error");
          }
        }
        return;
      }
      res.writeHead(404).end("not found");
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }
      const port = address.port;
      api.logger.debug(`[hookServer] Started on port ${port}`);
      resolve({
        port,
        stop: () => {
          server.close();
          api.logger.debug("[hookServer] Stopped");
        }
      });
    });
    server.on("error", (err) => {
      api.logger.debug("[hookServer] Server error:", err);
      reject(err);
    });
  });
}

function generateHookSettingsFile(port) {
  const hooksDir = node_path.join(api.configuration.happyHomeDir, "tmp", "hooks");
  node_fs.mkdirSync(hooksDir, { recursive: true });
  const filename = `session-hook-${process.pid}.json`;
  const filepath = node_path.join(hooksDir, filename);
  const forwarderScript = node_path.resolve(api.projectPath(), "scripts", "session_hook_forwarder.cjs");
  const hookCommand = `node "${forwarderScript}" ${port}`;
  const settings = {
    hooks: {
      SessionStart: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: hookCommand
            }
          ]
        }
      ]
    }
  };
  node_fs.writeFileSync(filepath, JSON.stringify(settings, null, 2));
  api.logger.debug(`[generateHookSettings] Created hook settings file: ${filepath}`);
  return filepath;
}
function cleanupHookSettingsFile(filepath) {
  try {
    if (node_fs.existsSync(filepath)) {
      node_fs.unlinkSync(filepath);
      api.logger.debug(`[generateHookSettings] Cleaned up hook settings file: ${filepath}`);
    }
  } catch (error) {
    api.logger.debug(`[generateHookSettings] Failed to cleanup hook settings file: ${error}`);
  }
}

function registerKillSessionHandler(rpcHandlerManager, killThisHappy) {
  rpcHandlerManager.registerHandler("killSession", async () => {
    api.logger.debug("Kill session request received");
    void killThisHappy();
    return {
      success: true,
      message: "Killing happy-cli process"
    };
  });
}

async function runClaude(credentials, options = {}) {
  api.logger.debug(`[CLAUDE] ===== CLAUDE MODE STARTING =====`);
  api.logger.debug(`[CLAUDE] This is the Claude agent, NOT Gemini`);
  const workingDirectory = process.cwd();
  const sessionTag = node_crypto.randomUUID();
  api.logger.debugLargeJson("[START] Happy process started", getEnvironmentInfo());
  api.logger.debug(`[START] Options: startedBy=${options.startedBy}, startingMode=${options.startingMode}`);
  if (options.startedBy === "daemon" && options.startingMode === "local") {
    throw new Error("Daemon-spawned sessions cannot use local/interactive mode. Use --happy-starting-mode remote or spawn sessions directly from terminal.");
  }
  api.connectionState.setBackend("Claude");
  const api$1 = await api.ApiClient.create(credentials);
  let state = {};
  const settings = await persistence.readSettings();
  let machineId = settings?.machineId;
  const sandboxConfig = options.noSandbox ? void 0 : settings?.sandboxConfig;
  const sandboxEnabled = Boolean(sandboxConfig?.enabled);
  const initialPermissionMode = applySandboxPermissionPolicy(
    resolveInitialClaudePermissionMode(options.permissionMode, options.claudeArgs),
    sandboxEnabled
  );
  const dangerouslySkipPermissions = initialPermissionMode === "bypassPermissions" || initialPermissionMode === "yolo" || sandboxEnabled || Boolean(options.claudeArgs?.includes("--dangerously-skip-permissions"));
  if (!machineId) {
    console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/slopus/happy-cli/issues`);
    process.exit(1);
  }
  api.logger.debug(`Using machineId: ${machineId}`);
  await api$1.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata
  });
  let metadata = {
    path: workingDirectory,
    host: os.hostname(),
    version: api.packageJson.version,
    os: os.platform(),
    machineId,
    homeDir: os.homedir(),
    happyHomeDir: api.configuration.happyHomeDir,
    happyLibDir: api.projectPath(),
    happyToolsDir: node_path.resolve(api.projectPath(), "tools", "unpacked"),
    startedFromDaemon: options.startedBy === "daemon",
    hostPid: process.pid,
    startedBy: options.startedBy || "terminal",
    // Initialize lifecycle state
    lifecycleState: "running",
    lifecycleStateSince: Date.now(),
    flavor: "claude",
    sandbox: sandboxConfig?.enabled ? sandboxConfig : null,
    dangerouslySkipPermissions
  };
  const reconnectSessionId = process.env.HAPPY_RECONNECT_SESSION_ID;
  const reconnectKeyBase64 = process.env.HAPPY_RECONNECT_ENCRYPTION_KEY;
  const reconnectVariant = process.env.HAPPY_RECONNECT_ENCRYPTION_VARIANT;
  const reconnectSeq = process.env.HAPPY_RECONNECT_SEQ;
  const reconnectMetadataVersion = process.env.HAPPY_RECONNECT_METADATA_VERSION;
  const reconnectAgentStateVersion = process.env.HAPPY_RECONNECT_AGENT_STATE_VERSION;
  let response;
  if (reconnectSessionId && reconnectKeyBase64 && reconnectVariant) {
    api.logger.debug(`[START] Reconnecting to existing session ${reconnectSessionId}`);
    response = {
      id: reconnectSessionId,
      seq: parseInt(reconnectSeq || "0", 10),
      encryptionKey: api.decodeBase64(reconnectKeyBase64),
      encryptionVariant: reconnectVariant,
      metadata,
      metadataVersion: parseInt(reconnectMetadataVersion || "0", 10),
      agentState: state,
      agentStateVersion: parseInt(reconnectAgentStateVersion || "0", 10)
    };
  } else {
    response = await api$1.getOrCreateSession({ tag: sessionTag, metadata, state });
  }
  if (!response) {
    let offlineSessionId = null;
    const reconnection = api.startOfflineReconnection({
      serverUrl: api.configuration.serverUrl,
      onReconnected: async () => {
        const resp = await api$1.getOrCreateSession({ tag: node_crypto.randomUUID(), metadata, state });
        if (!resp) throw new Error("Server unavailable");
        const session2 = api$1.sessionSyncClient(resp);
        const scanner = await createSessionScanner({
          sessionId: null,
          workingDirectory,
          onMessage: (msg) => session2.sendClaudeSessionMessage(msg)
        });
        if (offlineSessionId) scanner.onNewSession(offlineSessionId);
        return { session: session2, scanner };
      },
      onNotify: console.log,
      onCleanup: () => {
      }
    });
    try {
      await claudeLocal({
        path: workingDirectory,
        sessionId: null,
        onSessionFound: (id) => {
          offlineSessionId = id;
        },
        onThinkingChange: () => {
        },
        abort: new AbortController().signal,
        claudeEnvVars: options.claudeEnvVars,
        claudeArgs: options.claudeArgs,
        mcpServers: {},
        allowedTools: [],
        sandboxConfig
      });
    } finally {
      reconnection.cancel();
    }
    process.exit(0);
  }
  api.logger.debug(`Session created: ${response.id}`);
  try {
    api.logger.debug(`[START] Reporting session ${response.id} to daemon`);
    const result = await notifyDaemonSessionStarted(response.id, metadata, {
      encryptionKey: api.encodeBase64(response.encryptionKey),
      encryptionVariant: response.encryptionVariant,
      seq: response.seq,
      metadataVersion: response.metadataVersion,
      agentStateVersion: response.agentStateVersion
    });
    if (result.error) {
      api.logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
    } else {
      api.logger.debug(`[START] Reported session ${response.id} to daemon`);
    }
  } catch (error) {
    api.logger.debug("[START] Failed to report to daemon (may not be running):", error);
  }
  const session = api$1.sessionSyncClient(response);
  if (reconnectSessionId) {
    session.suppressNextArchiveSignal();
    session.skipExistingMessages();
    session.updateMetadata((meta) => ({
      ...meta,
      lifecycleState: "running",
      archivedBy: void 0
    }));
  }
  const happyServer = await startHappyServer(session);
  api.logger.debug(`[START] Happy MCP server started at ${happyServer.url}`);
  let currentSession = null;
  const hookServer = await startHookServer({
    onSessionHook: (sessionId, data) => {
      api.logger.debug(`[START] Session hook received: ${sessionId}`, data);
      if (currentSession) {
        const previousSessionId = currentSession.sessionId;
        if (previousSessionId !== sessionId) {
          api.logger.debug(`[START] Claude session ID changed: ${previousSessionId} -> ${sessionId}`);
          currentSession.onSessionFound(sessionId);
        }
      }
    }
  });
  api.logger.debug(`[START] Hook server started on port ${hookServer.port}`);
  const hookSettingsPath = generateHookSettingsFile(hookServer.port);
  api.logger.debug(`[START] Generated hook settings file: ${hookSettingsPath}`);
  const logPath = api.logger.logFilePath;
  api.logger.infoDeveloper(`Session: ${response.id}`);
  api.logger.infoDeveloper(`Logs: ${logPath}`);
  session.updateAgentState((currentState) => ({
    ...currentState,
    controlledByUser: options.startingMode !== "remote"
  }));
  const messageQueue = new MessageQueue2((mode) => hashObject({
    isPlan: mode.permissionMode === "plan",
    model: mode.model,
    fallbackModel: mode.fallbackModel,
    customSystemPrompt: mode.customSystemPrompt,
    appendSystemPrompt: mode.appendSystemPrompt,
    allowedTools: mode.allowedTools,
    disallowedTools: mode.disallowedTools
  }));
  let currentPermissionMode = initialPermissionMode;
  let currentModel = options.model;
  let currentFallbackModel = void 0;
  let currentCustomSystemPrompt = void 0;
  let currentAppendSystemPrompt = void 0;
  let currentAllowedTools = void 0;
  let currentDisallowedTools = void 0;
  let currentRunMode = options.startingMode ?? "local";
  session.on("archived", () => {
    api.logger.debug("[loop] Session archived from web/mobile, cleaning up...");
    cleanup();
  });
  session.onUserMessage((message) => {
    let messagePermissionMode = currentPermissionMode;
    if (message.meta?.permissionMode) {
      messagePermissionMode = applySandboxPermissionPolicy(message.meta.permissionMode, sandboxEnabled);
      currentPermissionMode = messagePermissionMode;
      api.logger.debug(`[loop] Permission mode updated from user message to: ${currentPermissionMode}`);
    } else {
      api.logger.debug(`[loop] User message received with no permission mode override, using current: ${currentPermissionMode}`);
    }
    let messageModel = currentModel;
    if (message.meta?.hasOwnProperty("model")) {
      messageModel = message.meta.model || void 0;
      currentModel = messageModel;
      api.logger.debug(`[loop] Model updated from user message: ${messageModel || "reset to default"}`);
    } else {
      api.logger.debug(`[loop] User message received with no model override, using current: ${currentModel || "default"}`);
    }
    let messageCustomSystemPrompt = currentCustomSystemPrompt;
    if (message.meta?.hasOwnProperty("customSystemPrompt")) {
      messageCustomSystemPrompt = message.meta.customSystemPrompt || void 0;
      currentCustomSystemPrompt = messageCustomSystemPrompt;
      api.logger.debug(`[loop] Custom system prompt updated from user message: ${messageCustomSystemPrompt ? "set" : "reset to none"}`);
    } else {
      api.logger.debug(`[loop] User message received with no custom system prompt override, using current: ${currentCustomSystemPrompt ? "set" : "none"}`);
    }
    let messageFallbackModel = currentFallbackModel;
    if (message.meta?.hasOwnProperty("fallbackModel")) {
      messageFallbackModel = message.meta.fallbackModel || void 0;
      currentFallbackModel = messageFallbackModel;
      api.logger.debug(`[loop] Fallback model updated from user message: ${messageFallbackModel || "reset to none"}`);
    } else {
      api.logger.debug(`[loop] User message received with no fallback model override, using current: ${currentFallbackModel || "none"}`);
    }
    let messageAppendSystemPrompt = currentAppendSystemPrompt;
    if (message.meta?.hasOwnProperty("appendSystemPrompt")) {
      messageAppendSystemPrompt = message.meta.appendSystemPrompt || void 0;
      currentAppendSystemPrompt = messageAppendSystemPrompt;
      api.logger.debug(`[loop] Append system prompt updated from user message: ${messageAppendSystemPrompt ? "set" : "reset to none"}`);
    } else {
      api.logger.debug(`[loop] User message received with no append system prompt override, using current: ${currentAppendSystemPrompt ? "set" : "none"}`);
    }
    let messageAllowedTools = currentAllowedTools;
    if (message.meta?.hasOwnProperty("allowedTools")) {
      messageAllowedTools = message.meta.allowedTools || void 0;
      currentAllowedTools = messageAllowedTools;
      api.logger.debug(`[loop] Allowed tools updated from user message: ${messageAllowedTools ? messageAllowedTools.join(", ") : "reset to none"}`);
    } else {
      api.logger.debug(`[loop] User message received with no allowed tools override, using current: ${currentAllowedTools ? currentAllowedTools.join(", ") : "none"}`);
    }
    let messageDisallowedTools = currentDisallowedTools;
    if (message.meta?.hasOwnProperty("disallowedTools")) {
      messageDisallowedTools = message.meta.disallowedTools || void 0;
      currentDisallowedTools = messageDisallowedTools;
      api.logger.debug(`[loop] Disallowed tools updated from user message: ${messageDisallowedTools ? messageDisallowedTools.join(", ") : "reset to none"}`);
    } else {
      api.logger.debug(`[loop] User message received with no disallowed tools override, using current: ${currentDisallowedTools ? currentDisallowedTools.join(", ") : "none"}`);
    }
    const specialCommand = parseSpecialCommand(message.content.text);
    if (specialCommand.type === "compact") {
      api.logger.debug("[start] Detected /compact command");
      const enhancedMode2 = {
        permissionMode: messagePermissionMode || "default",
        model: messageModel,
        fallbackModel: messageFallbackModel,
        customSystemPrompt: messageCustomSystemPrompt,
        appendSystemPrompt: messageAppendSystemPrompt,
        allowedTools: messageAllowedTools,
        disallowedTools: messageDisallowedTools
      };
      messageQueue.pushIsolateAndClear(specialCommand.originalMessage || message.content.text, enhancedMode2);
      api.logger.debugLargeJson("[start] /compact command pushed to queue:", message);
      return;
    }
    if (specialCommand.type === "clear") {
      api.logger.debug("[start] Detected /clear command");
      const enhancedMode2 = {
        permissionMode: messagePermissionMode || "default",
        model: messageModel,
        fallbackModel: messageFallbackModel,
        customSystemPrompt: messageCustomSystemPrompt,
        appendSystemPrompt: messageAppendSystemPrompt,
        allowedTools: messageAllowedTools,
        disallowedTools: messageDisallowedTools
      };
      messageQueue.pushIsolateAndClear(specialCommand.originalMessage || message.content.text, enhancedMode2);
      api.logger.debugLargeJson("[start] /compact command pushed to queue:", message);
      return;
    }
    if (specialCommand.type === "mcp" || specialCommand.type === "skills") {
      if (currentRunMode === "local") {
        api.logger.debug(`[start] /${specialCommand.type} in local mode \u2014 passing through to Claude Code`);
      } else {
        api.logger.debug(`[start] Detected /${specialCommand.type} command in remote mode`);
        const metadata2 = session.getMetadata();
        let responseText;
        if (specialCommand.type === "mcp") {
          const servers = metadata2?.mcpServers;
          if (servers && servers.length > 0) {
            responseText = "**MCP Servers**\n\n" + servers.map((s) => `- **${s.name}** \u2014 ${s.status}`).join("\n");
          } else {
            responseText = "No MCP servers configured. Session may still be initializing \u2014 try again after sending a message.";
          }
        } else {
          const skills = metadata2?.skills ?? metadata2?.slashCommands;
          if (skills && skills.length > 0) {
            responseText = "**Available Skills**\n\n" + skills.map((s) => `- /${s}`).join("\n");
          } else {
            responseText = "No skills available. Session may still be initializing \u2014 try again after sending a message.";
          }
        }
        session.sendClaudeSessionMessage({
          type: "assistant",
          uuid: node_crypto.randomUUID(),
          parentUuid: null,
          isSidechain: false,
          sessionId: session.sessionId || "unknown",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          message: {
            role: "assistant",
            model: "system",
            content: [{ type: "text", text: responseText }]
          }
        });
        return;
      }
    }
    const enhancedMode = {
      permissionMode: messagePermissionMode || "default",
      model: messageModel,
      fallbackModel: messageFallbackModel,
      customSystemPrompt: messageCustomSystemPrompt,
      appendSystemPrompt: messageAppendSystemPrompt,
      allowedTools: messageAllowedTools,
      disallowedTools: messageDisallowedTools
    };
    messageQueue.push(message.content.text, enhancedMode);
    api.logger.debugLargeJson("User message pushed to queue:", message);
  });
  const cleanup = async () => {
    api.logger.debug("[START] Received termination signal, cleaning up...");
    try {
      if (session) {
        session.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: "archived",
          lifecycleStateSince: Date.now(),
          archivedBy: "cli",
          archiveReason: "User terminated"
        }));
        currentSession?.cleanup();
        session.sendSessionDeath();
        await session.flush();
        await session.close();
      }
      happyServer.stop();
      hookServer.stop();
      cleanupHookSettingsFile(hookSettingsPath);
      api.logger.debug("[START] Cleanup complete, exiting");
      process.exit(0);
    } catch (error) {
      api.logger.debug("[START] Error during cleanup:", error);
      process.exit(1);
    }
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
  process.on("uncaughtException", (error) => {
    api.logger.debug("[START] Uncaught exception:", error);
    cleanup();
  });
  process.on("unhandledRejection", (reason) => {
    api.logger.debug("[START] Unhandled rejection:", reason);
    cleanup();
  });
  registerKillSessionHandler(session.rpcHandlerManager, cleanup);
  const exitCode = await loop({
    path: workingDirectory,
    model: options.model,
    permissionMode: initialPermissionMode,
    startingMode: options.startingMode,
    messageQueue,
    api: api$1,
    allowedTools: happyServer.toolNames.map((toolName) => `mcp__happy__${toolName}`),
    onModeChange: (newMode) => {
      currentRunMode = newMode;
      session.sendSessionEvent({ type: "switch", mode: newMode });
      session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser: newMode === "local"
      }));
    },
    onSessionReady: (sessionInstance) => {
      currentSession = sessionInstance;
    },
    mcpServers: {
      "happy": {
        type: "http",
        url: happyServer.url
      }
    },
    session,
    claudeEnvVars: options.claudeEnvVars,
    claudeArgs: options.claudeArgs,
    sandboxConfig,
    hookSettingsPath,
    jsRuntime: options.jsRuntime
  });
  currentSession?.cleanup();
  session.sendSessionDeath();
  api.logger.debug("Waiting for socket to flush...");
  await session.flush();
  api.logger.debug("Closing session...");
  await session.close();
  happyServer.stop();
  api.logger.debug("Stopped Happy MCP server");
  hookServer.stop();
  cleanupHookSettingsFile(hookSettingsPath);
  api.logger.debug("Stopped Hook server and cleaned up settings file");
  process.exit(exitCode);
}

const PLIST_LABEL$1 = "com.happy-cli.daemon";
const PLIST_FILE$1 = `/Library/LaunchDaemons/${PLIST_LABEL$1}.plist`;
async function install$1() {
  try {
    if (fs$1.existsSync(PLIST_FILE$1)) {
      api.logger.info("Daemon plist already exists. Uninstalling first...");
      child_process.execSync(`launchctl unload ${PLIST_FILE$1}`, { stdio: "inherit" });
    }
    const happyPath = process.argv[0];
    const scriptPath = process.argv[1];
    const plistContent = trimIdent(`
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
            <dict>
                <key>Label</key>
                <string>${PLIST_LABEL$1}</string>
                
                <key>ProgramArguments</key>
                <array>
                    <string>${happyPath}</string>
                    <string>${scriptPath}</string>
                    <string>happy-daemon</string>
                </array>
                
                <key>EnvironmentVariables</key>
                <dict>
                    <key>HAPPY_DAEMON_MODE</key>
                    <string>true</string>
                </dict>
                
                <key>RunAtLoad</key>
                <true/>
                
                <key>KeepAlive</key>
                <true/>
                
                <key>StandardErrorPath</key>
                <string>${os$1.homedir()}/.happy/daemon.err</string>
                
                <key>StandardOutPath</key>
                <string>${os$1.homedir()}/.happy/daemon.log</string>
                
                <key>WorkingDirectory</key>
                <string>/tmp</string>
            </dict>
            </plist>
        `);
    fs$1.writeFileSync(PLIST_FILE$1, plistContent);
    fs$1.chmodSync(PLIST_FILE$1, 420);
    api.logger.info(`Created daemon plist at ${PLIST_FILE$1}`);
    child_process.execSync(`launchctl load ${PLIST_FILE$1}`, { stdio: "inherit" });
    api.logger.info("Daemon installed and started successfully");
    api.logger.info("Check logs at ~/.happy/daemon.log");
  } catch (error) {
    api.logger.debug("Failed to install daemon:", error);
    throw error;
  }
}

async function install() {
  if (process.platform !== "darwin") {
    throw new Error("Daemon installation is currently only supported on macOS");
  }
  if (process.getuid && process.getuid() !== 0) {
    throw new Error("Daemon installation requires sudo privileges. Please run with sudo.");
  }
  api.logger.info("Installing Happy CLI daemon for macOS...");
  await install$1();
}

const PLIST_LABEL = "com.happy-cli.daemon";
const PLIST_FILE = `/Library/LaunchDaemons/${PLIST_LABEL}.plist`;
async function uninstall$1() {
  try {
    if (!fs$1.existsSync(PLIST_FILE)) {
      api.logger.info("Daemon plist not found. Nothing to uninstall.");
      return;
    }
    try {
      child_process.execSync(`launchctl unload ${PLIST_FILE}`, { stdio: "inherit" });
      api.logger.info("Daemon stopped successfully");
    } catch (error) {
      api.logger.info("Failed to unload daemon (it might not be running)");
    }
    fs$1.unlinkSync(PLIST_FILE);
    api.logger.info(`Removed daemon plist from ${PLIST_FILE}`);
    api.logger.info("Daemon uninstalled successfully");
  } catch (error) {
    api.logger.debug("Failed to uninstall daemon:", error);
    throw error;
  }
}

async function uninstall() {
  if (process.platform !== "darwin") {
    throw new Error("Daemon uninstallation is currently only supported on macOS");
  }
  if (process.getuid && process.getuid() !== 0) {
    throw new Error("Daemon uninstallation requires sudo privileges. Please run with sudo.");
  }
  api.logger.info("Uninstalling Happy CLI daemon for macOS...");
  await uninstall$1();
}

async function handleAuthCommand(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    showAuthHelp();
    return;
  }
  switch (subcommand) {
    case "login":
      await handleAuthLogin(args.slice(1));
      break;
    case "logout":
      await handleAuthLogout();
      break;
    case "status":
      await handleAuthStatus();
      break;
    default:
      console.error(chalk.red(`Unknown auth subcommand: ${subcommand}`));
      showAuthHelp();
      process.exit(1);
  }
}
function showAuthHelp() {
  console.log(`
${chalk.bold("happy auth")} - Authentication management

${chalk.bold("Usage:")}
  happy auth login [--force]    Authenticate with Happy
  happy auth logout             Remove authentication and machine data
  happy auth status             Show authentication status
  happy auth help               Show this help message

${chalk.bold("Options:")}
  --force    Clear credentials, machine ID, and stop daemon before re-auth

${chalk.gray("PS: Your master secret never leaves your mobile/web device. Each CLI machine")}
${chalk.gray("receives only a derived key for per-machine encryption, so backup codes")}
${chalk.gray("cannot be displayed from the CLI.")}
`);
}
async function handleAuthLogin(args) {
  const forceAuth = args.includes("--force") || args.includes("-f");
  if (forceAuth) {
    console.log(chalk.yellow("Force authentication requested."));
    console.log(chalk.gray("This will:"));
    console.log(chalk.gray("  \u2022 Clear existing credentials"));
    console.log(chalk.gray("  \u2022 Clear machine ID"));
    console.log(chalk.gray("  \u2022 Stop daemon if running"));
    console.log(chalk.gray("  \u2022 Re-authenticate and register machine\n"));
    try {
      api.logger.debug("Stopping daemon for force auth...");
      await stopDaemon();
      console.log(chalk.gray("\u2713 Stopped daemon"));
    } catch (error) {
      api.logger.debug("Daemon was not running or failed to stop:", error);
    }
    await persistence.clearCredentials();
    console.log(chalk.gray("\u2713 Cleared credentials"));
    await persistence.clearMachineId();
    console.log(chalk.gray("\u2713 Cleared machine ID"));
    console.log("");
  }
  if (!forceAuth) {
    const existingCreds = await persistence.readCredentials();
    const settings = await persistence.readSettings();
    if (existingCreds && settings?.machineId) {
      console.log(chalk.green("\u2713 Already authenticated"));
      console.log(chalk.gray(`  Machine ID: ${settings.machineId}`));
      console.log(chalk.gray(`  Host: ${os.hostname()}`));
      console.log(chalk.gray(`  Use 'happy auth login --force' to re-authenticate`));
      return;
    } else if (existingCreds && !settings?.machineId) {
      console.log(chalk.yellow("\u26A0\uFE0F  Credentials exist but machine ID is missing"));
      console.log(chalk.gray("  This can happen if --auth flag was used previously"));
      console.log(chalk.gray("  Fixing by setting up machine...\n"));
    }
  }
  try {
    const result = await authAndSetupMachineIfNeeded();
    console.log(chalk.green("\n\u2713 Authentication successful"));
    console.log(chalk.gray(`  Machine ID: ${result.machineId}`));
  } catch (error) {
    console.error(chalk.red("Authentication failed:"), error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}
async function handleAuthLogout() {
  const happyDir = api.configuration.happyHomeDir;
  const credentials = await persistence.readCredentials();
  if (!credentials) {
    console.log(chalk.yellow("Not currently authenticated"));
    return;
  }
  console.log(chalk.blue("This will log you out of Happy"));
  console.log(chalk.yellow("\u26A0\uFE0F  You will need to re-authenticate to use Happy again"));
  const rl = node_readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const answer = await new Promise((resolve) => {
    rl.question(chalk.yellow("Are you sure you want to log out? (y/N): "), resolve);
  });
  rl.close();
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    try {
      try {
        await stopDaemon();
        console.log(chalk.gray("Stopped daemon"));
      } catch {
      }
      if (node_fs.existsSync(happyDir)) {
        node_fs.rmSync(happyDir, { recursive: true, force: true });
      }
      console.log(chalk.green("\u2713 Successfully logged out"));
      console.log(chalk.gray('  Run "happy auth login" to authenticate again'));
    } catch (error) {
      throw new Error(`Failed to logout: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  } else {
    console.log(chalk.blue("Logout cancelled"));
  }
}
async function handleAuthStatus() {
  const credentials = await persistence.readCredentials();
  const settings = await persistence.readSettings();
  console.log(chalk.bold("\nAuthentication Status\n"));
  if (!credentials) {
    console.log(chalk.red("\u2717 Not authenticated"));
    console.log(chalk.gray('  Run "happy auth login" to authenticate'));
    return;
  }
  console.log(chalk.green("\u2713 Authenticated"));
  const tokenPreview = credentials.token.substring(0, 30) + "...";
  console.log(chalk.gray(`  Token: ${tokenPreview}`));
  if (settings?.machineId) {
    console.log(chalk.green("\u2713 Machine registered"));
    console.log(chalk.gray(`  Machine ID: ${settings.machineId}`));
    console.log(chalk.gray(`  Host: ${os.hostname()}`));
  } else {
    console.log(chalk.yellow("\u26A0\uFE0F  Machine not registered"));
    console.log(chalk.gray('  Run "happy auth login --force" to fix this'));
  }
  console.log(chalk.gray(`
  Data directory: ${api.configuration.happyHomeDir}`));
  try {
    const running = await checkIfDaemonRunningAndCleanupStaleState();
    if (running) {
      console.log(chalk.green("\u2713 Daemon running"));
    } else {
      console.log(chalk.gray("\u2717 Daemon not running"));
    }
  } catch {
    console.log(chalk.gray("\u2717 Daemon not running"));
  }
}

const CLIENT_ID$2 = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE_URL = "https://auth.openai.com";
const DEFAULT_PORT$2 = 1455;
function generatePKCE$2() {
  const verifier = crypto.randomBytes(32).toString("base64url").replace(/[^a-zA-Z0-9\-._~]/g, "");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { verifier, challenge };
}
function generateState$2() {
  return crypto.randomBytes(16).toString("hex");
}
function parseJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payload = Buffer.from(parts[1], "base64url").toString();
  return JSON.parse(payload);
}
async function findAvailablePort$2() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function isPortAvailable$2(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once("error", () => {
      testServer.close();
      resolve(false);
    });
    testServer.listen(port, "127.0.0.1", () => {
      testServer.close(() => resolve(true));
    });
  });
}
async function exchangeCodeForTokens$2(code, verifier, port) {
  const response = await fetch(`${AUTH_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID$2,
      code,
      code_verifier: verifier,
      redirect_uri: `http://localhost:${port}/auth/callback`
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  const data = await response.json();
  const idTokenPayload = parseJWT(data.id_token);
  let accountId = idTokenPayload.chatgpt_account_id;
  if (!accountId) {
    const authClaim = idTokenPayload["https://api.openai.com/auth"];
    if (authClaim && typeof authClaim === "object") {
      accountId = authClaim.chatgpt_account_id || authClaim.account_id;
    }
  }
  return {
    id_token: data.id_token,
    access_token: data.access_token || data.id_token,
    refresh_token: data.refresh_token,
    account_id: accountId
  };
}
async function startCallbackServer$2(state, verifier, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        if (receivedState !== state) {
          res.writeHead(400);
          res.end("Invalid state parameter");
          server.close();
          reject(new Error("Invalid state parameter"));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }
        try {
          const tokens = await exchangeCodeForTokens$2(code, verifier, port);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
                        <html>
                        <body style="font-family: sans-serif; padding: 20px;">
                            <h2>\u2705 Authentication Successful!</h2>
                            <p>You can close this window and return to your terminal.</p>
                            <script>setTimeout(() => window.close(), 3000);<\/script>
                        </body>
                        </html>
                    `);
          server.close();
          resolve(tokens);
        } catch (error) {
          res.writeHead(500);
          res.end("Token exchange failed");
          server.close();
          reject(error);
        }
      }
    });
    server.listen(port, "127.0.0.1", () => {
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 5 * 60 * 1e3);
  });
}
async function authenticateCodex() {
  const { verifier, challenge } = generatePKCE$2();
  const state = generateState$2();
  let port = DEFAULT_PORT$2;
  const portAvailable = await isPortAvailable$2(port);
  if (!portAvailable) {
    port = await findAvailablePort$2();
  }
  const serverPromise = startCallbackServer$2(state, verifier, port);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const redirect_uri = `http://localhost:${port}/auth/callback`;
  const params = [
    ["response_type", "code"],
    ["client_id", CLIENT_ID$2],
    ["redirect_uri", redirect_uri],
    ["scope", "openid profile email offline_access"],
    ["code_challenge", challenge],
    ["code_challenge_method", "S256"],
    ["id_token_add_organizations", "true"],
    ["codex_cli_simplified_flow", "true"],
    ["state", state]
  ];
  const queryString = params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  const authUrl = `${AUTH_BASE_URL}/oauth/authorize?${queryString}`;
  console.log("\u{1F4CB} Opening browser for authentication...");
  console.log(`If browser doesn't open, visit:
${authUrl}
`);
  await openBrowser(authUrl);
  const tokens = await serverPromise;
  console.log("\u{1F389} Authentication successful!");
  return tokens;
}

const CLIENT_ID$1 = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_AI_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL$1 = "https://console.anthropic.com/v1/oauth/token";
const DEFAULT_PORT$1 = 54545;
const SCOPE = "user:inference";
function generatePKCE$1() {
  const verifier = crypto.randomBytes(32).toString("base64url").replace(/[^a-zA-Z0-9\-._~]/g, "");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { verifier, challenge };
}
function generateState$1() {
  return crypto.randomBytes(32).toString("base64url");
}
async function findAvailablePort$1() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function isPortAvailable$1(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once("error", () => {
      testServer.close();
      resolve(false);
    });
    testServer.listen(port, "127.0.0.1", () => {
      testServer.close(() => resolve(true));
    });
  });
}
async function exchangeCodeForTokens$1(code, verifier, port, state) {
  const tokenResponse = await fetch(TOKEN_URL$1, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `http://localhost:${port}/callback`,
      client_id: CLIENT_ID$1,
      code_verifier: verifier,
      state
    })
  });
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
  }
  const tokenData = await tokenResponse.json();
  return {
    raw: tokenData,
    token: tokenData.access_token,
    expires: Date.now() + tokenData.expires_in * 1e3
  };
}
async function startCallbackServer$1(state, verifier, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        if (receivedState !== state) {
          res.writeHead(400);
          res.end("Invalid state parameter");
          server.close();
          reject(new Error("Invalid state parameter"));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }
        try {
          const tokens = await exchangeCodeForTokens$1(code, verifier, port, state);
          res.writeHead(302, {
            "Location": "https://console.anthropic.com/oauth/code/success?app=claude-code"
          });
          res.end();
          server.close();
          resolve(tokens);
        } catch (error) {
          res.writeHead(500);
          res.end("Token exchange failed");
          server.close();
          reject(error);
        }
      }
    });
    server.listen(port, "127.0.0.1", () => {
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 5 * 60 * 1e3);
  });
}
async function authenticateClaude() {
  console.log("\u{1F680} Starting Anthropic Claude authentication...");
  const { verifier, challenge } = generatePKCE$1();
  const state = generateState$1();
  let port = DEFAULT_PORT$1;
  const portAvailable = await isPortAvailable$1(port);
  if (!portAvailable) {
    console.log(`Port ${port} is in use, finding an available port...`);
    port = await findAvailablePort$1();
  }
  console.log(`\u{1F4E1} Using callback port: ${port}`);
  const serverPromise = startCallbackServer$1(state, verifier, port);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const redirect_uri = `http://localhost:${port}/callback`;
  const params = new URLSearchParams({
    code: "true",
    // This tells Claude.ai to show the code AND redirect
    client_id: CLIENT_ID$1,
    response_type: "code",
    redirect_uri,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state
  });
  const authUrl = `${CLAUDE_AI_AUTHORIZE_URL}?${params}`;
  console.log("\u{1F4CB} Opening browser for authentication...");
  console.log("If browser doesn't open, visit this URL:");
  console.log();
  console.log(`${authUrl}`);
  console.log();
  await openBrowser(authUrl);
  try {
    const tokens = await serverPromise;
    console.log("\u{1F389} Authentication successful!");
    console.log("\u2705 OAuth tokens received");
    return tokens;
  } catch (error) {
    console.error("\n\u274C Failed to authenticate with Anthropic");
    throw error;
  }
}

const execAsync = util.promisify(child_process.exec);
const CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_PORT = 54545;
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
].join(" ");
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url").replace(/[^a-zA-Z0-9\-._~]/g, "");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return { verifier, challenge };
}
function generateState() {
  return crypto.randomBytes(32).toString("hex");
}
async function findAvailablePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once("error", () => {
      testServer.close();
      resolve(false);
    });
    testServer.listen(port, "127.0.0.1", () => {
      testServer.close(() => resolve(true));
    });
  });
}
async function exchangeCodeForTokens(code, verifier, port) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      code_verifier: verifier,
      redirect_uri: `http://localhost:${port}/oauth2callback`
    })
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  const data = await response.json();
  return data;
}
async function startCallbackServer(state, verifier, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname === "/oauth2callback") {
        const code = url.searchParams.get("code");
        const receivedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(302, {
            "Location": "https://developers.google.com/gemini-code-assist/auth_failure_gemini"
          });
          res.end();
          server.close();
          reject(new Error(`Authentication error: ${error}`));
          return;
        }
        if (receivedState !== state) {
          res.writeHead(400);
          res.end("State mismatch. Possible CSRF attack");
          server.close();
          reject(new Error("Invalid state parameter"));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }
        try {
          const tokens = await exchangeCodeForTokens(code, verifier, port);
          res.writeHead(302, {
            "Location": "https://developers.google.com/gemini-code-assist/auth_success_gemini"
          });
          res.end();
          server.close();
          resolve(tokens);
        } catch (error2) {
          res.writeHead(500);
          res.end("Token exchange failed");
          server.close();
          reject(error2);
        }
      }
    });
    server.listen(port, "127.0.0.1", () => {
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 5 * 60 * 1e3);
  });
}
async function authenticateGemini() {
  console.log("\u{1F680} Starting Google Gemini authentication...");
  const { verifier, challenge } = generatePKCE();
  const state = generateState();
  let port = DEFAULT_PORT;
  const portAvailable = await isPortAvailable(port);
  if (!portAvailable) {
    console.log(`Port ${port} is in use, finding an available port...`);
    port = await findAvailablePort();
  }
  console.log(`\u{1F4E1} Using callback port: ${port}`);
  const serverPromise = startCallbackServer(state, verifier, port);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const redirect_uri = `http://localhost:${port}/oauth2callback`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri,
    scope: SCOPES,
    access_type: "offline",
    // To get refresh token
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: "consent"
    // Force consent to get refresh token
  });
  const authUrl = `${AUTHORIZE_URL}?${params}`;
  console.log("\n\u{1F4CB} Opening browser for authentication...");
  console.log("If browser doesn't open, visit this URL:");
  console.log(`
${authUrl}
`);
  const platform = process.platform;
  const openCommand = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    await execAsync(`${openCommand} "${authUrl}"`);
  } catch {
    console.log("\u26A0\uFE0F  Could not open browser automatically");
  }
  try {
    const tokens = await serverPromise;
    console.log("\n\u{1F389} Authentication successful!");
    console.log("\u2705 OAuth tokens received");
    return tokens;
  } catch (error) {
    console.error("\n\u274C Failed to authenticate with Google");
    throw error;
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function handleConnectCommand(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    showConnectHelp();
    return;
  }
  switch (subcommand.toLowerCase()) {
    case "codex":
      await handleConnectVendor("codex", "OpenAI");
      break;
    case "claude":
      await handleConnectVendor("claude", "Anthropic");
      break;
    case "gemini":
      await handleConnectVendor("gemini", "Gemini");
      break;
    case "status":
      await handleConnectStatus();
      break;
    default:
      console.error(chalk.red(`Unknown connect target: ${subcommand}`));
      showConnectHelp();
      process.exit(1);
  }
}
function showConnectHelp() {
  console.log(`
${chalk.bold("happy connect")} - Connect AI vendor API keys to Happy cloud

${chalk.bold("Usage:")}
  happy connect codex        Store your Codex API key in Happy cloud
  happy connect claude       Store your Anthropic API key in Happy cloud
  happy connect gemini       Store your Gemini API key in Happy cloud
  happy connect status       Show connection status for all vendors
  happy connect help         Show this help message

${chalk.bold("Description:")}
  The connect command allows you to securely store your AI vendor API keys
  in Happy cloud. This enables you to use these services through Happy
  without exposing your API keys locally.

${chalk.bold("Examples:")}
  happy connect codex
  happy connect claude
  happy connect gemini
  happy connect status

${chalk.bold("Notes:")} 
  \u2022 You must be authenticated with Happy first (run 'happy auth login')
  \u2022 API keys are encrypted and stored securely in Happy cloud
  \u2022 You can manage your stored keys at app.happy.engineering
`);
}
async function handleConnectVendor(vendor, displayName) {
  console.log(chalk.bold(`
\u{1F50C} Connecting ${displayName} to Happy cloud
`));
  const credentials = await persistence.readCredentials();
  if (!credentials) {
    console.log(chalk.yellow("\u26A0\uFE0F  Not authenticated with Happy"));
    console.log(chalk.gray('  Please run "happy auth login" first'));
    process.exit(1);
  }
  const api$1 = await api.ApiClient.create(credentials);
  if (vendor === "codex") {
    console.log("\u{1F680} Registering Codex token with server");
    const codexAuthTokens = await authenticateCodex();
    await api$1.registerVendorToken("openai", { oauth: codexAuthTokens });
    console.log("\u2705 Codex token registered with server");
    process.exit(0);
  } else if (vendor === "claude") {
    console.log("\u{1F680} Registering Anthropic token with server");
    const anthropicAuthTokens = await authenticateClaude();
    await api$1.registerVendorToken("anthropic", { oauth: anthropicAuthTokens });
    console.log("\u2705 Anthropic token registered with server");
    process.exit(0);
  } else if (vendor === "gemini") {
    console.log("\u{1F680} Registering Gemini token with server");
    const geminiAuthTokens = await authenticateGemini();
    await api$1.registerVendorToken("gemini", { oauth: geminiAuthTokens });
    console.log("\u2705 Gemini token registered with server");
    updateLocalGeminiCredentials(geminiAuthTokens);
    process.exit(0);
  } else {
    throw new Error(`Unsupported vendor: ${vendor}`);
  }
}
async function handleConnectStatus() {
  console.log(chalk.bold("\n\u{1F50C} Connection Status\n"));
  const credentials = await persistence.readCredentials();
  if (!credentials) {
    console.log(chalk.yellow("\u26A0\uFE0F  Not authenticated with Happy"));
    console.log(chalk.gray('  Please run "happy auth login" first'));
    process.exit(1);
  }
  const api$1 = await api.ApiClient.create(credentials);
  const vendors = [
    { key: "gemini", name: "Gemini", display: "Google Gemini" },
    { key: "openai", name: "Codex", display: "OpenAI Codex" },
    { key: "anthropic", name: "Claude", display: "Anthropic Claude" }
  ];
  for (const vendor of vendors) {
    try {
      const token = await api$1.getVendorToken(vendor.key);
      if (token?.oauth) {
        let userInfo = "";
        if (token.oauth.id_token) {
          const payload = decodeJwtPayload(token.oauth.id_token);
          if (payload?.email) {
            userInfo = chalk.gray(` (${payload.email})`);
          }
        }
        const expiresAt = token.oauth.expires_at || (token.oauth.expires_in ? Date.now() + token.oauth.expires_in * 1e3 : null);
        const isExpired = expiresAt && expiresAt < Date.now();
        if (isExpired) {
          console.log(`  ${chalk.yellow("\u26A0\uFE0F")}  ${vendor.display}: ${chalk.yellow("expired")}${userInfo}`);
        } else {
          console.log(`  ${chalk.green("\u2713")}  ${vendor.display}: ${chalk.green("connected")}${userInfo}`);
        }
      } else {
        console.log(`  ${chalk.gray("\u25CB")}  ${vendor.display}: ${chalk.gray("not connected")}`);
      }
    } catch {
      console.log(`  ${chalk.gray("\u25CB")}  ${vendor.display}: ${chalk.gray("not connected")}`);
    }
  }
  console.log("");
  console.log(chalk.gray("To connect a vendor, run: happy connect <vendor>"));
  console.log(chalk.gray("Example: happy connect gemini"));
  console.log("");
}
function updateLocalGeminiCredentials(tokens) {
  try {
    const geminiDir = path.join(os$1.homedir(), ".gemini");
    const credentialsPath = path.join(geminiDir, "oauth_creds.json");
    if (!fs$1.existsSync(geminiDir)) {
      fs$1.mkdirSync(geminiDir, { recursive: true });
    }
    const credentials = {
      access_token: tokens.access_token,
      token_type: tokens.token_type || "Bearer",
      scope: tokens.scope || "https://www.googleapis.com/auth/cloud-platform",
      ...tokens.refresh_token && { refresh_token: tokens.refresh_token },
      ...tokens.id_token && { id_token: tokens.id_token },
      ...tokens.expires_in && { expires_in: tokens.expires_in }
    };
    fs$1.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), "utf-8");
    console.log(chalk.gray(`  Updated local credentials: ${credentialsPath}`));
  } catch (error) {
    console.log(chalk.yellow(`  \u26A0\uFE0F Could not update local credentials: ${error}`));
  }
}

const DEFAULT_WORKSPACE_ROOT = "~/Workspace";
const DEFAULT_DENY_READ_PATHS = ["~/.ssh", "~/.aws", "~/.gnupg"];
function workspaceCandidatesForPlatform(platform) {
  if (platform === "darwin") {
    return ["~/Developer", "~/Develop", "~/Workspace"];
  }
  if (platform === "linux") {
    return ["~/Workspace", "~/Developer", "~/Develop"];
  }
  return ["~/Developer", "~/Develop", "~/Workspace"];
}
function detectWorkspaceRootSuggestions(options) {
  const platform = process.platform;
  const home = os.homedir();
  const pathExists = node_fs.existsSync;
  const candidates = workspaceCandidatesForPlatform(platform);
  const existing = candidates.filter((candidate) => {
    const absolutePath = candidate.replace(/^~(?=\/|$)/, home);
    return pathExists(absolutePath);
  });
  if (existing.length > 0) {
    return existing;
  }
  return [candidates[0] ?? DEFAULT_WORKSPACE_ROOT];
}
async function handleSandboxCommand(args) {
  const subcommand = args[0];
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    handleSandboxHelp();
    return;
  }
  switch (subcommand) {
    case "configure":
      await handleSandboxConfigure();
      break;
    case "status":
      await handleSandboxStatus();
      break;
    case "disable":
      await handleSandboxDisable();
      break;
    default:
      console.error(chalk.red(`Unknown sandbox subcommand: ${subcommand}`));
      handleSandboxHelp();
      process.exit(1);
  }
}
async function handleSandboxConfigure() {
  const workspaceRootSuggestions = detectWorkspaceRootSuggestions();
  const workspaceRootDefault = workspaceRootSuggestions[0] ?? DEFAULT_WORKSPACE_ROOT;
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "scopeMode",
      message: "How should file access be scoped?",
      default: "workspace",
      choices: [
        { name: "workspace - Full workspace root directory", value: "workspace" },
        { name: "per-project - Only current project directory", value: "project" }
      ]
    },
    {
      type: "list",
      name: "workspaceRoot",
      message: "Pick your workspace root directory",
      when: (currentAnswers) => currentAnswers.scopeMode === "workspace",
      default: workspaceRootDefault,
      choices: workspaceRootSuggestions.map((pathValue) => ({
        name: `${pathValue}${node_fs.existsSync(pathValue.replace(/^~(?=\/|$)/, os.homedir())) ? "" : " (suggested)"}`,
        value: pathValue
      }))
    },
    {
      type: "list",
      name: "networkMode",
      message: "How should network access be handled?",
      default: "allowed",
      choices: [
        { name: "allowed - Allow all network access (default)", value: "allowed" },
        { name: "blocked - Block all network access (most secure)", value: "blocked" }
      ]
    },
    {
      type: "confirm",
      name: "allowLocalBinding",
      message: "Allow binding to localhost ports? (for dev servers)",
      default: true
    }
  ]);
  const scopeMode = answers.scopeMode;
  const sandboxConfig = persistence.SandboxConfigSchema.parse({
    enabled: true,
    workspaceRoot: scopeMode === "workspace" ? answers.workspaceRoot || workspaceRootDefault : void 0,
    sessionIsolation: scopeMode === "workspace" ? "workspace" : "strict",
    customWritePaths: [],
    denyReadPaths: DEFAULT_DENY_READ_PATHS,
    extraWritePaths: ["/tmp"],
    denyWritePaths: [".env"],
    networkMode: answers.networkMode,
    allowedDomains: [],
    deniedDomains: [],
    allowLocalBinding: Boolean(answers.allowLocalBinding)
  });
  console.log(chalk.bold("\nSandbox configuration summary:"));
  console.log(JSON.stringify(sandboxConfig, null, 2));
  const { confirmSave } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmSave",
      message: "Save and enable this sandbox configuration?",
      default: true
    }
  ]);
  if (!confirmSave) {
    console.log(chalk.yellow("Sandbox configuration cancelled."));
    return;
  }
  await persistence.updateSettings((settings) => ({
    ...settings,
    sandboxConfig
  }));
  console.log(chalk.green("Sandbox configuration saved and enabled."));
  console.log(chalk.gray("Use --no-sandbox to bypass sandboxing for a single session."));
}
async function handleSandboxStatus() {
  const settings = await persistence.readSettings();
  const config = settings.sandboxConfig;
  if (!config) {
    console.log("Sandbox is not configured. Run `happy sandbox configure`.");
    return;
  }
  console.log(chalk.bold("Sandbox status"));
  console.log(`Enabled: ${config.enabled ? "yes" : "no"}`);
  const scope = config.sessionIsolation === "workspace" ? "workspace" : "per-project";
  console.log(`Scope: ${scope}`);
  if (scope === "workspace") {
    console.log(`Workspace root: ${config.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT}`);
  }
  console.log(`Network mode: ${config.networkMode}`);
  console.log(`Allow localhost binding: ${config.allowLocalBinding ? "yes" : "no"}`);
}
async function handleSandboxDisable() {
  await persistence.updateSettings((settings) => ({
    ...settings,
    sandboxConfig: persistence.SandboxConfigSchema.parse({
      ...settings.sandboxConfig ?? {},
      enabled: false
    })
  }));
  console.log(chalk.green("Sandbox disabled."));
}
function handleSandboxHelp() {
  console.log(`
${chalk.bold("happy sandbox")} - Sandbox management

${chalk.bold("Usage:")}
  happy sandbox configure      Configure sandbox settings interactively
  happy sandbox status         Show current sandbox configuration
  happy sandbox disable        Disable sandboxing
  happy sandbox help           Show this help
`);
}

function extractNoSandboxFlag(args) {
  let noSandbox = false;
  const remainingArgs = [];
  for (const arg of args) {
    if (arg === "--no-sandbox") {
      noSandbox = true;
    } else {
      remainingArgs.push(arg);
    }
  }
  return {
    noSandbox,
    args: remainingArgs
  };
}

const DAEMON_READY_TIMEOUT_MS = 5e3;
const DAEMON_READY_POLL_INTERVAL_MS = 100;
async function ensureDaemonRunning() {
  api.logger.debug("Ensuring Happy background service is running & matches our version...");
  if (await isDaemonRunningCurrentlyInstalledHappyVersion()) {
    return;
  }
  api.logger.debug("Starting Happy background service...");
  const daemonProcess = spawnHappyCLI(["daemon", "start-sync"], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  daemonProcess.unref();
  const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await checkIfDaemonRunningAndCleanupStaleState()) {
      api.logger.debug("Happy background service is ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, DAEMON_READY_POLL_INTERVAL_MS));
  }
  api.logger.debug(`Happy background service did not become ready within ${DAEMON_READY_TIMEOUT_MS}ms; continuing anyway`);
}

function isAppServerAvailable() {
  try {
    const version = node_child_process.execSync("codex --version", { encoding: "utf8", windowsHide: true }).trim();
    const match = version.match(/codex-cli\s+(\d+\.\d+\.\d+)/);
    if (!match) return false;
    const [, ver] = match;
    const [major, minor] = ver.split(".").map(Number);
    return major > 0 || minor >= 100;
  } catch {
    return false;
  }
}
function normalizeRawFileChangeList(changes) {
  if (!Array.isArray(changes)) {
    return void 0;
  }
  const normalized = {};
  for (const change of changes) {
    if (!change || typeof change !== "object" || Array.isArray(change)) {
      continue;
    }
    const path = typeof change.path === "string" ? change.path : null;
    if (!path) {
      continue;
    }
    const entry = {};
    if (typeof change.diff === "string") {
      entry.diff = change.diff;
    }
    if (change.kind && typeof change.kind === "object" && !Array.isArray(change.kind)) {
      entry.kind = change.kind;
    }
    normalized[path] = entry;
  }
  return Object.keys(normalized).length > 0 ? normalized : void 0;
}
class CodexAppServerClient {
  process = null;
  readline = null;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  processEpoch = 0;
  connected = false;
  sandboxConfig;
  sandboxCleanup = null;
  sandboxEnabled = false;
  // Session state
  _threadId = null;
  _turnId = null;
  threadDefaults = null;
  // Turn completion tracking for the currently active sendTurnAndWait call.
  // A completion event only resolves once we have seen task_started for this turn.
  pendingTurnCompletion = null;
  // Tracks in-flight interruptTurn() RPCs so sendTurnAndWait can wait for them
  // before starting a new turn (prevents stale turn/interrupt from aborting the next turn).
  pendingInterrupt = null;
  notificationProtocol = "unknown";
  completedTurnIds = /* @__PURE__ */ new Set();
  rawFileChangesByItemId = /* @__PURE__ */ new Map();
  // Handlers set by the consumer (runCodex.ts)
  eventHandler = null;
  approvalHandler = null;
  constructor(sandboxConfig) {
    this.sandboxConfig = sandboxConfig;
  }
  get threadId() {
    return this._threadId;
  }
  get turnId() {
    return this._turnId;
  }
  setEventHandler(handler) {
    this.eventHandler = handler;
  }
  setApprovalHandler(handler) {
    this.approvalHandler = handler;
  }
  extractTurnId(params) {
    const turnId = params?.turn?.id ?? params?.turnId ?? params?.turn_id ?? null;
    return typeof turnId === "string" && turnId.length > 0 ? turnId : null;
  }
  extractTurnStatus(params) {
    const status = params?.turn?.status ?? params?.status ?? null;
    return typeof status === "string" && status.length > 0 ? status : null;
  }
  shouldHandleRawNotification(method) {
    const isRawNotification = method === "thread/started" || method === "turn/started" || method === "turn/completed" || method === "thread/status/changed" || method === "thread/tokenUsage/updated" || method.startsWith("item/");
    if (!isRawNotification) {
      return false;
    }
    if (this.notificationProtocol === "legacy") {
      return false;
    }
    if (this.notificationProtocol === "unknown") {
      this.notificationProtocol = "raw";
    }
    return true;
  }
  emitRawTurnCompletion(turnId, status, error, source) {
    const aborted = status === "cancelled" || status === "canceled" || status === "aborted" || status === "interrupted";
    this.tryResolvePendingTurn(aborted, turnId, source);
    this._turnId = null;
    if (turnId && this.completedTurnIds.has(turnId)) {
      return;
    }
    if (turnId) {
      this.completedTurnIds.add(turnId);
    }
    if (aborted) {
      this.eventHandler?.({
        type: "turn_aborted",
        ...turnId ? { turn_id: turnId } : {},
        ...status ? { status } : {},
        ...error !== void 0 && error !== null ? { error } : {}
      });
      return;
    }
    this.eventHandler?.({
      type: "task_complete",
      ...turnId ? { turn_id: turnId } : {},
      ...status ? { status } : {},
      ...error !== void 0 && error !== null ? { error } : {}
    });
  }
  handleRawNotification(method, params) {
    if (!this.shouldHandleRawNotification(method)) {
      return false;
    }
    if (method === "turn/started") {
      const turnId = this.extractTurnId(params);
      if (turnId) {
        this._turnId = turnId;
      }
      this.markPendingTurnStarted(turnId);
      this.eventHandler?.({
        type: "task_started",
        ...turnId ? { turn_id: turnId } : {}
      });
      return true;
    }
    if (method === "turn/completed") {
      this.emitRawTurnCompletion(
        this.extractTurnId(params),
        this.extractTurnStatus(params),
        params?.turn?.error ?? params?.error,
        method
      );
      return true;
    }
    if (method === "thread/status/changed") {
      const statusType = params?.status?.type;
      if (statusType === "idle" && this.pendingTurnCompletion) {
        this.emitRawTurnCompletion(this._turnId, "completed", null, method);
      }
      return true;
    }
    if (method === "thread/tokenUsage/updated") {
      const tokenUsage = params?.tokenUsage;
      if (tokenUsage && typeof tokenUsage === "object") {
        this.eventHandler?.({
          type: "token_count",
          ...tokenUsage
        });
      }
      return true;
    }
    const item = params?.item;
    if (!item || typeof item !== "object") {
      return method.startsWith("item/");
    }
    if (method === "item/started" && item.type === "commandExecution") {
      const callId = typeof item.id === "string" ? item.id : "";
      this.eventHandler?.({
        type: "exec_command_begin",
        call_id: callId,
        callId,
        command: item.command,
        cwd: item.cwd,
        description: item.command
      });
      return true;
    }
    if (method === "item/completed" && item.type === "commandExecution") {
      const callId = typeof item.id === "string" ? item.id : "";
      this.eventHandler?.({
        type: "exec_command_end",
        call_id: callId,
        callId,
        output: item.aggregatedOutput ?? "",
        exit_code: item.exitCode ?? null,
        duration_ms: item.durationMs ?? null,
        status: item.status,
        cwd: item.cwd,
        command: item.command
      });
      return true;
    }
    if (item.type === "fileChange") {
      const callId = typeof item.id === "string" ? item.id : "";
      const changes = normalizeRawFileChangeList(item.changes);
      if (callId && changes) {
        this.rawFileChangesByItemId.set(callId, changes);
      }
      if (method === "item/started") {
        this.eventHandler?.({
          type: "patch_apply_begin",
          call_id: callId,
          callId,
          changes: changes ?? {}
        });
        return true;
      }
      if (method === "item/completed") {
        this.eventHandler?.({
          type: "patch_apply_end",
          call_id: callId,
          callId,
          status: item.status
        });
        if (callId && (item.status === "completed" || item.status === "failed" || item.status === "declined")) {
          this.rawFileChangesByItemId.delete(callId);
        }
        return true;
      }
    }
    if (method === "item/completed" && item.type === "agentMessage") {
      const text = typeof item.text === "string" ? item.text : "";
      if (text.length > 0) {
        this.eventHandler?.({
          type: "agent_message",
          message: text,
          item_id: item.id,
          phase: item.phase
        });
      }
      if (item.phase === "final_answer" && this.pendingTurnCompletion) {
        this.emitRawTurnCompletion(
          this.extractTurnId(params),
          "completed",
          null,
          `${method}:final_answer`
        );
      }
      return true;
    }
    return method.startsWith("item/");
  }
  // ─── Lifecycle ──────────────────────────────────────────────
  async connect() {
    if (this.connected) return;
    if (!isAppServerAvailable()) {
      throw new Error(
        "Codex CLI is not installed\n\nPlease install Codex CLI using one of these methods:\n\nOption 1 - npm (recommended):\n  npm install -g @openai/codex\n\nOption 2 - Homebrew (macOS):\n  brew install --cask codex\n\nAlternatively, use Claude Code:\n  happy claude"
      );
    }
    let command = "codex";
    let args = ["app-server", "--listen", "stdio://"];
    this.sandboxEnabled = false;
    if (this.sandboxConfig?.enabled && process.platform !== "win32") {
      try {
        this.sandboxCleanup = await initializeSandbox(this.sandboxConfig, process.cwd());
        const wrapped = await wrapForMcpTransport("codex", ["app-server", "--listen", "stdio://"]);
        command = wrapped.command;
        args = wrapped.args;
        this.sandboxEnabled = true;
        api.logger.info(`[CodexAppServer] Sandbox enabled`);
      } catch (error) {
        api.logger.warn("[CodexAppServer] Failed to initialize sandbox; continuing without.", error);
        this.sandboxCleanup = null;
      }
    }
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") env[key] = value;
    }
    const filter = "codex_core::rollout::list=off";
    if (!env.RUST_LOG) {
      env.RUST_LOG = filter;
    } else if (!env.RUST_LOG.includes("codex_core::rollout::list=")) {
      env.RUST_LOG += `,${filter}`;
    }
    if (this.sandboxEnabled) {
      env.CODEX_SANDBOX = "seatbelt";
    }
    api.logger.debug(`[CodexAppServer] Spawning: ${command} ${args.join(" ")}`);
    const epoch = ++this.processEpoch;
    const proc = spawn.spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true
    });
    this.process = proc;
    proc.on("error", (err) => {
      api.logger.debug("[CodexAppServer] Process error:", err);
    });
    proc.on("exit", (code, signal) => {
      api.logger.debug(`[CodexAppServer] Process exited: code=${code} signal=${signal}`);
      if (this.process !== proc || this.processEpoch !== epoch) {
        api.logger.debug("[CodexAppServer] Ignoring stale process exit");
        return;
      }
      this.connected = false;
      for (const [id, req] of this.pending) {
        if (req.epoch !== epoch) continue;
        req.reject(new Error(`Codex process exited (code=${code}) while waiting for ${req.method}`));
        this.pending.delete(id);
      }
      this.resolvePendingTurn(true);
    });
    proc.stderr?.on("data", (chunk) => {
      if (this.process !== proc || this.processEpoch !== epoch) return;
      const text = chunk.toString().trim();
      if (text) api.logger.debug(`[CodexAppServer:stderr] ${text}`);
    });
    this.readline = node_readline.createInterface({ input: proc.stdout });
    this.readline.on("line", (line) => {
      if (this.process !== proc || this.processEpoch !== epoch) return;
      this.handleLine(line, epoch);
    });
    const initParams = {
      clientInfo: {
        name: "happy-codex",
        title: "Happy Codex Client",
        version: api.packageJson.version
      },
      capabilities: {
        experimentalApi: true
      }
    };
    await this.request("initialize", initParams);
    this.notify("initialized");
    this.connected = true;
    api.logger.debug("[CodexAppServer] Connected and initialized");
  }
  async disconnectInternal(opts) {
    if (!this.connected && !this.process) return;
    const proc = this.process;
    const pid = proc?.pid;
    const epoch = this.processEpoch;
    api.logger.debug(`[CodexAppServer] Disconnecting; pid=${pid ?? "none"}`);
    this.readline?.close();
    this.readline = null;
    try {
      proc?.stdin?.end();
      proc?.kill("SIGTERM");
    } catch {
    }
    if (pid) {
      const killTimer = setTimeout(() => {
        try {
          process.kill(pid, 0);
          process.kill(pid, "SIGKILL");
        } catch {
        }
      }, 2e3);
      killTimer.unref();
    }
    this.process = null;
    this.connected = false;
    this._turnId = null;
    this.notificationProtocol = "unknown";
    this.completedTurnIds.clear();
    if (!opts?.preserveThreadState) {
      this._threadId = null;
      this.threadDefaults = null;
    }
    for (const [id, req] of this.pending) {
      if (req.epoch !== epoch) continue;
      req.reject(new Error(`Codex process disconnected while waiting for ${req.method}`));
      this.pending.delete(id);
    }
    this.resolvePendingTurn(true);
    if (this.sandboxCleanup) {
      try {
        await this.sandboxCleanup();
      } catch {
      }
      this.sandboxCleanup = null;
    }
    this.sandboxEnabled = false;
    api.logger.debug("[CodexAppServer] Disconnected");
  }
  async disconnect() {
    await this.disconnectInternal();
  }
  buildThreadConfig(mcpServers) {
    return mcpServers ? { mcp_servers: mcpServers } : null;
  }
  rememberThreadDefaults(opts) {
    this.threadDefaults = {
      model: opts.model,
      cwd: opts.cwd,
      approvalPolicy: opts.approvalPolicy,
      sandbox: opts.sandbox,
      mcpServers: opts.mcpServers
    };
  }
  // ─── Thread management ──────────────────────────────────────
  async startThread(opts) {
    const params = {
      model: opts.model ?? null,
      modelProvider: null,
      profile: null,
      cwd: opts.cwd ?? process.cwd(),
      approvalPolicy: opts.approvalPolicy ?? null,
      sandbox: opts.sandbox ?? null,
      config: this.buildThreadConfig(opts.mcpServers),
      baseInstructions: null,
      developerInstructions: null,
      compactPrompt: null,
      includeApplyPatchTool: null,
      experimentalRawEvents: false,
      persistExtendedHistory: true
    };
    const result = await this.request("thread/start", params);
    this._threadId = result.thread.id;
    this._turnId = null;
    this.rememberThreadDefaults(opts);
    api.logger.debug("[CodexAppServer] Thread started:", this._threadId);
    return { threadId: result.thread.id, model: result.model };
  }
  async resumeThread(opts) {
    const threadId = opts?.threadId ?? this._threadId;
    if (!threadId) {
      throw new Error("No thread available to resume.");
    }
    const defaults = this.threadDefaults ?? {};
    const params = {
      threadId,
      model: opts?.model ?? defaults.model ?? null,
      modelProvider: null,
      cwd: opts?.cwd ?? defaults.cwd ?? process.cwd(),
      approvalPolicy: opts?.approvalPolicy ?? defaults.approvalPolicy ?? null,
      sandbox: opts?.sandbox ?? defaults.sandbox ?? null,
      config: this.buildThreadConfig(opts?.mcpServers ?? defaults.mcpServers),
      baseInstructions: null,
      developerInstructions: null,
      persistExtendedHistory: true
    };
    const result = await this.request("thread/resume", params);
    this._threadId = result.thread.id;
    this._turnId = null;
    this.rememberThreadDefaults({
      model: opts?.model ?? defaults.model,
      cwd: opts?.cwd ?? defaults.cwd,
      approvalPolicy: opts?.approvalPolicy ?? defaults.approvalPolicy,
      sandbox: opts?.sandbox ?? defaults.sandbox,
      mcpServers: opts?.mcpServers ?? defaults.mcpServers
    });
    api.logger.debug("[CodexAppServer] Thread resumed:", this._threadId);
    return { threadId: result.thread.id, model: result.model };
  }
  async reconnectAndResumeThread() {
    const threadId = this._threadId;
    await this.disconnectInternal({ preserveThreadState: !!threadId });
    await this.connect();
    if (!threadId) {
      return false;
    }
    try {
      await this.resumeThread({ threadId });
      return true;
    } catch (error) {
      api.logger.warn("[CodexAppServer] Failed to resume thread after reconnect", error);
      this._threadId = null;
      this.threadDefaults = null;
      return false;
    }
  }
  // ─── Turn management ────────────────────────────────────────
  /** Default grace period after interrupt before forcing a restart (ms). */
  static ABORT_GRACE_MS = 3e3;
  hasPendingTurnCompletion() {
    return this.pendingTurnCompletion !== null;
  }
  resolvePendingTurn(aborted) {
    if (!this.pendingTurnCompletion) return;
    this.pendingTurnCompletion.resolve(aborted);
    this.pendingTurnCompletion = null;
  }
  markPendingTurnStarted(turnId) {
    if (!this.pendingTurnCompletion) return;
    if (turnId) {
      this.pendingTurnCompletion.turnId = turnId;
    }
  }
  tryResolvePendingTurn(aborted, turnId, source) {
    const pending = this.pendingTurnCompletion;
    if (!pending) return;
    if (pending.turnId && turnId && pending.turnId !== turnId) {
      api.logger.debug(
        `[CodexAppServer] Ignoring ${source} for turn ${turnId}; awaiting ${pending.turnId}`
      );
      return;
    }
    this.resolvePendingTurn(aborted);
  }
  async waitForTurnCompletion(timeoutMs) {
    if (!this.hasPendingTurnCompletion()) {
      return true;
    }
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (this.hasPendingTurnCompletion()) {
      if (Date.now() >= deadline) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return true;
  }
  /**
   * Request turn interruption and optionally force-restart the app-server if
   * the turn does not settle within a short grace period.
   */
  async abortTurnWithFallback(opts) {
    const hadActiveTurn = this.hasPendingTurnCompletion();
    if (!hadActiveTurn) {
      return { hadActiveTurn: false, aborted: false, forcedRestart: false, resumedThread: false };
    }
    await this.interruptTurn();
    const gracePeriodMs = opts?.gracePeriodMs ?? CodexAppServerClient.ABORT_GRACE_MS;
    const settled = await this.waitForTurnCompletion(gracePeriodMs);
    if (settled) {
      return { hadActiveTurn: true, aborted: true, forcedRestart: false, resumedThread: false };
    }
    const shouldForceRestart = opts?.forceRestartOnTimeout ?? true;
    if (!shouldForceRestart) {
      return { hadActiveTurn: true, aborted: false, forcedRestart: false, resumedThread: false };
    }
    api.logger.warn(`[CodexAppServer] interrupt did not settle turn in ${gracePeriodMs}ms; force-restarting app-server`);
    const pendingTurnId = this.pendingTurnCompletion?.turnId ?? this._turnId;
    if (this.pendingTurnCompletion) {
      this.eventHandler?.({
        type: "turn_aborted",
        reason: "interrupted",
        ...pendingTurnId ? { turn_id: pendingTurnId } : {},
        forced_restart: true
      });
    }
    const resumedThread = await this.reconnectAndResumeThread();
    return { hadActiveTurn: true, aborted: true, forcedRestart: true, resumedThread };
  }
  /**
   * Send a user turn and wait for it to complete.
   * Returns when task_complete or turn_aborted is received.
   */
  async sendTurn(prompt, opts) {
    if (!this._threadId) {
      throw new Error("No active thread. Call startThread first.");
    }
    const input = [
      { type: "text", text: prompt }
    ];
    const params = {
      threadId: this._threadId,
      input
    };
    if (opts?.cwd) params.cwd = opts.cwd;
    if (opts?.approvalPolicy) params.approvalPolicy = opts.approvalPolicy;
    if (opts?.model) params.model = opts.model;
    if (opts?.effort) params.effort = opts.effort;
    if (opts?.sandbox) {
      switch (opts.sandbox) {
        case "workspace-write":
          params.sandboxPolicy = { type: "workspaceWrite" };
          break;
        case "danger-full-access":
          params.sandboxPolicy = { type: "dangerFullAccess" };
          break;
        case "read-only":
          params.sandboxPolicy = { type: "readOnly" };
          break;
      }
    }
    const result = await this.request("turn/start", params);
    const turnId = result?.turn?.id;
    if (typeof turnId === "string" && turnId.length > 0) {
      this._turnId = turnId;
      if (this.pendingTurnCompletion) {
        this.pendingTurnCompletion.turnId = turnId;
      }
    }
  }
  /** Default timeout for waiting on turn completion (ms). 10 minutes. */
  static TURN_TIMEOUT_MS = 10 * 60 * 1e3;
  /**
   * Send a user turn and wait for it to complete (task_complete or turn_aborted).
   * Returns { aborted: true } if the turn was aborted (user cancel, permission reject, etc.).
   */
  async sendTurnAndWait(prompt, opts) {
    if (this.pendingInterrupt) {
      await this.pendingInterrupt;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const timeoutMs = opts?.turnTimeoutMs ?? CodexAppServerClient.TURN_TIMEOUT_MS;
    let timer = null;
    const completion = new Promise((resolve) => {
      this.pendingTurnCompletion = {
        resolve,
        turnId: null
      };
      timer = setTimeout(() => {
        if (this.pendingTurnCompletion) {
          api.logger.warn(`[CodexAppServer] Turn timed out after ${timeoutMs}ms \u2014 treating as abort`);
          this.resolvePendingTurn(true);
        }
      }, timeoutMs);
    });
    try {
      await this.sendTurn(prompt, opts);
    } catch (err) {
      if (timer) clearTimeout(timer);
      this.pendingTurnCompletion = null;
      throw err;
    }
    const aborted = await completion;
    if (timer) clearTimeout(timer);
    return { aborted };
  }
  async interruptTurn() {
    if (!this._threadId) return;
    if (!this._turnId) {
      api.logger.debug("[CodexAppServer] interruptTurn: no active turnId, skipping");
      return;
    }
    const params = {
      threadId: this._threadId,
      turnId: this._turnId
    };
    const doInterrupt = async () => {
      try {
        await this.request("turn/interrupt", params);
      } catch (err) {
        api.logger.debug("[CodexAppServer] interruptTurn error (may be expected):", err);
      } finally {
        this.pendingInterrupt = null;
      }
    };
    this.pendingInterrupt = doInterrupt();
    return this.pendingInterrupt;
  }
  // ─── State queries ──────────────────────────────────────────
  hasActiveThread() {
    return this._threadId !== null;
  }
  // ─── JSON-RPC transport ─────────────────────────────────────
  /** Default timeout for RPC requests (ms). */
  static REQUEST_TIMEOUT_MS = 3e4;
  request(method, params, timeoutMs) {
    const timeout = timeoutMs ?? CodexAppServerClient.REQUEST_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        reject(new Error(`Cannot send ${method}: stdin not writable`));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeout}ms (id=${id})`));
      }, timeout);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        method,
        epoch: this.processEpoch
      });
      const msg = { jsonrpc: "2.0", id, method, params };
      const line = JSON.stringify(msg) + "\n";
      api.logger.debug(`[CodexAppServer] \u2192 ${method} (id=${id})`);
      this.process.stdin.write(line);
    });
  }
  notify(method, params) {
    if (!this.process?.stdin?.writable) return;
    const msg = { jsonrpc: "2.0", method, params };
    this.process.stdin.write(JSON.stringify(msg) + "\n");
    api.logger.debug(`[CodexAppServer] \u2192 ${method} (notification)`);
  }
  respond(id, result) {
    if (!this.process?.stdin?.writable) return;
    const msg = { jsonrpc: "2.0", id, result };
    this.process.stdin.write(JSON.stringify(msg) + "\n");
    api.logger.debug(`[CodexAppServer] \u2192 response (id=${id})`);
  }
  handleLine(line, sourceEpoch = this.processEpoch) {
    if (sourceEpoch !== this.processEpoch) {
      return;
    }
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      api.logger.debug("[CodexAppServer] Non-JSON line:", line.substring(0, 200));
      return;
    }
    if (msg.id != null && (msg.result !== void 0 || msg.error !== void 0)) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        if (pending.epoch !== sourceEpoch) {
          api.logger.debug(`[CodexAppServer] Ignoring response from stale epoch for id=${msg.id}`);
          return;
        }
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`${pending.method}: ${msg.error.message} (code=${msg.error.code})`));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }
    if (msg.id != null && msg.method) {
      this.handleServerRequest(msg.id, msg.method, msg.params).catch((err) => {
        api.logger.debug("[CodexAppServer] Error handling server request:", err);
      });
      return;
    }
    if (msg.method) {
      this.handleNotification(msg.method, msg.params);
      return;
    }
    api.logger.debug("[CodexAppServer] Unhandled message:", JSON.stringify(msg).substring(0, 300));
  }
  /**
   * Map our internal ReviewDecision to the wire format the server expects.
   * Server uses: accept, acceptForSession, decline, cancel
   * Our handler uses: approved, approved_for_session, denied, abort
   */
  /**
   * Map our internal ReviewDecision to the wire format codex expects.
   * v2 methods (item/*) use: accept/acceptForSession/decline/cancel
   * Legacy methods (execCommandApproval/applyPatchApproval) use: approved/approved_for_session/denied/abort
   */
  mapDecisionToWire(decision, legacy) {
    if (typeof decision === "string") {
      if (legacy) {
        return decision;
      }
      switch (decision) {
        case "approved":
          return "accept";
        case "approved_for_session":
          return "acceptForSession";
        case "denied":
          return "decline";
        case "abort":
          return "cancel";
        default:
          return "decline";
      }
    }
    if ("approved_execpolicy_amendment" in decision) {
      return decision;
    }
    return legacy ? "denied" : "decline";
  }
  parseToolNameFromElicitationMessage(message) {
    if (typeof message !== "string") {
      return null;
    }
    const match = message.match(/tool "([^"]+)"/i);
    return match?.[1] ?? null;
  }
  mapDecisionToMcpElicitationResponse(decision, params) {
    if (typeof decision === "string") {
      switch (decision) {
        case "approved":
        case "approved_for_session":
          return {
            action: "accept",
            content: params?.mode === "form" ? {} : null,
            _meta: null
          };
        case "abort":
          return {
            action: "cancel",
            content: null,
            _meta: null
          };
        case "denied":
        default:
          return {
            action: "decline",
            content: null,
            _meta: null
          };
      }
    }
    return {
      action: "decline",
      content: null,
      _meta: null
    };
  }
  async handleServerRequest(id, method, params) {
    if (method === "mcpServer/elicitation/request") {
      const toolName = this.parseToolNameFromElicitationMessage(params?.message) ?? params?.serverName ?? "McpTool";
      const decision = await this.handleApproval({
        type: "mcp",
        callId: `${params?.serverName ?? "mcp"}:${id}`,
        toolName,
        input: params?._meta?.tool_params ?? {},
        serverName: params?.serverName,
        message: params?.message
      });
      this.respond(id, this.mapDecisionToMcpElicitationResponse(decision, params));
      return;
    }
    if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
      const legacy = method === "execCommandApproval";
      const callId = params.itemId ?? params.callId ?? String(id);
      const decision = await this.handleApproval({
        type: "exec",
        callId,
        command: params.command != null ? [params.command] : [],
        cwd: params.cwd,
        reason: params.reason
      });
      this.respond(id, { decision: this.mapDecisionToWire(decision, legacy) });
      return;
    }
    if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
      const legacy = method === "applyPatchApproval";
      const callId = params.itemId ?? params.callId ?? String(id);
      const decision = await this.handleApproval({
        type: "patch",
        callId,
        fileChanges: params.fileChanges ?? (typeof callId === "string" ? this.rawFileChangesByItemId.get(callId) : void 0),
        reason: params.reason
      });
      this.respond(id, { decision: this.mapDecisionToWire(decision, legacy) });
      return;
    }
    api.logger.debug(`[CodexAppServer] Unknown server request: ${method}`);
    this.respond(id, {});
  }
  async handleApproval(params) {
    if (this.approvalHandler) {
      try {
        return await this.approvalHandler(params);
      } catch (err) {
        api.logger.debug("[CodexAppServer] Approval handler error:", err);
        return "denied";
      }
    }
    return "denied";
  }
  handleNotification(method, params) {
    if (method === "codex/event" || method.startsWith("codex/event/")) {
      this.notificationProtocol = "legacy";
      const msg = params?.msg;
      if (msg) {
        if (msg.type === "task_started" && msg.turn_id) {
          this._turnId = msg.turn_id;
        }
        if (msg.type === "task_started") {
          this.markPendingTurnStarted(msg.turn_id ?? msg.turnId ?? null);
        }
        this.eventHandler?.(msg);
        if (msg.type === "task_complete" || msg.type === "turn_aborted") {
          const turnId = msg.turn_id ?? msg.turnId ?? null;
          if (turnId) {
            this.completedTurnIds.add(turnId);
          }
          this.tryResolvePendingTurn(
            msg.type === "turn_aborted",
            turnId,
            `codex/event/${msg.type}`
          );
          this._turnId = null;
        }
      }
      return;
    }
    if (this.handleRawNotification(method, params)) {
      api.logger.debug(`[CodexAppServer] Raw notification: ${method}`);
      return;
    }
    if (method === "thread/started" || method === "turn/started" || method === "turn/completed" || method === "thread/status/changed") {
      api.logger.debug(`[CodexAppServer] Lifecycle notification: ${method}`);
      if (method === "turn/started") {
        const turnId = this.extractTurnId(params);
        if (turnId) {
          this._turnId = turnId;
        }
        this.markPendingTurnStarted(turnId);
      }
      if (method === "turn/completed") {
        this.emitRawTurnCompletion(
          this.extractTurnId(params),
          this.extractTurnStatus(params),
          params?.turn?.error ?? params?.error,
          method
        );
      }
      return;
    }
    if (method === "mcpServer/startupStatus/updated") {
      api.logger.debug(`[CodexAppServer] mcpServer startup status:`, params);
      return;
    }
    api.logger.debug(`[CodexAppServer] Notification: ${method}`);
  }
}

class BasePermissionHandler {
  pendingRequests = /* @__PURE__ */ new Map();
  session;
  isResetting = false;
  constructor(session) {
    this.session = session;
    this.setupRpcHandler();
  }
  /**
   * Update the session reference (used after offline reconnection swaps sessions).
   * This is critical for avoiding stale session references after onSessionSwap.
   */
  updateSession(newSession) {
    api.logger.debug(`${this.getLogPrefix()} Session reference updated`);
    this.session = newSession;
    this.setupRpcHandler();
  }
  /**
   * Setup RPC handler for permission responses.
   */
  setupRpcHandler() {
    this.session.rpcHandlerManager.registerHandler(
      "permission",
      async (response) => {
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
          api.logger.debug(`${this.getLogPrefix()} Permission request not found or already resolved`);
          return;
        }
        this.pendingRequests.delete(response.id);
        const result = response.approved ? { decision: response.decision === "approved_for_session" ? "approved_for_session" : "approved" } : { decision: response.decision === "denied" ? "denied" : "abort" };
        pending.resolve(result);
        this.session.updateAgentState((currentState) => {
          const request = currentState.requests?.[response.id];
          if (!request) return currentState;
          const { [response.id]: _, ...remainingRequests } = currentState.requests || {};
          let res = {
            ...currentState,
            requests: remainingRequests,
            completedRequests: {
              ...currentState.completedRequests,
              [response.id]: {
                ...request,
                completedAt: Date.now(),
                status: response.approved ? "approved" : "denied",
                decision: result.decision
              }
            }
          };
          return res;
        });
        api.logger.debug(`${this.getLogPrefix()} Permission ${response.approved ? "approved" : "denied"} for ${pending.toolName}`);
      }
    );
  }
  /**
   * Add a pending request to the agent state.
   */
  addPendingRequestToState(toolCallId, toolName, input) {
    this.session.updateAgentState((currentState) => ({
      ...currentState,
      requests: {
        ...currentState.requests,
        [toolCallId]: {
          tool: toolName,
          arguments: input,
          createdAt: Date.now()
        }
      }
    }));
  }
  /**
   * Abort all pending permission requests.
   * Unlike reset(), this resolves (not rejects) pending promises with { decision: 'abort' },
   * causing the approval response to send 'cancel' to the provider. This is used when the
   * user presses the abort/stop button — it unblocks any pending tool approval so the provider
   * can process the turn cancellation.
   */
  abortAll() {
    const pendingSnapshot = Array.from(this.pendingRequests.entries());
    if (pendingSnapshot.length === 0) return;
    this.pendingRequests.clear();
    for (const [id, pending] of pendingSnapshot) {
      try {
        pending.resolve({ decision: "abort" });
      } catch (err) {
        api.logger.debug(`${this.getLogPrefix()} Error resolving aborted request ${id}:`, err);
      }
    }
    this.session.updateAgentState((currentState) => {
      const pendingRequests = currentState.requests || {};
      const completedRequests = { ...currentState.completedRequests };
      for (const [id, request] of Object.entries(pendingRequests)) {
        completedRequests[id] = {
          ...request,
          completedAt: Date.now(),
          status: "canceled",
          reason: "Aborted by user"
        };
      }
      return {
        ...currentState,
        requests: {},
        completedRequests
      };
    });
    api.logger.debug(`${this.getLogPrefix()} Aborted ${pendingSnapshot.length} pending permission(s)`);
  }
  /**
   * Reset state for new sessions.
   * This method is idempotent - safe to call multiple times.
   */
  reset() {
    if (this.isResetting) {
      api.logger.debug(`${this.getLogPrefix()} Reset already in progress, skipping`);
      return;
    }
    this.isResetting = true;
    try {
      const pendingSnapshot = Array.from(this.pendingRequests.entries());
      this.pendingRequests.clear();
      for (const [id, pending] of pendingSnapshot) {
        try {
          pending.reject(new Error("Session reset"));
        } catch (err) {
          api.logger.debug(`${this.getLogPrefix()} Error rejecting pending request ${id}:`, err);
        }
      }
      this.session.updateAgentState((currentState) => {
        const pendingRequests = currentState.requests || {};
        const completedRequests = { ...currentState.completedRequests };
        for (const [id, request] of Object.entries(pendingRequests)) {
          completedRequests[id] = {
            ...request,
            completedAt: Date.now(),
            status: "canceled",
            reason: "Session reset"
          };
        }
        return {
          ...currentState,
          requests: {},
          completedRequests
        };
      });
      api.logger.debug(`${this.getLogPrefix()} Permission handler reset`);
    } finally {
      this.isResetting = false;
    }
  }
}

class CodexPermissionHandler extends BasePermissionHandler {
  // Exact tool names that should always be auto-approved. Include the bare
  // form (used by Codex elicitation messages like `tool "change_title"`)
  // and the MCP-qualified form for defense in depth.
  static ALWAYS_AUTO_APPROVE_NAMES = /* @__PURE__ */ new Set([
    "change_title",
    "mcp__happy__change_title"
  ]);
  // Tool-call IDs that should auto-approve when they exactly match one of
  // these values or start with `<name>-` (e.g. `change_title-1765385846663`).
  // Substring matching was a bypass vector — any tool whose ID happened to
  // contain `change_title` as a substring would be silently approved.
  static ALWAYS_AUTO_APPROVE_ID_PREFIXES = [
    "change_title"
  ];
  constructor(session) {
    super(session);
  }
  getLogPrefix() {
    return "[Codex]";
  }
  shouldAutoApprove(toolName, toolCallId) {
    if (CodexPermissionHandler.ALWAYS_AUTO_APPROVE_NAMES.has(toolName)) {
      return true;
    }
    for (const prefix of CodexPermissionHandler.ALWAYS_AUTO_APPROVE_ID_PREFIXES) {
      if (toolCallId === prefix || toolCallId.startsWith(`${prefix}-`)) {
        return true;
      }
    }
    return false;
  }
  /**
   * Handle a tool permission request
   * @param toolCallId - The unique ID of the tool call
   * @param toolName - The name of the tool being called
   * @param input - The input parameters for the tool
   * @returns Promise resolving to permission result
   */
  async handleToolCall(toolCallId, toolName, input) {
    if (this.shouldAutoApprove(toolName, toolCallId)) {
      api.logger.debug(`${this.getLogPrefix()} Auto-approving tool ${toolName} (${toolCallId})`);
      this.session.updateAgentState((currentState) => ({
        ...currentState,
        completedRequests: {
          ...currentState.completedRequests,
          [toolCallId]: {
            tool: toolName,
            arguments: input,
            createdAt: Date.now(),
            completedAt: Date.now(),
            status: "approved",
            decision: "approved"
          }
        }
      }));
      return { decision: "approved" };
    }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(toolCallId, {
        resolve,
        reject,
        toolName,
        input
      });
      this.addPendingRequestToState(toolCallId, toolName, input);
      api.logger.debug(`${this.getLogPrefix()} Permission request sent for tool: ${toolName} (${toolCallId})`);
    });
  }
}

class BaseReasoningProcessor {
  accumulator = "";
  inTitleCapture = false;
  titleBuffer = "";
  contentBuffer = "";
  hasTitle = false;
  currentCallId = null;
  toolCallStarted = false;
  currentTitle = null;
  onMessage = null;
  constructor(onMessage) {
    this.onMessage = onMessage || null;
    this.reset();
  }
  /**
   * Set the message callback for sending messages directly.
   */
  setMessageCallback(callback) {
    this.onMessage = callback;
  }
  /**
   * Process a reasoning section break - indicates a new reasoning section is starting.
   */
  handleSectionBreak() {
    this.finishCurrentToolCall("canceled");
    this.resetState();
    api.logger.debug(`${this.getLogPrefix()} Section break - reset state`);
  }
  /**
   * Process a reasoning delta/chunk and accumulate content.
   */
  processInput(input) {
    this.accumulator += input;
    if (!this.inTitleCapture && !this.hasTitle && !this.contentBuffer) {
      if (this.accumulator.startsWith("**")) {
        this.inTitleCapture = true;
        this.titleBuffer = this.accumulator.substring(2);
        api.logger.debug(`${this.getLogPrefix()} Started title capture`);
      } else if (this.accumulator.length > 0) {
        this.contentBuffer = this.accumulator;
      }
    } else if (this.inTitleCapture) {
      this.titleBuffer = this.accumulator.substring(2);
      const titleEndIndex = this.titleBuffer.indexOf("**");
      if (titleEndIndex !== -1) {
        const title = this.titleBuffer.substring(0, titleEndIndex);
        const afterTitle = this.titleBuffer.substring(titleEndIndex + 2);
        this.hasTitle = true;
        this.inTitleCapture = false;
        this.currentTitle = title;
        this.contentBuffer = afterTitle;
        this.currentCallId = node_crypto.randomUUID();
        api.logger.debug(`${this.getLogPrefix()} Title captured: "${title}"`);
        this.sendToolCallStart(title);
      }
    } else if (this.hasTitle) {
      const titleStartIndex = this.accumulator.indexOf("**");
      if (titleStartIndex !== -1) {
        this.contentBuffer = this.accumulator.substring(
          titleStartIndex + 2 + this.currentTitle.length + 2
        );
      }
    } else {
      this.contentBuffer = this.accumulator;
    }
  }
  /**
   * Send the tool call start message.
   */
  sendToolCallStart(title) {
    if (!this.currentCallId || this.toolCallStarted) {
      return;
    }
    const toolCall = {
      type: "tool-call",
      name: this.getToolName(),
      callId: this.currentCallId,
      input: {
        title
      },
      id: node_crypto.randomUUID()
    };
    api.logger.debug(`${this.getLogPrefix()} Sending tool call start for: "${title}"`);
    this.onMessage?.(toolCall);
    this.toolCallStarted = true;
  }
  /**
   * Complete the reasoning section.
   * Returns true if reasoning was completed, false if there was nothing to complete.
   */
  completeReasoning(fullText) {
    const text = fullText ?? this.accumulator;
    if (!text.trim() && !this.toolCallStarted) {
      api.logger.debug(`${this.getLogPrefix()} Complete called but no content accumulated, skipping`);
      return false;
    }
    let title;
    let content = text;
    if (text.startsWith("**")) {
      const titleEndIndex = text.indexOf("**", 2);
      if (titleEndIndex !== -1) {
        title = text.substring(2, titleEndIndex);
        content = text.substring(titleEndIndex + 2).trim();
      }
    }
    api.logger.debug(`${this.getLogPrefix()} Complete reasoning - Title: "${title}", Has content: ${content.length > 0}`);
    if (title && !this.toolCallStarted) {
      this.currentCallId = this.currentCallId || node_crypto.randomUUID();
      this.sendToolCallStart(title);
    }
    if (this.toolCallStarted && this.currentCallId) {
      const toolResult = {
        type: "tool-call-result",
        callId: this.currentCallId,
        output: {
          content,
          status: "completed"
        },
        id: node_crypto.randomUUID()
      };
      api.logger.debug(`${this.getLogPrefix()} Sending tool call result`);
      this.onMessage?.(toolResult);
    } else if (content.trim()) {
      const reasoningMessage = {
        type: "reasoning",
        message: content,
        id: node_crypto.randomUUID()
      };
      api.logger.debug(`${this.getLogPrefix()} Sending reasoning message`);
      this.onMessage?.(reasoningMessage);
    }
    this.resetState();
    return true;
  }
  /**
   * Abort the current reasoning section.
   */
  abort() {
    api.logger.debug(`${this.getLogPrefix()} Abort called`);
    this.finishCurrentToolCall("canceled");
    this.resetState();
  }
  /**
   * Reset the processor state.
   */
  reset() {
    this.finishCurrentToolCall("canceled");
    this.resetState();
  }
  /**
   * Finish current tool call if one is in progress.
   */
  finishCurrentToolCall(status) {
    if (this.toolCallStarted && this.currentCallId) {
      const toolResult = {
        type: "tool-call-result",
        callId: this.currentCallId,
        output: {
          content: this.contentBuffer || "",
          status
        },
        id: node_crypto.randomUUID()
      };
      api.logger.debug(`${this.getLogPrefix()} Sending tool call result with status: ${status}`);
      this.onMessage?.(toolResult);
    }
  }
  /**
   * Reset internal state.
   */
  resetState() {
    this.accumulator = "";
    this.inTitleCapture = false;
    this.titleBuffer = "";
    this.contentBuffer = "";
    this.hasTitle = false;
    this.currentCallId = null;
    this.toolCallStarted = false;
    this.currentTitle = null;
  }
  /**
   * Get the current call ID for tool result matching.
   */
  getCurrentCallId() {
    return this.currentCallId;
  }
  /**
   * Check if a tool call has been started.
   */
  hasStartedToolCall() {
    return this.toolCallStarted;
  }
}

class ReasoningProcessor extends BaseReasoningProcessor {
  getToolName() {
    return "CodexReasoning";
  }
  getLogPrefix() {
    return "[ReasoningProcessor]";
  }
  /**
   * Process a reasoning delta and accumulate content.
   */
  processDelta(delta) {
    this.processInput(delta);
  }
  /**
   * Complete the reasoning section with final text.
   */
  complete(fullText) {
    this.completeReasoning(fullText);
  }
}

class DiffProcessor {
  previousDiff = null;
  onMessage = null;
  constructor(onMessage) {
    this.onMessage = onMessage || null;
  }
  /**
   * Process a turn_diff message and check if the unified_diff has changed
   */
  processDiff(unifiedDiff) {
    if (this.previousDiff !== unifiedDiff) {
      api.logger.debug("[DiffProcessor] Unified diff changed, sending CodexDiff tool call");
      const callId = node_crypto.randomUUID();
      const toolCall = {
        type: "tool-call",
        name: "CodexDiff",
        callId,
        input: {
          unified_diff: unifiedDiff
        },
        id: node_crypto.randomUUID()
      };
      this.onMessage?.(toolCall);
      const toolResult = {
        type: "tool-call-result",
        callId,
        output: {
          status: "completed"
        },
        id: node_crypto.randomUUID()
      };
      this.onMessage?.(toolResult);
    }
    this.previousDiff = unifiedDiff;
    api.logger.debug("[DiffProcessor] Updated stored diff");
  }
  /**
   * Reset the processor state (called on task_complete or turn_aborted)
   */
  reset() {
    api.logger.debug("[DiffProcessor] Resetting diff state");
    this.previousDiff = null;
  }
  /**
   * Set the message callback for sending messages directly
   */
  setMessageCallback(callback) {
    this.onMessage = callback;
  }
  /**
   * Get the current diff value
   */
  getCurrentDiff() {
    return this.previousDiff;
  }
}

function createSessionMetadata(opts) {
  const state = {
    controlledByUser: false
  };
  const metadata = {
    path: process.cwd(),
    host: os.hostname(),
    version: api.packageJson.version,
    os: os.platform(),
    machineId: opts.machineId,
    homeDir: os.homedir(),
    happyHomeDir: api.configuration.happyHomeDir,
    happyLibDir: api.projectPath(),
    happyToolsDir: node_path.resolve(api.projectPath(), "tools", "unpacked"),
    startedFromDaemon: opts.startedBy === "daemon",
    hostPid: process.pid,
    startedBy: opts.startedBy || "terminal",
    lifecycleState: "running",
    lifecycleStateSince: Date.now(),
    flavor: opts.flavor,
    sandbox: opts.sandbox?.enabled ? opts.sandbox : null,
    dangerouslySkipPermissions: opts.dangerouslySkipPermissions ?? null
  };
  return { state, metadata };
}

const CodexDisplay = ({ messageBuffer, logPath, onExit }) => {
  const [messages, setMessages] = React.useState([]);
  const [confirmationMode, setConfirmationMode] = React.useState(false);
  const [actionInProgress, setActionInProgress] = React.useState(false);
  const confirmationTimeoutRef = React.useRef(null);
  const { stdout } = ink.useStdout();
  const terminalWidth = stdout.columns || 80;
  const terminalHeight = stdout.rows || 24;
  React.useEffect(() => {
    setMessages(messageBuffer.getMessages());
    const unsubscribe = messageBuffer.onUpdate((newMessages) => {
      setMessages(newMessages);
    });
    return () => {
      unsubscribe();
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
    };
  }, [messageBuffer]);
  const resetConfirmation = React.useCallback(() => {
    setConfirmationMode(false);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
  }, []);
  const setConfirmationWithTimeout = React.useCallback(() => {
    setConfirmationMode(true);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
    }
    confirmationTimeoutRef.current = setTimeout(() => {
      resetConfirmation();
    }, 15e3);
  }, [resetConfirmation]);
  ink.useInput(React.useCallback(async (input, key) => {
    if (actionInProgress) return;
    if (key.ctrl && input === "c") {
      if (confirmationMode) {
        resetConfirmation();
        setActionInProgress(true);
        await new Promise((resolve) => setTimeout(resolve, 100));
        onExit?.();
      } else {
        setConfirmationWithTimeout();
      }
      return;
    }
    if (confirmationMode) {
      resetConfirmation();
    }
  }, [confirmationMode, actionInProgress, onExit, setConfirmationWithTimeout, resetConfirmation]));
  const getMessageColor = (type) => {
    switch (type) {
      case "user":
        return "magenta";
      case "assistant":
        return "cyan";
      case "system":
        return "blue";
      case "tool":
        return "yellow";
      case "result":
        return "green";
      case "status":
        return "gray";
      default:
        return "white";
    }
  };
  const formatMessage = (msg) => {
    const lines = msg.content.split("\n");
    const maxLineLength = terminalWidth - 10;
    return lines.map((line) => {
      if (line.length <= maxLineLength) return line;
      const chunks = [];
      for (let i = 0; i < line.length; i += maxLineLength) {
        chunks.push(line.slice(i, i + maxLineLength));
      }
      return chunks.join("\n");
    }).join("\n");
  };
  return /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", width: terminalWidth, height: terminalHeight }, /* @__PURE__ */ React.createElement(
    ink.Box,
    {
      flexDirection: "column",
      width: terminalWidth,
      height: terminalHeight - 4,
      borderStyle: "round",
      borderColor: "gray",
      paddingX: 1,
      overflow: "hidden"
    },
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "\u{1F916} Codex Agent Messages"), /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "\u2500".repeat(Math.min(terminalWidth - 4, 60)))),
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", height: terminalHeight - 10, overflow: "hidden" }, messages.length === 0 ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Waiting for messages...") : (
      // Show only the last messages that fit in the available space
      messages.slice(-Math.max(1, terminalHeight - 10)).map((msg) => /* @__PURE__ */ React.createElement(ink.Box, { key: msg.id, flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { color: getMessageColor(msg.type), dimColor: true }, formatMessage(msg))))
    ))
  ), /* @__PURE__ */ React.createElement(
    ink.Box,
    {
      width: terminalWidth,
      borderStyle: "round",
      borderColor: actionInProgress ? "gray" : confirmationMode ? "red" : "green",
      paddingX: 2,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column"
    },
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", alignItems: "center" }, actionInProgress ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "Exiting agent...") : confirmationMode ? /* @__PURE__ */ React.createElement(ink.Text, { color: "red", bold: true }, "\u26A0\uFE0F  Press Ctrl-C again to exit the agent") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ink.Text, { color: "green", bold: true }, "\u{1F916} Codex Agent Running \u2022 Ctrl-C to exit")), process.env.DEBUG && logPath && /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Debug logs: ", logPath))
  ));
};

const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";
const GOOGLE_API_KEY_ENV = "GOOGLE_API_KEY";
const GEMINI_MODEL_ENV = "GEMINI_MODEL";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
const CHANGE_TITLE_INSTRUCTION = trimIdent(
  `Based on this message, call functions.happy__change_title to change chat session title that would represent the current task. If chat idea would change dramatically - call this function again to update the title.`
);

function createOfflineSessionStub(sessionTag) {
  return {
    sessionId: `offline-${sessionTag}`,
    sendCodexMessage: () => {
    },
    sendAgentMessage: () => {
    },
    sendClaudeSessionMessage: () => {
    },
    keepAlive: () => {
    },
    sendSessionEvent: () => {
    },
    sendSessionDeath: () => {
    },
    updateLifecycleState: () => {
    },
    requestControlTransfer: async () => {
    },
    flush: async () => {
    },
    close: async () => {
    },
    updateMetadata: () => {
    },
    updateAgentState: () => {
    },
    onUserMessage: () => {
    },
    rpcHandlerManager: {
      registerHandler: () => {
      }
    }
  };
}

function setupOfflineReconnection(opts) {
  const { api: api$1, sessionTag, metadata, state, response, onSessionSwap } = opts;
  let session;
  let reconnectionHandle = null;
  if (!response) {
    session = createOfflineSessionStub(sessionTag);
    reconnectionHandle = api.startOfflineReconnection({
      serverUrl: api.configuration.serverUrl,
      onReconnected: async () => {
        const resp = await api$1.getOrCreateSession({ tag: sessionTag, metadata, state });
        if (!resp) throw new Error("Server unavailable");
        const realSession = api$1.sessionSyncClient(resp);
        onSessionSwap(realSession);
        return realSession;
      },
      onNotify: (msg) => {
        console.log(msg);
      }
    });
    return { session, reconnectionHandle, isOffline: true };
  } else {
    session = api$1.sessionSyncClient(response);
    return { session, reconnectionHandle: null, isOffline: false };
  }
}

function resolveCodexExecutionPolicy(permissionMode, sandboxManagedByHappy) {
  if (sandboxManagedByHappy) {
    return {
      approvalPolicy: "never",
      sandbox: "danger-full-access"
    };
  }
  const approvalPolicy = (() => {
    switch (permissionMode) {
      // Codex native modes
      case "default":
        return "untrusted";
      // Ask for non-trusted commands
      case "read-only":
        return "never";
      // Never ask, read-only enforced by sandbox
      case "safe-yolo":
        return "on-failure";
      // Auto-run, ask only on failure
      case "yolo":
        return "on-failure";
      // Auto-run, ask only on failure
      // Defensive fallback for Claude-specific modes (backward compatibility)
      case "bypassPermissions":
        return "on-failure";
      // Full access: map to yolo behavior
      case "acceptEdits":
        return "on-request";
      // Let model decide (closest to auto-approve edits)
      case "plan":
        return "untrusted";
      // Conservative: ask for non-trusted
      default:
        return "untrusted";
    }
  })();
  const sandbox = (() => {
    switch (permissionMode) {
      // Codex native modes
      case "default":
        return "workspace-write";
      // Can write in workspace
      case "read-only":
        return "read-only";
      // Read-only filesystem
      case "safe-yolo":
        return "workspace-write";
      // Can write in workspace
      case "yolo":
        return "danger-full-access";
      // Full system access
      // Defensive fallback for Claude-specific modes
      case "bypassPermissions":
        return "danger-full-access";
      // Full access: map to yolo
      case "acceptEdits":
        return "workspace-write";
      // Can edit files in workspace
      case "plan":
        return "workspace-write";
      // Can write for planning
      default:
        return "workspace-write";
    }
  })();
  return { approvalPolicy, sandbox };
}

function getStartedSubagents(state) {
  return state.startedSubagents ?? /* @__PURE__ */ new Set();
}
function getActiveSubagents(state) {
  return state.activeSubagents ?? /* @__PURE__ */ new Set();
}
function getProviderSubagentToSessionSubagent(state) {
  return state.providerSubagentToSessionSubagent ?? /* @__PURE__ */ new Map();
}
function maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes) {
  if (!subagent || startedSubagents.has(subagent)) {
    return;
  }
  envelopes.push(happyWire.createEnvelope("agent", { t: "start" }, { ...opts, subagent }));
  startedSubagents.add(subagent);
  activeSubagents.add(subagent);
}
function emitSubagentStops(opts, startedSubagents, activeSubagents) {
  const envelopes = [];
  for (const subagent of activeSubagents) {
    envelopes.push(happyWire.createEnvelope("agent", { t: "stop" }, { ...opts, subagent }));
  }
  activeSubagents.clear();
  startedSubagents.clear();
  return envelopes;
}
function buildEnvelopeOptions(currentTurnId, subagent) {
  return {
    ...currentTurnId ? { turn: currentTurnId } : {},
    ...subagent ? { subagent } : {}
  };
}
function pickProviderSubagent(message) {
  const candidates = [message.subagent, message.parent_call_id, message.parentCallId];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return void 0;
}
function resolveSessionSubagent(message, providerSubagentToSessionSubagent) {
  const providerSubagent = pickProviderSubagent(message);
  if (!providerSubagent) {
    return void 0;
  }
  const existing = providerSubagentToSessionSubagent.get(providerSubagent);
  if (existing) {
    return existing;
  }
  const created = cuid2.createId();
  providerSubagentToSessionSubagent.set(providerSubagent, created);
  return created;
}
function pickCallId(message) {
  const callId = message.call_id ?? message.callId;
  if (typeof callId === "string" && callId.length > 0) {
    return callId;
  }
  return node_crypto.randomUUID();
}
function summarizeCommand(command) {
  if (typeof command === "string" && command.trim().length > 0) {
    return command;
  }
  if (Array.isArray(command)) {
    const cmd = command.map((v) => String(v)).join(" ").trim();
    return cmd.length > 0 ? cmd : null;
  }
  return null;
}
function commandToTitle(command) {
  if (!command) {
    return "Run command";
  }
  const short = command.length > 80 ? `${command.slice(0, 77)}...` : command;
  return `Run \`${short}\``;
}
function patchDescription(changes) {
  if (!changes || typeof changes !== "object") {
    return "Applying patch";
  }
  const fileCount = Object.keys(changes).length;
  if (fileCount === 1) {
    return "Applying patch to 1 file";
  }
  return `Applying patch to ${fileCount} files`;
}
function pickTurnEndStatus(message, type) {
  const rawStatus = message.status;
  if (rawStatus === "completed" || rawStatus === "failed" || rawStatus === "cancelled") {
    return rawStatus;
  }
  if (rawStatus === "canceled") {
    return "cancelled";
  }
  if (type === "turn_aborted") {
    const reason = message.reason;
    const error = message.error;
    if (typeof reason === "string" && /(fail|error)/i.test(reason) || typeof error === "string" && error.length > 0 || error !== void 0 && error !== null && typeof error === "object") {
      return "failed";
    }
    return "cancelled";
  }
  if (message.error !== void 0 && message.error !== null) {
    return "failed";
  }
  return "completed";
}
function mapCodexMcpMessageToSessionEnvelopes(message, state) {
  const type = message.type;
  const startedSubagents = getStartedSubagents(state);
  const activeSubagents = getActiveSubagents(state);
  const providerSubagentToSessionSubagent = getProviderSubagentToSessionSubagent(state);
  if (type === "task_started") {
    const turnId = cuid2.createId();
    const turnStart = happyWire.createEnvelope("agent", { t: "turn-start" }, { turn: turnId });
    startedSubagents.clear();
    activeSubagents.clear();
    providerSubagentToSessionSubagent.clear();
    return {
      currentTurnId: turnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes: [turnStart]
    };
  }
  if (type === "task_complete" || type === "turn_aborted") {
    if (!state.currentTurnId) {
      return {
        currentTurnId: null,
        startedSubagents,
        activeSubagents,
        providerSubagentToSessionSubagent,
        envelopes: []
      };
    }
    const lifecycleOpts = { turn: state.currentTurnId };
    providerSubagentToSessionSubagent.clear();
    return {
      currentTurnId: null,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes: [
        ...emitSubagentStops(lifecycleOpts, startedSubagents, activeSubagents),
        happyWire.createEnvelope("agent", {
          t: "turn-end",
          status: pickTurnEndStatus(message, type)
        }, lifecycleOpts)
      ]
    };
  }
  if (type === "token_count") {
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes: []
    };
  }
  const subagent = resolveSessionSubagent(message, providerSubagentToSessionSubagent);
  const opts = buildEnvelopeOptions(state.currentTurnId, subagent);
  if (type === "agent_message") {
    if (typeof message.message !== "string") {
      return {
        currentTurnId: state.currentTurnId,
        startedSubagents,
        activeSubagents,
        providerSubagentToSessionSubagent,
        envelopes: []
      };
    }
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(happyWire.createEnvelope("agent", { t: "text", text: message.message }, opts));
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  if (type === "agent_reasoning" || type === "agent_reasoning_delta") {
    const text = typeof message.text === "string" ? message.text : typeof message.delta === "string" ? message.delta : null;
    if (!text) {
      return {
        currentTurnId: state.currentTurnId,
        startedSubagents,
        activeSubagents,
        providerSubagentToSessionSubagent,
        envelopes: []
      };
    }
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(happyWire.createEnvelope("agent", { t: "text", text, thinking: true }, opts));
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  if (type === "exec_command_begin") {
    const call = pickCallId(message);
    const { call_id: _callIdSnake, callId: _callIdCamel, type: _type, ...args } = message;
    const command = summarizeCommand(args.command);
    const description = typeof args.description === "string" ? args.description : command ?? "Execute command";
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(
      happyWire.createEnvelope("agent", {
        t: "tool-call-start",
        call,
        name: "CodexBash",
        title: commandToTitle(command),
        description,
        args
      }, opts)
    );
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  if (type === "exec_command_end") {
    const call = pickCallId(message);
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(happyWire.createEnvelope("agent", { t: "tool-call-end", call }, opts));
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  if (type === "patch_apply_begin") {
    const call = pickCallId(message);
    const autoApproved = message.auto_approved;
    const changes = message.changes;
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(
      happyWire.createEnvelope("agent", {
        t: "tool-call-start",
        call,
        name: "CodexPatch",
        title: "Apply patch",
        description: patchDescription(changes),
        args: {
          auto_approved: autoApproved,
          changes
        }
      }, opts)
    );
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  if (type === "patch_apply_end") {
    const call = pickCallId(message);
    const envelopes = [];
    maybeEmitSubagentStart(subagent, opts, startedSubagents, activeSubagents, envelopes);
    envelopes.push(happyWire.createEnvelope("agent", { t: "tool-call-end", call }, opts));
    return {
      currentTurnId: state.currentTurnId,
      startedSubagents,
      activeSubagents,
      providerSubagentToSessionSubagent,
      envelopes
    };
  }
  return {
    currentTurnId: state.currentTurnId,
    startedSubagents,
    activeSubagents,
    providerSubagentToSessionSubagent,
    envelopes: []
  };
}
function mapCodexProcessorMessageToSessionEnvelopes(message, state) {
  const toolLikeMessage = message;
  const opts = buildEnvelopeOptions(state.currentTurnId);
  if (message.type === "reasoning") {
    return [happyWire.createEnvelope("agent", {
      t: "text",
      text: message.message,
      thinking: true
    }, opts)];
  }
  if (message.type === "tool-call") {
    const title = typeof toolLikeMessage.input?.title === "string" ? toolLikeMessage.input.title : `${toolLikeMessage.name || "Tool"} call`;
    return [happyWire.createEnvelope("agent", {
      t: "tool-call-start",
      call: toolLikeMessage.callId,
      name: toolLikeMessage.name || "unknown",
      title,
      description: title,
      args: toolLikeMessage.input && typeof toolLikeMessage.input === "object" ? toolLikeMessage.input : {}
    }, opts)];
  }
  if (message.type === "tool-call-result") {
    const envelopes = [];
    const content = toolLikeMessage.output?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      envelopes.push(happyWire.createEnvelope("agent", {
        t: "text",
        text: content,
        thinking: true
      }, opts));
    }
    envelopes.push(happyWire.createEnvelope("agent", {
      t: "tool-call-end",
      call: toolLikeMessage.callId
    }, opts));
    return envelopes;
  }
  return [];
}

async function resumeExistingThread(opts) {
  try {
    const resumedThread = await opts.client.resumeThread({
      threadId: opts.threadId,
      cwd: opts.cwd,
      mcpServers: opts.mcpServers
    });
    opts.session.updateMetadata((currentMetadata) => ({
      ...currentMetadata,
      codexThreadId: resumedThread.threadId
    }));
    opts.messageBuffer.addMessage(`Resumed thread ${trimIdent(resumedThread.threadId)}`, "status");
    opts.session.sendSessionEvent({
      type: "message",
      message: `Resumed Codex thread ${resumedThread.threadId}`
    });
    return resumedThread;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resume Codex thread ${opts.threadId}: ${reason}`);
  }
}

function emitReadyIfIdle({ pending, queueSize, shouldExit, sendReady, notify }) {
  if (shouldExit) {
    return false;
  }
  if (pending) {
    return false;
  }
  if (queueSize() > 0) {
    return false;
  }
  sendReady();
  notify?.();
  return true;
}

function describeCodexFailure(msg) {
  const hasFailure = msg?.status === "failed" || msg?.error !== void 0 && msg?.error !== null;
  if (!hasFailure) return null;
  const err = msg.error;
  if (typeof err === "string" && err.length > 0) return err;
  if (err && typeof err === "object" && typeof err.message === "string" && err.message.length > 0) {
    return err.message;
  }
  return "Unknown error";
}
async function runCodex(opts) {
  try {
    node_child_process.execSync("codex --version", { encoding: "utf8", stdio: "pipe", windowsHide: true });
  } catch {
    console.error("\n\x1B[1m\x1B[33mCodex CLI is not installed\x1B[0m\n");
    console.error("Please install Codex CLI using one of these methods:\n");
    console.error("\x1B[1mOption 1 - npm (recommended):\x1B[0m");
    console.error("  \x1B[36mnpm install -g @openai/codex\x1B[0m\n");
    console.error("\x1B[1mOption 2 - Homebrew (macOS):\x1B[0m");
    console.error("  \x1B[36mbrew install --cask codex\x1B[0m\n");
    console.error("Alternatively, use Claude Code:");
    console.error("  \x1B[36mhappy claude\x1B[0m\n");
    process.exit(1);
  }
  const sessionTag = node_crypto.randomUUID();
  api.connectionState.setBackend("Codex");
  const api$1 = await api.ApiClient.create(opts.credentials);
  api.logger.debug(`[codex] Starting with options: startedBy=${opts.startedBy || "terminal"}`);
  const settings = await persistence.readSettings();
  let machineId = settings?.machineId;
  const sandboxConfig = opts.noSandbox ? void 0 : settings?.sandboxConfig;
  if (!machineId) {
    console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/slopus/happy-cli/issues`);
    process.exit(1);
  }
  api.logger.debug(`Using machineId: ${machineId}`);
  await api$1.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata
  });
  const { state, metadata } = createSessionMetadata({
    flavor: "codex",
    machineId,
    startedBy: opts.startedBy,
    sandbox: sandboxConfig
  });
  const reconnectSessionId = process.env.HAPPY_RECONNECT_SESSION_ID;
  const reconnectKeyBase64 = process.env.HAPPY_RECONNECT_ENCRYPTION_KEY;
  const reconnectVariant = process.env.HAPPY_RECONNECT_ENCRYPTION_VARIANT;
  const reconnectSeq = process.env.HAPPY_RECONNECT_SEQ;
  const reconnectMetadataVersion = process.env.HAPPY_RECONNECT_METADATA_VERSION;
  const reconnectAgentStateVersion = process.env.HAPPY_RECONNECT_AGENT_STATE_VERSION;
  let response;
  if (reconnectSessionId && reconnectKeyBase64 && reconnectVariant) {
    api.logger.debug(`[START] Reconnecting to existing session ${reconnectSessionId}`);
    response = {
      id: reconnectSessionId,
      seq: parseInt(reconnectSeq || "0", 10),
      encryptionKey: api.decodeBase64(reconnectKeyBase64),
      encryptionVariant: reconnectVariant,
      metadata,
      metadataVersion: parseInt(reconnectMetadataVersion || "0", 10),
      agentState: state,
      agentStateVersion: parseInt(reconnectAgentStateVersion || "0", 10)
    };
  } else {
    response = await api$1.getOrCreateSession({ tag: sessionTag, metadata, state });
  }
  let session;
  let permissionHandler;
  let client;
  let reasoningProcessor;
  let abortInProgress = null;
  const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
    api: api$1,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      session = newSession;
      if (permissionHandler) {
        permissionHandler.updateSession(newSession);
      }
    }
  });
  session = initialSession;
  if (reconnectSessionId) {
    session.suppressNextArchiveSignal();
    session.skipExistingMessages();
    session.updateMetadata((meta) => ({
      ...meta,
      lifecycleState: "running",
      archivedBy: void 0
    }));
  }
  if (response) {
    try {
      api.logger.debug(`[START] Reporting session ${response.id} to daemon`);
      const result = await notifyDaemonSessionStarted(response.id, metadata, {
        encryptionKey: api.encodeBase64(response.encryptionKey),
        encryptionVariant: response.encryptionVariant,
        seq: response.seq,
        metadataVersion: response.metadataVersion,
        agentStateVersion: response.agentStateVersion
      });
      if (result.error) {
        api.logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
      } else {
        api.logger.debug(`[START] Reported session ${response.id} to daemon`);
      }
    } catch (error) {
      api.logger.debug("[START] Failed to report to daemon (may not be running):", error);
    }
  }
  const messageQueue = new MessageQueue2((mode) => hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model
  }));
  let currentPermissionMode = void 0;
  let currentModel = void 0;
  const VALID_REMOTE_PERMISSION_MODES = [
    "default",
    "read-only",
    "safe-yolo",
    "yolo"
  ];
  session.onUserMessage((message) => {
    let messagePermissionMode = currentPermissionMode;
    if (message.meta?.permissionMode) {
      const incoming = message.meta.permissionMode;
      if (VALID_REMOTE_PERMISSION_MODES.includes(incoming)) {
        messagePermissionMode = incoming;
        currentPermissionMode = messagePermissionMode;
        api.logger.debug(`[Codex] Permission mode updated from user message to: ${currentPermissionMode}`);
      } else {
        api.logger.debug(`[Codex] Ignoring invalid permission mode from user message: ${String(message.meta.permissionMode)}`);
      }
    } else {
      api.logger.debug(`[Codex] User message received with no permission mode override, using current: ${currentPermissionMode ?? "default (effective)"}`);
    }
    let messageModel = currentModel;
    if (message.meta?.hasOwnProperty("model")) {
      messageModel = message.meta.model || void 0;
      currentModel = messageModel;
      api.logger.debug(`[Codex] Model updated from user message: ${messageModel || "reset to default"}`);
    } else {
      api.logger.debug(`[Codex] User message received with no model override, using current: ${currentModel || "default"}`);
    }
    const enhancedMode = {
      permissionMode: messagePermissionMode || "default",
      model: messageModel
    };
    messageQueue.push(message.content.text, enhancedMode);
  });
  let thinking = false;
  let currentTurnId = null;
  let codexStartedSubagents = /* @__PURE__ */ new Set();
  let codexActiveSubagents = /* @__PURE__ */ new Set();
  let codexProviderSubagentToSessionSubagent = /* @__PURE__ */ new Map();
  session.keepAlive(thinking, "remote");
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, "remote");
  }, 2e3);
  const sendReady = () => {
    session.sendSessionEvent({ type: "ready" });
    try {
      api$1.push().sendSessionNotification({
        kind: "done",
        metadata: session.getMetadata(),
        data: {
          sessionId: session.sessionId,
          type: "ready",
          provider: "codex"
        }
      });
    } catch (pushError) {
      api.logger.debug("[Codex] Failed to send ready push", pushError);
    }
  };
  function logActiveHandles(tag) {
    if (!process.env.DEBUG) return;
    const anyProc = process;
    const handles = typeof anyProc._getActiveHandles === "function" ? anyProc._getActiveHandles() : [];
    const requests = typeof anyProc._getActiveRequests === "function" ? anyProc._getActiveRequests() : [];
    api.logger.debug(`[codex][handles] ${tag}: handles=${handles.length} requests=${requests.length}`);
    try {
      const kinds = handles.map((h) => h && h.constructor ? h.constructor.name : typeof h);
      api.logger.debug(`[codex][handles] kinds=${JSON.stringify(kinds)}`);
    } catch {
    }
  }
  let abortController = new AbortController();
  let shouldExit = false;
  async function handleAbort() {
    if (abortInProgress) {
      await abortInProgress;
      return;
    }
    api.logger.debug("[Codex] Abort requested - stopping current task");
    abortInProgress = (async () => {
      try {
        if (permissionHandler) {
          permissionHandler.abortAll();
        }
        if (client) {
          const abortResult = await client.abortTurnWithFallback({
            gracePeriodMs: 3e3,
            forceRestartOnTimeout: true
          });
          if (abortResult.forcedRestart) {
            api.logger.warn("[Codex] Forced app-server restart after interrupt timeout");
            session.sendSessionEvent({
              type: "message",
              message: abortResult.resumedThread ? "Force-stopped active task after interrupt timeout. Codex backend was restarted and the previous thread was resumed." : "Force-stopped active task after interrupt timeout. Codex backend was restarted, but the previous thread could not be resumed."
            });
          }
        }
        if (reasoningProcessor) {
          reasoningProcessor.abort();
        }
        api.logger.debug("[Codex] Abort completed - session remains active");
      } catch (error) {
        api.logger.debug("[Codex] Error during abort:", error);
      } finally {
        abortController.abort();
        abortController = new AbortController();
      }
    })();
    await abortInProgress;
    abortInProgress = null;
  }
  const handleKillSession = async () => {
    api.logger.debug("[Codex] Kill session requested - terminating process");
    await handleAbort();
    api.logger.debug("[Codex] Abort completed, proceeding with termination");
    try {
      if (session) {
        session.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: "archived",
          lifecycleStateSince: Date.now(),
          archivedBy: "cli",
          archiveReason: "User terminated"
        }));
        session.sendSessionDeath();
        await session.flush();
        await session.close();
      }
      try {
        await client.disconnect();
      } catch (e) {
        api.logger.debug("[Codex] Error disconnecting Codex during termination", e);
      }
      happyServer.stop();
      api.logger.debug("[Codex] Session termination complete, exiting");
      process.exit(0);
    } catch (error) {
      api.logger.debug("[Codex] Error during session termination:", error);
      process.exit(1);
    }
  };
  session.rpcHandlerManager.registerHandler("abort", handleAbort);
  registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);
  const messageBuffer = new MessageBuffer();
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  let inkInstance = null;
  if (hasTTY) {
    console.clear();
    inkInstance = ink.render(React.createElement(CodexDisplay, {
      messageBuffer,
      logPath: process.env.DEBUG ? api.logger.getLogPath() : void 0,
      onExit: async () => {
        api.logger.debug("[codex]: Exiting agent via Ctrl-C");
        shouldExit = true;
        await handleAbort();
      }
    }), {
      exitOnCtrlC: false,
      patchConsole: false
    });
  }
  if (hasTTY) {
    process.stdin.resume();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
  }
  client = new CodexAppServerClient(sandboxConfig);
  permissionHandler = new CodexPermissionHandler(session);
  reasoningProcessor = new ReasoningProcessor((message) => {
    const envelopes = mapCodexProcessorMessageToSessionEnvelopes(message, { currentTurnId });
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  });
  const diffProcessor = new DiffProcessor((message) => {
    const envelopes = mapCodexProcessorMessageToSessionEnvelopes(message, { currentTurnId });
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  });
  client.setApprovalHandler(async (params) => {
    const toolName = params.type === "exec" ? "CodexBash" : params.type === "patch" ? "CodexPatch" : params.toolName ?? "McpTool";
    const input = params.type === "exec" ? { command: params.command, cwd: params.cwd } : params.type === "patch" ? { changes: params.fileChanges } : params.input ?? {};
    try {
      const result = await permissionHandler.handleToolCall(params.callId, toolName, input);
      api.logger.debug("[Codex] Permission result:", result.decision);
      return result.decision;
    } catch (error) {
      api.logger.debug("[Codex] Error handling permission:", error);
      return "denied";
    }
  });
  client.setEventHandler((msg) => {
    api.logger.debug(`[Codex] Event: ${JSON.stringify(msg)}`);
    if (msg.type === "agent_message") {
      messageBuffer.addMessage(msg.message, "assistant");
    } else if (msg.type === "agent_reasoning_delta") ; else if (msg.type === "agent_reasoning") {
      messageBuffer.addMessage(`[Thinking] ${msg.text.substring(0, 100)}...`, "system");
    } else if (msg.type === "exec_command_begin") {
      messageBuffer.addMessage(`Executing: ${msg.command}`, "tool");
    } else if (msg.type === "exec_command_end") {
      const output = msg.output || msg.error || "Command completed";
      const truncatedOutput = output.substring(0, 200);
      messageBuffer.addMessage(
        `Result: ${truncatedOutput}${output.length > 200 ? "..." : ""}`,
        "result"
      );
    } else if (msg.type === "task_started") {
      messageBuffer.addMessage("Starting task...", "status");
    } else if (msg.type === "task_complete") {
      const failure = describeCodexFailure(msg);
      if (failure) {
        messageBuffer.addMessage(`Task failed: ${failure}`, "status");
        session.sendSessionEvent({ type: "message", message: `Codex error: ${failure}` });
      } else {
        messageBuffer.addMessage("Task completed", "status");
      }
    } else if (msg.type === "turn_aborted") {
      const failure = describeCodexFailure(msg);
      if (failure) {
        messageBuffer.addMessage(`Turn aborted: ${failure}`, "status");
        session.sendSessionEvent({ type: "message", message: `Codex error: ${failure}` });
      } else {
        messageBuffer.addMessage("Turn aborted", "status");
      }
    }
    if (msg.type === "task_started") {
      if (!thinking) {
        api.logger.debug("thinking started");
        thinking = true;
        session.keepAlive(thinking, "remote");
      }
    }
    if (msg.type === "task_complete" || msg.type === "turn_aborted") {
      if (thinking) {
        api.logger.debug("thinking completed");
        thinking = false;
        session.keepAlive(thinking, "remote");
      }
      diffProcessor.reset();
    }
    if (msg.type === "agent_reasoning_section_break") {
      reasoningProcessor.handleSectionBreak();
    }
    if (msg.type === "agent_reasoning_delta") {
      reasoningProcessor.processDelta(msg.delta);
    }
    if (msg.type === "agent_reasoning") {
      reasoningProcessor.complete(msg.text);
    }
    if (msg.type === "patch_apply_begin") {
      const { changes } = msg;
      const changeCount = Object.keys(changes).length;
      const filesMsg = changeCount === 1 ? "1 file" : `${changeCount} files`;
      messageBuffer.addMessage(`Modifying ${filesMsg}...`, "tool");
    }
    if (msg.type === "patch_apply_end") {
      const { stdout, stderr, success } = msg;
      if (success) {
        const message = stdout || "Files modified successfully";
        messageBuffer.addMessage(message.substring(0, 200), "result");
      } else {
        const errorMsg = stderr || "Failed to modify files";
        messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, "result");
      }
    }
    if (msg.type === "turn_diff") {
      if (msg.unified_diff) {
        diffProcessor.processDiff(msg.unified_diff);
      }
    }
    if (msg.type !== "agent_reasoning_delta" && msg.type !== "agent_reasoning" && msg.type !== "agent_reasoning_section_break" && msg.type !== "turn_diff") {
      const mapped = mapCodexMcpMessageToSessionEnvelopes(msg, {
        currentTurnId,
        startedSubagents: codexStartedSubagents,
        activeSubagents: codexActiveSubagents,
        providerSubagentToSessionSubagent: codexProviderSubagentToSessionSubagent
      });
      currentTurnId = mapped.currentTurnId;
      codexStartedSubagents = mapped.startedSubagents;
      codexActiveSubagents = mapped.activeSubagents;
      codexProviderSubagentToSessionSubagent = mapped.providerSubagentToSessionSubagent;
      for (const envelope of mapped.envelopes) {
        session.sendSessionProtocolMessage(envelope);
      }
    }
  });
  const happyServer = await startHappyServer(session);
  const bridgeEntrypoint = node_path.join(api.projectPath(), "bin", "happy-mcp.mjs");
  const mcpServers = {
    happy: {
      command: process.execPath,
      args: ["--no-warnings", "--no-deprecation", bridgeEntrypoint, "--url", happyServer.url]
    }
  };
  let first = true;
  try {
    api.logger.debug("[codex]: client.connect begin");
    await client.connect();
    api.logger.debug("[codex]: client.connect done");
    if (opts.resumeThreadId) {
      await resumeExistingThread({
        client,
        session,
        messageBuffer,
        threadId: opts.resumeThreadId,
        cwd: process.cwd(),
        mcpServers
      });
      first = false;
    }
    let pending = null;
    while (!shouldExit) {
      logActiveHandles("loop-top");
      let message = pending;
      pending = null;
      if (!message) {
        const waitSignal = abortController.signal;
        const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
        if (!batch) {
          if (waitSignal.aborted && !shouldExit) {
            api.logger.debug("[codex]: Wait aborted while idle; ignoring and continuing");
            continue;
          }
          api.logger.debug(`[codex]: batch=${!!batch}, shouldExit=${shouldExit}`);
          break;
        }
        message = batch;
      }
      if (!message) {
        break;
      }
      messageBuffer.addMessage(message.message, "user");
      try {
        const sandboxManagedByHappy = client.sandboxEnabled;
        const executionPolicy = resolveCodexExecutionPolicy(
          message.mode.permissionMode,
          sandboxManagedByHappy
        );
        if (!client.hasActiveThread()) {
          const startedThread = await client.startThread({
            model: message.mode.model,
            cwd: process.cwd(),
            approvalPolicy: executionPolicy.approvalPolicy,
            sandbox: executionPolicy.sandbox,
            mcpServers
          });
          session.updateMetadata((currentMetadata) => ({
            ...currentMetadata,
            codexThreadId: startedThread.threadId
          }));
        }
        const turnPrompt = first ? message.message + "\n\n" + CHANGE_TITLE_INSTRUCTION : message.message;
        const result = await client.sendTurnAndWait(turnPrompt, {
          model: message.mode.model,
          approvalPolicy: executionPolicy.approvalPolicy,
          sandbox: executionPolicy.sandbox
        });
        first = false;
        if (result.aborted) {
          api.logger.debug("[Codex] Turn aborted");
        }
      } catch (error) {
        api.logger.warn("Error in codex session:", error);
        messageBuffer.addMessage("Process exited unexpectedly", "status");
        session.sendSessionEvent({ type: "message", message: "Process exited unexpectedly" });
      } finally {
        permissionHandler.reset();
        reasoningProcessor.abort();
        diffProcessor.reset();
        thinking = false;
        session.keepAlive(thinking, "remote");
        emitReadyIfIdle({
          pending,
          queueSize: () => messageQueue.size(),
          shouldExit,
          sendReady
        });
        logActiveHandles("after-turn");
      }
    }
  } finally {
    api.logger.debug("[codex]: Final cleanup start");
    logActiveHandles("cleanup-start");
    if (reconnectionHandle) {
      api.logger.debug("[codex]: Cancelling offline reconnection");
      reconnectionHandle.cancel();
    }
    try {
      api.logger.debug("[codex]: sendSessionDeath");
      session.sendSessionDeath();
      api.logger.debug("[codex]: flush begin");
      await session.flush();
      api.logger.debug("[codex]: flush done");
      api.logger.debug("[codex]: session.close begin");
      await session.close();
      api.logger.debug("[codex]: session.close done");
    } catch (e) {
      api.logger.debug("[codex]: Error while closing session", e);
    }
    api.logger.debug("[codex]: client.disconnect begin");
    await client.disconnect();
    api.logger.debug("[codex]: client.disconnect done");
    api.logger.debug("[codex]: happyServer.stop");
    happyServer.stop();
    if (process.stdin.isTTY) {
      api.logger.debug("[codex]: setRawMode(false)");
      try {
        process.stdin.setRawMode(false);
      } catch {
      }
    }
    if (hasTTY) {
      api.logger.debug("[codex]: stdin.pause()");
      try {
        process.stdin.pause();
      } catch {
      }
    }
    api.logger.debug("[codex]: clearInterval(keepAlive)");
    clearInterval(keepAliveInterval);
    if (inkInstance) {
      api.logger.debug("[codex]: inkInstance.unmount()");
      inkInstance.unmount();
    }
    messageBuffer.clear();
    logActiveHandles("cleanup-end");
    api.logger.debug("[codex]: Final cleanup completed");
  }
}

function extractCodexResumeFlag(args) {
  const remainingArgs = [];
  let resumeThreadId = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--resume" || arg === "-r") {
      if (resumeThreadId !== null) {
        throw new Error("Codex resume flag can only be provided once.");
      }
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        throw new Error("Codex resume requires a thread ID: happy codex --resume <thread-id>");
      }
      resumeThreadId = nextArg;
      i++;
      continue;
    }
    if (arg.startsWith("--resume=")) {
      if (resumeThreadId !== null) {
        throw new Error("Codex resume flag can only be provided once.");
      }
      const value = arg.slice("--resume=".length).trim();
      if (!value) {
        throw new Error("Codex resume requires a thread ID: happy codex --resume <thread-id>");
      }
      resumeThreadId = value;
      continue;
    }
    remainingArgs.push(arg);
  }
  return {
    resumeThreadId,
    args: remainingArgs
  };
}

async function handleCodexCommand(args) {
  let startedBy = void 0;
  const sandboxArgs = extractNoSandboxFlag(args);
  const codexArgs = extractCodexResumeFlag(sandboxArgs.args);
  for (let i = 0; i < codexArgs.args.length; i++) {
    if (codexArgs.args[i] === "--started-by") {
      startedBy = codexArgs.args[++i];
    }
  }
  const { credentials } = await authAndSetupMachineIfNeeded();
  await ensureDaemonRunning();
  await runCodex({
    credentials,
    startedBy,
    noSandbox: sandboxArgs.noSandbox,
    resumeThreadId: codexArgs.resumeThreadId ?? void 0
  });
}

(async () => {
  const args = process.argv.slice(2);
  if (!args.includes("--version")) {
    api.logger.debug("Starting happy CLI with args: ", process.argv);
  }
  const subcommand = args[0];
  if (!args.includes("--version")) ;
  if (subcommand === "doctor") {
    if (args[1] === "clean") {
      const result = await killRunawayHappyProcesses();
      console.log(`Cleaned up ${result.killed} runaway processes`);
      if (result.errors.length > 0) {
        console.log("Errors:", result.errors);
      }
      process.exit(0);
    }
    await runDoctorCommand();
    return;
  } else if (subcommand === "auth") {
    try {
      await handleAuthCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "connect") {
    try {
      await handleConnectCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "sandbox") {
    try {
      await handleSandboxCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "bye") {
    console.log("Bye!");
    process.exit(0);
  } else if (subcommand === "resume") {
    try {
      await handleResumeCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "codex") {
    try {
      await handleCodexCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "gemini") {
    const geminiSubcommand = args[1];
    if (geminiSubcommand === "model" && args[2] === "set" && args[3]) {
      const modelName = args[3];
      const validModels = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
      if (!validModels.includes(modelName)) {
        console.error(`Invalid model: ${modelName}`);
        console.error(`Available models: ${validModels.join(", ")}`);
        process.exit(1);
      }
      try {
        const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("fs");
        const { join } = require("path");
        const { homedir } = require("os");
        const configDir = join(homedir(), ".gemini");
        const configPath = join(configDir, "config.json");
        if (!existsSync(configDir)) {
          mkdirSync(configDir, { recursive: true });
        }
        let config = {};
        if (existsSync(configPath)) {
          try {
            config = JSON.parse(readFileSync(configPath, "utf-8"));
          } catch (error) {
            config = {};
          }
        }
        config.model = modelName;
        writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
        console.log(`\u2713 Model set to: ${modelName}`);
        console.log(`  Config saved to: ${configPath}`);
        console.log(`  This model will be used in future sessions.`);
        process.exit(0);
      } catch (error) {
        console.error("Failed to save model configuration:", error);
        process.exit(1);
      }
    }
    if (geminiSubcommand === "model" && args[2] === "get") {
      try {
        const { existsSync, readFileSync } = require("fs");
        const { join } = require("path");
        const { homedir } = require("os");
        const configPaths = [
          join(homedir(), ".gemini", "config.json"),
          join(homedir(), ".config", "gemini", "config.json")
        ];
        let model = null;
        for (const configPath of configPaths) {
          if (existsSync(configPath)) {
            try {
              const config = JSON.parse(readFileSync(configPath, "utf-8"));
              model = config.model || config.GEMINI_MODEL || null;
              if (model) break;
            } catch (error) {
            }
          }
        }
        if (model) {
          console.log(`Current model: ${model}`);
        } else if (process.env.GEMINI_MODEL) {
          console.log(`Current model: ${process.env.GEMINI_MODEL} (from GEMINI_MODEL env var)`);
        } else {
          console.log("Current model: gemini-2.5-pro (default)");
        }
        process.exit(0);
      } catch (error) {
        console.error("Failed to read model configuration:", error);
        process.exit(1);
      }
    }
    if (geminiSubcommand === "project" && args[2] === "set" && args[3]) {
      const projectId = args[3];
      try {
        const { saveGoogleCloudProjectToConfig } = await Promise.resolve().then(function () { return require('./config-BDfe4Aex.cjs'); });
        const { readCredentials: readCredentials2 } = await Promise.resolve().then(function () { return require('./persistence-CoLu_Clg.cjs'); });
        const { ApiClient: ApiClient2 } = await Promise.resolve().then(function () { return require('./types-DB662inl.cjs'); }).then(function (n) { return n.api; });
        let userEmail = void 0;
        try {
          const credentials = await readCredentials2();
          if (credentials) {
            const api = await ApiClient2.create(credentials);
            const vendorToken = await api.getVendorToken("gemini");
            if (vendorToken?.oauth?.id_token) {
              const parts = vendorToken.oauth.id_token.split(".");
              if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
                userEmail = payload.email;
              }
            }
          }
        } catch {
        }
        saveGoogleCloudProjectToConfig(projectId, userEmail);
        console.log(`\u2713 Google Cloud Project set to: ${projectId}`);
        if (userEmail) {
          console.log(`  Linked to account: ${userEmail}`);
        }
        console.log(`  This project will be used for Google Workspace accounts.`);
        process.exit(0);
      } catch (error) {
        console.error("Failed to save project configuration:", error);
        process.exit(1);
      }
    }
    if (geminiSubcommand === "project" && args[2] === "get") {
      try {
        const { readGeminiLocalConfig } = await Promise.resolve().then(function () { return require('./config-BDfe4Aex.cjs'); });
        const config = readGeminiLocalConfig();
        if (config.googleCloudProject) {
          console.log(`Current Google Cloud Project: ${config.googleCloudProject}`);
          if (config.googleCloudProjectEmail) {
            console.log(`  Linked to account: ${config.googleCloudProjectEmail}`);
          } else {
            console.log(`  Applies to: all accounts (global)`);
          }
        } else if (process.env.GOOGLE_CLOUD_PROJECT) {
          console.log(`Current Google Cloud Project: ${process.env.GOOGLE_CLOUD_PROJECT} (from env var)`);
        } else {
          console.log("No Google Cloud Project configured.");
          console.log("");
          console.log('If you see "Authentication required" error, you may need to set a project:');
          console.log("  happy gemini project set <your-project-id>");
          console.log("");
          console.log("This is required for Google Workspace accounts.");
          console.log("Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca");
        }
        process.exit(0);
      } catch (error) {
        console.error("Failed to read project configuration:", error);
        process.exit(1);
      }
    }
    if (geminiSubcommand === "project" && !args[2]) {
      console.log("Usage: happy gemini project <command>");
      console.log("");
      console.log("Commands:");
      console.log("  set <project-id>   Set Google Cloud Project ID");
      console.log("  get                Show current Google Cloud Project ID");
      console.log("");
      console.log("Google Workspace accounts require a Google Cloud Project.");
      console.log('If you see "Authentication required" error, set your project ID.');
      console.log("");
      console.log("Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca");
      process.exit(0);
    }
    try {
      const { runGemini } = await Promise.resolve().then(function () { return require('./runGemini-d_cq7agq.cjs'); });
      let startedBy = void 0;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--started-by") {
          startedBy = args[++i];
        }
      }
      const {
        credentials
      } = await authAndSetupMachineIfNeeded();
      await ensureDaemonRunning();
      await runGemini({ credentials, startedBy });
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "acp") {
    try {
      const { runAcp, resolveAcpAgentConfig } = await Promise.resolve().then(function () { return require('./index-DoruhU6E.cjs'); });
      let startedBy = void 0;
      let verbose = false;
      const acpArgs = [];
      let customCommandMode = false;
      for (let i = 1; i < args.length; i++) {
        if (!customCommandMode && args[i] === "--started-by") {
          startedBy = args[++i];
          continue;
        }
        if (!customCommandMode && args[i] === "--verbose") {
          verbose = true;
          continue;
        }
        if (args[i] === "--") {
          customCommandMode = true;
        }
        acpArgs.push(args[i]);
      }
      const resolved = resolveAcpAgentConfig(acpArgs);
      const { credentials } = await authAndSetupMachineIfNeeded();
      await ensureDaemonRunning();
      await runAcp({
        credentials,
        startedBy,
        verbose,
        agentName: resolved.agentName,
        command: resolved.command,
        args: resolved.args
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "openclaw") {
    try {
      const { runOpenClaw } = await Promise.resolve().then(function () { return require('./runOpenClaw-CRV7FzCO.cjs'); });
      let startedBy = void 0;
      let verbose = false;
      let gatewayUrl;
      let gatewayToken;
      let gatewayPassword;
      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--started-by") {
          startedBy = args[++i];
        } else if (args[i] === "--verbose") {
          verbose = true;
        } else if (args[i] === "--gateway-url") {
          gatewayUrl = args[++i];
        } else if (args[i] === "--gateway-token") {
          gatewayToken = args[++i];
        } else if (args[i] === "--gateway-password") {
          gatewayPassword = args[++i];
        }
      }
      const { credentials } = await authAndSetupMachineIfNeeded();
      await ensureDaemonRunning();
      await runOpenClaw({
        credentials,
        startedBy,
        verbose,
        gatewayUrl,
        gatewayToken,
        gatewayPassword
      });
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "logout") {
    console.log(chalk.yellow('Note: "happy logout" is deprecated. Use "happy auth logout" instead.\n'));
    try {
      await handleAuthCommand(["logout"]);
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "notify") {
    try {
      await handleNotifyCommand(args.slice(1));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
    return;
  } else if (subcommand === "daemon") {
    const daemonSubcommand = args[1];
    if (daemonSubcommand === "list") {
      try {
        const sessions = await listDaemonSessions();
        if (sessions.length === 0) {
          console.log("No active sessions this daemon is aware of (they might have been started by a previous version of the daemon)");
        } else {
          console.log("Active sessions:");
          console.log(JSON.stringify(sessions, null, 2));
        }
      } catch (error) {
        console.log("No daemon running");
      }
      return;
    } else if (daemonSubcommand === "stop-session") {
      const sessionId = args[2];
      if (!sessionId) {
        console.error("Session ID required");
        process.exit(1);
      }
      try {
        const success = await stopDaemonSession(sessionId);
        console.log(success ? "Session stopped" : "Failed to stop session");
      } catch (error) {
        console.log("No daemon running");
      }
      return;
    } else if (daemonSubcommand === "start") {
      const child = spawnHappyCLI(["daemon", "start-sync"], {
        detached: true,
        stdio: "ignore",
        env: process.env
      });
      child.unref();
      let started = false;
      for (let i = 0; i < 50; i++) {
        if (await checkIfDaemonRunningAndCleanupStaleState()) {
          started = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (started) {
        console.log("Daemon started successfully");
      } else {
        console.error("Failed to start daemon");
        process.exit(1);
      }
      process.exit(0);
    } else if (daemonSubcommand === "start-sync") {
      await startDaemon();
      process.exit(0);
    } else if (daemonSubcommand === "stop") {
      await stopDaemon();
      process.exit(0);
    } else if (daemonSubcommand === "status") {
      await runDoctorDaemon();
      process.exit(0);
    } else if (daemonSubcommand === "logs") {
      const latest = await api.getLatestDaemonLog();
      if (!latest) {
        console.log("No daemon logs found");
      } else {
        console.log(latest.path);
      }
      process.exit(0);
    } else if (daemonSubcommand === "install") {
      try {
        await install();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
        process.exit(1);
      }
    } else if (daemonSubcommand === "uninstall") {
      try {
        await uninstall();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
        process.exit(1);
      }
    } else {
      console.log(`
${chalk.bold("happy daemon")} - Daemon management

${chalk.bold("Usage:")}
  happy daemon start              Start the daemon (detached)
  happy daemon stop               Stop the daemon (sessions stay alive)
  happy daemon status             Show daemon status
  happy daemon list               List active sessions

  If you want to kill all happy related processes run 
  ${chalk.cyan("happy doctor clean")}

${chalk.bold("Note:")} The daemon runs in the background and manages Claude sessions.

${chalk.bold("To clean up runaway processes:")} Use ${chalk.cyan("happy doctor clean")}
`);
    }
    return;
  } else {
    if (args.length > 0 && args[0] === "claude") {
      args.shift();
    }
    const options = {};
    let showHelp = false;
    let showVersion = false;
    let chromeOverride = void 0;
    const unknownArgs = [];
    const parsedSandboxFlag = extractNoSandboxFlag(args);
    options.noSandbox = parsedSandboxFlag.noSandbox;
    args.length = 0;
    args.push(...parsedSandboxFlag.args);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "-h" || arg === "--help") {
        showHelp = true;
        unknownArgs.push(arg);
      } else if (arg === "-v" || arg === "--version") {
        showVersion = true;
        unknownArgs.push(arg);
      } else if (arg === "--happy-starting-mode") {
        options.startingMode = z.z.enum(["local", "remote"]).parse(args[++i]);
      } else if (arg === "--yolo") {
        unknownArgs.push("--dangerously-skip-permissions");
      } else if (arg === "--model") {
        options.model = args[++i];
      } else if (arg === "--started-by") {
        options.startedBy = args[++i];
      } else if (arg === "--js-runtime") {
        const runtime = args[++i];
        if (runtime !== "node" && runtime !== "bun") {
          console.error(chalk.red(`Invalid --js-runtime value: ${runtime}. Must be 'node' or 'bun'`));
          process.exit(1);
        }
        options.jsRuntime = runtime;
      } else if (arg === "--claude-env") {
        const envArg = args[++i];
        if (envArg && envArg.includes("=")) {
          const eqIndex = envArg.indexOf("=");
          const key = envArg.substring(0, eqIndex);
          const value = envArg.substring(eqIndex + 1);
          options.claudeEnvVars = options.claudeEnvVars || {};
          options.claudeEnvVars[key] = value;
        } else {
          console.error(chalk.red(`Invalid --claude-env format: ${envArg}. Expected KEY=VALUE`));
          process.exit(1);
        }
      } else if (arg === "--chrome") {
        chromeOverride = true;
      } else if (arg === "--no-chrome") {
        chromeOverride = false;
      } else if (arg === "--settings") {
        const settingsValue = args[++i];
        console.warn(chalk.yellow(`\u26A0\uFE0F  Warning: --settings is used internally by Happy for session tracking.`));
        console.warn(chalk.yellow(`   Your settings file "${settingsValue}" will be ignored.`));
        console.warn(chalk.yellow(`   To configure Claude, edit ~/.claude/settings.json instead.`));
      } else {
        unknownArgs.push(arg);
        if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
          unknownArgs.push(args[++i]);
        }
      }
    }
    if (unknownArgs.length > 0) {
      options.claudeArgs = [...options.claudeArgs || [], ...unknownArgs];
    }
    const settings = await persistence.readSettings();
    const chromeEnabled = chromeOverride ?? settings.chromeMode ?? false;
    if (chromeEnabled) {
      options.claudeArgs = [...options.claudeArgs || [], "--chrome"];
    }
    if (showHelp) {
      console.log(`
${chalk.bold("happy")} - Claude Code On the Go

${chalk.bold("Usage:")}
  happy [options]         Start Claude with mobile control
  happy auth              Manage authentication
  happy resume            Resume a previous Happy session by Happy session ID
  happy codex             Start Codex mode
  happy gemini            Start Gemini mode (ACP)
  happy acp               Start a generic ACP-compatible agent
  happy connect           Connect AI vendor API keys
  happy sandbox           Configure and manage OS-level sandboxing
  happy notify            Send push notification
  happy daemon            Manage background service that allows
                            to spawn new sessions away from your computer
  happy doctor            System diagnostics & troubleshooting

${chalk.bold("Examples:")}
  happy                    Start session
  happy resume cmmij8      Resume a previous session by Happy session ID
  happy --yolo             Start with bypassing permissions
                            happy sugar for --dangerously-skip-permissions
  happy --chrome           Enable Chrome browser access for this session
  happy --no-chrome        Disable Chrome even if default is on
  happy --no-sandbox       Disable Happy sandbox for this session
  happy --js-runtime bun   Use bun instead of node to spawn Claude Code
  happy --claude-env ANTHROPIC_BASE_URL=http://127.0.0.1:3456
                           Use a custom API endpoint (e.g., claude-code-router)
  happy acp gemini         Start Gemini via generic ACP runner
  happy acp -- opencode --acp
                           Start a custom ACP command
  happy acp opencode --verbose
                           Print raw ACP backend/envelope events
  happy auth login --force Authenticate
  happy doctor             Run diagnostics

${chalk.bold("Happy supports ALL Claude options!")}
  Use any claude flag with happy as you would with claude. Our favorite:

  happy --resume

${chalk.gray("\u2500".repeat(60))}
${chalk.bold.cyan("Claude Code Options (from `claude --help`):")}
`);
      try {
        const claudeHelp = node_child_process.execFileSync(claudeCliPath, ["--help"], { encoding: "utf8", windowsHide: true });
        console.log(claudeHelp);
      } catch (e) {
        console.log(chalk.yellow("Could not retrieve claude help. Make sure claude is installed."));
      }
      process.exit(0);
    }
    if (showVersion) {
      console.log(`happy version: ${api.packageJson.version}`);
    }
    const {
      credentials
    } = await authAndSetupMachineIfNeeded();
    await ensureDaemonRunning();
    try {
      await runClaude(credentials, options);
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : "Unknown error");
      if (process.env.DEBUG) {
        console.error(error);
      }
      process.exit(1);
    }
  }
})();
async function handleNotifyCommand(args) {
  let message = "";
  let title = "";
  let showHelp = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-p" && i + 1 < args.length) {
      message = args[++i];
    } else if (arg === "-t" && i + 1 < args.length) {
      title = args[++i];
    } else if (arg === "-h" || arg === "--help") {
      showHelp = true;
    } else {
      console.error(chalk.red(`Unknown argument for notify command: ${arg}`));
      process.exit(1);
    }
  }
  if (showHelp) {
    console.log(`
${chalk.bold("happy notify")} - Send notification

${chalk.bold("Usage:")}
  happy notify -p <message> [-t <title>]    Send notification with custom message and optional title
  happy notify -h, --help                   Show this help

${chalk.bold("Options:")}
  -p <message>    Notification message (required)
  -t <title>      Notification title (optional, defaults to "Happy")

${chalk.bold("Examples:")}
  happy notify -p "Deployment complete!"
  happy notify -p "System update complete" -t "Server Status"
  happy notify -t "Alert" -p "Database connection restored"
`);
    return;
  }
  if (!message) {
    console.error(chalk.red('Error: Message is required. Use -p "your message" to specify the notification text.'));
    console.log(chalk.gray('Run "happy notify --help" for usage information.'));
    process.exit(1);
  }
  let credentials = await persistence.readCredentials();
  if (!credentials) {
    console.error(chalk.red('Error: Not authenticated. Please run "happy auth login" first.'));
    process.exit(1);
  }
  console.log(chalk.blue("\u{1F4F1} Sending push notification..."));
  try {
    const api$1 = await api.ApiClient.create(credentials);
    const notificationTitle = title || "Happy";
    api$1.push().sendToAllDevices(
      notificationTitle,
      message,
      {
        source: "cli",
        timestamp: Date.now()
      }
    );
    console.log(chalk.green("\u2713 Push notification sent successfully!"));
    console.log(chalk.gray(`  Title: ${notificationTitle}`));
    console.log(chalk.gray(`  Message: ${message}`));
    console.log(chalk.gray("  Check your mobile device for the notification."));
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  } catch (error) {
    console.error(chalk.red("\u2717 Failed to send push notification"));
    throw error;
  }
}

exports.BasePermissionHandler = BasePermissionHandler;
exports.BaseReasoningProcessor = BaseReasoningProcessor;
exports.CHANGE_TITLE_INSTRUCTION = CHANGE_TITLE_INSTRUCTION;
exports.DEFAULT_GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
exports.GEMINI_API_KEY_ENV = GEMINI_API_KEY_ENV;
exports.GEMINI_MODEL_ENV = GEMINI_MODEL_ENV;
exports.GOOGLE_API_KEY_ENV = GOOGLE_API_KEY_ENV;
exports.MessageBuffer = MessageBuffer;
exports.MessageQueue2 = MessageQueue2;
exports.createSessionMetadata = createSessionMetadata;
exports.hashObject = hashObject;
exports.initialMachineMetadata = initialMachineMetadata;
exports.notifyDaemonSessionStarted = notifyDaemonSessionStarted;
exports.registerKillSessionHandler = registerKillSessionHandler;
exports.setupOfflineReconnection = setupOfflineReconnection;
exports.startHappyServer = startHappyServer;
