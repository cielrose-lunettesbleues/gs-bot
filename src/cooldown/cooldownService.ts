export interface CooldownConfig {
  enabled: boolean;
  seconds: number;
}

export interface CooldownDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export class CooldownService {
  private globalCooldownUntil = 0;

  public checkAndConsume(config: CooldownConfig): CooldownDecision {
    if (!config.enabled) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const now = Date.now();
    if (now < this.globalCooldownUntil) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((this.globalCooldownUntil - now) / 1000)
      };
    }

    this.globalCooldownUntil = now + config.seconds * 1000;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public reset(): void {
    this.globalCooldownUntil = 0;
  }
}
