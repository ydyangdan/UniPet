const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const cli = require('../cli');

test('treats EPERM process probes as live processes', () => {
  assert.equal(cli.isProcessProbeLiveError({ code: 'EPERM' }), true);
  assert.equal(cli.isProcessProbeLiveError({ code: 'ESRCH' }), false);
  assert.equal(cli.isProcessProbeLiveError(null), false);
});

test('doctor summary gives clear next steps', () => {
  assert.deepEqual(cli.doctorSummary({ electronOk: false, live: null }), {
    health: 'needs install',
    next: ["reinstall with 'npm install -g uni-pet' or run 'npm install' from source"],
  });
  assert.deepEqual(cli.doctorSummary({ electronOk: true, live: null }), {
    health: 'stopped',
    next: ["run 'unipet start' to launch the desktop pet"],
  });
  assert.deepEqual(cli.doctorSummary({ electronOk: true, live: {} }), {
    health: 'ready',
    next: [
      "run 'unipet demo' to preview the core agent states",
      "run 'unipet agent status' to inspect Agent integrations",
    ],
  });
});

test('help exposes the demo command', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.js'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /unipet demo/);
});

test('demo rejects invalid step durations before starting runtime', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.js'), 'demo', '--step', 'soon'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Step duration/);
});
