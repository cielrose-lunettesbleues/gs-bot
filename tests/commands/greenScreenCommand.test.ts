import { describe, expect, it, vi } from "vitest";
import { createGreenScreenCommand } from "../../src/commands/greenScreenCommand";
import type { EnqueueResult } from "../../src/queue/playbackQueue";

function makeDeps() {
  return {
    permissionService: { canUseGreenScreen: vi.fn(() => ({ allowed: true })) },
    cooldownService: { checkAndConsume: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })) },
    urlValidator: { validate: vi.fn(() => ({ valid: true })) },
    queue: {
      enqueue: vi.fn(async (): Promise<EnqueueResult> => ({ status: "playing" })),
      stop: vi.fn(async () => undefined)
    },
    blacklistService: {
      isBlocked: vi.fn(() => false),
      block: vi.fn(() => true),
      unblock: vi.fn(() => true),
      list: vi.fn(() => [] as string[])
    },
    historyService: {
      record: vi.fn(),
      getLast: vi.fn(() => [])
    },
    config: {
      access: { subOnly: true, modOnly: false },
      cooldown: { enabled: true, seconds: 60 },
      playback: { durationSeconds: 15, chatFeedback: true },
      validation: { allowedDomains: ["youtube.com"], allowDirectFiles: true, allowedFileExtensions: [".mp4"], maxDurationSeconds: 0 }
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
}

const modCtx = (username = "u", isSubscriber = true) => ({
  channel: "#c",
  rawMessage: "!gs https://youtube.com/watch?v=1",
  user: { username, isMod: false, isBroadcaster: false, isSubscriber },
  reply: vi.fn(async () => undefined)
});

describe("greenScreenCommand", () => {
  it("rejects missing url", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const reply = vi.fn(async () => undefined);
    await command.execute(
      { channel: "#c", rawMessage: "!gs", user: { username: "u", isMod: false, isBroadcaster: false, isSubscriber: false }, reply },
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

  const IG_REEL = "https://www.instagram.com/reel/DEiyb48AeB9/";

  it("plays a resolved Instagram reel", async () => {
    const deps = makeDeps();
    const instagramResolve = vi.fn(async () => ({
      url: "https://cdn.test/reel.mp4",
      durationSeconds: 9,
      portrait: true
    }));
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("dana");

    await command.execute(ctx, [IG_REEL]);

    expect(instagramResolve).toHaveBeenCalledWith(IG_REEL);
    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cdn.test/reel.mp4", durationSeconds: 9, portrait: true })
    );
  });

  it("refuses an Instagram reel longer than the configured maximum", async () => {
    const deps = makeDeps();
    deps.config.validation.maxDurationSeconds = 30;
    const instagramResolve = vi.fn(async () => ({
      url: "https://cdn.test/long.mp4",
      durationSeconds: 77,
      portrait: true
    }));
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("erin");

    await command.execute(ctx, [IG_REEL]);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("trop longue"));
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it("reports an Instagram url it cannot resolve", async () => {
    const deps = makeDeps();
    const instagramResolve = vi.fn(async () => null);
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("fred");

    await command.execute(ctx, ["https://www.instagram.com/someone/"]);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Impossible de résoudre"));
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it("says Instagram is not configured when no resolver is wired", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("gina");

    await command.execute(ctx, [IG_REEL]);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("non configurée"));
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  function instagramDeps(durationSeconds = 77) {
    const deps = makeDeps();
    const instagramResolve = vi.fn(async () => ({
      url: "https://cdn.test/reel.mp4",
      durationSeconds,
      portrait: true
    }));
    return { deps, instagramResolve };
  }

  it("cuts playback at a duration token placed before the caption", async () => {
    const { deps, instagramResolve } = instagramDeps();
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("hugo");

    await command.execute(ctx, [IG_REEL, "/10", "|bonjour"]);

    expect(instagramResolve).toHaveBeenCalledWith(IG_REEL);
    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 10, cutAfterSeconds: 10, caption: "bonjour" })
    );
  });

  it("cuts playback at a duration token placed after the caption", async () => {
    const { deps, instagramResolve } = instagramDeps();
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("ines");

    await command.execute(ctx, [IG_REEL, "|bonjour", "/10"]);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 10, cutAfterSeconds: 10, caption: "bonjour" })
    );
  });

  it("keeps a reel longer than the maximum when a shorter cut is requested", async () => {
    const { deps, instagramResolve } = instagramDeps(77);
    deps.config.validation.maxDurationSeconds = 30;
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("jules");

    await command.execute(ctx, [IG_REEL, "/10"]);

    expect(ctx.reply).not.toHaveBeenCalledWith(expect.stringContaining("trop longue"));
    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 10, cutAfterSeconds: 10 })
    );
  });

  it("clamps a requested cut to the tenant maximum", async () => {
    const { deps, instagramResolve } = instagramDeps(120);
    deps.config.validation.maxDurationSeconds = 30;
    const command = createGreenScreenCommand({ ...deps, instagramResolve }, "!gs");
    const ctx = modCtx("kenza");

    await command.execute(ctx, [IG_REEL, "/60"]);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 30, cutAfterSeconds: 30 })
    );
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("En cours (30s)"));
  });

  it("applies a duration token to a plain youtube url", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("lena");

    await command.execute(ctx, ["https://youtube.com/watch?v=1", "/8"]);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://youtube.com/watch?v=1",
        durationSeconds: 8,
        cutAfterSeconds: 8
      })
    );
  });

  it("leaves playback untouched without a duration token", async () => {
    const deps = makeDeps();
    const command = createGreenScreenCommand(deps, "!gs");
    const ctx = modCtx("marc");

    await command.execute(ctx, ["https://youtube.com/watch?v=1"]);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 15, cutAfterSeconds: undefined })
    );
  });
});
