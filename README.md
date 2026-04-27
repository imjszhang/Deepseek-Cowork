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
  <a href="https://github.com/imjszhang/Deepseek-Cowork">
    <img src="https://img.shields.io/badge/Version-0.2.0-blue.svg?style=flat-square" alt="Version" />
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
## DEMO

https://github.com/user-attachments/assets/a744dd83-0689-4fbe-8638-be0fe5e32935

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

## Architecture Highlights

DeepSeek Cowork adopts a unique **Hybrid SaaS** architecture, combining the best of cloud-based SaaS and local desktop applications:

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's Computer                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Electron   │    │  Web Browser │    │   CLI Tool       │  │
│  │   Desktop    │    │  (Chrome,    │    │ deepseek-cowork  │  │
│  │     App      │    │   Edge...)   │    │                  │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘  │
│         │ IPC               │ HTTP/WS             │ manage     │
│         └───────────────────┼─────────────────────┘            │
│                             ▼                                   │
│                    ┌────────────────┐                          │
│                    │  LocalService  │◄── All data stays local  │
│                    │  (Node.js)     │                          │
│                    └────────┬───────┘                          │
└─────────────────────────────┼───────────────────────────────────┘
                              │ Encrypted
                              ▼
                    ┌────────────────┐
                    │   Happy AI     │
                    │   (Cloud)      │
                    └────────────────┘
```

| Feature | Benefit |
|---------|---------|
| **Zero Server Cost** | Static frontend hosted on GitHub Pages, no backend infrastructure needed |
| **Data Privacy** | All user data, settings, and files remain on your local machine |
| **Unified Experience** | Same UI/UX whether using Desktop app or Web browser |

### How It Works

1. **Desktop Mode**: Electron app communicates with LocalService via IPC
2. **Web Mode**: Browser connects to LocalService via HTTP/WebSocket on `localhost:3333`
3. **CLI Mode**: Manage LocalService directly from terminal

The `ApiAdapter` layer automatically detects the environment and routes API calls appropriately.

## Happy Integration

DeepSeek Cowork integrates with [Happy](https://github.com/slopus/happy), an open-source mobile and web client for AI coding agents.

| Feature | Description |
|---------|-------------|
| **End-to-End Encryption** | All messages are encrypted locally before transmission - your data never leaves your device unencrypted |
| **Mobile Access** | Use the Happy App ([iOS](https://apps.apple.com/us/app/happy-claude-code-client/id6748571505) / [Android](https://play.google.com/store/apps/details?id=com.ex3ndr.happy)) to monitor and control AI tasks on the go |
| **Push Notifications** | Get alerted when AI needs permission or encounters errors |
| **Open Source** | Fully auditable code with no telemetry or tracking |

> DeepSeek Cowork uses Happy's account server for session management and encrypted sync across devices.

## Core Components

| Component | Description |
|-----------|-------------|
| **Claude Code** | Original Claude Code integrated as Agent kernel with all features and capabilities |
| **[Happy](https://github.com/slopus/happy)** | Open-source AI session management with E2E encryption and mobile app support |
| **[JS Eyes](https://github.com/imjszhang/js-eyes)** | Browser extension for tab control, script execution, data extraction |
| **Electron App** | Cross-platform desktop interface integrating all components |

## Quick Start

```bash
git clone https://github.com/imjszhang/Deepseek-Cowork.git
cd deepseek-cowork
npm install
npm start
```

Development mode: `npm run dev`

## Web Version (Hybrid SaaS)

Use DeepSeek Cowork directly in your browser without installing the desktop app.

### Online Demo

Visit [deepseek-cowork.com](https://deepseek-cowork.com) to try the web interface.

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup Local Service

```bash
# Install CLI tool globally (latest version: 0.2.0)
npm install -g deepseek-cowork@0.2.0

# Start local service (background mode)
deepseek-cowork start --daemon

# Open web interface in browser
deepseek-cowork open
```

### CLI Commands Reference

> **CLI Version**: `deepseek-cowork@0.2.0`

| Command | Description |
|---------|-------------|
| `deepseek-cowork start` | Start local service (foreground) |
| `deepseek-cowork start --daemon` | Start local service (background) |
| `deepseek-cowork stop` | Stop local service |
| `deepseek-cowork status` | Check service status |
| `deepseek-cowork open` | Open web interface in browser |
| `deepseek-cowork config` | View/edit configuration |
| `deepseek-cowork deploy` | Deploy skills to work directories |
| `deepseek-cowork module` | Manage server modules |

#### Deploy Skills

```bash
# Deploy built-in skills to work directories
deepseek-cowork deploy

# Deploy with Chinese templates
deepseek-cowork deploy --lang zh

# Deploy custom skill from any path
deepseek-cowork deploy --from ./my-skill --target my-project

# Check deployment status
deepseek-cowork deploy status
```

#### Manage Server Modules

```bash
# List available modules
deepseek-cowork module list

# Deploy a module
deepseek-cowork module deploy demo-module

# Deploy custom module from any path
deepseek-cowork module deploy my-module --from ./my-module-source

# Check deployed modules status
deepseek-cowork module status
```

### Build Web Version

```bash
# Build static files for web deployment
npm run build:web

# Output: docs/app/
```

The web frontend is deployed to GitHub Pages automatically.

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

The project uses semantic versioning (SemVer). Current version: **V0.2.0**

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

1. Download the latest extension assets from [JS Eyes Releases](https://github.com/imjszhang/js-eyes/releases/latest), or clone the repository if you want to load the source extension manually.
2. Install the extension in your browser
   - Chrome / Edge: open `chrome://extensions/` or `edge://extensions/`, enable Developer mode, then load the `extensions/chrome` folder if using the source tree
   - Firefox: install the signed `.xpi` from the release, or load `extensions/firefox/manifest.json` temporarily from `about:debugging`
3. Start DeepSeek Cowork so the Browser Control service is available
4. Open the JS Eyes popup and connect it to DeepSeek Cowork's HTTP address (default: `http://localhost:3333`)
5. If authentication is enabled, sync or paste the `server.token` value before waiting for the extension to show `Connected`

### Connection Notes

- DeepSeek Cowork exposes Browser Control over HTTP on `http://localhost:3333` and the extension WebSocket on `ws://localhost:8080` by default.
- Current JS Eyes releases support token-based authentication. This project now exposes a compatible `server.token` file for manual token copy/paste.
- Native-host based token sync belongs to the upstream JS Eyes ecosystem and is not yet a one-click flow inside DeepSeek Cowork.

### Compatibility Boundary

- DeepSeek Cowork is compatible with the current JS Eyes browser extension handshake and connection flow.
- DeepSeek Cowork is **not** a drop-in replacement for the full `js-eyes` CLI runtime. Native-host installation, `js-eyes doctor`, and `js-eyes skills` remain upstream-managed workflows for now.
- The built-in Browser Control skill and deployment assets in this repository are still the primary workflow inside DeepSeek Cowork.

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
