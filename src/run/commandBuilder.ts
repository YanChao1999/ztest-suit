export interface CommandTemplateVars {
  prefix?: string;
  workspaceFolder?: string;
  testPath?: string;
  platform?: string;
  suite?: string;
  case?: string;
  scenario?: string;
  extraArgs?: string;
}

/**
 * Expand a command template.
 * Empty prefix collapses to a bare west command (no leading double spaces).
 */
export function expandCommand(
  template: string,
  vars: CommandTemplateVars
): string {
  const prefix = (vars.prefix ?? '').trim();
  const replacements: Record<string, string> = {
    prefix,
    workspaceFolder: vars.workspaceFolder ?? '',
    testPath: vars.testPath ?? '',
    platform: vars.platform ?? '',
    suite: vars.suite ?? '',
    case: vars.case ?? '',
    scenario: vars.scenario ?? vars.suite ?? '',
    extraArgs: vars.extraArgs ?? '',
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return normalizeWhitespace(result);
}

export function normalizeWhitespace(command: string): string {
  return command.replace(/\s+/g, ' ').trim();
}

export function buildRunCommand(options: {
  runCommandTemplate: string;
  extraArgsTemplate: string;
  prefix: string;
  workspaceFolder: string;
  testPath: string;
  platform: string;
  suite?: string;
  caseName?: string;
}): string {
  const extraArgs = expandCommand(options.extraArgsTemplate, {
    prefix: options.prefix,
    workspaceFolder: options.workspaceFolder,
    testPath: options.testPath,
    platform: options.platform,
    suite: options.suite,
    case: options.caseName,
    scenario: options.suite,
  });

  return expandCommand(options.runCommandTemplate, {
    prefix: options.prefix,
    workspaceFolder: options.workspaceFolder,
    testPath: options.testPath,
    platform: options.platform,
    suite: options.suite,
    case: options.caseName,
    scenario: options.suite,
    extraArgs,
  });
}

/**
 * Split a shell-ish command into argv for spawn without a shell when possible.
 * Keeps quoted segments intact.
 */
export function splitCommand(command: string): { cmd: string; args: string[] } {
  const tokens: string[] = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1].replace(/\\"/g, '"'));
    } else if (match[2] !== undefined) {
      tokens.push(match[2].replace(/\\'/g, "'"));
    } else if (match[3] !== undefined) {
      tokens.push(match[3]);
    }
  }

  if (tokens.length === 0) {
    return { cmd: '', args: [] };
  }
  return { cmd: tokens[0], args: tokens.slice(1) };
}
