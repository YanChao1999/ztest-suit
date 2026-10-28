/**
 * Discovery should follow `ztest.testPath` (same root as twister `-T`),
 * not the entire workspace — otherwise trees under `src/zephyr`, modules, etc.
 * get pulled in when globs are workspace-wide.
 */

/** Normalize testPath for glob prefixing (posix, no trailing slash). */
export function normalizeTestPath(testPath: string): string {
  return testPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

/**
 * Prefix include globs with `testPath` unless they already target that tree
 * (or the whole workspace via empty / `.` testPath).
 */
export function scopeScanGlobsToTestPath(
  testPath: string,
  globs: string[]
): string[] {
  const base = normalizeTestPath(testPath);
  if (!base || base === '.' || base === '*' || base === '**') {
    return [...globs];
  }

  return globs.map((raw) => {
    const glob = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (
      glob === base ||
      glob.startsWith(`${base}/`) ||
      glob.startsWith(`${base}/**`)
    ) {
      return glob;
    }
    // Already absolute or drive-rooted — leave alone
    if (glob.startsWith('/') || /^[A-Za-z]:\//.test(glob)) {
      return glob;
    }
    return `${base}/${glob}`;
  });
}
