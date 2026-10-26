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
  it('expands suite args into extraArgs', () => {
    const cmd = buildRunCommand({
      runCommandTemplate:
        '{prefix} west twister -T {testPath} --platform {platform} {extraArgs}',
      extraArgsTemplate: '-s {suite}',
      prefix: './.start_docker.sh -b XXX',
      workspaceFolder: '/ws',
      testPath: 'tests/foo',
      platform: 'native_sim',
      suite: 'my_suite',
    });
    assert.equal(
      cmd,
      './.start_docker.sh -b XXX west twister -T tests/foo --platform native_sim -s my_suite'
    );
  });
});

describe('normalizeWhitespace', () => {
  it('trims and collapses spaces', () => {
    assert.equal(normalizeWhitespace('  a   b  '), 'a b');
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
});
