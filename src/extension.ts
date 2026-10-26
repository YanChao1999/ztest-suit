import * as vscode from 'vscode';
import { getSettings, getWorkspaceFolderPath, resolveReportPath } from './config/settings';
import { applyScanToModel, scanFiles } from './discovery/ztestScanner';
import { TestModel } from './model/testModel';
import { buildRunCommand } from './run/commandBuilder';
import {
  loadTwisterReport,
  mergeResults,
  parseTwisterLog,
} from './run/resultParser';
import { TwisterRunner } from './run/twisterRunner';
import {
  CaseNode,
  openTestLocation,
  SuiteNode,
  TestTreeProvider,
  TreeNode,
} from './tree/testTreeProvider';

let model: TestModel;
let treeProvider: TestTreeProvider;
let runner: TwisterRunner;
let output: vscode.OutputChannel;
let statusBar: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  model = new TestModel();
  treeProvider = new TestTreeProvider(model);
  runner = new TwisterRunner();
  output = vscode.window.createOutputChannel('ZTEST');
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'ztest.refresh';
  statusBar.show();

  context.subscriptions.push(
    output,
    statusBar,
    vscode.window.registerTreeDataProvider('ztestTests', treeProvider),
    vscode.commands.registerCommand('ztest.refresh', () => refreshTests()),
    vscode.commands.registerCommand('ztest.runAll', () => runTests({})),
    vscode.commands.registerCommand('ztest.runSuite', (node?: TreeNode) =>
      runFromNode(node, 'suite')
    ),
    vscode.commands.registerCommand('ztest.runCase', (node?: TreeNode) =>
      runFromNode(node, 'case')
    ),
    vscode.commands.registerCommand('ztest.cancelRun', () => cancelRun()),
    vscode.commands.registerCommand('ztest.openCase', (node?: TreeNode) =>
      openNode(node)
    )
  );

  model.on('changed', () => updateStatusBar());
  updateStatusBar();
  await refreshTests();
}

export function deactivate(): void {
  if (runner?.isRunning) {
    runner.cancel();
  }
}

async function refreshTests(): Promise<void> {
  const folder = getWorkspaceFolderPath();
  if (!folder) {
    vscode.window.showWarningMessage('ZTEST: open a workspace folder first.');
    return;
  }

  const settings = getSettings();
  const exclude =
    settings.scanExclude.length === 0
      ? null
      : settings.scanExclude.length === 1
        ? settings.scanExclude[0]
        : `{${settings.scanExclude.join(',')}}`;
  const uris: vscode.Uri[] = [];
  for (const glob of settings.scanGlobs) {
    const found = await vscode.workspace.findFiles(glob, exclude);
    uris.push(...found);
  }

  // Deduplicate paths
  const paths = [...new Set(uris.map((u) => u.fsPath))];
  const result = await scanFiles(paths);
  model.clear();
  applyScanToModel(model, result);
  model.notifyChanged();

  const suites = model.getSuites().length;
  const cases = model.getSummary();
  const total =
    cases.passed + cases.failed + cases.skipped + cases.notRun + cases.running;
  output.appendLine(
    `ZTEST: discovered ${suites} suite(s), ${total} case(s) in ${paths.length} file(s).`
  );
}

async function openNode(node?: TreeNode): Promise<void> {
  if (node instanceof CaseNode) {
    await openTestLocation(node.testCase.file, node.testCase.line);
    return;
  }
  if (node instanceof SuiteNode && node.suite.file && node.suite.line) {
    await openTestLocation(node.suite.file, node.suite.line);
  }
}

async function runFromNode(
  node: TreeNode | undefined,
  kind: 'suite' | 'case'
): Promise<void> {
  if (kind === 'suite') {
    const suite =
      node instanceof SuiteNode
        ? node.suite.name
        : await pickSuite();
    if (!suite) {
      return;
    }
    await runTests({ suite });
    return;
  }

  let suite: string | undefined;
  let caseName: string | undefined;
  if (node instanceof CaseNode) {
    suite = node.testCase.suite;
    caseName = node.testCase.name;
  } else {
    const picked = await pickCase();
    if (!picked) {
      return;
    }
    suite = picked.suite;
    caseName = picked.caseName;
  }
  await runTests({ suite, caseName });
}

async function pickSuite(): Promise<string | undefined> {
  const items = model.getSuites().map((s) => s.name);
  if (items.length === 0) {
    vscode.window.showInformationMessage('ZTEST: no suites discovered.');
    return undefined;
  }
  return vscode.window.showQuickPick(items, { placeHolder: 'Select suite' });
}

async function pickCase(): Promise<{ suite: string; caseName: string } | undefined> {
  const items = model.getSuites().flatMap((s) =>
    s.cases.map((c) => ({
      label: `${c.suite}.${c.name}`,
      suite: c.suite,
      caseName: c.name,
    }))
  );
  if (items.length === 0) {
    vscode.window.showInformationMessage('ZTEST: no cases discovered.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select case',
  });
  return picked
    ? { suite: picked.suite, caseName: picked.caseName }
    : undefined;
}

async function runTests(filter: { suite?: string; caseName?: string }): Promise<void> {
  if (runner.isRunning) {
    vscode.window.showWarningMessage('ZTEST: a run is already in progress.');
    return;
  }

  const folder = getWorkspaceFolderPath();
  if (!folder) {
    vscode.window.showWarningMessage('ZTEST: open a workspace folder first.');
    return;
  }

  const settings = getSettings();
  const extraArgsTemplate = filter.caseName
    ? settings.runCaseArgs
    : filter.suite
      ? settings.runSuiteArgs
      : '';

  const command = buildRunCommand({
    runCommandTemplate: settings.runCommand,
    extraArgsTemplate,
    prefix: settings.commandPrefix,
    workspaceFolder: folder,
    testPath: settings.testPath,
    platform: settings.platform,
    suite: filter.suite,
    caseName: filter.caseName,
  });

  model.setAllStatus('running', {
    suite: filter.suite,
    caseName: filter.caseName,
  });
  await vscode.commands.executeCommand('setContext', 'ztest.running', true);

  output.show(true);
  output.appendLine('');
  output.appendLine(`$ ${command}`);
  output.appendLine(`cwd: ${settings.cwd}`);

  try {
    const result = await runner.run({
      command,
      cwd: settings.cwd,
      onStdout: (c) => output.append(c),
      onStderr: (c) => output.append(c),
    });

    if (result.cancelled) {
      output.appendLine('ZTEST: run cancelled.');
      model.setAllStatus('notRun', {
        suite: filter.suite,
        caseName: filter.caseName,
      });
      return;
    }

    const reportPath = resolveReportPath(settings);
    const fromJson = await loadTwisterReport(reportPath);
    const fromLog = parseTwisterLog(result.stdout + '\n' + result.stderr);
    const merged = mergeResults(fromJson, fromLog, filter);

    if (merged.length === 0) {
      // Fallback: mark targeted cases by process exit code
      const status = result.exitCode === 0 ? 'passed' : 'failed';
      model.setAllStatus(status, {
        suite: filter.suite,
        caseName: filter.caseName,
      });
      output.appendLine(
        `ZTEST: no parseable report at ${reportPath}; marked by exit code ${result.exitCode}.`
      );
    } else {
      let toApply = merged;
      if (filter.caseName) {
        toApply = merged.filter(
          (r) =>
            r.caseName === filter.caseName &&
            (!r.suite || !filter.suite || r.suite === filter.suite)
        );
        if (toApply.length === 0) {
          const status = result.exitCode === 0 ? 'passed' : 'failed';
          model.setAllStatus(status, filter);
        } else {
          clearRunningStatuses();
          model.applyResults(toApply);
        }
      } else if (filter.suite) {
        toApply = merged.filter((r) => !r.suite || r.suite === filter.suite);
        clearRunningStatuses();
        model.applyResults(toApply);
      } else {
        clearRunningStatuses();
        model.applyResults(toApply);
      }
    }

    output.appendLine(
      `ZTEST: finished with exit code ${result.exitCode ?? 'null'}.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    output.appendLine(`ZTEST: error: ${message}`);
    vscode.window.showErrorMessage(`ZTEST: ${message}`);
    model.setAllStatus('failed', {
      suite: filter.suite,
      caseName: filter.caseName,
    });
  } finally {
    await vscode.commands.executeCommand('setContext', 'ztest.running', false);
    updateStatusBar();
  }
}

function clearRunningStatuses(): void {
  for (const s of model.getSuites()) {
    for (const c of s.cases) {
      if (c.status === 'running') {
        c.status = 'notRun';
      }
    }
  }
}

function cancelRun(): void {
  if (!runner.isRunning) {
    vscode.window.showInformationMessage('ZTEST: no run in progress.');
    return;
  }
  runner.cancel();
  output.appendLine('ZTEST: cancelling...');
}

function updateStatusBar(): void {
  const s = model.getSummary();
  statusBar.text = `ZTEST: ${s.passed} passed, ${s.failed} failed`;
  statusBar.tooltip = `passed=${s.passed} failed=${s.failed} skipped=${s.skipped} notRun=${s.notRun} running=${s.running}`;
}
