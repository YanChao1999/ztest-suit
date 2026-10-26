import * as fs from 'fs';
import * as path from 'path';
import { buildSettings, ZtestSettings } from './types';

/**
 * Resolve the west/Zephyr workspace the MCP server should operate on.
 * Priority: explicit arg → ZTEST_WORKSPACE → cwd if it looks like a west tree → process.cwd()
 */
export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit && explicit.trim()) {
    return path.resolve(explicit.trim());
  }
  if (process.env.ZTEST_WORKSPACE) {
    return path.resolve(process.env.ZTEST_WORKSPACE);
  }
  const cwd = process.cwd();
  if (
    fs.existsSync(path.join(cwd, 'west.yml')) ||
    fs.existsSync(path.join(cwd, '.vscode', 'settings.json'))
  ) {
    return cwd;
  }
  return cwd;
}

function stripJsonComments(raw: string): string {
  // Only strip full-line // comments. Do NOT strip /* */ — VS Code globs
  // often contain "/**" inside strings and a naive strip corrupts them.
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        return '';
      }
      return line;
    })
    .join('\n');
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
}

function pickZtestFromVscodeSettings(
  doc: Record<string, unknown>
): Partial<ZtestSettings> {
  const out: Partial<ZtestSettings> = {};
  const map: Array<[keyof ZtestSettings, string]> = [
    ['commandPrefix', 'ztest.commandPrefix'],
    ['cwd', 'ztest.cwd'],
    ['listCommand', 'ztest.listCommand'],
    ['runCommand', 'ztest.runCommand'],
    ['runSuiteArgs', 'ztest.runSuiteArgs'],
    ['runCaseArgs', 'ztest.runCaseArgs'],
    ['testPath', 'ztest.testPath'],
    ['platform', 'ztest.platform'],
    ['reportPath', 'ztest.reportPath'],
    ['scanGlobs', 'ztest.scanGlobs'],
    ['scanExclude', 'ztest.scanExclude'],
  ];
  for (const [key, settingKey] of map) {
    if (doc[settingKey] !== undefined) {
      (out as Record<string, unknown>)[key] = doc[settingKey];
    }
  }
  return out;
}

/**
 * Load settings for CLI/MCP: env overrides + .vscode/settings.json in workspace.
 */
export function loadWorkspaceSettings(workspaceFolder: string): ZtestSettings {
  const vscodeSettingsPath = path.join(
    workspaceFolder,
    '.vscode',
    'settings.json'
  );
  const fromFile = readJsonFile(vscodeSettingsPath);
  const fromVscode = fromFile ? pickZtestFromVscodeSettings(fromFile) : {};

  const fromEnv: Partial<ZtestSettings> = {};
  if (process.env.ZTEST_COMMAND_PREFIX !== undefined) {
    fromEnv.commandPrefix = process.env.ZTEST_COMMAND_PREFIX;
  }
  if (process.env.ZTEST_TEST_PATH !== undefined) {
    fromEnv.testPath = process.env.ZTEST_TEST_PATH;
  }
  if (process.env.ZTEST_PLATFORM !== undefined) {
    fromEnv.platform = process.env.ZTEST_PLATFORM;
  }
  if (process.env.ZTEST_REPORT_PATH !== undefined) {
    fromEnv.reportPath = process.env.ZTEST_REPORT_PATH;
  }

  return buildSettings(workspaceFolder, { ...fromVscode, ...fromEnv });
}
