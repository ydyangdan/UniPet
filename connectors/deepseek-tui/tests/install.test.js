const assert = require('node:assert/strict');
const test = require('node:test');
const { stripManagedBlock, updateConfig } = require('../install');

test('adds a managed hooks block to an empty DeepSeek-TUI config', () => {
  const text = updateConfig('', { unipetCommand: 'unipet' });

  assert.match(text, /\[hooks\]/);
  assert.match(text, /enabled = true/);
  assert.match(text, /event = "message_submit"/);
  assert.match(text, /command = "unipet hook deepseek-tui message_submit"/);
});

test('does not duplicate an existing hooks table', () => {
  const text = updateConfig('[hooks]\nenabled = false\n', { unipetCommand: 'unipet' });

  assert.equal((text.match(/^\[hooks\]/gm) || []).length, 1);
  assert.match(text, /enabled = true/);
  assert.match(text, /event = "session_end"/);
});

test('replaces the previous managed block idempotently', () => {
  const once = updateConfig('provider = "deepseek"\n', { unipetCommand: 'unipet' });
  const twice = updateConfig(once, { unipetCommand: 'custom-unipet' });

  assert.equal((twice.match(/unipet deepseek-tui hooks/g) || []).length, 2);
  assert.doesNotMatch(twice, /command = "unipet hook deepseek-tui/);
  assert.match(twice, /command = "custom-unipet hook deepseek-tui message_submit"/);
});

test('strips only the legacy managed block', () => {
  const original = [
    'provider = "deepseek"',
    '# >>> unipet deepseek hooks',
    'managed = true',
    '# <<< unipet deepseek hooks',
    'default_text_model = "deepseek-v4"',
  ].join('\n');

  const stripped = stripManagedBlock(original);
  assert.match(stripped, /provider = "deepseek"/);
  assert.match(stripped, /default_text_model = "deepseek-v4"/);
  assert.doesNotMatch(stripped, /managed = true/);
});

test('strips only the managed deepseek-tui block', () => {
  const original = [
    'provider = "deepseek"',
    '# >>> unipet deepseek-tui hooks',
    'managed = true',
    '# <<< unipet deepseek-tui hooks',
    'default_text_model = "deepseek-v4"',
  ].join('\n');

  const stripped = stripManagedBlock(original);
  assert.match(stripped, /provider = "deepseek"/);
  assert.match(stripped, /default_text_model = "deepseek-v4"/);
  assert.doesNotMatch(stripped, /managed = true/);
});
