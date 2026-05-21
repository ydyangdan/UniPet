import test from 'node:test';
import assert from 'node:assert/strict';
import { clipText, extractText, isFailure, resolveConfig } from '../index.js';

test('clips bubble text by unicode code points', () => {
  assert.equal(clipText('你好，OpenClaw 正在回复用户', 5), '你好，Op...');
  assert.equal(clipText('short', 20), 'short');
  assert.equal(clipText('   spaced   text   ', 20), 'spaced text');
});

test('extracts text from common OpenClaw event shapes', () => {
  assert.equal(extractText({ content: 'hello' }), 'hello');
  assert.equal(extractText({ message: 'world' }), 'world');
  assert.equal(extractText([{ text: 'a' }, { content: 'b' }]), 'a b');
});

test('detects failure-like hook payloads', () => {
  assert.equal(isFailure({ success: false }), true);
  assert.equal(isFailure({ status: 'failed' }), true);
  assert.equal(isFailure({ error: new Error('boom') }), true);
  assert.equal(isFailure({ success: true, status: 'ok' }), false);
});

test('resolves defaults without plugin config', () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 8768);
  assert.equal(cfg.bubbleMode, 'first20');
  assert.equal(cfg.idleDelayMs, 12000);
});
