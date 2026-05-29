"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const permissionService_1 = require("../../src/permissions/permissionService");
(0, vitest_1.describe)("PermissionService", () => {
    const service = new permissionService_1.PermissionService();
    const user = { username: "u", isMod: false, isSubscriber: false };
    (0, vitest_1.it)("denies when subOnly enabled and user not sub", () => {
        const result = service.canUseGreenScreen(user, { subOnly: true, modOnly: false });
        (0, vitest_1.expect)(result.allowed).toBe(false);
    });
    (0, vitest_1.it)("denies when modOnly enabled and user not mod", () => {
        const result = service.canUseGreenScreen(user, { subOnly: false, modOnly: true });
        (0, vitest_1.expect)(result.allowed).toBe(false);
    });
    (0, vitest_1.it)("allows when both disabled", () => {
        const result = service.canUseGreenScreen(user, { subOnly: false, modOnly: false });
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
});
