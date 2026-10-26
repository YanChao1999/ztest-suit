import { EventEmitter } from 'events';

export type TestStatus = 'notRun' | 'running' | 'passed' | 'failed' | 'skipped';

export interface TestCase {
  suite: string;
  name: string;
  file: string;
  line: number;
  status: TestStatus;
}

export interface TestSuite {
  name: string;
  file?: string;
  line?: number;
  cases: TestCase[];
  status: TestStatus;
}

export interface TestLocation {
  file: string;
  line: number;
}

export class TestModel extends EventEmitter {
  private suites = new Map<string, TestSuite>();

  clear(): void {
    this.suites.clear();
    this.emit('changed');
  }

  getSuites(): TestSuite[] {
    return [...this.suites.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  getSuite(name: string): TestSuite | undefined {
    return this.suites.get(name);
  }

  ensureSuite(name: string, location?: TestLocation): TestSuite {
    let suite = this.suites.get(name);
    if (!suite) {
      suite = {
        name,
        cases: [],
        status: 'notRun',
        file: location?.file,
        line: location?.line,
      };
      this.suites.set(name, suite);
    } else if (location) {
      suite.file = location.file;
      suite.line = location.line;
    }
    return suite;
  }

  upsertCase(testCase: Omit<TestCase, 'status'> & { status?: TestStatus }): TestCase {
    const suite = this.ensureSuite(testCase.suite);
    const existing = suite.cases.find((c) => c.name === testCase.name);
    if (existing) {
      existing.file = testCase.file;
      existing.line = testCase.line;
      if (testCase.status) {
        existing.status = testCase.status;
      }
      return existing;
    }
    const created: TestCase = {
      suite: testCase.suite,
      name: testCase.name,
      file: testCase.file,
      line: testCase.line,
      status: testCase.status ?? 'notRun',
    };
    suite.cases.push(created);
    suite.cases.sort((a, b) => a.name.localeCompare(b.name));
    return created;
  }

  setAllStatus(status: TestStatus, filter?: { suite?: string; caseName?: string }): void {
    for (const suite of this.suites.values()) {
      if (filter?.suite && suite.name !== filter.suite) {
        continue;
      }
      if (!filter?.caseName) {
        suite.status = status;
      }
      for (const c of suite.cases) {
        if (filter?.caseName && c.name !== filter.caseName) {
          continue;
        }
        c.status = status;
      }
      this.refreshSuiteStatus(suite);
    }
    this.emit('changed');
  }

  applyCaseStatus(suiteName: string, caseName: string, status: TestStatus): void {
    const suite = this.suites.get(suiteName);
    if (!suite) {
      return;
    }
    const testCase = suite.cases.find((c) => c.name === caseName);
    if (!testCase) {
      return;
    }
    testCase.status = status;
    this.refreshSuiteStatus(suite);
    this.emit('changed');
  }

  applyResults(
    results: Array<{ suite: string; caseName: string; status: TestStatus }>
  ): void {
    for (const r of results) {
      const suite = this.suites.get(r.suite);
      if (!suite) {
        continue;
      }
      const testCase = suite.cases.find((c) => c.name === r.caseName);
      if (testCase) {
        testCase.status = r.status;
      }
    }
    for (const suite of this.suites.values()) {
      this.refreshSuiteStatus(suite);
    }
    this.emit('changed');
  }

  getFailedCases(): TestCase[] {
    const failed: TestCase[] = [];
    for (const suite of this.suites.values()) {
      for (const c of suite.cases) {
        if (c.status === 'failed') {
          failed.push(c);
        }
      }
    }
    return failed.sort((a, b) =>
      `${a.suite}.${a.name}`.localeCompare(`${b.suite}.${b.name}`)
    );
  }

  getSummary(): { passed: number; failed: number; skipped: number; notRun: number; running: number } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let notRun = 0;
    let running = 0;
    for (const suite of this.suites.values()) {
      for (const c of suite.cases) {
        switch (c.status) {
          case 'passed':
            passed++;
            break;
          case 'failed':
            failed++;
            break;
          case 'skipped':
            skipped++;
            break;
          case 'running':
            running++;
            break;
          default:
            notRun++;
        }
      }
    }
    return { passed, failed, skipped, notRun, running };
  }

  notifyChanged(): void {
    this.emit('changed');
  }

  private refreshSuiteStatus(suite: TestSuite): void {
    if (suite.cases.length === 0) {
      suite.status = 'notRun';
      return;
    }
    if (suite.cases.some((c) => c.status === 'running')) {
      suite.status = 'running';
      return;
    }
    if (suite.cases.some((c) => c.status === 'failed')) {
      suite.status = 'failed';
      return;
    }
    if (suite.cases.every((c) => c.status === 'passed' || c.status === 'skipped')) {
      suite.status = suite.cases.some((c) => c.status === 'passed')
        ? 'passed'
        : 'skipped';
      return;
    }
    if (suite.cases.every((c) => c.status === 'notRun')) {
      suite.status = 'notRun';
      return;
    }
    suite.status = 'notRun';
  }
}
