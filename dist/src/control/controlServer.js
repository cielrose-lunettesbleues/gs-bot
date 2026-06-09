"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createControlServer = createControlServer;
const http_1 = __importDefault(require("http"));
const stopAction_1 = require("../commands/stopAction");
const dashboardHtml_1 = require("./dashboardHtml");
const overlayHtml_1 = require("../overlay/overlayHtml");
function parseBearerToken(req) {
    const auth = req.headers.authorization;
    if (!auth)
        return null;
    const [scheme, token] = auth.split(" ");
    return scheme === "Bearer" && token ? token : null;
}
function respondJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => { body += chunk.toString(); });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}
function createControlServer(config, deps) {
    let server = null;
    const noop = async (_msg) => undefined;
    const handleRequest = async (req, res) => {
        const url = req.url ?? "/";
        const method = req.method ?? "GET";
        // Dashboard HTML — no auth required
        if (method === "GET" && url === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end((0, dashboardHtml_1.getDashboardHtml)());
            return;
        }
        // Overlay HTML — no auth required (loaded as OBS Browser Source)
        if (method === "GET" && url === "/overlay") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end((0, overlayHtml_1.getOverlayHtml)());
            return;
        }
        // Overlay SSE stream — no auth (same reason: OBS Browser Source can't set headers)
        if (method === "GET" && url === "/overlay/events") {
            deps.overlayBroadcaster.connect(req, res);
            return;
        }
        // Legacy emergency-stop (backward compat with StreamDeck plugins etc.)
        if (url === "/actions/emergency-stop") {
            if (method !== "POST") {
                respondJson(res, 405, { ok: false, error: "method_not_allowed" });
                return;
            }
            if (parseBearerToken(req) !== config.token) {
                respondJson(res, 401, { ok: false, error: "unauthorized" });
                return;
            }
            await (0, stopAction_1.executeEmergencyStop)(deps, "streamdeck_plugin");
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
            respondJson(res, 200, {
                config: {
                    access: { subOnly: cfg.access.subOnly, modOnly: cfg.access.modOnly },
                    cooldown: { enabled: cfg.cooldown.enabled, seconds: cfg.cooldown.seconds },
                    approval: { enabled: cfg.approval.enabled }
                },
                queue: deps.queue.getState(),
                approval: { pendingCount: pending.length, pending },
                overlay: { clients: deps.overlayBroadcaster.clientCount() }
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
            let body;
            try {
                body = JSON.parse(raw);
            }
            catch {
                respondJson(res, 400, { ok: false, error: "invalid_json" });
                return;
            }
            const cfg = deps.runtimeConfig;
            if (typeof body.subOnly === "boolean")
                cfg.access.subOnly = body.subOnly;
            if (typeof body.modOnly === "boolean")
                cfg.access.modOnly = body.modOnly;
            if (typeof body.cooldownEnabled === "boolean")
                cfg.cooldown.enabled = body.cooldownEnabled;
            if (typeof body.cooldownSeconds === "number" && body.cooldownSeconds >= 0) {
                cfg.cooldown.seconds = Math.floor(body.cooldownSeconds);
            }
            if (typeof body.approvalEnabled === "boolean")
                cfg.approval.enabled = body.approvalEnabled;
            deps.logger.info({ changes: body }, "Dashboard: config updated");
            respondJson(res, 200, { ok: true });
            return;
        }
        // POST /api/queue/stop
        if (method === "POST" && url === "/api/queue/stop") {
            await (0, stopAction_1.executeEmergencyStop)(deps, "dashboard");
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
            if (ok)
                deps.logger.info({ username }, "Dashboard: approved request");
            respondJson(res, ok ? 200 : 404, { ok });
            return;
        }
        // POST /api/deny/:username
        const denyMatch = url.match(/^\/api\/deny\/([^/?]+)$/);
        if (method === "POST" && denyMatch) {
            const username = decodeURIComponent(denyMatch[1]);
            const ok = await deps.approvalService.deny(username, noop);
            if (ok)
                deps.logger.info({ username }, "Dashboard: denied request");
            respondJson(res, ok ? 200 : 404, { ok });
            return;
        }
        // POST /api/simulate — inject a chat message directly into the command router
        if (method === "POST" && url === "/api/simulate") {
            const raw = await readBody(req);
            let body;
            try {
                body = JSON.parse(raw);
            }
            catch {
                respondJson(res, 400, { ok: false, error: "invalid_json" });
                return;
            }
            const username = String(body.username ?? "testuser").replace(/\s/g, "").slice(0, 25) || "testuser";
            const message = String(body.message ?? "").trim();
            const isMod = body.isMod === true;
            const isSubscriber = body.isSubscriber === true;
            if (!message) {
                respondJson(res, 400, { ok: false, error: "message_required" });
                return;
            }
            const replies = [];
            const context = {
                user: { username, isMod, isSubscriber },
                channel: "dashboard",
                rawMessage: message,
                reply: async (text) => { replies.push(text); }
            };
            try {
                await deps.router.route(context);
                deps.logger.info({ username, message, isMod, isSubscriber, replies }, "Dashboard: simulated message");
                respondJson(res, 200, { ok: true, replies });
            }
            catch (error) {
                deps.logger.error({ error, username, message }, "Dashboard: simulate error");
                respondJson(res, 500, { ok: false, error: "command_error" });
            }
            return;
        }
        respondJson(res, 404, { ok: false, error: "not_found" });
    };
    return {
        async start() {
            if (!config.enabled || server)
                return;
            server = http_1.default.createServer((req, res) => {
                handleRequest(req, res).catch((error) => {
                    deps.logger.error({ error }, "Control server unhandled error");
                    respondJson(res, 500, { ok: false, error: "internal_error" });
                });
            });
            await new Promise((resolve, reject) => {
                server?.once("error", reject);
                server?.listen(config.port, config.host, () => resolve());
            });
        },
        async stop() {
            if (!server)
                return;
            const s = server;
            server = null;
            await new Promise((resolve, reject) => {
                s.close((err) => (err ? reject(err) : resolve()));
            });
        }
    };
}
