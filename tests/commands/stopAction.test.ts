import { describe, expect, it, vi } from "vitest";
import { executeEmergencyStop } from "../../src/commands/stopAction";

describe("executeEmergencyStop", () => {
  it("calls queue.stop and logs the action", async () => {
    const stop = vi.fn(async () => undefined);
    const logger = { info: vi.fn(), error: vi.fn() };

    await executeEmergencyStop({ queue: { stop }, logger }, "streamdeck_plugin");

    expect(stop).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ triggerSource: "streamdeck_plugin", action: "emergency_stop" }),
      "Emergency stop executed"
    );
  });
});
