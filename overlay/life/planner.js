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
    idle: { animation: 'idle', fps: 1, emotion: 'calm', motion: 'idle' },
    running: { animation: 'running', fps: 6, emotion: 'focused', motion: 'work' },
    waiting: { animation: 'waiting', fps: 4, emotion: 'curious', motion: 'wait' },
    failed: { animation: 'failed', fps: 4, emotion: 'frustrated', effect: 'shake', motion: 'alert' },
    review: { animation: 'review', fps: 4, emotion: 'happy', effect: 'bounce', motion: 'idle' },
  };

  const KIND_INTENTS = {
    failure: { animation: 'failed', fps: 5, emotion: 'frustrated', effect: 'shake', motion: 'alert' },
    success: { animation: 'review', fps: 5, emotion: 'happy', effect: 'bounce', motion: 'idle' },
    delegate: { animation: 'jumping', fps: 6, emotion: 'excited', effect: 'bounce', motion: 'work' },
    network: { animation: 'waving', fps: 5, emotion: 'focused', motion: 'scan' },
    write: { animation: 'running_right', fps: 6, emotion: 'focused', motion: 'work' },
    read: { animation: 'running_left', fps: 6, emotion: 'focused', motion: 'scan' },
    shell: { animation: 'running', fps: 6, emotion: 'focused', motion: 'work' },
    thinking: { animation: 'running', fps: 3, emotion: 'focused', motion: 'think' },
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
      life,
    };

    return intent;
  }

  function nextIdleMoment(random = Math.random) {
    const roll = random();
    if (roll < 0.70) return { type: 'none', durationMs: 0 };
    if (roll < 0.85) return { type: 'blink', effect: 'blink', durationMs: 450 };
    if (roll < 0.95) return { type: 'look', animation: 'running_left', fps: 6, durationMs: 1100 };
    return { type: 'hop', animation: 'jumping', effect: 'bounce', fps: 6, durationMs: 1000 };
  }

  return {
    createLifeState,
    updateLifeState,
    planBehavior,
    nextIdleMoment,
    fallbackAnimationFor,
  };
});
