# Changelog

## [0.2.0] — unreleased

Release line prepared on `main` after v0.1.0.

### Fixed

- Scope ZTEST source discovery under `ztest.testPath` (same root as twister `-T`), so trees like `src/zephyr` are not scanned when `testPath` is `tests/`
- Default `scanExclude` now includes `**/zephyr/**`, `**/bootloader/**`

### Planned / in progress

- Marketplace / Open VSX publish once `VSCE_PAT` / `OVSX_PAT` are configured
- Docs for virtualized toolchains (Docker, uv, and similar wrappers via `commandPrefix`)

### Notes

Bump package / MCP / README version markers to `0.2.0`. Tag `v0.2.0` when the release content is ready.

## [0.1.0] — 2026-10-26

First release: VS Code / Cursor extension + MCP server for Zephyr ZTEST discovery, navigation, Twister runs, and auto-poilot-fix.
