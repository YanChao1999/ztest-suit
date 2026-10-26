import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseTestcaseYamlScenarios,
  pickScenarioForSuite,
} from './scenarioMap';

describe('parseTestcaseYamlScenarios', () => {
  it('reads tests: keys', () => {
    const yaml = [
      'tests:',
      '  ztest_suit.math:',
      '    tags:',
      '      - math',
      '  ztest_suit.string:',
      '    tags:',
      '      - string',
    ].join('\n');
    assert.deepEqual(parseTestcaseYamlScenarios(yaml), [
      'ztest_suit.math',
      'ztest_suit.string',
    ]);
  });
});

describe('pickScenarioForSuite', () => {
  it('maps math_suite to ztest_suit.math', () => {
    assert.equal(
      pickScenarioForSuite('math_suite', [
        'ztest_suit.math',
        'ztest_suit.string',
      ]),
      'ztest_suit.math'
    );
  });
});
