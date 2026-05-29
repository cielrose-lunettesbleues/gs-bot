"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const commandRouter_1 = require("../../src/commands/commandRouter");
(0, vitest_1.describe)("CommandRouter", () => {
    (0, vitest_1.it)("routes matching command", async () => {
        const execute = vitest_1.vi.fn(async () => undefined);
        const router = new commandRouter_1.CommandRouter([{ name: "!gs", aliases: [], execute }]);
        await router.route({
            channel: "#test",
            rawMessage: "!gs https://x",
            user: { username: "u", isMod: false, isSubscriber: false },
            reply: async () => undefined
        });
        (0, vitest_1.expect)(execute).toHaveBeenCalled();
    });
});
