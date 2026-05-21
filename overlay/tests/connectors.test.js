const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const connectors = require('../connectors');

test('expands connector targets and rejects unknown ids', () => {
  assert.deepEqual(connectors.connectorIds('all'), ['hermes', 'openclaw', 'deepseek-tui', 'codex', 'claude-code']);
  assert.deepEqual(connectors.connectorIds('hermes'), ['hermes']);
  assert.throws(() => connectors.connectorIds('deepseek'), /Unknown connector/);
});

test('resolves Hermes home from explicit options before environment', () => {
  const explicit = path.join(os.tmpdir(), 'unipet-explicit-hermes');
  const env = { HERMES_HOME: path.join(os.tmpdir(), 'unipet-env-hermes') };
  assert.equal(connectors.resolveHermesHome({ hermesHome: explicit }, env), path.resolve(explicit));
  assert.equal(connectors.resolveHermesHome({}, env), path.resolve(env.HERMES_HOME));
});

test('removes only managed child connector directories', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unipet-connector-test-'));
  try {
    const plugin = path.join(temp, 'plugins', 'unipet');
    fs.mkdirSync(plugin, { recursive: true });
    fs.writeFileSync(path.join(plugin, 'file.txt'), 'x');

    connectors.safeRemoveManagedChild(plugin, 'plugins', 'unipet');
    assert.equal(fs.existsSync(plugin), false);

    const unmanaged = path.join(temp, 'plugins', 'other');
    fs.mkdirSync(unmanaged, { recursive: true });
    assert.throws(() => connectors.safeRemoveManagedChild(unmanaged, 'plugins', 'unipet'), /Refusing/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('detects current and legacy DeepSeek-TUI managed blocks', () => {
  assert.equal(connectors.hasDeepSeekManagedBlock('# >>> unipet deepseek-tui hooks\nx\n# <<< unipet deepseek-tui hooks'), true);
  assert.equal(connectors.hasDeepSeekManagedBlock('# >>> unipet deepseek hooks\nx\n# <<< unipet deepseek hooks'), true);
  assert.equal(connectors.hasDeepSeekManagedBlock('provider = "deepseek"'), false);
});

test('detects Codex managed hook blocks', () => {
  assert.equal(connectors.hasCodexManagedBlock('# >>> unipet codex hooks\nx\n# <<< unipet codex hooks'), true);
  assert.equal(connectors.hasCodexManagedBlock('model = "gpt-5"'), false);
});
