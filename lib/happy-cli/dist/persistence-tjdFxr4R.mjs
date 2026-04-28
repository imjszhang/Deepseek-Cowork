import { readFile, open, stat, unlink, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync, constants, readFileSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
import { c as configuration, l as logger, e as encodeBase64 } from './types-BDOVRaQz.mjs';
import * as z from 'zod';
import 'axios';
import 'chalk';
import 'fs';
import 'node:util';
import 'node:os';
import 'node:path';
import 'node:events';
import 'socket.io-client';
import '@slopus/happy-wire';
import 'node:crypto';
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

const SandboxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  workspaceRoot: z.string().optional(),
  sessionIsolation: z.enum(["strict", "workspace", "custom"]).default("workspace"),
  customWritePaths: z.array(z.string()).default([]),
  denyReadPaths: z.array(z.string()).default(["~/.ssh", "~/.aws", "~/.gnupg"]),
  extraWritePaths: z.array(z.string()).default(["/tmp"]),
  denyWritePaths: z.array(z.string()).default([".env"]),
  networkMode: z.enum(["blocked", "allowed", "custom"]).default("allowed"),
  allowedDomains: z.array(z.string()).default([]),
  deniedDomains: z.array(z.string()).default([]),
  allowLocalBinding: z.boolean().default(true)
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
  if (!existsSync(configuration.settingsFile)) {
    return { ...defaultSettings };
  }
  try {
    const content = await readFile(configuration.settingsFile, "utf8");
    const raw = JSON.parse(content);
    const schemaVersion = raw.schemaVersion ?? 1;
    if (schemaVersion > SUPPORTED_SCHEMA_VERSION) {
      logger.warn(
        `\u26A0\uFE0F Settings schema v${schemaVersion} > supported v${SUPPORTED_SCHEMA_VERSION}. Update happy-cli for full functionality.`
      );
    }
    const migrated = migrateSettings(raw, schemaVersion);
    if (migrated.sandboxConfig !== void 0) {
      try {
        migrated.sandboxConfig = SandboxConfigSchema.parse(migrated.sandboxConfig);
      } catch (error) {
        logger.warn(`\u26A0\uFE0F Invalid sandbox config - skipping. Error: ${error.message}`);
        migrated.sandboxConfig = void 0;
      }
    }
    return { ...defaultSettings, ...migrated };
  } catch (error) {
    logger.warn(`Failed to read settings: ${error.message}`);
    return { ...defaultSettings };
  }
}
async function updateSettings(updater) {
  const LOCK_RETRY_INTERVAL_MS = 100;
  const MAX_LOCK_ATTEMPTS = 50;
  const STALE_LOCK_TIMEOUT_MS = 1e4;
  const lockFile = configuration.settingsFile + ".lock";
  const tmpFile = configuration.settingsFile + ".tmp";
  let fileHandle;
  let attempts = 0;
  while (attempts < MAX_LOCK_ATTEMPTS) {
    try {
      fileHandle = await open(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      break;
    } catch (err) {
      if (err.code === "EEXIST") {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
        try {
          const stats = await stat(lockFile);
          if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
            await unlink(lockFile).catch(() => {
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
    if (!existsSync(configuration.happyHomeDir)) {
      await mkdir(configuration.happyHomeDir, { recursive: true });
    }
    await writeFile(tmpFile, JSON.stringify(updated, null, 2));
    await rename(tmpFile, configuration.settingsFile);
    return updated;
  } finally {
    await fileHandle.close();
    await unlink(lockFile).catch(() => {
    });
  }
}
const credentialsSchema = z.object({
  token: z.string(),
  secret: z.string().base64().nullish(),
  // Legacy
  encryption: z.object({
    publicKey: z.string().base64(),
    machineKey: z.string().base64()
  }).nullish()
});
async function readCredentials() {
  if (!existsSync(configuration.privateKeyFile)) {
    return null;
  }
  try {
    const keyBase64 = await readFile(configuration.privateKeyFile, "utf8");
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
  if (!existsSync(configuration.happyHomeDir)) {
    await mkdir(configuration.happyHomeDir, { recursive: true });
  }
  await writeFile(configuration.privateKeyFile, JSON.stringify({
    secret: encodeBase64(credentials.secret),
    token: credentials.token
  }, null, 2));
}
async function writeCredentialsDataKey(credentials) {
  if (!existsSync(configuration.happyHomeDir)) {
    await mkdir(configuration.happyHomeDir, { recursive: true });
  }
  await writeFile(configuration.privateKeyFile, JSON.stringify({
    encryption: { publicKey: encodeBase64(credentials.publicKey), machineKey: encodeBase64(credentials.machineKey) },
    token: credentials.token
  }, null, 2));
}
async function clearCredentials() {
  if (existsSync(configuration.privateKeyFile)) {
    await unlink(configuration.privateKeyFile);
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
    if (!existsSync(configuration.daemonStateFile)) {
      return null;
    }
    const content = await readFile(configuration.daemonStateFile, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`[PERSISTENCE] Daemon state file corrupted: ${configuration.daemonStateFile}`, error);
    return null;
  }
}
function writeDaemonState(state) {
  writeFileSync(configuration.daemonStateFile, JSON.stringify(state, null, 2), "utf-8");
}
async function clearDaemonState() {
  if (existsSync(configuration.daemonStateFile)) {
    await unlink(configuration.daemonStateFile);
  }
  if (existsSync(configuration.daemonLockFile)) {
    try {
      await unlink(configuration.daemonLockFile);
    } catch {
    }
  }
}
async function acquireDaemonLock(maxAttempts = 5, delayIncrementMs = 200) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fileHandle = await open(
        configuration.daemonLockFile,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      );
      await fileHandle.writeFile(String(process.pid));
      return fileHandle;
    } catch (error) {
      if (error.code === "EEXIST") {
        try {
          const lockPid = readFileSync(configuration.daemonLockFile, "utf-8").trim();
          if (lockPid && !isNaN(Number(lockPid))) {
            try {
              process.kill(Number(lockPid), 0);
            } catch {
              unlinkSync(configuration.daemonLockFile);
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
    if (existsSync(configuration.daemonLockFile)) {
      unlinkSync(configuration.daemonLockFile);
    }
  } catch {
  }
}
const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1e3;
function readPersistedSessions() {
  try {
    if (!existsSync(configuration.sessionsFile)) return {};
    const data = JSON.parse(readFileSync(configuration.sessionsFile, "utf-8"));
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
    const tmpFile = configuration.sessionsFile + ".tmp";
    writeFileSync(tmpFile, JSON.stringify({ sessions: existing }, null, 2), "utf-8");
    renameSync(tmpFile, configuration.sessionsFile);
  } catch (error) {
    logger.debug(`[PERSISTENCE] Failed to persist session ${sessionId}:`, error);
  }
}

export { SUPPORTED_SCHEMA_VERSION, SandboxConfigSchema, acquireDaemonLock, clearCredentials, clearDaemonState, clearMachineId, persistSession, readCredentials, readDaemonState, readPersistedSessions, readSettings, releaseDaemonLock, updateSettings, writeCredentialsDataKey, writeCredentialsLegacy, writeDaemonState };
