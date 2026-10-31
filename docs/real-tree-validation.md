# Real west / Zephyr tree validation

Local clones under `validation/` (gitignored) used to verify ztest-suit discovery against **real** sources (not the demo fixture).

Latest local run: **5/5 PASS** (`npm run test:real-trees` → `validation/discovery-report.json`).

| # | Tree | Upstream | `testPath` | Discovery (local) |
|---|------|----------|------------|-------------------|
| 1 | `zephyr/` | [zephyrproject-rtos/zephyr](https://github.com/zephyrproject-rtos/zephyr) (sparse) | `tests` | 41 suites / 268 cases |
| 2 | `example-application/` | [zephyrproject-rtos/example-application](https://github.com/zephyrproject-rtos/example-application) | `tests` | 1 suite / 1 case |
| 3 | `zephyr-moving-average/` | [ryantra/zephyr-moving-average](https://github.com/ryantra/zephyr-moving-average) | `tests` | 1 suite / 5 cases (+ scenario) |
| 4 | `zscilib/` | [zephyrproject-rtos/zscilib](https://github.com/zephyrproject-rtos/zscilib) | `tests` | 2 suites / 344 cases |
| 5 | `memfault-firmware-sdk/` | [memfault/memfault-firmware-sdk](https://github.com/memfault/memfault-firmware-sdk) | `tests/ports/zephyr` | 2 suites / 5 cases |

## Re-clone

```bash
# from repo root
rm -rf validation/zephyr validation/example-application \
  validation/zephyr-moving-average validation/zscilib validation/memfault-firmware-sdk

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/zephyrproject-rtos/zephyr.git validation/zephyr
(cd validation/zephyr && git sparse-checkout set \
  samples/subsys/testsuite tests/ztest tests/lib/c_lib tests/kernel/common tests/unit/util)

git clone --depth 1 https://github.com/zephyrproject-rtos/example-application.git validation/example-application
git clone --depth 1 https://github.com/ryantra/zephyr-moving-average.git validation/zephyr-moving-average
git clone --depth 1 https://github.com/zephyrproject-rtos/zscilib.git validation/zscilib
git clone --depth 1 https://github.com/memfault/memfault-firmware-sdk.git validation/memfault-firmware-sdk
```

## Discovery smoke

```bash
npm run compile
node scripts/validate_real_trees.mjs
# → validation/discovery-report.json
```

## Twister run (optional, heavy)

Full `west update` for each app pulls multi‑GB Zephyr modules. Prefer **one** workspace:

```bash
west init -m https://github.com/ryantra/zephyr-moving-average --mr main validation/ws-moving-avg
cd validation/ws-moving-avg && west update
west twister -T zephyr-moving-average/tests -p native_sim --inline-logs
```

Then open that folder in VS Code / Cursor with ztest-suit and set `ztest.testPath` to `zephyr-moving-average/tests`.
