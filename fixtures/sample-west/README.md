# Zephyr west fixture (formal layout + demo runner)

Contains real ZTEST app layout (`CMakeLists.txt`, `prj.conf`, `testcase.yaml`, `src/*.c`) and a **demo/CI mock** `bin/west` so the extension works without a full Zephyr download.

Pinned Zephyr for real runs: **v4.1.0** (`west.yml`, `clone-depth: 1`).

## Quick demo (no SDK)

```bash
cd fixtures/sample-west
./.start_docker.sh -b native_sim west twister -T tests --platform native_sim
```

The math and string suites pass in the mock runner, including the empty-string length case.

## Real west (optional)

```bash
cd fixtures
west init -l sample-west   # creates fixtures/.west + pulls zephyr/
west update
west zephyr-export
export ZEPHYR_BASE="$PWD/zephyr"
# then use real west from PATH (ahead of sample-west/bin)
west twister -T sample-west/tests --platform native_sim
```

## ZTEST Suit settings

This folder’s `.vscode/settings.json` uses `./.start_docker.sh -b native_sim` → mock `west` for reliable local/CI demos. After a real `west update`, clear `ztest.commandPrefix` and point `PATH` at system west.
