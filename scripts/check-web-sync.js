const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FILES_TO_COMPARE = [
  ['renderer/js/app.js', 'docs/app/js/app.js'],
  ['renderer/js/core/ApiAdapter.js', 'docs/app/js/core/ApiAdapter.js'],
  ['renderer/js/features/explorer/ExplorerModule.js', 'docs/app/js/features/explorer/ExplorerModule.js'],
  ['renderer/css/main.css', 'docs/app/css/main.css'],
  ['renderer/css/utilities/responsive.css', 'docs/app/css/utilities/responsive.css']
];

function normalize(content) {
  return content.replace(/\r\n/g, '\n');
}

function readRelativeFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function main() {
  const mismatches = [];

  for (const [sourcePath, outputPath] of FILES_TO_COMPARE) {
    if (!fs.existsSync(path.join(ROOT, sourcePath))) {
      mismatches.push(`${sourcePath} is missing`);
      continue;
    }

    if (!fs.existsSync(path.join(ROOT, outputPath))) {
      mismatches.push(`${outputPath} is missing`);
      continue;
    }

    const sourceContent = normalize(readRelativeFile(sourcePath));
    const outputContent = normalize(readRelativeFile(outputPath));

    if (sourceContent !== outputContent) {
      mismatches.push(`${sourcePath} != ${outputPath}`);
    }
  }

  if (mismatches.length > 0) {
    console.error('Web build output is out of sync with renderer sources.');
    console.error('Run `npm run build:web` to refresh docs/app, then rerun this check.');
    console.error('');
    mismatches.forEach((mismatch) => console.error(`- ${mismatch}`));
    process.exitCode = 1;
    return;
  }

  console.log('Web build output is in sync.');
}

main();
