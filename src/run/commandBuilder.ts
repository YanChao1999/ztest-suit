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

/** Collapse whitespace outside of quotes only. */
export function normalizeWhitespace(command: string): string {
  let out = '';
  let quote: '"' | "'" | null = null;
  let prevSpace = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      out += ch;
      if (ch === quote && command[i - 1] !== '\\') {
        quote = null;
      }
      prevSpace = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      prevSpace = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!prevSpace && out.length > 0) {
        out += ' ';
        prevSpace = true;
      }
      continue;
    }
    out += ch;
    prevSpace = false;
  }
  return out.trim();
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
  scenario?: string;
}): string {
  const scenario = options.scenario ?? options.suite;
  const extraArgs = expandCommand(options.extraArgsTemplate, {
    prefix: options.prefix,
    workspaceFolder: options.workspaceFolder,
    testPath: options.testPath,
    platform: options.platform,
    suite: options.suite,
    case: options.caseName,
    scenario,
  });

  return expandCommand(options.runCommandTemplate, {
    prefix: options.prefix,
    workspaceFolder: options.workspaceFolder,
    testPath: options.testPath,
    platform: options.platform,
    suite: options.suite,
    case: options.caseName,
    scenario,
    extraArgs,
  });
}

/**
 * Split a shell-ish command into argv for spawn without a shell when possible.
 * Supports adjacent forms like --output="build output".
 */
export function splitCommand(command: string): { cmd: string; args: string[] } {
  const tokens: string[] = [];
  let i = 0;
  const s = command.trim();

  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) {
      i++;
    }
    if (i >= s.length) {
      break;
    }

    let token = '';
    while (i < s.length && !/\s/.test(s[i])) {
      const ch = s[i];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < s.length && s[i] !== quote) {
          if (s[i] === '\\' && i + 1 < s.length) {
            token += s[i + 1];
            i += 2;
            continue;
          }
          token += s[i];
          i++;
        }
        if (i < s.length && s[i] === quote) {
          i++;
        }
        continue;
      }
      token += ch;
      i++;
    }
    if (token.length > 0 || tokens.length === 0) {
      tokens.push(token);
    }
  }

  if (tokens.length === 0) {
    return { cmd: '', args: [] };
  }
  return { cmd: tokens[0], args: tokens.slice(1) };
}
