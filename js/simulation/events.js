/** Tiny event emitter used by Game. */
export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.handlers = new Map();
  }
  /** Subscribe; returns an unsubscribe function. */
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }
  /** Unsubscribe. */
  off(event, fn) {
    const set = this.handlers.get(event);
    if (set) set.delete(fn);
  }
  /** Emit to all handlers (errors in handlers are isolated). */
  emit(event, payload) {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { /* handler errors must not break the sim */ }
    }
  }
}
