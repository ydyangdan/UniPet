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
const statusCardSourceEl = document.getElementById('status-card-source');
const statusCardTaskRowEl = document.getElementById('status-card-task-row');
const statusCardSummaryLabelEl = document.getElementById('status-card-summary-label');
const statusCardTaskEl = document.getElementById('status-card-task');
const statusCardDurationRowEl = document.getElementById('status-card-duration-row');
const statusCardDurationEl = document.getElementById('status-card-duration');
const behavior = window.UnipetBehavior || {
    inferBehavior: (pet) => ({
        state: pet && pet.state || 'idle',
        animation: pet && pet.state || 'idle',
        message: pet && pet.message || '',
        bubbleText: pet && pet.message || '',
        displayStatus: pet && pet.state || 'idle',
        displayLabel: pet && pet.state || 'idle',
        displayTone: pet && pet.state || 'idle',
    }),
    clipBubbleText: (text) => String(text || '').slice(0, 20),
    safeSummary: (text) => String(text || '').slice(0, 44),
};
const CARD_SUMMARY_LIMIT = 44;
const DONE_SUMMARY_LIMIT = 28;
const DONE_FALLBACK_TEXT = '已执行完成，请查看。';
const BUBBLE_MIN_VISIBLE_MS = 3200;
const BUBBLE_STATE_MS = {
    idle: 0,
    running: 4500,
    waiting: 12000,
    failed: 9000,
    review: 6500,
};
const IDLE_COMPANION_BUBBLES = Object.freeze([
    '我在呢。',
    '准备好啦。',
    '一起加油。',
]);
let idleCompanionBubbleIndex = 0;
let petActionMenuEl = null;
let petActionMenuHideTimer = null;

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
        setPrefixedClass('display-', intent.displayStatus || intent.state || 'idle');
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
            syncStatusCardForBridgeState();
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
        syncStatusCardForBridgeState();
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
        if (statusCardEl && !statusCardEl.classList.contains('hidden')) return;
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
    pinTimer: null,
    tickTimer: null,
    revealToken: 0,
    pinned: false,

    show({ pinned = false, autoHideMs = 0 } = {}) {
        if (!statusCardEl) return;
        if (isCompanionMode()) {
            this.hide({ force: true });
            return;
        }
        if (pinned) {
            clearTimeout(this.hideTimer);
            clearTimeout(this.pinTimer);
            this.pinned = true;
        } else if (!this.pinned) {
            clearTimeout(this.hideTimer);
        }
        const wasHidden = statusCardEl.classList.contains('hidden');
        this.render();
        bubbleEl.classList.add('hidden');
        this.reveal(wasHidden);
        this.startTicking();
        if (pinned) {
            this.pinTimer = setTimeout(() => this.hide({ force: true }), 6500);
        } else if (!this.pinned && autoHideMs > 0) {
            this.hideTimer = setTimeout(() => this.hide(), autoHideMs);
        }
    },

    scheduleHide(delay = 500) {
        if (this.pinned || !statusCardEl) return;
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.hide(), delay);
    },

    hide({ force = false } = {}) {
        if (!force && this.pinned) return;
        this.revealToken += 1;
        clearTimeout(this.hideTimer);
        clearTimeout(this.pinTimer);
        this.hideTimer = null;
        this.pinTimer = null;
        this.pinned = false;
        if (statusCardEl) {
            statusCardEl.classList.add('hidden');
            statusCardEl.classList.remove('is-preparing', 'is-revealing');
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

    reveal(wasHidden) {
        if (!statusCardEl) return;
        this.revealToken += 1;
        const token = this.revealToken;
        statusCardEl.setAttribute('aria-hidden', 'false');
        if (!wasHidden) {
            statusCardEl.classList.remove('hidden', 'is-preparing', 'is-revealing');
            return;
        }
        statusCardEl.classList.add('is-preparing');
        void statusCardEl.offsetHeight;
        requestAnimationFrame(() => {
            if (token !== this.revealToken || !statusCardEl) return;
            statusCardEl.classList.remove('hidden', 'is-preparing');
            statusCardEl.classList.add('is-revealing');
            requestAnimationFrame(() => {
                if (token !== this.revealToken || !statusCardEl) return;
                statusCardEl.classList.remove('is-revealing');
            });
        });
    },

    render() {
        if (!statusCardEl) return;
        const intent = anim.currentIntent || {};
        const pet = anim.activePet || null;
        const displayStatus = intent.displayStatus || (intent.state === 'failed' ? 'problem' : intent.state) || 'idle';
        const displayLabel = intent.displayLabel || labelForDisplayStatus(displayStatus);
        const task = taskSummary(pet, intent, displayStatus);
        const duration = formatDuration(pet && (pet.startedAt ?? pet.updatedAt));

        setStatusCardTone(displayStatus);
        statusCardStateEl.textContent = displayLabel;
        statusCardSourceEl.textContent = pet && pet.source ? String(pet.source) : '';
        if (statusCardSummaryLabelEl) statusCardSummaryLabelEl.textContent = summaryLabelFor(displayStatus);
        setCardRow(statusCardTaskRowEl, statusCardTaskEl, task);
        setCardRow(statusCardDurationRowEl, statusCardDurationEl, duration);
    },
};

function isCompanionMode() {
    return anim.currentBridgeState === 'idle';
}

function syncStatusCardForBridgeState() {
    if (isCompanionMode()) {
        statusCard.hide({ force: true });
        return;
    }
    statusCard.render();
}

function setStatusCardTone(displayStatus) {
    const tone = displayStatus || 'idle';
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

function taskSummary(pet, intent, displayStatus) {
    if (!pet) return '';
    const summary = normalizeCardSummary(intent.messageSummary || behavior.safeSummary(pet.message));
    const stateText = String(pet.state || '').trim();

    if (displayStatus === 'done') {
        if (summary && summary !== stateText && !isLowSignalDoneSummary(summary)) {
            return clipCardText(summary, DONE_SUMMARY_LIMIT);
        }
        return DONE_FALLBACK_TEXT;
    }

    if (!summary || summary === stateText) return '';
    if (displayStatus === 'idle' && isQuietIdleSummary(summary)) return '';
    return clipCardText(summary, CARD_SUMMARY_LIMIT);
}

function normalizeCardSummary(summary) {
    return String(summary || '').trim().replace(/\s+/g, ' ');
}

function clipCardText(text, limit) {
    const raw = String(text || '').trim();
    const chars = Array.from(raw);
    if (chars.length <= limit) return raw;
    return `${chars.slice(0, limit).join('')}...`;
}

function isLowSignalDoneSummary(summary) {
    return /^(?:done|complete|completed|finish|finished|success|succeeded|ok|ready|review|完成|已完成|任务完成|执行完成)[。.!！]?$/i
        .test(String(summary || '').trim());
}

function isQuietIdleSummary(summary) {
    return /^(?:unipet|codex|claude code|deepseek-tui|hermes|openclaw)?\s*(?:ready|cleared|session ended|session closed)$/i
        .test(String(summary || '').trim());
}

function summaryLabelFor(displayStatus) {
    if (displayStatus === 'running' || displayStatus === 'thinking') return '当前任务';
    if (displayStatus === 'idle') return '状态提示';
    if (displayStatus === 'done') return '执行结果';
    if (displayStatus === 'problem') return '问题摘要';
    return '消息摘要';
}

function formatDuration(updatedAt) {
    const value = Number(updatedAt);
    if (!Number.isFinite(value) || value <= 0) return '';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - value));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const restSeconds = seconds % 60;
    if (seconds < 3600) return `${minutes}m${restSeconds}s`;
    const hours = Math.floor(seconds / 3600);
    const restMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${String(restMinutes).padStart(2, '0')}m`;
}

function labelForDisplayStatus(displayStatus) {
    return {
        idle: '待命中',
        running: '运行中',
        thinking: '思考中',
        waiting: '等待中',
        confirm: '需要确认',
        done: '完成',
        problem: '遇到问题',
    }[displayStatus] || '待命中';
}

function nextIdleCompanionBubble() {
    const text = IDLE_COMPANION_BUBBLES[idleCompanionBubbleIndex % IDLE_COMPANION_BUBBLES.length];
    idleCompanionBubbleIndex += 1;
    return text;
}

function consumeMenuEvent(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
}

function stopDragIfNeeded() {
    if (dragActive) {
        dragActive = false;
        dragDirection = null;
        motion.setDragging(false);
        removePrefixedClasses('direction-');
        if (window.unipetAPI) window.unipetAPI.petDragEnd();
    }
}

function ensurePetActionMenu() {
    if (petActionMenuEl) return petActionMenuEl;

    const menu = document.createElement('div');
    menu.id = 'pet-action-menu';
    menu.className = 'hidden';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-hidden', 'true');

    const actions = document.createElement('div');
    actions.className = 'pet-action-buttons';

    const quietButton = document.createElement('button');
    quietButton.type = 'button';
    quietButton.className = 'pet-action-button quiet';
    quietButton.textContent = '\u5b89\u9759';
    quietButton.addEventListener('click', quietPet);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'pet-action-button close';
    closeButton.textContent = '\u5173\u95ed';
    closeButton.addEventListener('click', confirmPetQuit);

    actions.append(quietButton, closeButton);
    menu.append(actions);
    menu.addEventListener('mousedown', (event) => event.stopPropagation());
    menu.addEventListener('click', (event) => event.stopPropagation());
    menu.addEventListener('contextmenu', consumeMenuEvent);
    containerEl.appendChild(menu);
    petActionMenuEl = menu;
    return menu;
}

function showPetActionMenu(event) {
    consumeMenuEvent(event);
    stopDragIfNeeded();
    statusCard.hide({ force: true });
    bubbleEl.classList.add('hidden');

    const menu = ensurePetActionMenu();
    clearTimeout(petActionMenuHideTimer);
    menu.classList.remove('hidden');
    menu.setAttribute('aria-hidden', 'false');
    petActionMenuHideTimer = setTimeout(hidePetActionMenu, 6000);
}

function hidePetActionMenu() {
    clearTimeout(petActionMenuHideTimer);
    petActionMenuHideTimer = null;
    if (!petActionMenuEl) return;
    petActionMenuEl.classList.add('hidden');
    petActionMenuEl.setAttribute('aria-hidden', 'true');
}

function quietPet(event) {
    consumeMenuEvent(event);
    hidePetActionMenu();
    stopDragIfNeeded();
    statusCard.hide({ force: true });
    bubbleEl.classList.add('hidden');
    anim.transition('idle', 'UniPet ready', null);
    motion.trigger('settle', 700);
    motion.scheduleIdle();
}

function confirmPetQuit(event) {
    consumeMenuEvent(event);
    hidePetActionMenu();
    stopDragIfNeeded();
    if (window.unipetAPI && typeof window.unipetAPI.petQuit === 'function') {
        window.unipetAPI.petQuit();
    }
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
    containerEl.addEventListener('contextmenu', showPetActionMenu);
    spriteEl.addEventListener('click', () => {
        hidePetActionMenu();
        anim.playPreview('jumping');
        if (isCompanionMode()) {
            statusCard.hide({ force: true });
            anim.showBubble(nextIdleCompanionBubble(), 'idle', 3200);
            return;
        }
        statusCard.togglePinned();
    });
    containerEl.addEventListener('mouseenter', () => {
        if (dragActive) return;
        motion.trigger('blink', 420);
        if (isCompanionMode()) {
            statusCard.hide({ force: true });
            anim.playPreview('waving');
            return;
        }
        statusCard.show({ autoHideMs: 2800 });
    });
    containerEl.addEventListener('mouseleave', () => {
        statusCard.scheduleHide();
    });
    document.addEventListener('mousedown', (event) => {
        if (!petActionMenuEl || petActionMenuEl.classList.contains('hidden')) return;
        if (petActionMenuEl.contains(event.target)) return;
        hidePetActionMenu();
    });
}

// ---- Drag (pass through to main process) ----
let dragActive = false;
let dragLastX = 0;
let dragDirection = null;

spriteEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    hidePetActionMenu();
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
