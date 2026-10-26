import * as fs from 'fs/promises';
import * as path from 'path';
import { TestModel } from '../model/testModel';
import {
  clearScenarioCache,
  resolveScenarioForFile,
} from './scenarioMap';

export interface DiscoveredSuite {
  name: string;
  file: string;
  line: number;
  scenario?: string;
}

export interface DiscoveredCase {
  suite: string;
  name: string;
  file: string;
  line: number;
}

export interface ScanResult {
  suites: DiscoveredSuite[];
  cases: DiscoveredCase[];
}

/** Match ZTEST_SUITE(name, ...) */
const SUITE_RE =
  /\bZTEST_SUITE\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/g;

/** Match ZTEST / ZTEST_F / ZTEST_USER / ZTEST_USER_F (suite, case) */
const CASE_RE =
  /\bZTEST(?:_USER)?(?:_F)?\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,)]/g;

/**
 * Mask comments and string/char literals with spaces (preserve offsets/newlines)
 * so regex scans ignore commented-out or quoted macros.
 */
export function maskNonCode(content: string): string {
  const out = content.split('');
  let i = 0;
  while (i < content.length) {
    // Line comment
    if (content[i] === '/' && content[i + 1] === '/') {
      let j = i;
      while (j < content.length && content[j] !== '\n') {
        out[j] = ' ';
        j++;
      }
      i = j;
      continue;
    }

    // Block comment
    if (content[i] === '/' && content[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      let j = i + 2;
      while (j < content.length) {
        if (content[j] === '\n') {
          j++;
          continue;
        }
        if (content[j] === '*' && content[j + 1] === '/') {
          out[j] = ' ';
          out[j + 1] = ' ';
          j += 2;
          break;
        }
        out[j] = ' ';
        j++;
      }
      i = j;
      continue;
    }

    // String / char literal
    if (content[i] === '"' || content[i] === "'") {
      const quote = content[i];
      out[i] = ' ';
      let j = i + 1;
      while (j < content.length) {
        if (content[j] === '\\' && j + 1 < content.length) {
          out[j] = ' ';
          out[j + 1] = ' ';
          j += 2;
          continue;
        }
        if (content[j] === '\n') {
          break;
        }
        if (content[j] === quote) {
          out[j] = ' ';
          j++;
          break;
        }
        out[j] = ' ';
        j++;
      }
      i = j;
      continue;
    }

    i++;
  }
  return out.join('');
}

function lineStartsOf(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineOfIndex(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= index) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi + 1;
}

/** True when the match sits on a `#define …` preprocessor line (use original source). */
function isOnDefineLine(content: string, starts: number[], index: number): boolean {
  const lineIdx = lineOfIndex(starts, index) - 1;
  const start = starts[lineIdx] ?? 0;
  const end = starts[lineIdx + 1] ?? content.length;
  return /^\s*#\s*define\b/.test(content.slice(start, end));
}

export function parseZtestSource(
  content: string,
  filePath: string
): ScanResult {
  const suites: DiscoveredSuite[] = [];
  const cases: DiscoveredCase[] = [];
  const masked = maskNonCode(content);
  const starts = lineStartsOf(content);

  SUITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SUITE_RE.exec(masked)) !== null) {
    if (isOnDefineLine(content, starts, m.index)) {
      continue;
    }
    suites.push({
      name: m[1],
      file: filePath,
      line: lineOfIndex(starts, m.index),
    });
  }

  CASE_RE.lastIndex = 0;
  while ((m = CASE_RE.exec(masked)) !== null) {
    if (isOnDefineLine(content, starts, m.index)) {
      continue;
    }
    cases.push({
      suite: m[1],
      name: m[2],
      file: filePath,
      line: lineOfIndex(starts, m.index),
    });
  }

  return { suites, cases };
}

export function applyScanToModel(model: TestModel, result: ScanResult): void {
  for (const s of result.suites) {
    model.ensureSuite(s.name, {
      file: s.file,
      line: s.line,
      scenario: s.scenario,
    });
  }
  for (const c of result.cases) {
    model.upsertCase({
      suite: c.suite,
      name: c.name,
      file: c.file,
      line: c.line,
    });
  }
}

/** Attach Twister scenario ids from nearby testcase.yaml files. */
export async function attachScenarios(result: ScanResult): Promise<void> {
  clearScenarioCache();
  for (const s of result.suites) {
    const scenario = await resolveScenarioForFile(s.name, s.file);
    if (scenario) {
      s.scenario = scenario;
    }
  }
  // Suites only declared via ZTEST(case) still get a scenario from a case file
  const suiteNames = new Set(result.suites.map((s) => s.name));
  for (const c of result.cases) {
    if (suiteNames.has(c.suite)) {
      continue;
    }
    const scenario = await resolveScenarioForFile(c.suite, c.file);
    if (scenario) {
      result.suites.push({
        name: c.suite,
        file: c.file,
        line: c.line,
        scenario,
      });
      suiteNames.add(c.suite);
    }
  }
}

export async function scanFiles(filePaths: string[]): Promise<ScanResult> {
  const suites: DiscoveredSuite[] = [];
  const cases: DiscoveredCase[] = [];

  for (const filePath of filePaths) {
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const partial = parseZtestSource(content, filePath);
    suites.push(...partial.suites);
    cases.push(...partial.cases);
  }

  const result: ScanResult = { suites, cases };
  await attachScenarios(result);
  return result;
}

export function isLikelySourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh'].includes(ext);
}
