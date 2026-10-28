# Changelog

## [0.0.2] — unreleased

### Fixed

- Scope ZTEST source discovery under `ztest.testPath` (same root as twister `-T`), so trees like `src/zephyr` are not scanned when `testPath` is `tests/`
- Default `scanExclude` now includes `**/zephyr/**`, `**/bootloader/**`

### Docs

- Document Docker / uv-style `commandPrefix` wrappers

## [0.1.0] — 2026-10-26

First release: VS Code / Cursor extension + MCP server for Zephyr ZTEST discovery, navigation, Twister runs, and auto-poilot-fix.
