"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeEmergencyStop = executeEmergencyStop;
async function executeEmergencyStop(deps, triggerSource, username) {
    await deps.queue.stop();
    deps.logger.info({
        triggerSource,
        username: username ?? null,
        action: "emergency_stop"
    }, "Emergency stop executed");
}
