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
const spriteEl = document.getElementById('pet-sprite');
const bubbleEl = document.getElementById('pet-bubble');
const bubbleTextEl = document.getElementById('bubble-text');
const statusEl = document.getElementById('pet-status');

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

// ---- Animation controller ----
const anim = {
    currentState: null,
    currentFrame: 0,
    frameTimer: null,
    spritesheetUrl: 'assets/default/spritesheet.webp',
    petId: 'pounce',
    bubbleTimer: null,

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

    /** Transition to a new state. */
    transition(stateName, message) {
        const normalized = stateName || 'idle';
        const cfg = this.getConfig(normalized);

        // Keep looping animations running while still updating fresh messages.
        if (this.currentState === normalized && cfg.loop) {
            if (message) this.showBubble(message);
            statusEl.textContent = normalized;
            return;
        }

        this.stopLoop();
        this.currentState = normalized;
        this.currentFrame = 0;
        this.renderFrame();

        if (cfg.loop) {
            this.startLoop(cfg.fps);
        } else {
            // One-shot: play through frames, then fall back
            this.startOneShot(cfg);
        }

        // Show bubble if message provided
        if (message) this.showBubble(message);
        statusEl.textContent = normalized;
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
        const interval = 1000 / fps;
        this.frameTimer = setInterval(() => {
            const cfg = this.getConfig(this.currentState);
            this.currentFrame = (this.currentFrame + 1) % cfg.frames;
            this.renderFrame();
        }, interval);
    },

    /** Play a one-shot animation, then return to a real bridge state. */
    startOneShot(cfg, fallbackState) {
        const fallback = fallbackState || cfg.fallback || 'idle';
        const totalFrames = cfg.frames;
        let played = 1;
        const interval = 1000 / cfg.fps;

        this.frameTimer = setInterval(() => {
            if (played >= totalFrames) {
                this.stopLoop();
                this.transition(fallback);
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

    stopLoop() {
        if (this.frameTimer) {
            clearInterval(this.frameTimer);
            this.frameTimer = null;
        }
    },

    /** Show a speech bubble for a few seconds. */
    showBubble(text) {
        if (!text) return;
        if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
        bubbleTextEl.textContent = text;
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
    if (window.unipetAPI) window.unipetAPI.petDragEnd();
});

// Start
init();
