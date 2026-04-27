# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows Semantic Versioning.

## [0.2.0] - 2026-04-27

### Added

- Added automatic Claude Code install and upgrade actions for npm-based local installations.
- Added Electron IPC and local-service HTTP endpoints for Claude Code install and upgrade flows.
- Added settings and setup wizard actions for install, upgrade, loading, and error feedback.
- Added a lightweight regression check script for Claude Code package layout compatibility.

### Changed

- Updated Claude Code detection to support both the legacy `cli.js` layout and the newer `bin/claude.exe` npm package layout.
- Improved version syncing so the app version display is updated in both `renderer/index.html` and `docs/app/index.html`.
- Bumped the project version from `0.1.35` to `0.2.0`.

### Fixed

- Fixed a false-negative detection issue after upgrading Claude Code from newer npm package versions.
- Fixed release version display drift between the Electron renderer app and the docs app shell.
