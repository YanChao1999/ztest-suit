import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAutoPilotPrompt } from './autoPilotPrompt';

describe('buildAutoPilotPrompt', () => {
  it('puts evidence-first rules and failed case locations', () => {
    const prompt = buildAutoPilotPrompt({
      failed: [
        {
          suite: 'string_suite',
          name: 'test_fail_demo',
          file: '/ws/tests/string/test_string.c',
          line: 18,
          status: 'failed',
        },
      ],
      evidence: {
        command: './.start_docker.sh -b native_sim west twister -T tests',
        cwd: '/ws',
        exitCode: 1,
        logTail: 'FAIL - string_suite.test_fail_demo\n',
        reportPath: '/ws/twister-out/twister.json',
      },
      workspaceFolder: '/ws',
      snippets: [
        {
          file: '/ws/tests/string/test_string.c',
          line: 18,
          excerpt: '  zassert_true(false, "demo failure");',
        },
      ],
    });

    assert.match(prompt, /evidence first/i);
    assert.match(prompt, /string_suite\.test_fail_demo/);
    assert.match(prompt, /test_string\.c:18/);
    assert.match(prompt, /FAIL - string_suite\.test_fail_demo/);
    assert.match(prompt, /production\/code under test/);
  });
});
