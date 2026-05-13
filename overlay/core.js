const PROTOCOL_VERSION = 'unipet.v1';

const PET_STATES = new Set(['idle', 'running', 'waiting', 'failed', 'review']);
const PET_ACTIONS = new Set(['update', 'remove', 'clear', 'ack']);

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

function cleanOptionalToken(value, maxLen = 32) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const clean = raw.replace(/[^a-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return clean.slice(0, maxLen) || null;
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

function normalizeCount(value, hasKind) {
  if (value === undefined || value === null || value === '') return hasKind ? 1 : 0;
  const count = Number.parseInt(value, 10);
  if (Number.isNaN(count)) return hasKind ? 1 : 0;
  return Math.max(0, Math.min(count, 99));
}

function normalizeEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object');
  }

  const protocol = payload.protocol;
  if (protocol !== undefined && protocol !== PROTOCOL_VERSION) {
    throw new Error(`protocol must be ${PROTOCOL_VERSION}`);
  }

  const action = cleanText(payload.action, 'update', 16).toLowerCase();
  if (!PET_ACTIONS.has(action)) {
    throw new Error(`action must be one of ${Array.from(PET_ACTIONS).sort().join(', ')}`);
  }

  const notificationKind = cleanOptionalToken(
    payload.notification_kind || payload.notificationKind || payload.badge_kind || payload.badgeKind,
  );
  const notificationCount = normalizeCount(
    payload.notification_count || payload.notificationCount || payload.badge_count || payload.badgeCount,
    Boolean(notificationKind),
  );

  const sourceId = cleanSourceId(payload.source_id || payload.sourceId);
  const state = normalizeState(payload.state);

  return {
    source_id: sourceId,
    label: cleanText(payload.label, sourceId, 64),
    state,
    message: cleanText(payload.message || payload.event_type || payload.text, state, 180),
    action,
    ttl_ms: normalizeTtl(payload.ttl_ms || payload.ttlMs),
    animation: cleanOptionalToken(payload.animation),
    direction: cleanOptionalToken(payload.direction, 16),
    emotion: cleanOptionalToken(payload.emotion, 24),
    asset_id: cleanOptionalToken(
      payload.pet_asset_id || payload.petAssetId ||
      payload.artwork_asset_id || payload.artworkAssetId ||
      payload.asset_id || payload.assetId,
      96,
    ),
    notification_count: notificationCount,
    notification_kind: notificationKind,
    notification_label: cleanOptionalToken(
      payload.notification_label || payload.notificationLabel || payload.badge_label || payload.badgeLabel,
      4,
    ),
    updated_at: Date.now() / 1000,
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
      this.pets.delete(event.source_id);
    } else {
      this.pets.set(event.source_id, event);
    }
  }

  purgeExpired() {
    const now = Date.now() / 1000;
    for (const [sourceId, pet] of this.pets.entries()) {
      if (pet.ttl_ms !== null && pet.updated_at + pet.ttl_ms / 1000 <= now) {
        this.pets.delete(sourceId);
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
      const petRank = [STATE_PRIORITY[pet.state] || 0, pet.updated_at];
      const activeRank = [STATE_PRIORITY[active.state] || 0, active.updated_at];
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
  PROTOCOL_VERSION,
  PetStore,
  normalizeEvent,
  normalizeState,
};
