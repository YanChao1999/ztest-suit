import * as path from 'path';
import * as vscode from 'vscode';

export interface ZtestSettings {
  commandPrefix: string;
  cwd: string;
  listCommand: string;
  runCommand: string;
  runSuiteArgs: string;
  runCaseArgs: string;
  testPath: string;
  platform: string;
  reportPath: string;
  scanGlobs: string[];
  scanExclude: string[];
}

function resolveWorkspaceTokens(value: string, workspaceFolder: string): string {
  return value.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
}

export function getWorkspaceFolderPath(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

export function getSettings(): ZtestSettings {
  const cfg = vscode.workspace.getConfiguration('ztest');
  const workspaceFolder = getWorkspaceFolderPath() ?? '';

  const cwdRaw = cfg.get<string>('cwd', '${workspaceFolder}');
  const cwd = resolveWorkspaceTokens(cwdRaw, workspaceFolder) || workspaceFolder;

  return {
    commandPrefix: cfg.get<string>('commandPrefix', ''),
    cwd,
    listCommand: cfg.get<string>(
      'listCommand',
      '{prefix} west twister --list-tests -T {testPath}'
    ),
    runCommand: cfg.get<string>(
      'runCommand',
      '{prefix} west twister -T {testPath} {extraArgs}'
    ),
    runSuiteArgs: cfg.get<string>('runSuiteArgs', '-s {suite}'),
    runCaseArgs: cfg.get<string>('runCaseArgs', '-s {suite}'),
    testPath: cfg.get<string>('testPath', 'tests'),
    platform: cfg.get<string>('platform', 'native_sim'),
    reportPath: resolveWorkspaceTokens(
      cfg.get<string>('reportPath', 'twister-out/twister.json'),
      workspaceFolder
    ),
    scanGlobs: cfg.get<string[]>('scanGlobs', ['**/*.{c,cpp,h,hpp}']),
    scanExclude: cfg.get<string[]>('scanExclude', [
      '**/build/**',
      '**/twister-out*/**',
      '**/modules/**',
      '**/.git/**',
      '**/node_modules/**',
    ]),
  };
}

export function resolveReportPath(settings: ZtestSettings): string {
  if (path.isAbsolute(settings.reportPath)) {
    return settings.reportPath;
  }
  return path.join(settings.cwd, settings.reportPath);
}
