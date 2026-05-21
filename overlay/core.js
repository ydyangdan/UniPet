const {
  LOCAL_SOURCE_ID,
  STATE_PRIORITY,
  normalizeEvent,
  normalizeState,
} = require('./protocol');

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
      if (pet.ttl !== null && pet.updatedAt + pet.ttl / 1000 <= now) {
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
