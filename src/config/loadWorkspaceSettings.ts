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

/** String-aware JSONC strip: comments + trailing commas. */
export function stripJsonc(raw: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;

  while (i < raw.length) {
    const ch = raw[i];
    const next = raw[i + 1];

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === stringQuote) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringQuote = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < raw.length && raw[i] !== '\n') {
        i++;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // Trailing comma before } or ]
    if (ch === ',') {
      let j = i + 1;
      while (j < raw.length && /\s/.test(raw[j])) {
        j++;
      }
      if (raw[j] === '}' || raw[j] === ']') {
        i++;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
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
