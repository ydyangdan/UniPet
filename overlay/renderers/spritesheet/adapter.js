/**
 * UniPet spritesheet renderer adapter.
 *
 * Keeps Codex-compatible atlas geometry out of the UI controller. The renderer
 * asks this adapter for animation rows, frame positions, and display sizing.
 */
(function initSpritesheetAdapter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UnipetSpritesheetAdapter = api;
})(typeof window !== 'undefined' ? window : globalThis, function spritesheetAdapterFactory() {
  const CELL_W = 192;
  const CELL_H = 208;
  const SHEET_COLUMNS = 8;
  const SHEET_ROWS = 9;

  const ANIMATION_ROWS = {
    idle: { row: 0, frames: 6, fps: 1, loop: true },
    running: { row: 7, frames: 6, fps: 6, loop: true },
    running_right: { row: 1, frames: 8, fps: 6, loop: true },
    running_left: { row: 2, frames: 8, fps: 6, loop: true },
    waving: { row: 3, frames: 4, fps: 5, loop: false, fallback: 'idle' },
    jumping: { row: 4, frames: 5, fps: 6, loop: false, fallback: 'idle' },
    failed: { row: 5, frames: 8, fps: 4, loop: true },
    waiting: { row: 6, frames: 6, fps: 4, loop: true },
    review: { row: 8, frames: 6, fps: 4, loop: true },
  };

  function readRenderScale(value) {
    const parsed = Number.parseFloat(value || '0.5');
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.min(1, Math.max(0.35, parsed));
  }

  function displaySize(scale) {
    const renderScale = readRenderScale(scale);
    return {
      width: Math.round(CELL_W * renderScale),
      height: Math.round(CELL_H * renderScale),
    };
  }

  function backgroundSize(scale) {
    const size = displaySize(scale);
    return {
      width: size.width * SHEET_COLUMNS,
      height: size.height * SHEET_ROWS,
    };
  }

  function getAnimation(name) {
    return ANIMATION_ROWS[name] || ANIMATION_ROWS.idle;
  }

  function framePosition(name, frame, scale) {
    const size = displaySize(scale);
    const cfg = getAnimation(name);
    const x = Math.max(0, frame || 0) * size.width;
    const y = cfg.row * size.height;
    return `-${x}px -${y}px`;
  }

  return {
    CELL_W,
    CELL_H,
    SHEET_COLUMNS,
    SHEET_ROWS,
    ANIMATION_ROWS,
    readRenderScale,
    displaySize,
    backgroundSize,
    getAnimation,
    framePosition,
  };
});
