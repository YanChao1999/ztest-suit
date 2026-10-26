import * as fs from 'fs/promises';
import { TestStatus } from '../model/testModel';

export interface ParsedCaseResult {
  suite: string;
  caseName: string;
  status: TestStatus;
  /** Full twister id when available, e.g. path.scenario.suite.case */
  id?: string;
  platform?: string;
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

function statusRank(s: TestStatus): number {
  switch (s) {
    case 'failed':
      return 3;
    case 'passed':
      return 2;
    case 'skipped':
      return 1;
    default:
      return 0;
  }
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

function isContainerRecord(record: Record<string, unknown>): boolean {
  return (
    Array.isArray(record.testcases) ||
    Array.isArray(record.tests) ||
    Array.isArray(record.testsuites)
  );
}

function pushCase(
  out: ParsedCaseResult[],
  id: string,
  statusRaw: unknown,
  platform?: string
): void {
  if (!id || typeof statusRaw === 'undefined') {
    return;
  }
  const { suite, caseName } = splitSuiteCase(id);
  if (!caseName) {
    return;
  }
  out.push({
    suite,
    caseName,
    status: mapTwisterStatus(String(statusRaw)),
    id,
    platform,
  });
}

function collectFromObject(
  obj: unknown,
  out: ParsedCaseResult[],
  platform?: string
): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectFromObject(item, out, platform);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  const plat =
    typeof record.platform === 'string' ? record.platform : platform;

  // Twister leaf testcases prefer `identifier`; keep `name` for legacy leaves.
  // Skip container records that also have name+status (testsuites).
  if (!isContainerRecord(record)) {
    if (typeof record.identifier === 'string') {
      pushCase(out, record.identifier, record.status, plat);
    } else if (typeof record.name === 'string' && record.status !== undefined) {
      pushCase(out, record.name, record.status, plat);
    }
  }

  for (const key of ['testcases', 'tests', 'testsuites', 'results']) {
    if (record[key] !== undefined) {
      collectFromObject(record[key], out, plat);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'status' in (value as object) &&
      key.includes('.') &&
      !isContainerRecord(value as Record<string, unknown>)
    ) {
      pushCase(
        out,
        key,
        (value as Record<string, unknown>).status,
        plat
      );
    }
  }
}

function mergeCasePreference(
  existing: ParsedCaseResult | undefined,
  incoming: ParsedCaseResult
): ParsedCaseResult {
  if (!existing) {
    return incoming;
  }
  // Failures win over later passes across platforms/scenarios.
  if (statusRank(incoming.status) > statusRank(existing.status)) {
    return incoming;
  }
  if (
    statusRank(incoming.status) === statusRank(existing.status) &&
    incoming.platform &&
    existing.platform &&
    incoming.platform !== existing.platform
  ) {
    // Keep existing failure/pass; still prefer failed already handled
    return existing;
  }
  return existing;
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

  const map = new Map<string, ParsedCaseResult>();
  for (const r of out) {
    if (!r.caseName) {
      continue;
    }
    const key = `${r.suite}::${r.caseName}`;
    map.set(key, mergeCasePreference(map.get(key), r));
  }
  return [...map.values()];
}

/**
 * Heuristic parse of twister / ztest console output.
 */
export function parseTwisterLog(log: string): ParsedCaseResult[] {
  const results: ParsedCaseResult[] = [];
  const lines = log.split(/\r?\n/);

  const passFail =
    /\b(PASS|FAIL|SKIP(?:PED)?)\b(?:\s*[-:]\s*|\s+)([A-Za-z0-9_.]+)/i;
  const ztestQualified =
    /\bSTART\s+-\s+([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/i;
  const ztestBare = /\bSTART\s+-\s+([A-Za-z0-9_]+)\s*$/i;
  const suiteAnnounce =
    /\bRunning\s+TESTSUITE\s+([A-Za-z0-9_]+)/i;

  let lastSuite = '';
  let lastCase = '';

  for (const line of lines) {
    const suiteLine = suiteAnnounce.exec(line);
    if (suiteLine) {
      lastSuite = suiteLine[1];
    }

    const qualified = ztestQualified.exec(line);
    if (qualified) {
      lastSuite = qualified[1];
      lastCase = qualified[2];
    } else {
      const bare = ztestBare.exec(line);
      if (bare) {
        lastCase = bare[1];
      }
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
    } else {
      suite = lastSuite;
    }
    results.push({ suite, caseName, status });
  }

  const map = new Map<string, ParsedCaseResult>();
  for (const r of results) {
    const key = `${r.suite}::${r.caseName}`;
    map.set(key, mergeCasePreference(map.get(key), r));
  }
  return [...map.values()];
}

export async function loadTwisterReport(
  reportPath: string,
  options?: { newerThanMs?: number }
): Promise<ParsedCaseResult[]> {
  try {
    if (options?.newerThanMs !== undefined) {
      const stat = await fs.stat(reportPath);
      if (stat.mtimeMs < options.newerThanMs) {
        return [];
      }
    }
    const content = await fs.readFile(reportPath, 'utf8');
    return parseTwisterJson(content);
  } catch {
    return [];
  }
}

export function mergeResults(
  fromJson: ParsedCaseResult[],
  fromLog: ParsedCaseResult[],
  filter?: { suite?: string; caseName?: string }
): ParsedCaseResult[] {
  const map = new Map<string, ParsedCaseResult>();
  // Prefer JSON when fresh; log fills gaps. Failures still win via mergeCasePreference.
  for (const r of [...fromLog, ...fromJson]) {
    let suite = r.suite;
    let caseName = r.caseName;
    if (!suite && filter?.suite) {
      suite = filter.suite;
    }
    const key = `${suite}::${caseName}`;
    map.set(key, mergeCasePreference(map.get(key), { ...r, suite, caseName }));
  }
  return [...map.values()];
}
