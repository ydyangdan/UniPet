const PET_STATES = new Set(['idle', 'running', 'waiting', 'failed', 'review']);
const PET_ACTIONS = new Set(['update', 'remove', 'clear']);

const STATE_ALIASES = {
  error: 'failed',
  thinking: 'running',
  planning: 'running',
  busy: 'waiting',
  offline: 'idle',
  pending: 'waiting',
  done: 'review',
  success: 'review',
};

const STATE_PRIORITY = {
  failed: 50,
  waiting: 40,
  review: 30,
  running: 20,
  idle: 0,
};

const LOCAL_SOURCE_ID = 'local-unipet';

function cleanText(value, fallback, maxLen) {
  const text = String(value || fallback).trim();
  return text ? text.slice(0, maxLen) : fallback;
}

function cleanSourceId(value, fallback = 'remote') {
  const raw = cleanText(value, fallback, 64);
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return clean.slice(0, 64) || fallback;
}

function normalizeState(state) {
  const raw = String(state || '').trim().toLowerCase();
  const stateName = STATE_ALIASES[raw] || raw;
  return PET_STATES.has(stateName) ? stateName : 'idle';
}

function normalizeTtl(value) {
  if (value === undefined || value === null || value === '') return null;
  const ttl = Number.parseInt(value, 10);
  if (Number.isNaN(ttl)) return null;
  return Math.max(1000, Math.min(ttl, 600000));
}

function normalizeEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object');
  }

  const action = cleanText(payload.action, 'update', 16).toLowerCase();
  if (!PET_ACTIONS.has(action)) {
    throw new Error(`action must be one of ${Array.from(PET_ACTIONS).sort().join(', ')}`);
  }

  if (!payload.source) {
    throw new Error('source is required');
  }

  const source = cleanSourceId(payload.source);
  const state = normalizeState(payload.state);

  return {
    source,
    state,
    message: cleanText(payload.message, state, 180),
    action,
    ttlMs: normalizeTtl(payload.ttlMs),
    updatedAt: Date.now() / 1000,
  };
}

class PetStore {
  constructor() {
    this.pets = new Map();
  }

  apply(event) {
    if (event.action === 'clear') {
      const local = this.pets.get(LOCAL_SOURCE_ID);
      this.pets.clear();
      if (local) this.pets.set(LOCAL_SOURCE_ID, local);
    } else if (event.action === 'remove') {
      this.pets.delete(event.source);
    } else {
      this.pets.set(event.source, event);
    }
  }

  purgeExpired() {
    const now = Date.now() / 1000;
    for (const [source, pet] of this.pets.entries()) {
      if (pet.ttlMs !== null && pet.updatedAt + pet.ttlMs / 1000 <= now) {
        this.pets.delete(source);
      }
    }
  }

  snapshot() {
    this.purgeExpired();
    return Array.from(this.pets.values()).map((pet) => ({ ...pet }));
  }

  activePet() {
    this.purgeExpired();
    let active = null;
    for (const pet of this.pets.values()) {
      if (!active) {
        active = pet;
        continue;
      }
      const petRank = [STATE_PRIORITY[pet.state] || 0, pet.updatedAt];
      const activeRank = [STATE_PRIORITY[active.state] || 0, active.updatedAt];
      if (petRank[0] > activeRank[0] || (petRank[0] === activeRank[0] && petRank[1] > activeRank[1])) {
        active = pet;
      }
    }
    return active ? { ...active } : null;
  }

  activeState() {
    const active = this.activePet();
    return active ? active.state : 'idle';
  }
}

module.exports = {
  PetStore,
  normalizeEvent,
  normalizeState,
};
