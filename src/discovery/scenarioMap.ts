import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Parse scenario ids from a Zephyr `testcase.yaml` (`tests:` mapping keys).
 * Minimal YAML subset — no dependency on a YAML library.
 */
export function parseTestcaseYamlScenarios(content: string): string[] {
  const scenarios: string[] = [];
  let inTests = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^tests:\s*(?:#.*)?$/.test(line)) {
      inTests = true;
      continue;
    }
    if (!inTests) {
      continue;
    }
    if (/^\S/.test(line)) {
      break;
    }
    // Only direct children of `tests:` (2-space / 1-tab indent), not nested keys.
    const m = /^(?: {2}|\t)([A-Za-z0-9_./-]+):\s*(?:#.*)?$/.exec(line);
    if (m) {
      scenarios.push(m[1]);
    }
  }
  return scenarios;
}

/**
 * Pick the best scenario id for a ZTEST_SUITE symbol given scenarios from the
 * owning testcase.yaml directory.
 */
export function pickScenarioForSuite(
  suiteName: string,
  scenarios: string[]
): string | undefined {
  if (scenarios.length === 0) {
    return undefined;
  }
  if (scenarios.length === 1) {
    return scenarios[0];
  }

  const stem = suiteName
    .replace(/_suite$/i, '')
    .replace(/_tests?$/i, '')
    .toLowerCase();

  const exact = scenarios.find(
    (s) => s === suiteName || s.endsWith(`.${suiteName}`)
  );
  if (exact) {
    return exact;
  }

  const byStem = scenarios.find((s) => {
    const last = s.split('.').pop()?.toLowerCase() ?? s.toLowerCase();
    return last === stem || last.includes(stem) || stem.includes(last);
  });
  if (byStem) {
    return byStem;
  }

  return scenarios[0];
}

/** Walk up from a source file looking for testcase.yaml (Zephyr test dir). */
export async function findTestcaseYaml(
  startFile: string
): Promise<string | undefined> {
  let dir = path.dirname(startFile);
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'testcase.yaml');
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

const yamlCache = new Map<string, string[]>();

export async function resolveScenarioForFile(
  suiteName: string,
  sourceFile: string | undefined
): Promise<string | undefined> {
  if (!sourceFile) {
    return undefined;
  }
  const yamlPath = await findTestcaseYaml(sourceFile);
  if (!yamlPath) {
    return undefined;
  }
  let scenarios = yamlCache.get(yamlPath);
  if (!scenarios) {
    try {
      const content = await fs.readFile(yamlPath, 'utf8');
      scenarios = parseTestcaseYamlScenarios(content);
    } catch {
      scenarios = [];
    }
    yamlCache.set(yamlPath, scenarios);
  }
  return pickScenarioForSuite(suiteName, scenarios);
}

export function clearScenarioCache(): void {
  yamlCache.clear();
}
