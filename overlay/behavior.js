/**
 * UniPet behavior facade.
 *
 * Kept as the stable renderer-facing API while the implementation lives in
 * overlay/life. Connectors still only send bridge facts: state and message.
 */
(function initBehavior(root, factory) {
  const deps = typeof module === 'object' && module.exports
    ? {
        interpreter: require('./life/interpreter'),
        planner: require('./life/planner'),
      }
    : {
        interpreter: root.UnipetLifeInterpreter,
        planner: root.UnipetLifePlanner,
      };
  const api = factory(deps.interpreter, deps.planner);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetBehavior = api;
})(typeof window !== 'undefined' ? window : globalThis, function behaviorFactory(interpreter, planner) {
  function inferBehavior(pet, lifeState) {
    return planner.planBehavior(pet, lifeState);
  }

  return {
    MESSAGE_LIMIT: interpreter.MESSAGE_LIMIT,
    clipBubbleText: interpreter.clipBubbleText,
    interpretEvent: interpreter.interpretEvent,
    safeSummary: interpreter.safeSummary,
    createLifeState: planner.createLifeState,
    updateLifeState: planner.updateLifeState,
    inferBehavior,
    nextIdleMoment: planner.nextIdleMoment,
  };
});
