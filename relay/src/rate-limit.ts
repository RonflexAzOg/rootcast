/** Fixed-window counter keyed by an arbitrary string (hook ID, client IP…). */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Returns true when the call is allowed. */
  hit(key: string, now: number = Date.now()): boolean {
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  /** Drops expired windows so memory stays bounded. */
  prune(now: number = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
