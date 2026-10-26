import * as fs from 'fs/promises';
import { TestStatus } from '../model/testModel';

export interface ParsedCaseResult {
  suite: string;
  caseName: string;
  status: TestStatus;
  /** Full twister id when available, e.g. path.scenario.suite.case */
  id?: string;
}

function mapTwisterStatus(raw: string | undefined): TestStatus {
  const s = (raw ?? '').toLowerCase();
  if (s === 'passed' || s === 'pass') {
    return 'passed';
  }
  if (s === 'failed' || s === 'fail' || s === 'error') {
    return 'failed';
  }
  if (s === 'skipped' || s === 'skip' || s === 'filtered' || s === 'blocked') {
    return 'skipped';
  }
  return 'notRun';
}

/**
 * Split a twister testcase name like "suite.case" or "a.b.suite.case".
 * Heuristic: last two dotted segments are suite + case when possible.
 */
export function splitSuiteCase(name: string): { suite: string; caseName: string } {
  const parts = name.split('.').filter(Boolean);
  if (parts.length >= 2) {
    return {
      suite: parts[parts.length - 2],
      caseName: parts[parts.length - 1],
    };
  }
  return { suite: '', caseName: name };
}

function collectFromObject(obj: unknown, out: ParsedCaseResult[]): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectFromObject(item, out);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Common twister.json shapes: testcases array with name + status
  if (typeof record.name === 'string' && record.status !== undefined) {
    const { suite, caseName } = splitSuiteCase(record.name);
    out.push({
      suite,
      caseName,
      status: mapTwisterStatus(String(record.status)),
      id: record.name,
    });
  }

  // Nested testcases / tests
  for (const key of ['testcases', 'tests', 'testsuites', 'results']) {
    if (record[key] !== undefined) {
      collectFromObject(record[key], out);
    }
  }

  // Some reports use dictionary keyed by test id
  for (const [key, value] of Object.entries(record)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'status' in (value as object) &&
      key.includes('.')
    ) {
      const { suite, caseName } = splitSuiteCase(key);
      out.push({
        suite,
        caseName,
        status: mapTwisterStatus(
          String((value as Record<string, unknown>).status)
        ),
        id: key,
      });
    }
  }
}

export function parseTwisterJson(content: string): ParsedCaseResult[] {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }
  const out: ParsedCaseResult[] = [];
  collectFromObject(data, out);

  // Deduplicate by suite+case keeping last
  const map = new Map<string, ParsedCaseResult>();
  for (const r of out) {
    if (!r.caseName) {
      continue;
    }
    map.set(`${r.suite}::${r.caseName}`, r);
  }
  return [...map.values()];
}

/**
 * Heuristic parse of twister / ztest console output.
 * Examples:
 *   PASS - test_add
 *   FAIL - math_suite.test_add
 *   Assertion failed at ... suite.case
 */
export function parseTwisterLog(log: string): ParsedCaseResult[] {
  const results: ParsedCaseResult[] = [];
  const lines = log.split(/\r?\n/);

  const passFail =
    /\b(PASS|FAIL|SKIP(?:PED)?)\b(?:\s*[-:]\s*|\s+)([A-Za-z0-9_.]+)/i;
  const ztestLine =
    /\bSTART\s+-\s+([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/i;
  // Track last started case for PASS/FAIL without full name
  let lastSuite = '';
  let lastCase = '';

  for (const line of lines) {
    const start = ztestLine.exec(line);
    if (start) {
      lastSuite = start[1];
      lastCase = start[2];
    }

    const m = passFail.exec(line);
    if (!m) {
      continue;
    }
    const status = mapTwisterStatus(m[1]);
    let suite = '';
    let caseName = m[2];
    if (caseName.includes('.')) {
      const split = splitSuiteCase(caseName);
      suite = split.suite;
      caseName = split.caseName;
    } else if (lastCase === caseName || lastCase) {
      suite = lastSuite;
      if (lastCase && !caseName.includes(lastCase)) {
        // keep caseName from match
      }
    }
    results.push({ suite, caseName, status });
  }

  const map = new Map<string, ParsedCaseResult>();
  for (const r of results) {
    map.set(`${r.suite}::${r.caseName}`, r);
  }
  return [...map.values()];
}

export async function loadTwisterReport(
  reportPath: string
): Promise<ParsedCaseResult[]> {
  try {
    const content = await fs.readFile(reportPath, 'utf8');
    return parseTwisterJson(content);
  } catch {
    return [];
  }
}

/**
 * Prefer JSON report; fall back to log heuristics.
 * When filterSuite/filterCase provided, also try matching results that lack suite.
 */
export function mergeResults(
  fromJson: ParsedCaseResult[],
  fromLog: ParsedCaseResult[],
  filter?: { suite?: string; caseName?: string }
): ParsedCaseResult[] {
  const map = new Map<string, ParsedCaseResult>();
  for (const r of [...fromLog, ...fromJson]) {
    let suite = r.suite;
    let caseName = r.caseName;
    if (!suite && filter?.suite) {
      suite = filter.suite;
    }
    if (filter?.caseName && caseName !== filter.caseName) {
      // keep all for suite runs; for case runs still apply matching ones
    }
    map.set(`${suite}::${caseName}`, { ...r, suite, caseName });
  }
  return [...map.values()];
}
