import { describe, expect, it, vi } from "vitest";
import { createGreenScreenCommand } from "../../src/commands/greenScreenCommand";

function makeDeps() {
  return {
    permissionService: { canUseGreenScreen: vi.fn(() => ({ allowed: true })) },
    cooldownService: { checkAndConsume: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })) },
    urlValidator: { validate: vi.fn(() => ({ valid: true })) },
    queue: {
      enqueue: vi.fn(async () => ({ status: "playing" as const })),
      stop: vi.fn(async () => undefined)
    },
    blacklistService: { isBlocked: vi.fn(() => false) },
    historyService: { record: vi.fn() },
    config: {
      access: { subOnly: true, modOnly: false },
      cooldown: { enabled: true, seconds: 60 },
      playback: { durationSeconds: 15, chatFeedback: true },
      validation: { allowedDomains: ["youtube.com"], allowDirectFiles: true, allowedFileExtensions: [".mp4"] }
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
}

const modCtx = (username = "u", isSubscriber = true) => ({
  channel: "#c",
  rawMessage: "!gs https://youtube.com/watch?v=1",
  user: { username, isMod: false, isSubscriber },
  reply: vi.fn(async () => undefined)
});

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
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it("blocks blacklisted user", async () => {
    const deps = makeDeps();
    deps.blacklistService.isBlocked = vi.fn(() => true);
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("banned");
    await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("autorisé"));
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues valid url and replies feedback", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("alice");
    await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://youtube.com/watch?v=1", username: "alice" })
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("En cours"));
    expect(deps.historyService.record).toHaveBeenCalled();
  });

  it("replies position when queued", async () => {
    const deps = makeDeps();
    deps.queue.enqueue = vi.fn(async () => ({ status: "queued" as const, position: 2 }));
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("bob");
    await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("position 2"));
    expect(deps.historyService.record).toHaveBeenCalled();
  });

  it("does not record history when dropped", async () => {
    const deps = makeDeps();
    deps.queue.enqueue = vi.fn(async () => ({ status: "dropped" as const, reason: "full" as const }));
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("charlie");
    await command.execute(ctx, ["https://youtube.com/watch?v=1"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("pleine"));
    expect(deps.historyService.record).not.toHaveBeenCalled();
  });

  it("propagates queue enqueue error", async () => {
    const deps = makeDeps();
    deps.queue.enqueue = vi.fn(async () => { throw new Error("queue error"); });
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx();
    await expect(command.execute(ctx, ["https://youtube.com/watch?v=1"])).rejects.toThrow("queue error");
  });
});
