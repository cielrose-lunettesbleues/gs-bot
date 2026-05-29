"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CooldownService = void 0;
class CooldownService {
    globalCooldownUntil = 0;
    checkAndConsume(config) {
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
    reset() {
        this.globalCooldownUntil = 0;
    }
}
exports.CooldownService = CooldownService;
