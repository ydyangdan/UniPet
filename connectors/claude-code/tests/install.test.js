const assert = require('node:assert/strict');
const test = require('node:test');

const { hasManagedHooksText, stripManagedHooks, updateSettings } = require('../install');

test('adds Claude Code hooks without removing existing hooks', () => {
  const before = JSON.stringify({
    hooks: {
      Stop: [
        {
          hooks: [{ type: 'command', command: 'echo keep' }],
        },
      ],
    },
  });
  const after = updateSettings(before, { unipetCommand: 'unipet' });
  const settings = JSON.parse(after);

  assert.equal(settings.hooks.Stop.length, 2);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'echo keep');
  assert.equal(settings.hooks.Stop[1].hooks[0].timeout, 20);
  assert.match(after, /unipet hook claude-code stop/);
  assert.equal(hasManagedHooksText(after), true);
});

test('replaces previous Claude Code managed hooks idempotently', () => {
  const once = updateSettings('{}', { unipetCommand: 'unipet' });
  const twice = updateSettings(once, { unipetCommand: 'custom-unipet' });

  assert.doesNotMatch(twice, /"unipet hook claude-code/);
  assert.match(twice, /custom-unipet hook claude-code stop/);
});

test('strips only Claude Code managed hooks', () => {
  const stripped = stripManagedHooks({
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: 'unipet hook claude-code stop' }] },
        { hooks: [{ type: 'command', command: 'echo keep' }] },
      ],
    },
  });
  assert.equal(stripped.hooks.Stop.length, 1);
  assert.equal(stripped.hooks.Stop[0].hooks[0].command, 'echo keep');
});
