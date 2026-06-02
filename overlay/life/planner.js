/**
 * UniPet Life Engine - behavior planner.
 *
 * Converts life signals into renderer-agnostic behavior intents. Renderers may
 * map these intents to spritesheets, CSS, canvas, or a future lighter shell.
 */
(function initLifePlanner(root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? {
        interpreter: require('./interpreter'),
        bubble: require('./bubble'),
      }
    : {
        interpreter: root.UnipetLifeInterpreter,
        bubble: root.UnipetLifeBubble,
      };
  const api = factory(deps.interpreter, deps.bubble);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetLifePlanner = api;
})(typeof window !== 'undefined' ? window : globalThis, function lifePlannerFactory(interpreter, bubble) {
  const bubblePolicy = bubble || { durationFor: () => 0 };

  const DEFAULT_LIFE_STATE = {
    mood: 'calm',
    energy: 42,
    attention: 'idle',
    lastState: 'idle',
    lastKind: 'idle',
    updatedAt: 0,
  };

  const STATE_INTENTS = {
    idle: { animation: 'idle', emotion: 'calm', motion: 'idle' },
    running: { animation: 'running', emotion: 'focused', motion: 'work' },
    waiting: { animation: 'waiting', emotion: 'curious', motion: 'wait' },
    failed: { animation: 'failed', emotion: 'frustrated', effect: 'shake', motion: 'alert' },
    review: { animation: 'review', emotion: 'happy', effect: 'bounce', motion: 'idle' },
  };

  const KIND_INTENTS = {
    failure: { animation: 'failed', emotion: 'frustrated', effect: 'shake', motion: 'alert' },
    success: { animation: 'review', emotion: 'happy', effect: 'bounce', motion: 'idle' },
    permission: { animation: 'waiting', emotion: 'curious', motion: 'wait' },
    delegate: { animation: 'jumping', emotion: 'excited', effect: 'bounce', motion: 'work' },
    test: { animation: 'running', emotion: 'focused', motion: 'work' },
    build: { animation: 'running_right', emotion: 'focused', motion: 'work' },
    network: { animation: 'waving', emotion: 'focused', motion: 'scan' },
    write: { animation: 'running_right', emotion: 'focused', motion: 'work' },
    read: { animation: 'running_left', emotion: 'focused', motion: 'scan' },
    shell: { animation: 'running', emotion: 'focused', motion: 'work' },
    thinking: { animation: 'running', emotion: 'focused', motion: 'think' },
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
      messageSummary: signal.messageSummary,
      displayStatus: signal.displayStatus,
      displayLabel: signal.displayLabel,
      displayTone: signal.displayTone,
      displayEvent: signal.displayEvent,
      bubbleText: signal.bubbleText,
      rule: signal.rule,
      mood: life.mood,
      energy: life.energy,
      attention: life.attention,
      fallbackAnimation: fallbackAnimationFor(signal.state),
      bubbleMs: bubblePolicy.durationFor(signal),
      life,
    };

    return intent;
  }

  function nextIdleMoment(random = Math.random) {
    const roll = random();
    if (roll < 0.62) return { type: 'none', durationMs: 0 };
    if (roll < 0.78) return { type: 'blink', effect: 'blink', durationMs: 420 };
    if (roll < 0.88) return { type: 'look-left', animation: 'running_left', durationMs: 1300 };
    if (roll < 0.94) return { type: 'look-right', animation: 'running_right', durationMs: 1300 };
    if (roll < 0.985) return { type: 'hop', animation: 'jumping', effect: 'bounce', durationMs: 1100 };
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
