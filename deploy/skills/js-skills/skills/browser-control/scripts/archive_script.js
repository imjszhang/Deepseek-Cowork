#!/usr/bin/env node

/**
 * archive_script.js - Archive Script to Library
 * 
 * Save successfully executed scripts to script library
 * 
 * Usage:
 *   # Archive from code string
 *   node archive_script.js \
 *     --code "(() => { ... })()" \
 *     --url "https://..." \
 *     --name "get_note_info" \
 *     --purpose "Extract note info" \
 *     --keywords "note,title,likes"
 * 
 *   # Archive from file
 *   node archive_script.js \
 *     --file "./my_script.js" \
 *     --url "https://..." \
 *     --name "get_note_info" \
 *     --purpose "Extract note info" \
 *     --keywords "note,title,likes"
 * 
 *   # Archive to common directory
 *   node archive_script.js \
 *     --code "..." \
 *     --common \
 *     --name "scroll_to_bottom" \
 *     --purpose "Scroll to page bottom"
 * 
 * @created 2026-01-11
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  ensureDataDir,
  ensureDomainDir,
  getLibraryDir,
  getCommonDir,
  getDomainDir,
  getSiteMetaFile,
  extractDomain,
  formatDate
} = require('./paths');

/**
 * Calculate code hash
 * @param {string} code - Code string
 * @returns {string} Hash value (first 8 chars)
 */
function hashCode(code) {
  // Calculate hash after removing comments and whitespace
  const normalized = code
    .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove block comments
    .replace(/\/\/.*/g, '')             // Remove line comments
    .replace(/\s+/g, ' ')               // Compress whitespace
    .trim();
  
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
}

/**
 * Check if script with same code exists
 * @param {string} targetDir - Target directory
 * @param {string} code - Code
 * @returns {string|null} Existing script filename, null if not found
 */
function findDuplicateScript(targetDir, code) {
  if (!fs.existsSync(targetDir)) {
    return null;
  }
  
  const newHash = hashCode(code);
  const files = fs.readdirSync(targetDir);
  
  for (const file of files) {
    if (!file.endsWith('.js') || file.startsWith('_')) continue;
    
    const filePath = path.join(targetDir, file);
    const existingCode = fs.readFileSync(filePath, 'utf8');
    
    // Extract actual code part (skip meta comment)
    const codeStart = existingCode.indexOf('(() =>') !== -1 
      ? existingCode.indexOf('(() =>')
      : existingCode.indexOf('(function');
    
    if (codeStart !== -1) {
      const existingHash = hashCode(existingCode.substring(codeStart));
      if (existingHash === newHash) {
        return file;
      }
    }
  }
  
  return null;
}

/**
 * Generate script content with metadata
 * @param {string} code - Original code
 * @param {Object} meta - Metadata
 * @returns {string} Complete script with metadata
 */
function generateScriptWithMeta(code, meta) {
  const { name, purpose, keywords, created, updated } = meta;
  
  // Check if code already has metadata header
  if (code.trim().startsWith('/**') && code.includes('@name')) {
    // Already has metadata, update it
    return code.replace(/@updated\s+.+/, `@updated ${updated}`);
  }
  
  // Generate new metadata header
  const header = `/**
 * @name ${name}
 * @purpose ${purpose}
 * @keywords ${keywords.join(', ')}
 * @created ${created}
 * @updated ${updated}
 * @usageCount 0
 */
`;
  
  return header + code.trim() + '\n';
}

/**
 * Update site metadata
 * @param {string} domain - Domain
 */
function updateSiteMeta(domain) {
  const siteFile = getSiteMetaFile(domain);
  
  if (fs.existsSync(siteFile)) {
    const siteMeta = JSON.parse(fs.readFileSync(siteFile, 'utf8'));
    
    // Count scripts
    const domainDir = getDomainDir(domain);
    const files = fs.readdirSync(domainDir);
    const scriptCount = files.filter(f => f.endsWith('.js') && !f.startsWith('_')).length;
    
    siteMeta.scriptCount = scriptCount;
    siteMeta.lastUpdated = formatDate();
    
    fs.writeFileSync(siteFile, JSON.stringify(siteMeta, null, 2), 'utf8');
  }
}

/**
 * Archive script
 * @param {Object} options - Archive options
 * @returns {Object} Archive result
 */
function archiveScript(options) {
  const {
    code,
    file,
    url,
    name,
    purpose = '',
    keywords = [],
    common = false,
    force = false
  } = options;
  
  // Get code
  let scriptCode = code;
  if (file && !scriptCode) {
    if (!fs.existsSync(file)) {
      return { success: false, error: `File not found: ${file}` };
    }
    scriptCode = fs.readFileSync(file, 'utf8');
  }
  
  if (!scriptCode) {
    return { success: false, error: 'No code or file provided' };
  }
  
  if (!name) {
    return { success: false, error: 'Script name not provided' };
  }
  
  // Determine target directory
  let targetDir;
  let domain;
  
  if (common) {
    targetDir = getCommonDir();
    domain = '_common';
  } else if (url) {
    domain = extractDomain(url);
    if (!domain) {
      return { success: false, error: `Cannot extract domain from URL: ${url}` };
    }
    ensureDomainDir(domain);
    targetDir = getDomainDir(domain);
  } else {
    return { success: false, error: 'Need to provide --url or --common parameter' };
  }
  
  ensureDataDir();
  
  // Check for duplicates
  const duplicate = findDuplicateScript(targetDir, scriptCode);
  if (duplicate && !force) {
    return {
      success: false,
      error: `Found script with same code: ${duplicate}`,
      duplicate: duplicate
    };
  }
  
  // Check for same name file
  const targetFile = path.join(targetDir, `${name}.js`);
  if (fs.existsSync(targetFile) && !force) {
    return {
      success: false,
      error: `Script with same name exists: ${name}.js`,
      existing: targetFile
    };
  }
  
  // Generate script with metadata
  const today = formatDate();
  const fullScript = generateScriptWithMeta(scriptCode, {
    name,
    purpose,
    keywords,
    created: today,
    updated: today
  });
  
  // Write file
  fs.writeFileSync(targetFile, fullScript, 'utf8');
  
  // Update site metadata
  if (domain !== '_common') {
    updateSiteMeta(domain);
  }
  
  return {
    success: true,
    message: `Script archived: ${name}.js`,
    path: targetFile,
    domain: domain
  };
}

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    code: null,
    file: null,
    url: null,
    name: null,
    purpose: '',
    keywords: [],
    common: false,
    force: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--code':
        options.code = args[++i];
        break;
      case '--file':
        options.file = args[++i];
        break;
      case '--url':
        options.url = args[++i];
        break;
      case '--name':
        options.name = args[++i];
        break;
      case '--purpose':
        options.purpose = args[++i];
        break;
      case '--keywords':
        options.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        options.common = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

/**
 * Print usage instructions
 */
function printUsage() {
  console.log(`
Archive Script to Library

Usage:
  node archive_script.js [options]

Options:
  --code <code>         Script code string
  --file <path>         Script file path
  --url <url>           Target page URL (for archive domain)
  --name <name>         Script name (without .js suffix)
  --purpose <desc>      Script purpose description
  --keywords <kw1,kw2>  Keywords (comma-separated)
  --common              Archive to common scripts directory
  --force               Force overwrite existing script
  --help, -h            Show this help message

Examples:
  # Archive from code string to specific site
  node archive_script.js \\
    --code "(() => { return document.title; })()" \\
    --url "https://www.xiaohongshu.com/explore/xxx" \\
    --name "get_title" \\
    --purpose "Get page title" \\
    --keywords "title"

  # Archive from file to common directory
  node archive_script.js \\
    --file "./scroll_to_bottom.js" \\
    --common \\
    --name "scroll_to_bottom" \\
    --purpose "Scroll to page bottom to load more"
`);
}

/**
 * Main function
 */
function main() {
  const options = parseArgs();
  
  if (options.help) {
    printUsage();
    return;
  }
  
  const result = archiveScript(options);
  
  if (result.success) {
    console.log(`✓ ${result.message}`);
    console.log(`  Path: ${result.path}`);
    console.log(`  Domain: ${result.domain}`);
    console.log('');
    console.log('Tip: Run update_index.js to update index');
  } else {
    console.error(`✗ Archive failed: ${result.error}`);
    if (result.duplicate) {
      console.log(`  Script with same code exists: ${result.duplicate}`);
      console.log('  Use --force to overwrite');
    }
    if (result.existing) {
      console.log(`  Use --force to overwrite`);
    }
    process.exit(1);
  }
}

// Export functions for other modules
module.exports = {
  archiveScript,
  hashCode,
  findDuplicateScript,
  generateScriptWithMeta,
  updateSiteMeta
};

// Execute main function if run directly
if (require.main === module) {
  main();
}
