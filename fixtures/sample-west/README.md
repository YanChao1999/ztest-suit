# Sample west workspace (fixture)

Local stand-in for a Zephyr west tree so you can try **ZTEST Suit** without a full SDK.

## Layout

- `tests/math/test_math.c` — `math_suite` (3 cases, all pass in mock)
- `tests/string/test_string.c` — `string_suite` (2 pass + `test_fail_demo` fails)
- `bin/west` — mock `west twister` that writes `twister-out/twister.json`
- `.start_docker.sh` — docker-style wrapper used by extension settings

## Try with the extension

1. In the `ztest-suit` repo: `npm run compile`, then **F5** (Run Extension)
2. Extension Host opens this fixture folder (see launch config)
3. Open the **ZTEST** activity bar → Refresh
4. Run All / Run Suite / click a case to navigate

## CLI smoke test

```bash
cd fixtures/sample-west
./.start_docker.sh -b native_sim west twister -T tests --platform native_sim
./.start_docker.sh -b native_sim west twister -T tests -s math_suite
cat twister-out/twister.json
```
