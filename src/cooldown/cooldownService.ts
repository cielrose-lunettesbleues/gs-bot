export interface CooldownConfig {
  enabled: boolean;
  seconds: number;
  perUserEnabled?: boolean;
  perUserSeconds?: number;
}

export interface CooldownDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class CooldownService {
  private globalCooldownUntil = 0;
  private readonly userCooldowns = new Map<string, number>();

  public checkAndConsume(config: CooldownConfig, username?: string): CooldownDecision {
    if (!config.enabled) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const now = Date.now();

    if (config.perUserEnabled && username) {
      const userUntil = this.userCooldowns.get(username) ?? 0;
      if (now < userUntil) {
        return { allowed: false, retryAfterSeconds: Math.ceil((userUntil - now) / 1000) };
      }
    }

    if (now < this.globalCooldownUntil) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((this.globalCooldownUntil - now) / 1000)
      };
    }

    this.globalCooldownUntil = now + config.seconds * 1000;
    if (config.perUserEnabled && username) {
      this.userCooldowns.set(username, now + (config.perUserSeconds ?? config.seconds) * 1000);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public reset(username?: string): void {
    if (username) {
      this.userCooldowns.delete(username);
    } else {
      this.globalCooldownUntil = 0;
      this.userCooldowns.clear();
    }
  }
}
