'use strict';

var ink = require('ink');
var React = require('react');
var node_crypto = require('node:crypto');
var node_path = require('node:path');
var api = require('./types-DB662inl.cjs');
var persistence = require('./persistence-CoLu_Clg.cjs');
var index = require('./index-BJ1EcyS9.cjs');
var AcpBackend = require('./AcpBackend-rwDszjtn.cjs');
var config = require('./config-BDfe4Aex.cjs');
require('axios');
require('chalk');
require('fs');
require('node:util');
require('node:fs');
require('node:os');
require('node:events');
require('socket.io-client');
require('zod');
require('@slopus/happy-wire');
require('tweetnacl');
require('child_process');
require('util');
require('fs/promises');
require('crypto');
require('path');
require('cross-spawn');
require('url');
require('os');
require('@paralleldrive/cuid2');
require('expo-server-sdk');
require('node:fs/promises');
require('node:readline');
require('@anthropic-ai/sandbox-runtime');
require('@anthropic-ai/claude-agent-sdk');
require('node:child_process');
require('ps-list');
require('tmp');
require('qrcode-terminal');
require('open');
require('fastify');
require('fastify-type-provider-zod');
require('@modelcontextprotocol/sdk/server/mcp.js');
require('node:http');
require('@modelcontextprotocol/sdk/server/streamableHttp.js');
require('http');
require('inquirer');
require('@agentclientprotocol/sdk');

const GEMINI_TIMEOUTS = {
  /** Gemini CLI can be slow on first start (downloading models, etc.) */
  init: 12e4,
  /** Standard tool call timeout */
  toolCall: 12e4,
  /** Investigation tools (codebase_investigator) can run for a long time */
  investigation: 6e5,
  /** Think tools are usually quick */
  think: 3e4,
  /** Idle detection after last message chunk */
  idle: 500
};
const GEMINI_TOOL_PATTERNS = [
  {
    name: "change_title",
    patterns: ["change_title", "change-title", "happy__change_title", "mcp__happy__change_title"],
    inputFields: ["title"],
    emptyInputDefault: true
    // change_title often has empty input (title extracted from context)
  },
  {
    name: "save_memory",
    patterns: ["save_memory", "save-memory"],
    inputFields: ["memory", "content"]
  },
  {
    name: "think",
    patterns: ["think"],
    inputFields: ["thought", "thinking"]
  }
];
const AVAILABLE_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];
class GeminiTransport {
  agentName = "gemini";
  /**
   * Gemini CLI needs 2 minutes for first start (model download, warm-up)
   */
  getInitTimeout() {
    return GEMINI_TIMEOUTS.init;
  }
  /**
   * Filter Gemini CLI debug output from stdout.
   *
   * Gemini CLI outputs various debug info (experiments, flags, etc.) to stdout
   * that breaks ACP JSON-RPC parsing. We only keep valid JSON lines.
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
   * Handle Gemini CLI stderr output.
   *
   * Detects:
   * - Rate limit errors (429) - logged but not shown (CLI handles retries)
   * - Model not found (404) - emit error with available models
   * - Other errors during investigation - logged for debugging
   */
  handleStderr(text, context) {
    const trimmed = text.trim();
    if (!trimmed) {
      return { message: null, suppress: true };
    }
    if (trimmed.includes("status 429") || trimmed.includes('code":429') || trimmed.includes("rateLimitExceeded") || trimmed.includes("RESOURCE_EXHAUSTED")) {
      return {
        message: null,
        suppress: false
        // Log for debugging but don't show to user
      };
    }
    if (trimmed.includes("status 404") || trimmed.includes('code":404')) {
      const errorMessage = {
        type: "status",
        status: "error",
        detail: `Model not found. Available models: ${AVAILABLE_MODELS.join(", ")}`
      };
      return { message: errorMessage };
    }
    if (context.hasActiveInvestigation) {
      const hasError = trimmed.includes("timeout") || trimmed.includes("Timeout") || trimmed.includes("failed") || trimmed.includes("Failed") || trimmed.includes("error") || trimmed.includes("Error");
      if (hasError) {
        return { message: null, suppress: false };
      }
    }
    return { message: null };
  }
  /**
   * Gemini-specific tool patterns
   */
  getToolPatterns() {
    return GEMINI_TOOL_PATTERNS;
  }
  /**
   * Check if tool is an investigation tool (needs longer timeout)
   */
  isInvestigationTool(toolCallId, toolKind) {
    const lowerId = toolCallId.toLowerCase();
    return lowerId.includes("codebase_investigator") || lowerId.includes("investigator") || typeof toolKind === "string" && toolKind.includes("investigator");
  }
  /**
   * Get timeout for a tool call
   */
  getToolCallTimeout(toolCallId, toolKind) {
    if (this.isInvestigationTool(toolCallId, toolKind)) {
      return GEMINI_TIMEOUTS.investigation;
    }
    if (toolKind === "think") {
      return GEMINI_TIMEOUTS.think;
    }
    return GEMINI_TIMEOUTS.toolCall;
  }
  /**
   * Get idle detection timeout
   */
  getIdleTimeout() {
    return GEMINI_TIMEOUTS.idle;
  }
  /**
   * Extract tool name from toolCallId using Gemini patterns.
   *
   * Tool IDs often contain the tool name as a prefix (e.g., "change_title-1765385846663" -> "change_title")
   */
  extractToolNameFromId(toolCallId) {
    const lowerId = toolCallId.toLowerCase();
    for (const toolPattern of GEMINI_TOOL_PATTERNS) {
      for (const pattern of toolPattern.patterns) {
        if (lowerId.includes(pattern.toLowerCase())) {
          return toolPattern.name;
        }
      }
    }
    return null;
  }
  /**
   * Check if input is effectively empty
   */
  isEmptyInput(input) {
    if (!input) return true;
    if (Array.isArray(input)) return input.length === 0;
    if (typeof input === "object") return Object.keys(input).length === 0;
    return false;
  }
  /**
   * Determine the real tool name from various sources.
   *
   * When Gemini sends "other" or "Unknown tool", tries to determine the real name from:
   * 1. toolCallId patterns (most reliable - tool name often embedded in ID)
   * 2. Input field signatures (specific fields indicate specific tools)
   * 3. Empty input default (some tools like change_title have empty input)
   *
   * Context-based heuristics were removed as they were fragile and the above
   * methods cover all known cases.
   */
  determineToolName(toolName, toolCallId, input, _context) {
    if (toolName !== "other" && toolName !== "Unknown tool") {
      return toolName;
    }
    const idToolName = this.extractToolNameFromId(toolCallId);
    if (idToolName) {
      return idToolName;
    }
    if (input && typeof input === "object" && !Array.isArray(input)) {
      const inputKeys = Object.keys(input);
      for (const toolPattern of GEMINI_TOOL_PATTERNS) {
        if (toolPattern.inputFields) {
          const hasMatchingField = toolPattern.inputFields.some(
            (field) => inputKeys.some((key) => key.toLowerCase() === field.toLowerCase())
          );
          if (hasMatchingField) {
            return toolPattern.name;
          }
        }
      }
    }
    if (this.isEmptyInput(input) && toolName === "other") {
      const defaultTool = GEMINI_TOOL_PATTERNS.find((p) => p.emptyInputDefault);
      if (defaultTool) {
        return defaultTool.name;
      }
    }
    if (toolName === "other" || toolName === "Unknown tool") {
      const inputKeys = input && typeof input === "object" ? Object.keys(input) : [];
      api.logger.debug(
        `[GeminiTransport] Unknown tool pattern - toolCallId: "${toolCallId}", toolName: "${toolName}", inputKeys: [${inputKeys.join(", ")}]. Consider adding a new pattern to GEMINI_TOOL_PATTERNS if this tool appears frequently.`
      );
    }
    return toolName;
  }
}
const geminiTransport = new GeminiTransport();

function createGeminiBackend(options) {
  const localConfig = config.readGeminiLocalConfig();
  let apiKey = options.cloudToken || localConfig.token || process.env[index.GEMINI_API_KEY_ENV] || process.env[index.GOOGLE_API_KEY_ENV] || options.apiKey;
  if (!apiKey) {
    api.logger.warn(`[Gemini] No API key found. Run 'happy connect gemini' to authenticate via Google OAuth, or set ${index.GEMINI_API_KEY_ENV} environment variable.`);
  }
  const geminiCommand = "gemini";
  const model = config.determineGeminiModel(options.model, localConfig);
  const geminiArgs = ["--experimental-acp"];
  let googleCloudProject = null;
  if (localConfig.googleCloudProject) {
    const storedEmail = localConfig.googleCloudProjectEmail;
    const currentEmail = options.currentUserEmail;
    if (!storedEmail || storedEmail === currentEmail) {
      googleCloudProject = localConfig.googleCloudProject;
      api.logger.debug(`[Gemini] Using Google Cloud Project: ${googleCloudProject}${storedEmail ? ` (for ${storedEmail})` : " (global)"}`);
    } else {
      api.logger.debug(`[Gemini] Skipping stored Google Cloud Project (stored for ${storedEmail}, current user is ${currentEmail || "unknown"})`);
    }
  }
  const backendOptions = {
    agentName: "gemini",
    cwd: options.cwd,
    command: geminiCommand,
    args: geminiArgs,
    env: {
      ...options.env,
      ...apiKey ? { [index.GEMINI_API_KEY_ENV]: apiKey, [index.GOOGLE_API_KEY_ENV]: apiKey } : {},
      // Pass model via env var - gemini CLI reads GEMINI_MODEL automatically
      [index.GEMINI_MODEL_ENV]: model,
      // Pass Google Cloud Project for Workspace accounts
      ...googleCloudProject ? {
        GOOGLE_CLOUD_PROJECT: googleCloudProject,
        GOOGLE_CLOUD_PROJECT_ID: googleCloudProject
      } : {},
      // Suppress debug output from gemini CLI to avoid stdout pollution
      NODE_ENV: "production",
      DEBUG: ""
    },
    mcpServers: options.mcpServers,
    permissionHandler: options.permissionHandler,
    transportHandler: geminiTransport,
    // Check if prompt instructs the agent to change title (for auto-approval of change_title tool)
    hasChangeTitleInstruction: (prompt) => {
      const lower = prompt.toLowerCase();
      return lower.includes("change_title") || lower.includes("change title") || lower.includes("set title") || lower.includes("mcp__happy__change_title");
    }
  };
  const modelSource = config.getGeminiModelSource(options.model, localConfig);
  api.logger.debug("[Gemini] Creating ACP SDK backend with options:", {
    cwd: backendOptions.cwd,
    command: backendOptions.command,
    args: backendOptions.args,
    hasApiKey: !!apiKey,
    model,
    modelSource,
    mcpServerCount: options.mcpServers ? Object.keys(options.mcpServers).length : 0
  });
  return {
    backend: new AcpBackend.AcpBackend(backendOptions),
    model,
    modelSource
  };
}

const GeminiDisplay = ({ messageBuffer, logPath, currentModel, onExit }) => {
  const [messages, setMessages] = React.useState([]);
  const [confirmationMode, setConfirmationMode] = React.useState(false);
  const [actionInProgress, setActionInProgress] = React.useState(false);
  const [model, setModel] = React.useState(currentModel);
  const confirmationTimeoutRef = React.useRef(null);
  const { stdout } = ink.useStdout();
  const terminalWidth = stdout.columns || 80;
  const terminalHeight = stdout.rows || 24;
  React.useEffect(() => {
    if (currentModel !== void 0 && currentModel !== model) {
      setModel(currentModel);
    }
  }, [currentModel]);
  React.useEffect(() => {
    setMessages(messageBuffer.getMessages());
    const unsubscribe = messageBuffer.onUpdate((newMessages) => {
      setMessages(newMessages);
      const modelMessage = [...newMessages].reverse().find(
        (msg) => msg.type === "system" && msg.content.startsWith("[MODEL:")
      );
      if (modelMessage) {
        const modelMatch = modelMessage.content.match(/\[MODEL:(.+?)\]/);
        if (modelMatch && modelMatch[1]) {
          const extractedModel = modelMatch[1];
          setModel((prevModel) => {
            if (extractedModel !== prevModel) {
              return extractedModel;
            }
            return prevModel;
          });
        }
      }
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
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", marginBottom: 1 }, /* @__PURE__ */ React.createElement(ink.Text, { color: "cyan", bold: true }, "\u2728 Gemini Agent Messages"), /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "\u2500".repeat(Math.min(terminalWidth - 4, 60)))),
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", height: terminalHeight - 10, overflow: "hidden" }, messages.length === 0 ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Waiting for messages...") : messages.filter((msg) => {
      if (msg.type === "system" && !msg.content.trim()) {
        return false;
      }
      if (msg.type === "system" && msg.content.startsWith("[MODEL:")) {
        return false;
      }
      if (msg.type === "system" && msg.content.startsWith("Using model:")) {
        return false;
      }
      return true;
    }).slice(-Math.max(1, terminalHeight - 10)).map((msg, index, array) => /* @__PURE__ */ React.createElement(ink.Box, { key: msg.id, flexDirection: "column", marginBottom: index < array.length - 1 ? 1 : 0 }, /* @__PURE__ */ React.createElement(ink.Text, { color: getMessageColor(msg.type), dimColor: true }, formatMessage(msg)))))
  ), /* @__PURE__ */ React.createElement(
    ink.Box,
    {
      width: terminalWidth,
      borderStyle: "round",
      borderColor: actionInProgress ? "gray" : confirmationMode ? "red" : "cyan",
      paddingX: 2,
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column"
    },
    /* @__PURE__ */ React.createElement(ink.Box, { flexDirection: "column", alignItems: "center" }, actionInProgress ? /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", bold: true }, "Exiting agent...") : confirmationMode ? /* @__PURE__ */ React.createElement(ink.Text, { color: "red", bold: true }, "\u26A0\uFE0F  Press Ctrl-C again to exit the agent") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ink.Text, { color: "cyan", bold: true }, "\u2728 Gemini Agent Running \u2022 Ctrl-C to exit"), model && /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Model: ", model)), process.env.DEBUG && logPath && /* @__PURE__ */ React.createElement(ink.Text, { color: "gray", dimColor: true }, "Debug logs: ", logPath))
  ));
};

class GeminiPermissionHandler extends index.BasePermissionHandler {
  currentPermissionMode = "default";
  constructor(session) {
    super(session);
  }
  getLogPrefix() {
    return "[Gemini]";
  }
  /**
   * Update session reference (override for type visibility)
   */
  updateSession(newSession) {
    super.updateSession(newSession);
  }
  /**
   * Set the current permission mode
   * This affects how tool calls are automatically approved/denied
   */
  setPermissionMode(mode) {
    this.currentPermissionMode = mode;
    api.logger.debug(`${this.getLogPrefix()} Permission mode set to: ${mode}`);
  }
  /**
   * Check if a tool should be auto-approved based on permission mode
   */
  shouldAutoApprove(toolName, toolCallId, input) {
    const alwaysAutoApproveNames = /* @__PURE__ */ new Set([
      "change_title",
      "happy__change_title",
      "mcp__happy__change_title",
      "GeminiReasoning",
      "CodexReasoning",
      "think",
      "save_memory"
    ]);
    const alwaysAutoApproveIdPrefixes = ["change_title", "save_memory"];
    if (alwaysAutoApproveNames.has(toolName)) {
      return true;
    }
    for (const prefix of alwaysAutoApproveIdPrefixes) {
      if (toolCallId === prefix || toolCallId.startsWith(`${prefix}-`)) {
        return true;
      }
    }
    switch (this.currentPermissionMode) {
      case "yolo":
        return true;
      case "safe-yolo":
      case "read-only": {
        const dangerousTools = ["write", "edit", "create", "delete", "patch", "fs-edit", "bash", "shell", "execute"];
        const isDangerous = dangerousTools.some((wt) => toolName.toLowerCase().includes(wt));
        return !isDangerous;
      }
      case "default":
      default:
        return false;
    }
  }
  /**
   * Handle a tool permission request
   * @param toolCallId - The unique ID of the tool call
   * @param toolName - The name of the tool being called
   * @param input - The input parameters for the tool
   * @returns Promise resolving to permission result
   */
  async handleToolCall(toolCallId, toolName, input) {
    if (this.shouldAutoApprove(toolName, toolCallId, input)) {
      api.logger.debug(`${this.getLogPrefix()} Auto-approving tool ${toolName} (${toolCallId}) in ${this.currentPermissionMode} mode`);
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
            decision: this.currentPermissionMode === "yolo" ? "approved_for_session" : "approved"
          }
        }
      }));
      return {
        decision: this.currentPermissionMode === "yolo" ? "approved_for_session" : "approved"
      };
    }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(toolCallId, {
        resolve,
        reject,
        toolName,
        input
      });
      this.addPendingRequestToState(toolCallId, toolName, input);
      api.logger.debug(`${this.getLogPrefix()} Permission request sent for tool: ${toolName} (${toolCallId}) in ${this.currentPermissionMode} mode`);
    });
  }
}

class GeminiReasoningProcessor extends index.BaseReasoningProcessor {
  getToolName() {
    return "GeminiReasoning";
  }
  getLogPrefix() {
    return "[GeminiReasoningProcessor]";
  }
  /**
   * Process a reasoning chunk from agent_thought_chunk.
   * Gemini sends reasoning as chunks, we accumulate them similar to Codex.
   */
  processChunk(chunk) {
    this.processInput(chunk);
  }
  /**
   * Complete the reasoning section.
   * Called when reasoning is complete (e.g., when status changes to idle).
   * Returns true if reasoning was actually completed, false if there was nothing to complete.
   */
  complete() {
    return this.completeReasoning();
  }
}

class GeminiDiffProcessor {
  previousDiffs = /* @__PURE__ */ new Map();
  // Track diffs per file path
  onMessage = null;
  constructor(onMessage) {
    this.onMessage = onMessage || null;
  }
  /**
   * Process an fs-edit event and check if it contains diff information
   */
  processFsEdit(path, description, diff) {
    api.logger.debug(`[GeminiDiffProcessor] Processing fs-edit for path: ${path}`);
    if (diff) {
      this.processDiff(path, diff, description);
    } else {
      const simpleDiff = `File edited: ${path}${description ? ` - ${description}` : ""}`;
      this.processDiff(path, simpleDiff, description);
    }
  }
  /**
   * Process a tool result that may contain diff information
   */
  processToolResult(toolName, result, callId) {
    if (result && typeof result === "object") {
      const diff = result.diff || result.unified_diff || result.patch;
      const path = result.path || result.file;
      if (diff && path) {
        api.logger.debug(`[GeminiDiffProcessor] Found diff in tool result: ${toolName} (${callId})`);
        this.processDiff(path, diff, result.description);
      } else if (result.changes && typeof result.changes === "object") {
        for (const [filePath, change] of Object.entries(result.changes)) {
          const changeDiff = change.diff || change.unified_diff || JSON.stringify(change);
          this.processDiff(filePath, changeDiff, change.description);
        }
      }
    }
  }
  /**
   * Process a unified diff and check if it has changed from the previous value
   */
  processDiff(path, unifiedDiff, description) {
    const previousDiff = this.previousDiffs.get(path);
    if (previousDiff !== unifiedDiff) {
      api.logger.debug(`[GeminiDiffProcessor] Unified diff changed for ${path}, sending GeminiDiff tool call`);
      const callId = node_crypto.randomUUID();
      const toolCall = {
        type: "tool-call",
        name: "GeminiDiff",
        callId,
        input: {
          unified_diff: unifiedDiff,
          path,
          description
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
    this.previousDiffs.set(path, unifiedDiff);
    api.logger.debug(`[GeminiDiffProcessor] Updated stored diff for ${path}`);
  }
  /**
   * Reset the processor state (called on task_complete or turn_aborted)
   */
  reset() {
    api.logger.debug("[GeminiDiffProcessor] Resetting diff state");
    this.previousDiffs.clear();
  }
  /**
   * Set the message callback for sending messages directly
   */
  setMessageCallback(callback) {
    this.onMessage = callback;
  }
  /**
   * Get the current diff value for a specific path
   */
  getCurrentDiff(path) {
    return this.previousDiffs.get(path) || null;
  }
  /**
   * Get all tracked diffs
   */
  getAllDiffs() {
    return new Map(this.previousDiffs);
  }
}

function hasIncompleteOptions(text) {
  const hasOpeningTag = /<options>/i.test(text);
  const hasClosingTag = /<\/options>/i.test(text);
  return hasOpeningTag && !hasClosingTag;
}
function parseOptionsFromText(text) {
  const optionsRegex = /<options>\s*([\s\S]*?)\s*<\/options>/i;
  const match = text.match(optionsRegex);
  if (!match) {
    return { text: text.trim(), options: [] };
  }
  const optionsBlock = match[1];
  const optionRegex = /<option>(.*?)<\/option>/gi;
  const options = [];
  let optionMatch;
  while ((optionMatch = optionRegex.exec(optionsBlock)) !== null) {
    const optionText = optionMatch[1].trim();
    if (optionText) {
      options.push(optionText);
    }
  }
  const textWithoutOptions = text.replace(optionsRegex, "").trim();
  return { text: textWithoutOptions, options };
}
function formatOptionsXml(options) {
  if (options.length === 0) {
    return "";
  }
  return "\n<options>\n" + options.map((opt) => `    <option>${opt}</option>`).join("\n") + "\n</options>";
}

class ConversationHistory {
  messages = [];
  maxMessages;
  maxCharacters;
  currentModel;
  constructor(options = {}) {
    this.maxMessages = options.maxMessages ?? 20;
    this.maxCharacters = options.maxCharacters ?? 5e4;
  }
  /**
   * Set the current model being used
   */
  setCurrentModel(model) {
    this.currentModel = model;
  }
  /**
   * Check if content is a duplicate of the last message with the same role.
   * Deduplication prevents inflating history when the same message is sent multiple times.
   */
  isDuplicate(role, content) {
    if (this.messages.length === 0) return false;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === role) {
        const normalizedNew = content.trim().replace(/\s+/g, " ");
        const normalizedExisting = msg.content.replace(/\s+/g, " ");
        return normalizedNew === normalizedExisting;
      }
    }
    return false;
  }
  /**
   * Add a user message to history
   * Skips duplicate messages to prevent history inflation
   */
  addUserMessage(content) {
    if (!content.trim()) return;
    const trimmedContent = content.trim();
    if (this.isDuplicate("user", trimmedContent)) {
      api.logger.debug(`[ConversationHistory] Skipping duplicate user message (${trimmedContent.length} chars)`);
      return;
    }
    this.messages.push({
      role: "user",
      content: trimmedContent,
      timestamp: Date.now()
    });
    this.trimHistory();
    api.logger.debug(`[ConversationHistory] Added user message (${trimmedContent.length} chars), total: ${this.messages.length}`);
  }
  /**
   * Add an assistant response to history
   * Skips duplicate messages to prevent history inflation
   */
  addAssistantMessage(content) {
    if (!content.trim()) return;
    const trimmedContent = content.trim();
    if (this.isDuplicate("assistant", trimmedContent)) {
      api.logger.debug(`[ConversationHistory] Skipping duplicate assistant message (${trimmedContent.length} chars)`);
      return;
    }
    this.messages.push({
      role: "assistant",
      content: trimmedContent,
      timestamp: Date.now(),
      model: this.currentModel
    });
    this.trimHistory();
    api.logger.debug(`[ConversationHistory] Added assistant message (${trimmedContent.length} chars), total: ${this.messages.length}`);
  }
  /**
   * Get the number of messages in history
   */
  size() {
    return this.messages.length;
  }
  /**
   * Check if there's any history to preserve
   */
  hasHistory() {
    return this.messages.length > 0;
  }
  /**
   * Clear all history
   */
  clear() {
    this.messages = [];
    api.logger.debug("[ConversationHistory] History cleared");
  }
  /**
   * Get formatted context for injecting into a new session.
   * This is used when the model changes to preserve conversation context.
   * 
   * @returns Formatted string with previous conversation context, or empty string if no history
   */
  getContextForNewSession() {
    if (this.messages.length === 0) {
      return "";
    }
    const formattedMessages = this.messages.map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const content = msg.content.length > 2e3 ? msg.content.substring(0, 2e3) + "... [truncated]" : msg.content;
      return `${role}: ${content}`;
    }).join("\n\n");
    return `[PREVIOUS CONVERSATION CONTEXT]
The following is our previous conversation. Continue from where we left off:

${formattedMessages}

[END OF PREVIOUS CONTEXT]

`;
  }
  /**
   * Trim history to stay within limits
   */
  trimHistory() {
    while (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    let totalChars = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    while (totalChars > this.maxCharacters && this.messages.length > 1) {
      const removed = this.messages.shift();
      if (removed) {
        totalChars -= removed.content.length;
      }
    }
  }
  /**
   * Get a summary of the conversation for logging/debugging
   */
  getSummary() {
    const totalChars = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const userCount = this.messages.filter((m) => m.role === "user").length;
    const assistantCount = this.messages.filter((m) => m.role === "assistant").length;
    return `${this.messages.length} messages (${userCount} user, ${assistantCount} assistant), ${totalChars} chars`;
  }
}

async function runGemini(opts) {
  const sessionTag = node_crypto.randomUUID();
  api.connectionState.setBackend("Gemini");
  const api$1 = await api.ApiClient.create(opts.credentials);
  const settings = await persistence.readSettings();
  const machineId = settings?.machineId;
  const sandboxConfig = settings?.sandboxConfig;
  if (!machineId) {
    console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/slopus/happy-cli/issues`);
    process.exit(1);
  }
  api.logger.debug(`Using machineId: ${machineId}`);
  await api$1.getOrCreateMachine({
    machineId,
    metadata: index.initialMachineMetadata
  });
  let cloudToken = void 0;
  let currentUserEmail = void 0;
  try {
    const vendorToken = await api$1.getVendorToken("gemini");
    if (vendorToken?.oauth?.access_token) {
      cloudToken = vendorToken.oauth.access_token;
      api.logger.debug("[Gemini] Using OAuth token from Happy cloud");
      if (vendorToken.oauth.id_token) {
        try {
          const parts = vendorToken.oauth.id_token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
            if (payload.email) {
              currentUserEmail = payload.email;
              api.logger.debug(`[Gemini] Current user email: ${currentUserEmail}`);
            }
          }
        } catch {
          api.logger.debug("[Gemini] Failed to decode id_token for email");
        }
      }
    }
  } catch (error) {
    api.logger.debug("[Gemini] Failed to fetch cloud token:", error);
  }
  const { state, metadata } = index.createSessionMetadata({
    flavor: "gemini",
    machineId,
    startedBy: opts.startedBy,
    sandbox: sandboxConfig
  });
  const response = await api$1.getOrCreateSession({ tag: sessionTag, metadata, state });
  let session;
  let permissionHandler;
  let isProcessingMessage = false;
  let pendingSessionSwap = null;
  const applyPendingSessionSwap = () => {
    if (pendingSessionSwap) {
      api.logger.debug("[gemini] Applying pending session swap");
      session = pendingSessionSwap;
      if (permissionHandler) {
        permissionHandler.updateSession(pendingSessionSwap);
      }
      pendingSessionSwap = null;
    }
  };
  const { session: initialSession, reconnectionHandle } = index.setupOfflineReconnection({
    api: api$1,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      if (isProcessingMessage) {
        api.logger.debug("[gemini] Session swap requested during message processing - queueing");
        pendingSessionSwap = newSession;
      } else {
        session = newSession;
        if (permissionHandler) {
          permissionHandler.updateSession(newSession);
        }
      }
    }
  });
  session = initialSession;
  if (response) {
    try {
      api.logger.debug(`[START] Reporting session ${response.id} to daemon`);
      const result = await index.notifyDaemonSessionStarted(response.id, metadata, {
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
  const messageQueue = new index.MessageQueue2((mode) => index.hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model
  }));
  const conversationHistory = new ConversationHistory({ maxMessages: 20, maxCharacters: 5e4 });
  let currentPermissionMode = void 0;
  let currentModel = void 0;
  session.onUserMessage((message) => {
    let messagePermissionMode = currentPermissionMode;
    if (message.meta?.permissionMode) {
      const validModes = ["default", "read-only", "safe-yolo", "yolo"];
      if (validModes.includes(message.meta.permissionMode)) {
        messagePermissionMode = message.meta.permissionMode;
        currentPermissionMode = messagePermissionMode;
        updatePermissionMode(messagePermissionMode);
        api.logger.debug(`[Gemini] Permission mode updated from user message to: ${currentPermissionMode}`);
      } else {
        api.logger.debug(`[Gemini] Invalid permission mode received: ${message.meta.permissionMode}`);
      }
    } else {
      api.logger.debug(`[Gemini] User message received with no permission mode override, using current: ${currentPermissionMode ?? "default (effective)"}`);
    }
    if (currentPermissionMode === void 0) {
      currentPermissionMode = "default";
      updatePermissionMode("default");
    }
    let messageModel = currentModel;
    if (message.meta?.hasOwnProperty("model")) {
      if (message.meta.model === null) {
        messageModel = void 0;
        currentModel = void 0;
      } else if (message.meta.model) {
        const previousModel = currentModel;
        messageModel = message.meta.model;
        currentModel = messageModel;
        if (previousModel !== messageModel) {
          updateDisplayedModel(messageModel, true);
          messageBuffer.addMessage(`Model changed to: ${messageModel}`, "system");
          api.logger.debug(`[Gemini] Model changed from ${previousModel} to ${messageModel}`);
        }
      }
    }
    const originalUserMessage = message.content.text;
    let fullPrompt = originalUserMessage;
    if (isFirstMessage && message.meta?.appendSystemPrompt) {
      fullPrompt = message.meta.appendSystemPrompt + "\n\n" + originalUserMessage + "\n\n" + index.CHANGE_TITLE_INSTRUCTION;
      isFirstMessage = false;
    }
    const mode = {
      permissionMode: messagePermissionMode || "default",
      model: messageModel,
      originalUserMessage
      // Store original message separately
    };
    messageQueue.push(fullPrompt, mode);
    conversationHistory.addUserMessage(originalUserMessage);
  });
  let thinking = false;
  session.keepAlive(thinking, "remote");
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, "remote");
  }, 2e3);
  let isFirstMessage = true;
  const sendReady = () => {
    session.sendSessionEvent({ type: "ready" });
    try {
      api$1.push().sendSessionNotification({
        kind: "done",
        metadata: session.getMetadata(),
        data: {
          sessionId: session.sessionId,
          type: "ready",
          provider: "gemini"
        }
      });
    } catch (pushError) {
      api.logger.debug("[Gemini] Failed to send ready push", pushError);
    }
  };
  const emitReadyIfIdle = () => {
    if (shouldExit) {
      return false;
    }
    if (thinking) {
      return false;
    }
    if (isResponseInProgress) {
      return false;
    }
    if (messageQueue.size() > 0) {
      return false;
    }
    sendReady();
    return true;
  };
  let abortController = new AbortController();
  let shouldExit = false;
  let geminiBackend = null;
  let acpSessionId = null;
  let wasSessionCreated = false;
  async function handleAbort() {
    api.logger.debug("[Gemini] Abort requested - stopping current task");
    session.sendAgentMessage("gemini", {
      type: "turn_aborted",
      id: node_crypto.randomUUID()
    });
    reasoningProcessor.abort();
    diffProcessor.reset();
    try {
      abortController.abort();
      messageQueue.reset();
      if (geminiBackend && acpSessionId) {
        await geminiBackend.cancel(acpSessionId);
      }
      api.logger.debug("[Gemini] Abort completed - session remains active");
    } catch (error) {
      api.logger.debug("[Gemini] Error during abort:", error);
    } finally {
      abortController = new AbortController();
    }
  }
  const handleKillSession = async () => {
    api.logger.debug("[Gemini] Kill session requested - terminating process");
    await handleAbort();
    api.logger.debug("[Gemini] Abort completed, proceeding with termination");
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
      happyServer.stop();
      if (geminiBackend) {
        await geminiBackend.dispose();
      }
      api.logger.debug("[Gemini] Session termination complete, exiting");
      process.exit(0);
    } catch (error) {
      api.logger.debug("[Gemini] Error during session termination:", error);
      process.exit(1);
    }
  };
  session.rpcHandlerManager.registerHandler("abort", handleAbort);
  index.registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);
  const messageBuffer = new index.MessageBuffer();
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  let inkInstance = null;
  let displayedModel = config.getInitialGeminiModel();
  const localConfig = config.readGeminiLocalConfig();
  api.logger.debug(`[gemini] Initial model setup: env[GEMINI_MODEL_ENV]=${process.env[index.GEMINI_MODEL_ENV] || "not set"}, localConfig=${localConfig.model || "not set"}, displayedModel=${displayedModel}`);
  const updateDisplayedModel = (model, saveToConfig = false) => {
    if (model === void 0) {
      api.logger.debug(`[gemini] updateDisplayedModel called with undefined, skipping update`);
      return;
    }
    const oldModel = displayedModel;
    displayedModel = model;
    api.logger.debug(`[gemini] updateDisplayedModel called: oldModel=${oldModel}, newModel=${model}, saveToConfig=${saveToConfig}`);
    if (saveToConfig) {
      config.saveGeminiModelToConfig(model);
    }
    if (hasTTY && oldModel !== model) {
      api.logger.debug(`[gemini] Adding model update message to buffer: [MODEL:${model}]`);
      messageBuffer.addMessage(`[MODEL:${model}]`, "system");
    } else if (hasTTY) {
      api.logger.debug(`[gemini] Model unchanged, skipping update message`);
    }
  };
  if (hasTTY) {
    console.clear();
    const DisplayComponent = () => {
      const currentModelValue = displayedModel || "gemini-2.5-pro";
      return React.createElement(GeminiDisplay, {
        messageBuffer,
        logPath: process.env.DEBUG ? api.logger.getLogPath() : void 0,
        currentModel: currentModelValue,
        onExit: async () => {
          api.logger.debug("[gemini]: Exiting agent via Ctrl-C");
          shouldExit = true;
          await handleAbort();
        }
      });
    };
    inkInstance = ink.render(React.createElement(DisplayComponent), {
      exitOnCtrlC: false,
      patchConsole: false
    });
    const initialModelName = displayedModel || "gemini-2.5-pro";
    api.logger.debug(`[gemini] Sending initial model to UI: ${initialModelName}`);
    messageBuffer.addMessage(`[MODEL:${initialModelName}]`, "system");
  }
  if (hasTTY) {
    process.stdin.resume();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding("utf8");
  }
  const happyServer = await index.startHappyServer(session);
  const bridgeCommand = node_path.join(api.projectPath(), "bin", "happy-mcp.mjs");
  const mcpServers = {
    happy: {
      command: bridgeCommand,
      args: ["--url", happyServer.url]
    }
  };
  permissionHandler = new GeminiPermissionHandler(session);
  const reasoningProcessor = new GeminiReasoningProcessor((message) => {
    session.sendAgentMessage("gemini", message);
  });
  const diffProcessor = new GeminiDiffProcessor((message) => {
    session.sendAgentMessage("gemini", message);
  });
  const updatePermissionMode = (mode) => {
    permissionHandler.setPermissionMode(mode);
  };
  let accumulatedResponse = "";
  let isResponseInProgress = false;
  let hadToolCallInTurn = false;
  let pendingChangeTitle = false;
  let changeTitleCompleted = false;
  let taskStartedSent = false;
  function setupGeminiMessageHandler(backend) {
    backend.onMessage((msg) => {
      switch (msg.type) {
        case "model-output":
          if (msg.textDelta) {
            if (!isResponseInProgress) {
              messageBuffer.removeLastMessage("system");
              messageBuffer.addMessage(msg.textDelta, "assistant");
              isResponseInProgress = true;
              api.logger.debug(`[gemini] Started new response, first chunk length: ${msg.textDelta.length}`);
            } else {
              messageBuffer.updateLastMessage(msg.textDelta, "assistant");
              api.logger.debug(`[gemini] Updated response, chunk length: ${msg.textDelta.length}, total accumulated: ${accumulatedResponse.length + msg.textDelta.length}`);
            }
            accumulatedResponse += msg.textDelta;
          }
          break;
        case "status":
          const statusDetail = msg.detail ? typeof msg.detail === "object" ? JSON.stringify(msg.detail) : String(msg.detail) : "";
          api.logger.debug(`[gemini] Status changed: ${msg.status}${statusDetail ? ` - ${statusDetail}` : ""}`);
          if (msg.status === "error") {
            api.logger.debug(`[gemini] \u26A0\uFE0F Error status received: ${statusDetail || "Unknown error"}`);
            session.sendAgentMessage("gemini", {
              type: "turn_aborted",
              id: node_crypto.randomUUID()
            });
          }
          if (msg.status === "running") {
            thinking = true;
            session.keepAlive(thinking, "remote");
            if (!taskStartedSent) {
              session.sendAgentMessage("gemini", {
                type: "task_started",
                id: node_crypto.randomUUID()
              });
              taskStartedSent = true;
            }
            messageBuffer.addMessage("Thinking...", "system");
          } else if (msg.status === "idle" || msg.status === "stopped") {
            reasoningProcessor.complete();
          } else if (msg.status === "error") {
            thinking = false;
            session.keepAlive(thinking, "remote");
            accumulatedResponse = "";
            isResponseInProgress = false;
            let errorMessage = "Unknown error";
            if (msg.detail) {
              if (typeof msg.detail === "object") {
                const detailObj = msg.detail;
                errorMessage = detailObj.message || detailObj.details || JSON.stringify(detailObj);
              } else {
                errorMessage = String(msg.detail);
              }
            }
            if (errorMessage.includes("Authentication required")) {
              errorMessage = `Authentication required.
For Google Workspace accounts, run: happy gemini project set <project-id>
Or use a different Google account: happy connect gemini
Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca`;
            }
            messageBuffer.addMessage(`Error: ${errorMessage}`, "status");
            session.sendAgentMessage("gemini", {
              type: "message",
              message: `Error: ${errorMessage}`
            });
          }
          break;
        case "tool-call":
          hadToolCallInTurn = true;
          const toolArgs = msg.args ? JSON.stringify(msg.args).substring(0, 100) : "";
          const isInvestigationTool = msg.toolName === "codebase_investigator" || typeof msg.toolName === "string" && msg.toolName.includes("investigator");
          api.logger.debug(`[gemini] \u{1F527} Tool call received: ${msg.toolName} (${msg.callId})${isInvestigationTool ? " [INVESTIGATION]" : ""}`);
          if (isInvestigationTool && msg.args && typeof msg.args === "object" && "objective" in msg.args) {
            api.logger.debug(`[gemini] \u{1F50D} Investigation objective: ${String(msg.args.objective).substring(0, 150)}...`);
          }
          messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}${toolArgs.length >= 100 ? "..." : ""}` : ""}`, "tool");
          session.sendAgentMessage("gemini", {
            type: "tool-call",
            name: msg.toolName,
            callId: msg.callId,
            input: msg.args,
            id: node_crypto.randomUUID()
          });
          break;
        case "tool-result":
          if (msg.toolName === "change_title" || msg.callId?.includes("change_title") || msg.toolName === "happy__change_title") {
            changeTitleCompleted = true;
            api.logger.debug("[gemini] change_title completed");
          }
          const isError = msg.result && typeof msg.result === "object" && "error" in msg.result;
          const resultText = typeof msg.result === "string" ? msg.result.substring(0, 200) : JSON.stringify(msg.result).substring(0, 200);
          const truncatedResult = resultText + (typeof msg.result === "string" && msg.result.length > 200 ? "..." : "");
          const resultSize = typeof msg.result === "string" ? msg.result.length : JSON.stringify(msg.result).length;
          api.logger.debug(`[gemini] ${isError ? "\u274C" : "\u2705"} Tool result received: ${msg.toolName} (${msg.callId}) - Size: ${resultSize} bytes${isError ? " [ERROR]" : ""}`);
          if (!isError) {
            diffProcessor.processToolResult(msg.toolName, msg.result, msg.callId);
          }
          if (isError) {
            const errorMsg = msg.result.error || "Tool call failed";
            api.logger.debug(`[gemini] \u274C Tool call error: ${errorMsg.substring(0, 300)}`);
            messageBuffer.addMessage(`Error: ${errorMsg}`, "status");
          } else {
            if (resultSize > 1e3) {
              api.logger.debug(`[gemini] \u2705 Large tool result (${resultSize} bytes) - first 200 chars: ${truncatedResult}`);
            }
            messageBuffer.addMessage(`Result: ${truncatedResult}`, "result");
          }
          session.sendAgentMessage("gemini", {
            type: "tool-result",
            callId: msg.callId,
            output: msg.result,
            id: node_crypto.randomUUID()
          });
          break;
        case "fs-edit":
          messageBuffer.addMessage(`File edit: ${msg.description}`, "tool");
          diffProcessor.processFsEdit(msg.path || "", msg.description, msg.diff);
          session.sendAgentMessage("gemini", {
            type: "file-edit",
            description: msg.description,
            diff: msg.diff,
            filePath: msg.path || "unknown",
            id: node_crypto.randomUUID()
          });
          break;
        default:
          if (msg.type === "token-count") {
            session.sendAgentMessage("gemini", {
              type: "token_count",
              ...msg,
              id: node_crypto.randomUUID()
            });
          }
          break;
        case "terminal-output":
          messageBuffer.addMessage(msg.data, "result");
          session.sendAgentMessage("gemini", {
            type: "terminal-output",
            data: msg.data,
            callId: msg.callId || node_crypto.randomUUID()
          });
          break;
        case "permission-request":
          const payload = msg.payload || {};
          session.sendAgentMessage("gemini", {
            type: "permission-request",
            permissionId: msg.id,
            toolName: payload.toolName || msg.reason || "unknown",
            description: msg.reason || payload.toolName || "",
            options: payload
          });
          break;
        case "exec-approval-request":
          const execApprovalMsg = msg;
          const callId = execApprovalMsg.call_id || execApprovalMsg.callId || node_crypto.randomUUID();
          const { call_id, type, ...inputs } = execApprovalMsg;
          api.logger.debug(`[gemini] Exec approval request received: ${callId}`);
          messageBuffer.addMessage(`Exec approval requested: ${callId}`, "tool");
          session.sendAgentMessage("gemini", {
            type: "tool-call",
            name: "GeminiBash",
            // Similar to Codex's CodexBash
            callId,
            input: inputs,
            id: node_crypto.randomUUID()
          });
          break;
        case "patch-apply-begin":
          const patchBeginMsg = msg;
          const patchCallId = patchBeginMsg.call_id || patchBeginMsg.callId || node_crypto.randomUUID();
          const { call_id: patchCallIdVar, type: patchType, auto_approved, changes } = patchBeginMsg;
          const changeCount = changes ? Object.keys(changes).length : 0;
          const filesMsg = changeCount === 1 ? "1 file" : `${changeCount} files`;
          messageBuffer.addMessage(`Modifying ${filesMsg}...`, "tool");
          api.logger.debug(`[gemini] Patch apply begin: ${patchCallId}, files: ${changeCount}`);
          session.sendAgentMessage("gemini", {
            type: "tool-call",
            name: "GeminiPatch",
            // Similar to Codex's CodexPatch
            callId: patchCallId,
            input: {
              auto_approved,
              changes
            },
            id: node_crypto.randomUUID()
          });
          break;
        case "patch-apply-end":
          const patchEndMsg = msg;
          const patchEndCallId = patchEndMsg.call_id || patchEndMsg.callId || node_crypto.randomUUID();
          const { call_id: patchEndCallIdVar, type: patchEndType, stdout, stderr, success } = patchEndMsg;
          if (success) {
            const message = stdout || "Files modified successfully";
            messageBuffer.addMessage(message.substring(0, 200), "result");
          } else {
            const errorMsg = stderr || "Failed to modify files";
            messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, "result");
          }
          api.logger.debug(`[gemini] Patch apply end: ${patchEndCallId}, success: ${success}`);
          session.sendAgentMessage("gemini", {
            type: "tool-result",
            callId: patchEndCallId,
            output: {
              stdout,
              stderr,
              success
            },
            id: node_crypto.randomUUID()
          });
          break;
        case "event":
          if (msg.name === "thinking") {
            const thinkingPayload = msg.payload;
            const thinkingText = thinkingPayload && typeof thinkingPayload === "object" && "text" in thinkingPayload ? String(thinkingPayload.text || "") : "";
            if (thinkingText) {
              reasoningProcessor.processChunk(thinkingText);
              api.logger.debug(`[gemini] \u{1F4AD} Thinking chunk received: ${thinkingText.length} chars - Preview: ${thinkingText.substring(0, 100)}...`);
              if (!thinkingText.startsWith("**")) {
                const thinkingPreview = thinkingText.substring(0, 100);
                messageBuffer.updateLastMessage(`[Thinking] ${thinkingPreview}...`, "system");
              }
            }
            session.sendAgentMessage("gemini", {
              type: "thinking",
              text: thinkingText
            });
          }
          break;
      }
    });
  }
  let first = true;
  try {
    let currentModeHash = null;
    let pending = null;
    while (!shouldExit) {
      let message = pending;
      pending = null;
      if (!message) {
        api.logger.debug("[gemini] Main loop: waiting for messages from queue...");
        const waitSignal = abortController.signal;
        const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
        if (!batch) {
          if (waitSignal.aborted && !shouldExit) {
            api.logger.debug("[gemini] Main loop: wait aborted, continuing...");
            continue;
          }
          api.logger.debug("[gemini] Main loop: no batch received, breaking...");
          break;
        }
        api.logger.debug(`[gemini] Main loop: received message from queue (length: ${batch.message.length})`);
        message = batch;
      }
      if (!message) {
        break;
      }
      let injectHistoryContext = false;
      if (wasSessionCreated && currentModeHash && message.hash !== currentModeHash) {
        api.logger.debug("[Gemini] Mode changed \u2013 restarting Gemini session");
        messageBuffer.addMessage("\u2550".repeat(40), "status");
        if (conversationHistory.hasHistory()) {
          messageBuffer.addMessage(`Switching model (preserving ${conversationHistory.size()} messages of context)...`, "status");
          injectHistoryContext = true;
          api.logger.debug(`[Gemini] Will inject conversation history: ${conversationHistory.getSummary()}`);
        } else {
          messageBuffer.addMessage("Starting new Gemini session (mode changed)...", "status");
        }
        permissionHandler.reset();
        reasoningProcessor.abort();
        if (geminiBackend) {
          await geminiBackend.dispose();
          geminiBackend = null;
        }
        const modelToUse = message.mode?.model === void 0 ? void 0 : message.mode.model || null;
        const backendResult = createGeminiBackend({
          cwd: process.cwd(),
          mcpServers,
          permissionHandler,
          cloudToken,
          currentUserEmail,
          // Pass model from message - if undefined, will use local config/env/default
          // If explicitly null, will skip local config and use env/default
          model: modelToUse
        });
        geminiBackend = backendResult.backend;
        setupGeminiMessageHandler(geminiBackend);
        const actualModel = backendResult.model;
        api.logger.debug(`[gemini] Model change - modelToUse=${modelToUse}, actualModel=${actualModel} (from ${backendResult.modelSource})`);
        conversationHistory.setCurrentModel(actualModel);
        api.logger.debug("[gemini] Starting new ACP session with model:", actualModel);
        const { sessionId } = await geminiBackend.startSession();
        acpSessionId = sessionId;
        api.logger.debug(`[gemini] New ACP session started: ${acpSessionId}`);
        api.logger.debug(`[gemini] Calling updateDisplayedModel with: ${actualModel}`);
        updateDisplayedModel(actualModel, false);
        updatePermissionMode(message.mode.permissionMode);
        wasSessionCreated = true;
        currentModeHash = message.hash;
        first = false;
      }
      currentModeHash = message.hash;
      const userMessageToShow = message.mode?.originalUserMessage || message.message;
      messageBuffer.addMessage(userMessageToShow, "user");
      isProcessingMessage = true;
      try {
        if (first || !wasSessionCreated) {
          if (!geminiBackend) {
            const modelToUse = message.mode?.model === void 0 ? void 0 : message.mode.model || null;
            const backendResult = createGeminiBackend({
              cwd: process.cwd(),
              mcpServers,
              permissionHandler,
              cloudToken,
              currentUserEmail,
              // Pass model from message - if undefined, will use local config/env/default
              // If explicitly null, will skip local config and use env/default
              model: modelToUse
            });
            geminiBackend = backendResult.backend;
            setupGeminiMessageHandler(geminiBackend);
            const actualModel = backendResult.model;
            api.logger.debug(`[gemini] Backend created, model will be: ${actualModel} (from ${backendResult.modelSource})`);
            api.logger.debug(`[gemini] Calling updateDisplayedModel with: ${actualModel}`);
            updateDisplayedModel(actualModel, false);
            conversationHistory.setCurrentModel(actualModel);
          }
          if (!acpSessionId) {
            api.logger.debug("[gemini] Starting ACP session...");
            updatePermissionMode(message.mode.permissionMode);
            const { sessionId } = await geminiBackend.startSession();
            acpSessionId = sessionId;
            api.logger.debug(`[gemini] ACP session started: ${acpSessionId}`);
            wasSessionCreated = true;
            currentModeHash = message.hash;
            api.logger.debug(`[gemini] Displaying model in UI: ${displayedModel || "gemini-2.5-pro"}, displayedModel: ${displayedModel}`);
          }
        }
        if (!acpSessionId) {
          throw new Error("ACP session not started");
        }
        accumulatedResponse = "";
        isResponseInProgress = false;
        hadToolCallInTurn = false;
        taskStartedSent = false;
        pendingChangeTitle = message.message.includes("change_title") || message.message.includes("happy__change_title");
        changeTitleCompleted = false;
        if (!geminiBackend || !acpSessionId) {
          throw new Error("Gemini backend or session not initialized");
        }
        let promptToSend = message.message;
        if (injectHistoryContext && conversationHistory.hasHistory()) {
          const historyContext = conversationHistory.getContextForNewSession();
          promptToSend = historyContext + promptToSend;
          api.logger.debug(`[gemini] Injected conversation history context (${historyContext.length} chars)`);
        }
        api.logger.debug(`[gemini] Sending prompt to Gemini (length: ${promptToSend.length}): ${promptToSend.substring(0, 100)}...`);
        api.logger.debug(`[gemini] Full prompt: ${promptToSend}`);
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 2e3;
        let lastError = null;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await geminiBackend.sendPrompt(acpSessionId, promptToSend);
            api.logger.debug("[gemini] Prompt sent successfully");
            if (geminiBackend.waitForResponseComplete) {
              await geminiBackend.waitForResponseComplete(12e4);
              api.logger.debug("[gemini] Response complete");
            }
            break;
          } catch (promptError) {
            lastError = promptError;
            const errObj = promptError;
            const errorDetails = errObj?.data?.details || errObj?.details || errObj?.message || "";
            const errorCode = errObj?.code;
            const isQuotaError = errorDetails.includes("exhausted") || errorDetails.includes("quota") || errorDetails.includes("capacity");
            if (isQuotaError) {
              const resetTimeMatch = errorDetails.match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
              let resetTimeMsg = "";
              if (resetTimeMatch) {
                const parts = resetTimeMatch.slice(1).filter(Boolean).join("");
                resetTimeMsg = ` Quota resets in ${parts}.`;
              }
              const quotaMsg = `Gemini quota exceeded.${resetTimeMsg} Try using a different model (gemini-2.5-flash-lite) or wait for quota reset.`;
              messageBuffer.addMessage(quotaMsg, "status");
              session.sendAgentMessage("gemini", { type: "message", message: quotaMsg });
              throw promptError;
            }
            const isEmptyResponseError = errorDetails.includes("empty response") || errorDetails.includes("Model stream ended");
            const isInternalError = errorCode === -32603;
            const isRetryable = isEmptyResponseError || isInternalError;
            if (isRetryable && attempt < MAX_RETRIES) {
              api.logger.debug(`[gemini] Retryable error on attempt ${attempt}/${MAX_RETRIES}: ${errorDetails}`);
              messageBuffer.addMessage(`Gemini returned empty response, retrying (${attempt}/${MAX_RETRIES})...`, "status");
              await new Promise((resolve2) => setTimeout(resolve2, RETRY_DELAY_MS * attempt));
              continue;
            }
            throw promptError;
          }
        }
        if (lastError && MAX_RETRIES > 1) {
          api.logger.debug("[gemini] Prompt succeeded after retries");
        }
        if (first) {
          first = false;
        }
      } catch (error) {
        api.logger.debug("[gemini] Error in gemini session:", error);
        const isAbortError = error instanceof Error && error.name === "AbortError";
        if (isAbortError) {
          messageBuffer.addMessage("Aborted by user", "status");
          session.sendSessionEvent({ type: "message", message: "Aborted by user" });
        } else {
          let errorMsg = "Process error occurred";
          if (typeof error === "object" && error !== null) {
            const errObj = error;
            const errorDetails = errObj.data?.details || errObj.details || "";
            const errorCode = errObj.code || errObj.status || errObj.response?.status;
            const errorMessage = errObj.message || errObj.error?.message || "";
            const errorString = String(error);
            if (errorCode === 404 || errorDetails.includes("notFound") || errorDetails.includes("404") || errorMessage.includes("not found") || errorMessage.includes("404")) {
              const currentModel2 = displayedModel || "gemini-2.5-pro";
              errorMsg = `Model "${currentModel2}" not found. Available models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite`;
            } else if (errorCode === -32603 || errorDetails.includes("empty response") || errorDetails.includes("Model stream ended")) {
              errorMsg = "Gemini API returned empty response after retries. This is a temporary issue - please try again.";
            } else if (errorCode === 429 || errorDetails.includes("429") || errorMessage.includes("429") || errorString.includes("429") || errorDetails.includes("rateLimitExceeded") || errorDetails.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("Rate limit exceeded") || errorMessage.includes("Resource exhausted") || errorString.includes("rateLimitExceeded") || errorString.includes("RESOURCE_EXHAUSTED")) {
              errorMsg = "Gemini API rate limit exceeded. Please wait a moment and try again. The API will retry automatically.";
            } else if (errorDetails.includes("quota") || errorMessage.includes("quota") || errorString.includes("quota") || errorDetails.includes("exhausted") || errorDetails.includes("capacity")) {
              const resetTimeMatch = (errorDetails + errorMessage + errorString).match(/reset after (\d+h)?(\d+m)?(\d+s)?/i);
              let resetTimeMsg = "";
              if (resetTimeMatch) {
                const parts = resetTimeMatch.slice(1).filter(Boolean).join("");
                resetTimeMsg = ` Quota resets in ${parts}.`;
              }
              errorMsg = `Gemini quota exceeded.${resetTimeMsg} Try using a different model (gemini-2.5-flash-lite) or wait for quota reset.`;
            } else if (errorMessage.includes("Authentication required") || errorDetails.includes("Authentication required") || errorCode === -32e3) {
              errorMsg = `Authentication required. For Google Workspace accounts, you need to set a Google Cloud Project:
  happy gemini project set <your-project-id>
Or use a different Google account: happy connect gemini
Guide: https://goo.gle/gemini-cli-auth-docs#workspace-gca`;
            } else if (Object.keys(error).length === 0) {
              errorMsg = 'Failed to start Gemini. Is "gemini" CLI installed? Run: npm install -g @google/gemini-cli';
            } else if (errObj.message || errorMessage) {
              errorMsg = errorDetails || errorMessage || errObj.message;
            }
          } else if (error instanceof Error) {
            errorMsg = error.message;
          }
          messageBuffer.addMessage(errorMsg, "status");
          session.sendAgentMessage("gemini", {
            type: "message",
            message: errorMsg
          });
        }
      } finally {
        permissionHandler.reset();
        reasoningProcessor.abort();
        diffProcessor.reset();
        if (accumulatedResponse.trim()) {
          const { text: messageText, options } = parseOptionsFromText(accumulatedResponse);
          conversationHistory.addAssistantMessage(messageText);
          let finalMessageText = messageText;
          if (options.length > 0) {
            const optionsXml = formatOptionsXml(options);
            finalMessageText = messageText + optionsXml;
            api.logger.debug(`[gemini] Found ${options.length} options in response:`, options);
          } else if (hasIncompleteOptions(accumulatedResponse)) {
            api.logger.debug(`[gemini] Warning: Incomplete options block detected`);
          }
          const messagePayload = {
            type: "message",
            message: finalMessageText,
            id: node_crypto.randomUUID(),
            ...options.length > 0 && { options }
          };
          api.logger.debug(`[gemini] Sending complete message to mobile (length: ${finalMessageText.length}): ${finalMessageText.substring(0, 100)}...`);
          session.sendAgentMessage("gemini", messagePayload);
          accumulatedResponse = "";
          isResponseInProgress = false;
        }
        session.sendAgentMessage("gemini", {
          type: "task_complete",
          id: node_crypto.randomUUID()
        });
        hadToolCallInTurn = false;
        pendingChangeTitle = false;
        changeTitleCompleted = false;
        taskStartedSent = false;
        thinking = false;
        session.keepAlive(thinking, "remote");
        emitReadyIfIdle();
        isProcessingMessage = false;
        applyPendingSessionSwap();
        api.logger.debug(`[gemini] Main loop: turn completed, continuing to next iteration (queue size: ${messageQueue.size()})`);
      }
    }
  } finally {
    api.logger.debug("[gemini]: Final cleanup start");
    if (reconnectionHandle) {
      api.logger.debug("[gemini]: Cancelling offline reconnection");
      reconnectionHandle.cancel();
    }
    try {
      session.sendSessionDeath();
      await session.flush();
      await session.close();
    } catch (e) {
      api.logger.debug("[gemini]: Error while closing session", e);
    }
    if (geminiBackend) {
      await geminiBackend.dispose();
    }
    happyServer.stop();
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {
      }
    }
    if (hasTTY) {
      try {
        process.stdin.pause();
      } catch {
      }
    }
    clearInterval(keepAliveInterval);
    if (inkInstance) {
      inkInstance.unmount();
    }
    messageBuffer.clear();
    api.logger.debug("[gemini]: Final cleanup completed");
  }
}

exports.runGemini = runGemini;
