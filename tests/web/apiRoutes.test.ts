import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiRouter } from "../../src/web/routes/apiRoutes";
import type { SessionUser } from "../../src/auth/sessionMiddleware";

function makeTenant() {
  return {
    runtimeConfig: {
      access: { subOnly: false, modOnly: false },
      cooldown: { enabled: true, seconds: 60 },
      approval: { enabled: false },
      playback: { durationSeconds: 30, chatFeedback: true },
      tts: { enabled: false, provider: "elevenlabs", apiKey: "", volume: 1, maxLength: 200 },
      publicAccess: { overlayToken: "overlay-token" }
    },
    queue: {
      getState: vi.fn(() => ({ busy: false, pendingCount: 0 })),
      stop: vi.fn(async () => undefined)
    },
    approvalService: {
      listPending: vi.fn(() => []),
      approve: vi.fn(async () => true),
      deny: vi.fn(async () => true)
    },
    overlayBroadcaster: { clientCount: vi.fn(() => 2) },
    twitchBotManager: { status: vi.fn(() => ({ connected: true, channel: "streamer" })) },
    historyService: { getLast: vi.fn(() => [{ timestamp: new Date().toISOString(), username: "alice", url: "https://x.test", durationSeconds: 12 }]) },
    cooldownService: { reset: vi.fn() },
    router: {
      route: vi.fn(async (context: { reply: (text: string) => Promise<void> }) => {
        await context.reply("ok");
      })
    }
  };
}

function createApp(sessionUser: SessionUser | null) {
  const tenant = makeTenant();
  const tenantManager = {
    markDashboardActive: vi.fn(() => tenant),
    getOrCreate: vi.fn(() => tenant),
    getRuntimeState: vi.fn(() => ({
      resident: true,
      dashboardActive: true,
      dashboardLastSeenAt: new Date().toISOString(),
      dashboardExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      live: false,
      queueBusy: false,
      overlayClients: 2,
      twitchConnected: true,
      activeReasons: ["dashboard"]
    })),
    rotateOverlayToken: vi.fn(() => "rotated-token"),
    persistConfig: vi.fn()
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("sessionUser", sessionUser);
    await next();
  });
  app.route("/api", createApiRouter({ db: {} as never, logger: logger as never, tenantManager: tenantManager as never }));

  return { app, tenant, tenantManager, logger };
}

async function requestJson(
  app: Hono,
  path: string,
  init?: RequestInit
) {
  const response = await app.request(`http://example.com${path}`, init);
  const json = await response.json();
  return { response, json };
}

describe("apiRoutes", () => {
  let sessionUser: SessionUser;

  beforeEach(() => {
    sessionUser = { id: 42, twitchLogin: "streamer", accessToken: "token" };
  });

  it("rejects unauthorized requests", async () => {
    const { app } = createApp(null);
    const { response, json } = await requestJson(app, "/api/status");
    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns status and marks dashboard active", async () => {
    const { app, tenantManager } = createApp(sessionUser);
    const { response, json } = await requestJson(app, "/api/status");
    expect(response.status).toBe(200);
    expect(tenantManager.markDashboardActive).toHaveBeenCalledWith(42);
    expect(json.overlay.url).toContain("/overlay/streamer?token=overlay-token");
    expect(json.runtime.activeReasons).toEqual(["dashboard"]);
  });

  it("blocks mutating requests without same-origin headers", async () => {
    const { app } = createApp(sessionUser);
    const { response, json } = await requestJson(app, "/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subOnly: true })
    });
    expect(response.status).toBe(403);
    expect(json).toEqual({ ok: false, error: "csrf_check_failed" });
  });

  it("persists dashboard config patches", async () => {
    const { app, tenantManager } = createApp(sessionUser);
    const { response, json } = await requestJson(app, "/api/config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        origin: "http://example.com"
      },
      body: JSON.stringify({ subOnly: true, cooldownSeconds: 15, chatFeedback: false })
    });
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(tenantManager.persistConfig).toHaveBeenCalledWith(42, {
      sub_only: 1,
      cooldown_seconds: 15,
      chat_feedback: 0
    });
  });

  it("rotates overlay token and returns the new URL", async () => {
    const { app, tenantManager, logger } = createApp(sessionUser);
    const { response, json } = await requestJson(app, "/api/overlay/rotate-token", {
      method: "POST",
      headers: { origin: "http://example.com" }
    });
    expect(response.status).toBe(200);
    expect(tenantManager.rotateOverlayToken).toHaveBeenCalledWith(42);
    expect(logger.info).toHaveBeenCalled();
    expect(json).toEqual({ ok: true, overlayUrl: "/overlay/streamer?token=rotated-token" });
  });

  it("simulates a chat message and returns replies", async () => {
    const { app, tenant } = createApp(sessionUser);
    const { response, json } = await requestJson(app, "/api/simulate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://example.com"
      },
      body: JSON.stringify({ username: " test user ", message: "!gs test", isMod: true, isSubscriber: true })
    });
    expect(response.status).toBe(200);
    expect(tenant.router.route).toHaveBeenCalled();
    expect(json).toEqual({ ok: true, replies: ["ok"] });
  });
});
