"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const greenScreenCommand_1 = require("../../src/commands/greenScreenCommand");
function makeDeps() {
    return {
        permissionService: { canUseGreenScreen: vitest_1.vi.fn(() => ({ allowed: true })) },
        cooldownService: { checkAndConsume: vitest_1.vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })) },
        urlValidator: { validate: vitest_1.vi.fn(() => ({ valid: true })) },
        obsController: { playTemporarySource: vitest_1.vi.fn(async () => undefined), emergencyStop: vitest_1.vi.fn(async () => undefined) },
        config: {
            access: { subOnly: true, modOnly: false },
            cooldown: { enabled: true, seconds: 60 },
            playback: { durationSeconds: 15 },
            validation: { allowedDomains: ["youtube.com"], allowDirectFiles: true, allowedFileExtensions: [".mp4"] }
        },
        logger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() }
    };
}
(0, vitest_1.describe)("greenScreenCommand", () => {
    (0, vitest_1.it)("rejects missing url", async () => {
        const deps = makeDeps();
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const reply = vitest_1.vi.fn(async () => undefined);
        await command.execute({ channel: "#c", rawMessage: "!gs", user: { username: "u", isMod: false, isSubscriber: false }, reply }, []);
        (0, vitest_1.expect)(reply).toHaveBeenCalled();
        (0, vitest_1.expect)(deps.obsController.playTemporarySource).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("handles obs failure", async () => {
        const deps = makeDeps();
        deps.obsController.playTemporarySource = vitest_1.vi.fn(async () => {
            throw new Error("obs down");
        });
        const command = (0, greenScreenCommand_1.createGreenScreenCommand)(deps, "!gs");
        const reply = vitest_1.vi.fn(async () => undefined);
        await (0, vitest_1.expect)(command.execute({
            channel: "#c",
            rawMessage: "!gs https://youtube.com/watch?v=1",
            user: { username: "u", isMod: false, isSubscriber: true },
            reply
        }, ["https://youtube.com/watch?v=1"])).rejects.toThrow("obs down");
    });
});
