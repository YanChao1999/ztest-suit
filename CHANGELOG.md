# Changelog

## [Unreleased]

### Fixed

- Root-anchored `zephyr/**` exclude (not `**/zephyr/**`) and stop skipping nested dirs named `zephyr`, so trees like Memfault `tests/ports/zephyr` still discover

### Added

- Real-tree discovery harness: `npm run test:real-trees` + `docs/real-tree-validation.md` (5 upstream clones)

## [0.3.0] — 2026-10-29

### Fixed

- Ensure `ztest.platform` takes effect: default run template includes `--platform {platform}`, and the flag is auto-appended if a custom template omitted it
- Recover from stuck "in progress" when the child dies or `out/` is deleted mid-run — Refresh / Cancel clears busy state and running icons

## [0.2.0] — 2026-10-28

### Fixed

- Scope ZTEST source discovery under `ztest.testPath` (same root as twister `-T`), so trees like `src/zephyr` are not scanned when `testPath` is `tests/`
- Default `scanExclude` now includes `**/zephyr/**`, `**/bootloader/**`

### Added

- Brand SVG/PNG icons (`resources/ztest-icon.*`) and refreshed activity-bar glyph
- Docs for Docker / uv-style `commandPrefix` wrappers

## [0.1.0] — 2026-10-26

First release: VS Code / Cursor extension + MCP server for Zephyr ZTEST discovery, navigation, Twister runs, and auto-poilot-fix.
