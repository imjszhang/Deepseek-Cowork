<h1 align="center">DeepSeek Cowork</h1>

<p align="center">
<a href="https://deepseek-cowork.com">
  <img width="1280" height="640" alt="DeepSeek Cowork banner" src="./docs/images/preview.png">
</a>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
  </a>
  <a href="https://github.com/imjszhang/deepseek-cowork">
    <img src="https://img.shields.io/badge/Version-0.1.0-blue.svg?style=flat-square" alt="Version" />
  </a>
  <a href="https://www.electronjs.org/">
    <img src="https://img.shields.io/badge/Electron-28.x-47848F?style=flat-square&logo=electron" alt="Electron" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node.js" />
  </a>
</p>

<p align="center">
  <a href="#why-this-project">English</a> | <a href="./docs/README_CN.md">中文文档</a>
</p>

---

## Why This Project?

On January 13, 2026, Anthropic released [Claude Cowork](https://claude.ai/cowork):

> *"Introducing Cowork: Claude Code for the rest of your work."*

Great product, but:

| | Claude Cowork | DeepSeek Cowork |
|--|---------------|-----------------|
| **Price** | 💰 Expensive | ✅ Ultra-low cost |
| **Accessibility** | 🔒 Complex setup, regional restrictions | ✅ Ready to use |
| **Open Source** | ❌ Proprietary | ✅ Fully open source |
| **Self-hosting** | ❌ Not supported | ✅ Supports private deployment |

We want everyone to have access to a great AI assistant — so we built this.

## Why DeepSeek?

| Solid Baseline | Ultra Affordable | Fully Open |
|----------------|------------------|------------|
| Reliable performance among open-source LLMs | Most competitive API pricing | Supports local deployment & customization |

## Core Philosophy

> **Open-source models will eventually catch up with closed-source.**

We believe it's only a matter of time. Rather than wait, we're building the infrastructure now.

When open-source models reach parity, DeepSeek Cowork will be ready.

## Why Now?

This would have been impossible before. But two things changed:

1. **AI Coding explosion** - Dramatically reduced development costs, enabling individuals to build complex applications
2. **Engineering bridges the gap** - Prompt engineering, skill systems, and context management can enhance the experience on existing models

## What Can It Do?

Use natural language to have AI help you with:

- 🌐 **Browser Automation** - Open pages, batch fill forms, extract data, cross-site operations
- 📁 **File Management** - Browse, organize, and preview your workspace files
- 🧠 **Persistent Memory** - AI remembers conversation context, understands your habits

**Typical Scenarios**

| Scenario | Example |
|----------|---------|
| Data Collection | "Extract prices from these 10 pages and make a spreadsheet" |
| Form Filling | "Batch fill registration forms using this contact list" |
| Content Organization | "Sort files in my downloads folder by type" |
| Monitoring | "Check this page daily and notify me of updates" |

> 💡 Like having a 24/7 digital assistant at your command

---

# Technical Documentation

## Core Components

| Component | Description |
|-----------|-------------|
| **Claude Code** | AI kernel for code understanding and generation |
| **[Happy](https://github.com/slopus/happy)** | Based on open-source project, provides AI session management, E2E encryption, multi-device sync |
| **[JS Eyes](https://github.com/imjszhang/js-eyes)** | Browser extension for tab control, script execution, data extraction |
| **Electron App** | Cross-platform desktop interface integrating all components |

## Quick Start

```bash
git clone https://github.com/imjszhang/deepseek-cowork.git
cd deepseek-cowork
npm install
npm start
```

Development mode: `npm run dev`

## Building Desktop Clients

Build standalone installers for Windows, macOS, and Linux:

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:win    # Windows (NSIS installer + portable)
npm run build:mac    # macOS (DMG, Intel + Apple Silicon)
npm run build:linux  # Linux (AppImage, deb, rpm)

# Build for all platforms
npm run build:all
```

Built packages will be output to the `dist/` directory.

### Version Management

The project uses semantic versioning (SemVer). Current version: **V0.1.0**

Update version numbers:

```bash
npm run version:patch   # 0.1.0 → 0.1.1 (bug fixes)
npm run version:minor   # 0.1.0 → 0.2.0 (new features)
npm run version:major   # 0.1.0 → 1.0.0 (breaking changes)
```

The version number is automatically synchronized to:
- `package.json` - Source of truth
- `renderer/index.html` - UI display (auto-updated during build)
- Application runtime - Dynamically loaded from package.json

## Browser Extension

Browser automation requires the **[JS Eyes](https://github.com/imjszhang/js-eyes)** extension.

### Installation

1. Download [JS Eyes](https://github.com/imjszhang/js-eyes)
2. Open browser extension page
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Firefox: `about:debugging`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder for your browser
5. Make sure DeepSeek Cowork is running, extension will auto-connect

See [JS Eyes documentation](https://github.com/imjszhang/js-eyes) for details

## Contributing

PRs welcome! Fork → Change → Submit.

## License

MIT

## Acknowledgments

This project is built upon:

- [Happy](https://github.com/slopus/happy) - AI session management client
- [JS Eyes](https://github.com/imjszhang/js-eyes) - Browser automation extension
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [DeepSeek](https://www.deepseek.com/) - Open-source LLM

---

<div align="center">

**Making great AI assistants accessible to everyone**

[![X](https://img.shields.io/badge/X-@imjszhang-000000?logo=x)](https://x.com/imjszhang)

</div>
