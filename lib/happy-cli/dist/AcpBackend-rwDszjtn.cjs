'use strict';

var node_child_process = require('node:child_process');
var sdk = require('@agentclientprotocol/sdk');
var node_crypto = require('node:crypto');
var api = require('./types-DB662inl.cjs');

const DEFAULT_TIMEOUTS = {
  /** Default initialization timeout: 60 seconds */
  init: 6e4,
  /** Default tool call timeout: 2 minutes */
  toolCall: 12e4,
  /** Think tool timeout: 30 seconds */
  think: 3e4
};
class DefaultTransport {
  agentName;
  constructor(agentName = "generic-acp") {
    this.agentName = agentName;
  }
  /**
   * Default init timeout: 60 seconds
   */
  getInitTimeout() {
    return DEFAULT_TIMEOUTS.init;
  }
  /**
   * Default: pass through all lines that are valid JSON objects/arrays
   */
  filterStdoutLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return null;
    }
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      return line;
    } catch {
      return null;
    }
  }
  /**
   * Default: no special stderr handling
   */
  handleStderr(_text, _context) {
    return { message: null };
  }
  /**
   * Default: no special tool patterns
   */
  getToolPatterns() {
    return [];
  }
  /**
   * Default: no investigation tools
   */
  isInvestigationTool(_toolCallId, _toolKind) {
    return false;
  }
  /**
   * Default tool call timeout based on tool kind
   */
  getToolCallTimeout(_toolCallId, toolKind) {
    if (toolKind === "think") {
      return DEFAULT_TIMEOUTS.think;
    }
    return DEFAULT_TIMEOUTS.toolCall;
  }
  /**
   * Default: no tool name extraction (return null)
   */
  extractToolNameFromId(_toolCallId) {
    return null;
  }
  /**
   * Default: return original tool name (no special detection)
   */
  determineToolName(toolName, _toolCallId, _input, _context) {
    return toolName;
  }
}

const DEFAULT_IDLE_TIMEOUT_MS = 500;
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 12e4;
function parseArgsFromContent(content) {
  if (Array.isArray(content)) {
    return { items: content };
  }
  if (content && typeof content === "object" && content !== null) {
    return content;
  }
  return {};
}
function extractErrorDetail(content) {
  if (!content) return void 0;
  if (typeof content === "string") {
    return content;
  }
  if (typeof content === "object" && content !== null && !Array.isArray(content)) {
    const obj = content;
    if (obj.error) {
      const error = obj.error;
      if (typeof error === "string") return error;
      if (error && typeof error === "object" && "message" in error) {
        const errObj = error;
        if (typeof errObj.message === "string") return errObj.message;
      }
      return JSON.stringify(error);
    }
    if (typeof obj.message === "string") return obj.message;
    const status = typeof obj.status === "string" ? obj.status : void 0;
    const reason = typeof obj.reason === "string" ? obj.reason : void 0;
    return status || reason || JSON.stringify(obj).substring(0, 500);
  }
  return void 0;
}
function formatDuration(startTime) {
  if (!startTime) return "unknown";
  const duration = Date.now() - startTime;
  return `${(duration / 1e3).toFixed(2)}s`;
}
function formatDurationMinutes(startTime) {
  if (!startTime) return "unknown";
  const duration = Date.now() - startTime;
  return (duration / 1e3 / 60).toFixed(2);
}
function handleAgentMessageChunk(update, ctx) {
  const content = update.content;
  if (!content || typeof content !== "object" || !("text" in content)) {
    return { handled: false };
  }
  const text = content.text;
  if (typeof text !== "string") {
    return { handled: false };
  }
  const isThinking = /^\*\*[^*]+\*\*\n/.test(text);
  if (isThinking) {
    ctx.emit({
      type: "event",
      name: "thinking",
      payload: { text, streaming: true }
    });
  } else {
    api.logger.debug(`[AcpBackend] Received message chunk (length: ${text.length}): ${text.substring(0, 50)}...`);
    ctx.emit({
      type: "model-output",
      textDelta: text
    });
    ctx.clearIdleTimeout();
    const idleTimeoutMs = ctx.transport.getIdleTimeout?.() ?? DEFAULT_IDLE_TIMEOUT_MS;
    ctx.setIdleTimeout(() => {
      if (ctx.activeToolCalls.size === 0) {
        api.logger.debug("[AcpBackend] No more chunks received, emitting idle status");
        ctx.emitIdleStatus();
      } else {
        api.logger.debug(`[AcpBackend] Delaying idle status - ${ctx.activeToolCalls.size} active tool calls`);
      }
    }, idleTimeoutMs);
  }
  return { handled: true };
}
function handleAgentThoughtChunk(update, ctx) {
  const content = update.content;
  if (!content || typeof content !== "object" || !("text" in content)) {
    return { handled: false };
  }
  const text = content.text;
  if (typeof text !== "string") {
    return { handled: false };
  }
  if (ctx.activeToolCalls.size > 0) {
    const activeToolCallsList = Array.from(ctx.activeToolCalls);
    api.logger.debug(`[AcpBackend] \u{1F4AD} Thinking chunk received (${text.length} chars) during active tool calls: ${activeToolCallsList.join(", ")}`);
  }
  ctx.emit({
    type: "event",
    name: "thinking",
    payload: { text, streaming: true }
  });
  return { handled: true };
}
function startToolCall(toolCallId, toolKind, update, ctx, source) {
  const startTime = Date.now();
  const toolKindStr = typeof toolKind === "string" ? toolKind : void 0;
  const isInvestigation = ctx.transport.isInvestigationTool?.(toolCallId, toolKindStr) ?? false;
  const extractedName = ctx.transport.extractToolNameFromId?.(toolCallId);
  const realToolName = extractedName ?? (toolKindStr || "unknown");
  ctx.toolCallIdToNameMap.set(toolCallId, realToolName);
  ctx.activeToolCalls.add(toolCallId);
  ctx.toolCallStartTimes.set(toolCallId, startTime);
  api.logger.debug(`[AcpBackend] \u23F1\uFE0F Set startTime for ${toolCallId} at ${new Date(startTime).toISOString()} (from ${source})`);
  api.logger.debug(`[AcpBackend] \u{1F527} Tool call START: ${toolCallId} (${toolKind} -> ${realToolName})${isInvestigation ? " [INVESTIGATION TOOL]" : ""}`);
  if (isInvestigation) {
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool detected - extended timeout (10min) will be used`);
  }
  const timeoutMs = ctx.transport.getToolCallTimeout?.(toolCallId, toolKindStr) ?? DEFAULT_TOOL_CALL_TIMEOUT_MS;
  if (!ctx.toolCallTimeouts.has(toolCallId)) {
    const timeout = setTimeout(() => {
      const duration = formatDuration(ctx.toolCallStartTimes.get(toolCallId));
      api.logger.debug(`[AcpBackend] \u23F1\uFE0F Tool call TIMEOUT (from ${source}): ${toolCallId} (${toolKind}) after ${(timeoutMs / 1e3).toFixed(0)}s - Duration: ${duration}, removing from active set`);
      ctx.activeToolCalls.delete(toolCallId);
      ctx.toolCallStartTimes.delete(toolCallId);
      ctx.toolCallTimeouts.delete(toolCallId);
      if (ctx.activeToolCalls.size === 0) {
        api.logger.debug("[AcpBackend] No more active tool calls after timeout, emitting idle status");
        ctx.emitIdleStatus();
      }
    }, timeoutMs);
    ctx.toolCallTimeouts.set(toolCallId, timeout);
    api.logger.debug(`[AcpBackend] \u23F1\uFE0F Set timeout for ${toolCallId}: ${(timeoutMs / 1e3).toFixed(0)}s${isInvestigation ? " (investigation tool)" : ""}`);
  } else {
    api.logger.debug(`[AcpBackend] Timeout already set for ${toolCallId}, skipping`);
  }
  ctx.clearIdleTimeout();
  ctx.emit({ type: "status", status: "running" });
  const args = parseArgsFromContent(update.content);
  if (update.locations && Array.isArray(update.locations)) {
    args.locations = update.locations;
  }
  if (isInvestigation && args.objective) {
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool objective: ${String(args.objective).substring(0, 100)}...`);
  }
  ctx.emit({
    type: "tool-call",
    toolName: toolKindStr || "unknown",
    args,
    callId: toolCallId
  });
}
function completeToolCall(toolCallId, toolKind, content, ctx) {
  const startTime = ctx.toolCallStartTimes.get(toolCallId);
  const duration = formatDuration(startTime);
  const toolKindStr = typeof toolKind === "string" ? toolKind : "unknown";
  ctx.activeToolCalls.delete(toolCallId);
  ctx.toolCallStartTimes.delete(toolCallId);
  const timeout = ctx.toolCallTimeouts.get(toolCallId);
  if (timeout) {
    clearTimeout(timeout);
    ctx.toolCallTimeouts.delete(toolCallId);
  }
  api.logger.debug(`[AcpBackend] \u2705 Tool call COMPLETED: ${toolCallId} (${toolKindStr}) - Duration: ${duration}. Active tool calls: ${ctx.activeToolCalls.size}`);
  ctx.emit({
    type: "tool-result",
    toolName: toolKindStr,
    result: content,
    callId: toolCallId
  });
  if (ctx.activeToolCalls.size === 0) {
    ctx.clearIdleTimeout();
    api.logger.debug("[AcpBackend] All tool calls completed, emitting idle status");
    ctx.emitIdleStatus();
  }
}
function failToolCall(toolCallId, status, toolKind, content, ctx) {
  const startTime = ctx.toolCallStartTimes.get(toolCallId);
  const duration = startTime ? Date.now() - startTime : null;
  const toolKindStr = typeof toolKind === "string" ? toolKind : "unknown";
  const isInvestigation = ctx.transport.isInvestigationTool?.(toolCallId, toolKindStr) ?? false;
  const hadTimeout = ctx.toolCallTimeouts.has(toolCallId);
  if (isInvestigation) {
    const durationStr2 = formatDuration(startTime);
    const durationMinutes = formatDurationMinutes(startTime);
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool ${status.toUpperCase()} after ${durationMinutes} minutes (${durationStr2})`);
    if (duration) {
      const threeMinutes = 3 * 60 * 1e3;
      const tolerance = 5e3;
      if (Math.abs(duration - threeMinutes) < tolerance) {
        api.logger.debug(`[AcpBackend] \u{1F50D} \u26A0\uFE0F Investigation tool failed at ~3 minutes - likely Gemini CLI timeout, not our timeout`);
      }
    }
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool FAILED - full content:`, JSON.stringify(content, null, 2));
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool timeout status BEFORE cleanup: ${hadTimeout ? "timeout was set" : "no timeout was set"}`);
    api.logger.debug(`[AcpBackend] \u{1F50D} Investigation tool startTime status BEFORE cleanup: ${startTime ? `set at ${new Date(startTime).toISOString()}` : "not set"}`);
  }
  ctx.activeToolCalls.delete(toolCallId);
  ctx.toolCallStartTimes.delete(toolCallId);
  const timeout = ctx.toolCallTimeouts.get(toolCallId);
  if (timeout) {
    clearTimeout(timeout);
    ctx.toolCallTimeouts.delete(toolCallId);
    api.logger.debug(`[AcpBackend] Cleared timeout for ${toolCallId} (tool call ${status})`);
  } else {
    api.logger.debug(`[AcpBackend] No timeout found for ${toolCallId} (tool call ${status}) - timeout may not have been set`);
  }
  const durationStr = formatDuration(startTime);
  api.logger.debug(`[AcpBackend] \u274C Tool call ${status.toUpperCase()}: ${toolCallId} (${toolKindStr}) - Duration: ${durationStr}. Active tool calls: ${ctx.activeToolCalls.size}`);
  const errorDetail = extractErrorDetail(content);
  if (errorDetail) {
    api.logger.debug(`[AcpBackend] \u274C Tool call error details: ${errorDetail.substring(0, 500)}`);
  } else {
    api.logger.debug(`[AcpBackend] \u274C Tool call ${status} but no error details in content`);
  }
  ctx.emit({
    type: "tool-result",
    toolName: toolKindStr,
    result: errorDetail ? { error: errorDetail, status } : { error: `Tool call ${status}`, status },
    callId: toolCallId
  });
  if (ctx.activeToolCalls.size === 0) {
    ctx.clearIdleTimeout();
    api.logger.debug("[AcpBackend] All tool calls completed/failed, emitting idle status");
    ctx.emitIdleStatus();
  }
}
function handleToolCallUpdate(update, ctx) {
  const status = update.status;
  const toolCallId = update.toolCallId;
  if (!toolCallId) {
    api.logger.debug("[AcpBackend] Tool call update without toolCallId:", update);
    return { handled: false };
  }
  const toolKind = update.kind || "unknown";
  let toolCallCountSincePrompt = ctx.toolCallCountSincePrompt;
  if (status === "in_progress" || status === "pending") {
    if (!ctx.activeToolCalls.has(toolCallId)) {
      toolCallCountSincePrompt++;
      startToolCall(toolCallId, toolKind, update, ctx, "tool_call_update");
    } else {
      api.logger.debug(`[AcpBackend] Tool call ${toolCallId} already tracked, status: ${status}`);
    }
  } else if (status === "completed") {
    completeToolCall(toolCallId, toolKind, update.content, ctx);
  } else if (status === "failed" || status === "cancelled") {
    failToolCall(toolCallId, status, toolKind, update.content, ctx);
  }
  return { handled: true, toolCallCountSincePrompt };
}
function handleToolCall(update, ctx) {
  const toolCallId = update.toolCallId;
  const status = update.status;
  api.logger.debug(`[AcpBackend] Received tool_call: toolCallId=${toolCallId}, status=${status}, kind=${update.kind}`);
  const isInProgress = !status || status === "in_progress" || status === "pending";
  if (!toolCallId || !isInProgress) {
    api.logger.debug(`[AcpBackend] Tool call ${toolCallId} not in progress (status: ${status}), skipping`);
    return { handled: false };
  }
  if (ctx.activeToolCalls.has(toolCallId)) {
    api.logger.debug(`[AcpBackend] Tool call ${toolCallId} already in active set, skipping`);
    return { handled: true };
  }
  startToolCall(toolCallId, update.kind, update, ctx, "tool_call");
  return { handled: true };
}
function handleLegacyMessageChunk(update, ctx) {
  if (!update.messageChunk) {
    return { handled: false };
  }
  const chunk = update.messageChunk;
  if (chunk.textDelta) {
    ctx.emit({
      type: "model-output",
      textDelta: chunk.textDelta
    });
    return { handled: true };
  }
  return { handled: false };
}
function handlePlanUpdate(update, ctx) {
  if (!update.plan) {
    return { handled: false };
  }
  ctx.emit({
    type: "event",
    name: "plan",
    payload: update.plan
  });
  return { handled: true };
}
function handleThinkingUpdate(update, ctx) {
  if (!update.thinking) {
    return { handled: false };
  }
  ctx.emit({
    type: "event",
    name: "thinking",
    payload: update.thinking
  });
  return { handled: true };
}

const RETRY_CONFIG = {
  /** Maximum number of retry attempts for init/newSession */
  maxAttempts: 3,
  /** Base delay between retries in ms */
  baseDelayMs: 1e3,
  /** Maximum delay between retries in ms */
  maxDelayMs: 5e3
};
const ACP_MUTED_COLOR = "\x1B[90m";
const ACP_COLOR_RESET = "\x1B[0m";
function formatAcpTime(date = /* @__PURE__ */ new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
function logAcpBackendMuted(message) {
  const line = `[${formatAcpTime()}] ${message}`;
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor === "0") {
    console.log(line);
    return;
  }
  const useColor = forceColor !== void 0 || process.stdout.isTTY === true || process.stderr.isTTY === true;
  if (useColor) {
    console.log(`${ACP_MUTED_COLOR}${line}${ACP_COLOR_RESET}`);
    return;
  }
  console.log(line);
}
function summarizeSessionMetadataPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "invalid payload";
  }
  const asRecord = payload;
  const configOptions = Array.isArray(asRecord.configOptions) ? asRecord.configOptions.length : 0;
  const modes = asRecord.modes && typeof asRecord.modes === "object" ? Array.isArray(asRecord.modes.availableModes) ? asRecord.modes.availableModes.length : 0 : 0;
  const models = asRecord.models && typeof asRecord.models === "object" ? Array.isArray(asRecord.models.availableModels) ? asRecord.models.availableModels.length : 0 : 0;
  return `configOptions=${configOptions} modes=${modes} models=${models}`;
}
function nodeToWebStreams(stdin, stdout) {
  const writable = new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        const ok = stdin.write(chunk, (err) => {
          if (err) {
            api.logger.debug(`[AcpBackend] Error writing to stdin:`, err);
            reject(err);
          }
        });
        if (ok) {
          resolve();
        } else {
          stdin.once("drain", resolve);
        }
      });
    },
    close() {
      return new Promise((resolve) => {
        stdin.end(resolve);
      });
    },
    abort(reason) {
      stdin.destroy(reason instanceof Error ? reason : new Error(String(reason)));
    }
  });
  const readable = new ReadableStream({
    start(controller) {
      stdout.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      stdout.on("end", () => {
        controller.close();
      });
      stdout.on("error", (err) => {
        api.logger.debug(`[AcpBackend] Stdout error:`, err);
        controller.error(err);
      });
    },
    cancel() {
      stdout.destroy();
    }
  });
  return { writable, readable };
}
async function withRetry(operation, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const shouldRetry = options.shouldRetry ? options.shouldRetry(lastError) : true;
      if (attempt < options.maxAttempts && shouldRetry) {
        const delayMs = Math.min(
          options.baseDelayMs * Math.pow(2, attempt - 1),
          options.maxDelayMs
        );
        api.logger.debug(`[AcpBackend] ${options.operationName} failed (attempt ${attempt}/${options.maxAttempts}): ${lastError.message}. Retrying in ${delayMs}ms...`);
        options.onRetry?.(attempt, lastError);
        await api.delay(delayMs);
      } else {
        break;
      }
    }
  }
  throw lastError;
}
class AcpBackend {
  constructor(options) {
    this.options = options;
    this.transport = options.transportHandler ?? new DefaultTransport(options.agentName);
  }
  listeners = [];
  process = null;
  connection = null;
  acpSessionId = null;
  disposed = false;
  /** Track active tool calls to prevent duplicate events */
  activeToolCalls = /* @__PURE__ */ new Set();
  toolCallTimeouts = /* @__PURE__ */ new Map();
  /** Track tool call start times for performance monitoring */
  toolCallStartTimes = /* @__PURE__ */ new Map();
  /** Pending permission requests that need response */
  pendingPermissions = /* @__PURE__ */ new Map();
  /** Map from permission request ID to real tool call ID for tracking */
  permissionToToolCallMap = /* @__PURE__ */ new Map();
  /** Map from real tool call ID to tool name for auto-approval */
  toolCallIdToNameMap = /* @__PURE__ */ new Map();
  /** Track if we just sent a prompt with change_title instruction */
  recentPromptHadChangeTitle = false;
  /** Track tool calls count since last prompt (to identify first tool call) */
  toolCallCountSincePrompt = 0;
  /** Timeout for emitting 'idle' status after last message chunk */
  idleTimeout = null;
  /** Transport handler for agent-specific behavior */
  transport;
  onMessage(handler) {
    this.listeners.push(handler);
  }
  offMessage(handler) {
    const index = this.listeners.indexOf(handler);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }
  emit(msg) {
    if (this.disposed) return;
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (error) {
        api.logger.warn("[AcpBackend] Error in message handler:", error);
      }
    }
  }
  async startSession(initialPrompt) {
    if (this.disposed) {
      throw new Error("Backend has been disposed");
    }
    const sessionId = node_crypto.randomUUID();
    this.emit({ type: "status", status: "starting" });
    let startupStatusErrorEmitted = false;
    try {
      api.logger.debug(`[AcpBackend] Starting session: ${sessionId}`);
      const args = this.options.args || [];
      if (process.platform === "win32") {
        const fullCommand = [this.options.command, ...args].join(" ");
        this.process = node_child_process.spawn("cmd.exe", ["/c", fullCommand], {
          cwd: this.options.cwd,
          env: { ...process.env, ...this.options.env },
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true
        });
      } else {
        this.process = node_child_process.spawn(this.options.command, args, {
          cwd: this.options.cwd,
          env: { ...process.env, ...this.options.env },
          // Use 'pipe' for all stdio to capture output without printing to console
          // stdout and stderr will be handled by our event listeners
          stdio: ["pipe", "pipe", "pipe"]
        });
      }
      if (this.process.stderr) {
      }
      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        throw new Error("Failed to create stdio pipes");
      }
      let startupFailure = null;
      let startupFailureSettled = false;
      let rejectStartupFailure = null;
      const startupFailurePromise = new Promise((_, reject) => {
        rejectStartupFailure = (error) => {
          if (startupFailureSettled) {
            return;
          }
          startupFailureSettled = true;
          startupFailure = error;
          reject(error);
        };
      });
      const signalStartupFailure = (error) => {
        rejectStartupFailure?.(error);
      };
      this.process.stderr.on("data", (data) => {
        const text = data.toString();
        if (!text.trim()) return;
        const hasActiveInvestigation = this.transport.isInvestigationTool ? Array.from(this.activeToolCalls).some((id) => this.transport.isInvestigationTool(id)) : false;
        const context = {
          activeToolCalls: this.activeToolCalls,
          hasActiveInvestigation
        };
        if (hasActiveInvestigation) {
          api.logger.debug(`[AcpBackend] \u{1F50D} Agent stderr (during investigation): ${text.trim()}`);
        } else {
          api.logger.debug(`[AcpBackend] Agent stderr: ${text.trim()}`);
        }
        if (this.transport.handleStderr) {
          const result = this.transport.handleStderr(text, context);
          if (result.message) {
            this.emit(result.message);
          }
        }
      });
      this.process.on("error", (err) => {
        signalStartupFailure(err);
        api.logger.debug(`[AcpBackend] Process error:`, err);
        startupStatusErrorEmitted = true;
        this.emit({ type: "status", status: "error", detail: err.message });
      });
      this.process.on("exit", (code, signal) => {
        if (!this.disposed && code !== 0 && code !== null) {
          signalStartupFailure(new Error(`Exit code: ${code}`));
          api.logger.debug(`[AcpBackend] Process exited with code ${code}, signal ${signal}`);
          this.emit({ type: "status", status: "stopped", detail: `Exit code: ${code}` });
        }
      });
      const streams = nodeToWebStreams(
        this.process.stdin,
        this.process.stdout
      );
      const writable = streams.writable;
      const readable = streams.readable;
      const transport = this.transport;
      const filteredReadable = new ReadableStream({
        async start(controller) {
          const reader = readable.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let buffer = "";
          let filteredCount = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                if (buffer.trim()) {
                  const filtered = transport.filterStdoutLine?.(buffer);
                  if (filtered === void 0) {
                    controller.enqueue(encoder.encode(buffer));
                  } else if (filtered !== null) {
                    controller.enqueue(encoder.encode(filtered));
                  } else {
                    filteredCount++;
                  }
                }
                if (filteredCount > 0) {
                  api.logger.debug(`[AcpBackend] Filtered out ${filteredCount} non-JSON lines from ${transport.agentName} stdout`);
                }
                controller.close();
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.trim()) continue;
                const filtered = transport.filterStdoutLine?.(line);
                if (filtered === void 0) {
                  controller.enqueue(encoder.encode(line + "\n"));
                } else if (filtered !== null) {
                  controller.enqueue(encoder.encode(filtered + "\n"));
                } else {
                  filteredCount++;
                }
              }
            }
          } catch (error) {
            api.logger.debug(`[AcpBackend] Error filtering stdout stream:`, error);
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        }
      });
      const stream = sdk.ndJsonStream(writable, filteredReadable);
      const client = {
        sessionUpdate: async (params) => {
          this.handleSessionUpdate(params);
        },
        requestPermission: async (params) => {
          const extendedParams = params;
          const toolCall = extendedParams.toolCall;
          let toolName = toolCall?.kind || toolCall?.toolName || extendedParams.kind || "Unknown tool";
          const toolCallId = toolCall?.id || node_crypto.randomUUID();
          const permissionId = toolCallId;
          let input = {};
          if (toolCall) {
            input = toolCall.input || toolCall.arguments || toolCall.content || {};
          } else {
            input = extendedParams.input || extendedParams.arguments || extendedParams.content || {};
          }
          const context = {
            recentPromptHadChangeTitle: this.recentPromptHadChangeTitle,
            toolCallCountSincePrompt: this.toolCallCountSincePrompt
          };
          toolName = this.transport.determineToolName?.(toolName, toolCallId, input, context) ?? toolName;
          if (toolName !== (toolCall?.kind || toolCall?.toolName || extendedParams.kind || "Unknown tool")) {
            api.logger.debug(`[AcpBackend] Detected tool name: ${toolName} from toolCallId: ${toolCallId}`);
          }
          this.toolCallCountSincePrompt++;
          const options = extendedParams.options || [];
          api.logger.debug(`[AcpBackend] Permission request: tool=${toolName}, toolCallId=${toolCallId}, input=`, JSON.stringify(input));
          api.logger.debug(`[AcpBackend] Permission request params structure:`, JSON.stringify({
            hasToolCall: !!toolCall,
            toolCallKind: toolCall?.kind,
            toolCallId: toolCall?.id,
            paramsKind: extendedParams.kind,
            paramsKeys: Object.keys(params)
          }, null, 2));
          this.emit({
            type: "permission-request",
            id: permissionId,
            reason: toolName,
            payload: {
              ...params,
              permissionId,
              toolCallId,
              toolName,
              input,
              options: options.map((opt) => ({
                id: opt.optionId,
                name: opt.name,
                kind: opt.kind
              }))
            }
          });
          if (this.options.permissionHandler) {
            try {
              const result = await this.options.permissionHandler.handleToolCall(
                toolCallId,
                toolName,
                input
              );
              let optionId = "cancel";
              if (result.decision === "approved" || result.decision === "approved_for_session") {
                const proceedOnceOption2 = options.find(
                  (opt) => opt.optionId === "proceed_once" || opt.name?.toLowerCase().includes("once")
                );
                const proceedAlwaysOption = options.find(
                  (opt) => opt.optionId === "proceed_always" || opt.name?.toLowerCase().includes("always")
                );
                if (result.decision === "approved_for_session" && proceedAlwaysOption) {
                  optionId = proceedAlwaysOption.optionId || "proceed_always";
                } else if (proceedOnceOption2) {
                  optionId = proceedOnceOption2.optionId || "proceed_once";
                } else if (options.length > 0) {
                  optionId = options[0].optionId || "proceed_once";
                }
                this.emit({
                  type: "tool-result",
                  toolName,
                  result: { status: "approved", decision: result.decision },
                  callId: permissionId
                });
              } else {
                const cancelOption = options.find(
                  (opt) => opt.optionId === "cancel" || opt.name?.toLowerCase().includes("cancel")
                );
                if (cancelOption) {
                  optionId = cancelOption.optionId || "cancel";
                }
                this.emit({
                  type: "tool-result",
                  toolName,
                  result: { status: "denied", decision: result.decision },
                  callId: permissionId
                });
              }
              return { outcome: { outcome: "selected", optionId } };
            } catch (error) {
              api.logger.debug("[AcpBackend] Error in permission handler:", error);
              return { outcome: { outcome: "selected", optionId: "cancel" } };
            }
          }
          const proceedOnceOption = options.find(
            (opt) => opt.optionId === "proceed_once" || typeof opt.name === "string" && opt.name.toLowerCase().includes("once")
          );
          const defaultOptionId = proceedOnceOption?.optionId || (options.length > 0 && options[0].optionId ? options[0].optionId : "proceed_once");
          return { outcome: { outcome: "selected", optionId: defaultOptionId } };
        }
      };
      this.connection = new sdk.ClientSideConnection(
        (agent) => client,
        stream
      );
      const initRequest = {
        protocolVersion: 1,
        clientCapabilities: {
          fs: {
            readTextFile: false,
            writeTextFile: false
          }
        },
        clientInfo: {
          name: "happy-cli",
          version: api.packageJson.version
        }
      };
      const initTimeout = this.transport.getInitTimeout();
      api.logger.debug(`[AcpBackend] Initializing connection (timeout: ${initTimeout}ms)...`);
      const isNonRetryableStartupError = (error) => {
        const maybeErr = error;
        if (startupFailure && error === startupFailure) {
          return true;
        }
        return maybeErr.code === "ENOENT" || maybeErr.code === "EACCES" || maybeErr.code === "EPIPE";
      };
      const initializeResponse = await withRetry(
        async () => {
          let timeoutHandle = null;
          try {
            const result = await Promise.race([
              startupFailurePromise,
              this.connection.initialize(initRequest).then((res) => {
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }
                return res;
              }),
              new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(new Error(`Initialize timeout after ${initTimeout}ms - ${this.transport.agentName} did not respond`));
                }, initTimeout);
              })
            ]);
            return result;
          } finally {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          }
        },
        {
          operationName: "Initialize",
          maxAttempts: RETRY_CONFIG.maxAttempts,
          baseDelayMs: RETRY_CONFIG.baseDelayMs,
          maxDelayMs: RETRY_CONFIG.maxDelayMs,
          shouldRetry: (error) => !isNonRetryableStartupError(error)
        }
      );
      api.logger.debug(`[AcpBackend] Initialize completed`);
      if (this.options.verbose) {
        logAcpBackendMuted(
          `Incoming initialize response from ${this.options.agentName}: ${summarizeSessionMetadataPayload(initializeResponse)}`
        );
      }
      const mcpServers = this.options.mcpServers ? Object.entries(this.options.mcpServers).map(([name, config]) => ({
        name,
        command: config.command,
        args: config.args || [],
        env: config.env ? Object.entries(config.env).map(([envName, envValue]) => ({ name: envName, value: envValue })) : []
      })) : [];
      const newSessionRequest = {
        cwd: this.options.cwd,
        mcpServers
      };
      api.logger.debug(`[AcpBackend] Creating new session...`);
      const sessionResponse = await withRetry(
        async () => {
          let timeoutHandle = null;
          try {
            const result = await Promise.race([
              startupFailurePromise,
              this.connection.newSession(newSessionRequest).then((res) => {
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }
                return res;
              }),
              new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(new Error(`New session timeout after ${initTimeout}ms - ${this.transport.agentName} did not respond`));
                }, initTimeout);
              })
            ]);
            return result;
          } finally {
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
          }
        },
        {
          operationName: "NewSession",
          maxAttempts: RETRY_CONFIG.maxAttempts,
          baseDelayMs: RETRY_CONFIG.baseDelayMs,
          maxDelayMs: RETRY_CONFIG.maxDelayMs,
          shouldRetry: (error) => !isNonRetryableStartupError(error)
        }
      );
      this.acpSessionId = sessionResponse.sessionId;
      api.logger.debug(`[AcpBackend] Session created: ${this.acpSessionId}`);
      if (this.options.verbose) {
        logAcpBackendMuted(
          `Incoming newSession response from ${this.options.agentName}: ${summarizeSessionMetadataPayload(sessionResponse)}`
        );
      }
      this.emitInitialSessionMetadata(sessionResponse);
      this.emitIdleStatus();
      if (initialPrompt) {
        this.sendPrompt(sessionId, initialPrompt).catch((error) => {
          api.logger.debug("[AcpBackend] Error sending initial prompt:", error);
          this.emit({ type: "status", status: "error", detail: String(error) });
        });
      }
      return { sessionId };
    } catch (error) {
      api.logger.debug("[AcpBackend] Error starting session:", error);
      if (!startupStatusErrorEmitted) {
        this.emit({
          type: "status",
          status: "error",
          detail: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }
  /**
   * Create handler context for session update processing
   */
  createHandlerContext() {
    return {
      transport: this.transport,
      activeToolCalls: this.activeToolCalls,
      toolCallStartTimes: this.toolCallStartTimes,
      toolCallTimeouts: this.toolCallTimeouts,
      toolCallIdToNameMap: this.toolCallIdToNameMap,
      idleTimeout: this.idleTimeout,
      toolCallCountSincePrompt: this.toolCallCountSincePrompt,
      emit: (msg) => this.emit(msg),
      emitIdleStatus: () => this.emitIdleStatus(),
      clearIdleTimeout: () => {
        if (this.idleTimeout) {
          clearTimeout(this.idleTimeout);
          this.idleTimeout = null;
        }
      },
      setIdleTimeout: (callback, ms) => {
        this.idleTimeout = setTimeout(() => {
          callback();
          this.idleTimeout = null;
        }, ms);
      }
    };
  }
  emitInitialSessionMetadata(sessionResponse) {
    if (Array.isArray(sessionResponse.configOptions)) {
      this.emit({
        type: "event",
        name: "config_options_update",
        payload: { configOptions: sessionResponse.configOptions }
      });
    }
    if (sessionResponse.modes) {
      this.emit({
        type: "event",
        name: "modes_update",
        payload: sessionResponse.modes
      });
      this.emit({
        type: "event",
        name: "current_mode_update",
        payload: { currentModeId: sessionResponse.modes.currentModeId }
      });
    }
    if (sessionResponse.models) {
      this.emit({
        type: "event",
        name: "models_update",
        payload: sessionResponse.models
      });
    }
  }
  handleSessionUpdate(params) {
    const notification = params;
    const update = notification.update;
    if (!update) {
      api.logger.debug("[AcpBackend] Received session update without update field:", params);
      return;
    }
    const sessionUpdateType = update.sessionUpdate;
    const updateType = sessionUpdateType;
    api.logger.debug(`[AcpBackend] sessionUpdate: ${sessionUpdateType}`, JSON.stringify(update));
    if (this.options.verbose) {
      logAcpBackendMuted(
        `Incoming raw session update from ${this.options.agentName}: ${JSON.stringify(update)}`
      );
    }
    const ctx = this.createHandlerContext();
    if (sessionUpdateType === "agent_message_chunk") {
      handleAgentMessageChunk(update, ctx);
      return;
    }
    if (sessionUpdateType === "tool_call_update") {
      const result = handleToolCallUpdate(update, ctx);
      if (result.toolCallCountSincePrompt !== void 0) {
        this.toolCallCountSincePrompt = result.toolCallCountSincePrompt;
      }
      return;
    }
    if (sessionUpdateType === "agent_thought_chunk") {
      handleAgentThoughtChunk(update, ctx);
      return;
    }
    if (sessionUpdateType === "tool_call") {
      handleToolCall(update, ctx);
      return;
    }
    if (sessionUpdateType === "available_commands_update") {
      const commands = update.availableCommands;
      if (Array.isArray(commands)) {
        this.emit({
          type: "event",
          name: "available_commands",
          payload: commands
        });
      }
      return;
    }
    if (updateType === "config_option_update" || updateType === "config_options_update") {
      const configOptions = update.configOptions;
      if (Array.isArray(configOptions)) {
        this.emit({
          type: "event",
          name: "config_options_update",
          payload: { configOptions }
        });
      }
      return;
    }
    if (updateType === "current_mode_update") {
      const currentModeId = update.currentModeId;
      if (typeof currentModeId === "string" && currentModeId.length > 0) {
        this.emit({
          type: "event",
          name: "current_mode_update",
          payload: { currentModeId }
        });
      }
      return;
    }
    handleLegacyMessageChunk(update, ctx);
    handlePlanUpdate(update, ctx);
    handleThinkingUpdate(update, ctx);
    const handledTypes = [
      "agent_message_chunk",
      "tool_call_update",
      "agent_thought_chunk",
      "tool_call",
      "available_commands_update",
      "config_option_update",
      "config_options_update",
      "current_mode_update"
    ];
    if (updateType && !handledTypes.includes(updateType) && !update.messageChunk && !update.plan && !update.thinking) {
      api.logger.debug(`[AcpBackend] Unhandled session update type: ${updateType}`, JSON.stringify(update, null, 2));
    }
  }
  // Promise resolver for waitForIdle - set when waiting for response to complete
  idleResolver = null;
  waitingForResponse = false;
  async sendPrompt(sessionId, prompt) {
    const promptHasChangeTitle = this.options.hasChangeTitleInstruction?.(prompt) ?? false;
    this.toolCallCountSincePrompt = 0;
    this.recentPromptHadChangeTitle = promptHasChangeTitle;
    if (promptHasChangeTitle) {
      api.logger.debug('[AcpBackend] Prompt contains change_title instruction - will auto-approve first "other" tool call if it matches pattern');
    }
    if (this.disposed) {
      throw new Error("Backend has been disposed");
    }
    if (!this.connection || !this.acpSessionId) {
      throw new Error("Session not started");
    }
    this.emit({ type: "status", status: "running" });
    this.waitingForResponse = true;
    try {
      api.logger.debug(`[AcpBackend] Sending prompt (length: ${prompt.length}): ${prompt.substring(0, 100)}...`);
      api.logger.debug(`[AcpBackend] Full prompt: ${prompt}`);
      const contentBlock = {
        type: "text",
        text: prompt
      };
      const promptRequest = {
        sessionId: this.acpSessionId,
        prompt: [contentBlock]
      };
      api.logger.debug(`[AcpBackend] Prompt request:`, JSON.stringify(promptRequest, null, 2));
      await this.connection.prompt(promptRequest);
      api.logger.debug("[AcpBackend] Prompt request sent to ACP connection");
    } catch (error) {
      api.logger.debug("[AcpBackend] Error sending prompt:", error);
      this.waitingForResponse = false;
      let errorDetail;
      if (error instanceof Error) {
        errorDetail = error.message;
      } else if (typeof error === "object" && error !== null) {
        const errObj = error;
        const fallbackMessage = (typeof errObj.message === "string" ? errObj.message : void 0) || String(error);
        if (errObj.code !== void 0) {
          errorDetail = JSON.stringify({ code: errObj.code, message: fallbackMessage });
        } else if (typeof errObj.message === "string") {
          errorDetail = errObj.message;
        } else {
          errorDetail = String(error);
        }
      } else {
        errorDetail = String(error);
      }
      this.emit({
        type: "status",
        status: "error",
        detail: errorDetail
      });
      throw error;
    }
  }
  /**
   * Set a session config option value.
   * Returns false when unsupported or when the update fails.
   */
  async setSessionConfigOption(configId, value) {
    if (this.disposed || !this.connection || !this.acpSessionId) {
      return false;
    }
    try {
      const response = await this.connection.setSessionConfigOption({
        sessionId: this.acpSessionId,
        configId,
        value
      });
      if (Array.isArray(response.configOptions)) {
        this.emit({
          type: "event",
          name: "config_options_update",
          payload: { configOptions: response.configOptions }
        });
      }
      return true;
    } catch (error) {
      api.logger.debug("[AcpBackend] Failed to set session config option:", {
        configId,
        value,
        error
      });
      return false;
    }
  }
  /**
   * Set the current ACP session mode.
   * Returns false when unsupported or when the update fails.
   */
  async setSessionMode(modeId) {
    if (this.disposed || !this.connection || !this.acpSessionId) {
      return false;
    }
    try {
      await this.connection.setSessionMode({
        sessionId: this.acpSessionId,
        modeId
      });
      this.emit({
        type: "event",
        name: "current_mode_update",
        payload: { currentModeId: modeId }
      });
      return true;
    } catch (error) {
      api.logger.debug("[AcpBackend] Failed to set session mode:", { modeId, error });
      return false;
    }
  }
  /**
   * Set the current ACP session model (UNSTABLE ACP capability).
   * Returns false when unsupported or when the update fails.
   */
  async setSessionModel(modelId) {
    if (this.disposed || !this.connection || !this.acpSessionId) {
      return false;
    }
    if (typeof this.connection.unstable_setSessionModel !== "function") {
      return false;
    }
    try {
      await this.connection.unstable_setSessionModel({
        sessionId: this.acpSessionId,
        modelId
      });
      return true;
    } catch (error) {
      api.logger.debug("[AcpBackend] Failed to set session model:", { modelId, error });
      return false;
    }
  }
  /**
   * Wait for the response to complete (idle status after all chunks received)
   * Call this after sendPrompt to wait for Gemini to finish responding
   */
  async waitForResponseComplete(timeoutMs = 12e4) {
    if (!this.waitingForResponse) {
      return;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.idleResolver = null;
        this.waitingForResponse = false;
        reject(new Error("Timeout waiting for response to complete"));
      }, timeoutMs);
      this.idleResolver = () => {
        clearTimeout(timeout);
        this.idleResolver = null;
        this.waitingForResponse = false;
        resolve();
      };
    });
  }
  /**
   * Helper to emit idle status and resolve any waiting promises
   */
  emitIdleStatus() {
    this.emit({ type: "status", status: "idle" });
    if (this.idleResolver) {
      api.logger.debug("[AcpBackend] Resolving idle waiter");
      this.idleResolver();
    }
  }
  async cancel(sessionId) {
    if (!this.connection || !this.acpSessionId) {
      return;
    }
    try {
      await this.connection.cancel({ sessionId: this.acpSessionId });
      this.emit({ type: "status", status: "stopped", detail: "Cancelled by user" });
    } catch (error) {
      api.logger.debug("[AcpBackend] Error cancelling:", error);
    }
  }
  /**
   * Emit permission response event for UI/logging purposes.
   *
   * **IMPORTANT:** For ACP backends, this method does NOT send the actual permission
   * response to the agent. The ACP protocol requires synchronous permission handling,
   * which is done inside the `requestPermission` RPC handler via `this.options.permissionHandler`.
   *
   * This method only emits a `permission-response` event for:
   * - UI updates (e.g., closing permission dialogs)
   * - Logging and debugging
   * - Other parts of the CLI that need to react to permission decisions
   *
   * @param requestId - The ID of the permission request
   * @param approved - Whether the permission was granted
   */
  async respondToPermission(requestId, approved) {
    api.logger.debug(`[AcpBackend] Permission response event (UI only): ${requestId} = ${approved}`);
    this.emit({ type: "permission-response", id: requestId, approved });
  }
  async dispose() {
    if (this.disposed) return;
    api.logger.debug("[AcpBackend] Disposing backend");
    this.disposed = true;
    if (this.connection && this.acpSessionId) {
      try {
        await Promise.race([
          this.connection.cancel({ sessionId: this.acpSessionId }),
          new Promise((resolve) => setTimeout(resolve, 2e3))
          // 2s timeout for graceful shutdown
        ]);
      } catch (error) {
        api.logger.debug("[AcpBackend] Error during graceful shutdown:", error);
      }
    }
    if (this.process) {
      this.process.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            api.logger.debug("[AcpBackend] Force killing process");
            this.process.kill("SIGKILL");
          }
          resolve();
        }, 1e3);
        this.process?.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.process = null;
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.listeners = [];
    this.connection = null;
    this.acpSessionId = null;
    this.activeToolCalls.clear();
    for (const timeout of this.toolCallTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.toolCallTimeouts.clear();
    this.toolCallStartTimes.clear();
    this.pendingPermissions.clear();
  }
}

exports.AcpBackend = AcpBackend;
exports.DEFAULT_IDLE_TIMEOUT_MS = DEFAULT_IDLE_TIMEOUT_MS;
exports.DEFAULT_TOOL_CALL_TIMEOUT_MS = DEFAULT_TOOL_CALL_TIMEOUT_MS;
exports.DefaultTransport = DefaultTransport;
exports.extractErrorDetail = extractErrorDetail;
exports.formatDuration = formatDuration;
exports.formatDurationMinutes = formatDurationMinutes;
exports.handleAgentMessageChunk = handleAgentMessageChunk;
exports.handleAgentThoughtChunk = handleAgentThoughtChunk;
exports.handleLegacyMessageChunk = handleLegacyMessageChunk;
exports.handlePlanUpdate = handlePlanUpdate;
exports.handleThinkingUpdate = handleThinkingUpdate;
exports.handleToolCall = handleToolCall;
exports.handleToolCallUpdate = handleToolCallUpdate;
exports.parseArgsFromContent = parseArgsFromContent;
