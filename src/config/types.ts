import * as path from 'path';

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

export const DEFAULT_SETTINGS: Omit<ZtestSettings, 'cwd'> = {
  commandPrefix: '',
  listCommand:
    '{prefix} west twister --list-tests -T {testPath} --platform {platform}',
  runCommand:
    '{prefix} west twister -T {testPath} --platform {platform} {extraArgs}',
  runSuiteArgs: '-s {scenario}',
  runCaseArgs: '-s {scenario}',
  testPath: 'tests',
  platform: 'native_sim',
  reportPath: 'twister-out/twister.json',
  scanGlobs: ['**/*.{c,cpp,h,hpp}'],
  scanExclude: [
    '**/build/**',
    '**/twister-out*/**',
    '**/zephyr/**',
    '**/modules/**',
    '**/bootloader/**',
    '**/.git/**',
    '**/node_modules/**',
  ],
};

export function resolveWorkspaceTokens(
  value: string,
  workspaceFolder: string
): string {
  return value.replace(/\$\{workspaceFolder\}/g, workspaceFolder);
}

export function resolveReportPath(settings: ZtestSettings): string {
  if (path.isAbsolute(settings.reportPath)) {
    return settings.reportPath;
  }
  return path.join(settings.cwd, settings.reportPath);
}

export function buildSettings(
  workspaceFolder: string,
  overrides: Partial<ZtestSettings> = {}
): ZtestSettings {
  const cwdRaw = overrides.cwd ?? '${workspaceFolder}';
  const cwd =
    resolveWorkspaceTokens(cwdRaw, workspaceFolder) || workspaceFolder;

  return {
    commandPrefix: overrides.commandPrefix ?? DEFAULT_SETTINGS.commandPrefix,
    cwd,
    listCommand: overrides.listCommand ?? DEFAULT_SETTINGS.listCommand,
    runCommand: overrides.runCommand ?? DEFAULT_SETTINGS.runCommand,
    runSuiteArgs: overrides.runSuiteArgs ?? DEFAULT_SETTINGS.runSuiteArgs,
    runCaseArgs: overrides.runCaseArgs ?? DEFAULT_SETTINGS.runCaseArgs,
    testPath: overrides.testPath ?? DEFAULT_SETTINGS.testPath,
    platform: overrides.platform ?? DEFAULT_SETTINGS.platform,
    reportPath: resolveWorkspaceTokens(
      overrides.reportPath ?? DEFAULT_SETTINGS.reportPath,
      workspaceFolder
    ),
    scanGlobs: overrides.scanGlobs ?? [...DEFAULT_SETTINGS.scanGlobs],
    scanExclude: overrides.scanExclude ?? [...DEFAULT_SETTINGS.scanExclude],
  };
}
