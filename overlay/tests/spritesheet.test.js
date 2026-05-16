const test = require('node:test');
const assert = require('node:assert/strict');

const spritesheet = require('../renderers/spritesheet/adapter');

test('keeps Codex-compatible atlas geometry', () => {
  assert.equal(spritesheet.CELL_W, 192);
  assert.equal(spritesheet.CELL_H, 208);
  assert.equal(spritesheet.SHEET_COLUMNS, 8);
  assert.equal(spritesheet.SHEET_ROWS, 9);
  assert.equal(spritesheet.getAnimation('jumping').row, 4);
  assert.equal(spritesheet.getAnimation('unknown').row, 0);
});

test('scales display and frame positions deterministically', () => {
  assert.deepEqual(spritesheet.displaySize(0.5), { width: 96, height: 104 });
  assert.deepEqual(spritesheet.backgroundSize(0.5), { width: 768, height: 936 });
  assert.equal(spritesheet.framePosition('running_left', 3, 0.5), '-288px -208px');
  assert.equal(spritesheet.readRenderScale(5), 1);
  assert.equal(spritesheet.readRenderScale(0.1), 0.35);
});
