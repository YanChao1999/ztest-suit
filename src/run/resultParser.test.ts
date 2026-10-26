import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTwisterJson,
  parseTwisterLog,
  splitSuiteCase,
} from './resultParser';

describe('splitSuiteCase', () => {
  it('takes last two segments', () => {
    assert.deepEqual(splitSuiteCase('tests.foo.math_suite.test_add'), {
      suite: 'math_suite',
      caseName: 'test_add',
    });
  });
});

describe('parseTwisterJson', () => {
  it('parses testcases array', () => {
    const json = JSON.stringify({
      testsuites: [
        {
          testcases: [
            { name: 'math_suite.test_add', status: 'passed' },
            { name: 'math_suite.test_sub', status: 'failed' },
          ],
        },
      ],
    });
    const results = parseTwisterJson(json);
    assert.equal(results.length, 2);
    const add = results.find((r) => r.caseName === 'test_add');
    assert.equal(add?.suite, 'math_suite');
    assert.equal(add?.status, 'passed');
  });
});

describe('parseTwisterLog', () => {
  it('parses PASS/FAIL lines', () => {
    const log = [
      'START - math_suite.test_add',
      'PASS - test_add',
      'START - math_suite.test_sub',
      'FAIL - math_suite.test_sub',
    ].join('\n');
    const results = parseTwisterLog(log);
    assert.ok(results.some((r) => r.caseName === 'test_add' && r.status === 'passed'));
    assert.ok(results.some((r) => r.caseName === 'test_sub' && r.status === 'failed'));
  });
});
