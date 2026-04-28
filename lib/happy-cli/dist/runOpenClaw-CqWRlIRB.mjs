import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { b as connectionState, A as ApiClient, e as encodeBase64, l as logger } from './types-BDOVRaQz.mjs';
import { A as AcpSessionManager } from './AcpSessionManager-wJpaauoL.mjs';
import { i as initialMachineMetadata, c as createSessionMetadata, s as setupOfflineReconnection, n as notifyDaemonSessionStarted, M as MessageQueue2, r as registerKillSessionHandler } from './index-x9ZRFnR3.mjs';
import { readSettings } from './persistence-tjdFxr4R.mjs';
import WebSocket from 'ws';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import 'axios';
import 'chalk';
import 'fs';
import 'node:util';
import 'node:events';
import 'socket.io-client';
import 'zod';
import '@slopus/happy-wire';
import 'tweetnacl';
import 'child_process';
import 'util';
import 'fs/promises';
import 'crypto';
import 'path';
import 'cross-spawn';
import 'url';
import 'os';
import '@paralleldrive/cuid2';
import 'expo-server-sdk';
import 'node:readline';
import '@anthropic-ai/sandbox-runtime';
import 'node:fs/promises';
import 'ink';
import 'react';
import '@anthropic-ai/claude-agent-sdk';
import 'ps-list';
import 'tmp';
import 'qrcode-terminal';
import 'open';
import 'fastify';
import 'fastify-type-provider-zod';
import '@modelcontextprotocol/sdk/server/mcp.js';
import 'node:http';
import '@modelcontextprotocol/sdk/server/streamableHttp.js';
import 'http';
import 'inquirer';

ed.hashes.sha512 = (message) => sha512(message);
const { getPublicKeyAsync, signAsync, utils } = ed;
const OPENCLAW_DIR_NAME = "openclaw";
const DEVICE_IDENTITY_FILE = "device-identity.json";
const DEVICE_AUTH_TOKEN_FILE = "device-auth-token.json";
let identityCache = null;
let authTokenCache = null;
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function getOpenClawDir(homeDir) {
  return join(homeDir, OPENCLAW_DIR_NAME);
}
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeJsonFile(filePath, data) {
  const dir = join(filePath, "..");
  ensureDir(dir);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
function fingerprintPublicKey(publicKey) {
  const hash = createHash("sha256").update(publicKey).digest();
  return bytesToHex(new Uint8Array(hash));
}
async function generateDeviceIdentity() {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey)
  };
}
async function loadOrCreateDeviceIdentity(homeDir) {
  if (identityCache) return identityCache;
  const filePath = join(getOpenClawDir(homeDir), DEVICE_IDENTITY_FILE);
  const stored = readJsonFile(filePath);
  if (stored?.version === 1 && typeof stored.publicKey === "string" && typeof stored.privateKey === "string") {
    const derivedId = fingerprintPublicKey(base64UrlDecode(stored.publicKey));
    if (derivedId !== stored.deviceId) {
      const updated = { ...stored, deviceId: derivedId };
      writeJsonFile(filePath, updated);
    }
    identityCache = {
      deviceId: derivedId,
      publicKey: stored.publicKey,
      privateKey: stored.privateKey
    };
    return identityCache;
  }
  const identity = await generateDeviceIdentity();
  const toStore = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now()
  };
  writeJsonFile(filePath, toStore);
  identityCache = identity;
  return identityCache;
}
async function loadDeviceAuthToken(homeDir) {
  if (authTokenCache) return authTokenCache;
  const filePath = join(getOpenClawDir(homeDir), DEVICE_AUTH_TOKEN_FILE);
  authTokenCache = readJsonFile(filePath);
  return authTokenCache;
}
async function storeDeviceAuthToken(homeDir, params) {
  const stored = {
    token: params.token,
    role: params.role,
    scopes: params.scopes,
    createdAtMs: Date.now()
  };
  writeJsonFile(join(getOpenClawDir(homeDir), DEVICE_AUTH_TOKEN_FILE), stored);
  authTokenCache = stored;
}
function buildDeviceAuthPayload(params) {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  return ["v2", params.deviceId, params.clientId, params.clientMode, params.role, scopes, String(params.signedAtMs), token, params.nonce].join("|");
}
async function signPayload(privateKeyBase64Url, payload) {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}

const PROTOCOL_VERSION = 3;
class OpenClawSocket {
  ws = null;
  config = null;
  pending = /* @__PURE__ */ new Map();
  status = "disconnected";
  reconnectTimer = null;
  mainSessionKey = null;
  serverHost = null;
  pairingRequestId = null;
  deviceId = null;
  connectNonce = null;
  connectSent = false;
  disposed = false;
  statusListeners = /* @__PURE__ */ new Set();
  eventListeners = /* @__PURE__ */ new Set();
  options;
  constructor(options) {
    this.options = {
      homeDir: options.homeDir,
      clientId: options.clientId ?? "node-host",
      clientMode: options.clientMode ?? "backend",
      displayName: options.displayName ?? "Happy CLI",
      log: options.log ?? (() => {
      })
    };
  }
  getStatus() {
    return this.status;
  }
  getMainSessionKey() {
    return this.mainSessionKey;
  }
  getServerHost() {
    return this.serverHost;
  }
  isConnected() {
    return this.status === "connected";
  }
  getDeviceId() {
    return this.deviceId;
  }
  getPairingRequestId() {
    return this.pairingRequestId;
  }
  connect(config) {
    this.config = config;
    this.pairingRequestId = null;
    this.doConnect();
  }
  disconnect() {
    this.config = null;
    this.clearReconnectTimer();
    this.closeSocket();
    this.updateStatus("disconnected");
    this.mainSessionKey = null;
    this.serverHost = null;
    this.pairingRequestId = null;
  }
  dispose() {
    this.disposed = true;
    this.disconnect();
    this.statusListeners.clear();
    this.eventListeners.clear();
  }
  retryConnect() {
    if (this.config) {
      this.pairingRequestId = null;
      this.doConnect();
    }
  }
  onStatusChange(handler) {
    this.statusListeners.add(handler);
    handler(this.status, void 0, { pairingRequestId: this.pairingRequestId ?? void 0 });
    return () => this.statusListeners.delete(handler);
  }
  onEvent(handler) {
    this.eventListeners.add(handler);
    return () => this.eventListeners.delete(handler);
  }
  async request(method, params, timeoutMs = 15e3) {
    if (!this.ws || this.status !== "connected") {
      throw new Error("Not connected to gateway");
    }
    const id = randomUUID();
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.ws.send(JSON.stringify(frame));
    });
  }
  async listSessions(limit) {
    const result = await this.request("sessions.list", {
      includeGlobal: true,
      includeUnknown: false,
      limit
    });
    return result.sessions ?? [];
  }
  async listAgents() {
    try {
      const result = await this.request("agents.list");
      return result.agents ?? [];
    } catch {
      return [];
    }
  }
  async getHistory(sessionKey) {
    const result = await this.request("chat.history", { sessionKey });
    return result.messages ?? [];
  }
  async sendMessage(sessionKey, message, options) {
    return this.request(
      "chat.send",
      {
        sessionKey,
        message,
        thinking: options?.thinking ?? "low",
        attachments: options?.attachments,
        timeoutMs: 3e4,
        idempotencyKey: randomUUID()
      },
      35e3
    );
  }
  async abortRun(sessionKey, runId) {
    await this.request("chat.abort", { sessionKey, runId }, 1e4);
  }
  async healthCheck() {
    try {
      const result = await this.request("health", void 0, 5e3);
      return result.ok !== false;
    } catch {
      return false;
    }
  }
  // ─── Private ─────────────────────────────────────────────────
  doConnect() {
    if (!this.config || this.disposed) return;
    this.updateStatus("connecting");
    this.closeSocket();
    this.connectNonce = null;
    this.connectSent = false;
    const url = this.config.url;
    this.options.log(`Connecting to gateway: ${url}`);
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.options.log(`Failed to create WebSocket: ${err}`);
      this.updateStatus("error", "Failed to create connection");
      this.scheduleReconnect();
      return;
    }
    this.ws.on("open", () => {
      this.options.log("WebSocket opened, waiting for challenge...");
    });
    this.ws.on("message", (data) => {
      this.handleMessage(data.toString());
    });
    this.ws.on("error", (err) => {
      this.options.log(`WebSocket error: ${err.message}`);
      if (this.status === "connecting") {
        this.updateStatus("error", "Connection failed");
      }
    });
    this.ws.on("close", (code, reason) => {
      this.options.log(`WebSocket closed: ${code} ${reason.toString()}`);
      this.failAllPending(new Error("Connection closed"));
      if (this.config && this.status !== "pairing_required" && !this.disposed) {
        this.scheduleReconnect();
      }
    });
  }
  async sendConnect() {
    if (!this.ws || !this.config || this.connectSent) return;
    this.connectSent = true;
    try {
      const identity = await loadOrCreateDeviceIdentity(this.options.homeDir);
      this.deviceId = identity.deviceId;
      this.options.log(`Using device ID: ${identity.deviceId.slice(0, 16)}...`);
      const storedToken = await loadDeviceAuthToken(this.options.homeDir);
      const clientId = this.options.clientId;
      const clientMode = this.options.clientMode;
      const role = "operator";
      const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
      const signedAtMs = Date.now();
      const authToken = this.config.token ?? storedToken?.token ?? void 0;
      const payload = buildDeviceAuthPayload({
        deviceId: identity.deviceId,
        clientId,
        clientMode,
        role,
        scopes,
        signedAtMs,
        token: authToken ?? null,
        nonce: this.connectNonce
      });
      const signature = await signPayload(identity.privateKey, payload);
      const params = {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: clientId,
          displayName: this.options.displayName,
          version: "1.0.0",
          platform: os.platform(),
          mode: clientMode
        },
        role,
        scopes,
        device: {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce: this.connectNonce ?? void 0
        },
        auth: authToken ? { token: authToken } : this.config.password ? { password: this.config.password } : void 0
      };
      const id = randomUUID();
      const frame = { type: "req", id, method: "connect", params };
      const resultPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Connect timeout"));
        }, 1e4);
        this.pending.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          }
        });
      });
      this.ws.send(JSON.stringify(frame));
      const result = await resultPromise;
      if (result.auth?.deviceToken) {
        this.options.log("Storing device auth token");
        await storeDeviceAuthToken(this.options.homeDir, {
          token: result.auth.deviceToken,
          role: result.auth.role ?? role,
          scopes: result.auth.scopes ?? scopes
        });
      }
      this.mainSessionKey = result.snapshot?.sessionDefaults?.mainSessionKey ?? null;
      this.serverHost = result.server?.host ?? null;
      this.updateStatus("connected");
      this.options.log(`Connected! Server: ${this.serverHost}, Main session: ${this.mainSessionKey}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "";
      this.options.log(`Connect failed: ${errorMsg}`);
      if (errorMsg.includes("NOT_PAIRED")) {
        const match = errorMsg.match(/requestId['":\s]+([a-f0-9-]+)/i);
        this.pairingRequestId = match?.[1] ?? null;
        this.updateStatus("pairing_required", "Device pairing required", {
          pairingRequestId: this.pairingRequestId ?? void 0
        });
        this.closeSocket();
        return;
      }
      this.updateStatus("error", error instanceof Error ? error.message : "Connect failed");
      this.closeSocket();
      this.scheduleReconnect();
    }
  }
  handleMessage(data) {
    let frame;
    try {
      frame = JSON.parse(data);
    } catch {
      this.options.log(`Invalid JSON: ${data.slice(0, 100)}`);
      return;
    }
    if (frame.type === "res") {
      const pending = this.pending.get(frame.id);
      if (pending) {
        this.pending.delete(frame.id);
        if (frame.ok) {
          pending.resolve(frame.payload);
        } else {
          const err = frame.error;
          pending.reject(new Error(`${err?.code ?? "ERROR"}: ${err?.message ?? "Request failed"}`));
        }
      }
    } else if (frame.type === "event") {
      let payload = frame.payload;
      if (!payload && frame.payloadJSON) {
        try {
          payload = JSON.parse(frame.payloadJSON);
        } catch {
        }
      }
      if (frame.event === "connect.challenge" && !this.connectSent) {
        const nonce = payload?.nonce;
        if (!nonce) {
          this.options.log("Gateway sent challenge without nonce \u2014 unsupported protocol");
          this.updateStatus("error", "Gateway challenge missing nonce");
          this.closeSocket();
          return;
        }
        this.options.log(`Received challenge nonce: ${nonce.slice(0, 8)}...`);
        this.connectNonce = nonce;
        this.sendConnect();
        return;
      }
      for (const handler of this.eventListeners) {
        handler(frame.event, payload);
      }
    }
  }
  updateStatus(status, error, details) {
    this.status = status;
    for (const handler of this.statusListeners) {
      handler(status, error, details);
    }
  }
  closeSocket() {
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.close();
      } catch {
      }
      this.ws = null;
    }
  }
  failAllPending(error) {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }
  scheduleReconnect() {
    if (!this.config || this.disposed) return;
    this.clearReconnectTimer();
    this.updateStatus("disconnected");
    this.reconnectTimer = setTimeout(() => this.doConnect(), 3e3);
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function extractTextFromMessage(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c.type === "text" && c.text).map((c) => c.text).join("");
  }
  return "";
}
class OpenClawBackend {
  socket;
  gatewayConfig;
  handlers = /* @__PURE__ */ new Set();
  sessionKey = null;
  lastDeltaText = null;
  log;
  /** Resolves when the socket reaches 'connected' status */
  connectionReady = null;
  connectionResolve = null;
  connectionReject = null;
  /** Resolves when the current turn (prompt → idle) finishes */
  turnReady = null;
  turnResolve = null;
  turnReject = null;
  constructor(opts) {
    this.log = opts.log ?? (() => {
    });
    this.gatewayConfig = opts.gatewayConfig;
    this.socket = new OpenClawSocket({
      homeDir: opts.homeDir,
      clientId: opts.clientId,
      clientMode: opts.clientMode,
      displayName: opts.displayName,
      log: opts.log
    });
    this.socket.onStatusChange((status, error, details) => {
      this.handleStatusChange(status, error, details);
    });
    this.socket.onEvent((event, payload) => {
      this.handleEvent(event, payload);
    });
  }
  async startSession() {
    this.connectionReady = new Promise((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
    });
    this.socket.connect(this.gatewayConfig);
    await this.connectionReady;
    this.sessionKey = this.socket.getMainSessionKey();
    if (!this.sessionKey) {
      throw new Error("No main session key from gateway");
    }
    const sessionId = this.sessionKey;
    this.log(`Session started: ${sessionId}`);
    return { sessionId };
  }
  async sendPrompt(sessionId, prompt) {
    if (!this.socket.isConnected()) {
      throw new Error("Not connected to OpenClaw gateway");
    }
    this.lastDeltaText = null;
    this.turnReady = new Promise((resolve, reject) => {
      this.turnResolve = resolve;
      this.turnReject = reject;
    });
    this.emit({ type: "status", status: "running" });
    const result = await this.socket.sendMessage(sessionId, prompt);
    this.log(`Sent prompt, runId: ${result.runId}`);
  }
  async cancel(_sessionId) {
    if (this.sessionKey) {
      await this.socket.abortRun(this.sessionKey);
    }
  }
  onMessage(handler) {
    this.handlers.add(handler);
  }
  offMessage(handler) {
    this.handlers.delete(handler);
  }
  async waitForResponseComplete(timeoutMs = 12e4) {
    if (!this.turnReady) return;
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("OpenClaw turn timed out")), timeoutMs);
    });
    await Promise.race([this.turnReady, timeout]);
  }
  async dispose() {
    this.socket.dispose();
    this.handlers.clear();
  }
  getDeviceId() {
    return this.socket.getDeviceId();
  }
  getPairingRequestId() {
    return this.socket.getPairingRequestId();
  }
  retryConnect() {
    this.socket.retryConnect();
  }
  emit(msg) {
    for (const handler of this.handlers) {
      handler(msg);
    }
  }
  handleStatusChange(status, error, details) {
    if (status === "connected") {
      this.connectionResolve?.();
      this.connectionResolve = null;
      this.connectionReject = null;
    } else if (status === "error") {
      const err = new Error(`OpenClaw connection error: ${error ?? "unknown"}`);
      this.connectionReject?.(err);
      this.connectionResolve = null;
      this.connectionReject = null;
      this.emit({ type: "status", status: "error", detail: error });
    } else if (status === "pairing_required") {
      const err = new Error("Device pairing required");
      this.connectionReject?.(err);
      this.connectionResolve = null;
      this.connectionReject = null;
      this.emit({
        type: "event",
        name: "openclaw-pairing-required",
        payload: {
          pairingRequestId: details?.pairingRequestId ?? null,
          deviceId: this.socket.getDeviceId()
        }
      });
    } else if (status === "disconnected") {
      this.emit({ type: "status", status: "stopped" });
    }
  }
  handleEvent(event, payload) {
    if (event !== "chat") return;
    const chatEvent = payload;
    const state = chatEvent.state;
    if (state === "started") {
      this.emit({ type: "status", status: "running" });
      return;
    }
    if (state === "thinking") {
      const text = extractTextFromMessage(chatEvent.message);
      if (text) {
        this.emit({ type: "event", name: "thinking", payload: { text, streaming: true } });
      }
      return;
    }
    if (state === "delta") {
      const text = extractTextFromMessage(chatEvent.message);
      if (text) {
        const incrementalDelta = this.lastDeltaText !== null ? text.slice(this.lastDeltaText.length) : text;
        this.lastDeltaText = text;
        if (incrementalDelta) {
          this.emit({ type: "model-output", textDelta: incrementalDelta });
        }
      }
      return;
    }
    if (state === "tool") {
      const toolName = chatEvent.toolName ?? "unknown";
      const args = chatEvent.toolArgs ?? {};
      const callId = chatEvent.toolCallId ?? randomUUID();
      this.emit({ type: "tool-call", toolName, args, callId });
      return;
    }
    if (state === "final") {
      const text = extractTextFromMessage(chatEvent.message);
      if (text) {
        const remaining = this.lastDeltaText !== null ? text.slice(this.lastDeltaText.length) : text;
        if (remaining) {
          this.emit({ type: "model-output", textDelta: remaining });
        }
      }
      this.lastDeltaText = null;
      this.emit({ type: "status", status: "idle" });
      this.turnResolve?.();
      this.turnResolve = null;
      this.turnReject = null;
      return;
    }
    if (state === "error") {
      const detail = chatEvent.errorMessage ?? "Unknown error";
      this.emit({ type: "status", status: "error", detail });
      this.turnReject?.(new Error(detail));
      this.turnResolve = null;
      this.turnReject = null;
      return;
    }
  }
}

const TURN_TIMEOUT_MS = 5 * 60 * 1e3;
function openclawExec(...args) {
  try {
    return execFileSync("openclaw", args, { timeout: 1e4, encoding: "utf-8", windowsHide: true }).trim();
  } catch {
    return null;
  }
}
function queryGatewayUrl() {
  const statusJson = openclawExec("status", "--json");
  if (statusJson) {
    try {
      const parsed = JSON.parse(statusJson);
      const url = parsed?.gateway?.url;
      if (typeof url === "string" && url.length > 0) return url;
    } catch {
    }
  }
  const port = openclawExec("config", "get", "gateway.port");
  if (port && /^\d+$/.test(port)) return `ws://127.0.0.1:${port}`;
  return null;
}
function resolveConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH) return process.env.OPENCLAW_CONFIG_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? join(os.homedir(), ".openclaw");
  return join(stateDir, "openclaw.json");
}
function queryGatewayToken() {
  try {
    const raw = JSON.parse(readFileSync(resolveConfigPath(), "utf-8"));
    const token = raw?.gateway?.auth?.token;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}
function resolveGatewayConfig(opts) {
  const url = opts.gatewayUrl ?? process.env.OPENCLAW_GATEWAY_URL ?? queryGatewayUrl();
  if (!url) {
    throw new Error(
      "OpenClaw gateway not found. Either:\n  - Install and run openclaw locally\n  - Set OPENCLAW_GATEWAY_URL env var\n  - Pass --gateway-url"
    );
  }
  const token = opts.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? queryGatewayToken() ?? void 0;
  return {
    url,
    token,
    password: opts.gatewayPassword ?? process.env.OPENCLAW_GATEWAY_PASSWORD ?? void 0
  };
}
async function runOpenClaw(opts) {
  const verbose = opts.verbose === true;
  const sessionTag = randomUUID();
  connectionState.setBackend("openclaw");
  const gatewayConfig = resolveGatewayConfig(opts);
  const log = (msg) => {
    logger.debug(`[openclaw] ${msg}`);
    if (verbose) {
      console.log(`[openclaw] ${msg}`);
    }
  };
  log(`Gateway URL: ${gatewayConfig.url}`);
  const api = await ApiClient.create(opts.credentials);
  const settings = await readSettings();
  if (!settings?.machineId) {
    throw new Error("No machine ID found in settings");
  }
  await api.getOrCreateMachine({
    machineId: settings.machineId,
    metadata: initialMachineMetadata
  });
  const { state, metadata } = createSessionMetadata({
    flavor: "openclaw",
    machineId: settings.machineId,
    startedBy: opts.startedBy
  });
  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  if (response) {
    log(`Happy Session ID: ${response.id}`);
  }
  let session;
  const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
    api,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      session = newSession;
    }
  });
  session = initialSession;
  if (response) {
    try {
      await notifyDaemonSessionStarted(response.id, metadata, {
        encryptionKey: encodeBase64(response.encryptionKey),
        encryptionVariant: response.encryptionVariant,
        seq: response.seq,
        metadataVersion: response.metadataVersion,
        agentStateVersion: response.agentStateVersion
      });
    } catch (error) {
      logger.debug("[openclaw] Failed to report session to daemon:", error);
    }
  }
  const sessionManager = new AcpSessionManager();
  const messageQueue = new MessageQueue2(() => "");
  let shouldExit = false;
  let abortController = new AbortController();
  let pendingTurn = null;
  let thinking = false;
  let inTurn = false;
  const clearPendingTurn = (error) => {
    if (!pendingTurn) return;
    clearTimeout(pendingTurn.timeout);
    const current = pendingTurn;
    pendingTurn = null;
    if (error) {
      current.reject(error);
    } else {
      current.resolve();
    }
  };
  const waitForTurnEnd = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingTurn = null;
      reject(new Error("Timed out waiting for OpenClaw to finish the turn"));
    }, TURN_TIMEOUT_MS);
    pendingTurn = { resolve, reject, timeout };
  });
  const sendEnvelopes = (envelopes) => {
    for (const envelope of envelopes) {
      session.sendSessionProtocolMessage(envelope);
    }
  };
  const backend = new OpenClawBackend({
    homeDir: os.homedir(),
    gatewayConfig,
    log
  });
  const onBackendMessage = (msg) => {
    if (verbose) {
      log(`Backend message: ${JSON.stringify(msg).slice(0, 200)}`);
    }
    if (msg.type === "status" && inTurn) {
      const nextThinking = msg.status === "running";
      if (thinking !== nextThinking) {
        thinking = nextThinking;
        session.keepAlive(thinking, "remote");
      }
      if (msg.status === "idle") {
        clearPendingTurn();
      }
    }
    if (msg.type === "status" && (msg.status === "error" || msg.status === "stopped")) {
      log(`Backend ${msg.status}: ${msg.detail ?? ""}`);
      shouldExit = true;
      messageQueue.close();
      clearPendingTurn(new Error(`OpenClaw backend ${msg.status}: ${msg.detail ?? ""}`));
    }
    if (msg.type === "event" && msg.name === "openclaw-pairing-required") {
      log(`Device pairing required. Approve device via: openclaw devices list`);
    }
    sendEnvelopes(sessionManager.mapMessage(msg));
  };
  backend.onMessage(onBackendMessage);
  session.onUserMessage((message) => {
    if (!message.content.text) return;
    messageQueue.push(message.content.text, {});
  });
  session.keepAlive(thinking, "remote");
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, "remote");
  }, 2e3);
  async function handleAbort() {
    log("Abort requested");
    try {
      const sessionKey = backend["sessionKey"];
      if (sessionKey) {
        await backend.cancel(sessionKey);
      }
    } catch (error) {
      logger.debug("[openclaw] Abort failed:", error);
    }
    inTurn = false;
    thinking = false;
    session.keepAlive(false, "remote");
    clearPendingTurn();
    abortController.abort();
    abortController = new AbortController();
  }
  session.rpcHandlerManager.registerHandler("abort", handleAbort);
  session.rpcHandlerManager.registerHandler("openclaw-retry-pairing", async () => {
    backend.retryConnect();
  });
  registerKillSessionHandler(session.rpcHandlerManager, async () => {
    shouldExit = true;
    messageQueue.close();
    clearPendingTurn(new Error("Session terminated"));
    await handleAbort();
  });
  try {
    const started = await backend.startSession();
    log(`Connected. Session key: ${started.sessionId}`);
    while (!shouldExit) {
      const waitSignal = abortController.signal;
      const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
      if (!batch) {
        if (shouldExit) break;
        if (waitSignal.aborted) continue;
        break;
      }
      log(`Incoming prompt: ${batch.message.slice(0, 200)}`);
      inTurn = true;
      sendEnvelopes(sessionManager.startTurn());
      const turnEnded = waitForTurnEnd();
      try {
        await backend.sendPrompt(started.sessionId, batch.message);
        await turnEnded;
        sendEnvelopes(sessionManager.endTurn("completed"));
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`Turn ended: ${msg}`);
        sendEnvelopes(sessionManager.endTurn("failed"));
      }
      inTurn = false;
      thinking = false;
      session.keepAlive(false, "remote");
      session.sendSessionEvent({ type: "ready" });
    }
  } finally {
    clearInterval(keepAliveInterval);
    reconnectionHandle?.cancel();
    clearPendingTurn(new Error("OpenClaw runner shutting down"));
    backend.offMessage(onBackendMessage);
    await backend.dispose();
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
      logger.debug("[openclaw] Session close failed:", error);
    }
  }
}

export { runOpenClaw };
