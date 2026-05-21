const PROTOCOL_VERSION = 2;

const PET_STATES = Object.freeze(['idle', 'running', 'waiting', 'failed', 'review']);
const PET_ACTIONS = Object.freeze(['update', 'remove', 'clear']);
const LOCAL_SOURCE_ID = 'local-unipet';

const STATE_ALIASES = Object.freeze({
  error: 'failed',
  thinking: 'running',
  planning: 'running',
  busy: 'waiting',
  offline: 'idle',
  pending: 'waiting',
  done: 'review',
  success: 'review',
});

const STATE_PRIORITY = Object.freeze({
  failed: 50,
  waiting: 40,
  review: 30,
  running: 20,
  idle: 0,
});

const stateSet = new Set(PET_STATES);
const actionSet = new Set(PET_ACTIONS);

function cleanText(value, fallback, maxLen) {
  const text = String(value || fallback).trim();
  if (!text) return fallback;
  return Array.from(text).slice(0, maxLen).join('');
}

function cleanSourceId(value, fallback = 'remote') {
  const raw = cleanText(value, fallback, 64);
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return Array.from(clean).slice(0, 64).join('') || fallback;
}

function normalizeState(state) {
  const raw = String(state || '').trim().toLowerCase();
  const stateName = STATE_ALIASES[raw] || raw;
  return stateSet.has(stateName) ? stateName : 'idle';
}

function normalizeTtl(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.max(1000, Math.min(Math.round(value), 600000));
  }

  const raw = String(value).trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2] || 'ms';
  const multiplier = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
  }[unit];
  const ttl = Math.round(amount * multiplier);
  return Math.max(1000, Math.min(ttl, 600000));
}

function normalizeAction(value) {
  const action = cleanText(value, 'update', 16).toLowerCase();
  if (!actionSet.has(action)) {
    throw new Error(`action must be one of ${PET_ACTIONS.slice().sort().join(', ')}`);
  }
  return action;
}

function normalizeEvent(payload, now = Date.now) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object');
  }

  const action = normalizeAction(payload.action);
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
    ttl: normalizeTtl(payload.ttl),
    updatedAt: now() / 1000,
  };
}

module.exports = {
  LOCAL_SOURCE_ID,
  PET_ACTIONS,
  PET_STATES,
  PROTOCOL_VERSION,
  STATE_ALIASES,
  STATE_PRIORITY,
  cleanSourceId,
  cleanText,
  normalizeEvent,
  normalizeState,
  normalizeTtl,
};
