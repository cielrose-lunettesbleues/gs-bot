"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const cooldownService_1 = require("../../src/cooldown/cooldownService");
(0, vitest_1.describe)("CooldownService", () => {
    (0, vitest_1.it)("allows when disabled", () => {
        const service = new cooldownService_1.CooldownService();
        const result = service.checkAndConsume({ enabled: false, seconds: 60 });
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
    (0, vitest_1.it)("blocks during active cooldown", () => {
        const service = new cooldownService_1.CooldownService();
        service.checkAndConsume({ enabled: true, seconds: 60 });
        const second = service.checkAndConsume({ enabled: true, seconds: 60 });
        (0, vitest_1.expect)(second.allowed).toBe(false);
        (0, vitest_1.expect)(second.retryAfterSeconds).toBeGreaterThan(0);
    });
});
