const assert = require('node:assert/strict');
const test = require('node:test');
const { PetStore, normalizeEvent, normalizeState } = require('../core');

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
    protocol: 'unipet.v1',
    source_id: 'Hermes Agent!',
    state: 'error',
    message: 'x'.repeat(300),
    ttl_ms: 10,
    notification_kind: 'Build',
  });

  assert.equal(event.source_id, 'Hermes-Agent');
  assert.equal(event.state, 'failed');
  assert.equal(event.ttl_ms, 1000);
  assert.equal(event.message.length, 180);
  assert.equal(event.notification_kind, 'build');
  assert.equal(event.notification_count, 1);
});

test('rejects unsupported protocol and action', () => {
  assert.throws(() => normalizeEvent({ protocol: 'wrong' }), /protocol must be unipet\.v1/);
  assert.throws(() => normalizeEvent({ action: 'explode' }), /action must be one of/);
});

test('chooses active pet by priority then recency', () => {
  const store = new PetStore();
  store.apply(normalizeEvent({ source_id: 'a', state: 'running', message: 'run' }));
  store.apply(normalizeEvent({ source_id: 'b', state: 'waiting', message: 'wait' }));
  assert.equal(store.activeState(), 'waiting');

  store.apply(normalizeEvent({ source_id: 'c', state: 'failed', message: 'fail' }));
  assert.equal(store.activeState(), 'failed');
  assert.equal(store.activePet().source_id, 'c');
});

test('clear keeps local source if present', () => {
  const store = new PetStore();
  store.apply(normalizeEvent({ source_id: 'local-unipet', state: 'running', message: 'local' }));
  store.apply(normalizeEvent({ source_id: 'hermes', state: 'failed', message: 'fail' }));
  store.apply(normalizeEvent({ action: 'clear', source_id: 'local-unipet', state: 'idle', message: 'clear' }));

  const pets = store.snapshot();
  assert.equal(pets.length, 1);
  assert.equal(pets[0].source_id, 'local-unipet');
});
