import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { TestCase } from '../model/testModel';
import {
  buildAutoPilotPrompt,
  LastRunEvidence,
} from './autoPilotPrompt';

export type { LastRunEvidence };
export { buildAutoPilotPrompt };

const MAX_SNIPPET_LINES = 40;
const CONTEXT_RADIUS = 15;

export async function loadCaseSnippets(
  failed: TestCase[]
): Promise<Array<{ file: string; line: number; excerpt: string }>> {
  const snippets: Array<{ file: string; line: number; excerpt: string }> = [];
  const seen = new Set<string>();

  for (const c of failed.slice(0, 8)) {
    const key = `${c.file}:${c.line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    try {
      const raw = await fs.readFile(c.file, 'utf8');
      const all = raw.split(/\r?\n/);
      const idx = Math.max(0, c.line - 1);
      const start = Math.max(0, idx - CONTEXT_RADIUS);
      const end = Math.min(all.length, idx + CONTEXT_RADIUS + 1);
      const slice = all.slice(start, Math.min(end, start + MAX_SNIPPET_LINES));
      const numbered = slice.map(
        (line, i) => `${String(start + i + 1).padStart(4, ' ')}| ${line}`
      );
      snippets.push({
        file: c.file,
        line: c.line,
        excerpt: numbered.join('\n'),
      });
    } catch {
      snippets.push({
        file: c.file,
        line: c.line,
        excerpt: '(unable to read file)',
      });
    }
  }
  return snippets;
}

function isCursorHost(): boolean {
  return (
    vscode.env.appName.toLowerCase().includes('cursor') ||
    !!(
      vscode.extensions.getExtension('anysphere.cursor-always-local') ||
      vscode.extensions.getExtension('anysphere.cursorpyright')
    )
  );
}

/**
 * Open Copilot Chat / Cursor Agent with the auto-pilot fix prompt.
 * Falls back to clipboard if no chat command is available.
 */
export async function sendAutoPilotToCopilot(
  prompt: string,
  attachFiles: string[]
): Promise<void> {
  const uris = attachFiles.slice(0, 6).map((f) => vscode.Uri.file(f));

  if (isCursorHost()) {
    const cursorAttempts: Array<() => Thenable<unknown>> = [
      () =>
        vscode.commands.executeCommand('composer.createNew', {
          partialState: { text: prompt },
          autoSubmit: true,
          focusMainInputBox: true,
        }),
      () =>
        vscode.commands.executeCommand('workbench.action.chat.open', {
          query: prompt,
          mode: 'agent',
          attachFiles: uris,
        }),
    ];
    for (const attempt of cursorAttempts) {
      try {
        await attempt();
        return;
      } catch {
        // try next
      }
    }
  }

  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      query: prompt,
      mode: 'agent',
      attachFiles: uris,
    });
    return;
  } catch {
    // fall through
  }

  try {
    await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
    return;
  } catch {
    // fall through
  }

  await vscode.env.clipboard.writeText(prompt);
  vscode.window.showInformationMessage(
    'ZTEST auto-pilot-fix: prompt copied to clipboard (Chat/Copilot command unavailable). Paste into Copilot/Agent chat.'
  );
}

export async function runAutoPilotFix(options: {
  failed: TestCase[];
  evidence?: LastRunEvidence;
  workspaceFolder?: string;
}): Promise<void> {
  if (options.failed.length === 0) {
    vscode.window.showInformationMessage(
      'ZTEST auto-pilot-fix: no failed cases. Run tests first.'
    );
    return;
  }

  const snippets = await loadCaseSnippets(options.failed);
  const prompt = buildAutoPilotPrompt({
    failed: options.failed,
    evidence: options.evidence,
    workspaceFolder: options.workspaceFolder,
    snippets,
  });

  const attachFiles = [
    ...new Set(options.failed.map((c) => c.file).filter(Boolean)),
  ];
  await sendAutoPilotToCopilot(prompt, attachFiles);
}
