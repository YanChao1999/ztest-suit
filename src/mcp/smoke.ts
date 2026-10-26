/**
 * Non-MCP smoke: exercise ZtestService against the sample fixture.
 * Run: npm run compile && npm run test:mcp-smoke
 */
import * as path from 'path';
import {
  loadWorkspaceSettings,
  resolveWorkspaceRoot,
} from '../config/loadWorkspaceSettings';
import { ZtestService } from '../service/ztestService';

async function main(): Promise<void> {
  const fixture = path.resolve(__dirname, '../../fixtures/sample-west');
  const root = resolveWorkspaceRoot(fixture);
  const settings = loadWorkspaceSettings(root);
  const svc = new ZtestService(root, settings);

  const listed = await svc.discover();
  console.log(
    `discovered suites=${listed.suites.length} files=${listed.filesScanned}`
  );
  if (listed.suites.length < 2) {
    throw new Error('expected math_suite and string_suite');
  }

  const dry = svc.previewCommand({ suite: 'math_suite' });
  console.log(`preview: ${dry}`);
  if (!dry.includes('west twister')) {
    throw new Error('preview command missing west twister');
  }

  const run = await svc.run({ suite: 'math_suite' });
  console.log(`run exit=${run.exitCode} results=${run.results.length}`);
  if (run.exitCode !== 0) {
    throw new Error(`math_suite expected pass, got ${run.exitCode}`);
  }

  const failRun = await svc.run({ suite: 'string_suite' });
  console.log(
    `string_suite exit=${failRun.exitCode} failed=${svc.getSummary().failed}`
  );
  if (failRun.exitCode === 0) {
    throw new Error('string_suite expected non-zero exit (test_fail_demo)');
  }

  console.log('mcp smoke OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
