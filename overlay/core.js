const {
  LOCAL_SOURCE_ID,
  STATE_PRIORITY,
  normalizeEvent,
  normalizeState,
} = require('./protocol');

const SESSION_STATES = new Set(['running', 'waiting']);
const QUIET_GRACE_STATES = new Set(['running']);
const TERMINAL_STATES = new Set(['failed', 'review']);
const WORK_QUIET_GRACE_MS = 8 * 60 * 1000;
const MAX_WORK_SESSION_MS = 20 * 60 * 1000;

class PetStore {
  constructor({ now = Date.now } = {}) {
    this.pets = new Map();
    this.workSessions = new Map();
    this.now = now;
  }

  apply(event) {
    if (event.action === 'clear') {
      const local = this.pets.get(LOCAL_SOURCE_ID);
      const localSession = this.workSessions.get(LOCAL_SOURCE_ID);
      this.pets.clear();
      this.workSessions.clear();
      if (local) this.pets.set(LOCAL_SOURCE_ID, local);
      if (localSession) this.workSessions.set(LOCAL_SOURCE_ID, localSession);
    } else if (event.action === 'remove') {
      this.pets.delete(event.source);
      this.workSessions.delete(event.source);
    } else {
      this.pets.set(event.source, this.trackLifecycle(event));
    }
  }

  purgeExpired() {
    const now = this.now() / 1000;
    for (const [source, pet] of this.pets.entries()) {
      if (pet.ttl !== null && pet.updatedAt + pet.ttl / 1000 <= now) {
        if (this.keepExpiredWork(source, pet, now)) continue;
        this.pets.delete(source);
        this.workSessions.delete(source);
      }
    }
  }

  snapshot() {
    this.purgeExpired();
    const now = this.now() / 1000;
    return Array.from(this.pets.entries()).map(([source, pet]) => this.presentPet(source, pet, now));
  }

  activePet() {
    this.purgeExpired();
    const now = this.now() / 1000;
    let active = null;
    for (const [source, pet] of this.pets.entries()) {
      const present = this.presentPet(source, pet, now);
      if (!active) {
        active = present;
        continue;
      }
      const petRank = [STATE_PRIORITY[present.state] || 0, present.updatedAt];
      const activeRank = [STATE_PRIORITY[active.state] || 0, active.updatedAt];
      if (petRank[0] > activeRank[0] || (petRank[0] === activeRank[0] && petRank[1] > activeRank[1])) {
        active = present;
      }
    }
    return active ? { ...active } : null;
  }

  activeState() {
    const active = this.activePet();
    return active ? active.state : 'idle';
  }

  trackLifecycle(event) {
    const state = event.state;
    const current = this.workSessions.get(event.source);

    if (SESSION_STATES.has(state)) {
      const startedAt = current ? current.startedAt : event.updatedAt;
      const nextSession = {
        startedAt,
        lastActivityAt: event.updatedAt,
      };
      this.workSessions.set(event.source, nextSession);
      return { ...event, startedAt };
    }

    if (TERMINAL_STATES.has(state)) {
      this.workSessions.delete(event.source);
      return {
        ...event,
        startedAt: current ? current.startedAt : event.updatedAt,
      };
    }

    this.workSessions.delete(event.source);
    return event;
  }

  keepExpiredWork(source, pet, now) {
    if (!QUIET_GRACE_STATES.has(pet.state)) return false;
    const session = this.workSessions.get(source);
    if (!session) return false;
    const quietForMs = (now - session.lastActivityAt) * 1000;
    const workForMs = (now - session.startedAt) * 1000;
    return quietForMs <= WORK_QUIET_GRACE_MS && workForMs <= MAX_WORK_SESSION_MS;
  }

  presentPet(source, pet, now) {
    const view = { ...pet };
    const expired = pet.ttl !== null && pet.updatedAt + pet.ttl / 1000 <= now;
    const session = this.workSessions.get(source);
    if (expired && QUIET_GRACE_STATES.has(pet.state) && session) {
      view.quiet = true;
    }
    return view;
  }
}

module.exports = {
  MAX_WORK_SESSION_MS,
  PetStore,
  WORK_QUIET_GRACE_MS,
  normalizeEvent,
  normalizeState,
};
