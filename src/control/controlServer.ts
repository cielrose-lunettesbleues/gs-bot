import http, { type IncomingMessage, type Server, type ServerResponse } from "http";
import { executeEmergencyStop } from "../commands/stopAction";
import { getDashboardHtml } from "./dashboardHtml";
import { getOverlayHtml } from "../overlay/overlayHtml";
import { getOAuthCallbackHtml } from "./oauthCallbackHtml";
import type { IOverlayBroadcaster } from "../overlay/overlayBroadcaster";
import type { HistoryEntry } from "../history/historyService";

export interface ControlServerConfig {
  enabled: boolean;
  host: string;
  port: number;
  token: string;
}

interface MutableRuntimeConfig {
  access: { subOnly: boolean; modOnly: boolean };
  cooldown: { enabled: boolean; seconds: number };
  approval: { enabled: boolean };
}

interface SimulatedUser {
  username: string;
  isMod: boolean;
  isSubscriber: boolean;
}

export interface TwitchBotDeps {
  status: () => { connected: boolean; channel: string | null; oauthClientId: string | null; redirectUri: string };
  connectOAuth: (token: string) => Promise<{ channel: string }>;
  disconnectAndClear: () => Promise<void>;
}

export interface ControlServerDeps {
  queue: { stop: () => Promise<void>; getState: () => { busy: boolean; pendingCount: number } };
  cooldownService: { reset: () => void };
  blacklistService: { list: () => string[] };
  historyService: { getLast: (n: number) => HistoryEntry[] };
  approvalService: {
    pendingCount: () => number;
    listPending: () => string[];
    approve: (username: string, reply: (msg: string) => Promise<void>) => Promise<boolean>;
    deny: (username: string, reply: (msg: string) => Promise<void>) => Promise<boolean>;
  };
  overlayBroadcaster: IOverlayBroadcaster;
  router: {
    route: (context: {
      user: SimulatedUser;
      channel: string;
      rawMessage: string;
      reply: (msg: string) => Promise<void>;
    }) => Promise<void>;
  };
  runtimeConfig: MutableRuntimeConfig;
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
  twitchBot: TwitchBotDeps;
}

export interface ControlServer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function parseBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

function respondJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function createControlServer(
  config: ControlServerConfig,
  deps: ControlServerDeps
): ControlServer {
  let server: Server | null = null;

  const noop = async (_msg: string): Promise<void> => undefined;

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // Dashboard HTML — no auth
    if (method === "GET" && url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
      return;
    }

    // Overlay HTML — no auth (OBS Browser Source can't send headers)
    if (method === "GET" && url === "/overlay") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getOverlayHtml());
      return;
    }

    // Overlay SSE — no auth
    if (method === "GET" && url === "/overlay/events") {
      deps.overlayBroadcaster.connect(req, res);
      return;
    }

    // OAuth callback page — no auth (redirect from Twitch)
    if (method === "GET" && url === "/oauth/callback") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getOAuthCallbackHtml());
      return;
    }

    // Legacy emergency-stop (StreamDeck plugins etc.)
    if (url === "/actions/emergency-stop") {
      if (method !== "POST") { respondJson(res, 405, { ok: false, error: "method_not_allowed" }); return; }
      if (parseBearerToken(req) !== config.token) { respondJson(res, 401, { ok: false, error: "unauthorized" }); return; }
      await executeEmergencyStop(deps, "streamdeck_plugin");
      respondJson(res, 200, { ok: true });
      return;
    }

    if (!url.startsWith("/api/")) {
      respondJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    // All /api/ routes require auth
    if (parseBearerToken(req) !== config.token) {
      respondJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }

    // GET /api/status
    if (method === "GET" && url === "/api/status") {
      const cfg = deps.runtimeConfig;
      const pending = deps.approvalService.listPending();
      const twitch = deps.twitchBot.status();
      respondJson(res, 200, {
        config: {
          access: { subOnly: cfg.access.subOnly, modOnly: cfg.access.modOnly },
          cooldown: { enabled: cfg.cooldown.enabled, seconds: cfg.cooldown.seconds },
          approval: { enabled: cfg.approval.enabled }
        },
        queue: deps.queue.getState(),
        approval: { pendingCount: pending.length, pending },
        overlay: { clients: deps.overlayBroadcaster.clientCount() },
        twitch: {
          connected: twitch.connected,
          channel: twitch.channel,
          oauth: {
            available: Boolean(twitch.oauthClientId),
            clientId: twitch.oauthClientId,
            redirectUri: twitch.redirectUri
          }
        }
      });
      return;
    }

    // GET /api/history?n=N
    if (method === "GET" && url.startsWith("/api/history")) {
      const rawN = new URL(url, "http://localhost").searchParams.get("n");
      const n = Math.min(Math.max(parseInt(rawN ?? "30", 10) || 30, 1), 100);
      respondJson(res, 200, { entries: deps.historyService.getLast(n) });
      return;
    }

    // PATCH /api/config
    if (method === "PATCH" && url === "/api/config") {
      const raw = await readBody(req);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw) as Record<string, unknown>; }
      catch { respondJson(res, 400, { ok: false, error: "invalid_json" }); return; }

      const cfg = deps.runtimeConfig;
      if (typeof body.subOnly === "boolean") cfg.access.subOnly = body.subOnly;
      if (typeof body.modOnly === "boolean") cfg.access.modOnly = body.modOnly;
      if (typeof body.cooldownEnabled === "boolean") cfg.cooldown.enabled = body.cooldownEnabled;
      if (typeof body.cooldownSeconds === "number" && body.cooldownSeconds >= 0) {
        cfg.cooldown.seconds = Math.floor(body.cooldownSeconds);
      }
      if (typeof body.approvalEnabled === "boolean") cfg.approval.enabled = body.approvalEnabled;

      deps.logger.info({ changes: body }, "Dashboard: config updated");
      respondJson(res, 200, { ok: true });
      return;
    }

    // POST /api/queue/stop
    if (method === "POST" && url === "/api/queue/stop") {
      await executeEmergencyStop(deps, "dashboard");
      respondJson(res, 200, { ok: true });
      return;
    }

    // POST /api/cooldown/reset
    if (method === "POST" && url === "/api/cooldown/reset") {
      deps.cooldownService.reset();
      deps.logger.info({}, "Dashboard: cooldown reset");
      respondJson(res, 200, { ok: true });
      return;
    }

    // POST /api/approve/:username
    const approveMatch = url.match(/^\/api\/approve\/([^/?]+)$/);
    if (method === "POST" && approveMatch) {
      const username = decodeURIComponent(approveMatch[1]);
      const ok = await deps.approvalService.approve(username, noop);
      if (ok) deps.logger.info({ username }, "Dashboard: approved request");
      respondJson(res, ok ? 200 : 404, { ok });
      return;
    }

    // POST /api/deny/:username
    const denyMatch = url.match(/^\/api\/deny\/([^/?]+)$/);
    if (method === "POST" && denyMatch) {
      const username = decodeURIComponent(denyMatch[1]);
      const ok = await deps.approvalService.deny(username, noop);
      if (ok) deps.logger.info({ username }, "Dashboard: denied request");
      respondJson(res, ok ? 200 : 404, { ok });
      return;
    }

    // POST /api/simulate — inject a chat message into the command router
    if (method === "POST" && url === "/api/simulate") {
      const raw = await readBody(req);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw) as Record<string, unknown>; }
      catch { respondJson(res, 400, { ok: false, error: "invalid_json" }); return; }

      const username = String(body.username ?? "testuser").replace(/\s/g, "").slice(0, 25) || "testuser";
      const message = String(body.message ?? "").trim();
      const isMod = body.isMod === true;
      const isSubscriber = body.isSubscriber === true;

      if (!message) { respondJson(res, 400, { ok: false, error: "message_required" }); return; }

      const replies: string[] = [];
      const context = {
        user: { username, isMod, isSubscriber },
        channel: "dashboard",
        rawMessage: message,
        reply: async (text: string) => { replies.push(text); }
      };

      try {
        await deps.router.route(context);
        deps.logger.info({ username, message, isMod, isSubscriber, replies }, "Dashboard: simulated message");
        respondJson(res, 200, { ok: true, replies });
      } catch (error) {
        deps.logger.error({ error, username, message }, "Dashboard: simulate error");
        respondJson(res, 500, { ok: false, error: "command_error" });
      }
      return;
    }

    // POST /api/twitch/auth — receive OAuth token, connect bot
    if (method === "POST" && url === "/api/twitch/auth") {
      const raw = await readBody(req);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw) as Record<string, unknown>; }
      catch { respondJson(res, 400, { ok: false, error: "invalid_json" }); return; }

      const token = String(body.token ?? "").trim();
      if (!token) { respondJson(res, 400, { ok: false, error: "token_required" }); return; }

      try {
        const result = await deps.twitchBot.connectOAuth(token);
        deps.logger.info({ channel: result.channel }, "Dashboard: Twitch OAuth connected");
        respondJson(res, 200, { ok: true, channel: result.channel });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "OAuth connection failed";
        deps.logger.error({ error }, "Dashboard: Twitch OAuth error");
        respondJson(res, 400, { ok: false, error: msg });
      }
      return;
    }

    // POST /api/twitch/disconnect — stop bot and clear persisted config
    if (method === "POST" && url === "/api/twitch/disconnect") {
      try {
        await deps.twitchBot.disconnectAndClear();
        respondJson(res, 200, { ok: true });
      } catch (error) {
        deps.logger.error({ error }, "Dashboard: Twitch disconnect error");
        respondJson(res, 500, { ok: false, error: "disconnect_failed" });
      }
      return;
    }

    respondJson(res, 404, { ok: false, error: "not_found" });
  };

  return {
    async start(): Promise<void> {
      if (!config.enabled || server) return;
      server = http.createServer((req, res) => {
        handleRequest(req, res).catch((error: unknown) => {
          deps.logger.error({ error }, "Control server unhandled error");
          respondJson(res, 500, { ok: false, error: "internal_error" });
        });
      });
      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(config.port, config.host, () => resolve());
      });
    },
    async stop(): Promise<void> {
      if (!server) return;
      const s = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        s.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };
}
