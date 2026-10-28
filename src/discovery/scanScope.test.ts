import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scopeScanGlobsToTestPath } from './scanScope';

describe('scopeScanGlobsToTestPath', () => {
  it('prefixes workspace-wide globs with testPath', () => {
    assert.deepEqual(scopeScanGlobsToTestPath('tests', ['**/*.{c,h}']), [
      'tests/**/*.{c,h}',
    ]);
  });

  it('does not double-prefix globs already under testPath', () => {
    assert.deepEqual(
      scopeScanGlobsToTestPath('tests', ['tests/**/*.{c,h}']),
      ['tests/**/*.{c,h}']
    );
  });

  it('supports nested testPath', () => {
    assert.deepEqual(
      scopeScanGlobsToTestPath('tests/bluetooth', ['**/*.c']),
      ['tests/bluetooth/**/*.c']
    );
  });

  it('leaves globs unchanged when testPath is workspace root', () => {
    assert.deepEqual(scopeScanGlobsToTestPath('.', ['**/*.c']), ['**/*.c']);
  });
});
