/**
 * UniPet Life Engine - event interpreter.
 *
 * Turns bridge facts into agent-neutral life signals. This layer does not
 * choose spritesheet rows; it only describes what the pet should feel like.
 */
(function initLifeInterpreter(root, factory) {
  const bubble = typeof module === 'object' && module.exports
    ? require('./bubble')
    : root.UnipetLifeBubble;
  const api = factory(bubble);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetLifeInterpreter = api;
})(typeof window !== 'undefined' ? window : globalThis, function lifeInterpreterFactory(bubble) {
  const bubblePolicy = bubble || {
    MESSAGE_LIMIT: 20,
    clipBubbleText(text, limit = 20) {
      const raw = String(text || '').trim().replace(/\s+/g, ' ');
      const chars = Array.from(raw);
      if (chars.length <= limit) return raw;
      return `${chars.slice(0, limit).join('')}...`;
    },
    displayFor() {
      return {
        displayStatus: 'idle',
        displayLabel: '待命中',
        displayTone: 'idle',
        displayEvent: '待机',
      };
    },
    bubbleTextFor() {
      return '';
    },
    safeSummary() {
      return '';
    },
  };
  const MESSAGE_LIMIT = bubblePolicy.MESSAGE_LIMIT;

  function keywordPattern(words) {
    return new RegExp(`(^|[^a-z0-9])(${words.join('|')})([^a-z0-9]|$)`, 'i');
  }

  const STATE_SIGNALS = {
    idle: {
      kind: 'idle',
      mood: 'calm',
      attention: 'idle',
      urgency: 'low',
      energyDelta: -2,
      motion: 'idle',
    },
    running: {
      kind: 'running',
      mood: 'focused',
      attention: 'agent',
      urgency: 'normal',
      energyDelta: 6,
      motion: 'work',
    },
    waiting: {
      kind: 'waiting',
      mood: 'curious',
      attention: 'user',
      urgency: 'normal',
      energyDelta: -1,
      motion: 'wait',
    },
    failed: {
      kind: 'failure',
      mood: 'frustrated',
      attention: 'alert',
      urgency: 'high',
      energyDelta: -10,
      motion: 'alert',
    },
    review: {
      kind: 'success',
      mood: 'proud',
      attention: 'agent',
      urgency: 'low',
      energyDelta: 8,
      motion: 'idle',
    },
  };

  const MESSAGE_SIGNALS = [
    {
      kind: 'finished',
      pattern: keywordPattern(['finished', 'finish', 'tool finished', 'step finished']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'low', energyDelta: 1, motion: 'idle' },
    },
    {
      kind: 'failure',
      pattern: keywordPattern(['fail', 'failed', 'failure', 'error', 'denied', 'timeout', 'exception', 'abort', 'crash', 'rejected']),
      signal: { mood: 'frustrated', attention: 'alert', urgency: 'high', energyDelta: -12, motion: 'alert' },
    },
    {
      kind: 'success',
      pattern: keywordPattern(['pass', 'passed', 'success', 'succeeded', 'done', 'complete', 'completed', 'ok', 'ready']),
      signal: { mood: 'proud', attention: 'agent', urgency: 'low', energyDelta: 10, motion: 'idle' },
    },
    {
      kind: 'permission',
      pattern: keywordPattern(['approval', 'approve', 'confirm', 'permission', 'input', 'choose', 'select', 'waiting', 'interrupt']),
      signal: { mood: 'curious', attention: 'user', urgency: 'normal', energyDelta: -2, motion: 'wait' },
    },
    {
      kind: 'delegate',
      pattern: keywordPattern(['agent', 'task', 'delegate', 'worker', 'subtask']),
      signal: { mood: 'excited', attention: 'agent', urgency: 'normal', energyDelta: 8, motion: 'work' },
    },
    {
      kind: 'test',
      pattern: keywordPattern(['test', 'tests', 'pytest', 'vitest', 'jest', 'check', 'lint', 'ci']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'normal', energyDelta: 7, motion: 'work' },
    },
    {
      kind: 'build',
      pattern: keywordPattern(['build', 'compile', 'bundle', 'pack', 'release', 'publish']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'normal', energyDelta: 6, motion: 'work' },
    },
    {
      kind: 'network',
      pattern: keywordPattern(['fetch', 'curl', 'http', 'https', 'request', 'download', 'search', 'web']),
      signal: { mood: 'focused', attention: 'outside', urgency: 'normal', energyDelta: 4, motion: 'scan' },
    },
    {
      kind: 'write',
      pattern: keywordPattern(['write', 'edit', 'save', 'patch', 'apply', 'apply_patch', 'commit', 'create', 'update', 'modify']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'normal', energyDelta: 5, motion: 'work' },
    },
    {
      kind: 'read',
      pattern: keywordPattern(['read', 'grep', 'rg', 'find', 'cat', 'ls', 'list', 'scan', 'inspect', 'open']),
      signal: { mood: 'focused', attention: 'outside', urgency: 'normal', energyDelta: 3, motion: 'scan' },
    },
    {
      kind: 'shell',
      pattern: keywordPattern(['bash', 'shell', 'exec', 'command', 'npm', 'pnpm', 'node', 'build', 'test', 'run']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'normal', energyDelta: 7, motion: 'work' },
    },
    {
      kind: 'thinking',
      pattern: keywordPattern(['think', 'thinking', 'reason', 'reasoning', 'plan', 'planning', 'analyze', 'analysis']),
      signal: { mood: 'focused', attention: 'agent', urgency: 'low', energyDelta: 1, motion: 'think' },
    },
  ];

  function normalizeState(state) {
    const value = String(state || 'idle').toLowerCase();
    return STATE_SIGNALS[value] ? value : 'idle';
  }

  function matchMessageSignal(message) {
    for (const rule of MESSAGE_SIGNALS) {
      if (rule.pattern.test(message)) return rule;
    }
    return null;
  }

  function interpretEvent(pet) {
    const state = normalizeState(pet && pet.state);
    const message = String((pet && pet.message) || '').trim();
    const stateSignal = STATE_SIGNALS[state] || STATE_SIGNALS.idle;
    const messageSignal = state === 'idle' ? null : matchMessageSignal(message);
    const selected = messageSignal
      ? { ...stateSignal, ...messageSignal.signal, kind: messageSignal.kind, rule: messageSignal.kind }
      : { ...stateSignal, rule: 'state' };

    const signal = {
      state,
      message,
      kind: selected.kind,
      rule: selected.rule,
      mood: selected.mood,
      attention: selected.attention,
      urgency: selected.urgency,
      energyDelta: selected.energyDelta,
      motion: selected.motion,
    };
    const display = bubblePolicy.displayFor(signal);

    return {
      ...signal,
      ...display,
      messageSummary: bubblePolicy.safeSummary(message),
      bubbleText: bubblePolicy.bubbleTextFor(signal, display),
    };
  }

  return {
    MESSAGE_LIMIT,
    STATE_SIGNALS,
    MESSAGE_SIGNALS,
    clipBubbleText: bubblePolicy.clipBubbleText,
    safeSummary: bubblePolicy.safeSummary,
    displayFor: bubblePolicy.displayFor,
    bubbleTextFor: bubblePolicy.bubbleTextFor,
    interpretEvent,
  };
});
