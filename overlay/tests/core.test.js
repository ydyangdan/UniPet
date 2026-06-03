const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PetStore,
  WORK_QUIET_GRACE_MS,
  normalizeEvent,
  normalizeState,
} = require('../core');

test('normalizes Codex states and common aliases', () => {
  assert.equal(normalizeState('running'), 'running');
  assert.equal(normalizeState('thinking'), 'running');
  assert.equal(normalizeState('planning'), 'running');
  assert.equal(normalizeState('success'), 'review');
  assert.equal(normalizeState('error'), 'failed');
  assert.equal(normalizeState('unknown-state'), 'idle');
});

test('normalizes event shape and clamps ttl', () => {
  const event = normalizeEvent({
    source: 'Hermes Agent!',
    state: 'error',
    message: 'x'.repeat(300),
    ttl: 10,
  });

  assert.equal(event.source, 'Hermes-Agent');
  assert.equal(event.state, 'failed');
  assert.equal(event.ttl, 1000);
  assert.equal(event.message.length, 180);
});

test('requires source and rejects unsupported action', () => {
  assert.throws(() => normalizeEvent({ state: 'running' }), /source is required/);
  assert.throws(() => normalizeEvent({ source: 'local', action: 'explode' }), /action must be one of/);
});

test('chooses active pet by priority then recency', () => {
  const store = new PetStore();
  store.apply(normalizeEvent({ source: 'a', state: 'running', message: 'run' }));
  store.apply(normalizeEvent({ source: 'b', state: 'waiting', message: 'wait' }));
  assert.equal(store.activeState(), 'waiting');

  store.apply(normalizeEvent({ source: 'c', state: 'failed', message: 'fail' }));
  assert.equal(store.activeState(), 'failed');
  assert.equal(store.activePet().source, 'c');
});

test('clear keeps local source if present', () => {
  const store = new PetStore();
  store.apply(normalizeEvent({ source: 'local-unipet', state: 'running', message: 'local' }));
  store.apply(normalizeEvent({ source: 'hermes', state: 'failed', message: 'fail' }));
  store.apply(normalizeEvent({ action: 'clear', source: 'local-unipet', state: 'idle', message: 'clear' }));

  const pets = store.snapshot();
  assert.equal(pets.length, 1);
  assert.equal(pets[0].source, 'local-unipet');
});

test('keeps an open work session active during quiet agent gaps', () => {
  let clock = 0;
  const now = () => clock;
  const store = new PetStore({ now });

  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Codex is thinking', ttl: 1000 }, now));
  clock = 1500;
  assert.equal(store.activeState(), 'running');
  assert.equal(store.activePet().quiet, true);

  clock = WORK_QUIET_GRACE_MS + 1500;
  assert.equal(store.activeState(), 'idle');
});

test('does not keep terminal states alive after their ttl', () => {
  let clock = 0;
  const now = () => clock;
  const store = new PetStore({ now });

  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Codex is thinking', ttl: 1000 }, now));
  clock = 100;
  store.apply(normalizeEvent({ source: 'codex', state: 'review', message: 'All tests passed', ttl: 1000 }, now));
  clock = 1500;

  assert.equal(store.activeState(), 'idle');
});

test('does not let expired waiting block a newer running source', () => {
  let clock = 0;
  const now = () => clock;
  const store = new PetStore({ now });

  store.apply(normalizeEvent({ source: 'claude-code', state: 'waiting', message: 'Waiting for approval', ttl: 1000 }, now));
  clock = 1500;
  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Codex is thinking', ttl: 120000 }, now));

  const active = store.activePet();
  assert.equal(active.source, 'codex');
  assert.equal(active.state, 'running');
});

test('tracks work duration from the first active event', () => {
  let clock = 0;
  const now = () => clock;
  const store = new PetStore({ now });

  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Codex is thinking' }, now));
  clock = 5000;
  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Running Bash' }, now));

  assert.equal(store.activePet().startedAt, 0);
});

test('keeps latest agent message during quiet finished-step gaps', () => {
  let clock = 0;
  const now = () => clock;
  const store = new PetStore({ now });

  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Running npm test', ttl: 1000 }, now));
  clock = 500;
  store.apply(normalizeEvent({ source: 'codex', state: 'running', message: 'Finished Read', ttl: 1000 }, now));
  clock = 1600;

  const active = store.activePet();
  assert.equal(active.state, 'running');
  assert.equal(active.quiet, true);
  assert.equal(active.message, 'Finished Read');
});
