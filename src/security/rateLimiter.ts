// In-memory sliding-window limiter for public endpoints. The viewer page is
// reachable by anyone holding the link, so submissions and previews need a
// ceiling that does not depend on a Twitch identity.
interface Window {
  hits: number[];
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number
  ) {}

  public check(key: string, now = Date.now()): RateLimitDecision {
    const window = this.windows.get(key) ?? { hits: [] };
    window.hits = window.hits.filter((at) => now - at < this.windowMs);

    if (window.hits.length >= this.maxHits) {
      const oldest = window.hits[0] ?? now;
      this.windows.set(key, window);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(Math.ceil((this.windowMs - (now - oldest)) / 1000), 1)
      };
    }

    window.hits.push(now);
    this.windows.set(key, window);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  // Called periodically so keys from one-off visitors do not pile up.
  public prune(now = Date.now()): void {
    for (const [key, window] of this.windows) {
      const hits = window.hits.filter((at) => now - at < this.windowMs);
      if (hits.length === 0) this.windows.delete(key);
      else window.hits = hits;
    }
  }

  public size(): number {
    return this.windows.size;
  }
}
