import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRunCommand,
  expandCommand,
  normalizeWhitespace,
  splitCommand,
} from './commandBuilder';

describe('expandCommand', () => {
  it('prepends docker wrapper prefix', () => {
    const cmd = expandCommand(
      '{prefix} west twister -T {testPath} {extraArgs}',
      {
        prefix: './.start_docker.sh -b native_sim',
        testPath: 'tests/bluetooth',
        platform: 'native_sim',
        extraArgs: '--platform native_sim',
      }
    );
    assert.equal(
      cmd,
      './.start_docker.sh -b native_sim west twister -T tests/bluetooth --platform native_sim'
    );
  });

  it('collapses empty prefix to bare west', () => {
    const cmd = expandCommand(
      '{prefix} west twister -T {testPath} {extraArgs}',
      {
        prefix: '',
        testPath: 'tests',
        extraArgs: '',
      }
    );
    assert.equal(cmd, 'west twister -T tests');
  });
});

describe('buildRunCommand', () => {
  it('expands scenario into extraArgs for -s filtering', () => {
    const cmd = buildRunCommand({
      runCommandTemplate:
        '{prefix} west twister -T {testPath} --platform {platform} {extraArgs}',
      extraArgsTemplate: '-s {scenario}',
      prefix: './.start_docker.sh -b XXX',
      workspaceFolder: '/ws',
      testPath: 'tests/foo',
      platform: 'native_sim',
      suite: 'math_suite',
      scenario: 'ztest_suit.math',
    });
    assert.equal(
      cmd,
      './.start_docker.sh -b XXX west twister -T tests/foo --platform native_sim -s ztest_suit.math'
    );
  });

  it('falls back scenario to suite when scenario omitted', () => {
    const cmd = buildRunCommand({
      runCommandTemplate: 'west twister {extraArgs}',
      extraArgsTemplate: '-s {scenario}',
      prefix: '',
      workspaceFolder: '/ws',
      testPath: 'tests',
      platform: '',
      suite: 'math_suite',
    });
    assert.equal(cmd, 'west twister -s math_suite');
  });

  it('auto-appends --platform when template omitted it', () => {
    const cmd = buildRunCommand({
      runCommandTemplate: '{prefix} west twister -T {testPath} {extraArgs}',
      extraArgsTemplate: '',
      prefix: '',
      workspaceFolder: '/ws',
      testPath: 'tests',
      platform: 'native_sim',
    });
    assert.equal(cmd, 'west twister -T tests --platform native_sim');
  });

  it('does not duplicate --platform when already present', () => {
    const cmd = buildRunCommand({
      runCommandTemplate:
        'west twister -T {testPath} --platform {platform} {extraArgs}',
      extraArgsTemplate: '',
      prefix: '',
      workspaceFolder: '/ws',
      testPath: 'tests',
      platform: 'qemu_x86',
    });
    assert.equal(cmd, 'west twister -T tests --platform qemu_x86');
  });
});

describe('normalizeWhitespace', () => {
  it('trims and collapses spaces outside quotes', () => {
    assert.equal(normalizeWhitespace('  a   b  '), 'a b');
  });

  it('preserves whitespace inside quoted arguments', () => {
    assert.equal(
      normalizeWhitespace('tool  "tests/a  b"  --flag'),
      'tool "tests/a  b" --flag'
    );
  });
});

describe('splitCommand', () => {
  it('splits quoted arguments', () => {
    const { cmd, args } = splitCommand(
      './.start_docker.sh -b "my board" west twister'
    );
    assert.equal(cmd, './.start_docker.sh');
    assert.deepEqual(args, ['-b', 'my board', 'west', 'twister']);
  });

  it('keeps adjacent quoted and unquoted segments as one argument', () => {
    const { cmd, args } = splitCommand('west twister --output="build output" -T tests');
    assert.equal(cmd, 'west');
    assert.deepEqual(args, [
      'twister',
      '--output=build output',
      '-T',
      'tests',
    ]);
  });
});
