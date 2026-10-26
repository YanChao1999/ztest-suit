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
  it('reads identifier and skips container records', () => {
    const json = JSON.stringify({
      testsuites: [
        {
          name: 'sample',
          status: 'failed',
          testcases: [
            {
              identifier: 'math_suite.test_add',
              name: 'math_suite.test_add',
              status: 'passed',
            },
            {
              identifier: 'math_suite.test_sub',
              name: 'math_suite.test_sub',
              status: 'failed',
            },
          ],
        },
      ],
    });
    const results = parseTwisterJson(json);
    assert.equal(results.length, 2);
    assert.ok(!results.some((r) => r.caseName === 'sample'));
    const add = results.find((r) => r.caseName === 'test_add');
    assert.equal(add?.suite, 'math_suite');
    assert.equal(add?.status, 'passed');
  });

  it('preserves failures across duplicate matrix instances', () => {
    const json = JSON.stringify({
      testsuites: [
        {
          platform: 'native_sim',
          testcases: [
            { identifier: 's.c', name: 's.c', status: 'passed' },
          ],
        },
        {
          platform: 'qemu_x86',
          testcases: [
            { identifier: 's.c', name: 's.c', status: 'failed' },
          ],
        },
      ],
    });
    const results = parseTwisterJson(json);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'failed');
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

  it('parses bare names after TESTSUITE announcements', () => {
    const log = [
      'Running TESTSUITE string_suite',
      'START - test_fail_demo',
      'FAIL - test_fail_demo',
    ].join('\n');
    const results = parseTwisterLog(log);
    const hit = results.find((r) => r.caseName === 'test_fail_demo');
    assert.equal(hit?.suite, 'string_suite');
    assert.equal(hit?.status, 'failed');
  });
});
