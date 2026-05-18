const assert = require('node:assert/strict');
const test = require('node:test');

const { buildEvent, isFailure, source } = require('../hook');

test('maps Codex prompts and tools to UniPet states', () => {
  assert.deepEqual(buildEvent('user_prompt_submit', {}, {}), {
    source: 'codex',
    state: 'running',
    message: 'Codex is thinking',
    action: 'update',
    ttlMs: 120000,
  });

  const tool = buildEvent('pre_tool_use', { tool_name: 'Bash' }, {});
  assert.equal(tool.state, 'running');
  assert.equal(tool.message, 'Running Bash');
});

test('maps Codex tool failures and final replies', () => {
  assert.equal(isFailure({ tool_response: { exit_code: 1 } }), true);
  assert.equal(isFailure({ tool_response: { success: true } }), false);

  const failed = buildEvent('post_tool_use', { tool_name: 'Bash', tool_response: { exit_code: 1 } }, {});
  assert.equal(failed.state, 'failed');
  assert.equal(failed.message, 'Bash failed');

  const review = buildEvent('stop', {
    last_assistant_message: '\u4efb\u52a1\u5df2\u5b8c\u6210\uff0c\u8bf7\u68c0\u67e5\u4fee\u6539\u7ed3\u679c\u662f\u5426\u7b26\u5408\u9884\u671f',
  }, {});
  assert.equal(review.state, 'review');
  assert.ok(Array.from(review.message).length <= 20);
});

test('supports optional Codex per-session source ids', () => {
  assert.equal(source({ session_id: 'abc 123' }, { UNIPET_CODEX_PER_SESSION: '1' }), 'codex-abc-123');
  assert.equal(source({ session_id: 'abc' }, { UNIPET_CODEX_SOURCE: 'custom-codex' }), 'custom-codex');
});
