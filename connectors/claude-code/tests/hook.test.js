const assert = require('node:assert/strict');
const test = require('node:test');

const { buildEvent, source } = require('../hook');

test('maps Claude Code lifecycle events to UniPet states', () => {
  assert.equal(buildEvent('session_start', {}, {}).state, 'idle');
  assert.equal(buildEvent('user_prompt_submit', {}, {}).state, 'running');
  assert.equal(buildEvent('notification', { message: 'Claude needs approval' }, {}).state, 'waiting');
  assert.equal(buildEvent('session_end', {}, {}).action, 'remove');
});

test('maps Claude Code tools and final replies', () => {
  const running = buildEvent('pre_tool_use', { tool_name: 'Read' }, {});
  assert.equal(running.message, 'Running Read');

  const failed = buildEvent('post_tool_use', { tool_name: 'Bash', tool_response: { is_error: true } }, {});
  assert.equal(failed.state, 'failed');
  assert.equal(failed.ttl, 20000);

  const finished = buildEvent('post_tool_use', { tool_name: 'Read', tool_response: { success: true } }, {});
  assert.equal(finished.message, 'Finished Read');
  assert.equal(finished.ttl, 6000);

  const review = buildEvent('stop', {
    last_assistant_message: '\u4fee\u590d\u5b8c\u6210\uff0c\u6240\u6709\u6d4b\u8bd5\u5df2\u901a\u8fc7\uff0c\u8bf7\u68c0\u67e5',
  }, {});
  assert.equal(review.state, 'review');
  assert.ok(Array.from(review.message).length <= 20);
  assert.equal(review.ttl, 12000);
});

test('supports optional Claude Code per-session source ids', () => {
  assert.equal(source({ session_id: 'abc 123' }, { UNIPET_CLAUDE_CODE_PER_SESSION: '1' }), 'claude-code-abc-123');
  assert.equal(source({ session_id: 'abc' }, { UNIPET_CLAUDE_CODE_SOURCE: 'custom-claude' }), 'custom-claude');
});
