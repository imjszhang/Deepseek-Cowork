# Release Notes

## v0.3.0

This release simplifies the local backend surface, hardens long-running session reliability, and aligns the entire app on the new DeepSeek model identifier and the renamed `happy` CLI runtime.

### Highlights

- Added a processing watchdog so long-running Happy sessions cannot silently hang. Stale "processing" state is detected, surfaced as an error, and recovered automatically.
- Added a service discovery and conflict resolution module: the Electron app and CLI can now probe ports, attach to a compatible existing local service, and report richer service status.
- Added improved JS Eyes extension installation and connection guidance, including token-based pairing and compatibility notes, in both the renderer and the docs app.
- Updated the default DeepSeek model identifier to `deepseek-v4-pro[1m]` everywhere (renderer, docs app, blog post, user settings, model config, settings UI, setup wizard).
- Updated CLI commands (`start`, `stop`, `status`, `open`) to consume the new discovery module and produce clearer status output.

### Removed

- Removed the entire legacy browser-control server module, including its Express routes, WebSocket server, auth/audit/rate-limit/database layers, browser panel, scenarios, and supporting docs and skills. The integration is now done through the JS Eyes extension.
- Removed deprecated configuration and skill files (`config/config.json`, `config/default.js`, browser-control skills under `deploy/skills/...`, obsolete `CLAUDE.md` skill guides) left over from earlier server modes.

### Internal updates

- Refactored the CLI build to track the renamed `happy` runtime instead of `happy-coder`, including new ACP/persistence bundles and updated message normalizer modules in both the renderer and docs app.
- Refactored installation and dependency-checker logic so the setup wizard and settings produce consistent install/upgrade feedback against the renamed happy runtime.
- Bumped versions in `package.json`, `packages/cli/package.json`, README files, renderer, and docs app to `0.3.0`.

### Notes

- Existing local checkouts should run `npm install` (and `cd packages/cli && npm install`) so the renamed happy runtime, new bundled tools (ripgrep, difftastic), and updated lockfiles are picked up cleanly.
- The legacy browser-control routes and panel are gone. If you depended on them, switch to the JS Eyes extension based flow as documented in the setup wizard and READMEs.
- Run `npm run check:web-sync` after pulling to confirm `docs/app` is still in sync with the renderer sources, and `npm run check:claude-detector` to validate Claude Code detection on your machine.
