const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { __internal } = require('../lib/dependency-checker');

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-detector-'));
  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function writeFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function runChecks() {
  const { resolveClaudeCliFromPackageDir } = __internal || {};
  assert.strictEqual(typeof resolveClaudeCliFromPackageDir, 'function', 'resolveClaudeCliFromPackageDir should be exported for checks');

  withTempDir((tempDir) => {
    const packageDir = path.join(tempDir, 'legacy-package');
    writeFile(path.join(packageDir, 'cli.js'), '// legacy cli');
    const resolved = resolveClaudeCliFromPackageDir(packageDir);
    assert.strictEqual(resolved, path.join(packageDir, 'cli.js'), 'should prefer legacy cli.js entry');
  });

  withTempDir((tempDir) => {
    const packageDir = path.join(tempDir, 'modern-package');
    writeJson(path.join(packageDir, 'package.json'), {
      name: '@anthropic-ai/claude-code',
      version: '2.1.119',
      bin: {
        claude: 'bin/claude.exe'
      }
    });
    writeFile(path.join(packageDir, 'bin', 'claude.exe'), 'binary placeholder');
    const resolved = resolveClaudeCliFromPackageDir(packageDir);
    assert.strictEqual(resolved, path.join(packageDir, 'bin', 'claude.exe'), 'should resolve package.json bin.claude entry');
  });

  withTempDir((tempDir) => {
    const packageDir = path.join(tempDir, 'string-bin-package');
    writeJson(path.join(packageDir, 'package.json'), {
      name: '@anthropic-ai/claude-code',
      version: '2.1.119',
      bin: 'bin/claude.exe'
    });
    writeFile(path.join(packageDir, 'bin', 'claude.exe'), 'binary placeholder');
    const resolved = resolveClaudeCliFromPackageDir(packageDir);
    assert.strictEqual(resolved, path.join(packageDir, 'bin', 'claude.exe'), 'should resolve string bin entries');
  });

  withTempDir((tempDir) => {
    const packageDir = path.join(tempDir, 'wrapper-package');
    writeJson(path.join(packageDir, 'package.json'), {
      name: '@anthropic-ai/claude-code',
      version: '2.1.119'
    });
    writeFile(path.join(packageDir, 'cli-wrapper.cjs'), '// wrapper fallback');
    const resolved = resolveClaudeCliFromPackageDir(packageDir);
    assert.strictEqual(resolved, path.join(packageDir, 'cli-wrapper.cjs'), 'should fall back to cli-wrapper.cjs when no bin entry exists');
  });

  withTempDir((tempDir) => {
    const packageDir = path.join(tempDir, 'empty-package');
    writeJson(path.join(packageDir, 'package.json'), {
      name: '@anthropic-ai/claude-code',
      version: '2.1.119'
    });
    const resolved = resolveClaudeCliFromPackageDir(packageDir);
    assert.strictEqual(resolved, null, 'should return null when no supported entry exists');
  });

  console.log('Claude detector compatibility checks passed.');
}

runChecks();
