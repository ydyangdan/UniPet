const assert = require('node:assert/strict');
const test = require('node:test');

const { stripManagedBlock, updateConfig } = require('../install');

test('adds and replaces a managed Codex hooks block', () => {
  const once = updateConfig('model = "gpt-5"\n', { unipetCommand: 'unipet' });
  assert.match(once, /# >>> unipet codex hooks/);
  assert.match(once, /command = "unipet hook codex user_prompt_submit"/);
  assert.match(once, /timeout = 20/);
  assert.match(once, /\[\[hooks\.Stop\.hooks\]\]/);

  const twice = updateConfig(once, { unipetCommand: 'custom-unipet' });
  assert.equal((twice.match(/unipet codex hooks/g) || []).length, 2);
  assert.doesNotMatch(twice, /command = "unipet hook codex/);
  assert.match(twice, /command = "custom-unipet hook codex stop"/);
});

test('strips only the managed Codex block', () => {
  const text = [
    'keep = true',
    '# >>> unipet codex hooks',
    '[[hooks.Stop]]',
    '# <<< unipet codex hooks',
    'after = true',
  ].join('\n');
  const stripped = stripManagedBlock(text);
  assert.match(stripped, /keep = true/);
  assert.match(stripped, /after = true/);
  assert.doesNotMatch(stripped, /unipet codex hooks/);
});
