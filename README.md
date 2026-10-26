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
3. Press **F5** (Run Extension) to launch an Extension Development Host
4. Open a Zephyr workspace that contains ZTEST sources
5. Open the **ZTEST** activity bar view and click **Refresh**

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

Output appears in the **ZTEST** output channel. Status bar shows `ZTEST: N passed, M failed`.

## Develop

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # if using a user-local Node
npm install
npm run compile
npm run test:unit
```

## License

MIT
