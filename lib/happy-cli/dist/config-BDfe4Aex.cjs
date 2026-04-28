'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var child_process = require('child_process');
var api = require('./types-DB662inl.cjs');
var index = require('./index-BJ1EcyS9.cjs');
require('axios');
require('chalk');
require('node:util');
require('node:fs');
require('node:os');
require('node:path');
require('node:events');
require('socket.io-client');
require('zod');
require('@slopus/happy-wire');
require('node:crypto');
require('tweetnacl');
require('util');
require('fs/promises');
require('crypto');
require('cross-spawn');
require('url');
require('@paralleldrive/cuid2');
require('expo-server-sdk');
require('node:readline');
require('@anthropic-ai/sandbox-runtime');
require('node:fs/promises');
require('ink');
require('react');
require('@anthropic-ai/claude-agent-sdk');
require('node:child_process');
require('./persistence-CoLu_Clg.cjs');
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

function readGeminiLocalConfig() {
  let token = null;
  let model = null;
  let googleCloudProject = null;
  let googleCloudProjectEmail = null;
  const possiblePaths = [
    path.join(os.homedir(), ".gemini", "oauth_creds.json"),
    // Main OAuth credentials file
    path.join(os.homedir(), ".gemini", "config.json"),
    path.join(os.homedir(), ".config", "gemini", "config.json"),
    path.join(os.homedir(), ".gemini", "auth.json"),
    path.join(os.homedir(), ".config", "gemini", "auth.json")
  ];
  for (const configPath of possiblePaths) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (!token) {
          const foundToken = config.access_token || config.token || config.apiKey || config.GEMINI_API_KEY;
          if (foundToken && typeof foundToken === "string") {
            token = foundToken;
            api.logger.debug(`[Gemini] Found token in ${configPath}`);
          }
        }
        if (!model) {
          const foundModel = config.model || config.GEMINI_MODEL;
          if (foundModel && typeof foundModel === "string") {
            model = foundModel;
            api.logger.debug(`[Gemini] Found model in ${configPath}: ${model}`);
          }
        }
        if (!googleCloudProject) {
          const foundProject = config.googleCloudProject || config.google_cloud_project || config.projectId;
          if (foundProject && typeof foundProject === "string") {
            googleCloudProject = foundProject;
            if (config.googleCloudProjectEmail && typeof config.googleCloudProjectEmail === "string") {
              googleCloudProjectEmail = config.googleCloudProjectEmail;
            }
            api.logger.debug(`[Gemini] Found Google Cloud Project in ${configPath}: ${googleCloudProject}${googleCloudProjectEmail ? ` (for ${googleCloudProjectEmail})` : ""}`);
          }
        }
      } catch (error) {
        api.logger.debug(`[Gemini] Failed to read config from ${configPath}:`, error);
      }
    }
  }
  if (!token) {
    try {
      const gcloudToken = child_process.execSync("gcloud auth application-default print-access-token", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5e3,
        windowsHide: true
      }).trim();
      if (gcloudToken && gcloudToken.length > 0) {
        token = gcloudToken;
        api.logger.debug("[Gemini] Found token via gcloud Application Default Credentials");
      }
    } catch (error) {
      api.logger.debug("[Gemini] gcloud Application Default Credentials not available");
    }
  }
  if (!googleCloudProject) {
    const envProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (envProject) {
      googleCloudProject = envProject;
      googleCloudProjectEmail = null;
      api.logger.debug(`[Gemini] Found Google Cloud Project from env: ${googleCloudProject}`);
    }
  }
  return { token, model, googleCloudProject, googleCloudProjectEmail };
}
function determineGeminiModel(explicitModel, localConfig) {
  if (explicitModel !== void 0) {
    if (explicitModel === null) {
      return process.env[index.GEMINI_MODEL_ENV] || index.DEFAULT_GEMINI_MODEL;
    } else {
      return explicitModel;
    }
  } else {
    const envModel = process.env[index.GEMINI_MODEL_ENV];
    api.logger.debug(`[Gemini] Model selection: env[GEMINI_MODEL_ENV]=${envModel}, localConfig.model=${localConfig.model}, DEFAULT=${index.DEFAULT_GEMINI_MODEL}`);
    const model = envModel || localConfig.model || index.DEFAULT_GEMINI_MODEL;
    api.logger.debug(`[Gemini] Selected model: ${model}`);
    return model;
  }
}
function saveGeminiModelToConfig(model) {
  try {
    const configDir = path.join(os.homedir(), ".gemini");
    const configPath = path.join(configDir, "config.json");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch (error) {
        api.logger.debug(`[Gemini] Failed to read existing config, creating new one`);
        config = {};
      }
    }
    config.model = model;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    api.logger.debug(`[Gemini] Saved model "${model}" to ${configPath}`);
  } catch (error) {
    api.logger.debug(`[Gemini] Failed to save model to config:`, error);
  }
}
function saveGoogleCloudProjectToConfig(projectId, email) {
  try {
    const configDir = path.join(os.homedir(), ".gemini");
    const configPath = path.join(configDir, "config.json");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        config = {};
      }
    }
    config.googleCloudProject = projectId;
    if (email) {
      config.googleCloudProjectEmail = email;
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    api.logger.debug(`[Gemini] Saved Google Cloud Project "${projectId}"${email ? ` for ${email}` : ""} to ${configPath}`);
  } catch (error) {
    api.logger.debug(`[Gemini] Failed to save Google Cloud Project to config:`, error);
    throw error;
  }
}
function getInitialGeminiModel() {
  const localConfig = readGeminiLocalConfig();
  return process.env[index.GEMINI_MODEL_ENV] || localConfig.model || index.DEFAULT_GEMINI_MODEL;
}
function getGeminiModelSource(explicitModel, localConfig) {
  if (explicitModel !== void 0 && explicitModel !== null) {
    return "explicit";
  } else if (process.env[index.GEMINI_MODEL_ENV]) {
    return "env-var";
  } else if (localConfig.model) {
    return "local-config";
  } else {
    return "default";
  }
}

exports.determineGeminiModel = determineGeminiModel;
exports.getGeminiModelSource = getGeminiModelSource;
exports.getInitialGeminiModel = getInitialGeminiModel;
exports.readGeminiLocalConfig = readGeminiLocalConfig;
exports.saveGeminiModelToConfig = saveGeminiModelToConfig;
exports.saveGoogleCloudProjectToConfig = saveGoogleCloudProjectToConfig;
