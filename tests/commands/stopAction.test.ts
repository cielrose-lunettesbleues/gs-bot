import { describe, expect, it, vi } from "vitest";
import { executeEmergencyStop } from "../../src/commands/stopAction";

describe("executeEmergencyStop", () => {
  it("calls obs emergencyStop and logs source", async () => {
    const emergencyStop = vi.fn(async () => undefined);
    const logger = { info: vi.fn(), error: vi.fn() };

    await executeEmergencyStop(
      {
        obsController: { emergencyStop },
        logger
      },
      "streamdeck_plugin"
    );

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ triggerSource: "streamdeck_plugin", action: "emergency_stop" }),
      "Emergency stop executed"
    );
  });
});
