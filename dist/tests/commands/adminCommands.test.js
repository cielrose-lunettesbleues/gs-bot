"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const adminCommands_1 = require("../../src/commands/adminCommands");
function makeContext(overrides = {}) {
    return {
        channel: "#test",
        rawMessage: "",
        user: { username: "testmod", isMod: true, isSubscriber: false, ...overrides },
        reply: vitest_1.vi.fn(async () => undefined)
    };
}
function makeDeps() {
    const runtimeConfig = {
        access: { subOnly: true, modOnly: false },
        cooldown: { enabled: true, seconds: 60 }
    };
    const cooldownService = { reset: vitest_1.vi.fn() };
    const blacklistService = {
        isBlocked: vitest_1.vi.fn(() => false),
        block: vitest_1.vi.fn(),
        unblock: vitest_1.vi.fn(() => true),
        list: vitest_1.vi.fn(() => [])
    };
    const historyService = {
        record: vitest_1.vi.fn(),
        getLast: vitest_1.vi.fn(() => [])
    };
    const logger = { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn() };
    return { runtimeConfig, cooldownService, blacklistService, historyService, logger };
}
(0, vitest_1.describe)("AdminService.isAdminKeyword", () => {
    (0, vitest_1.it)("recognizes all admin keywords", () => {
        const service = new adminCommands_1.AdminService(makeDeps());
        for (const kw of ["subonly", "modonly", "cooldown", "reset", "block", "unblock", "blocklist", "history"]) {
            (0, vitest_1.expect)(service.isAdminKeyword(kw)).toBe(true);
            (0, vitest_1.expect)(service.isAdminKeyword(kw.toUpperCase())).toBe(true);
        }
    });
    (0, vitest_1.it)("rejects non-admin tokens", () => {
        const service = new adminCommands_1.AdminService(makeDeps());
        (0, vitest_1.expect)(service.isAdminKeyword("https://youtube.com")).toBe(false);
        (0, vitest_1.expect)(service.isAdminKeyword("ban")).toBe(false);
    });
});
(0, vitest_1.describe)("AdminService — permission check", () => {
    (0, vitest_1.it)("rejects non-mod users", async () => {
        const deps = makeDeps();
        const service = new adminCommands_1.AdminService(deps);
        const ctx = makeContext({ isMod: false });
        await service.execute(ctx, ["subonly", "on"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("modérateurs"));
        (0, vitest_1.expect)(deps.runtimeConfig.access.subOnly).toBe(true);
    });
});
(0, vitest_1.describe)("AdminService — subonly", () => {
    (0, vitest_1.it)("enables subOnly", async () => {
        const deps = makeDeps();
        deps.runtimeConfig.access.subOnly = false;
        const service = new adminCommands_1.AdminService(deps);
        const ctx = makeContext();
        await service.execute(ctx, ["subonly", "on"]);
        (0, vitest_1.expect)(deps.runtimeConfig.access.subOnly).toBe(true);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("activé"));
    });
    (0, vitest_1.it)("disables subOnly", async () => {
        const deps = makeDeps();
        const service = new adminCommands_1.AdminService(deps);
        await service.execute(makeContext(), ["subonly", "off"]);
        (0, vitest_1.expect)(deps.runtimeConfig.access.subOnly).toBe(false);
    });
    (0, vitest_1.it)("rejects invalid argument", async () => {
        const deps = makeDeps();
        const service = new adminCommands_1.AdminService(deps);
        const ctx = makeContext();
        await service.execute(ctx, ["subonly", "maybe"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Usage"));
        (0, vitest_1.expect)(deps.runtimeConfig.access.subOnly).toBe(true);
    });
});
(0, vitest_1.describe)("AdminService — modonly", () => {
    (0, vitest_1.it)("enables modOnly", async () => {
        const deps = makeDeps();
        await new adminCommands_1.AdminService(deps).execute(makeContext(), ["modonly", "on"]);
        (0, vitest_1.expect)(deps.runtimeConfig.access.modOnly).toBe(true);
    });
    (0, vitest_1.it)("disables modOnly", async () => {
        const deps = makeDeps();
        deps.runtimeConfig.access.modOnly = true;
        await new adminCommands_1.AdminService(deps).execute(makeContext(), ["modonly", "off"]);
        (0, vitest_1.expect)(deps.runtimeConfig.access.modOnly).toBe(false);
    });
});
(0, vitest_1.describe)("AdminService — cooldown", () => {
    (0, vitest_1.it)("disables cooldown", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["cooldown", "off"]);
        (0, vitest_1.expect)(deps.runtimeConfig.cooldown.enabled).toBe(false);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("désactivé"));
    });
    (0, vitest_1.it)("enables cooldown", async () => {
        const deps = makeDeps();
        deps.runtimeConfig.cooldown.enabled = false;
        await new adminCommands_1.AdminService(deps).execute(makeContext(), ["cooldown", "on"]);
        (0, vitest_1.expect)(deps.runtimeConfig.cooldown.enabled).toBe(true);
    });
    (0, vitest_1.it)("sets cooldown duration", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["cooldown", "120"]);
        (0, vitest_1.expect)(deps.runtimeConfig.cooldown.seconds).toBe(120);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("120s"));
    });
    (0, vitest_1.it)("rejects negative cooldown", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["cooldown", "-5"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Usage"));
        (0, vitest_1.expect)(deps.runtimeConfig.cooldown.seconds).toBe(60);
    });
});
(0, vitest_1.describe)("AdminService — reset", () => {
    (0, vitest_1.it)("resets cooldown", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["reset"]);
        (0, vitest_1.expect)(deps.cooldownService.reset).toHaveBeenCalled();
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("réinitialisé"));
    });
});
(0, vitest_1.describe)("AdminService — block / unblock", () => {
    (0, vitest_1.it)("blocks a user", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["block", "baduser"]);
        (0, vitest_1.expect)(deps.blacklistService.block).toHaveBeenCalledWith("baduser");
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("liste noire"));
    });
    (0, vitest_1.it)("strips @ from username when blocking", async () => {
        const deps = makeDeps();
        await new adminCommands_1.AdminService(deps).execute(makeContext(), ["block", "@baduser"]);
        (0, vitest_1.expect)(deps.blacklistService.block).toHaveBeenCalledWith("baduser");
    });
    (0, vitest_1.it)("requires a username argument for block", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["block"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Usage"));
        (0, vitest_1.expect)(deps.blacklistService.block).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("unblocks a user", async () => {
        const deps = makeDeps();
        deps.blacklistService.unblock = vitest_1.vi.fn(() => true);
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["unblock", "baduser"]);
        (0, vitest_1.expect)(deps.blacklistService.unblock).toHaveBeenCalledWith("baduser");
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("retiré"));
    });
    (0, vitest_1.it)("notifies when user not in blacklist", async () => {
        const deps = makeDeps();
        deps.blacklistService.unblock = vitest_1.vi.fn(() => false);
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["unblock", "nobody"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("n'est pas"));
    });
    (0, vitest_1.it)("shows blocklist", async () => {
        const deps = makeDeps();
        deps.blacklistService.list = vitest_1.vi.fn(() => ["alice", "bob"]);
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["blocklist"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("alice"));
    });
    (0, vitest_1.it)("shows empty blocklist message", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["blocklist"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("vide"));
    });
});
(0, vitest_1.describe)("AdminService — history", () => {
    (0, vitest_1.it)("shows last entries", async () => {
        const deps = makeDeps();
        deps.historyService.getLast = vitest_1.vi.fn(() => [
            { timestamp: new Date().toISOString(), username: "alice", url: "https://youtu.be/abc", durationSeconds: 15 }
        ]);
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["history"]);
        (0, vitest_1.expect)(deps.historyService.getLast).toHaveBeenCalledWith(5);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("alice"));
    });
    (0, vitest_1.it)("shows empty history message", async () => {
        const deps = makeDeps();
        const ctx = makeContext();
        await new adminCommands_1.AdminService(deps).execute(ctx, ["history"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("Aucun"));
    });
    (0, vitest_1.it)("respects n argument", async () => {
        const deps = makeDeps();
        deps.historyService.getLast = vitest_1.vi.fn(() => []);
        await new adminCommands_1.AdminService(deps).execute(makeContext(), ["history", "3"]);
        (0, vitest_1.expect)(deps.historyService.getLast).toHaveBeenCalledWith(3);
    });
});
