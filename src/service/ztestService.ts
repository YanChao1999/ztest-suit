import * as path from 'path';
import { ZtestSettings, resolveReportPath } from '../config/types';
import { walkSourceFiles } from '../discovery/fileWalk';
import { scopeScanGlobsToTestPath } from '../discovery/scanScope';
import {
  applyScanToModel,
  scanFiles,
  ScanResult,
} from '../discovery/ztestScanner';
import { TestModel } from '../model/testModel';
import { buildRunCommand } from '../run/commandBuilder';
import {
  loadTwisterReport,
  mergeResults,
  parseTwisterLog,
  ParsedCaseResult,
} from '../run/resultParser';
import { TwisterRunner } from '../run/twisterRunner';

export interface ListedCase {
  suite: string;
  name: string;
  file: string;
  line: number;
  status: string;
}

export interface ListedSuite {
  name: string;
  scenario?: string;
  file?: string;
  line?: number;
  cases: ListedCase[];
}

export interface RunFilter {
  suite?: string;
  caseName?: string;
  scenario?: string;
}

export interface RunServiceResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  cancelled: boolean;
  results: ParsedCaseResult[];
  stdoutTail: string;
  reportPath: string;
}

export class ZtestService {
  readonly model = new TestModel();
  private readonly runner = new TwisterRunner();

  constructor(
    readonly workspaceFolder: string,
    readonly settings: ZtestSettings
  ) {}

  async discover(): Promise<{ suites: ListedSuite[]; filesScanned: number }> {
    const includeGlobs = scopeScanGlobsToTestPath(
      this.settings.testPath,
      this.settings.scanGlobs
    );
    const files = await walkSourceFiles(
      this.workspaceFolder,
      includeGlobs,
      this.settings.scanExclude
    );
    const scan: ScanResult = await scanFiles(files);
    this.model.clear();
    applyScanToModel(this.model, scan);
    this.model.notifyChanged();
    return {
      suites: this.listSuites(),
      filesScanned: files.length,
    };
  }

  listSuites(): ListedSuite[] {
    return this.model.getSuites().map((s) => ({
      name: s.name,
      scenario: s.scenario,
      file: s.file,
      line: s.line,
      cases: s.cases.map((c) => ({
        suite: c.suite,
        name: c.name,
        file: c.file,
        line: c.line,
        status: c.status,
      })),
    }));
  }

  findCase(
    suite: string,
    caseName: string
  ): ListedCase | undefined {
    const s = this.model.getSuite(suite);
    const c = s?.cases.find((x) => x.name === caseName);
    if (!c) {
      return undefined;
    }
    return {
      suite: c.suite,
      name: c.name,
      file: c.file,
      line: c.line,
      status: c.status,
    };
  }

  resolveScenario(filter: RunFilter): string | undefined {
    if (filter.scenario) {
      return filter.scenario;
    }
    if (filter.suite) {
      return this.model.getSuite(filter.suite)?.scenario ?? filter.suite;
    }
    return undefined;
  }

  previewCommand(filter: RunFilter = {}): string {
    const extraArgsTemplate = filter.caseName
      ? this.settings.runCaseArgs
      : filter.suite || filter.scenario
        ? this.settings.runSuiteArgs
        : '';
    return buildRunCommand({
      runCommandTemplate: this.settings.runCommand,
      extraArgsTemplate,
      prefix: this.settings.commandPrefix,
      workspaceFolder: this.workspaceFolder,
      testPath: this.settings.testPath,
      platform: this.settings.platform,
      suite: filter.suite,
      caseName: filter.caseName,
      scenario: this.resolveScenario(filter),
    });
  }

  async run(filter: RunFilter = {}): Promise<RunServiceResult> {
    if (this.model.getSuites().length === 0) {
      await this.discover();
    }

    const command = this.previewCommand(filter);
    this.model.setAllStatus('running', {
      suite: filter.suite,
      caseName: filter.caseName,
    });

    const reportPath = resolveReportPath(this.settings);
    const runStartedAt = Date.now();

    const result = await this.runner.run({
      command,
      cwd: this.settings.cwd,
    });

    // Only accept reports rewritten during/after this run (avoid stale passes).
    const fromJson = await loadTwisterReport(reportPath, {
      newerThanMs: runStartedAt - 1000,
    });
    const fromLog = parseTwisterLog(result.stdout + '\n' + result.stderr);
    let merged = mergeResults(fromJson, fromLog, filter);

    if (filter.caseName) {
      merged = merged.filter(
        (r) =>
          r.caseName === filter.caseName &&
          (!r.suite || !filter.suite || r.suite === filter.suite)
      );
    } else if (filter.suite) {
      merged = merged.filter((r) => !r.suite || r.suite === filter.suite);
    }

    for (const s of this.model.getSuites()) {
      for (const c of s.cases) {
        if (c.status === 'running') {
          c.status = 'notRun';
        }
      }
    }

    if (merged.length === 0) {
      const status = result.exitCode === 0 ? 'passed' : 'failed';
      this.model.setAllStatus(status, filter);
    } else {
      this.model.applyResults(merged);
    }

    const tail = (result.stdout + result.stderr).slice(-4000);
    return {
      command,
      cwd: this.settings.cwd,
      exitCode: result.exitCode,
      cancelled: result.cancelled,
      results: merged,
      stdoutTail: tail,
      reportPath: path.isAbsolute(reportPath)
        ? reportPath
        : path.join(this.settings.cwd, reportPath),
    };
  }

  getSummary() {
    return this.model.getSummary();
  }

  getEffectiveConfig() {
    return {
      workspaceFolder: this.workspaceFolder,
      settings: this.settings,
      previewRunAll: this.previewCommand({}),
    };
  }
}
