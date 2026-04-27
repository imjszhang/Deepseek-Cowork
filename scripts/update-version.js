/**
 * 版本更新脚本
 * 在构建前自动从 package.json 读取版本号并更新到相关文件
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const htmlPaths = [
  path.join(__dirname, '../renderer/index.html'),
  path.join(__dirname, '../docs/app/index.html')
];

// 读取 package.json 获取版本号
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`📦 更新版本号到: ${version}`);

const versionRegex = /(<span\s+class="product-version"\s+id="product-version">)V?[\d.]+(<\/span>)/;

for (const htmlPath of htmlPaths) {
  if (fs.existsSync(htmlPath)) {
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    if (versionRegex.test(htmlContent)) {
      htmlContent = htmlContent.replace(versionRegex, `$1V${version}$2`);
      fs.writeFileSync(htmlPath, htmlContent, 'utf8');
      console.log(`✅ 已更新 ${path.relative(path.join(__dirname, '..'), htmlPath)} 版本号为 V${version}`);
    } else {
      console.warn(`⚠️  未在 ${path.relative(path.join(__dirname, '..'), htmlPath)} 中找到版本号占位符，跳过更新`);
    }
  } else {
    console.warn(`⚠️  文件不存在: ${htmlPath}`);
  }
}

console.log('✨ 版本更新完成');
