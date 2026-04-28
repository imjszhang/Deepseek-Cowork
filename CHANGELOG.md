# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.3.0] - 2026-04-29

### Added

- Added a processing watchdog that monitors long-running Happy sessions, surfaces timeout errors, and reclaims stale processing state automatically.
- Added a service discovery and conflict resolution module for the local backend, including port availability probing, "attach to existing service" behavior, and richer status output for CLI commands.
- Added a service instance information layer in the local-service config so multiple front-ends can diagnose which process owns the running service.
- Added compatibility for the renamed `happy` CLI runtime (previously `happy-coder`), including the bundled `lib/happy-cli` binary and download/unpack scripts for ripgrep and difftastic tooling.
- Added enhanced JS Eyes extension installation and connection guidance in both the renderer and the docs app, covering token-based pairing and compatibility boundaries.

### Changed

- Bumped the project version from `0.2.0` to `0.3.0` and refreshed all version displays in `package.json`, `packages/cli/package.json`, README files, renderer, and docs app.
- Streamlined the CLI service surface: replaced legacy server entry points with the local-service runtime, updated `npm test` to chain web-sync and Claude detector regression checks, and added a `check:web-sync` validation script.
- Refactored the CLI commands (`start`, `stop`, `status`, `open`, top-level entry) to use the new discovery module, producing clearer messages when an existing local service is reused or conflicts.
- Refactored happy CLI integration to track the upstream `happy` package layout, including new ACP/persistence bundles and updated message normalizer modules in both the renderer and docs app.
- Updated the default model identifier from `deepseek-v4-pro` to `deepseek-v4-pro[1m]` across renderer, docs app, blog post, user settings, model config, settings UI, and setup wizard so all surfaces resolve the same model variant.
- Updated installation and dependency-checker logic to align with the renamed happy runtime and to provide consistent install/upgrade feedback in setup wizard and settings.

### Removed

- Removed the entire legacy browser-control server module, including its Express routes, WebSocket server, auth/audit/rate-limit/database layers, scenarios, and supporting docs and skills, in favor of the JS Eyes extension based integration.
- Removed the deprecated browser panel, browser-control feature module, and the standalone `server/` browser routes from both renderer and docs app, simplifying the front-end and packaged surface area.
- Removed unused configuration and skill files (`config/config.json`, `config/default.js`, browser-control skills under `deploy/skills/...`, and obsolete `CLAUDE.md` skill guides) that were left over from earlier server modes.

### Fixed

- Fixed model name drift across the application by aligning every `deepseek-v4-pro` reference with the new `deepseek-v4-pro[1m]` identifier.
- Fixed stale "processing" sessions getting stuck without feedback by detecting timeouts and recovering session state in the Happy session manager.
- Fixed inconsistent service status reporting when an external local service was already running by sharing instance metadata between the Electron app and the CLI.

## [0.2.0] - 2026-04-27

### Added

- Added automatic Claude Code install and upgrade actions for npm-based local installations.
- Added Electron IPC and local-service HTTP endpoints for Claude Code install and upgrade flows.
- Added settings and setup wizard actions for install, upgrade, loading, and error feedback.
- Added a lightweight regression check script for Claude Code package layout compatibility.
- Added a hardened dependency override set to pin vulnerable transitive packages to patched versions.

### Changed

- Updated Claude Code detection to support both the legacy `cli.js` layout and the newer `bin/claude.exe` npm package layout.
- Improved version syncing so the app version display is updated in both `renderer/index.html` and `docs/app/index.html`.
- Bumped the project version from `0.1.35` to `0.2.0`.
- Upgraded core runtime and packaging dependencies including Electron, Electron Builder, Electron Updater, Axios, Express, Socket.IO, SQL.js, and ws.
- Migrated server-side UUID generation from the external `uuid` package to Node.js `crypto.randomUUID()`.
- Updated scheduler task creation to support the `node-cron` v4 API while keeping compatibility with the previous local install state.
- Changed `happy-coder` resolution to prefer the repository's bundled `lib/happy-cli` runtime path instead of relying on a root-level `file:` install.
- Expanded packaged app unpack rules so `lib/happy-cli` runtime entrypoints remain executable after packaging.

### Fixed

- Fixed a false-negative detection issue after upgrading Claude Code from newer npm package versions.
- Fixed release version display drift between the Electron renderer app and the docs app shell.
- Fixed the local dependency tree so `npm install` completes cleanly and `npm audit` reports zero vulnerabilities after reinstall.
- Fixed Windows smoke-build validation by aligning the packaged runtime layout with the new `happy-coder` lookup strategy.
