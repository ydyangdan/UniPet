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

test('keeps Codex-style default animation timing', () => {
  const model = spritesheet.normalizeManifest({});
  const idle = spritesheet.getAnimation('idle', model);

  assert.deepEqual(idle.frames.map((frame) => frame.spriteIndex), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(idle.frames.map((frame) => frame.durationMs), [1680, 660, 660, 840, 840, 1920]);
  assert.equal(idle.loopStart, 0);

  const states = [
    ['running', 56, 6, 120, 220],
    ['waiting', 48, 6, 150, 260],
    ['failed', 40, 8, 140, 240],
    ['review', 64, 6, 150, 280],
  ];

  for (const [name, firstSpriteIndex, frameCount, frameMs, finalFrameMs] of states) {
    const animation = spritesheet.getAnimation(name, model);
    const firstCycle = animation.frames.slice(0, frameCount);

    assert.deepEqual(
      firstCycle.map((frame) => frame.spriteIndex),
      Array.from({ length: frameCount }, (_, index) => firstSpriteIndex + index),
    );
    assert.deepEqual(
      firstCycle.map((frame) => frame.durationMs),
      Array.from({ length: frameCount }, (_, index) => (index === frameCount - 1 ? finalFrameMs : frameMs)),
    );
    assert.equal(animation.primaryFrameCount, frameCount * 3);
    assert.equal(animation.loopStart, frameCount * 3);
    assert.deepEqual(animation.frames.slice(animation.loopStart).map((frame) => frame.spriteIndex), [0, 1, 2, 3, 4, 5]);
  }
});

test('selects animation frames from elapsed time and loopStart', () => {
  const animation = {
    frames: [
      { spriteIndex: 10, durationMs: 100 },
      { spriteIndex: 11, durationMs: 200 },
      { spriteIndex: 12, durationMs: 300 },
    ],
    loopStart: 1,
  };

  assert.deepEqual(
    pickTick(spritesheet.currentAnimationFrame(animation, 150)),
    { frameIndex: 1, spriteIndex: 11, delayMs: 150, completed: false },
  );
  assert.deepEqual(
    pickTick(spritesheet.currentAnimationFrame(animation, 650)),
    { frameIndex: 1, spriteIndex: 11, delayMs: 150, completed: false },
  );
});

test('marks non-looping animations complete after their final frame duration', () => {
  const animation = {
    frames: [
      { spriteIndex: 20, durationMs: 100 },
      { spriteIndex: 21, durationMs: 200 },
    ],
    loopStart: null,
  };

  assert.deepEqual(
    pickTick(spritesheet.currentAnimationFrame(animation, 250)),
    { frameIndex: 1, spriteIndex: 21, delayMs: 50, completed: false },
  );
  assert.deepEqual(
    pickTick(spritesheet.currentAnimationFrame(animation, 300)),
    { frameIndex: 1, spriteIndex: 21, delayMs: null, completed: true },
  );
});

function pickTick(tick) {
  return {
    frameIndex: tick.frameIndex,
    spriteIndex: tick.spriteIndex,
    delayMs: tick.delayMs,
    completed: tick.completed,
  };
}
