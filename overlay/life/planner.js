/**
 * UniPet Life Engine - behavior planner.
 *
 * Converts life signals into renderer-agnostic behavior intents. Renderers may
 * map these intents to spritesheets, CSS, canvas, or a future lighter shell.
 */
(function initLifePlanner(root, factory) {
  const interpreter = typeof module === 'object' && module.exports
    ? require('./interpreter')
    : root.UnipetLifeInterpreter;
  const api = factory(interpreter);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetLifePlanner = api;
})(typeof window !== 'undefined' ? window : globalThis, function lifePlannerFactory(interpreter) {
  const DEFAULT_LIFE_STATE = {
    mood: 'calm',
    energy: 42,
    attention: 'idle',
    lastState: 'idle',
    lastKind: 'idle',
    updatedAt: 0,
  };

  const STATE_INTENTS = {
    idle: { animation: 'idle', fps: 0.6, emotion: 'calm', motion: 'idle', bubbleMs: 0, tempo: 'quiet' },
    running: { animation: 'running', fps: 5, emotion: 'focused', motion: 'work', bubbleMs: 4500, tempo: 'normal' },
    waiting: { animation: 'waiting', fps: 2.6, emotion: 'curious', motion: 'wait', bubbleMs: 10000, tempo: 'slow' },
    failed: { animation: 'failed', fps: 3.2, emotion: 'frustrated', effect: 'shake', motion: 'alert', bubbleMs: 9000, tempo: 'fast' },
    review: { animation: 'review', fps: 2.8, emotion: 'happy', effect: 'bounce', motion: 'idle', bubbleMs: 6500, tempo: 'slow' },
  };

  const KIND_INTENTS = {
    failure: { animation: 'failed', fps: 3.6, emotion: 'frustrated', effect: 'shake', motion: 'alert', bubbleMs: 9000, tempo: 'fast' },
    success: { animation: 'review', fps: 3.2, emotion: 'happy', effect: 'bounce', motion: 'idle', bubbleMs: 6500, tempo: 'slow' },
    permission: { animation: 'waiting', fps: 2.4, emotion: 'curious', motion: 'wait', bubbleMs: 12000, tempo: 'slow' },
    delegate: { animation: 'jumping', fps: 5, emotion: 'excited', effect: 'bounce', motion: 'work', bubbleMs: 5000, tempo: 'fast' },
    test: { animation: 'running', fps: 5.4, emotion: 'focused', motion: 'work', bubbleMs: 4200, tempo: 'fast' },
    build: { animation: 'running_right', fps: 5, emotion: 'focused', motion: 'work', bubbleMs: 4200, tempo: 'normal' },
    network: { animation: 'waving', fps: 4.2, emotion: 'focused', motion: 'scan', bubbleMs: 4500, tempo: 'normal' },
    write: { animation: 'running_right', fps: 4.8, emotion: 'focused', motion: 'work', bubbleMs: 4500, tempo: 'normal' },
    read: { animation: 'running_left', fps: 4.2, emotion: 'focused', motion: 'scan', bubbleMs: 4200, tempo: 'normal' },
    shell: { animation: 'running', fps: 5, emotion: 'focused', motion: 'work', bubbleMs: 4200, tempo: 'normal' },
    thinking: { animation: 'running', fps: 2.2, emotion: 'focused', motion: 'think', bubbleMs: 5500, tempo: 'slow' },
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function createLifeState(seed = {}) {
    return { ...DEFAULT_LIFE_STATE, ...seed };
  }

  function fallbackAnimationFor(state) {
    return (STATE_INTENTS[state] && STATE_INTENTS[state].animation) || 'idle';
  }

  function updateLifeState(lifeState, signal, now = Date.now()) {
    const current = createLifeState(lifeState);
    return {
      ...current,
      mood: signal.mood || current.mood,
      energy: clamp(current.energy + (signal.energyDelta || 0), 0, 100),
      attention: signal.attention || current.attention,
      lastState: signal.state || current.lastState,
      lastKind: signal.kind || current.lastKind,
      updatedAt: now,
    };
  }

  function planBehavior(pet, lifeState) {
    const signal = interpreter.interpretEvent(pet);
    const life = updateLifeState(lifeState, signal);
    const stateIntent = STATE_INTENTS[signal.state] || STATE_INTENTS.idle;
    const kindIntent = KIND_INTENTS[signal.kind] || {};
    const intent = {
      ...stateIntent,
      ...kindIntent,
      state: signal.state,
      message: signal.message,
      bubbleText: signal.bubbleText,
      rule: signal.rule,
      mood: life.mood,
      energy: life.energy,
      attention: life.attention,
      fallbackAnimation: fallbackAnimationFor(signal.state),
      bubbleMs: kindIntent.bubbleMs || stateIntent.bubbleMs || 0,
      tempo: kindIntent.tempo || stateIntent.tempo || 'normal',
      life,
    };

    return intent;
  }

  function nextIdleMoment(random = Math.random) {
    const roll = random();
    if (roll < 0.62) return { type: 'none', durationMs: 0 };
    if (roll < 0.78) return { type: 'blink', effect: 'blink', durationMs: 420 };
    if (roll < 0.88) return { type: 'look-left', animation: 'running_left', fps: 3.6, durationMs: 1300 };
    if (roll < 0.94) return { type: 'look-right', animation: 'running_right', fps: 3.6, durationMs: 1300 };
    if (roll < 0.985) return { type: 'hop', animation: 'jumping', effect: 'bounce', fps: 4.8, durationMs: 1100 };
    return { type: 'sleepy', effect: 'sleepy', durationMs: 1800 };
  }

  return {
    createLifeState,
    updateLifeState,
    planBehavior,
    nextIdleMoment,
    fallbackAnimationFor,
  };
});
