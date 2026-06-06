---
title: Getting Started with DeepSeek Cowork
date: 2026-01-21
---

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
  "model": "deepseek-v4-pro[1m]"
}
```

## Verify Local Service

DeepSeek Cowork relies on its local service for the desktop app, web UI, and CLI workflows.

1. Start the application with `npm start` or `deepseek-cowork start --daemon`
2. Open the desktop app or run `deepseek-cowork open`
3. Confirm the API connection and workspace settings in the application
4. Send a simple chat message to verify the assistant is ready

## Verify Installation

After installation, you can verify with the following:

### Check Service Status

```bash
# View running status
deepseek-cowork status
```

Expected output:

```text
DeepSeek Cowork v1.0.0
Status: Running
API: Connected
Explorer: Running
```

### Test Chat Function

In the chat interface, enter:

```text
Hello, please introduce yourself
```

If you receive an AI response, the configuration is successful!

## Troubleshooting

### Q: "API Key invalid" error on startup

**A**: Check if the API Key is correct and ensure there are no extra spaces.

### Q: Local service is not responding

**A**: Try the following steps:

1. Restart the application or daemon
2. Check the service logs with `deepseek-cowork status`
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

### Task Review

```text
Review the latest changes in this project and summarize the main risks
```

### File Organization

```text
Sort files in my downloads folder by type
```

### Session Follow-up

```text
Summarize what changed today and suggest the next three steps
```

---

Having issues? Feel free to ask on [GitHub Issues](https://github.com/imjszhang/Deepseek-Cowork/issues)!
