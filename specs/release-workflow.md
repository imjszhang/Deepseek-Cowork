# DeepSeek Cowork 完整 Release 工作流

本文档用于沉淀本项目的完整正式发布流程，目标是让后续版本可以按固定步骤快速完成：

1. 在 `develop` 完成功能、依赖、文档与验证
2. 合并到 `main`
3. 创建 GitHub Release
4. 发布 npm CLI 包
5. 做发布后校验

> 约定：`develop` 是日常开发分支，`main` 只用于正式 release。  
> 约定：下文用 `{VERSION}` 表示目标版本，例如 `0.3.0`。

## 1. 发布范围

一次完整 release 默认包含以下交付物：

- Electron 桌面应用源码与 GitHub Release
- `deepseek-cowork` npm CLI 包
- 发布说明与变更记录
- 版本号与 README 中的公开版本信息

## 2. 发布前原则

正式发布前，先确认以下规则：

- 不要直接在 `main` 上做开发修改
- 所有功能和修复先在 `develop` 完成并验证
- 发布前先保证本地工作区可控，避免把无关改动混入 release
- `CHANGELOG.md` 和 `RELEASE_NOTES.md` 必须与本次发布内容一致
- npm 发布只在 `main` 确认完成后进行

## 3. 发布前检查清单

在 `develop` 上准备 release 时，先完成以下检查：

### 3.1 代码与依赖

```powershell
git checkout develop
git pull origin develop
npm install
```

如本次有 CLI 相关调整，再执行：

```powershell
cd packages/cli
npm install
cd ../..
```

### 3.2 基础验证

至少覆盖以下检查：

```powershell
# Claude Code 检测兼容性
npm run check:claude-detector

# Electron 应用本地启动
npm start

# Windows 打包冒烟（必要时显式指定 Electron 版本）
npm run build:win -- --dir --config.electronVersion=40.9.2
```

如果本次改动影响 CLI，再执行：

```powershell
cd packages/cli
npm run build
cd dist
npm publish --dry-run
cd ../../..
```

## 4. 版本号与文档更新

正式 release 前，统一更新版本号与发布文档。

### 4.1 必改文件

至少检查以下文件：

- `package.json`
- `package-lock.json`
- `packages/cli/package.json`
- `packages/cli/package-lock.json`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`
- `README.md`
- `docs/README_CN.md`

### 4.2 当前项目特别注意

本项目除了包版本外，还要注意以下内容：

- `README.md` 中公开展示的 CLI 版本号
- `docs/README_CN.md` 中公开展示的 CLI 版本号、页面底部版本号与日期
- GitHub Release 标题与 `RELEASE_NOTES.md` 内容保持一致
- CLI npm 包版本必须和本次计划发布的版本一致

### 4.3 建议验证命令

```powershell
git diff -- package.json package-lock.json packages/cli/package.json packages/cli/package-lock.json CHANGELOG.md RELEASE_NOTES.md README.md docs/README_CN.md
```

## 5. 在 develop 完成发布准备

确认版本、文档、验证都完成后，在 `develop` 提交：

```powershell
git checkout develop
git status
git add .
git commit -m "release: prepare v{VERSION}"
git push origin develop
```

如果 release 准备不是单独提交，也要保证将用于发布的提交已经全部推到 `origin/develop`。

## 6. 合并到 main

正式 release 必须从 `main` 发出。

```powershell
git checkout main
git pull origin main
git merge --no-ff develop
git push origin main
```

如有冲突，先在本地解决冲突、重新验证关键流程，再推送 `main`。

## 7. 创建 GitHub Release

### 7.1 创建 tag

```powershell
git checkout main
git tag v{VERSION}
git push origin v{VERSION}
```

如果 tag 已存在，先确认它是否指向正确的 `main` 提交，不要盲目重打。

### 7.2 使用 `gh` 创建 release

```powershell
gh release create v{VERSION} --title "v{VERSION}" --notes-file RELEASE_NOTES.md
```

如果需要附加构建产物，可在命令后继续添加文件路径。

### 7.3 GitHub Release 校验

发布后检查：

- Release 是否挂在 `main` 的正确提交上
- 标题是否正确，例如 `v0.3.0`
- `RELEASE_NOTES.md` 内容是否完整
- 桌面端产物（如果上传）是否齐全

## 8. 发布 npm CLI

CLI 包名是 `deepseek-cowork`，发布目录是 `packages/cli/dist`。

### 8.1 构建发布包

```powershell
cd packages/cli
npm run build
cd dist
```

### 8.2 发布前身份确认

```powershell
npm whoami
```

输出应为有发布权限的账号。

### 8.3 正式发布

```powershell
npm publish
```

### 8.4 使用 `.env` 中的 `npm_token` 临时发布

如果本机未登录 npm，但仓库根目录 `.env` 中有 `npm_token`，建议只使用临时用户配置，不把 token 写入仓库：

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^npm_token=' } | Select-Object -First 1
$token = $line.Substring('npm_token='.Length).Trim()
$cfg = Join-Path $env:TEMP ('npmrc-publish-' + [guid]::NewGuid().ToString() + '.npmrc')
Set-Content -Path $cfg -Value @(
  "//registry.npmjs.org/:_authToken=$token"
  "registry=https://registry.npmjs.org/"
) -Encoding ascii

$env:NPM_CONFIG_USERCONFIG = $cfg
cd packages/cli/dist
npm whoami
npm publish

Remove-Item $cfg -Force
Remove-Item Env:NPM_CONFIG_USERCONFIG -ErrorAction SilentlyContinue
```

注意事项：

- 不要把 token 写入项目内 `.npmrc`
- 不要把 token 提交到 git
- 发布完成后删除临时配置文件

## 9. 发布后校验

### 9.1 npm 校验

```powershell
npm view deepseek-cowork version
npm view deepseek-cowork versions --json
```

确认最新版本已包含 `{VERSION}`。

### 9.2 GitHub Release 校验

```powershell
gh release view v{VERSION}
```

### 9.3 CLI 安装冒烟

建议至少做一次全局安装验证：

```powershell
npm install -g deepseek-cowork@{VERSION}
deepseek-cowork --version
```

如本机已有旧版本，可先卸载或覆盖安装。

## 10. 推荐的完整顺序

下面是一套以后可直接复用的简版顺序：

1. 在 `develop` 完成功能、依赖、文档、版本号更新
2. 在 `develop` 执行 `npm install`、`npm run check:claude-detector`、`npm start`、`npm run build:win -- --dir --config.electronVersion=40.9.2`
3. 在 `packages/cli` 执行 `npm run build` 和 `npm publish --dry-run`
4. 更新 `CHANGELOG.md` 与 `RELEASE_NOTES.md`
5. 提交并推送 `develop`
6. 合并 `develop` 到 `main`
7. 打 `v{VERSION}` tag 并创建 GitHub Release
8. 在 `packages/cli/dist` 发布 npm 包
9. 用 `npm view` 和 `gh release view` 做发布后校验

## 11. 常见问题

### 11.1 `npm publish` 返回 401 / 404

优先排查：

- 当前账号是否有 `deepseek-cowork` 发布权限
- `npm whoami` 是否是正确账号
- 是否在 `packages/cli/dist` 目录下执行了 `npm publish`
- `dist/package.json` 中的包名和版本是否正确

### 11.2 Electron 打包失败，无法识别版本

如果 `electron-builder` 无法从范围版本推断 Electron 精确版本，使用：

```powershell
npm run build:win -- --dir --config.electronVersion=40.9.2
```

后续如果 Electron 升级，记得同步替换这个显式版本。

### 11.3 文档版本展示不一致

本项目历史上出现过 README / 文档页 / 实际包版本不一致的问题。每次 release 前后都要额外检查：

- `README.md`
- `docs/README_CN.md`
- `package.json`
- `packages/cli/package.json`
- `CHANGELOG.md`
- `RELEASE_NOTES.md`

## 12. 建议

如果后续希望进一步提速，可以在这个流程基础上继续补两类自动化：

- 自动生成 release checklist / release notes 草稿
- 自动执行 `develop -> main -> tag -> gh release -> npm publish` 的半自动发布脚本
