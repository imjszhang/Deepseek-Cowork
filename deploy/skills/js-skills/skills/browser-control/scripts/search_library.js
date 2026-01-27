#!/usr/bin/env node

/**
 * search_library.js - Search Script Library
 * 
 * Search existing library before creating new scripts to find reusable scripts
 * 
 * Usage:
 *   # Auto-match site by URL
 *   node search_library.js --url "https://www.xiaohongshu.com/..."
 * 
 *   # Search by domain + keywords
 *   node search_library.js --domain xiaohongshu.com --keywords "note,extract"
 * 
 *   # Search common scripts
 *   node search_library.js --common --keywords "scroll"
 * 
 *   # List all scripts
 *   node search_library.js --list
 * 
 * @created 2026-01-11
 */

const fs = require('fs');
const path = require('path');
const {
  ensureDataDir,
  getLibraryDir,
  getCommonDir,
  getDomainDir,
  getSiteMetaFile,
  extractDomain
} = require('./paths');

/**
 * Parse script file metadata
 * @param {string} filePath - Script file path
 * @returns {Object|null} Metadata object
 */
function parseScriptMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const meta = {
      name: path.basename(filePath, '.js'),
      purpose: '',
      keywords: [],
      created: '',
      updated: '',
      usageCount: 0,
      filePath: filePath
    };
    
    // Parse JSDoc style metadata
    const nameMatch = content.match(/@name\s+(.+)/);
    const purposeMatch = content.match(/@purpose\s+(.+)/);
    const keywordsMatch = content.match(/@keywords\s+(.+)/);
    const createdMatch = content.match(/@created\s+(.+)/);
    const updatedMatch = content.match(/@updated\s+(.+)/);
    const usageMatch = content.match(/@usageCount\s+(\d+)/);
    
    if (nameMatch) meta.name = nameMatch[1].trim();
    if (purposeMatch) meta.purpose = purposeMatch[1].trim();
    if (keywordsMatch) {
      meta.keywords = keywordsMatch[1].split(/[,，]/).map(k => k.trim()).filter(k => k);
    }
    if (createdMatch) meta.created = createdMatch[1].trim();
    if (updatedMatch) meta.updated = updatedMatch[1].trim();
    if (usageMatch) meta.usageCount = parseInt(usageMatch[1], 10);
    
    return meta;
  } catch (e) {
    return null;
  }
}

/**
 * Get metadata for all scripts in directory
 * @param {string} dirPath - Directory path
 * @returns {Array} Script metadata array
 */
function getScriptsInDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  
  const scripts = [];
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (file.endsWith('.js') && !file.startsWith('_')) {
      const filePath = path.join(dirPath, file);
      const meta = parseScriptMeta(filePath);
      if (meta) {
        scripts.push(meta);
      }
    }
  }
  
  return scripts;
}

/**
 * Read site metadata
 * @param {string} domain - Domain name
 * @returns {Object|null} Site metadata
 */
function getSiteMeta(domain) {
  const siteFile = getSiteMetaFile(domain);
  if (fs.existsSync(siteFile)) {
    try {
      return JSON.parse(fs.readFileSync(siteFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Find domain by alias
 * @param {string} alias - Alias
 * @returns {string|null} Matching domain
 */
function findDomainByAlias(alias) {
  const libraryDir = getLibraryDir();
  if (!fs.existsSync(libraryDir)) {
    return null;
  }
  
  const dirs = fs.readdirSync(libraryDir);
  for (const dir of dirs) {
    if (dir.startsWith('_')) continue;
    
    const siteMeta = getSiteMeta(dir);
    if (siteMeta && siteMeta.aliases && siteMeta.aliases.includes(alias)) {
      return dir;
    }
  }
  
  return null;
}

/**
 * Calculate keyword match score
 * @param {Array} scriptKeywords - Script keywords
 * @param {Array} searchKeywords - Search keywords
 * @returns {number} Match score 0-100
 */
function calculateMatchScore(scriptKeywords, searchKeywords) {
  if (!searchKeywords.length || !scriptKeywords.length) {
    return 0;
  }
  
  let matches = 0;
  const lowerScriptKeywords = scriptKeywords.map(k => k.toLowerCase());
  
  for (const searchKw of searchKeywords) {
    const lowerSearchKw = searchKw.toLowerCase();
    for (const scriptKw of lowerScriptKeywords) {
      if (scriptKw.includes(lowerSearchKw) || lowerSearchKw.includes(scriptKw)) {
        matches++;
        break;
      }
    }
  }
  
  return Math.round((matches / searchKeywords.length) * 100);
}

/**
 * Search scripts
 * @param {Object} options - Search options
 * @param {string} options.url - URL
 * @param {string} options.domain - Domain
 * @param {Array} options.keywords - Keywords
 * @param {boolean} options.common - Only search common scripts
 * @returns {Array} Matching script list
 */
function searchScripts(options) {
  ensureDataDir();
  
  const { url, domain, keywords = [], common = false } = options;
  const results = [];
  
  // Determine target domain
  let targetDomain = domain;
  if (url && !targetDomain) {
    targetDomain = extractDomain(url);
  }
  
  // Try to find by alias
  if (targetDomain) {
    const actualDomain = findDomainByAlias(targetDomain);
    if (actualDomain) {
      targetDomain = actualDomain;
    }
  }
  
  const searchKeywords = keywords;
  
  // Search specific domain directory
  if (targetDomain && !common) {
    const domainDir = getDomainDir(targetDomain);
    const scripts = getScriptsInDir(domainDir);
    
    for (const script of scripts) {
      const score = searchKeywords.length > 0
        ? calculateMatchScore(script.keywords, searchKeywords)
        : 50; // Base score when no keywords
      
      results.push({
        ...script,
        domain: targetDomain,
        matchScore: score,
        source: 'domain'
      });
    }
  }
  
  // Search common scripts
  if (common || !targetDomain || results.length === 0) {
    const commonDir = getCommonDir();
    const scripts = getScriptsInDir(commonDir);
    
    for (const script of scripts) {
      const score = searchKeywords.length > 0
        ? calculateMatchScore(script.keywords, searchKeywords)
        : 30; // Lower base score for common scripts
      
      results.push({
        ...script,
        domain: '_common',
        matchScore: score,
        source: 'common'
      });
    }
  }
  
  // Sort by match score
  results.sort((a, b) => b.matchScore - a.matchScore);
  
  // Filter low score results (if keyword search)
  if (searchKeywords.length > 0) {
    return results.filter(r => r.matchScore > 0);
  }
  
  return results;
}

/**
 * List all scripts
 * @returns {Object} Scripts grouped by domain
 */
function listAllScripts() {
  ensureDataDir();
  
  const libraryDir = getLibraryDir();
  const result = {};
  
  if (!fs.existsSync(libraryDir)) {
    return result;
  }
  
  const dirs = fs.readdirSync(libraryDir);
  
  for (const dir of dirs) {
    const dirPath = path.join(libraryDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    
    const scripts = getScriptsInDir(dirPath);
    if (scripts.length > 0) {
      const siteMeta = dir === '_common' ? { name: 'Common' } : getSiteMeta(dir);
      result[dir] = {
        name: siteMeta?.name || dir,
        scripts: scripts
      };
    }
  }
  
  return result;
}

/**
 * Print search results
 * @param {Array} results - Search results
 * @param {string} domain - Searched domain
 */
function printResults(results, domain) {
  if (results.length === 0) {
    console.log('\nNo matching scripts found.');
    console.log('Tip: You can create a new script, and it will be auto-archived after successful execution.');
    return;
  }
  
  console.log(`\nFound ${results.length} matching script(s):\n`);
  
  results.forEach((script, index) => {
    const domainLabel = script.domain === '_common' ? 'Common' : script.domain;
    console.log(`${index + 1}. ${script.name} (Match: ${script.matchScore}%)`);
    console.log(`   Purpose: ${script.purpose || 'No description'}`);
    console.log(`   Site: ${domainLabel}`);
    console.log(`   Keywords: ${script.keywords.join(', ') || 'None'}`);
    console.log(`   Path: ${script.filePath}`);
    console.log(`   Usage count: ${script.usageCount}`);
    console.log('');
  });
  
  console.log('Usage:');
  console.log('  node scripts/run_script.js --from-library <domain/script.js> --tabId <tabId>');
}

/**
 * Print all scripts list
 * @param {Object} allScripts - All scripts
 */
function printAllScripts(allScripts) {
  const domains = Object.keys(allScripts);
  
  if (domains.length === 0) {
    console.log('\nScript library is empty.');
    return;
  }
  
  let totalScripts = 0;
  
  console.log('\n=== Script Library Contents ===\n');
  
  for (const domain of domains) {
    const { name, scripts } = allScripts[domain];
    totalScripts += scripts.length;
    
    console.log(`[${name}] (${domain})`);
    
    for (const script of scripts) {
      console.log(`  - ${script.name}: ${script.purpose || 'No description'}`);
    }
    
    console.log('');
  }
  
  console.log(`Total: ${domains.length} site(s), ${totalScripts} script(s)`);
}

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: null,
    domain: null,
    keywords: [],
    common: false,
    list: false,
    help: false,
    json: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        options.url = args[++i];
        break;
      case '--domain':
        options.domain = args[++i];
        break;
      case '--keywords':
        options.keywords = args[++i].split(/[,，]/).map(k => k.trim()).filter(k => k);
        break;
      case '--common':
        options.common = true;
        break;
      case '--list':
        options.list = true;
        break;
      case '--json':
        options.json = true;
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
Search Script Library

Usage:
  node search_library.js [options]

Options:
  --url <url>           Auto-match site by URL
  --domain <domain>     Search by specific domain
  --keywords <kw1,kw2>  Search by keywords (comma-separated)
  --common              Only search common scripts
  --list                List all scripts
  --json                Output in JSON format
  --help, -h            Show this help message

Examples:
  # Search by URL
  node search_library.js --url "https://www.xiaohongshu.com/explore/xxx"

  # Search by domain + keywords
  node search_library.js --domain xiaohongshu.com --keywords "note,extract"

  # Search common scripts
  node search_library.js --common --keywords "scroll"

  # List all scripts
  node search_library.js --list
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
  
  if (options.list) {
    const allScripts = listAllScripts();
    if (options.json) {
      console.log(JSON.stringify(allScripts, null, 2));
    } else {
      printAllScripts(allScripts);
    }
    return;
  }
  
  // Execute search
  const results = searchScripts(options);
  
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const domain = options.domain || (options.url ? extractDomain(options.url) : null);
    printResults(results, domain);
  }
}

// Export functions for other modules
module.exports = {
  searchScripts,
  listAllScripts,
  parseScriptMeta,
  getScriptsInDir,
  getSiteMeta,
  findDomainByAlias,
  calculateMatchScore
};

// Execute main function if run directly
if (require.main === module) {
  main();
}
