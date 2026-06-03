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
  assert.equal(bubble.durationFor({ state: 'running', kind: 'finished' }), 2800);
  assert.equal(bubble.durationFor({ state: 'waiting', kind: 'waiting' }), 10000);
  assert.equal(bubble.durationFor({ state: 'unknown', kind: 'unknown' }), 0);
});

test('uses grounded companion status copy', () => {
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'running' }), '我在盯着它跑。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'thinking' }), '它在琢磨下一步。');
  assert.equal(bubble.bubbleTextFor({ state: 'waiting', kind: 'waiting' }), '它先停在这里等着。');
  assert.equal(bubble.bubbleTextFor({ state: 'waiting', kind: 'permission' }), '这步等你点头。');
  assert.equal(bubble.bubbleTextFor({ state: 'review', kind: 'success' }), '完成啦，等你看看。');
  assert.equal(bubble.bubbleTextFor({ state: 'failed', kind: 'failure' }), '这里需要看一眼。');
});

test('keeps running copy anchored to agent activity', () => {
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'read' }), '它在翻项目文件。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'write' }), '它在改文件啦。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'shell' }), '它在跑命令。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'test' }), '它在跑检查。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'build' }), '它在构建打包。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'network' }), '它在请求外部信息。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'delegate' }), '它在安排子任务。');
  assert.equal(bubble.bubbleTextFor({ state: 'running', kind: 'finished' }), '这步刚跑完。');
});

test('derives display status without changing protocol states', () => {
  assert.deepEqual(
    bubble.displayFor({ state: 'idle', kind: 'idle' }),
    {
      displayStatus: 'idle',
      displayLabel: '待命中',
      displayTone: 'idle',
      displayEvent: '待机',
    },
  );
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
