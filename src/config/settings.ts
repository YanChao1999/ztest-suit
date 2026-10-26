import * as vscode from 'vscode';
import { buildSettings, resolveReportPath, ZtestSettings } from './types';

export type { ZtestSettings } from './types';
export { resolveReportPath };

export function getWorkspaceFolderPath(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath;
}

export function getSettings(): ZtestSettings {
  const cfg = vscode.workspace.getConfiguration('ztest');
  const workspaceFolder = getWorkspaceFolderPath() ?? '';

  return buildSettings(workspaceFolder, {
    commandPrefix: cfg.get<string>('commandPrefix', ''),
    cwd: cfg.get<string>('cwd', '${workspaceFolder}'),
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
    reportPath: cfg.get<string>('reportPath', 'twister-out/twister.json'),
    scanGlobs: cfg.get<string[]>('scanGlobs', ['**/*.{c,cpp,h,hpp}']),
    scanExclude: cfg.get<string[]>('scanExclude', [
      '**/build/**',
      '**/twister-out*/**',
      '**/modules/**',
      '**/.git/**',
      '**/node_modules/**',
    ]),
  });
}
