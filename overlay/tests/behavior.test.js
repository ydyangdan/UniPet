const test = require('node:test');
const assert = require('node:assert/strict');

const { clipBubbleText, inferBehavior } = require('../behavior');

test('clips bubble text by unicode code points', () => {
  assert.equal(clipBubbleText('一二三四五六七八九十一二三四五六七八九十甲乙'), '一二三四五六七八九十一二三四五六七八九十...');
});

test('infers read and write behaviors from messages', () => {
  assert.equal(inferBehavior({ state: 'running', message: 'read_file package.json' }).animation, 'running_left');
  assert.equal(inferBehavior({ state: 'running', message: 'apply_patch renderer.js' }).animation, 'running_right');
});

test('infers shell, thinking, success, and failure behavior', () => {
  assert.deepEqual(
    pick(inferBehavior({ state: 'running', message: 'exec_shell npm test' })),
    { animation: 'running', fps: 11, emotion: 'focused', rule: 'shell' },
  );
  assert.deepEqual(
    pick(inferBehavior({ state: 'running', message: 'thinking through plan' })),
    { animation: 'running', fps: 5, emotion: 'focused', rule: 'thinking' },
  );
  assert.equal(inferBehavior({ state: 'review', message: 'all tests pass' }).emotion, 'happy');
  assert.equal(inferBehavior({ state: 'failed', message: 'tool failed with timeout' }).effect, 'shake');
  assert.equal(inferBehavior({ state: 'review', message: 'done with error' }).emotion, 'frustrated');
});

test('does not require bridge protocol fields beyond state and message', () => {
  const intent = inferBehavior({ state: 'waiting', message: 'waiting for user input' });
  assert.equal(intent.animation, 'waiting');
  assert.equal(intent.fallbackAnimation, 'waiting');
  assert.equal(Object.hasOwn(intent, 'source'), false);
});

function pick(intent) {
  return {
    animation: intent.animation,
    fps: intent.fps,
    emotion: intent.emotion,
    rule: intent.rule,
  };
}
