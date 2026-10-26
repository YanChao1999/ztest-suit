import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stripJsonc } from './loadWorkspaceSettings';

describe('stripJsonc', () => {
  it('strips comments and trailing commas without touching strings', () => {
    const raw = `{
  // line comment
  "ztest.commandPrefix": "./wrap // not a comment",
  "ztest.testPath": "tests", /* block */
  "ztest.scanGlobs": ["**/*.{c,h}",],
}`;
    const parsed = JSON.parse(stripJsonc(raw)) as Record<string, unknown>;
    assert.equal(parsed['ztest.commandPrefix'], './wrap // not a comment');
    assert.equal(parsed['ztest.testPath'], 'tests');
    assert.deepEqual(parsed['ztest.scanGlobs'], ['**/*.{c,h}']);
  });
});
