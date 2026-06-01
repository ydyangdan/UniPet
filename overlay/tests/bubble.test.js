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
