# ZTEST Suit

VS Code / Cursor extension for Zephyr **ZTEST**: discover suites and cases from source macros, show them in a sidebar, jump to definitions, and run tests through a configurable **west / twister** command wrapper (including Docker entry scripts).

## Features (MVP)

- **Sidebar tree**: suites → cases with pass / fail / not-run / running icons
- **Navigate**: click a case to open the defining source line
- **Manual run**: Run All / Run Suite / Run Case (toolbar + context menu)
- **Command wrapping**: prefix every west invocation (e.g. `./.start_docker.sh -b XXX`)
- **Results**: parse `twister.json` when present; fall back to log heuristics or process exit code

**Not in MVP (planned v2):** auto rebuild/run on save.

## Requirements

- A Zephyr west workspace (or Docker wrapper that can run `west twister`)
- VS Code / Cursor `^1.85.0`

## Quick start

1. Open this folder in VS Code / Cursor
2. `npm install` && `npm run compile`
3. Press **F5** (**Run Extension**) — opens the local fixture at [`fixtures/sample-west`](fixtures/sample-west) (mock west + sample ZTEST sources)
4. Open the **ZTEST** activity bar view → **Refresh**, then **Run All**
5. For a real Zephyr tree, open that folder instead (or use **Run Extension (empty window)**) and point settings at your `.start_docker.sh` / west wrapper

## Settings

Configure under **Settings → ZTEST Suit** or in `.vscode/settings.json`:

| Setting | Purpose | Example |
|---|---|---|
| `ztest.commandPrefix` | Prepended to west commands | `./.start_docker.sh -b native_sim` |
| `ztest.cwd` | Working directory | `${workspaceFolder}` |
| `ztest.runCommand` | Run template | `{prefix} west twister -T {testPath} --platform {platform} {extraArgs}` |
| `ztest.runSuiteArgs` | Extra args for suite run | `-s {suite}` |
| `ztest.runCaseArgs` | Extra args for case run (MVP runs suite then matches case) | `-s {suite}` |
| `ztest.testPath` | Twister `-T` path | `tests` |
| `ztest.platform` | Platform token | `native_sim` |
| `ztest.reportPath` | JSON report relative to cwd | `twister-out/twister.json` |
| `ztest.scanGlobs` | Source discovery globs | `["**/*.{c,cpp,h,hpp}"]` |
| `ztest.scanExclude` | Paths to skip | `build`, `twister-out*`, `modules`, … |

### Template variables

`{prefix}`, `{workspaceFolder}`, `{testPath}`, `{platform}`, `{suite}`, `{case}`, `{scenario}`, `{extraArgs}`

Empty `commandPrefix` collapses to a bare `west …` command.

### Docker wrapper example

```json
{
  "ztest.commandPrefix": "./.start_docker.sh -b native_sim",
  "ztest.testPath": "tests/bluetooth",
  "ztest.platform": "native_sim",
  "ztest.runCommand": "{prefix} west twister -T {testPath} --platform {platform} {extraArgs}",
  "ztest.runSuiteArgs": "-s {suite}",
  "ztest.reportPath": "twister-out/twister.json"
}
```

Expanded run:

```bash
./.start_docker.sh -b native_sim west twister -T tests/bluetooth --platform native_sim -s my_suite
```

## Discovery

The scanner looks for:

- `ZTEST_SUITE(suite, …)`
- `ZTEST(suite, case)` / `ZTEST_F(…)`
- `ZTEST_USER(…)` / `ZTEST_USER_F(…)`

## Commands

| Command | Description |
|---|---|
| `ZTEST: Refresh Tests` | Rescan workspace sources |
| `ZTEST: Run All` | Run configured twister command |
| `ZTEST: Run Suite` | Run with suite filter args |
| `ZTEST: Run Case` | Run suite args, match case in results |
| `ZTEST: Cancel Run` | Kill the running process |
| `ZTEST: Open Case` | Jump to source |
| `auto-poilot-fix` | When failures exist: open Copilot/Cursor Agent with an **evidence-first** fix prompt (failed cases, log tail, source excerpts) |

Output appears in the **ZTEST** output channel. Status bar shows `ZTEST: N passed, M failed`.

## MCP server

Agents (Cursor, etc.) can drive the same discover/run stack over **stdio MCP**.

| Tool | Purpose |
|---|---|
| `ztest_list` | Scan macros and list suites/cases |
| `ztest_run` | Run all / suite / case (`dryRun` previews the wrapper command) |
| `ztest_status` | Summary + statuses (reads `twister.json` when present) |
| `ztest_locate` | Resolve suite/case → `file` + `line` |
| `ztest_config` | Effective settings and expanded Run All command |

Project config: [`.cursor/mcp.json`](.cursor/mcp.json) (defaults `ZTEST_WORKSPACE` to `fixtures/sample-west`).

```bash
npm run compile
ZTEST_WORKSPACE=./fixtures/sample-west npm run mcp   # stdio server
npm run test:mcp-smoke                               # fixture discover+run check
```

Env overrides: `ZTEST_WORKSPACE`, `ZTEST_COMMAND_PREFIX`, `ZTEST_TEST_PATH`, `ZTEST_PLATFORM`, `ZTEST_REPORT_PATH`. Settings also load from the workspace `.vscode/settings.json` (`ztest.*` keys).

## Develop

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if using a user-local Node
npm install
npm run compile
npm run test:unit
npm run test:mcp-smoke
npm run package          # builds *.vsix
```

## CI / publish

GitHub Actions:

| Workflow | Trigger | What it does |
|---|---|---|
| [CI](.github/workflows/ci.yml) | push / PR | `compile` + unit tests + fixture smoke + package VSIX |
| [Publish](.github/workflows/publish.yml) | tag `v*` (or manual) | re-test, upload VSIX to GitHub Release; Marketplace / Open VSX if secrets set |

Release flow:

```bash
# bump version in package.json, then:
git tag v0.1.0
git push origin v0.1.0
```

Optional repo secrets:

- `VSCE_PAT` — publish to [VS Code Marketplace](https://marketplace.visualstudio.com/)
- `OVSX_PAT` — publish to [Open VSX](https://open-vsx.org/)

Without those secrets, tagging still creates a GitHub Release with the `.vsix` attached.

## License

MIT
