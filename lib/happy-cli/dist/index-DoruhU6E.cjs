'use strict';

var AcpBackend = require('./AcpBackend-rwDszjtn.cjs');
var api = require('./types-DB662inl.cjs');
var AcpSessionManager = require('./AcpSessionManager-JF5hSy2d.cjs');
var node_crypto = require('node:crypto');
var node_path = require('node:path');
var index = require('./index-BJ1EcyS9.cjs');
var persistence = require('./persistence-CoLu_Clg.cjs');
require('node:child_process');
require('@agentclientprotocol/sdk');
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
require('node:readline');
require('@anthropic-ai/sandbox-runtime');
require('node:fs/promises');
require('ink');
require('react');
require('@anthropic-ai/claude-agent-sdk');
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

const SUPPORTED_CATEGORIES = /* @__PURE__ */ new Set(["mode", "model", "thought_level"]);
function isRecord$1(value) {
  return !!value && typeof value === "object";
}
function isOptionValue(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  return typeof value.value === "string" && typeof value.name === "string";
}
function isOptionGroup(value) {
  if (!isRecord$1(value)) {
    return false;
  }
  return Array.isArray(value.options);
}
function flattenConfigSelectOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }
  const flattened = [];
  for (const entry of options) {
    if (isOptionValue(entry)) {
      flattened.push({
        code: entry.value,
        value: entry.name,
        ...entry.description !== void 0 ? { description: entry.description } : {}
      });
      continue;
    }
    if (isOptionGroup(entry)) {
      for (const grouped of entry.options) {
        if (!isOptionValue(grouped)) {
          continue;
        }
        flattened.push({
          code: grouped.value,
          value: grouped.name,
          ...grouped.description !== void 0 ? { description: grouped.description } : {}
        });
      }
    }
  }
  return flattened;
}
function findConfigOptionByCategory(configOptions, category) {
  for (const option of configOptions) {
    if (option.type !== "select") {
      continue;
    }
    if (option.category !== category) {
      continue;
    }
    return option;
  }
  return null;
}
function applyConfigCategory(metadata, option, kind) {
  if (!option) {
    if (kind === "model") {
      delete metadata.models;
      delete metadata.currentModelCode;
    } else if (kind === "mode") {
      delete metadata.operatingModes;
      delete metadata.currentOperatingModeCode;
    } else if (kind === "thought_level") {
      delete metadata.thoughtLevels;
      delete metadata.currentThoughtLevelCode;
    }
    return;
  }
  const values = flattenConfigSelectOptions(option.options);
  const currentCode = option.currentValue;
  if (kind === "model") {
    metadata.models = values;
    metadata.currentModelCode = currentCode;
    return;
  }
  if (kind === "mode") {
    metadata.operatingModes = values;
    metadata.currentOperatingModeCode = currentCode;
    return;
  }
  metadata.thoughtLevels = values;
  metadata.currentThoughtLevelCode = currentCode;
}
function extractConfigOptionsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord$1(payload) && Array.isArray(payload.configOptions)) {
    return payload.configOptions;
  }
  return null;
}
function extractModeStateFromPayload(payload) {
  if (!isRecord$1(payload)) {
    return null;
  }
  if (!Array.isArray(payload.availableModes)) {
    return null;
  }
  if (typeof payload.currentModeId !== "string") {
    return null;
  }
  return payload;
}
function extractModelStateFromPayload(payload) {
  if (!isRecord$1(payload)) {
    return null;
  }
  if (!Array.isArray(payload.availableModels)) {
    return null;
  }
  if (typeof payload.currentModelId !== "string") {
    return null;
  }
  return payload;
}
function extractCurrentModeIdFromPayload(payload) {
  if (!isRecord$1(payload)) {
    return null;
  }
  if (typeof payload.currentModeId !== "string") {
    return null;
  }
  return payload.currentModeId;
}
function mergeAcpSessionConfigIntoMetadata(metadata, snapshot) {
  const next = { ...metadata };
  let hasModeFromConfig = false;
  let hasModelFromConfig = false;
  if (Array.isArray(snapshot.configOptions)) {
    const filtered = snapshot.configOptions.filter(
      (option) => option.type === "select" && typeof option.category === "string" && SUPPORTED_CATEGORIES.has(option.category)
    );
    const modeOption = findConfigOptionByCategory(filtered, "mode");
    const modelOption = findConfigOptionByCategory(filtered, "model");
    const thoughtLevelOption = findConfigOptionByCategory(filtered, "thought_level");
    hasModeFromConfig = modeOption !== null;
    hasModelFromConfig = modelOption !== null;
    applyConfigCategory(next, modeOption, "mode");
    applyConfigCategory(next, modelOption, "model");
    applyConfigCategory(next, thoughtLevelOption, "thought_level");
  }
  if (!hasModelFromConfig && snapshot.models) {
    next.models = snapshot.models.availableModels.map((model) => ({
      code: model.modelId,
      value: model.name,
      ...model.description !== void 0 ? { description: model.description } : {}
    }));
    next.currentModelCode = snapshot.models.currentModelId;
  }
  if (!hasModeFromConfig && snapshot.modes) {
    next.operatingModes = snapshot.modes.availableModes.map((mode) => ({
      code: mode.id,
      value: mode.name,
      ...mode.description !== void 0 ? { description: mode.description } : {}
    }));
    next.currentOperatingModeCode = snapshot.modes.currentModeId;
  }
  if (snapshot.currentModeId) {
    next.currentOperatingModeCode = snapshot.currentModeId;
  }
  return next;
}

const TURN_TIMEOUT_MS = 5 * 60 * 1e3;
const ACP_EVENT_PREVIEW_CHARS = 240;
const ACP_RAW_PREVIEW_CHARS = 2e3;
const ACP_COLOR_RESET = "\x1B[0m";
const ACP_LOG_COLORS = {
  muted: "\x1B[90m",
  error: "\x1B[31m",
  incoming: "\x1B[32m",
  outgoing: "\x1B[34m",
  tool: "\x1B[38;5;208m"
};
function shouldUseColoredAcpLogs() {
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR !== void 0) {
    return true;
  }
  return process.stdout.isTTY === true || process.stderr.isTTY === true;
}
function formatAcpTime(date = /* @__PURE__ */ new Date()) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
function colorizeAcpLine(kind, line) {
  if (!shouldUseColoredAcpLogs()) {
    return line;
  }
  return `${ACP_LOG_COLORS[kind]}${line}${ACP_COLOR_RESET}`;
}
function logAcp(kind, message) {
  const line = `[${formatAcpTime()}] ${message}`;
  console.log(colorizeAcpLine(kind, line));
}
function toSingleLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
function truncateForConsole(text, limit) {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}...`;
}
function formatUnknownForConsole(value, limit) {
  let serialized = "";
  if (typeof value === "string") {
    serialized = value;
  } else {
    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = String(value);
    }
  }
  return truncateForConsole(toSingleLine(serialized), limit);
}
function formatTextForConsole(text) {
  return JSON.stringify(truncateForConsole(toSingleLine(text), ACP_EVENT_PREVIEW_CHARS));
}
function formatOptionalDetail(text, limit = ACP_EVENT_PREVIEW_CHARS) {
  if (!text) {
    return "";
  }
  return ` - ${truncateForConsole(toSingleLine(text), limit)}`;
}
function extractThinkingText(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object" && typeof payload.text === "string") {
    return payload.text;
  }
  return "";
}
function formatAcpMessageForFrontend(agentName, msg, detailed) {
  switch (msg.type) {
    case "status":
      return null;
    case "model-output": {
      const text = msg.textDelta ?? msg.fullText ?? "";
      return {
        kind: "outgoing",
        text: `Outgoing message: ${formatTextForConsole(text)}`
      };
    }
    case "tool-call":
      return {
        kind: "tool",
        text: `Tool: ${msg.toolName} started (callId=${msg.callId})`
      };
    case "tool-result":
      return {
        kind: "tool",
        text: `Tool: ${msg.toolName} completed (callId=${msg.callId})`
      };
    case "permission-request":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing permission request from ${agentName}: id=${msg.id} reason=${msg.reason}`
      };
    case "permission-response":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing permission response from ${agentName}: id=${msg.id} approved=${msg.approved}`
      };
    case "fs-edit":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing fs edit from ${agentName}: description=${formatTextForConsole(msg.description)}`
      };
    case "terminal-output":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing terminal output from ${agentName}: text=${formatTextForConsole(msg.data)}`
      };
    case "event": {
      if (msg.name === "thinking") {
        const thinkingText = extractThinkingText(msg.payload);
        return {
          kind: "muted",
          text: `Thinking: ${formatTextForConsole(thinkingText)}`
        };
      }
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing event from ${agentName}: name=${msg.name} payload=${formatUnknownForConsole(msg.payload, ACP_EVENT_PREVIEW_CHARS)}`
      };
    }
    case "token-count":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing token count from ${agentName}: data=${formatUnknownForConsole(msg, ACP_EVENT_PREVIEW_CHARS)}`
      };
    case "exec-approval-request":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing exec approval request from ${agentName}: callId=${msg.call_id}`
      };
    case "patch-apply-begin":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing patch apply begin from ${agentName}: callId=${msg.call_id} autoApproved=${msg.auto_approved === true}`
      };
    case "patch-apply-end":
      if (!detailed) {
        return null;
      }
      return {
        kind: "muted",
        text: `Outgoing patch apply end from ${agentName}: callId=${msg.call_id} success=${msg.success}`
      };
    default:
      return null;
  }
}
function formatEnvelopeForServerLog(agentName, envelope) {
  if (envelope.ev.t === "text") {
    const thinkingPrefix = envelope.ev.thinking ? "thinking" : "text";
    return {
      kind: "incoming",
      text: `Incoming ${thinkingPrefix} prompt for ${agentName}: ${formatUnknownForConsole(envelope.ev.text, ACP_EVENT_PREVIEW_CHARS)}`
    };
  }
  if (envelope.ev.t === "tool-call-start") {
    return {
      kind: "tool",
      text: `Tool start sent to server from ${agentName}: tool=${envelope.ev.name} callId=${envelope.ev.call} args=${formatUnknownForConsole(envelope.ev.args, ACP_EVENT_PREVIEW_CHARS)}`
    };
  }
  if (envelope.ev.t === "tool-call-end") {
    return {
      kind: "tool",
      text: `Tool end sent to server from ${agentName}: callId=${envelope.ev.call}`
    };
  }
  if (envelope.ev.t === "turn-start") {
    return {
      kind: "incoming",
      text: `Incoming turn start for ${agentName}`
    };
  }
  if (envelope.ev.t === "turn-end") {
    return {
      kind: "incoming",
      text: `Incoming turn end for ${agentName}: status=${envelope.ev.status}`
    };
  }
  return {
    kind: "incoming",
    text: `Incoming ${envelope.ev.t} for ${agentName}: ${formatUnknownForConsole(envelope.ev, ACP_EVENT_PREVIEW_CHARS)}`
  };
}
function isRecord(value) {
  return !!value && typeof value === "object";
}
function isSelectValue(value) {
  return isRecord(value) && typeof value.value === "string" && typeof value.name === "string";
}
function isSelectGroup(value) {
  return isRecord(value) && Array.isArray(value.options);
}
function flattenSelectOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }
  const flattened = [];
  for (const entry of options) {
    if (isSelectValue(entry)) {
      flattened.push({ code: entry.value, value: entry.name });
      continue;
    }
    if (isSelectGroup(entry)) {
      for (const grouped of entry.options) {
        if (!isSelectValue(grouped)) {
          continue;
        }
        flattened.push({ code: grouped.value, value: grouped.name });
      }
    }
  }
  return flattened;
}
function extractConfigSelector(configOptions, category) {
  const optionMatchesCategory = (option) => {
    if (option.category === category) {
      return true;
    }
    const id = normalizeComparable(option.id);
    const name = normalizeComparable(option.name);
    if (category === "model") {
      return id.includes("model") || name.includes("model");
    }
    return id.includes("mode") || id.includes("permission") || name.includes("mode") || name.includes("permission");
  };
  for (const option of configOptions) {
    if (option.type !== "select" || !optionMatchesCategory(option)) {
      continue;
    }
    return {
      configId: option.id,
      currentCode: option.currentValue,
      options: flattenSelectOptions(option.options)
    };
  }
  return null;
}
function normalizeComparable(value) {
  return value.trim().toLowerCase();
}
function resolveRequestedCode(options, requested) {
  for (const option of options) {
    if (option.code === requested || option.value === requested) {
      return option.code;
    }
  }
  const normalizedRequested = normalizeComparable(requested);
  for (const option of options) {
    if (normalizeComparable(option.code) === normalizedRequested || normalizeComparable(option.value) === normalizedRequested) {
      return option.code;
    }
  }
  return null;
}
function resolveRequestedLegacyModeCode(modes, requested) {
  for (const mode of modes.availableModes) {
    if (mode.id === requested || mode.name === requested) {
      return mode.id;
    }
  }
  const normalizedRequested = normalizeComparable(requested);
  for (const mode of modes.availableModes) {
    if (normalizeComparable(mode.id) === normalizedRequested || normalizeComparable(mode.name) === normalizedRequested) {
      return mode.id;
    }
  }
  return null;
}
function resolveRequestedLegacyModelCode(models, requested) {
  for (const model of models.availableModels) {
    if (model.modelId === requested || model.name === requested) {
      return model.modelId;
    }
  }
  const normalizedRequested = normalizeComparable(requested);
  for (const model of models.availableModels) {
    if (normalizeComparable(model.modelId) === normalizedRequested || normalizeComparable(model.name) === normalizedRequested) {
      return model.modelId;
    }
  }
  return null;
}
class GenericAcpPermissionHandler extends index.BasePermissionHandler {
  logPrefix;
  constructor(session, agentName) {
    super(session);
    this.logPrefix = `[${agentName}]`;
  }
  getLogPrefix() {
    return this.logPrefix;
  }
  async handleToolCall(toolCallId, toolName, input) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(toolCallId, {
        resolve,
        reject,
        toolName,
        input
      });
      this.addPendingRequestToState(toolCallId, toolName, input);
      api.logger.debug(`${this.logPrefix} Permission request sent for tool: ${toolName} (${toolCallId})`);
    });
  }
}
function resolveSessionFlavor(agentName) {
  if (agentName === "gemini") {
    return "gemini";
  }
  if (agentName === "opencode") {
    return "opencode";
  }
  return "acp";
}
async function runAcp(opts) {
  const verbose = opts.verbose === true;
  const sessionTag = node_crypto.randomUUID();
  api.connectionState.setBackend(opts.agentName);
  const api$1 = await api.ApiClient.create(opts.credentials);
  const settings = await persistence.readSettings();
  if (!settings?.machineId) {
    throw new Error("No machine ID found in settings");
  }
  await api$1.getOrCreateMachine({
    machineId: settings.machineId,
    metadata: index.initialMachineMetadata
  });
  const { state, metadata } = index.createSessionMetadata({
    flavor: resolveSessionFlavor(opts.agentName),
    machineId: settings.machineId,
    startedBy: opts.startedBy,
    sandbox: settings.sandboxConfig
  });
  const response = await api$1.getOrCreateSession({ tag: sessionTag, metadata, state });
  if (response) {
    logAcp("muted", `Happy Session ID: ${response.id}`);
  }
  let session;
  let permissionHandler;
  const { session: initialSession, reconnectionHandle } = index.setupOfflineReconnection({
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
  if (response) {
    try {
      await index.notifyDaemonSessionStarted(response.id, metadata, {
        encryptionKey: api.encodeBase64(response.encryptionKey),
        encryptionVariant: response.encryptionVariant,
        seq: response.seq,
        metadataVersion: response.metadataVersion,
        agentStateVersion: response.agentStateVersion
      });
    } catch (error) {
      api.logger.debug("[acp] Failed to report session to daemon:", error);
    }
  }
  permissionHandler = new GenericAcpPermissionHandler(session, opts.agentName);
  const sessionManager = new AcpSessionManager.AcpSessionManager();
  const messageQueue = new index.MessageQueue2((mode) => index.hashObject(mode));
  let currentPermissionMode;
  let currentModel;
  let modeSelector = null;
  let modelSelector = null;
  let legacyModes = null;
  let legacyModels = null;
  let sawSlashCommands = false;
  let sawModes = false;
  let sawModels = false;
  const happyServer = await index.startHappyServer(session);
  const mcpServers = {
    happy: {
      command: node_path.join(api.projectPath(), "bin", "happy-mcp.mjs"),
      args: ["--url", happyServer.url]
    }
  };
  const backend = new AcpBackend.AcpBackend({
    agentName: opts.agentName,
    cwd: process.cwd(),
    command: opts.command,
    args: opts.args,
    mcpServers,
    permissionHandler,
    transportHandler: new AcpBackend.DefaultTransport(opts.agentName),
    verbose
  });
  let thinking = false;
  let acpSessionId = null;
  let shouldExit = false;
  let abortController = new AbortController();
  let pendingTurn = null;
  const clearPendingTurn = (error) => {
    if (!pendingTurn) {
      return;
    }
    clearTimeout(pendingTurn.timeout);
    const current = pendingTurn;
    pendingTurn = null;
    if (error) {
      current.reject(error);
      return;
    }
    current.resolve();
  };
  const waitForTurnEnd = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingTurn = null;
      reject(new Error(`Timed out waiting for ${opts.agentName} to finish the turn`));
    }, TURN_TIMEOUT_MS);
    pendingTurn = { resolve, reject, timeout };
  });
  const stopRunnerFromBackendStatus = (status, detail) => {
    const reason = detail ? `${opts.agentName} backend ${status}: ${detail}` : `${opts.agentName} backend ${status}`;
    api.logger.debug(`[${opts.agentName}] ${reason}; stopping ACP runner`);
    shouldExit = true;
    messageQueue.close();
    clearPendingTurn(new Error(reason));
  };
  const sendEnvelopes = (envelopes) => {
    for (const envelope of envelopes) {
      if (verbose) {
        const formatted = formatEnvelopeForServerLog(opts.agentName, envelope);
        logAcp("muted", formatted.text);
      }
      session.sendSessionProtocolMessage(envelope);
      if (verbose) {
        logAcp("muted", `Incoming raw envelope for ${opts.agentName}: ${formatUnknownForConsole(envelope, ACP_RAW_PREVIEW_CHARS)}`);
      }
    }
  };
  const switchPermissionModeIfRequested = async (requestedMode) => {
    if (!requestedMode) {
      return;
    }
    if (modeSelector) {
      const resolved = resolveRequestedCode(modeSelector.options, requestedMode);
      if (!resolved) {
        api.logger.debug(`[${opts.agentName}] Ignoring unknown ACP permission mode request: ${requestedMode}`);
        return;
      }
      if (resolved === modeSelector.currentCode) {
        return;
      }
      const switched2 = await backend.setSessionConfigOption(modeSelector.configId, resolved);
      if (switched2) {
        modeSelector.currentCode = resolved;
        return;
      }
    }
    if (!legacyModes) {
      return;
    }
    const resolvedLegacyMode = resolveRequestedLegacyModeCode(legacyModes, requestedMode);
    if (!resolvedLegacyMode) {
      api.logger.debug(`[${opts.agentName}] Ignoring unknown ACP legacy mode request: ${requestedMode}`);
      return;
    }
    if (resolvedLegacyMode === legacyModes.currentModeId) {
      return;
    }
    const switched = await backend.setSessionMode(resolvedLegacyMode);
    if (switched) {
      legacyModes = {
        ...legacyModes,
        currentModeId: resolvedLegacyMode
      };
    }
  };
  const switchModelIfRequested = async (requestedModel) => {
    if (!requestedModel) {
      return;
    }
    if (modelSelector) {
      const resolved = resolveRequestedCode(modelSelector.options, requestedModel);
      if (!resolved) {
        api.logger.debug(`[${opts.agentName}] Ignoring unknown ACP model request: ${requestedModel}`);
        return;
      }
      if (resolved === modelSelector.currentCode) {
        return;
      }
      const switched2 = await backend.setSessionConfigOption(modelSelector.configId, resolved);
      if (switched2) {
        modelSelector.currentCode = resolved;
        return;
      }
    }
    if (!legacyModels) {
      return;
    }
    const resolvedLegacyModel = resolveRequestedLegacyModelCode(legacyModels, requestedModel);
    if (!resolvedLegacyModel) {
      api.logger.debug(`[${opts.agentName}] Ignoring unknown ACP legacy model request: ${requestedModel}`);
      return;
    }
    if (resolvedLegacyModel === legacyModels.currentModelId) {
      return;
    }
    const switched = await backend.setSessionModel(resolvedLegacyModel);
    if (switched) {
      legacyModels = {
        ...legacyModels,
        currentModelId: resolvedLegacyModel
      };
    }
  };
  const onBackendMessage = (msg) => {
    if (verbose) {
      logAcp("muted", `Outgoing raw backend message from ${opts.agentName}: ${formatUnknownForConsole(msg, ACP_RAW_PREVIEW_CHARS)}`);
    }
    if (msg.type === "event" && msg.name === "available_commands") {
      const commands = msg.payload;
      const commandNames = commands.map((c) => c.name);
      sawSlashCommands = commands.length > 0;
      if (verbose) {
        logAcp("muted", `Outgoing slash commands from ${opts.agentName} (${commands.length}):`);
        for (const command of commands) {
          logAcp("muted", `  /${command.name}${formatOptionalDetail(command.description, 160)}`);
        }
      }
      session.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        slashCommands: commandNames
      }));
    }
    if (msg.type === "event" && msg.name === "config_options_update") {
      const configOptions = extractConfigOptionsFromPayload(msg.payload);
      if (configOptions) {
        if (verbose) {
          logAcp("muted", `Outgoing config options from ${opts.agentName} (${configOptions.length}):`);
          for (const option of configOptions) {
            if (option.type === "select") {
              const optionValues = flattenSelectOptions(option.options);
              logAcp("muted", `  config=${option.id} category=${option.category ?? "unknown"} current=${option.currentValue} options=${optionValues.length}`);
            } else {
              logAcp("muted", `  config=${option.id} type=${option.type} category=${option.category ?? "unknown"}`);
            }
          }
        }
        modeSelector = extractConfigSelector(configOptions, "mode");
        modelSelector = extractConfigSelector(configOptions, "model");
        if (verbose) {
          if (modeSelector) {
            sawModes = true;
            logAcp("muted", `Outgoing mode options from ${opts.agentName} (${modeSelector.options.length}), current=${modeSelector.currentCode}:`);
            for (const option of modeSelector.options) {
              logAcp("muted", `  mode=${option.code} label=${option.value}`);
            }
          } else {
            logAcp("muted", `Outgoing mode options from ${opts.agentName}: not reported in config options`);
          }
          if (modelSelector) {
            sawModels = true;
            logAcp("muted", `Outgoing model options from ${opts.agentName} (${modelSelector.options.length}), current=${modelSelector.currentCode}:`);
            for (const option of modelSelector.options) {
              logAcp("muted", `  model=${option.code} label=${option.value}`);
            }
          } else {
            logAcp("muted", `Outgoing model options from ${opts.agentName}: not reported in config options`);
          }
        }
        session.updateMetadata(
          (currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { configOptions })
        );
      }
    }
    if (msg.type === "event" && msg.name === "modes_update") {
      const modes = extractModeStateFromPayload(msg.payload);
      if (modes) {
        legacyModes = modes;
        sawModes = true;
        if (verbose) {
          logAcp("muted", `Outgoing modes from ${opts.agentName} (${modes.availableModes.length}), current=${modes.currentModeId}:`);
          for (const mode of modes.availableModes) {
            logAcp("muted", `  mode=${mode.id} name=${mode.name}${formatOptionalDetail(mode.description, 160)}`);
          }
        }
        session.updateMetadata(
          (currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { modes })
        );
      }
    }
    if (msg.type === "event" && msg.name === "models_update") {
      const models = extractModelStateFromPayload(msg.payload);
      if (models) {
        legacyModels = models;
        sawModels = true;
        if (verbose) {
          logAcp("muted", `Outgoing models from ${opts.agentName} (${models.availableModels.length}), current=${models.currentModelId}:`);
          for (const model of models.availableModels) {
            logAcp("muted", `  model=${model.modelId} name=${model.name}`);
          }
        }
        session.updateMetadata(
          (currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { models })
        );
      }
    }
    if (msg.type === "event" && msg.name === "current_mode_update") {
      const currentModeId = extractCurrentModeIdFromPayload(msg.payload);
      if (currentModeId) {
        if (modeSelector) {
          modeSelector = {
            ...modeSelector,
            currentCode: currentModeId
          };
        }
        if (legacyModes) {
          legacyModes = {
            ...legacyModes,
            currentModeId
          };
        }
        session.updateMetadata(
          (currentMetadata) => mergeAcpSessionConfigIntoMetadata(currentMetadata, { currentModeId })
        );
      }
    }
    if (msg.type === "status") {
      const suffix = msg.detail ? `: ${msg.detail}` : "";
      const statusLine = `Status: ${msg.status}${suffix}`;
      logAcp("muted", statusLine);
      const nextThinking = msg.status === "running";
      if (thinking !== nextThinking) {
        thinking = nextThinking;
        session.keepAlive(thinking, "remote");
      }
      if (msg.status === "idle") {
        clearPendingTurn();
      }
      if (msg.status === "error" || msg.status === "stopped") {
        stopRunnerFromBackendStatus(msg.status, msg.detail);
      }
    }
    const frontendMessage = formatAcpMessageForFrontend(opts.agentName, msg, verbose);
    if (frontendMessage) {
      logAcp(frontendMessage.kind, frontendMessage.text);
    }
    sendEnvelopes(sessionManager.mapMessage(msg));
  };
  backend.onMessage(onBackendMessage);
  session.onUserMessage((message) => {
    if (!message.content.text) {
      return;
    }
    if (typeof message.meta?.permissionMode === "string") {
      currentPermissionMode = message.meta.permissionMode;
      api.logger.debug(`[${opts.agentName}] Requested ACP permission mode: ${currentPermissionMode}`);
    }
    if (message.meta && Object.prototype.hasOwnProperty.call(message.meta, "model")) {
      currentModel = message.meta.model ?? null;
      api.logger.debug(`[${opts.agentName}] Requested ACP model: ${currentModel ?? "null"}`);
    }
    messageQueue.push(message.content.text, {
      permissionMode: currentPermissionMode,
      model: currentModel
    });
  });
  session.keepAlive(thinking, "remote");
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, "remote");
  }, 2e3);
  async function handleAbort() {
    try {
      if (acpSessionId) {
        await backend.cancel(acpSessionId);
      }
      permissionHandler.reset();
      abortController.abort();
    } catch (error) {
      api.logger.debug(`[${opts.agentName}] Abort failed:`, error);
    } finally {
      abortController = new AbortController();
    }
  }
  session.rpcHandlerManager.registerHandler("abort", handleAbort);
  index.registerKillSessionHandler(session.rpcHandlerManager, async () => {
    shouldExit = true;
    messageQueue.close();
    clearPendingTurn(new Error("Session terminated"));
    await handleAbort();
  });
  try {
    const started = await backend.startSession();
    acpSessionId = started.sessionId;
    if (verbose) {
      if (!sawSlashCommands) {
        logAcp("muted", `Outgoing slash commands from ${opts.agentName}: not reported yet`);
      }
      if (!sawModes) {
        logAcp("muted", `Outgoing modes from ${opts.agentName}: not reported yet`);
      }
      if (!sawModels) {
        logAcp("muted", `Outgoing models from ${opts.agentName}: not reported yet`);
      }
    }
    while (!shouldExit) {
      const waitSignal = abortController.signal;
      const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
      if (!batch) {
        if (shouldExit) {
          break;
        }
        if (waitSignal.aborted) {
          continue;
        }
        break;
      }
      if (!acpSessionId) {
        throw new Error("ACP session is not started");
      }
      logAcp("incoming", `Incoming prompt: ${formatUnknownForConsole(batch.message, ACP_EVENT_PREVIEW_CHARS)}`);
      sendEnvelopes(sessionManager.startTurn());
      const turnEnded = waitForTurnEnd();
      try {
        if (typeof batch.mode.permissionMode === "string" && batch.mode.permissionMode.length > 0) {
          await switchPermissionModeIfRequested(batch.mode.permissionMode);
        }
        if (typeof batch.mode.model === "string" && batch.mode.model.length > 0) {
          await switchModelIfRequested(batch.mode.model);
        }
        await backend.sendPrompt(acpSessionId, batch.message);
        await turnEnded;
        sendEnvelopes(sessionManager.endTurn("completed"));
        session.sendSessionEvent({ type: "ready" });
        if (verbose) {
          logAcp("muted", `Outgoing prompt completion from ${opts.agentName}`);
        }
      } catch (error) {
        sendEnvelopes(sessionManager.endTurn("failed"));
        session.sendSessionEvent({ type: "ready" });
        logAcp("error", `Prompt error from ${opts.agentName}: ${error instanceof Error ? error.message : String(error)}`);
        clearPendingTurn(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  } finally {
    clearInterval(keepAliveInterval);
    reconnectionHandle?.cancel();
    clearPendingTurn(new Error("ACP runner shutting down"));
    try {
      permissionHandler.reset();
    } catch (error) {
      api.logger.debug(`[${opts.agentName}] Failed to reset permission handler:`, error);
    }
    backend.offMessage?.(onBackendMessage);
    await backend.dispose();
    try {
      happyServer.stop();
    } catch (error) {
      api.logger.debug(`[${opts.agentName}] Failed to stop Happy MCP server:`, error);
    }
    try {
      session.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        lifecycleState: "archived",
        lifecycleStateSince: Date.now(),
        archivedBy: "cli",
        archiveReason: "Session ended"
      }));
      session.sendSessionDeath();
      await session.flush();
      await session.close();
    } catch (error) {
      api.logger.debug(`[${opts.agentName}] Session close failed:`, error);
    }
  }
}

const KNOWN_ACP_AGENTS = {
  gemini: { command: "gemini", args: ["--experimental-acp"] },
  opencode: { command: "opencode", args: ["acp"] }
};
function resolveAcpAgentConfig(cliArgs) {
  if (cliArgs.length === 0) {
    throw new Error("Usage: happy acp <agent-name> or happy acp -- <command> [args]");
  }
  if (cliArgs[0] === "--") {
    const command = cliArgs[1];
    if (!command) {
      throw new Error('Missing command after "--". Usage: happy acp -- <command> [args]');
    }
    return {
      agentName: command,
      command,
      args: cliArgs.slice(2)
    };
  }
  const agentName = cliArgs[0];
  const known = KNOWN_ACP_AGENTS[agentName];
  if (known) {
    const passthroughArgs = cliArgs.slice(1).filter((arg) => !(agentName === "opencode" && arg === "--acp"));
    return {
      agentName,
      command: known.command,
      args: [...known.args, ...passthroughArgs]
    };
  }
  return {
    agentName,
    command: agentName,
    args: cliArgs.slice(1)
  };
}

exports.AcpBackend = AcpBackend.AcpBackend;
exports.AcpSdkBackend = AcpBackend.AcpBackend;
exports.DEFAULT_IDLE_TIMEOUT_MS = AcpBackend.DEFAULT_IDLE_TIMEOUT_MS;
exports.DEFAULT_TOOL_CALL_TIMEOUT_MS = AcpBackend.DEFAULT_TOOL_CALL_TIMEOUT_MS;
exports.extractErrorDetail = AcpBackend.extractErrorDetail;
exports.formatDuration = AcpBackend.formatDuration;
exports.formatDurationMinutes = AcpBackend.formatDurationMinutes;
exports.handleAgentMessageChunk = AcpBackend.handleAgentMessageChunk;
exports.handleAgentThoughtChunk = AcpBackend.handleAgentThoughtChunk;
exports.handleLegacyMessageChunk = AcpBackend.handleLegacyMessageChunk;
exports.handlePlanUpdate = AcpBackend.handlePlanUpdate;
exports.handleThinkingUpdate = AcpBackend.handleThinkingUpdate;
exports.handleToolCall = AcpBackend.handleToolCall;
exports.handleToolCallUpdate = AcpBackend.handleToolCallUpdate;
exports.parseArgsFromContent = AcpBackend.parseArgsFromContent;
exports.AcpSessionManager = AcpSessionManager.AcpSessionManager;
exports.KNOWN_ACP_AGENTS = KNOWN_ACP_AGENTS;
exports.resolveAcpAgentConfig = resolveAcpAgentConfig;
exports.runAcp = runAcp;
