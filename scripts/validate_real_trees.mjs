#!/usr/bin/env node
/**
 * Discover ZTEST suites in locally cloned real west/Zephyr trees.
 * Expects trees under validation/ (see validation/README.md).
 *
 * Usage: npm run compile && node scripts/validate_real_trees.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VALIDATION = path.join(ROOT, 'validation');

const { buildSettings } = require('../out/config/types.js');
const { ZtestService } = require('../out/service/ztestService.js');

/** @type {Array<{ id: string; root: string; testPath: string; notes: string }>} */
const TREES = [
  {
    id: '1-zephyr-official-tests',
    root: 'zephyr',
    testPath: 'tests',
    notes: 'Official Zephyr sparse checkout (tests/ztest, kernel/common, lib/c_lib, …)',
  },
  {
    id: '2-example-application',
    root: 'example-application',
    testPath: 'tests',
    notes: 'zephyrproject-rtos/example-application (T2 west app + out-of-tree tests)',
  },
  {
    id: '3-zephyr-moving-average',
    root: 'zephyr-moving-average',
    testPath: 'tests',
    notes: 'ryantra/zephyr-moving-average (ZTEST + Twister CI teaching tree)',
  },
  {
    id: '4-zscilib',
    root: 'zscilib',
    testPath: 'tests',
    notes: 'zephyrproject-rtos/zscilib (module library with ZTEST)',
  },
  {
    id: '5-memfault-zephyr-port',
    root: 'memfault-firmware-sdk',
    testPath: 'tests/ports/zephyr',
    notes: 'memfault/memfault-firmware-sdk Zephyr port HTTP ZTEST',
  },
];

function summarize(suites) {
  const suiteNames = suites.map((s) => s.name);
  const caseCount = suites.reduce((n, s) => n + s.cases.length, 0);
  const withScenario = suites.filter((s) => s.scenario).length;
  const sample = suites.slice(0, 5).map((s) => ({
    suite: s.name,
    scenario: s.scenario,
    cases: s.cases.length,
    file: s.file ? path.relative(VALIDATION, s.file) : undefined,
  }));
  return { suiteCount: suites.length, caseCount, withScenario, suiteNames, sample };
}

async function runOne(tree) {
  const workspace = path.join(VALIDATION, tree.root);
  if (!fs.existsSync(workspace)) {
    return { id: tree.id, ok: false, error: `missing ${workspace}` };
  }

  const settings = buildSettings(workspace, {
    testPath: tree.testPath,
    platform: 'native_sim',
    scanGlobs: ['**/*.{c,cpp,h,hpp}'],
    scanExclude: [
      '**/build/**',
      '**/twister-out*/**',
      'zephyr/**',
      'modules/**',
      'bootloader/**',
      '**/.git/**',
      '**/node_modules/**',
      '**/third_party/**',
      '**/ports/esp*/**',
      '**/ports/freertos/**',
    ],
  });

  // When the workspace *is* Zephyr, do not exclude the tree root as zephyr/**
  if (tree.root === 'zephyr') {
    settings.scanExclude = settings.scanExclude.filter((g) => g !== 'zephyr/**');
  }

  const t0 = Date.now();
  const svc = new ZtestService(workspace, settings);
  const { suites, filesScanned } = await svc.discover();
  const preview = svc.previewCommand({});
  const ms = Date.now() - t0;
  const summary = summarize(suites);

  // Heuristic pass: found at least one suite, and no path outside testPath in samples
  const leak = suites.some((s) => {
    if (!s.file) return false;
    const rel = path.relative(workspace, s.file).replace(/\\/g, '/');
    return !rel.startsWith(tree.testPath.replace(/\/$/, '') + '/') && rel !== tree.testPath;
  });

  const ok = summary.suiteCount > 0 && !leak && preview.includes('--platform native_sim');

  return {
    id: tree.id,
    root: tree.root,
    testPath: tree.testPath,
    notes: tree.notes,
    ok,
    ms,
    filesScanned,
    preview,
    leak,
    ...summary,
  };
}

async function main() {
  if (!fs.existsSync(VALIDATION)) {
    console.error('validation/ missing — clone trees first (see validation/README.md)');
    process.exit(2);
  }

  const results = [];
  for (const tree of TREES) {
    process.stderr.write(`… ${tree.id}\n`);
    results.push(await runOne(tree));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };

  const outPath = path.join(VALIDATION, 'discovery-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote ${outPath}`);
  console.error(`PASS ${report.passed}/${results.length}`);

  if (report.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
