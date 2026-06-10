"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const greenScreenCommand_1 = require("../../src/commands/greenScreenCommand");
function makeDeps() {
    return {
        permissionService: { canUseGreenScreen: vitest_1.vi.fn(() => ({ allowed: true })) },
        cooldownService: { checkAndConsume: vitest_1.vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })) },
        urlValidator: { validate: vitest_1.vi.fn(() => ({ valid: true })) },
        queue: {
            enqueue: vitest_1.vi.fn(async () => ({ status: "playing" })),
            stop: vitest_1.vi.fn(async () => undefined)
        },
        blacklistService: {
            isBlocked: vitest_1.vi.fn(() => false),
            block: vitest_1.vi.fn(() => true),
            unblock: vitest_1.vi.fn(() => true),
            list: vitest_1.vi.fn(() => [])
        },
        historyService: {
            record: vitest_1.vi.fn(),
            getLast: vitest_1.vi.fn(() => [])
        },
        config: {
            access: { subOnly: true, modOnly: false },
            cooldown: { enabled: true, seconds: 60 },
            playback: { durationSeconds: 15, chatFeedback: true },
            validation: { allowedDomains: ["youtube.com"], allowDirectFiles: true, allowedFileExtensions: [".mp4"] }
        },
        logger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() }
    };
}
const modCtx = (username = "u", isSubscriber = true) => ({
    channel: "#c",
    rawMessage: "!gs https://youtube.com/watch?v=1",
    user: { username, isMod: false, isSubscriber },
    reply: vitest_1.vi.fn(async () => undefined)
});
(0, vitest_1.describe)("greenScreenCommand", () => {
    (0, vitest_1.it)("rejects missing url", async () => {
        const deps = makeDeps();
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const reply = vitest_1.vi.fn(async () => undefined);
        await command.execute({ channel: "#c", rawMessage: "!gs", user: { username: "u", isMod: false, isSubscriber: false }, reply }, []);
        (0, vitest_1.expect)(reply).toHaveBeenCalled();
        (0, vitest_1.expect)(deps.queue.enqueue).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("blocks blacklisted user", async () => {
        const deps = makeDeps();
        deps.blacklistService.isBlocked = vitest_1.vi.fn(() => true);
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const ctx = modCtx("banned");
        await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("autorisé"));
        (0, vitest_1.expect)(deps.queue.enqueue).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("enqueues valid url and replies feedback", async () => {
        const deps = makeDeps();
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const ctx = modCtx("alice");
        await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
        (0, vitest_1.expect)(deps.queue.enqueue).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ url: "https://youtube.com/watch?v=1", username: "alice" }));
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("En cours"));
        (0, vitest_1.expect)(deps.historyService.record).toHaveBeenCalled();
    });
    (0, vitest_1.it)("replies position when queued", async () => {
        const deps = makeDeps();
        deps.queue.enqueue = vitest_1.vi.fn(async () => ({ status: "queued", position: 2 }));
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const ctx = modCtx("bob");
        await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("position 2"));
        (0, vitest_1.expect)(deps.historyService.record).toHaveBeenCalled();
    });
    (0, vitest_1.it)("does not record history when dropped", async () => {
        const deps = makeDeps();
        deps.queue.enqueue = vitest_1.vi.fn(async () => ({ status: "dropped", reason: "full" }));
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const ctx = modCtx("charlie");
        await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
        (0, vitest_1.expect)(ctx.reply).toHaveBeenCalledWith(vitest_1.expect.stringContaining("pleine"));
        (0, vitest_1.expect)(deps.historyService.record).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("propagates queue enqueue error", async () => {
        const deps = makeDeps();
        deps.queue.enqueue = vitest_1.vi.fn(async () => { throw new Error("queue error"); });
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const ctx = modCtx();
        await (0, vitest_1.expect)(command.execute(ctx, ["https://youtube.com/watch?v=1"])).rejects.toThrow("queue error");
    });
});
