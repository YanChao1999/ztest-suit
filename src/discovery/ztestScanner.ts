import * as fs from 'fs/promises';
import * as path from 'path';
import { TestModel } from '../model/testModel';

export interface DiscoveredSuite {
  name: string;
  file: string;
  line: number;
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

export function parseZtestSource(
  content: string,
  filePath: string
): ScanResult {
  const suites: DiscoveredSuite[] = [];
  const cases: DiscoveredCase[] = [];

  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }

  const lineOf = (index: number): number => {
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
    return hi + 1; // 1-based
  };

  SUITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SUITE_RE.exec(content)) !== null) {
    suites.push({
      name: m[1],
      file: filePath,
      line: lineOf(m.index),
    });
  }

  CASE_RE.lastIndex = 0;
  while ((m = CASE_RE.exec(content)) !== null) {
    cases.push({
      suite: m[1],
      name: m[2],
      file: filePath,
      line: lineOf(m.index),
    });
  }

  return { suites, cases };
}

export function applyScanToModel(model: TestModel, result: ScanResult): void {
  for (const s of result.suites) {
    model.ensureSuite(s.name, { file: s.file, line: s.line });
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

export async function scanFiles(
  filePaths: string[]
): Promise<ScanResult> {
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

  return { suites, cases };
}

export function isLikelySourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh'].includes(ext);
}
