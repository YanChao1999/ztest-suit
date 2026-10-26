import { TestCase } from '../model/testModel';

export interface LastRunEvidence {
  command: string;
  cwd: string;
  exitCode: number | null;
  logTail: string;
  reportPath?: string;
}

export interface AutoPilotPromptInput {
  failed: TestCase[];
  evidence?: LastRunEvidence;
  workspaceFolder?: string;
  snippets: Array<{ file: string; line: number; excerpt: string }>;
}

const MAX_LOG_CHARS = 3500;

export function buildAutoPilotPrompt(input: AutoPilotPromptInput): string {
  const lines: string[] = [];
  lines.push(
    'You are fixing Zephyr ZTEST failures for the ZTEST Suit extension workflow.'
  );
  lines.push('');
  lines.push('## Rules (evidence first)');
  lines.push(
    '1. Use the evidence below before changing code. Do not guess when logs/locations contradict assumptions.'
  );
  lines.push(
    '2. Decide whether the bug is in **production/code under test**, the **test itself**, or the **environment/command wrapper** — state which and why, citing evidence.'
  );
  lines.push(
    '3. Prefer the smallest correct fix. Re-run or explain how to re-run the affected suite/case after the fix.'
  );
  lines.push(
    '4. If evidence is insufficient, say what to collect next instead of inventing a fix.'
  );
  lines.push('');
  lines.push('## Failed cases');
  if (input.failed.length === 0) {
    lines.push('(none)');
  } else {
    for (const c of input.failed) {
      lines.push(
        `- \`${c.suite}.${c.name}\` @ \`${c.file}:${c.line}\` (status=${c.status})`
      );
    }
  }

  if (input.workspaceFolder) {
    lines.push('');
    lines.push(`## Workspace`);
    lines.push(input.workspaceFolder);
  }

  if (input.evidence) {
    lines.push('');
    lines.push('## Run evidence');
    lines.push(`- command: \`${input.evidence.command}\``);
    lines.push(`- cwd: \`${input.evidence.cwd}\``);
    lines.push(`- exitCode: ${input.evidence.exitCode ?? 'null'}`);
    if (input.evidence.reportPath) {
      lines.push(`- report: \`${input.evidence.reportPath}\``);
    }
    const log = input.evidence.logTail.slice(-MAX_LOG_CHARS);
    lines.push('');
    lines.push('### Log tail');
    lines.push('```text');
    lines.push(log.trimEnd() || '(empty)');
    lines.push('```');
  }

  if (input.snippets.length > 0) {
    lines.push('');
    lines.push('## Source excerpts (test / nearby code)');
    for (const s of input.snippets) {
      lines.push('');
      lines.push(`### ${s.file}:${s.line}`);
      lines.push('```c');
      lines.push(s.excerpt);
      lines.push('```');
    }
  }

  lines.push('');
  lines.push('## Task');
  lines.push(
    'Investigate the failures with the evidence above, then implement the fix (test and/or code) and summarize what changed.'
  );
  return lines.join('\n');
}
