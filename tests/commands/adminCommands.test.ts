import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdminService } from "../../src/commands/adminCommands";
import type { CommandContext } from "../../src/twitch/twitchTypes";

function makeContext(overrides: Partial<CommandContext["user"]> = {}): CommandContext {
  return {
    channel: "#test",
    rawMessage: "",
    user: { username: "testmod", isMod: true, isBroadcaster: false, isSubscriber: false, ...overrides },
    reply: vi.fn(async () => undefined)
  };
}

function makeDeps() {
  const runtimeConfig = {
    access: { subOnly: true, modOnly: false },
    cooldown: { enabled: true, seconds: 60 }
  };
  const cooldownService = { reset: vi.fn() };
  const blacklistService = {
    isBlocked: vi.fn(() => false),
    block: vi.fn(),
    unblock: vi.fn(() => true),
    list: vi.fn(() => [] as string[])
  };
  const historyService = {
    record: vi.fn(),
    getLast: vi.fn(() => [])
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  return { runtimeConfig, cooldownService, blacklistService, historyService, logger };
}

describe("AdminService.isAdminKeyword", () => {
  it("recognizes all admin keywords", () => {
    const service = new AdminService(makeDeps());
    for (const kw of ["subonly", "modonly", "cooldown", "reset", "block", "unblock", "blocklist", "history"]) {
      expect(service.isAdminKeyword(kw)).toBe(true);
      expect(service.isAdminKeyword(kw.toUpperCase())).toBe(true);
    }
  });

  it("rejects non-admin tokens", () => {
    const service = new AdminService(makeDeps());
    expect(service.isAdminKeyword("https://youtube.com")).toBe(false);
    expect(service.isAdminKeyword("ban")).toBe(false);
  });
});

describe("AdminService — permission check", () => {
  it("rejects non-mod users", async () => {
    const deps = makeDeps();
    const service = new AdminService(deps);
    const ctx = makeContext({ isMod: false });
    await service.execute(ctx, ["subonly", "on"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("modérateurs"));
    expect(deps.runtimeConfig.access.subOnly).toBe(true);
  });
});

describe("AdminService — subonly", () => {
  it("enables subOnly", async () => {
    const deps = makeDeps();
    deps.runtimeConfig.access.subOnly = false;
    const service = new AdminService(deps);
    const ctx = makeContext();
    await service.execute(ctx, ["subonly", "on"]);
    expect(deps.runtimeConfig.access.subOnly).toBe(true);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("activé"));
  });

  it("disables subOnly", async () => {
    const deps = makeDeps();
    const service = new AdminService(deps);
    await service.execute(makeContext(), ["subonly", "off"]);
    expect(deps.runtimeConfig.access.subOnly).toBe(false);
  });

  it("rejects invalid argument", async () => {
    const deps = makeDeps();
    const service = new AdminService(deps);
    const ctx = makeContext();
    await service.execute(ctx, ["subonly", "maybe"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Usage"));
    expect(deps.runtimeConfig.access.subOnly).toBe(true);
  });
});

describe("AdminService — modonly", () => {
  it("enables modOnly", async () => {
    const deps = makeDeps();
    await new AdminService(deps).execute(makeContext(), ["modonly", "on"]);
    expect(deps.runtimeConfig.access.modOnly).toBe(true);
  });

  it("disables modOnly", async () => {
    const deps = makeDeps();
    deps.runtimeConfig.access.modOnly = true;
    await new AdminService(deps).execute(makeContext(), ["modonly", "off"]);
    expect(deps.runtimeConfig.access.modOnly).toBe(false);
  });
});

describe("AdminService — cooldown", () => {
  it("disables cooldown", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["cooldown", "off"]);
    expect(deps.runtimeConfig.cooldown.enabled).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("désactivé"));
  });

  it("enables cooldown", async () => {
    const deps = makeDeps();
    deps.runtimeConfig.cooldown.enabled = false;
    await new AdminService(deps).execute(makeContext(), ["cooldown", "on"]);
    expect(deps.runtimeConfig.cooldown.enabled).toBe(true);
  });

  it("sets cooldown duration", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["cooldown", "120"]);
    expect(deps.runtimeConfig.cooldown.seconds).toBe(120);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("120s"));
  });

  it("rejects negative cooldown", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["cooldown", "-5"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Usage"));
    expect(deps.runtimeConfig.cooldown.seconds).toBe(60);
  });
});

describe("AdminService — reset", () => {
  it("resets cooldown", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["reset"]);
    expect(deps.cooldownService.reset).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("réinitialisé"));
  });
});

describe("AdminService — block / unblock", () => {
  it("blocks a user", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["block", "baduser"]);
    expect(deps.blacklistService.block).toHaveBeenCalledWith("baduser");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("liste noire"));
  });

  it("strips @ from username when blocking", async () => {
    const deps = makeDeps();
    await new AdminService(deps).execute(makeContext(), ["block", "@baduser"]);
    expect(deps.blacklistService.block).toHaveBeenCalledWith("baduser");
  });

  it("requires a username argument for block", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["block"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Usage"));
    expect(deps.blacklistService.block).not.toHaveBeenCalled();
  });

  it("unblocks a user", async () => {
    const deps = makeDeps();
    deps.blacklistService.unblock = vi.fn(() => true);
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["unblock", "baduser"]);
    expect(deps.blacklistService.unblock).toHaveBeenCalledWith("baduser");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("retiré"));
  });

  it("notifies when user not in blacklist", async () => {
    const deps = makeDeps();
    deps.blacklistService.unblock = vi.fn(() => false);
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["unblock", "nobody"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("n'est pas"));
  });

  it("shows blocklist", async () => {
    const deps = makeDeps();
    deps.blacklistService.list = vi.fn(() => ["alice", "bob"]);
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["blocklist"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("alice"));
  });

  it("shows empty blocklist message", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["blocklist"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("vide"));
  });
});

describe("AdminService — history", () => {
  it("shows last entries", async () => {
    const deps = makeDeps();
    deps.historyService.getLast = vi.fn(() => [
      { timestamp: new Date().toISOString(), username: "alice", url: "https://youtu.be/abc", durationSeconds: 15 }
    ]);
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["history"]);
    expect(deps.historyService.getLast).toHaveBeenCalledWith(5);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("alice"));
  });

  it("shows empty history message", async () => {
    const deps = makeDeps();
    const ctx = makeContext();
    await new AdminService(deps).execute(ctx, ["history"]);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Aucun"));
  });

  it("respects n argument", async () => {
    const deps = makeDeps();
    deps.historyService.getLast = vi.fn(() => []);
    await new AdminService(deps).execute(makeContext(), ["history", "3"]);
    expect(deps.historyService.getLast).toHaveBeenCalledWith(3);
  });
});
