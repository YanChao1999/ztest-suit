import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { walkSourceFiles } from './fileWalk';

describe('walkSourceFiles', () => {
  it('finds c files and skips build/', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ztest-walk-'));
    try {
      await fs.mkdir(path.join(root, 'tests'), { recursive: true });
      await fs.mkdir(path.join(root, 'build'), { recursive: true });
      await fs.writeFile(path.join(root, 'tests', 'a.c'), 'x');
      await fs.writeFile(path.join(root, 'build', 'b.c'), 'y');
      const files = await walkSourceFiles(
        root,
        ['**/*.{c,h}'],
        ['**/build/**', '**/twister-out*/**']
      );
      assert.equal(files.length, 1);
      assert.ok(files[0].endsWith(path.join('tests', 'a.c')));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('treats terminal ** as recursive wildcard', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ztest-walk-'));
    try {
      await fs.mkdir(path.join(root, 'tests', 'math'), { recursive: true });
      await fs.writeFile(path.join(root, 'tests', 'math', 'a.c'), 'x');
      const files = await walkSourceFiles(root, ['tests/**'], []);
      assert.equal(files.length, 1);
      assert.ok(files[0].endsWith(path.join('tests', 'math', 'a.c')));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('skips workspace-root zephyr/ but not nested tests/ports/zephyr', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ztest-walk-'));
    try {
      await fs.mkdir(path.join(root, 'tests', 'ports', 'zephyr', 'http'), {
        recursive: true,
      });
      await fs.mkdir(path.join(root, 'zephyr', 'tests'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'tests', 'ports', 'zephyr', 'http', 't.c'),
        'x'
      );
      await fs.writeFile(path.join(root, 'zephyr', 'tests', 'kernel.c'), 'y');
      const files = await walkSourceFiles(
        root,
        ['tests/**/*.{c,h}'],
        ['zephyr/**']
      );
      assert.equal(files.length, 1);
      assert.ok(
        files[0].endsWith(path.join('tests', 'ports', 'zephyr', 'http', 't.c'))
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
