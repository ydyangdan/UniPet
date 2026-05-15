/**
 * UniPet renderer behavior rules.
 *
 * This module turns bridge facts (state + message) into local presentation
 * hints. It intentionally does not change the bridge event protocol.
 */
(function initBehavior(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetBehavior = api;
})(typeof window !== 'undefined' ? window : globalThis, function behaviorFactory() {
  const MESSAGE_LIMIT = 20;

  function keywordPattern(words) {
    return new RegExp(`(^|[^a-z0-9])(${words.join('|')})([^a-z0-9]|$)`, 'i');
  }

  const RULES = [
    {
      name: 'failure',
      pattern: keywordPattern(['fail', 'failed', 'failure', 'error', 'denied', 'timeout', 'exception', 'abort', 'crash']),
      apply: () => ({ animation: 'failed', fps: 7, emotion: 'frustrated', effect: 'shake' }),
    },
    {
      name: 'success',
      pattern: keywordPattern(['pass', 'passed', 'success', 'succeeded', 'done', 'complete', 'completed', 'ok']),
      apply: () => ({ animation: 'review', fps: 7, emotion: 'happy', effect: 'bounce' }),
    },
    {
      name: 'delegate',
      pattern: keywordPattern(['agent', 'task', 'delegate', 'worker', 'subtask']),
      apply: () => ({ animation: 'jumping', fps: 8, emotion: 'excited', effect: 'bounce' }),
    },
    {
      name: 'network',
      pattern: keywordPattern(['fetch', 'curl', 'http', 'https', 'request', 'download', 'search', 'web']),
      apply: () => ({ animation: 'waving', fps: 8, emotion: 'focused' }),
    },
    {
      name: 'write',
      pattern: keywordPattern(['write', 'edit', 'save', 'patch', 'apply', 'commit', 'create', 'update', 'modify']),
      apply: () => ({ animation: 'running_right', fps: 10, emotion: 'focused', motion: 'work' }),
    },
    {
      name: 'read',
      pattern: keywordPattern(['read', 'grep', 'find', 'cat', 'ls', 'list', 'scan', 'inspect', 'open']),
      apply: () => ({ animation: 'running_left', fps: 8, emotion: 'focused', motion: 'scan' }),
    },
    {
      name: 'shell',
      pattern: keywordPattern(['bash', 'shell', 'exec', 'command', 'npm', 'pnpm', 'node', 'build', 'test', 'run']),
      apply: () => ({ animation: 'running', fps: 11, emotion: 'focused', motion: 'work' }),
    },
    {
      name: 'thinking',
      pattern: keywordPattern(['think', 'thinking', 'reason', 'reasoning', 'plan', 'planning', 'analyze', 'analysis']),
      apply: () => ({ animation: 'running', fps: 5, emotion: 'focused', motion: 'think' }),
    },
  ];

  const DEFAULTS = {
    idle: { animation: 'idle', fps: 6, emotion: 'calm', motion: 'idle' },
    running: { animation: 'running', fps: 10, emotion: 'focused', motion: 'work' },
    waiting: { animation: 'waiting', fps: 6, emotion: 'calm', motion: 'wait' },
    failed: { animation: 'failed', fps: 6, emotion: 'frustrated', effect: 'shake' },
    review: { animation: 'review', fps: 6, emotion: 'happy', effect: 'bounce' },
  };

  function clipBubbleText(text, limit = MESSAGE_LIMIT) {
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    const chars = Array.from(raw);
    if (chars.length <= limit) return raw;
    return `${chars.slice(0, limit).join('')}...`;
  }

  function fallbackAnimationFor(state) {
    return (DEFAULTS[state] && DEFAULTS[state].animation) || 'idle';
  }

  function inferBehavior(pet) {
    const state = String((pet && pet.state) || 'idle').toLowerCase();
    const message = String((pet && pet.message) || '').trim();
    const base = { state, message, ...(DEFAULTS[state] || DEFAULTS.idle) };

    for (const rule of RULES) {
      if (rule.pattern.test(message)) {
        const inferred = { ...base, ...rule.apply(message, state), rule: rule.name };
        inferred.fallbackAnimation = fallbackAnimationFor(state);
        inferred.bubbleText = clipBubbleText(message);
        return inferred;
      }
    }

    return {
      ...base,
      rule: 'state',
      fallbackAnimation: fallbackAnimationFor(state),
      bubbleText: clipBubbleText(message),
    };
  }

  return {
    MESSAGE_LIMIT,
    clipBubbleText,
    inferBehavior,
  };
});
