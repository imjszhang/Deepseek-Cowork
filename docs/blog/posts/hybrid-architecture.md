---
title: Abandoning the Backend: An Indie Dev’s Architecture Practice for Building an Open-Source Claude Cowork
date: 2026-01-22
---

# Abandoning the Backend: An Independent Developer's Architecture Practice for Building an Open-Source Claude Cowork

When developing AI products, we often face a dilemma: should we choose a traditional SaaS architecture, or go with a fully client-side approach?

As an independent developer working on DeepSeek Cowork—an open-source version of Claude Cowork—I pondered this question for a long time. Eventually, I chose a "radical" solution: **completely abandoning the traditional centralized backend and embracing a No-Backend Hybrid SaaS architecture**.

## Why Neither Pure SaaS nor Pure Client-Side Works?

### 1. Pure SaaS Architecture: The Developer's "Cost Burden"

For an independent developer, maintaining a centralized backend means:

- **High server costs**: As users grow, bandwidth, computing resources, and database expenses increase exponentially.
- **Operational pressure**: You must constantly monitor server uptime and handle performance bottlenecks under high concurrency.
- **Compliance and privacy risks**: Handling sensitive user data (especially in AI interactions) requires extremely high security standards.

### 2. Pure Client-Side Mode: The User's "Convenience Killer"

While traditional local software protects privacy, it also has obvious pain points:

- **Heavy installation packages**: Users need to download, install, and update, creating a lengthy process.
- **High cross-platform costs**: Adapting to Windows, macOS, Linux, and various browser environments requires massive development effort.
- **Slow updates**: Every bug fix requires a new release, with slow user-side awareness.

## My Answer: Hybrid SaaS Architecture

Since both approaches have drawbacks, let's think differently: **Remove the backend, deploy the frontend in the cloud, and keep execution logic and data local.**

This is the "reverse hybrid mode" adopted by DeepSeek Cowork.

### Core Design: Cloud Frontend + Local Runtime + Local Data

- **Cloud Frontend**: The UI is deployed via Vercel or CDN. Users access a lightweight web page without downloading massive installation packages.
- **Local Runtime**: Through a simple `npx deepseek-cowork` command, an extremely lightweight "Cowork Proxy" starts on the user's local machine.
- **Local Data**: All API Keys, database credentials, and sensitive AI conversation records are stored entirely on the user's local machine.

## The "Sweet Spot" of This Architecture

### For Users: Data Sovereignty and Zero Deployment

- **Privacy assured**: Data never leaves the local machine. Sensitive information (such as DeepSeek API Key) is never uploaded to third-party servers.
- **Plug and play**: No need to purchase servers or configure complex environments. One command, from installation to use in under 5 minutes.
- **Transparent costs**: Users directly pay AI providers' API fees on demand, with no middleman markup.

### For Developers: Single Codebase and Rapid Iteration

- **Simple maintenance**: I don't need to maintain expensive backend clusters, only one frontend codebase.
- **Real-time updates**: When I push frontend code, all users see the latest UI and features on their next page refresh.
- **Ecosystem integration**: Since core logic runs locally, it can easily call users' local files, IDE plugins, or Docker containers.

## Looking Ahead: The Future of AI Products is "Decentralized"

As high-performance models like DeepSeek become widespread, future AI applications will no longer be simple chat boxes. They need to deeply integrate into user workflows—reading files, executing code, operating browsers.

This **Hybrid architecture** precisely balances "cloud convenience" with "local control." It's not just a technical choice, but a "sovereignty declaration" for individual developers and users: **Your AI, Your Control.**

---

If you're also interested in this architecture, or want to try this open-source AI assistant, welcome to visit:

- **Project Website**: [https://deepseek-cowork.com](https://deepseek-cowork.com)
- **GitHub Repository**: [DeepSeek Cowork](https://github.com/imjszhang/Deepseek-Cowork)
- **Follow me on X**: [@imjszhang](https://x.com/imjszhang)
