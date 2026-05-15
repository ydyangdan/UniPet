const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const connectors = require('../connectors');

test('expands connector targets and rejects unknown ids', () => {
  assert.deepEqual(connectors.connectorIds('all'), ['hermes', 'openclaw', 'deepseek-tui']);
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
    const skill = path.join(temp, 'skills', 'unipet');
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, 'file.txt'), 'x');

    connectors.safeRemoveManagedChild(skill, 'skills', 'unipet');
    assert.equal(fs.existsSync(skill), false);

    const unmanaged = path.join(temp, 'skills', 'other');
    fs.mkdirSync(unmanaged, { recursive: true });
    assert.throws(() => connectors.safeRemoveManagedChild(unmanaged, 'skills', 'unipet'), /Refusing/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('detects current and legacy DeepSeek-TUI managed blocks', () => {
  assert.equal(connectors.hasDeepSeekManagedBlock('# >>> unipet deepseek-tui hooks\nx\n# <<< unipet deepseek-tui hooks'), true);
  assert.equal(connectors.hasDeepSeekManagedBlock('# >>> unipet deepseek hooks\nx\n# <<< unipet deepseek hooks'), true);
  assert.equal(connectors.hasDeepSeekManagedBlock('provider = "deepseek"'), false);
});
