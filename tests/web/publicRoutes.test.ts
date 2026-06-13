import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../src/auth/sessionMiddleware";

const databaseMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getTenantConfig: vi.fn(),
  getUserByLogin: vi.fn(),
  upsertUser: vi.fn()
}));

const configMocks = vi.hoisted(() => ({
  saveServerOAuthConfig: vi.fn()
}));

const oauthMocks = vi.hoisted(() => ({
  buildAuthUrl: vi.fn(() => "https://id.twitch.tv/oauth2/authorize?state=test-state"),
  exchangeCode: vi.fn(),
  fetchUserInfo: vi.fn(),
  generateSessionId: vi.fn(() => "generated-session-id")
}));

vi.mock("../../src/db/database", () => ({
  ...databaseMocks
}));

vi.mock("../../src/config/serverConfig", () => ({
  saveServerOAuthConfig: configMocks.saveServerOAuthConfig
}));

vi.mock("../../src/auth/oauthHandler", () => ({
  buildAuthUrl: oauthMocks.buildAuthUrl,
  exchangeCode: oauthMocks.exchangeCode,
  fetchUserInfo: oauthMocks.fetchUserInfo,
  generateSessionId: oauthMocks.generateSessionId
}));

import { registerPublicRoutes } from "../../src/web/routes/publicRoutes";

function createApp(options?: {
  sessionUser?: SessionUser | null;
  oauthConfigured?: boolean;
  host?: string;
}) {
  const app = new Hono();
  const sessionUser = options?.sessionUser ?? null;
  const oauthConfig = {
    clientId: options?.oauthConfigured === false ? "" : "client-id",
    clientSecret: options?.oauthConfigured === false ? "" : "client-secret",
    redirectUri: "http://example.com/auth/twitch/callback"
  };
  const tenant = {
    runtimeConfig: { publicAccess: { overlayToken: "overlay-token" } },
    overlayBroadcaster: { clientCount: vi.fn(() => 0), addClient: vi.fn(() => () => undefined) },
    ttsService: { getAudio: vi.fn(() => null) },
    twitchBotManager: { start: vi.fn(async () => undefined) }
  };
  const tenantManager = {
    markDashboardActive: vi.fn(() => tenant),
    clearDashboardActivity: vi.fn(),
    reconcileTenant: vi.fn(async () => undefined),
    get: vi.fn(() => tenant),
    getOrCreate: vi.fn(() => tenant)
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config = {
    dataDir: ".\\data",
    setupToken: "setup-secret",
    youtubeApiKey: "",
    klipyApiKey: "",
    sociavaultApiKey: "",
    port: 4317,
    host: options?.host ?? "example.com",
    logLevel: "info",
    twitch: oauthConfig
  };

  app.use("*", async (c, next) => {
    c.set("sessionUser", sessionUser);
    await next();
  });

  registerPublicRoutes({
    app,
    db: {} as never,
    oauthConfig,
    config: config as never,
    logger: logger as never,
    tenantManager: tenantManager as never
  });

  return { app, tenantManager, oauthConfig, logger };
}

describe("publicRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.getTenantConfig.mockReturnValue({ overlay_token: "overlay-token" });
    databaseMocks.getUserByLogin.mockReturnValue({ id: 42, twitch_login: "streamer" });
    oauthMocks.exchangeCode.mockResolvedValue({ accessToken: "access", refreshToken: "refresh", expiresAt: 12345 });
    oauthMocks.fetchUserInfo.mockResolvedValue({ id: "tw-42", login: "streamer", displayName: "Streamer" });
    databaseMocks.upsertUser.mockReturnValue({ id: 42, twitch_login: "streamer" });
  });

  it("protects GET /setup without local access or setup token", async () => {
    const { app } = createApp({ oauthConfigured: false });
    const response = await app.request("http://example.com/setup");
    expect(response.status).toBe(403);
  });

  it("serves GET /setup with a valid setup token", async () => {
    const { app } = createApp({ oauthConfigured: false });
    const response = await app.request("http://example.com/setup?token=setup-secret");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain("Premier lancement");
  });

  it("saves OAuth config from POST /setup", async () => {
    const { app, oauthConfig, logger } = createApp({ oauthConfigured: false });
    const response = await app.request("http://example.com/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://example.com"
      },
      body: JSON.stringify({
        clientId: "new-client",
        clientSecret: "new-secret",
        redirectUri: "http://example.com/auth/twitch/callback",
        setupToken: "setup-secret"
      })
    });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(configMocks.saveServerOAuthConfig).toHaveBeenCalled();
    expect(oauthConfig.clientId).toBe("new-client");
    expect(logger.info).toHaveBeenCalled();
  });

  it("redirects authenticated users from / to /dashboard", async () => {
    const { app } = createApp({ sessionUser: { id: 42, twitchLogin: "streamer", accessToken: "token" } });
    const response = await app.request("http://example.com/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
  });

  it("serves dashboard and marks activity", async () => {
    const { app, tenantManager } = createApp({ sessionUser: { id: 42, twitchLogin: "streamer", accessToken: "token" } });
    const response = await app.request("http://example.com/dashboard");
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(tenantManager.markDashboardActive).toHaveBeenCalledWith(42);
    expect(body).toContain("Runtime");
    expect(body).toContain("/overlay/streamer?token=overlay-token");
  });

  it("rejects logout without same-origin protection", async () => {
    const { app } = createApp({ sessionUser: { id: 42, twitchLogin: "streamer", accessToken: "token" } });
    const response = await app.request("http://example.com/auth/logout", { method: "POST" });
    expect(response.status).toBe(403);
  });

  it("logs out and clears dashboard activity", async () => {
    const { app, tenantManager } = createApp({ sessionUser: { id: 42, twitchLogin: "streamer", accessToken: "token" } });
    const response = await app.request("http://example.com/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://example.com",
        cookie: "gs_session=session-123"
      }
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(databaseMocks.deleteSession).toHaveBeenCalledWith({}, "session-123");
    expect(tenantManager.clearDashboardActivity).toHaveBeenCalledWith(42);
    expect(tenantManager.reconcileTenant).toHaveBeenCalledWith(42);
  });

  it("rejects overlay with invalid token", async () => {
    const { app } = createApp();
    const response = await app.request("http://example.com/overlay/streamer?token=wrong");
    expect(response.status).toBe(403);
  });

  it("returns inactive overlay SSE when tenant runtime is missing", async () => {
    const { app, tenantManager } = createApp();
    (tenantManager.get as unknown as { mockImplementation: (fn: () => undefined) => void }).mockImplementation(() => undefined);
    const response = await app.request("http://example.com/overlay/streamer/events?token=overlay-token");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Overlay inactif");
  });

  it("rejects OAuth callback when state is missing or mismatched", async () => {
    const { app } = createApp();
    const response = await app.request("http://example.com/auth/twitch/callback?code=abc&state=wrong", {
      headers: { cookie: "oauth_state=expected" }
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Erreur CSRF");
  });

  it("renders OAuth provider error safely", async () => {
    const { app } = createApp();
    const response = await app.request("http://example.com/auth/twitch/callback?error=%3Cscript%3Ebad%3C%2Fscript%3E");
    const body = await response.text();
    expect(response.status).toBe(400);
    expect(body).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(body).not.toContain("<script>bad</script>");
  });

  it("creates a session and redirects on successful OAuth callback", async () => {
    const { app, tenantManager } = createApp();
    const response = await app.request("http://example.com/auth/twitch/callback?code=abc&state=expected", {
      headers: { cookie: "oauth_state=expected" }
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/dashboard");
    expect(databaseMocks.createSession).toHaveBeenCalledWith({}, "generated-session-id", 42);
    expect(tenantManager.getOrCreate).toHaveBeenCalledWith(42);
  });
});
