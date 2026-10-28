#!/usr/bin/env node
/**
 * ZTEST Suit MCP server (stdio).
 * Tools: ztest_list, ztest_run, ztest_status, ztest_locate, ztest_config
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import {
  loadWorkspaceSettings,
  resolveWorkspaceRoot,
} from '../config/loadWorkspaceSettings';
import { resolveReportPath } from '../config/types';
import { loadTwisterReport } from '../run/resultParser';
import { ZtestService } from '../service/ztestService';

type Json = Record<string, unknown>;

/** Serialize runs that share the same workspace / twister-out directory. */
const runQueues = new Map<string, Promise<unknown>>();

function runLockKey(svc: ZtestService): string {
  return path.resolve(resolveReportPath(svc.settings));
}

async function withRunLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = runQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prev.then(
    () => gate,
    () => gate
  );
  runQueues.set(key, tail);
  await prev.then(
    () => undefined,
    () => undefined
  );
  try {
    return await fn();
  } finally {
    release();
    if (runQueues.get(key) === tail) {
      runQueues.delete(key);
    }
  }
}

function createService(workspace?: unknown): ZtestService {
  const root = resolveWorkspaceRoot(
    typeof workspace === 'string' ? workspace : undefined
  );
  const settings = loadWorkspaceSettings(root);
  return new ZtestService(root, settings);
}

function ok(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(message: string) {
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
  };
}

const TOOLS = [
  {
    name: 'ztest_list',
    description:
      'Discover ZTEST suites/cases by scanning source macros (ZTEST_SUITE / ZTEST / ZTEST_F / …).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: {
          type: 'string',
          description:
            'West/Zephyr workspace root. Defaults to ZTEST_WORKSPACE or cwd.',
        },
      },
    },
  },
  {
    name: 'ztest_run',
    description:
      'Run ZTEST via the configured command wrapper (e.g. .start_docker.sh … west twister). Optionally filter by suite or case.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace root override.' },
        suite: { type: 'string', description: 'Suite name filter.' },
        caseName: {
          type: 'string',
          description:
            'Case name filter (MVP runs suite args then matches results).',
        },
        dryRun: {
          type: 'boolean',
          description:
            'If true, only return the expanded command without running.',
        },
      },
    },
  },
  {
    name: 'ztest_status',
    description:
      'Return summary and suite/case statuses (discovers first if needed). Reads twister.json when present.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string' },
      },
    },
  },
  {
    name: 'ztest_locate',
    description:
      'Locate a ZTEST case (or suite) source file and line for navigation.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string' },
        suite: { type: 'string', description: 'Suite name.' },
        caseName: {
          type: 'string',
          description: 'Case name; omit to locate the suite definition.',
        },
      },
      required: ['suite'],
    },
  },
  {
    name: 'ztest_config',
    description:
      'Show effective ZTEST Suit settings and the expanded Run All command.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string' },
      },
    },
  },
] as const;

async function handleTool(name: string, args: Json) {
  switch (name) {
    case 'ztest_list': {
      const svc = createService(args.workspace);
      const result = await svc.discover();
      return ok({
        workspace: svc.workspaceFolder,
        filesScanned: result.filesScanned,
        suiteCount: result.suites.length,
        caseCount: result.suites.reduce((n, s) => n + s.cases.length, 0),
        suites: result.suites,
      });
    }
    case 'ztest_run': {
      const svc = createService(args.workspace);
      const filter = {
        suite: typeof args.suite === 'string' ? args.suite : undefined,
        caseName:
          typeof args.caseName === 'string' ? args.caseName : undefined,
      };
      if (args.dryRun === true) {
        if (svc.listSuites().length === 0) {
          await svc.discover();
        }
        return ok({
          workspace: svc.workspaceFolder,
          command: svc.previewCommand(filter),
          cwd: svc.settings.cwd,
          dryRun: true,
        });
      }
      return withRunLock(runLockKey(svc), async () => {
        const result = await svc.run(filter);
        return ok({
          workspace: svc.workspaceFolder,
          ...result,
          summary: svc.getSummary(),
          suites: svc.listSuites(),
        });
      });
    }
    case 'ztest_status': {
      const svc = createService(args.workspace);
      if (svc.listSuites().length === 0) {
        await svc.discover();
      }
      const reportPath = resolveReportPath(svc.settings);
      const report = await loadTwisterReport(reportPath);
      if (report.length > 0) {
        svc.model.applyResults(report);
      }
      return ok({
        workspace: svc.workspaceFolder,
        reportPath,
        summary: svc.getSummary(),
        suites: svc.listSuites(),
      });
    }
    case 'ztest_locate': {
      if (typeof args.suite !== 'string' || !args.suite) {
        return fail('suite is required');
      }
      const svc = createService(args.workspace);
      await svc.discover();
      if (typeof args.caseName === 'string' && args.caseName) {
        const c = svc.findCase(args.suite, args.caseName);
        if (!c) {
          return fail(`Case not found: ${args.suite}.${args.caseName}`);
        }
        return ok(c);
      }
      const s = svc.listSuites().find((x) => x.name === args.suite);
      if (!s) {
        return fail(`Suite not found: ${args.suite}`);
      }
      return ok({
        suite: s.name,
        scenario: s.scenario,
        file: s.file,
        line: s.line,
        caseCount: s.cases.length,
      });
    }
    case 'ztest_config': {
      const svc = createService(args.workspace);
      return ok(svc.getEffectiveConfig());
    }
    default:
      return fail(`Unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const server = new Server(
    { name: 'ztest-suit', version: '0.0.2' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Json;
    try {
      return await handleTool(request.params.name, args);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ztest-suit MCP server running on stdio');
}

main().catch((err) => {
  console.error('ztest-suit MCP failed:', err);
  process.exit(1);
});
