const test = require('node:test');
const assert = require('node:assert/strict');

const bubble = require('../life/bubble');

test('clips bubble text by unicode code points', () => {
  const text = '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678\u5b50\u4e11';
  assert.equal(bubble.clipBubbleText(text), '\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u7532\u4e59\u4e19\u4e01\u620a\u5df1\u5e9a\u8f9b\u58ec\u7678...');
});

test('chooses bubble duration from signal kind before state', () => {
  assert.equal(bubble.durationFor({ state: 'waiting', kind: 'permission' }), 12000);
  assert.equal(bubble.durationFor({ state: 'running', kind: 'test' }), 4200);
  assert.equal(bubble.durationFor({ state: 'waiting', kind: 'waiting' }), 10000);
  assert.equal(bubble.durationFor({ state: 'unknown', kind: 'unknown' }), 0);
});

test('uses poster-style short status copy', () => {
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'running' }), '专注工作中，别打扰我哦~');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'thinking' }), '我在想想怎么做更好...');
  assert.equal(bubble.bubbleTextFor({ state: 'failed', kind: 'failure' }), '好像遇到一些问题了...');
});

test('derives display status without changing protocol states', () => {
  assert.deepEqual(
    bubble.displayFor({ state: 'running', kind: 'thinking' }),
    {
      displayStatus: 'thinking',
      displayLabel: '思考中',
      displayTone: 'thinking',
      displayEvent: '思考方案',
    },
  );
  assert.equal(bubble.displayFor({ state: 'waiting', kind: 'permission' }).displayLabel, '需要确认');
  assert.equal(bubble.displayFor({ state: 'review', kind: 'success' }).displayLabel, '完成');
  assert.equal(bubble.displayFor({ state: 'failed', kind: 'failure' }).displayLabel, '遇到问题');
});

test('keeps card summaries short and hides risky text', () => {
  assert.equal(bubble.safeSummary('exec_shell npm test'), 'exec_shell npm test');
  assert.equal(bubble.safeSummary('C:\\Users\\yangd\\secret.txt'), '详情已隐藏');
  assert.equal(bubble.safeSummary('api_key=abc123'), '详情已隐藏');
  assert.equal(bubble.safeSummary('first line\nsecond line'), '详情已隐藏');
});
