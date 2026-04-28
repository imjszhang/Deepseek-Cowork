'use strict';

var promises = require('node:fs/promises');
var node_fs = require('node:fs');
var api = require('./types-DB662inl.cjs');
var z = require('zod');
require('axios');
require('chalk');
require('fs');
require('node:util');
require('node:os');
require('node:path');
require('node:events');
require('socket.io-client');
require('@slopus/happy-wire');
require('node:crypto');
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

var z__namespace = /*#__PURE__*/_interopNamespaceDefault(z);

const SandboxConfigSchema = z__namespace.object({
  enabled: z__namespace.boolean().default(false),
  workspaceRoot: z__namespace.string().optional(),
  sessionIsolation: z__namespace.enum(["strict", "workspace", "custom"]).default("workspace"),
  customWritePaths: z__namespace.array(z__namespace.string()).default([]),
  denyReadPaths: z__namespace.array(z__namespace.string()).default(["~/.ssh", "~/.aws", "~/.gnupg"]),
  extraWritePaths: z__namespace.array(z__namespace.string()).default(["/tmp"]),
  denyWritePaths: z__namespace.array(z__namespace.string()).default([".env"]),
  networkMode: z__namespace.enum(["blocked", "allowed", "custom"]).default("allowed"),
  allowedDomains: z__namespace.array(z__namespace.string()).default([]),
  deniedDomains: z__namespace.array(z__namespace.string()).default([]),
  allowLocalBinding: z__namespace.boolean().default(true)
});
const SUPPORTED_SCHEMA_VERSION = 2;
const defaultSettings = {
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  onboardingCompleted: false,
  sandboxConfig: void 0
};
function migrateSettings(raw, fromVersion) {
  let migrated = { ...raw };
  return migrated;
}
async function readSettings() {
  if (!node_fs.existsSync(api.configuration.settingsFile)) {
    return { ...defaultSettings };
  }
  try {
    const content = await promises.readFile(api.configuration.settingsFile, "utf8");
    const raw = JSON.parse(content);
    const schemaVersion = raw.schemaVersion ?? 1;
    if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      api.logger.warn(
        `\u26A0\uFE0F Settings schema v${schemaVersion} > supported v${SUPPORTED_SCHEMA_VERSION}. Update happy-cli for full functionality.`
      );
    }
    const migrated = migrateSettings(raw, schemaVersion);
    if (migrated.sandboxConfig !== void 0) {
      try {
        migrated.sandboxConfig = SandboxConfigSchema.parse(migrated.sandboxConfig);
      } catch (error) {
        api.logger.warn(`\u26A0\uFE0F Invalid sandbox config - skipping. Error: ${error.message}`);
        migrated.sandboxConfig = void 0;
      }
    }
    return { ...defaultSettings, ...migrated };
  } catch (error) {
    api.logger.warn(`Failed to read settings: ${error.message}`);
    return { ...defaultSettings };
  }
}
async function updateSettings(updater) {
  const LOCK_RETRY_INTERVAL_MS = 100;
  const MAX_LOCK_ATTEMPTS = 50;
  const STALE_LOCK_TIMEOUT_MS = 1e4;
  const lockFile = api.configuration.settingsFile + ".lock";
  const tmpFile = api.configuration.settingsFile + ".tmp";
  let fileHandle;
  let attempts = 0;
  while (attempts < MAX_LOCK_ATTEMPTS) {
    try {
      fileHandle = await promises.open(lockFile, node_fs.constants.O_CREAT | node_fs.constants.O_EXCL | node_fs.constants.O_WRONLY);
      break;
    } catch (err) {
      if (err.code === "EEXIST") {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
        try {
          const stats = await promises.stat(lockFile);
          if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
            await promises.unlink(lockFile).catch(() => {
            });
          }
        } catch {
        }
      } else {
        throw err;
      }
    }
  }
  if (!fileHandle) {
    throw new Error(`Failed to acquire settings lock after ${MAX_LOCK_ATTEMPTS * LOCK_RETRY_INTERVAL_MS / 1e3} seconds`);
  }
  try {
    const current = await readSettings() || { ...defaultSettings };
    const updated = await updater(current);
    if (!node_fs.existsSync(api.configuration.happyHomeDir)) {
      await promises.mkdir(api.configuration.happyHomeDir, { recursive: true });
    }
    await promises.writeFile(tmpFile, JSON.stringify(updated, null, 2));
    await promises.rename(tmpFile, api.configuration.settingsFile);
    return updated;
  } finally {
    await fileHandle.close();
    await promises.unlink(lockFile).catch(() => {
    });
  }
}
const credentialsSchema = z__namespace.object({
  token: z__namespace.string(),
  secret: z__namespace.string().base64().nullish(),
  // Legacy
  encryption: z__namespace.object({
    publicKey: z__namespace.string().base64(),
    machineKey: z__namespace.string().base64()
  }).nullish()
});
async function readCredentials() {
  if (!node_fs.existsSync(api.configuration.privateKeyFile)) {
    return null;
  }
  try {
    const keyBase64 = await promises.readFile(api.configuration.privateKeyFile, "utf8");
    const credentials = credentialsSchema.parse(JSON.parse(keyBase64));
    if (credentials.secret) {
      return {
        token: credentials.token,
        encryption: {
          type: "legacy",
          secret: new Uint8Array(Buffer.from(credentials.secret, "base64"))
        }
      };
    } else if (credentials.encryption) {
      return {
        token: credentials.token,
        encryption: {
          type: "dataKey",
          publicKey: new Uint8Array(Buffer.from(credentials.encryption.publicKey, "base64")),
          machineKey: new Uint8Array(Buffer.from(credentials.encryption.machineKey, "base64"))
        }
      };
    }
  } catch {
    return null;
  }
  return null;
}
async function writeCredentialsLegacy(credentials) {
  if (!node_fs.existsSync(api.configuration.happyHomeDir)) {
    await promises.mkdir(api.configuration.happyHomeDir, { recursive: true });
  }
  await promises.writeFile(api.configuration.privateKeyFile, JSON.stringify({
    secret: api.encodeBase64(credentials.secret),
    token: credentials.token
  }, null, 2));
}
async function writeCredentialsDataKey(credentials) {
  if (!node_fs.existsSync(api.configuration.happyHomeDir)) {
    await promises.mkdir(api.configuration.happyHomeDir, { recursive: true });
  }
  await promises.writeFile(api.configuration.privateKeyFile, JSON.stringify({
    encryption: { publicKey: api.encodeBase64(credentials.publicKey), machineKey: api.encodeBase64(credentials.machineKey) },
    token: credentials.token
  }, null, 2));
}
async function clearCredentials() {
  if (node_fs.existsSync(api.configuration.privateKeyFile)) {
    await promises.unlink(api.configuration.privateKeyFile);
  }
}
async function clearMachineId() {
  await updateSettings((settings) => ({
    ...settings,
    machineId: void 0
  }));
}
async function readDaemonState() {
  try {
    if (!node_fs.existsSync(api.configuration.daemonStateFile)) {
      return null;
    }
    const content = await promises.readFile(api.configuration.daemonStateFile, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`[PERSISTENCE] Daemon state file corrupted: ${api.configuration.daemonStateFile}`, error);
    return null;
  }
}
function writeDaemonState(state) {
  node_fs.writeFileSync(api.configuration.daemonStateFile, JSON.stringify(state, null, 2), "utf-8");
}
async function clearDaemonState() {
  if (node_fs.existsSync(api.configuration.daemonStateFile)) {
    await promises.unlink(api.configuration.daemonStateFile);
  }
  if (node_fs.existsSync(api.configuration.daemonLockFile)) {
    try {
      await promises.unlink(api.configuration.daemonLockFile);
    } catch {
    }
  }
}
async function acquireDaemonLock(maxAttempts = 5, delayIncrementMs = 200) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fileHandle = await promises.open(
        api.configuration.daemonLockFile,
        node_fs.constants.O_CREAT | node_fs.constants.O_EXCL | node_fs.constants.O_WRONLY
      );
      await fileHandle.writeFile(String(process.pid));
      return fileHandle;
    } catch (error) {
      if (error.code === "EEXIST") {
        try {
          const lockPid = node_fs.readFileSync(api.configuration.daemonLockFile, "utf-8").trim();
          if (lockPid && !isNaN(Number(lockPid))) {
            try {
              process.kill(Number(lockPid), 0);
            } catch {
              node_fs.unlinkSync(api.configuration.daemonLockFile);
              continue;
            }
          }
        } catch {
        }
      }
      if (attempt === maxAttempts) {
        return null;
      }
      const delayMs = attempt * delayIncrementMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}
async function releaseDaemonLock(lockHandle) {
  try {
    await lockHandle.close();
  } catch {
  }
  try {
    if (node_fs.existsSync(api.configuration.daemonLockFile)) {
      node_fs.unlinkSync(api.configuration.daemonLockFile);
    }
  } catch {
  }
}
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1e3;
function readPersistedSessions() {
  try {
    if (!node_fs.existsSync(api.configuration.sessionsFile)) return {};
    const data = JSON.parse(node_fs.readFileSync(api.configuration.sessionsFile, "utf-8"));
    if (!data?.sessions || typeof data.sessions !== "object") return {};
    const now = Date.now();
    const sessions = {};
    for (const [id, session] of Object.entries(data.sessions)) {
      if (now - session.savedAt < SESSION_MAX_AGE_MS) {
        sessions[id] = session;
      }
    }
    return sessions;
  } catch {
    return {};
  }
}
function persistSession(sessionId, session) {
  try {
    const existing = readPersistedSessions();
    existing[sessionId] = session;
    const tmpFile = api.configuration.sessionsFile + ".tmp";
    node_fs.writeFileSync(tmpFile, JSON.stringify({ sessions: existing }, null, 2), "utf-8");
    node_fs.renameSync(tmpFile, api.configuration.sessionsFile);
  } catch (error) {
    api.logger.debug(`[PERSISTENCE] Failed to persist session ${sessionId}:`, error);
  }
}

exports.SUPPORTED_SCHEMA_VERSION = SUPPORTED_SCHEMA_VERSION;
exports.SandboxConfigSchema = SandboxConfigSchema;
exports.acquireDaemonLock = acquireDaemonLock;
exports.clearCredentials = clearCredentials;
exports.clearDaemonState = clearDaemonState;
exports.clearMachineId = clearMachineId;
exports.persistSession = persistSession;
exports.readCredentials = readCredentials;
exports.readDaemonState = readDaemonState;
exports.readPersistedSessions = readPersistedSessions;
exports.readSettings = readSettings;
exports.releaseDaemonLock = releaseDaemonLock;
exports.updateSettings = updateSettings;
exports.writeCredentialsDataKey = writeCredentialsDataKey;
exports.writeCredentialsLegacy = writeCredentialsLegacy;
exports.writeDaemonState = writeDaemonState;
