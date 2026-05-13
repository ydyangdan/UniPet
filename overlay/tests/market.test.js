const assert = require('node:assert/strict');
const test = require('node:test');
const { extractMarketPetId } = require('../market');

test('extracts Codex Pet Share ids from ids and URLs', () => {
  assert.equal(extractMarketPetId('taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://codex-pet-share.pages.dev/pets/taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://codex-pet-share.pages.dev/#/pets/taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://example.com/no-pet-here'), '');
  assert.equal(extractMarketPetId('not a valid id'), '');
});
