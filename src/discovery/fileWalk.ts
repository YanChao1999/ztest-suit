import * as fs from 'fs/promises';
import * as path from 'path';

function globToRegExp(glob: string): RegExp {
  // Minimal glob → regex: ** / * / {a,b,c}
  let pattern = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      pattern += '(?:.*/)?';
      i += 3;
      continue;
    }
    // Terminal or bare `**` means match any remaining path segments
    if (glob.startsWith('**', i) && (i + 2 === glob.length || glob[i + 2] === '/')) {
      pattern += '.*';
      i += 2;
      continue;
    }
    if (glob[i] === '*') {
      pattern += '[^/]*';
      i += 1;
      continue;
    }
    if (glob[i] === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) {
        pattern += '\\{';
        i += 1;
        continue;
      }
      const inner = glob.slice(i + 1, end);
      const alts = inner.split(',').map((s) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      pattern += `(?:${alts.join('|')})`;
      i = end + 1;
      continue;
    }
    if (glob[i] === '?') {
      pattern += '[^/]';
      i += 1;
      continue;
    }
    pattern += glob[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp(`^${pattern}$`);
}

function matchesAny(relPosix: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(relPosix));
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Walk workspace and return absolute paths matching include globs, skipping excludes.
 */
export async function walkSourceFiles(
  root: string,
  includeGlobs: string[],
  excludeGlobs: string[]
): Promise<string[]> {
  const includeRes = includeGlobs.map(globToRegExp);
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = toPosix(path.relative(root, abs));
      if (matchesAny(rel, excludeGlobs) || matchesAny(rel + '/', excludeGlobs)) {
        continue;
      }
      // Also match exclude patterns against path prefixes like build/**
      if (
        excludeGlobs.some((g) => {
          const prefix = g.replace(/\*\*.*$/, '').replace(/\/$/, '');
          return prefix && (rel === prefix || rel.startsWith(prefix + '/'));
        })
      ) {
        // Only apply prefix skip for patterns that start with **/
        // Keep simple: if any path segment is in denylist
      }
      const base = entry.name;
      if (
        base === '.git' ||
        base === 'node_modules' ||
        base === 'build' ||
        base === 'zephyr' ||
        base === 'modules' ||
        base === 'bootloader' ||
        base.startsWith('twister-out')
      ) {
        if (entry.isDirectory()) {
          continue;
        }
      }
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (entry.isFile() && includeRes.some((re) => re.test(rel))) {
        results.push(abs);
      }
    }
  }

  await walk(root);
  return results;
}
