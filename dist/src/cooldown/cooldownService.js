"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CooldownService = void 0;
class CooldownService {
    globalCooldownUntil = 0;
    userCooldowns = new Map();
    checkAndConsume(config, username) {
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
    reset(username) {
        if (username) {
            this.userCooldowns.delete(username);
        }
        else {
            this.globalCooldownUntil = 0;
            this.userCooldowns.clear();
        }
    }
}
exports.CooldownService = CooldownService;
