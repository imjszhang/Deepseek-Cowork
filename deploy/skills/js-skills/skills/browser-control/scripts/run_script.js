#!/usr/bin/env node

/**
 * Browser Control Script Execution Helper Tool
 * 
 * Usage:
 *   Method 1: Pass complete request JSON file
 *   node run_script.js request.json
 * 
 *   Method 2: Pass tabId and script file
 *   node run_script.js --tabId 123456789 script.js
 * 
 *   Method 3: Execute script from library
 *   node run_script.js --from-library xiaohongshu.com/get_note_info.js --tabId 123456789
 * 
 *   Method 4: Execute and auto-archive
 *   node run_script.js --tabId 123456789 script.js --auto-archive \
 *     --url "https://..." --name "my_script" --purpose "description" --keywords "keywords"
 * 
 *   Method 5: Execute script with visual feedback
 *   node run_script.js --tabId 123456789 script.js --visual-feedback
 * 
 * Features:
 *   - Read file content (correct UTF-8 encoding handling)
 *   - Read reusable scripts from script library
 *   - Construct HTTP request
 *   - Send request and auto-poll for results
 *   - Auto-archive to script library after successful execution
 *   - Support visual feedback (highlight operated elements)
 *   - Output execution results
 * 
 * @created 2026-01-11
 * @updated 2026-01-12
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Lazy load path module (avoid errors when not installed)
let pathsModule = null;
let archiveModule = null;
let updateIndexModule = null;
let visualFeedbackModule = null;

function loadModules() {
  if (!pathsModule) {
    try {
      pathsModule = require('./paths');
      archiveModule = require('./archive_script');
      updateIndexModule = require('./update_index');
    } catch (e) {
      // Ignore when modules unavailable
    }
  }
}

/**
 * Get visual feedback module code
 * @returns {string|null} Visual feedback module code
 */
function getVisualFeedbackCode() {
  if (visualFeedbackModule === null) {
    try {
      const vfModule = require('./visual-feedback');
      if (vfModule.getVisualFeedbackCode) {
        visualFeedbackModule = vfModule.getVisualFeedbackCode();
      } else {
        visualFeedbackModule = false;
      }
    } catch (e) {
      visualFeedbackModule = false;
    }
  }
  return visualFeedbackModule || null;
}

/**
 * Inject visual feedback module into script
 * @param {string} code - Original script code
 * @returns {string} Code with injection
 */
function injectVisualFeedback(code) {
  const vfCode = getVisualFeedbackCode();
  if (!vfCode) {
    console.warn('Warning: Visual feedback module unavailable, will not inject visual feedback');
    return code;
  }
  
  // Put visual feedback module code before user script
  // User script can directly use __bcHighlight API
  return `${vfCode}\n\n${code}`;
}

const BASE_URL = 'http://localhost:3333';
const POLL_INTERVAL = 500;  // Poll interval (ms)
const MAX_POLL_ATTEMPTS = 20;  // Max poll attempts

/**
 * Send HTTP request
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Poll for callback result
 */
async function pollResult(requestId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
    
    try {
      const res = await request(`${BASE_URL}/api/browser/callback_response/${requestId}`);
      if (res.status === 200 && res.data?.status === 'success') {
        return res.data;
      }
    } catch (e) {
      // Continue polling
    }
  }
  return { status: 'error', message: 'Poll timeout, result not obtained' };
}

/**
 * Read script from library
 * @param {string} libraryPath - Library path, e.g., xiaohongshu.com/get_note_info.js
 * @returns {string|null} Script code
 */
function readFromLibrary(libraryPath) {
  loadModules();
  
  if (!pathsModule) {
    console.error('Error: Path module unavailable');
    return null;
  }
  
  const libraryDir = pathsModule.getLibraryDir();
  const fullPath = path.join(libraryDir, libraryPath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Library script not found - ${fullPath}`);
    return null;
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  // Extract actual code part (skip meta comment)
  const codeStart = content.indexOf('(() =>');
  if (codeStart !== -1) {
    return content.substring(codeStart).trim();
  }
  
  // Try another format
  const funcStart = content.indexOf('(function');
  if (funcStart !== -1) {
    return content.substring(funcStart).trim();
  }
  
  // Standard format not found, return full content (remove comment header)
  const lines = content.split('\n');
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('*/')) {
      startLine = i + 1;
      break;
    }
  }
  
  return lines.slice(startLine).join('\n').trim();
}

/**
 * Update script usage count
 * @param {string} libraryPath - Library path
 */
function incrementUsageCount(libraryPath) {
  loadModules();
  
  if (!pathsModule) return;
  
  const libraryDir = pathsModule.getLibraryDir();
  const fullPath = path.join(libraryDir, libraryPath);
  
  if (!fs.existsSync(fullPath)) return;
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  
  // Update usageCount
  const match = content.match(/@usageCount\s+(\d+)/);
  if (match) {
    const currentCount = parseInt(match[1], 10);
    content = content.replace(/@usageCount\s+\d+/, `@usageCount ${currentCount + 1}`);
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}

/**
 * Execute script request
 */
async function executeScript(requestBody, options = {}) {
  // Generate requestId (if not provided)
  if (!requestBody.requestId) {
    requestBody.requestId = `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  console.log('Sending request...');
  console.log(`  tabId: ${requestBody.tabId}`);
  console.log(`  requestId: ${requestBody.requestId}`);
  console.log(`  code: ${requestBody.code.substring(0, 100)}${requestBody.code.length > 100 ? '...' : ''}`);

  try {
    const res = await request(`${BASE_URL}/api/browser/execute_script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (res.status !== 200 || res.data?.status !== 'success') {
      console.error('Request failed:', res.data);
      return { success: false, error: res.data };
    }

    console.log('Request sent, waiting for result...');

    // Poll for result
    const result = await pollResult(requestBody.requestId);
    
    console.log('\nExecution result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Determine if execution succeeded
    const isSuccess = result.status === 'success' && 
      (result.result?.success === true || result.result?.success === undefined);
    
    // If auto-archive enabled and execution succeeded
    if (options.autoArchive && isSuccess) {
      await handleAutoArchive(requestBody.code, options);
    }
    
    // If script from library, update usage count
    if (options.fromLibrary && isSuccess) {
      incrementUsageCount(options.fromLibrary);
    }
    
    return { success: isSuccess, result };
  } catch (err) {
    console.error('Execution failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Handle auto-archive
 */
async function handleAutoArchive(code, options) {
  loadModules();
  
  if (!archiveModule) {
    console.log('\nNote: Archive module unavailable, skipping auto-archive');
    return;
  }
  
  const { url, name, purpose, keywords } = options;
  
  if (!name) {
    console.log('\nNote: Script name (--name) not provided, skipping auto-archive');
    return;
  }
  
  if (!url && !options.common) {
    console.log('\nNote: URL (--url) or --common not provided, skipping auto-archive');
    return;
  }
  
  console.log('\nArchiving script...');
  
  const archiveResult = archiveModule.archiveScript({
    code,
    url,
    name,
    purpose: purpose || '',
    keywords: keywords || [],
    common: options.common || false
  });
  
  if (archiveResult.success) {
    console.log(`✓ ${archiveResult.message}`);
    console.log(`  Path: ${archiveResult.path}`);
    
    // Update index
    if (updateIndexModule) {
      updateIndexModule.updateIndex();
      console.log('✓ Index updated');
    }
  } else {
    console.log(`⚠ Archive failed: ${archiveResult.error}`);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Check for --help
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const config = {
    mode: null,
    tabId: null,
    scriptFile: null,
    jsonFile: null,
    fromLibrary: null,
    autoArchive: false,
    visualFeedback: false,
    url: null,
    name: null,
    purpose: null,
    keywords: [],
    common: false
  };
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tabId':
        config.tabId = parseInt(args[++i], 10);
        break;
      case '--from-library':
        config.fromLibrary = args[++i];
        config.mode = 'library';
        break;
      case '--auto-archive':
        config.autoArchive = true;
        break;
      case '--visual-feedback':
      case '--vf':
        config.visualFeedback = true;
        break;
      case '--url':
        config.url = args[++i];
        break;
      case '--name':
        config.name = args[++i];
        break;
      case '--purpose':
        config.purpose = args[++i];
        break;
      case '--keywords':
        config.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        config.common = true;
        break;
      default:
        // Non-option argument
        if (!args[i].startsWith('--')) {
          if (args[i].endsWith('.json')) {
            config.jsonFile = args[i];
            if (!config.mode) config.mode = 'json';
          } else if (args[i].endsWith('.js')) {
            config.scriptFile = args[i];
            if (!config.mode) config.mode = 'script';
          }
        }
    }
  }
  
  // Validate arguments
  if (config.mode === 'library' && !config.tabId) {
    console.error('Error: --from-library requires --tabId');
    process.exit(1);
  }
  
  if (config.mode === 'script' && !config.tabId) {
    console.error('Error: Script mode requires --tabId');
    process.exit(1);
  }
  
  if (!config.mode && config.tabId) {
    console.error('Error: Need to provide script file or --from-library parameter');
    process.exit(1);
  }
  
  if (!config.mode) {
    console.error('Error: Need to provide request file, script file, or --from-library parameter');
    printUsage();
    process.exit(1);
  }
  
  return config;
}

/**
 * Print usage instructions
 */
function printUsage() {
  console.log(`
Browser Control Script Execution Helper Tool

Usage:
  Method 1: Pass complete request JSON file
  node run_script.js <request.json>

  Method 2: Pass tabId and script file
  node run_script.js --tabId <tabId> <script.js>

  Method 3: Execute from script library
  node run_script.js --from-library <domain/script.js> --tabId <tabId>

  Method 4: Execute and auto-archive (new script)
  node run_script.js --tabId <tabId> <script.js> --auto-archive \\
    --url <url> --name <name> --purpose <desc> --keywords <kw1,kw2>

  Method 5: Execute script with visual feedback
  node run_script.js --tabId <tabId> <script.js> --visual-feedback

Examples:
  # Execute from JSON file
  node run_script.js script_request.json

  # Execute from script file
  node run_script.js --tabId 123456789 get_title.js

  # Execute from library
  node run_script.js --from-library xiaohongshu.com/get_note_info.js --tabId 123456789

  # Execute and archive to specific site
  node run_script.js --tabId 123456789 my_script.js --auto-archive \\
    --url "https://www.xiaohongshu.com/..." \\
    --name "get_note_info" \\
    --purpose "Extract note info" \\
    --keywords "note,title,likes"

  # Execute and archive to common directory
  node run_script.js --tabId 123456789 scroll.js --auto-archive \\
    --common --name "scroll_to_bottom" --purpose "Scroll to bottom"

  # Execute with visual feedback (highlight operated elements)
  node run_script.js --tabId 123456789 click_button.js --visual-feedback

JSON request file format:
  {
    "tabId": 123456789,
    "code": "document.title"
  }

Options:
  --tabId <id>              Specify target tab ID
  --from-library <path>     Read from script library (e.g., xiaohongshu.com/get_note_info.js)
  --auto-archive            Auto-archive after successful execution
  --visual-feedback, --vf   Enable visual feedback (highlight operated elements)
  --url <url>               Target page URL (for archive domain)
  --name <name>             Script name (for archive)
  --purpose <desc>          Script purpose description (for archive)
  --keywords <kw1,kw2>      Keywords, comma-separated (for archive)
  --common                  Archive to common scripts directory
  --help, -h                Show this help message

Visual feedback notes:
  With --visual-feedback enabled, scripts can use __bcHighlight API:
  - __bcHighlight.show(element, options)    Show highlight
  - __bcHighlight.hide(element)             Hide highlight
  - __bcHighlight.success(element)          Success feedback (green)
  - __bcHighlight.fail(element)             Failure feedback (red)
  - __bcHighlight.withFeedback(el, fn)      Auto-wrap operation
  - __bcHighlight.batch(elements, fn)       Batch operation with numbers
  - __bcHighlight.cleanup()                 Clear all highlights
`);
}

/**
 * Main function
 */
async function main() {
  const config = parseArgs();
  let requestBody;
  let code;

  if (config.mode === 'json') {
    // Method 1: Read JSON request file
    const filePath = path.resolve(config.jsonFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found - ${filePath}`);
      process.exit(1);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      requestBody = JSON.parse(content);
    } catch (e) {
      console.error(`Error: Failed to parse JSON file - ${e.message}`);
      process.exit(1);
    }

    if (!requestBody.tabId || !requestBody.code) {
      console.error('Error: JSON file must contain tabId and code fields');
      process.exit(1);
    }
    
    code = requestBody.code;
    
  } else if (config.mode === 'library') {
    // Method 3: Read from script library
    code = readFromLibrary(config.fromLibrary);
    
    if (!code) {
      process.exit(1);
    }
    
    requestBody = {
      tabId: config.tabId,
      code: code
    };
    
    console.log(`Reading script from library: ${config.fromLibrary}`);
    
  } else {
    // Method 2: Read script file and construct request
    const filePath = path.resolve(config.scriptFile);
    
    if (!fs.existsSync(filePath)) {
      console.error(`Error: Script file not found - ${filePath}`);
      process.exit(1);
    }

    try {
      code = fs.readFileSync(filePath, 'utf-8').trim();
      requestBody = {
        tabId: config.tabId,
        code: code
      };
    } catch (e) {
      console.error(`Error: Failed to read script file - ${e.message}`);
      process.exit(1);
    }
  }

  // If visual feedback enabled, inject visual feedback module
  if (config.visualFeedback) {
    console.log('Enabling visual feedback mode...');
    requestBody.code = injectVisualFeedback(requestBody.code);
  }

  const result = await executeScript(requestBody, {
    autoArchive: config.autoArchive,
    fromLibrary: config.fromLibrary,
    url: config.url,
    name: config.name,
    purpose: config.purpose,
    keywords: config.keywords,
    common: config.common
  });
  
  if (!result.success) {
    process.exit(1);
  }
}

main();
