# Release Notes

## v0.2.0

This release adds first-class Claude Code dependency management for the local machine and improves versioning consistency across the app.

### Highlights

- Added one-click Claude Code install support for npm-based environments.
- Added one-click Claude Code upgrade support when the current installation source is npm.
- Added clearer install and upgrade status feedback in both the settings page and setup wizard.
- Added compatibility for newer Claude Code npm package layouts that expose `bin/claude.exe` instead of the legacy `cli.js`.
- Added a regression check script: `npm run check:claude-detector`.

### Internal updates

- Added install and upgrade endpoints to Electron IPC and local service dependency routes.
- Updated version sync tooling so both the renderer app and docs app show the same product version.

### Notes

- Automatic upgrade currently targets npm-based Claude Code installations only.
- Native installer and Homebrew automation remain out of scope for this release.
