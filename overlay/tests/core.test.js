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
    source: 'Hermes Agent!',
    state: 'error',
    message: 'x'.repeat(300),
    ttlMs: 10,
  });

  assert.equal(event.source, 'Hermes-Agent');
  assert.equal(event.state, 'failed');
  assert.equal(event.ttlMs, 1000);
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
