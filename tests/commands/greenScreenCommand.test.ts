import { describe, expect, it, vi } from "vitest";
import { createGreenScreenCommand } from "../../src/commands/greenScreenCommand";

function makeDeps() {
  return {
    permissionService: { canUseGreenScreen: vi.fn(() => ({ allowed: true })) },
    cooldownService: { checkAndConsume: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })) },
    urlValidator: { validate: vi.fn(() => ({ valid: true })) },
    obsController: { playTemporarySource: vi.fn(async () => undefined), emergencyStop: vi.fn(async () => undefined) },
    config: {
      access: { subOnly: true, modOnly: false },
      cooldown: { enabled: true, seconds: 60 },
      playback: { durationSeconds: 15 },
      validation: { allowedDomains: ["youtube.com"], allowDirectFiles: true, allowedFileExtensions: [".mp4"] }
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
}

describe("greenScreenCommand", () => {
  it("rejects missing url", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const reply = vi.fn(async () => undefined);

    await command.execute(
      { channel: "#c", rawMessage: "!gs", user: { username: "u", isMod: false, isSubscriber: false }, reply },
      []
    );

    expect(reply).toHaveBeenCalled();
    expect(deps.obsController.playTemporarySource).not.toHaveBeenCalled();
  });

  it("handles obs failure", async () => {
    const deps = makeDeps();
    deps.obsController.playTemporarySource = vi.fn(async () => {
      throw new Error("obs down");
    });
    const command = createGreenScreenCommand(deps, "!gs");
    const reply = vi.fn(async () => undefined);

    await expect(
      command.execute(
        {
          channel: "#c",
          rawMessage: "!gs https://youtube.com/watch?v=1",
          user: { username: "u", isMod: false, isSubscriber: true },
          reply
        },
        ["https://youtube.com/watch?v=1"]
      )
    ).rejects.toThrow("obs down");
  });
});
