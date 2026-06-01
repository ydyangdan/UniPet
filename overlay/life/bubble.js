/**
 * UniPet Life Engine - bubble policy.
 *
 * Owns short user-facing bubble text and timing so event interpretation stays
 * focused on agent signals instead of renderer copy policy.
 */
(function initLifeBubble(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetLifeBubble = api;
})(typeof window !== 'undefined' ? window : globalThis, function lifeBubbleFactory() {
  const MESSAGE_LIMIT = 20;

  const STATE_DURATIONS_MS = {
    idle: 0,
    running: 4500,
    waiting: 10000,
    failed: 9000,
    review: 6500,
  };

  const KIND_DURATIONS_MS = {
    failure: 9000,
    success: 6500,
    permission: 12000,
    delegate: 5000,
    test: 4200,
    build: 4200,
    network: 4500,
    write: 4500,
    read: 4200,
    shell: 4200,
    thinking: 5500,
  };

  function clipBubbleText(text, limit = MESSAGE_LIMIT) {
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    const chars = Array.from(raw);
    if (chars.length <= limit) return raw;
    return `${chars.slice(0, limit).join('')}...`;
  }

  function durationFor(signal = {}) {
    const kind = String(signal.kind || '');
    const state = String(signal.state || 'idle');
    if (Object.hasOwn(KIND_DURATIONS_MS, kind)) return KIND_DURATIONS_MS[kind];
    if (Object.hasOwn(STATE_DURATIONS_MS, state)) return STATE_DURATIONS_MS[state];
    return STATE_DURATIONS_MS.idle;
  }

  return {
    MESSAGE_LIMIT,
    STATE_DURATIONS_MS,
    KIND_DURATIONS_MS,
    clipBubbleText,
    durationFor,
  };
});
