/**
 * UniPet Overlay - CSS spritesheet animation engine.
 *
 * Renders a Codex-compatible spritesheet using CSS background-position.
 * Receives state updates from the bridge via WebSocket and IPC.
 */

// ---- Codex spritesheet adapter ----
const spritesheet = window.UnipetSpritesheetAdapter || {
    readRenderScale: () => 0.5,
    displaySize: () => ({ width: 96, height: 104 }),
    backgroundSize: () => ({ width: 768, height: 936 }),
    configure: () => ({}),
    getAnimation: () => ({
        frames: Array.from({ length: 6 }, (_, index) => ({ spriteIndex: index, durationMs: 166 })),
        loopStart: 0,
        fallback: 'idle',
    }),
    getFrame: (stateName, frame) => ({ spriteIndex: Math.max(0, frame || 0), durationMs: 166 }),
    framePosition: (stateName, frame) => `-${Math.max(0, frame || 0) * 96}px 0`,
    animationDurationMs: (animation, start = 0, end = undefined) => {
        const frames = animation && animation.frames || [];
        return frames
            .slice(start, end === undefined ? frames.length : end)
            .reduce((total, frame) => total + Math.max(1, Number(frame.durationMs || 166)), 0);
    },
    currentAnimationFrame: (animation, elapsedMs) => {
        const frames = animation && animation.frames || [];
        if (!frames.length) return null;
        const index = Math.floor((Number(elapsedMs) || 0) / 166) % frames.length;
        return { frameIndex: index, spriteIndex: frames[index].spriteIndex, delayMs: 166, completed: false };
    },
};
const RENDER_SCALE = spritesheet.readRenderScale(new URLSearchParams(window.location.search).get('scale'));
let displaySize = spritesheet.displaySize(RENDER_SCALE);

// ---- DOM refs ----
const containerEl = document.getElementById('pet-container');
const spriteEl = document.getElementById('pet-sprite');
const bubbleEl = document.getElementById('pet-bubble');
const bubbleTextEl = document.getElementById('bubble-text');
const statusEl = document.getElementById('pet-status');
const statusCardEl = document.getElementById('pet-status-card');
const statusCardStateEl = document.getElementById('status-card-state');
const statusCardSourceRowEl = document.getElementById('status-card-source-row');
const statusCardSourceEl = document.getElementById('status-card-source');
const statusCardTaskRowEl = document.getElementById('status-card-task-row');
const statusCardTaskEl = document.getElementById('status-card-task');
const statusCardEventRowEl = document.getElementById('status-card-event-row');
const statusCardEventEl = document.getElementById('status-card-event');
const statusCardDurationRowEl = document.getElementById('status-card-duration-row');
const statusCardDurationEl = document.getElementById('status-card-duration');
const behavior = window.UnipetBehavior || {
    inferBehavior: (pet) => ({
        state: pet && pet.state || 'idle',
        animation: pet && pet.state || 'idle',
        message: pet && pet.message || '',
        bubbleText: pet && pet.message || '',
        displayStatus: pet && pet.state || 'waiting',
        displayLabel: pet && pet.state || 'waiting',
        displayTone: pet && pet.state || 'waiting',
    }),
    clipBubbleText: (text) => String(text || '').slice(0, 20),
    safeSummary: (text) => String(text || '').slice(0, 44),
};
const BUBBLE_MIN_VISIBLE_MS = 3200;
const BUBBLE_STATE_MS = {
    idle: 0,
    running: 4500,
    waiting: 12000,
    failed: 9000,
    review: 6500,
};

function configureSpriteSize() {
    const root = document.documentElement;
    displaySize = spritesheet.displaySize(RENDER_SCALE);
    const bg = spritesheet.backgroundSize(RENDER_SCALE);
    root.style.setProperty('--pet-width', `${displaySize.width}px`);
    root.style.setProperty('--pet-height', `${displaySize.height}px`);
    spriteEl.style.backgroundSize = `${bg.width}px ${bg.height}px`;
}

const reduceMotionQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function reducedMotionEnabled() {
    return Boolean(reduceMotionQuery && reduceMotionQuery.matches);
}

function nowMs() {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
}

// ---- Small motion layer: CSS classes, transient effects, idle life ----
const motion = {
    effectTimer: null,
    idleTimer: null,

    apply(intent) {
        setPrefixedClass('state-', intent.state || 'idle');
        setPrefixedClass('display-', intent.displayStatus || intent.state || 'waiting');
        setPrefixedClass('emotion-', intent.emotion || 'calm');
        setPrefixedClass('motion-', intent.motion || 'idle');
    },

    trigger(effectName, duration = 900) {
        if (!effectName) return;
        clearTimeout(this.effectTimer);
        removePrefixedClasses('effect-');
        containerEl.classList.add(`effect-${effectName}`);
        this.effectTimer = setTimeout(() => {
            removePrefixedClasses('effect-');
        }, duration);
    },

    scheduleIdle() {
        clearTimeout(this.idleTimer);
        const delay = 26000 + Math.round(Math.random() * 32000);
        this.idleTimer = setTimeout(() => this.runIdleMoment(), delay);
    },

    runIdleMoment() {
        if (anim.currentBridgeState !== 'idle' || dragActive) {
            this.scheduleIdle();
            return;
        }

        const moment = behavior.nextIdleMoment
            ? behavior.nextIdleMoment()
            : { type: 'none' };
        if (moment.effect) {
            this.trigger(moment.effect, moment.durationMs || 450);
        }
        if (moment.type === 'look-left' || moment.type === 'look-right') {
            anim.playTemporary(moment.animation || 'running_left', moment.durationMs || 900);
        } else if (moment.type === 'hop') {
            anim.playPreview(moment.animation || 'jumping');
        }
        this.scheduleIdle();
    },

    setDragging(active) {
        containerEl.classList.toggle('is-dragging', Boolean(active));
    },
};

function removePrefixedClasses(prefix) {
    for (const name of Array.from(containerEl.classList)) {
        if (name.startsWith(prefix)) containerEl.classList.remove(name);
    }
}

function setPrefixedClass(prefix, value) {
    removePrefixedClasses(prefix);
    containerEl.classList.add(`${prefix}${value}`);
}

// ---- Animation controller ----
const anim = {
    currentState: null,
    currentBridgeState: 'idle',
    currentFrame: 0,
    animationStartedAt: nowMs(),
    frameTimer: null,
    temporaryTimer: null,
    settleTimer: null,
    spritesheetUrl: 'assets/default/spritesheet.webp',
    petId: 'uni',
    lifeState: behavior.createLifeState ? behavior.createLifeState() : null,
    bubbleTimer: null,
    lastBubbleText: '',
    lastBubbleAt: 0,
    currentBridgeMessage: '',
    activePet: null,
    currentIntent: null,

    /** Load a spritesheet (change pet skin). */
    loadSpritesheet(url) {
        if (!url || this.spritesheetUrl === url) return;
        this.spritesheetUrl = url;
        spriteEl.style.backgroundImage = `url("${url}")`;
        this.renderFrame();
    },

    applyPetConfig(config) {
        if (!config || !config.spritesheetUrl) return;
        if (spritesheet.configure) {
            try {
                spritesheet.configure(config.manifest || {});
                configureSpriteSize();
            } catch (error) {
                console.warn('Invalid pet manifest, keeping previous animation model:', error.message);
            }
        }
        this.petId = config.id || this.petId;
        this.loadSpritesheet(config.spritesheetUrl);
        spriteEl.removeAttribute('title');
    },

    /** Get animation config for a state name. */
    getConfig(stateName) {
        return spritesheet.getAnimation(stateName);
    },

    /** Transition from a bridge state/message into a local behavior intent. */
    transition(stateName, message, petSnapshot) {
        this.currentBridgeMessage = message || '';
        if (arguments.length >= 3) {
            this.activePet = petSnapshot ? { ...petSnapshot } : null;
        }
        const intent = behavior.inferBehavior({ state: stateName, message }, this.lifeState);
        if (intent.life) this.lifeState = intent.life;
        this.transitionIntent(intent);
    },

    transitionIntent(intent) {
        this.currentIntent = intent;
        const normalized = intent.animation || intent.state || 'idle';
        const cfg = this.getConfig(normalized);
        const previousBridgeState = this.currentBridgeState;
        const nextBridgeState = intent.state || 'idle';
        const isSettling = previousBridgeState !== 'idle' && nextBridgeState === 'idle';

        this.currentBridgeState = nextBridgeState;
        motion.apply(intent);
        if (intent.effect || isSettling) {
            motion.trigger(intent.effect || 'settle', isSettling ? 800 : 900);
        }

        // Keep looping animations running while still updating fresh messages.
        if (this.currentState === normalized && this.animationLoops(cfg) && !this.currentFrameLimit) {
            if (intent.bubbleText) this.showBubble(intent.bubbleText, nextBridgeState, intent.bubbleMs);
            statusEl.textContent = intent.displayLabel || nextBridgeState;
            statusCard.render();
            if (isSettling) this.normalizeIdleAfterSettle();
            return;
        }

        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;

        if (this.animationLoops(cfg)) {
            this.startLoop();
        } else {
            this.startOneShot(cfg, intent.fallbackAnimation);
        }

        // Show bubble if message provided
        if (intent.bubbleText) this.showBubble(intent.bubbleText, nextBridgeState, intent.bubbleMs);
        statusEl.textContent = intent.displayLabel || nextBridgeState;
        statusCard.render();
        if (isSettling) this.normalizeIdleAfterSettle();
    },

    /** Render current frame via CSS background-position. */
    renderFrame() {
        const tick = this.currentAnimationTick();
        if (tick) this.currentFrame = tick.frameIndex;
        spriteEl.style.backgroundPosition = spritesheet.framePosition(
            this.currentState,
            this.currentFrame,
            RENDER_SCALE,
        );
    },

    animationLoops(cfg) {
        return Number.isInteger(cfg && cfg.loopStart);
    },

    currentAnimationTick() {
        const cfg = this.getConfig(this.currentState);
        const frames = cfg && cfg.frames || [];
        if (!frames.length) return null;
        if (reducedMotionEnabled()) {
            return {
                frameIndex: 0,
                spriteIndex: frames[0].spriteIndex,
                delayMs: null,
                completed: false,
            };
        }

        const elapsed = Math.max(0, nowMs() - this.animationStartedAt);
        let activeAnimation = cfg;
        if (Number.isInteger(this.currentFrameLimit)) {
            const limit = Math.max(1, Math.min(this.currentFrameLimit, frames.length));
            const limitDuration = spritesheet.animationDurationMs(cfg, 0, limit);
            if (elapsed >= limitDuration) {
                return {
                    frameIndex: limit - 1,
                    spriteIndex: frames[limit - 1].spriteIndex,
                    delayMs: null,
                    completed: true,
                    fallback: this.currentFallbackState || cfg.fallback || 'idle',
                };
            }
            activeAnimation = {
                ...cfg,
                frames: frames.slice(0, limit),
                loopStart: null,
            };
        }

        const tick = spritesheet.currentAnimationFrame(activeAnimation, elapsed);
        if (!tick) return null;
        if (tick.completed) {
            return {
                ...tick,
                fallback: this.currentFallbackState || cfg.fallback || 'idle',
            };
        }
        return tick;
    },

    /** Start animation playback, honoring per-frame durations when available. */
    startLoop() {
        this.startAnimation();
    },

    startAnimation({ fallbackState = null, frameLimit = null } = {}) {
        this.stopLoop();
        this.currentFallbackState = fallbackState || null;
        this.currentFrameLimit = Number.isInteger(frameLimit) ? frameLimit : null;
        this.animationStartedAt = nowMs();
        this.currentFrame = 0;
        this.renderFrame();
        this.scheduleNextFrame();
    },

    scheduleNextFrame() {
        if (reducedMotionEnabled()) return;
        const tick = this.currentAnimationTick();
        if (!tick) return;
        if (tick.completed) {
            this.switchToFallback(tick.fallback);
            return;
        }
        if (!tick.delayMs) return;
        this.frameTimer = setTimeout(() => {
            const nextTick = this.currentAnimationTick();
            if (nextTick && nextTick.completed) {
                this.switchToFallback(nextTick.fallback);
                return;
            }
            this.renderFrame();
            this.scheduleNextFrame();
        }, Math.max(16, Math.ceil(tick.delayMs)));
    },

    switchToFallback(fallbackState) {
        const fallback = fallbackState || 'idle';
        if (fallback === this.currentState && !this.currentFrameLimit) return;
        this.stopLoop();
        this.currentState = fallback === this.currentState ? 'idle' : fallback;
        this.startLoop();
    },

    /** Play a one-shot animation, then return to a real bridge state. */
    startOneShot(cfg, fallbackState) {
        const fallback = fallbackState || cfg.fallback || 'idle';
        const totalFrames = cfg.primaryFrameCount || (cfg.frames || []).length;
        this.startAnimation({ fallbackState: fallback, frameLimit: totalFrames });
    },

    playPreview(stateName) {
        const returnState = this.currentState && this.currentState !== stateName
            ? this.currentState
            : 'idle';
        const normalized = stateName || 'idle';
        const cfg = this.getConfig(normalized);
        if (this.currentState === normalized) return;

        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.startOneShot(cfg, returnState);
        statusEl.textContent = normalized;
    },

    playTemporary(stateName, duration) {
        const returnState = this.currentState || 'idle';
        const normalized = stateName || 'idle';
        const cfg = this.getConfig(normalized);
        if (!this.animationLoops(cfg) || this.currentState === normalized) return;

        clearTimeout(this.temporaryTimer);
        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.startLoop();
        this.temporaryTimer = setTimeout(() => {
            if (this.currentBridgeState !== 'idle') return;
            this.stopLoop();
            this.currentState = returnState;
            this.currentFrame = 0;
            this.startLoop();
        }, duration || 900);
    },

    playDrag(direction) {
        const normalized = direction === 'left' ? 'running_left' : 'running_right';
        const cfg = this.getConfig(normalized);

        clearTimeout(this.temporaryTimer);
        setPrefixedClass('direction-', direction === 'left' ? 'left' : 'right');
        if (this.currentState !== normalized) {
            this.stopLoop();
            this.currentState = normalized;
            this.currentFrame = 0;
        }
        this.startLoop();
    },

    resumeBridgeState() {
        this.transition(this.currentBridgeState, this.currentBridgeMessage);
    },

    normalizeIdleAfterSettle() {
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
            if (this.currentBridgeState !== 'idle' || this.currentState !== 'idle') return;
            this.startLoop();
        }, 1200);
    },

    stopLoop() {
        if (this.frameTimer) {
            clearTimeout(this.frameTimer);
            this.frameTimer = null;
        }
        this.currentFallbackState = null;
        this.currentFrameLimit = null;
    },

    /** Show a speech bubble for a few seconds. */
    showBubble(text, stateName, requestedMs) {
        const displayText = behavior.clipBubbleText(text);
        if (!displayText) return;
        const duration = normalizeBubbleMs(requestedMs, stateName);
        if (duration <= 0) return;
        const now = Date.now();
        if (displayText === this.lastBubbleText && now - this.lastBubbleAt < 5000) return;

        if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
        this.lastBubbleText = displayText;
        this.lastBubbleAt = now;
        bubbleTextEl.textContent = displayText;
        bubbleEl.classList.remove('hidden');
        this.bubbleTimer = setTimeout(() => {
            bubbleEl.classList.add('hidden');
        }, duration);
    },
};

function normalizeBubbleMs(requestedMs, stateName) {
    const raw = Number(requestedMs || 0);
    const key = stateName || 'running';
    const fallback = Object.prototype.hasOwnProperty.call(BUBBLE_STATE_MS, key)
        ? BUBBLE_STATE_MS[key]
        : BUBBLE_STATE_MS.running;
    const value = Number.isFinite(raw) && raw > 0 ? raw : fallback;
    if (!value) return 0;
    return Math.max(BUBBLE_MIN_VISIBLE_MS, Math.min(value, 15000));
}

const statusCard = {
    hideTimer: null,
    tickTimer: null,
    pinned: false,

    show({ pinned = false } = {}) {
        if (!statusCardEl) return;
        clearTimeout(this.hideTimer);
        if (pinned) this.pinned = true;
        this.render();
        bubbleEl.classList.add('hidden');
        statusCardEl.classList.remove('hidden');
        statusCardEl.setAttribute('aria-hidden', 'false');
        this.startTicking();
        if (pinned) {
            this.hideTimer = setTimeout(() => this.hide({ force: true }), 6500);
        }
    },

    scheduleHide(delay = 500) {
        if (this.pinned || !statusCardEl) return;
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.hide(), delay);
    },

    hide({ force = false } = {}) {
        if (!force && this.pinned) return;
        clearTimeout(this.hideTimer);
        this.pinned = false;
        if (statusCardEl) {
            statusCardEl.classList.add('hidden');
            statusCardEl.setAttribute('aria-hidden', 'true');
        }
        this.stopTicking();
    },

    togglePinned() {
        if (!statusCardEl) return;
        if (!statusCardEl.classList.contains('hidden') && this.pinned) {
            this.hide({ force: true });
            return;
        }
        this.show({ pinned: true });
    },

    startTicking() {
        if (this.tickTimer) return;
        this.tickTimer = setInterval(() => this.render(), 1000);
    },

    stopTicking() {
        if (!this.tickTimer) return;
        clearInterval(this.tickTimer);
        this.tickTimer = null;
    },

    render() {
        if (!statusCardEl) return;
        const intent = anim.currentIntent || {};
        const pet = anim.activePet || null;
        const displayStatus = intent.displayStatus || (intent.state === 'failed' ? 'problem' : intent.state) || 'waiting';
        const displayLabel = intent.displayLabel || labelForDisplayStatus(displayStatus);
        const task = taskSummary(pet, intent);
        const event = recentEvent(intent, displayLabel);
        const duration = formatDuration(pet && pet.updatedAt);

        setStatusCardTone(displayStatus);
        statusCardStateEl.textContent = displayLabel;
        setCardRow(statusCardSourceRowEl, statusCardSourceEl, pet && pet.source);
        setCardRow(statusCardTaskRowEl, statusCardTaskEl, task);
        setCardRow(statusCardEventRowEl, statusCardEventEl, event);
        setCardRow(statusCardDurationRowEl, statusCardDurationEl, duration);
    },
};

function setStatusCardTone(displayStatus) {
    const tone = displayStatus || 'waiting';
    for (const name of Array.from(statusCardEl.classList)) {
        if (name.startsWith('status-')) statusCardEl.classList.remove(name);
    }
    statusCardEl.classList.add(`status-${tone}`);
}

function setCardRow(rowEl, valueEl, value) {
    if (!rowEl || !valueEl) return;
    const text = String(value || '').trim();
    rowEl.hidden = !text;
    valueEl.textContent = text;
}

function taskSummary(pet, intent) {
    if (!pet) return '';
    const summary = intent.messageSummary || behavior.safeSummary(pet.message);
    const stateText = String(pet.state || '').trim();
    if (!summary || summary === stateText) return '';
    return summary;
}

function recentEvent(intent, displayLabel) {
    const event = String(intent.displayEvent || '').trim();
    if (!event || event === displayLabel) return '';
    return event;
}

function formatDuration(updatedAt) {
    const value = Number(updatedAt);
    if (!Number.isFinite(value) || value <= 0) return '';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value));
    if (seconds < 5) return '刚刚';
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes ? `${hours}小时${restMinutes}分` : `${hours}小时`;
}

function labelForDisplayStatus(displayStatus) {
    return {
        running: '运行中',
        thinking: '思考中',
        waiting: '等待中',
        confirm: '需要确认',
        done: '完成',
        problem: '遇到问题',
    }[displayStatus] || '等待中';
}

// ---- Initialise ----
function init() {
    configureSpriteSize();

    // Listen for pet events from main process
    if (window.unipetAPI) {
        window.unipetAPI.onPetEvent((event) => {
            if (event.currentPet) anim.applyPetConfig(event.currentPet);
            const pet = event.activePet || (event.pets || [])[0];
            if (pet) {
                anim.transition(pet.state, pet.message, pet);
            } else {
                anim.transition('idle', '', null);
            }
        });

        window.unipetAPI.onBridgeConnected((connected) => {
            statusEl.textContent = connected ? 'connected' : 'disconnected';
        });

        if (window.unipetAPI.onPetConfig) {
            window.unipetAPI.onPetConfig((config) => {
                anim.applyPetConfig(config);
            });
        }
    }

    // Initial render
    anim.transition('idle', 'UniPet ready', null);
    motion.scheduleIdle();

    // Pointer interactions are temporary animations; bridge state remains authoritative.
    spriteEl.addEventListener('click', () => {
        anim.playPreview('jumping');
        statusCard.togglePinned();
    });
    containerEl.addEventListener('mouseenter', () => {
        if (dragActive) return;
        motion.trigger('blink', 420);
        if (anim.currentBridgeState === 'idle') anim.playPreview('waving');
        statusCard.show();
    });
    containerEl.addEventListener('mouseleave', () => {
        statusCard.scheduleHide();
    });
}

// ---- Drag (pass through to main process) ----
let dragActive = false;
let dragLastX = 0;
let dragDirection = null;

spriteEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragActive = true;
    dragLastX = e.screenX;
    dragDirection = null;
    motion.setDragging(true);
    statusCard.hide({ force: true });
    if (window.unipetAPI) {
        window.unipetAPI.petDragStart({ screenX: e.screenX, screenY: e.screenY });
    }
});

document.addEventListener('mousemove', (e) => {
    if (!dragActive) return;
    const deltaX = e.screenX - dragLastX;
    if (Math.abs(deltaX) >= 2) {
        const nextDirection = deltaX < 0 ? 'left' : 'right';
        if (nextDirection !== dragDirection) {
            dragDirection = nextDirection;
            anim.playDrag(dragDirection);
        }
    }
    dragLastX = e.screenX;
    if (window.unipetAPI) window.unipetAPI.petDragMove({ screenX: e.screenX, screenY: e.screenY });
});

document.addEventListener('mouseup', () => {
    if (!dragActive) return;
    dragActive = false;
    dragDirection = null;
    motion.setDragging(false);
    removePrefixedClasses('direction-');
    motion.trigger('settle', 700);
    anim.resumeBridgeState();
    if (window.unipetAPI) window.unipetAPI.petDragEnd();
});

// Start
init();
