import http from "http";
import net from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createControlServer, type ControlServerDeps } from "../../src/control/controlServer";

async function findOpenPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not get test port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function makeRequest(
  method: string,
  port: number,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        method,
        host: "127.0.0.1",
        port,
        path,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(bodyStr
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) }
            : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk.toString(); });
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data, headers: res.headers })
        );
      }
    );
    req.once("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function makeDeps(overrides: Partial<ControlServerDeps> = {}): ControlServerDeps {
  return {
    queue: {
      stop: vi.fn(async () => undefined),
      getState: vi.fn(() => ({ busy: false, pendingCount: 0 }))
    },
    cooldownService: { reset: vi.fn() },
    blacklistService: { list: vi.fn(() => []) },
    historyService: { getLast: vi.fn(() => []) },
    approvalService: {
      pendingCount: vi.fn(() => 0),
      listPending: vi.fn(() => []),
      approve: vi.fn(async () => true),
      deny: vi.fn(async () => true)
    },
    overlayBroadcaster: {
      connect: vi.fn(),
      addClient: vi.fn(() => () => undefined),
      broadcast: vi.fn(),
      clientCount: vi.fn(() => 0)
    },
    router: { route: vi.fn(async () => undefined) },
    twitchBot: {
      status: vi.fn(() => ({ connected: false, channel: null, oauthClientId: null, redirectUri: "http://127.0.0.1:4317/oauth/callback" })),
      connectOAuth: vi.fn(async () => ({ channel: "testchannel" })),
      disconnectAndClear: vi.fn(async () => undefined)
    },
    runtimeConfig: {
      access: { subOnly: false, modOnly: false },
      cooldown: { enabled: true, seconds: 60 },
      approval: { enabled: false }
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides
  };
}

describe("controlServer", () => {
  let runningServer: { stop: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (runningServer) {
      await runningServer.stop();
      runningServer = null;
    }
  });

  it("triggers emergency stop with valid token (legacy endpoint)", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "secret" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/actions/emergency-stop", "secret");
    expect(res.statusCode).toBe(200);
    expect(deps.queue.stop).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid token on legacy endpoint", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "secret" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/actions/emergency-stop", "wrong");
    expect(res.statusCode).toBe(401);
    expect(deps.queue.stop).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown route", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/unknown");
    expect(res.statusCode).toBe(404);
  });

  it("serves dashboard HTML at GET /", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("GS Bot");
  });

  it("serves overlay HTML at GET /overlay (no auth)", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/overlay");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("EventSource");
  });

  it("GET /overlay/events calls overlayBroadcaster.connect", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "t" }, deps);
    runningServer = server;
    await server.start();

    // Use a net socket so we can close cleanly without triggering HTTP client errors
    const net = await import("net");
    await new Promise<void>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.write("GET /overlay/events HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
        setTimeout(() => { socket.destroy(); resolve(); }, 60);
      });
      socket.on("error", () => resolve());
    });

    expect(deps.overlayBroadcaster.connect).toHaveBeenCalled();
  });

  it("GET /api/status requires auth and returns state", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const unauth = await makeRequest("GET", port, "/api/status");
    expect(unauth.statusCode).toBe(401);

    const ok = await makeRequest("GET", port, "/api/status", "tok");
    expect(ok.statusCode).toBe(200);
    const body = JSON.parse(ok.body);
    expect(body).toHaveProperty("config");
    expect(body).toHaveProperty("queue");
    expect(body).toHaveProperty("approval");
    expect(body).toHaveProperty("overlay");
    expect(body.config.access.subOnly).toBe(false);
  });

  it("PATCH /api/config mutates runtime config", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("PATCH", port, "/api/config", "tok", {
      subOnly: true,
      cooldownSeconds: 30
    });
    expect(res.statusCode).toBe(200);
    expect(deps.runtimeConfig.access.subOnly).toBe(true);
    expect(deps.runtimeConfig.cooldown.seconds).toBe(30);
  });

  it("PATCH /api/config toggles approvalEnabled", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    await makeRequest("PATCH", port, "/api/config", "tok", { approvalEnabled: true });
    expect(deps.runtimeConfig.approval.enabled).toBe(true);
  });

  it("POST /api/queue/stop calls emergency stop", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/queue/stop", "tok");
    expect(res.statusCode).toBe(200);
    expect(deps.queue.stop).toHaveBeenCalled();
  });

  it("POST /api/cooldown/reset calls cooldownService.reset", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/cooldown/reset", "tok");
    expect(res.statusCode).toBe(200);
    expect(deps.cooldownService.reset).toHaveBeenCalled();
  });

  it("POST /api/approve/:username calls approvalService.approve", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/approve/alice", "tok");
    expect(res.statusCode).toBe(200);
    expect(deps.approvalService.approve).toHaveBeenCalledWith("alice", expect.any(Function));
  });

  it("POST /api/deny/:username calls approvalService.deny", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/deny/bob", "tok");
    expect(res.statusCode).toBe(200);
    expect(deps.approvalService.deny).toHaveBeenCalledWith("bob", expect.any(Function));
  });

  it("GET /oauth/callback serves callback HTML (no auth)", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/oauth/callback");
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<!DOCTYPE html>");
    expect(res.body).toContain("access_token");
  });

  it("GET /api/status includes twitch section", async () => {
    const port = await findOpenPort();
    const deps = makeDeps({
      twitchBot: {
        status: vi.fn(() => ({ connected: true, channel: "streamer", oauthClientId: "clientabc", redirectUri: "http://127.0.0.1/oauth/callback" })),
        connectOAuth: vi.fn(async () => ({ channel: "streamer" })),
        disconnectAndClear: vi.fn(async () => undefined)
      }
    });
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/api/status", "tok");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.twitch.connected).toBe(true);
    expect(body.twitch.channel).toBe("streamer");
    expect(body.twitch.oauth.available).toBe(true);
  });

  it("POST /api/twitch/auth calls connectOAuth and returns channel", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/twitch/auth", "tok", { token: "oauth-abc" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.channel).toBe("testchannel");
    expect(deps.twitchBot.connectOAuth).toHaveBeenCalledWith("oauth-abc");
  });

  it("POST /api/twitch/auth returns 400 when token missing", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/twitch/auth", "tok", { token: "" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/twitch/disconnect calls disconnectAndClear", async () => {
    const port = await findOpenPort();
    const deps = makeDeps();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/twitch/disconnect", "tok");
    expect(res.statusCode).toBe(200);
    expect(deps.twitchBot.disconnectAndClear).toHaveBeenCalled();
  });

  it("POST /api/simulate routes message and returns replies", async () => {
    const port = await findOpenPort();
    const deps = makeDeps({
      router: {
        route: vi.fn(async (ctx) => {
          await ctx.reply("!gs processed for " + ctx.user.username);
        })
      }
    });
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/simulate", "tok", {
      username: "alice",
      message: "!gs https://youtu.be/abc",
      isMod: true,
      isSubscriber: false
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.replies).toEqual(["!gs processed for alice"]);
    expect(deps.router.route).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { username: "alice", isMod: true, isBroadcaster: false, isSubscriber: false },
        channel: "dashboard",
        rawMessage: "!gs https://youtu.be/abc"
      })
    );
  });

  it("POST /api/simulate returns 400 on empty message", async () => {
    const port = await findOpenPort();
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, makeDeps());
    runningServer = server;
    await server.start();

    const res = await makeRequest("POST", port, "/api/simulate", "tok", {
      username: "alice",
      message: ""
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/history returns entries", async () => {
    const port = await findOpenPort();
    const deps = makeDeps({
      historyService: {
        getLast: vi.fn(() => [
          {
            timestamp: "2024-01-01T10:00:00Z",
            username: "alice",
            url: "https://youtu.be/abc",
            durationSeconds: 15
          }
        ])
      }
    });
    const server = createControlServer({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
    runningServer = server;
    await server.start();

    const res = await makeRequest("GET", port, "/api/history?n=5", "tok");
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].username).toBe("alice");
    expect(deps.historyService.getLast).toHaveBeenCalledWith(5);
  });
});
