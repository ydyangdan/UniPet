/**
 * UniPet Overlay — renderer.CSS spritesheet animation engine.
 *
 * Renders a Codex-compatible 8×9 spritesheet using CSS background-position.
 * Receives state updates from the bridge via WebSocket → IPC.
 */

// ---- Codex spritesheet animation config (matches unipet/protocol.py) ----
const ANIMATION_ROWS = {
    idle:          { row: 0, frames: 6, fps: 6,  loop: true },
    running:       { row: 7, frames: 6, fps: 10, loop: true },
    running_right: { row: 1, frames: 8, fps: 10, loop: true },
    running_left:  { row: 2, frames: 8, fps: 10, loop: true },
    waving:        { row: 3, frames: 4, fps: 8,  loop: false, fallback: 'idle' },
    jumping:       { row: 4, frames: 5, fps: 8,  loop: false, fallback: 'idle' },
    failed:        { row: 5, frames: 8, fps: 6,  loop: false, fallback: 'idle' },
    waiting:       { row: 6, frames: 6, fps: 6,  loop: true },
    review:        { row: 8, frames: 6, fps: 6,  loop: true },
};

const CELL_W = 192;
const CELL_H = 208;

// Keep the public state model identical to Codex Pet:
// idle, running, waiting, failed, review.
const STATE_ALIASES = {
    error:  'failed',
    thinking: 'review',
    planning: 'review',
    busy:    'waiting',
    offline: 'idle',
};

// ---- DOM refs ----
const spriteEl = document.getElementById('pet-sprite');
const bubbleEl = document.getElementById('pet-bubble');
const bubbleTextEl = document.getElementById('bubble-text');
const statusEl = document.getElementById('pet-status');

// ---- Animation controller ----
const anim = {
    currentState: null,
    currentFrame: 0,
    frameTimer: null,
    spritesheetUrl: 'assets/default/spritesheet.webp',
    bubbleTimer: null,

    /** Load a spritesheet (change pet skin). */
    loadSpritesheet(url) {
        this.spritesheetUrl = url;
        spriteEl.style.backgroundImage = `url("${url}")`;
        this.renderFrame();
    },

    /** Set spritesheet from a Codex pet directory. */
    loadCodexPet(petDir) {
        const manifest = petDir + '/pet.json';
        fetch(manifest).then(r => r.json()).then(data => {
            const ss = petDir + '/' + (data.spritesheetPath || 'spritesheet.webp');
            this.loadSpritesheet(ss);
            statusEl.textContent = data.displayName || data.id || '';
        }).catch(() => {
            // try loading spritesheet directly
            this.loadSpritesheet(petDir + '/spritesheet.webp');
        });
    },

    /** Get animation config for a state name. */
    getConfig(stateName) {
        const normalized = STATE_ALIASES[stateName] || stateName;
        return ANIMATION_ROWS[normalized] || ANIMATION_ROWS.idle;
    },

    /** Transition to a new state. */
    transition(stateName, message) {
        const normalized = STATE_ALIASES[stateName] || stateName;
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
        const x = this.currentFrame * CELL_W;
        const y = cfg.row * CELL_H;
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

    /** Play a one-shot animation then fall back to idle. */
    startOneShot(cfg) {
        const fallback = cfg.fallback || 'idle';
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

    // Listen for pet events from main process
    if (window.unipetAPI) {
        window.unipetAPI.onPetEvent((event) => {
            const pet = event.active_pet || (event.pets || [])[0];
            if (pet) {
                anim.transition(pet.state, pet.message);
            }
        });

        window.unipetAPI.onBridgeConnected((connected) => {
            statusEl.textContent = connected ? 'connected' : 'disconnected';
        });
    }

    // Initial render
    anim.transition('idle', 'UniPet ready');

    // Click to toggle drag mode
    spriteEl.addEventListener('click', () => {
        anim.transition('jumping', '');
        setTimeout(() => anim.transition('idle'), 2000);
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
