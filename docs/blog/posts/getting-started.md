---
title: Getting Started with DeepSeek Cowork
date: 2026-01-21
---

# Getting Started with DeepSeek Cowork

This guide will help you quickly install and configure DeepSeek Cowork to start using your AI assistant.

## System Requirements

Before you begin, make sure your system meets the following requirements:

- **Operating System**: Windows 10+, macOS 10.15+, Linux
- **Node.js**: v18.0.0 or higher
- **Memory**: 4GB or more recommended
- **Network**: Access to DeepSeek API required

## Installation Methods

### Method 1: Desktop Mode (Recommended)

Suitable for most users, provides a complete desktop application experience.

```bash
# 1. Clone the repository
git clone https://github.com/imjszhang/Deepseek-Cowork.git

# 2. Navigate to project directory
cd deepseek-cowork

# 3. Install dependencies
npm install

# 4. Start the application
npm start
```

After startup, the Electron desktop application will open automatically.

### Method 2: Hybrid Mode

CLI + Browser mode, no desktop app required. Suitable for server environments.

```bash
# 1. Global installation
npm install -g deepseek-cowork

# 2. Start background service
deepseek-cowork start --daemon

# 3. Open web interface
deepseek-cowork open
```

## Configure API Key

On first launch, you need to configure your DeepSeek API Key:

1. Visit [DeepSeek website](https://www.deepseek.com/) to register an account
2. Get your API Key from the console
3. Enter the API Key in the application settings

```json
{
  "apiKey": "your-api-key-here",
  "model": "deepseek-v4-pro"
}
```

## Install Browser Extension

To use browser automation features, install the JS Eyes extension:

1. Download the latest JS Eyes release, or clone the JS Eyes repository if you want the source extension
2. Install the extension in your browser (`extensions/chrome` for Chrome/Edge source installs, signed `.xpi` for Firefox releases)
3. Start DeepSeek Cowork and keep Browser Control running
4. Open the JS Eyes popup and connect to `http://localhost:3333`
5. If authentication is enabled, sync or paste the `server.token` value before checking the connection status

Once installed, the extension will automatically connect to the application.

## Verify Installation

After installation, you can verify with the following:

### Check Service Status

```bash
# View running status
deepseek-cowork status
```

Expected output:

```
DeepSeek Cowork v1.0.0
Status: Running
API: Connected
Extension: Connected
```

### Test Chat Function

In the chat interface, enter:

```
Hello, please introduce yourself
```

If you receive an AI response, the configuration is successful!

## Troubleshooting

### Q: "API Key invalid" error on startup

**A**: Check if the API Key is correct and ensure there are no extra spaces.

### Q: Browser extension cannot connect

**A**: Try the following steps:
1. Refresh the extension
2. Restart the application
3. Check if the port is occupied

### Q: Application starts slowly

**A**: First startup requires downloading dependencies, please be patient. Subsequent startups will be much faster.

## Next Steps

After installation, you can:

- Read the [full documentation](https://github.com/imjszhang/Deepseek-Cowork)
- Join [community discussions](https://github.com/imjszhang/Deepseek-Cowork/discussions)
- Try [example tasks](#example-tasks)

## Example Tasks

Here are some tasks you can try:

### Data Collection

```
Extract product prices from these 5 links and organize them into a table
```

### File Organization

```
Sort files in my downloads folder by type
```

### Form Filling

```
Use this contact list to batch fill registration forms
```

---

Having issues? Feel free to ask on [GitHub Issues](https://github.com/imjszhang/Deepseek-Cowork/issues)!
