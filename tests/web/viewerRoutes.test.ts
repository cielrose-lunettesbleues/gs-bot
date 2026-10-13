import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createViewerSession,
  getTenantConfig,
  openDatabase,
  updateTenantConfig,
  upsertUser,
  upsertViewer,
  type Database
} from "../../src/db/database";
import { registerViewerRoutes } from "../../src/web/routes/viewerRoutes";
import { clearRelationCache } from "../../src/viewer/viewerIdentity";

const ORIGIN = "http://example.com";

let testDir: string;
let db: Database;
let streamerId: number;
let webToken: string;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

beforeEach(() => {
  testDir = join(tmpdir(), `gs-viewer-routes-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  const streamer = upsertUser(db, {
    twitch_id: "broadcaster-1",
    twitch_login: "streamer",
    twitch_display_name: "Streamer",
    access_token: "broadcaster-token",
    refresh_token: "broadcaster-refresh",
    token_expires_at: nowSeconds() + 3600
  });
  streamerId = streamer.id;
  // Reading the config mints the public tokens
  webToken = getTenantConfig(db, streamerId).web_token;
  clearRelationCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearRelationCache();
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

function createApp(options?: { klipyApiKey?: string }) {
  const app = new Hono();
  const routed: Array<Record<string, unknown>> = [];
  const tenant = {
    runtimeConfig: { commands: { gs: "!gs" } },
    router: {
      route: vi.fn(async (ctx: { rawMessage: string; reply: (t: string) => Promise<void>; user: unknown }) => {
        routed.push({ rawMessage: ctx.rawMessage, user: ctx.user });
        await ctx.reply("@invite En cours (30s).");
      })
    }
  };
  const tenantManager = {
    getOrCreate: vi.fn(() => tenant),
    get: vi.fn(() => tenant)
  };

  registerViewerRoutes({
    app,
    db,
    oauthConfig: { clientId: "cid", clientSecret: "cs", redirectUri: `${ORIGIN}/auth/twitch/callback` },
    config: {
      sociavaultApiKey: "",
      klipyApiKey: options?.klipyApiKey ?? "",
      spritesDir: join(testDir, "sprites")
    } as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    tenantManager: tenantManager as never
  });

  return { app, tenantManager, routed };
}

function post(app: Hono, path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: ORIGIN
  };
  if (cookie) headers.Cookie = cookie;
  return app.request(`${ORIGIN}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function viewerCookie(login = "viewer1", twitchId = "viewer-1") {
  const viewer = upsertViewer(db, {
    twitch_id: twitchId,
    twitch_login: login,
    twitch_display_name: login
  });
  const sessionId = `session-${twitchId}`;
  createViewerSession(db, sessionId, viewer.id);
  return `gs_viewer=${sessionId}`;
}

describe("viewer submit page", () => {
  it("serves the page with a valid token", async () => {
    const { app } = createApp();
    const res = await app.request(`${ORIGIN}/submit/streamer?token=${webToken}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Envoyer une vidéo");
  });

  it("refuses a wrong token and an unknown channel", async () => {
    const { app } = createApp();
    expect((await app.request(`${ORIGIN}/submit/streamer?token=wrong`)).status).toBe(403);
    expect((await app.request(`${ORIGIN}/submit/streamer`)).status).toBe(403);
    expect((await app.request(`${ORIGIN}/submit/nobody?token=${webToken}`)).status).toBe(404);
  });

  it("refuses everything once the streamer disables the page", async () => {
    updateTenantConfig(db, streamerId, { web_submit_enabled: 0 });
    const { app } = createApp();

    expect((await app.request(`${ORIGIN}/submit/streamer?token=${webToken}`)).status).toBe(403);
    const res = await post(app, `/submit/streamer/send?token=${webToken}`, { url: "https://youtu.be/abc" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("submit_disabled");
  });

  it("never leaks the token through the state endpoint", async () => {
    const { app } = createApp();
    const body = await (await app.request(`${ORIGIN}/submit/streamer/state?token=${webToken}`)).json();
    expect(JSON.stringify(body)).not.toContain(webToken);
  });
});

describe("viewer submissions", () => {
  it("routes a guest submission through the command pipeline", async () => {
    const { app, routed, tenantManager } = createApp();

    const res = await post(app, `/submit/streamer/send?token=${webToken}`, {
      url: "https://youtu.be/abc",
      caption: "coucou",
      durationSeconds: 10
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.submittedAs).toBe("invite");
    expect(body.guest).toBe(true);
    expect(body.replies).toEqual(["@invite En cours (30s)."]);
    expect(tenantManager.getOrCreate).toHaveBeenCalledWith(streamerId);
    expect(routed[0].rawMessage).toBe("!gs https://youtu.be/abc /10 |coucou");
  });

  it("submits as the logged-in viewer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const { app, routed } = createApp();

    const res = await post(app, `/submit/streamer/send?token=${webToken}`, { url: "https://youtu.be/abc" }, viewerCookie());

    expect(res.status).toBe(200);
    expect((await res.json()).submittedAs).toBe("viewer1");
    expect(routed[0].user).toMatchObject({ username: "viewer1", isBroadcaster: false });
  });

  it("strips a pipe from the caption so it cannot forge a voice argument", async () => {
    const { app, routed } = createApp();

    await post(app, `/submit/streamer/send?token=${webToken}`, {
      url: "https://youtu.be/abc",
      caption: "salut | moi"
    });

    expect(routed[0].rawMessage).toBe("!gs https://youtu.be/abc |salut moi");
  });

  it("refuses a guest when the streamer requires a Twitch login", async () => {
    updateTenantConfig(db, streamerId, { web_guest_enabled: 0 });
    const { app, routed } = createApp();

    const res = await post(app, `/submit/streamer/send?token=${webToken}`, { url: "https://youtu.be/abc" });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("guest_disabled");
    expect(routed).toHaveLength(0);
  });

  it("refuses a guest in sub-only, since their status cannot be verified", async () => {
    updateTenantConfig(db, streamerId, { sub_only: 1 });
    const { app, routed } = createApp();

    const res = await post(app, `/submit/streamer/send?token=${webToken}`, { url: "https://youtu.be/abc" });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("login_required");
    expect(routed).toHaveLength(0);
  });

  it("refuses a submission without the same-origin header", async () => {
    const { app } = createApp();
    const res = await app.request(`${ORIGIN}/submit/streamer/send?token=${webToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://youtu.be/abc" })
    });
    expect(res.status).toBe(403);
  });

  it("rate limits bursts from one address", async () => {
    const { app } = createApp();
    const send = () => post(app, `/submit/streamer/send?token=${webToken}`, { url: "https://youtu.be/abc" });

    for (let i = 0; i < 5; i += 1) {
      expect((await send()).status).toBe(200);
    }
    const blocked = await send();

    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("rate_limited");
  });
});

describe("viewer preview", () => {
  it("refuses a url outside the allowed domains before fetching anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp();

    const res = await post(app, `/submit/streamer/preview?token=${webToken}`, { url: "https://evil.test/internal" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("url_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews an allowed youtube link", async () => {
    const { app } = createApp();
    const res = await post(app, `/submit/streamer/preview?token=${webToken}`, { url: "https://youtu.be/abc123" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toMatchObject({ kind: "youtube" });
  });
});

describe("viewer favorites", () => {
  it("requires a viewer session", async () => {
    const { app } = createApp();
    expect((await app.request(`${ORIGIN}/viewer/favorites`)).status).toBe(401);
    expect((await post(app, "/viewer/favorites", { url: "https://youtu.be/abc" })).status).toBe(401);
  });

  it("adds, lists and removes a favorite", async () => {
    const { app } = createApp();
    const cookie = viewerCookie();

    const created = await post(app, "/viewer/favorites", { url: "https://youtu.be/abc", label: "mon clip" }, cookie);
    expect(created.status).toBe(201);
    const favorite = (await created.json()).favorite;

    const listed = await (await app.request(`${ORIGIN}/viewer/favorites`, { headers: { Cookie: cookie } })).json();
    expect(listed.favorites).toHaveLength(1);
    expect(listed.favorites[0]).toMatchObject({ url: "https://youtu.be/abc", label: "mon clip" });

    const deleted = await app.request(`${ORIGIN}/viewer/favorites/${favorite.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: ORIGIN }
    });
    expect(deleted.status).toBe(200);

    const after = await (await app.request(`${ORIGIN}/viewer/favorites`, { headers: { Cookie: cookie } })).json();
    expect(after.favorites).toHaveLength(0);
  });

  it("refuses the same url twice", async () => {
    const { app } = createApp();
    const cookie = viewerCookie();

    await post(app, "/viewer/favorites", { url: "https://youtu.be/abc" }, cookie);
    const again = await post(app, "/viewer/favorites", { url: "https://youtu.be/abc" }, cookie);

    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe("already_favorite");
  });

  it("keeps favorites private to their viewer", async () => {
    const { app } = createApp();
    const mine = viewerCookie("viewer1", "viewer-1");
    const other = viewerCookie("viewer2", "viewer-2");

    const created = await post(app, "/viewer/favorites", { url: "https://youtu.be/abc" }, mine);
    const favoriteId = (await created.json()).favorite.id;

    const stolen = await app.request(`${ORIGIN}/viewer/favorites/${favoriteId}`, {
      method: "DELETE",
      headers: { Cookie: other, Origin: ORIGIN }
    });

    expect(stolen.status).toBe(404);
    const stillThere = await (await app.request(`${ORIGIN}/viewer/favorites`, { headers: { Cookie: mine } })).json();
    expect(stillThere.favorites).toHaveLength(1);
  });
});

describe("gif browsing", () => {
  it("says so plainly when the operator has no Klipy key", async () => {
    const { app } = createApp();

    const res = await post(app, `/submit/streamer/gifs?token=${webToken}`, { query: "chat" });

    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("gifs_not_configured");
  });

  it("returns results without ever exposing the key", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({
      data: { data: [{ title: "chat", file: { hd: { gif: { url: "https://cdn.test/a.gif" } }, sd: { gif: { url: "https://cdn.test/a-sd.gif" } } } }] }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { app } = createApp({ klipyApiKey: "klipy-key" });

    const res = await post(app, `/submit/streamer/gifs?token=${webToken}`, { query: "chat" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gifs).toEqual([
      { url: "https://cdn.test/a.gif", previewUrl: "https://cdn.test/a-sd.gif", title: "chat" }
    ]);
    expect(JSON.stringify(body)).not.toContain("klipy-key");
  });

  it("refuses an empty query and a request from another origin", async () => {
    const { app } = createApp({ klipyApiKey: "klipy-key" });

    expect((await post(app, `/submit/streamer/gifs?token=${webToken}`, { query: "" })).status).toBe(400);

    const crossOrigin = await app.request(`${ORIGIN}/submit/streamer/gifs?token=${webToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "chat" })
    });
    expect(crossOrigin.status).toBe(403);
  });
});

describe("sprite files", () => {
  it("serves a sprite, and refuses a name that could climb out of the folder", async () => {
    const spritesDir = join(testDir, "sprites");
    mkdirSync(spritesDir, { recursive: true });
    writeFileSync(join(spritesDir, "ring.png"), "png-bytes");
    const { app } = createApp();

    const served = await app.request(`${ORIGIN}/sprites/ring.png`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    expect((await app.request(`${ORIGIN}/sprites/missing.png`)).status).toBe(404);
    expect((await app.request(`${ORIGIN}/sprites/${encodeURIComponent("../../.env")}`)).status).toBe(404);
    expect((await app.request(`${ORIGIN}/sprites/sprites.json`)).status).toBe(404);
  });
});

describe("viewer login entry point", () => {
  it("redirects to Twitch for a valid channel and token", async () => {
    const { app } = createApp();
    const res = await app.request(`${ORIGIN}/viewer/auth/twitch?channel=streamer&token=${webToken}`);

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("id.twitch.tv/oauth2/authorize");
    // A viewer login must not request any scope
    expect(location).toContain("scope=&");
  });

  it("refuses to bounce through Twitch without a valid link", async () => {
    const { app } = createApp();
    expect((await app.request(`${ORIGIN}/viewer/auth/twitch?channel=streamer&token=wrong`)).status).toBe(403);
    expect((await app.request(`${ORIGIN}/viewer/auth/twitch?channel=nobody&token=${webToken}`)).status).toBe(404);
  });
});
