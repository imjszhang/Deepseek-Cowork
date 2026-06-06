# 版本更新工作流

本文档描述了 DeepSeek Cowork 项目的完整版本更新流程，包括版本号更新、构建和链接 CLI 工具等步骤。

> 约定：下文用 `{OLD}` 表示当前版本号，`{NEW}` 表示目标版本号。  
> 例如 `{OLD}` = `0.1.33`，`{NEW}` = `0.1.34`。  
> 当前版本号可在 `package.json` 的 `version` 字段中获取。

## 概述

版本更新工作流包括以下主要步骤：
1. 确定当前版本号 `{OLD}` 和目标版本号 `{NEW}`
2. 全局替换所有相关文件中的版本号
3. 清理并重新构建 CLI 工具
4. 链接 CLI 工具到全局环境
5. 验证更新结果

## 版本号规范

项目采用语义化版本规范 (SemVer)，格式为 `MAJOR.MINOR.PATCH`：
- **Patch** (x.y.z → x.y.z+1): Bug 修复和小幅改进
- **Minor** (x.y.z → x.y+1.0): 新功能添加，向后兼容
- **Major** (x.y.z → x+1.0.0): 重大变更，可能不向后兼容

## 完整工作流

### 步骤 1: 确定版本号

```bash
# 查看当前版本号
grep '"version"' package.json
```

根据本次更新的内容，确定更新类型（Patch / Minor / Major），算出目标版本号 `{NEW}`。

### 步骤 2: 更新版本号

需要更新以下 **6 个文件**，将其中所有 `{OLD}` 替换为 `{NEW}`：

#### 2.1 主项目文件
| 文件 | 更新位置数 | 说明 |
|------|-----------|------|
| `package.json` | 1 | `"version": "{NEW}"` |
| `package-lock.json` | 2 | 顶层 `version` 和 `packages[""].version` |

#### 2.2 CLI 工具文件
| 文件 | 更新位置数 | 说明 |
|------|-----------|------|
| `packages/cli/package.json` | 1 | `"version": "{NEW}"` |
| `packages/cli/package-lock.json` | 2 | 顶层 `version` 和 `packages[""].version` |

#### 2.3 文档文件
| 文件 | 更新位置数 | 说明 |
|------|-----------|------|
| `README.md` | 5 | 见下方详细列表 |
| `site/README_CN.md` | 6 | 见下方详细列表 |

**README.md** 中需要更新的 5 处：
1. 版本徽章 `Version-{NEW}-blue`
2. CLI 安装命令 `npm install -g deepseek-cowork@{NEW}`
3. CLI 版本说明 `` deepseek-cowork@{NEW} ``
4. 当前版本说明 `Current version: **V{NEW}**`

**site/README_CN.md** 中需要更新的 6 处：
1. 版本徽章 `Version-{NEW}-blue`
2. CLI 安装命令 `npm install -g deepseek-cowork@{NEW}`
3. CLI 版本说明 `` deepseek-cowork@{NEW} ``
4. 当前版本说明 `当前版本：**V{NEW}**`
5. 页面底部版本号 `当前版本: V{NEW}`
6. 页面底部日期更新为当天日期

**总计**: 约 17 处需要更新。

#### 2.4 查找和验证

```bash
# 查找旧版本号的所有出现位置（更新前执行，确认范围）
grep -r "{OLD}" . --include="*.json" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist

# 确认旧版本号已全部替换（更新后执行，期望无结果）
grep -r "{OLD}" . --include="*.json" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist
```

### 步骤 3: 清理和构建 CLI 工具

```bash
cd packages/cli

# 删除旧的构建产物
rm -rf dist

# 构建 CLI 工具
npm run build
```

构建过程会：
- 创建 CLI bundle (`dist/cli.mjs`)
- 复制必要的目录（lib/, server/, config/, deploy/）
- 创建 `dist/package.json`
- 复制 `README.md`

构建成功后，会显示：
```
✅ Build completed successfully!
```

### 步骤 4: 链接 CLI 工具

```bash
# 在 packages/cli 目录下执行
npm link
```

这将把 CLI 工具链接到全局环境，可以使用 `deepseek-cowork` 或 `dsc` 命令。

### 步骤 5: 验证更新

```bash
# 检查主项目版本
grep '"version"' package.json

# 检查 CLI 版本
grep '"version"' packages/cli/package.json

# 验证 CLI 工具是否可用
deepseek-cowork --version
# 或
dsc --version
```

## 一键执行（步骤 3 + 4）

版本号更新完成后，可以用一条命令完成构建和链接：

```bash
cd packages/cli && rm -rf dist && npm run build && npm link
```

## npm 版本脚本（可选）

项目提供了 npm 脚本来更新 `package.json` 中的版本号：

```bash
npm run version:patch   # Patch 更新
npm run version:minor   # Minor 更新
npm run version:major   # Major 更新
```

> **注意**: 这些脚本 **只会** 更新根目录 `package.json` 的版本号，不会同步其他 5 个文件。仍需手动（或通过全局替换）完成剩余文件的更新。

## 注意事项

1. **版本号一致性** — 确保所有 6 个文件中的版本号完全一致
2. **日期更新** — 更新 `site/README_CN.md` 页面底部时，记得同时更新日期为当天
3. **构建前清理** — 每次构建前务必删除旧的 `dist` 目录，避免残留文件干扰
4. **测试验证** — 更新后务必运行 CLI 命令验证是否正常
5. **Git 提交** — 版本更新建议单独提交，便于版本追踪和回溯

## 常见问题

### Q: 如果忘记更新某个文件怎么办？

使用 `grep` 搜索旧版本号，找到遗漏的位置并补充更新：
```bash
grep -r "{OLD}" . --include="*.json" --include="*.md" --exclude-dir=node_modules --exclude-dir=dist
```

### Q: 构建失败怎么办？

1. 检查 `packages/cli/build.mjs` 是否有错误
2. 确保所有依赖都已安装 (`npm install`)
3. 检查 Node.js 版本是否符合要求 (>=18.0.0)

### Q: npm link 失败怎么办？

1. 检查是否有权限问题（Linux/macOS 可能需要 `sudo`）
2. 先卸载再重新链接：`npm unlink -g deepseek-cowork && npm link`
