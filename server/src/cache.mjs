export class TtlCache {
  constructor() {
    this.store = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) {
      return undefined;
    }

    if (Date.now() >= hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return hit.value;
  }

  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
}
