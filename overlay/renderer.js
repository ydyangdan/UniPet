/**
 * UniPet Overlay - CSS spritesheet animation engine.
 *
 * Renders a Codex-compatible spritesheet using CSS background-position.
 * Receives state updates from the bridge via WebSocket and IPC.
 */

// ---- Codex spritesheet animation config ----
const ANIMATION_ROWS = {
    idle:          { row: 0, frames: 6, fps: 6,  loop: true },
    running:       { row: 7, frames: 6, fps: 10, loop: true },
    running_right: { row: 1, frames: 8, fps: 10, loop: true },
    running_left:  { row: 2, frames: 8, fps: 10, loop: true },
    waving:        { row: 3, frames: 4, fps: 8,  loop: false, fallback: 'idle' },
    jumping:       { row: 4, frames: 5, fps: 8,  loop: false, fallback: 'idle' },
    failed:        { row: 5, frames: 8, fps: 6,  loop: true },
    waiting:       { row: 6, frames: 6, fps: 6,  loop: true },
    review:        { row: 8, frames: 6, fps: 6,  loop: true },
};

const CELL_W = 192;
const CELL_H = 208;
const SHEET_COLUMNS = 8;
const SHEET_ROWS = 9;
const RENDER_SCALE = readRenderScale();
const DISPLAY_W = Math.round(CELL_W * RENDER_SCALE);
const DISPLAY_H = Math.round(CELL_H * RENDER_SCALE);

// ---- DOM refs ----
const containerEl = document.getElementById('pet-container');
const spriteEl = document.getElementById('pet-sprite');
const bubbleEl = document.getElementById('pet-bubble');
const bubbleTextEl = document.getElementById('bubble-text');
const statusEl = document.getElementById('pet-status');
const behavior = window.UnipetBehavior || {
    inferBehavior: (pet) => ({
        state: pet && pet.state || 'idle',
        animation: pet && pet.state || 'idle',
        fps: 6,
        message: pet && pet.message || '',
        bubbleText: pet && pet.message || '',
    }),
    clipBubbleText: (text) => String(text || '').slice(0, 20),
};

function readRenderScale() {
    const params = new URLSearchParams(window.location.search);
    const parsed = Number.parseFloat(params.get('scale') || '0.5');
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.min(1, Math.max(0.35, parsed));
}

function configureSpriteSize() {
    const root = document.documentElement;
    root.style.setProperty('--pet-width', `${DISPLAY_W}px`);
    root.style.setProperty('--pet-height', `${DISPLAY_H}px`);
    spriteEl.style.backgroundSize = `${DISPLAY_W * SHEET_COLUMNS}px ${DISPLAY_H * SHEET_ROWS}px`;
}

// ---- Small motion layer: CSS classes, transient effects, idle life ----
const motion = {
    effectTimer: null,
    idleTimer: null,

    apply(intent) {
        setPrefixedClass('state-', intent.state || 'idle');
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
        const delay = 20000 + Math.round(Math.random() * 20000);
        this.idleTimer = setTimeout(() => this.runIdleMoment(), delay);
    },

    runIdleMoment() {
        if (anim.currentBridgeState !== 'idle' || dragActive) {
            this.scheduleIdle();
            return;
        }

        const roll = Math.random();
        if (roll < 0.15) {
            this.trigger('blink', 450);
        } else if (roll < 0.25) {
            anim.playTemporary('running_left', 900, 8);
        } else if (roll < 0.30) {
            anim.playPreview('jumping');
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
    currentFps: null,
    frameTimer: null,
    temporaryTimer: null,
    settleTimer: null,
    spritesheetUrl: 'assets/default/spritesheet.webp',
    petId: 'pounce',
    bubbleTimer: null,
    lastBubbleText: '',
    lastBubbleAt: 0,

    /** Load a spritesheet (change pet skin). */
    loadSpritesheet(url) {
        if (!url || this.spritesheetUrl === url) return;
        this.spritesheetUrl = url;
        spriteEl.style.backgroundImage = `url("${url}")`;
        this.renderFrame();
    },

    applyPetConfig(config) {
        if (!config || !config.spritesheetUrl) return;
        this.petId = config.id || this.petId;
        this.loadSpritesheet(config.spritesheetUrl);
        spriteEl.title = config.displayName || this.petId || 'UniPet';
    },

    /** Get animation config for a state name. */
    getConfig(stateName) {
        return ANIMATION_ROWS[stateName] || ANIMATION_ROWS.idle;
    },

    /** Transition from a bridge state/message into a local behavior intent. */
    transition(stateName, message) {
        this.transitionIntent(behavior.inferBehavior({ state: stateName, message }));
    },

    transitionIntent(intent) {
        const normalized = intent.animation || intent.state || 'idle';
        const cfg = this.getConfig(normalized);
        const previousBridgeState = this.currentBridgeState;
        const nextBridgeState = intent.state || 'idle';
        const isSettling = previousBridgeState !== 'idle' && nextBridgeState === 'idle';
        const fps = isSettling ? Math.max(intent.fps || cfg.fps, 10) : (intent.fps || cfg.fps);

        this.currentBridgeState = nextBridgeState;
        motion.apply(intent);
        if (intent.effect || isSettling) {
            motion.trigger(intent.effect || 'settle', isSettling ? 1200 : 900);
        }

        // Keep looping animations running while still updating fresh messages.
        if (this.currentState === normalized && cfg.loop) {
            if (this.currentFps !== fps) this.startLoop(fps);
            if (intent.bubbleText) this.showBubble(intent.bubbleText);
            statusEl.textContent = nextBridgeState;
            if (isSettling) this.normalizeIdleAfterSettle();
            return;
        }

        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.renderFrame();

        if (cfg.loop) {
            this.startLoop(fps);
        } else {
            // One-shot: play through frames, then fall back
            this.startOneShot(cfg, intent.fallbackAnimation, fps);
        }

        // Show bubble if message provided
        if (intent.bubbleText) this.showBubble(intent.bubbleText);
        statusEl.textContent = nextBridgeState;
        if (isSettling) this.normalizeIdleAfterSettle();
    },

    /** Render current frame via CSS background-position. */
    renderFrame() {

        const cfg = this.getConfig(this.currentState);
        const x = this.currentFrame * DISPLAY_W;
        const y = cfg.row * DISPLAY_H;
        spriteEl.style.backgroundPosition = `-${x}px -${y}px`;
    },

    /** Start looping animation at given FPS. */
    startLoop(fps) {

        this.stopLoop();
        this.currentFps = fps;
        const interval = 1000 / fps;
        this.frameTimer = setInterval(() => {
            const cfg = this.getConfig(this.currentState);
            this.currentFrame = (this.currentFrame + 1) % cfg.frames;
            this.renderFrame();
        }, interval);
    },

    /** Play a one-shot animation, then return to a real bridge state. */
    startOneShot(cfg, fallbackState, fallbackFps) {
        const fallback = fallbackState || cfg.fallback || 'idle';
        const totalFrames = cfg.frames;
        let played = 1;
        const interval = 1000 / cfg.fps;

        this.frameTimer = setInterval(() => {
            if (played >= totalFrames) {
                this.stopLoop();
                this.currentState = fallback;
                this.currentFrame = 0;
                this.renderFrame();
                this.startLoop(fallbackFps || this.getConfig(fallback).fps);
                return;
            }
            this.currentFrame = played;
            this.renderFrame();
            played++;
        }, interval);
    },

    playPreview(stateName) {
        const returnState = this.currentState && this.currentState !== stateName
            ? this.currentState
            : 'idle';
        const normalized = stateName || 'idle';
        const cfg = this.getConfig(normalized);
        if (cfg.loop || this.currentState === normalized) return;

        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.renderFrame();
        this.startOneShot(cfg, returnState);
        statusEl.textContent = normalized;
    },

    playTemporary(stateName, duration, fps) {
        const returnState = this.currentState || 'idle';
        const normalized = stateName || 'idle';
        const cfg = this.getConfig(normalized);
        if (!cfg.loop || this.currentState === normalized) return;

        clearTimeout(this.temporaryTimer);
        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.renderFrame();
        this.startLoop(fps || cfg.fps);
        this.temporaryTimer = setTimeout(() => {
            if (this.currentBridgeState !== 'idle') return;
            this.stopLoop();
            this.currentState = returnState;
            this.currentFrame = 0;
            this.renderFrame();
            this.startLoop(this.getConfig(returnState).fps);
        }, duration || 900);
    },

    normalizeIdleAfterSettle() {
        clearTimeout(this.settleTimer);
        this.settleTimer = setTimeout(() => {
            if (this.currentBridgeState !== 'idle' || this.currentState !== 'idle') return;
            this.startLoop(this.getConfig('idle').fps);
        }, 3000);
    },

    stopLoop() {
        if (this.frameTimer) {
            clearInterval(this.frameTimer);
            this.frameTimer = null;
        }
        this.currentFps = null;
    },

    /** Show a speech bubble for a few seconds. */
    showBubble(text) {
        const displayText = behavior.clipBubbleText(text);
        if (!displayText) return;
        const now = Date.now();
        if (displayText === this.lastBubbleText && now - this.lastBubbleAt < 5000) return;

        if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
        this.lastBubbleText = displayText;
        this.lastBubbleAt = now;
        bubbleTextEl.textContent = displayText;
        bubbleEl.classList.remove('hidden');
        this.bubbleTimer = setTimeout(() => {
            bubbleEl.classList.add('hidden');
        }, 4000);
    },
};

// ---- Initialise ----
function init() {
    configureSpriteSize();

    // Listen for pet events from main process
    if (window.unipetAPI) {
        window.unipetAPI.onPetEvent((event) => {
            if (event.currentPet) anim.applyPetConfig(event.currentPet);
            const pet = event.activePet || (event.pets || [])[0];
            if (pet) {
                anim.transition(pet.state, pet.message);
            } else {
                anim.transition('idle');
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
    anim.transition('idle', 'UniPet ready');
    motion.scheduleIdle();

    // Pointer interactions are temporary animations; bridge state remains authoritative.
    spriteEl.addEventListener('click', () => {
        anim.playPreview('jumping');
    });
    spriteEl.addEventListener('mouseenter', () => {
        if (!dragActive) anim.playPreview('jumping');
    });
}

// ---- Drag (pass through to main process) ----
let dragActive = false;
spriteEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragActive = true;
    motion.setDragging(true);
    if (window.unipetAPI) {
        window.unipetAPI.petDragStart({ screenX: e.screenX, screenY: e.screenY });
    }
});

document.addEventListener('mousemove', (e) => {
    if (!dragActive || !window.unipetAPI) return;
    window.unipetAPI.petDragMove({ screenX: e.screenX, screenY: e.screenY });
});

document.addEventListener('mouseup', () => {
    if (!dragActive) return;
    dragActive = false;
    motion.setDragging(false);
    motion.trigger('settle', 700);
    if (window.unipetAPI) window.unipetAPI.petDragEnd();
});

// Start
init();
