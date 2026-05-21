const assert = require('node:assert/strict');
const test = require('node:test');
const protocol = require('../protocol');

test('protocol exposes stable states and actions', () => {
  assert.equal(protocol.PROTOCOL_VERSION, 2);
  assert.deepEqual(protocol.PET_STATES, ['idle', 'running', 'waiting', 'failed', 'review']);
  assert.deepEqual(protocol.PET_ACTIONS, ['update', 'remove', 'clear']);
});

test('normalizes ttl numbers and duration strings', () => {
  assert.equal(protocol.normalizeTtl(10), 1000);
  assert.equal(protocol.normalizeTtl('1500ms'), 1500);
  assert.equal(protocol.normalizeTtl('30s'), 30000);
  assert.equal(protocol.normalizeTtl('2m'), 120000);
  assert.equal(protocol.normalizeTtl('invalid'), null);
});

test('normalizes protocol event text without splitting unicode characters', () => {
  const event = protocol.normalizeEvent({
    source: 'Agent 🤖',
    state: 'success',
    message: '猫'.repeat(200),
  }, () => 1000);

  assert.equal(event.source, 'Agent');
  assert.equal(event.state, 'review');
  assert.equal(Array.from(event.message).length, 180);
  assert.equal(event.updatedAt, 1);
});
