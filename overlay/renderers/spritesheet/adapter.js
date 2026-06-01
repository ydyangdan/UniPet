/**
 * UniPet Codex-compatible spritesheet adapter.
 *
 * The official Codex pet model is animation-track based: pet.json describes a
 * frame grid and optional named animations made of sprite indices. Rendering
 * code should not reason in rows/fps directly.
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
  const SHEET_WIDTH = CELL_W * SHEET_COLUMNS;
  const SHEET_HEIGHT = CELL_H * SHEET_ROWS;
  const MAX_PET_FRAMES = 256;
  const MAX_ANIMATION_FPS = 60;

  const DEFAULT_FRAME = {
    width: CELL_W,
    height: CELL_H,
    columns: SHEET_COLUMNS,
    rows: SHEET_ROWS,
  };

  const NAME_ALIASES = {
    moveRight: 'move_right',
    moveLeft: 'move_left',
    'running-right': 'running_right',
    'running-left': 'running_left',
  };

  let activeModel = normalizeManifest({});

  function readRenderScale(value) {
    const parsed = Number.parseFloat(value || '0.5');
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.min(1, Math.max(0.35, parsed));
  }

  function frameFromManifest(manifest = {}) {
    const frame = manifest && typeof manifest.frame === 'object' && manifest.frame
      ? manifest.frame
      : null;
    const legacy = !frame && (
      manifest.frameWidth !== undefined ||
      manifest.frameHeight !== undefined ||
      manifest.columns !== undefined ||
      manifest.rows !== undefined
    );
    return {
      width: numberOr(frame && frame.width, legacy ? manifest.frameWidth : DEFAULT_FRAME.width),
      height: numberOr(frame && frame.height, legacy ? manifest.frameHeight : DEFAULT_FRAME.height),
      columns: numberOr(frame && frame.columns, legacy ? manifest.columns : DEFAULT_FRAME.columns),
      rows: numberOr(frame && frame.rows, legacy ? manifest.rows : DEFAULT_FRAME.rows),
    };
  }

  function numberOr(value, fallback) {
    if (value === null || value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function validateFrame(frame) {
    for (const key of ['width', 'height', 'columns', 'rows']) {
      if (!Number.isInteger(frame[key]) || frame[key] <= 0) {
        throw new Error(`pet frame ${key} must be a positive integer`);
      }
    }
    const totalWidth = frame.width * frame.columns;
    const totalHeight = frame.height * frame.rows;
    if (totalWidth !== SHEET_WIDTH || totalHeight !== SHEET_HEIGHT) {
      throw new Error(
        `pet frame grid must cover spritesheet exactly: expected ${SHEET_WIDTH}x${SHEET_HEIGHT}, got ${totalWidth}x${totalHeight}`,
      );
    }
    const frameCount = frame.columns * frame.rows;
    if (frameCount > MAX_PET_FRAMES) {
      throw new Error(`pet frame count ${frameCount} exceeds maximum ${MAX_PET_FRAMES}`);
    }
  }

  function frameCount(frame) {
    return frame.columns * frame.rows;
  }

  function normalizeManifest(manifest = {}) {
    const frame = frameFromManifest(manifest);
    validateFrame(frame);
    const totalFrames = frameCount(frame);
    const animations = normalizeAnimations(manifest.animations || {}, totalFrames);
    return { frame, animations };
  }

  function normalizeAnimations(specs, totalFrames) {
    const animations = defaultAnimations();
    const customSpecs = specs && typeof specs === 'object' && !Array.isArray(specs)
      ? specs
      : {};

    for (const [name, spec] of Object.entries(customSpecs)) {
      animations[canonicalName(name)] = normalizeAnimationSpec(name, spec, totalFrames);
    }

    if (!animations.idle) animations.idle = idleAnimation();
    validateAnimations(animations, totalFrames);
    return animations;
  }

  function normalizeAnimationSpec(name, spec, totalFrames) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      throw new Error(`animation ${name} must be an object`);
    }
    if (!Array.isArray(spec.frames) || spec.frames.length === 0) {
      throw new Error(`animation ${name} must include at least one frame`);
    }

    const fps = spec.fps === undefined ? 8 : Number(spec.fps);
    if (!Number.isFinite(fps) || fps <= 0 || fps > MAX_ANIMATION_FPS) {
      throw new Error(`animation ${name} fps must be finite and between 0 and ${MAX_ANIMATION_FPS}`);
    }
    const durationMs = Math.round(1000 / fps);
    const fallback = String(spec.fallback || 'idle');
    const explicitLoopStart = spec.loopStart !== undefined ? spec.loopStart : spec.loop_start;
    const loopStart = explicitLoopStart !== undefined
      ? normalizeLoopStart(name, explicitLoopStart, spec.frames.length)
      : (spec.loop === false ? null : 0);
    const frames = spec.frames.map((frameSpec) => normalizeFrameSpec(name, frameSpec, totalFrames, durationMs));

    return {
      name: canonicalName(name),
      frames,
      loopStart,
      fallback: canonicalName(fallback),
      primaryFrameCount: frames.length,
    };
  }

  function normalizeFrameSpec(name, frameSpec, totalFrames, fallbackDurationMs) {
    const rawIndex = typeof frameSpec === 'object' && frameSpec !== null
      ? (frameSpec.spriteIndex ?? frameSpec.sprite_index ?? frameSpec.index ?? frameSpec.frame)
      : frameSpec;
    const spriteIndex = Number(rawIndex);
    if (!Number.isInteger(spriteIndex) || spriteIndex < 0 || spriteIndex >= totalFrames) {
      throw new Error(`animation ${name} references invalid frame ${rawIndex}`);
    }

    const rawDuration = typeof frameSpec === 'object' && frameSpec !== null
      ? (frameSpec.durationMs ?? frameSpec.duration_ms ?? frameSpec.duration ?? frameSpec.ms)
      : undefined;
    const durationMs = Number(rawDuration === undefined ? fallbackDurationMs : rawDuration);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`animation ${name} frame duration must be positive`);
    }
    return { spriteIndex, durationMs: Math.round(durationMs) };
  }

  function normalizeLoopStart(name, value, frameLength) {
    if (value === null || value === false) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed >= frameLength) {
      throw new Error(`animation ${name} loopStart must reference an existing frame`);
    }
    return parsed;
  }

  function validateAnimations(animations, totalFrames) {
    for (const [name, animation] of Object.entries(animations)) {
      if (!animation.frames.length) throw new Error(`animation ${name} must include at least one frame`);
      for (const frame of animation.frames) {
        if (!Number.isInteger(frame.spriteIndex) || frame.spriteIndex < 0 || frame.spriteIndex >= totalFrames) {
          throw new Error(`animation ${name} references invalid frame ${frame.spriteIndex}`);
        }
      }
      if (animation.fallback && !animations[animation.fallback]) {
        throw new Error(`animation ${name} fallback ${animation.fallback} does not exist`);
      }
    }
  }

  function defaultAnimations() {
    return {
      idle: idleAnimation(),
      running_right: appStateAnimation('running_right', 1, 8, 120, 220),
      running_left: appStateAnimation('running_left', 2, 8, 120, 220),
      waving: appStateAnimation('waving', 3, 4, 140, 280),
      jumping: appStateAnimation('jumping', 4, 5, 140, 280),
      failed: appStateAnimation('failed', 5, 8, 140, 240),
      waiting: appStateAnimation('waiting', 6, 6, 150, 260),
      running: appStateAnimation('running', 7, 6, 120, 220),
      review: appStateAnimation('review', 8, 6, 150, 280),
      move_right: appStateAnimation('move_right', 1, 8, 120, 220),
      move_left: appStateAnimation('move_left', 2, 8, 120, 220),
      wave: appStateAnimation('wave', 3, 4, 140, 280),
      bounce: appStateAnimation('bounce', 4, 5, 140, 280),
      sad: appStateAnimation('sad', 5, 8, 140, 240),
    };
  }

  function idleAnimation() {
    return {
      name: 'idle',
      frames: [
        frame(0, 1680),
        frame(1, 660),
        frame(2, 660),
        frame(3, 840),
        frame(4, 840),
        frame(5, 1920),
      ],
      loopStart: 0,
      fallback: 'idle',
      primaryFrameCount: 6,
    };
  }

  function appStateAnimation(name, rowIndex, count, frameDurationMs, finalFrameDurationMs) {
    const primary = Array.from({ length: count }, (_, columnIndex) => {
      const durationMs = columnIndex === count - 1 ? finalFrameDurationMs : frameDurationMs;
      return frame(rowIndex * SHEET_COLUMNS + columnIndex, durationMs);
    });
    const primaryFrames = [...primary, ...primary, ...primary];
    return {
      name,
      frames: [...primaryFrames, ...idleAnimation().frames],
      loopStart: primaryFrames.length,
      fallback: 'idle',
      primaryFrameCount: primaryFrames.length,
    };
  }

  function frame(spriteIndex, durationMs) {
    return { spriteIndex, durationMs };
  }

  function animationDurationMs(animation, start = 0, end = undefined) {
    const frames = animation && Array.isArray(animation.frames) ? animation.frames : [];
    const from = Math.max(0, Math.min(Number(start) || 0, frames.length));
    const to = end === undefined
      ? frames.length
      : Math.max(from, Math.min(Number(end) || 0, frames.length));
    return frames
      .slice(from, to)
      .reduce((total, frameData) => total + Math.max(1, Number(frameData.durationMs || 0)), 0);
  }

  function currentAnimationFrame(animation, elapsedMs) {
    const frames = animation && Array.isArray(animation.frames) ? animation.frames : [];
    if (frames.length === 0) return null;
    if (frames.length === 1) {
      return frameTick(frames[0], 0, null, false);
    }

    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    const loopStart = Number.isInteger(animation.loopStart) && animation.loopStart < frames.length
      ? animation.loopStart
      : null;

    if (loopStart !== null) {
      const totalMs = animationDurationMs(animation);
      const prefixMs = animationDurationMs(animation, 0, loopStart);
      const loopMs = animationDurationMs(animation, loopStart);
      const effectiveElapsed = elapsed >= totalMs && loopMs > 0
        ? prefixMs + ((elapsed - prefixMs) % loopMs)
        : elapsed;
      return frameAtElapsed(frames, effectiveElapsed, false);
    }

    const totalMs = animationDurationMs(animation);
    if (elapsed >= totalMs) {
      return frameTick(frames[frames.length - 1], frames.length - 1, null, true);
    }
    return frameAtElapsed(frames, elapsed, false);
  }

  function frameAtElapsed(frames, elapsedMs, completed) {
    let remaining = Math.max(0, Number(elapsedMs) || 0);
    for (let index = 0; index < frames.length; index += 1) {
      const frameData = frames[index];
      const duration = Math.max(1, Number(frameData.durationMs || 0));
      if (remaining < duration) {
        return frameTick(frameData, index, Math.max(1, Math.ceil(duration - remaining)), completed);
      }
      remaining -= duration;
    }
    return frameTick(frames[frames.length - 1], frames.length - 1, null, true);
  }

  function frameTick(frameData, frameIndex, delayMs, completed) {
    return {
      frameIndex,
      spriteIndex: frameData.spriteIndex,
      durationMs: frameData.durationMs,
      delayMs,
      completed: Boolean(completed),
    };
  }

  function canonicalName(name) {
    const value = String(name || 'idle').trim();
    return NAME_ALIASES[value] || value || 'idle';
  }

  function configure(manifest) {
    activeModel = normalizeManifest(manifest || {});
    return activeModel;
  }

  function displaySize(scale, model = activeModel) {
    const renderScale = readRenderScale(scale);
    return {
      width: Math.round(model.frame.width * renderScale),
      height: Math.round(model.frame.height * renderScale),
    };
  }

  function backgroundSize(scale, model = activeModel) {
    const size = displaySize(scale, model);
    return {
      width: size.width * model.frame.columns,
      height: size.height * model.frame.rows,
    };
  }

  function getAnimation(name, model = activeModel) {
    const canonical = canonicalName(name);
    return model.animations[canonical] || model.animations.idle;
  }

  function getFrame(animationName, frameIndex, model = activeModel) {
    const animation = getAnimation(animationName, model);
    const index = Math.max(0, Math.min(Number(frameIndex) || 0, animation.frames.length - 1));
    return animation.frames[index] || animation.frames[0];
  }

  function framePosition(animationName, frameIndex, scale, model = activeModel) {
    const size = displaySize(scale, model);
    const frameData = getFrame(animationName, frameIndex, model);
    const spriteIndex = Math.max(0, frameData.spriteIndex || 0);
    const column = spriteIndex % model.frame.columns;
    const row = Math.floor(spriteIndex / model.frame.columns);
    return `-${column * size.width}px -${row * size.height}px`;
  }

  return {
    CELL_W,
    CELL_H,
    SHEET_COLUMNS,
    SHEET_ROWS,
    SHEET_WIDTH,
    SHEET_HEIGHT,
    DEFAULT_FRAME,
    MAX_ANIMATION_FPS,
    readRenderScale,
    configure,
    normalizeManifest,
    displaySize,
    backgroundSize,
    getAnimation,
    getFrame,
    framePosition,
    canonicalName,
    animationDurationMs,
    currentAnimationFrame,
  };
});
