#!/usr/bin/env node
/** Dump evidence-first auto-pilot prompt from the sample fixture (for demo GIF). */
const fs = require('fs');
const path = require('path');
const {
  loadWorkspaceSettings,
  resolveWorkspaceRoot,
} = require('../out/config/loadWorkspaceSettings');
const { buildAutoPilotPrompt } = require('../out/copilot/autoPilotPrompt');
const { scanFiles } = require('../out/discovery/ztestScanner');
const { walkSourceFiles } = require('../out/discovery/fileWalk');
const { applyScanToModel } = require('../out/discovery/ztestScanner');
const { TestModel } = require('../out/model/testModel');
const { loadTwisterReport } = require('../out/run/resultParser');
const { resolveReportPath } = require('../out/config/types');

async function main() {
  const fixture = path.resolve(__dirname, '../fixtures/sample-west');
  const root = resolveWorkspaceRoot(fixture);
  const settings = loadWorkspaceSettings(root);
  const files = await walkSourceFiles(root, settings.scanGlobs, settings.scanExclude);
  const scan = await scanFiles(files);
  const model = new TestModel();
  applyScanToModel(model, scan);
  const report = await loadTwisterReport(resolveReportPath(settings));
  if (report.length) {
    model.applyResults(report);
  } else {
    model.applyCaseStatus('string_suite', 'test_fail_demo', 'failed');
  }
  const failed = model.getFailedCases();
  const logPath = path.join(__dirname, '../docs/demo-capture/twister.log');
  const logTail = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, 'utf8')
    : 'FAIL - string_suite.test_fail_demo\n';
  let excerpt = '(source)';
  if (failed[0]) {
    try {
      const raw = fs.readFileSync(failed[0].file, 'utf8').split(/\r?\n/);
      const line = failed[0].line;
      const start = Math.max(0, line - 6);
      excerpt = raw
        .slice(start, line + 5)
        .map((l, i) => `${String(start + i + 1).padStart(4)}| ${l}`)
        .join('\n');
    } catch {
      /* ignore */
    }
  }
  const prompt = buildAutoPilotPrompt({
    failed,
    evidence: {
      command: './.start_docker.sh -b native_sim west twister -T tests --platform native_sim',
      cwd: root,
      exitCode: 1,
      logTail,
      reportPath: resolveReportPath(settings),
    },
    workspaceFolder: root,
    snippets: failed[0]
      ? [{ file: failed[0].file, line: failed[0].line, excerpt }]
      : [],
  });
  process.stdout.write(prompt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
