/**
 * Tracks the "this offer expires in N seconds, then move to the next driver"
 * timer for sequential dispatch.
 *
 * This is deliberately behind an interface: the in-memory implementation
 * below uses plain `setTimeout`, which is fine for a single Node process but
 * loses all pending timers on restart and can't coordinate across multiple
 * processes. When you're ready to scale horizontally, implement
 * `OfferTimeoutStore` with Redis (a key with TTL + keyspace-notification, or
 * a sorted-set + a periodic sweep worker) and swap it in at the bottom of
 * this file — nothing in dispatch.service.ts needs to change.
 */
export interface OfferTimeoutStore {
  /** Schedules `onExpire` to run after `ms` milliseconds, keyed by `offerId`. */
  schedule(offerId: string, ms: number, onExpire: () => void): void;
  /** Cancels a previously scheduled timeout (e.g. because the driver responded first). */
  cancel(offerId: string): void;
}

class InMemoryOfferTimeoutStore implements OfferTimeoutStore {
  private timers = new Map<string, NodeJS.Timeout>();

  schedule(offerId: string, ms: number, onExpire: () => void): void {
    this.cancel(offerId);
    const timer = setTimeout(() => {
      this.timers.delete(offerId);
      onExpire();
    }, ms);
    this.timers.set(offerId, timer);
  }

  cancel(offerId: string): void {
    const existing = this.timers.get(offerId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(offerId);
    }
  }
}

// Swap this export for a Redis-backed implementation when scaling past one process.
export const offerTimeoutStore: OfferTimeoutStore = new InMemoryOfferTimeoutStore();
