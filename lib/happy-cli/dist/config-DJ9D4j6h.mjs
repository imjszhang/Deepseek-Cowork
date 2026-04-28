import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { l as logger } from './types-BDOVRaQz.mjs';
import { D as DEFAULT_GEMINI_MODEL, G as GEMINI_MODEL_ENV } from './index-x9ZRFnR3.mjs';
import 'axios';
import 'chalk';
import 'node:util';
import 'node:fs';
import 'node:os';
import 'node:path';
import 'node:events';
import 'socket.io-client';
import 'zod';
import '@slopus/happy-wire';
import 'node:crypto';
import 'tweetnacl';
import 'util';
import 'fs/promises';
import 'crypto';
import 'cross-spawn';
import 'url';
import '@paralleldrive/cuid2';
import 'expo-server-sdk';
import 'node:readline';
import '@anthropic-ai/sandbox-runtime';
import 'node:fs/promises';
import 'ink';
import 'react';
import '@anthropic-ai/claude-agent-sdk';
import 'node:child_process';
import './persistence-tjdFxr4R.mjs';
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

function readGeminiLocalConfig() {
  let token = null;
  let model = null;
  let googleCloudProject = null;
  let googleCloudProjectEmail = null;
  const possiblePaths = [
    join(homedir(), ".gemini", "oauth_creds.json"),
    // Main OAuth credentials file
    join(homedir(), ".gemini", "config.json"),
    join(homedir(), ".config", "gemini", "config.json"),
    join(homedir(), ".gemini", "auth.json"),
    join(homedir(), ".config", "gemini", "auth.json")
  ];
  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (!token) {
          const foundToken = config.access_token || config.token || config.apiKey || config.GEMINI_API_KEY;
          if (foundToken && typeof foundToken === "string") {
            token = foundToken;
            logger.debug(`[Gemini] Found token in ${configPath}`);
          }
        }
        if (!model) {
          const foundModel = config.model || config.GEMINI_MODEL;
          if (foundModel && typeof foundModel === "string") {
            model = foundModel;
            logger.debug(`[Gemini] Found model in ${configPath}: ${model}`);
          }
        }
        if (!googleCloudProject) {
          const foundProject = config.googleCloudProject || config.google_cloud_project || config.projectId;
          if (foundProject && typeof foundProject === "string") {
            googleCloudProject = foundProject;
            if (config.googleCloudProjectEmail && typeof config.googleCloudProjectEmail === "string") {
              googleCloudProjectEmail = config.googleCloudProjectEmail;
            }
            logger.debug(`[Gemini] Found Google Cloud Project in ${configPath}: ${googleCloudProject}${googleCloudProjectEmail ? ` (for ${googleCloudProjectEmail})` : ""}`);
          }
        }
      } catch (error) {
        logger.debug(`[Gemini] Failed to read config from ${configPath}:`, error);
      }
    }
  }
  if (!token) {
    try {
      const gcloudToken = execSync("gcloud auth application-default print-access-token", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5e3,
        windowsHide: true
      }).trim();
      if (gcloudToken && gcloudToken.length > 0) {
        token = gcloudToken;
        logger.debug("[Gemini] Found token via gcloud Application Default Credentials");
      }
    } catch (error) {
      logger.debug("[Gemini] gcloud Application Default Credentials not available");
    }
  }
  if (!googleCloudProject) {
    const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (envProject) {
      googleCloudProject = envProject;
      googleCloudProjectEmail = null;
      logger.debug(`[Gemini] Found Google Cloud Project from env: ${googleCloudProject}`);
    }
  }
  return { token, model, googleCloudProject, googleCloudProjectEmail };
}
function determineGeminiModel(explicitModel, localConfig) {
  if (explicitModel !== void 0) {
    if (explicitModel === null) {
      return process.env[GEMINI_MODEL_ENV] || DEFAULT_GEMINI_MODEL;
    } else {
      return explicitModel;
    }
  } else {
    const envModel = process.env[GEMINI_MODEL_ENV];
    logger.debug(`[Gemini] Model selection: env[GEMINI_MODEL_ENV]=${envModel}, localConfig.model=${localConfig.model}, DEFAULT=${DEFAULT_GEMINI_MODEL}`);
    const model = envModel || localConfig.model || DEFAULT_GEMINI_MODEL;
    logger.debug(`[Gemini] Selected model: ${model}`);
    return model;
  }
}
function saveGeminiModelToConfig(model) {
  try {
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
        logger.debug(`[Gemini] Failed to read existing config, creating new one`);
        config = {};
      }
    }
    config.model = model;
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    logger.debug(`[Gemini] Saved model "${model}" to ${configPath}`);
  } catch (error) {
    logger.debug(`[Gemini] Failed to save model to config:`, error);
  }
}
function saveGoogleCloudProjectToConfig(projectId, email) {
  try {
    const configDir = join(homedir(), ".gemini");
    const configPath = join(configDir, "config.json");
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    let config = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        config = {};
      }
    }
    config.googleCloudProject = projectId;
    if (email) {
      config.googleCloudProjectEmail = email;
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    logger.debug(`[Gemini] Saved Google Cloud Project "${projectId}"${email ? ` for ${email}` : ""} to ${configPath}`);
  } catch (error) {
    logger.debug(`[Gemini] Failed to save Google Cloud Project to config:`, error);
    throw error;
  }
}
function getInitialGeminiModel() {
  const localConfig = readGeminiLocalConfig();
  return process.env[GEMINI_MODEL_ENV] || localConfig.model || DEFAULT_GEMINI_MODEL;
}
function getGeminiModelSource(explicitModel, localConfig) {
  if (explicitModel !== void 0 && explicitModel !== null) {
    return "explicit";
  } else if (process.env[GEMINI_MODEL_ENV]) {
    return "env-var";
  } else if (localConfig.model) {
    return "local-config";
  } else {
    return "default";
  }
}

export { determineGeminiModel, getGeminiModelSource, getInitialGeminiModel, readGeminiLocalConfig, saveGeminiModelToConfig, saveGoogleCloudProjectToConfig };
