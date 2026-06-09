"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const stopAction_1 = require("../../src/commands/stopAction");
(0, vitest_1.describe)("executeEmergencyStop", () => {
    (0, vitest_1.it)("calls queue.stop and logs the action", async () => {
        const stop = vitest_1.vi.fn(async () => undefined);
        const logger = { info: vitest_1.vi.fn(), error: vitest_1.vi.fn() };
        await (0, stopAction_1.executeEmergencyStop)({ queue: { stop }, logger }, "streamdeck_plugin");
        (0, vitest_1.expect)(stop).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(logger.info).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ triggerSource: "streamdeck_plugin", action: "emergency_stop" }), "Emergency stop executed");
    });
});
