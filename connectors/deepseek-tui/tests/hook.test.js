const assert = require('node:assert/strict');
const test = require('node:test');
const { buildEvent, isToolFailure, source } = require('../hook');

test('maps DeepSeek-TUI message submission to running state', () => {
  const event = buildEvent('message_submit', {
    DEEPSEEK_SESSION_ID: 'sess_abc',
  });

  assert.equal(event.source, 'deepseek-tui');
  assert.equal(event.state, 'running');
  assert.equal(event.message, 'DeepSeek-TUI is thinking');
  assert.equal(event.ttl, 120000);
});

test('supports one UniPet source per DeepSeek-TUI session', () => {
  assert.equal(source({
    UNIPET_DEEPSEEK_TUI_PER_SESSION: '1',
    DEEPSEEK_SESSION_ID: 'sess abc',
  }), 'deepseek-tui-sess-abc');
});

test('does not emit noisy tool success events', () => {
  assert.equal(buildEvent('tool_call_after', {
    DEEPSEEK_TOOL_NAME: 'shell',
    DEEPSEEK_TOOL_SUCCESS: 'true',
  }), null);
});

test('maps tool failures and errors', () => {
  assert.equal(isToolFailure({ DEEPSEEK_TOOL_EXIT_CODE: '2' }), true);

  const toolFailed = buildEvent('tool_call_after', {
    DEEPSEEK_TOOL_NAME: 'exec_shell',
    DEEPSEEK_TOOL_SUCCESS: 'false',
  });
  assert.equal(toolFailed.state, 'failed');
  assert.equal(toolFailed.message, 'exec_shell failed');
  assert.equal(toolFailed.ttl, 20000);

  const error = buildEvent('on_error', {
    DEEPSEEK_ERROR: 'Authentication failed',
  });
  assert.equal(error.state, 'failed');
  assert.equal(error.message, 'Authentication failed');
  assert.equal(error.ttl, 20000);
});

test('maps session end to source removal', () => {
  const event = buildEvent('session_end', {});
  assert.equal(event.action, 'remove');
  assert.equal(event.source, 'deepseek-tui');
});
