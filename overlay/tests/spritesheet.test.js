const test = require('node:test');
const assert = require('node:assert/strict');

const spritesheet = require('../renderers/spritesheet/adapter');

test('keeps Codex-compatible atlas geometry', () => {
  assert.equal(spritesheet.CELL_W, 192);
  assert.equal(spritesheet.CELL_H, 208);
  assert.equal(spritesheet.SHEET_COLUMNS, 8);
  assert.equal(spritesheet.SHEET_ROWS, 9);
  assert.equal(spritesheet.getFrame('jumping', 0).spriteIndex, 32);
  assert.equal(spritesheet.getFrame('unknown', 0).spriteIndex, 0);
});

test('scales display and frame positions deterministically', () => {
  assert.deepEqual(spritesheet.displaySize(0.5), { width: 96, height: 104 });
  assert.deepEqual(spritesheet.backgroundSize(0.5), { width: 768, height: 936 });
  assert.equal(spritesheet.framePosition('running_left', 3, 0.5), '-288px -208px');
  assert.equal(spritesheet.readRenderScale(5), 1);
  assert.equal(spritesheet.readRenderScale(0.1), 0.35);
});

test('normalizes Codex-style animation tracks', () => {
  const model = spritesheet.normalizeManifest({
    frame: { width: 192, height: 208, columns: 8, rows: 9 },
    animations: {
      wave: {
        frames: [
          { spriteIndex: 24, durationMs: 220 },
          { sprite_index: 25, duration_ms: 180 },
        ],
        loop_start: null,
        fallback: 'idle',
      },
    },
  });

  const wave = spritesheet.getAnimation('wave', model);
  assert.equal(wave.frames.length, 2);
  assert.equal(wave.frames[0].spriteIndex, 24);
  assert.equal(wave.frames[0].durationMs, 220);
  assert.equal(wave.loopStart, null);
  assert.equal(wave.fallback, 'idle');
});

test('accepts legacy fps animation specs and dashed aliases', () => {
  const model = spritesheet.normalizeManifest({
    animations: {
      'running-right': {
        frames: [8, 9],
        fps: 5,
        loop: true,
      },
    },
  });

  assert.equal(spritesheet.getAnimation('running_right', model).frames[0].durationMs, 200);
  assert.equal(spritesheet.framePosition('running-right', 1, 0.5, model), '-96px -104px');
});
