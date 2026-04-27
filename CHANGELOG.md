# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

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
