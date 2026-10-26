import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseZtestSource } from './ztestScanner';

describe('parseZtestSource', () => {
  it('finds suites and cases with line numbers', () => {
    const src = [
      '#include <zephyr/ztest.h>',
      '',
      'ZTEST_SUITE(math_suite, NULL, NULL, NULL, NULL, NULL);',
      '',
      'ZTEST(math_suite, test_add)',
      '{',
      '  zassert_equal(1 + 1, 2);',
      '}',
      '',
      'ZTEST_F(math_suite, test_fixture)',
      '{',
      '}',
      '',
      'ZTEST_USER(math_suite, test_user)',
      '{',
      '}',
    ].join('\n');

    const result = parseZtestSource(src, '/ws/tests/math/test_math.c');
    assert.equal(result.suites.length, 1);
    assert.equal(result.suites[0].name, 'math_suite');
    assert.equal(result.suites[0].line, 3);

    assert.equal(result.cases.length, 3);
    assert.deepEqual(
      result.cases.map((c) => c.name).sort(),
      ['test_add', 'test_fixture', 'test_user']
    );
    const add = result.cases.find((c) => c.name === 'test_add');
    assert.equal(add?.suite, 'math_suite');
    assert.equal(add?.line, 5);
  });

  it('ignores non-matching macros', () => {
    const src = 'void ZTEST_something_else(void) {}\n';
    const result = parseZtestSource(src, 'x.c');
    assert.equal(result.suites.length, 0);
    assert.equal(result.cases.length, 0);
  });

  it('ignores comments, literals, and #define macros', () => {
    const src = [
      '// ZTEST(math_suite, commented_out)',
      '/* ZTEST(math_suite, block_commented) */',
      'const char *s = "ZTEST(math_suite, in_string)";',
      '#define ZTEST(suite, fn) void fn(void)',
      '#define ZTEST_SUITE(name, a, b, c, d, e)',
      'ZTEST_SUITE(math_suite, NULL, NULL, NULL, NULL, NULL);',
      'ZTEST(math_suite, test_real)',
      '{',
      '}',
    ].join('\n');
    const result = parseZtestSource(src, 'x.c');
    assert.equal(result.suites.length, 1);
    assert.equal(result.suites[0].name, 'math_suite');
    assert.equal(result.cases.length, 1);
    assert.equal(result.cases[0].name, 'test_real');
  });
});
