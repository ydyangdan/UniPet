const test = require('node:test');
const assert = require('node:assert/strict');

const { clipBubbleText, createLifeState, inferBehavior, nextIdleMoment } = require('../behavior');

test('clips bubble text by unicode code points', () => {
  const text = '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678\u5b50\u4e11';
  assert.equal(clipBubbleText(text), '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678...');
});

test('infers read and write behaviors from messages', () => {
  assert.equal(inferBehavior({ state: 'running', message: 'read_file package.json' }).animation, 'running_left');
  assert.equal(inferBehavior({ state: 'running', message: 'apply_patch renderer.js' }).animation, 'running_right');
});

test('infers shell, thinking, success, and failure behavior', () => {
  assert.deepEqual(
    pick(inferBehavior({ state: 'running', message: 'exec_shell npm test' })),
    { animation: 'running', emotion: 'focused', rule: 'test' },
  );
  assert.deepEqual(
    pick(inferBehavior({ state: 'running', message: 'thinking through plan' })),
    { animation: 'running', emotion: 'focused', rule: 'thinking' },
  );
  assert.equal(inferBehavior({ state: 'running', message: 'thinking through plan' }).displayLabel, '思考中');
  assert.equal(inferBehavior({ state: 'running', message: 'thinking through plan' }).bubbleText, '我在想想怎么做更好...');
  assert.equal(inferBehavior({ state: 'review', message: 'all tests pass' }).emotion, 'happy');
  assert.equal(inferBehavior({ state: 'failed', message: 'tool failed with timeout' }).effect, 'shake');
  assert.equal(inferBehavior({ state: 'failed', message: 'tool failed with timeout' }).bubbleText, '好像遇到一些问题了...');
  assert.equal(inferBehavior({ state: 'review', message: 'done with error' }).emotion, 'frustrated');
});

test('distinguishes permission, build, network, and delegate behavior', () => {
  assert.equal(inferBehavior({ state: 'waiting', message: 'Waiting for approval' }).rule, 'permission');
  assert.equal(inferBehavior({ state: 'waiting', message: 'Waiting for approval' }).displayLabel, '需要确认');
  assert.equal(inferBehavior({ state: 'running', message: 'compile package' }).animation, 'running_right');
  assert.equal(inferBehavior({ state: 'running', message: 'fetch search results' }).animation, 'waving');
  assert.equal(inferBehavior({ state: 'running', message: 'delegate task to worker' }).animation, 'jumping');
});

test('uses short task-specific copy for safe running work', () => {
  assert.equal(inferBehavior({ state: 'running', message: 'read_file package.json' }).bubbleText, '我在翻翻项目文件。');
  assert.equal(inferBehavior({ state: 'running', message: 'apply_patch renderer.js' }).bubbleText, '正在改文件啦。');
  assert.equal(inferBehavior({ state: 'running', message: 'exec_shell npm test' }).bubbleText, '正在检查稳不稳。');
});

test('hides unsafe message summaries from display cards', () => {
  const intent = inferBehavior({ state: 'running', message: 'C:\\Users\\yangd\\secret.txt' });
  assert.equal(intent.messageSummary, '详情已隐藏');
  assert.equal(intent.bubbleText, '专注工作中，别打扰我哦~');
});

test('keeps short lived life state outside the bridge protocol', () => {
  const life = createLifeState({ energy: 40 });
  const intent = inferBehavior({ state: 'running', message: 'exec_shell npm test' }, life);

  assert.equal(intent.life.energy > life.energy, true);
  assert.equal(intent.life.attention, 'agent');
  assert.equal(Object.hasOwn(intent, 'source'), false);
});

test('does not require bridge protocol fields beyond state and message', () => {
  const intent = inferBehavior({ state: 'waiting', message: 'waiting for user input' });
  assert.equal(intent.animation, 'waiting');
  assert.equal(intent.fallbackAnimation, 'waiting');
  assert.equal(Object.hasOwn(intent, 'source'), false);
});

test('plans quiet idle moments most of the time', () => {
  assert.equal(nextIdleMoment(() => 0.10).type, 'none');
  assert.equal(nextIdleMoment(() => 0.75).type, 'blink');
  assert.equal(nextIdleMoment(() => 0.84).type, 'look-left');
  assert.equal(nextIdleMoment(() => 0.91).type, 'look-right');
  assert.equal(nextIdleMoment(() => 0.97).type, 'hop');
  assert.equal(nextIdleMoment(() => 0.99).type, 'sleepy');
});

function pick(intent) {
  return {
    animation: intent.animation,
    emotion: intent.emotion,
    rule: intent.rule,
  };
}
