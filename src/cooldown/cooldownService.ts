export interface CooldownConfig {
  enabled: boolean;
  seconds: number;
  perUserEnabled?: boolean;
  perUserSeconds?: number;
}

export interface CooldownDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  /** Which limit refused, so the reply can say whose turn it is. */
  scope?: "user" | "global";
}

// Past this many tracked users, expired entries are swept on the next write
const USER_SWEEP_THRESHOLD = 500;

export class CooldownService {
  private globalCooldownUntil = 0;
  private readonly userCooldowns = new Map<string, number>();

  /**
   * Two independent limits. The global one spaces out every send on the
   * channel; the per-user one stops a single viewer from filling the queue on
   * their own while others can still send. Either can be on without the other.
   * Pass no username to skip the per-user limit (mods, broadcaster).
   */
  public checkAndConsume(config: CooldownConfig, username?: string): CooldownDecision {
    const now = Date.now();
    const userKey = config.perUserEnabled && username ? username.toLowerCase() : null;

    if (userKey) {
      const userUntil = this.userCooldowns.get(userKey) ?? 0;
      if (now < userUntil) {
        return { allowed: false, retryAfterSeconds: Math.ceil((userUntil - now) / 1000), scope: "user" };
      }
    }

    if (config.enabled && now < this.globalCooldownUntil) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((this.globalCooldownUntil - now) / 1000),
        scope: "global"
      };
    }

    if (config.enabled) this.globalCooldownUntil = now + config.seconds * 1000;
    if (userKey) {
      if (this.userCooldowns.size >= USER_SWEEP_THRESHOLD) this.sweep(now);
      this.userCooldowns.set(userKey, now + (config.perUserSeconds ?? config.seconds) * 1000);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public reset(username?: string): void {
    if (username) {
      this.userCooldowns.delete(username.toLowerCase());
    } else {
      this.globalCooldownUntil = 0;
      this.userCooldowns.clear();
    }
  }

  private sweep(now: number): void {
    for (const [user, until] of this.userCooldowns) {
      if (until <= now) this.userCooldowns.delete(user);
    }
  }
}
