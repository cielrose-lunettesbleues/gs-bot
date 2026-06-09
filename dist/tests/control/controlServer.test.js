"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const net_1 = __importDefault(require("net"));
const vitest_1 = require("vitest");
const controlServer_1 = require("../../src/control/controlServer");
async function findOpenPort() {
    return new Promise((resolve, reject) => {
        const server = net_1.default.createServer();
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
function makeRequest(method, port, path, token, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
        const req = http_1.default.request({
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
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk.toString(); });
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data, headers: res.headers }));
        });
        req.once("error", reject);
        if (bodyStr)
            req.write(bodyStr);
        req.end();
    });
}
function makeDeps(overrides = {}) {
    return {
        queue: {
            stop: vitest_1.vi.fn(async () => undefined),
            getState: vitest_1.vi.fn(() => ({ busy: false, pendingCount: 0 }))
        },
        cooldownService: { reset: vitest_1.vi.fn() },
        blacklistService: { list: vitest_1.vi.fn(() => []) },
        historyService: { getLast: vitest_1.vi.fn(() => []) },
        approvalService: {
            pendingCount: vitest_1.vi.fn(() => 0),
            listPending: vitest_1.vi.fn(() => []),
            approve: vitest_1.vi.fn(async () => true),
            deny: vitest_1.vi.fn(async () => true)
        },
        overlayBroadcaster: {
            connect: vitest_1.vi.fn(),
            broadcast: vitest_1.vi.fn(),
            clientCount: vitest_1.vi.fn(() => 0)
        },
        router: { route: vitest_1.vi.fn(async () => undefined) },
        runtimeConfig: {
            access: { subOnly: false, modOnly: false },
            cooldown: { enabled: true, seconds: 60 },
            approval: { enabled: false }
        },
        logger: { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() },
        ...overrides
    };
}
(0, vitest_1.describe)("controlServer", () => {
    let runningServer = null;
    (0, vitest_1.afterEach)(async () => {
        if (runningServer) {
            await runningServer.stop();
            runningServer = null;
        }
    });
    (0, vitest_1.it)("triggers emergency stop with valid token (legacy endpoint)", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "secret" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/actions/emergency-stop", "secret");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.queue.stop).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("rejects invalid token on legacy endpoint", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "secret" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/actions/emergency-stop", "wrong");
        (0, vitest_1.expect)(res.statusCode).toBe(401);
        (0, vitest_1.expect)(deps.queue.stop).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("returns 404 for unknown route", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
        runningServer = server;
        await server.start();
        const res = await makeRequest("GET", port, "/unknown");
        (0, vitest_1.expect)(res.statusCode).toBe(404);
    });
    (0, vitest_1.it)("serves dashboard HTML at GET /", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
        runningServer = server;
        await server.start();
        const res = await makeRequest("GET", port, "/");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(res.body).toContain("<!DOCTYPE html>");
        (0, vitest_1.expect)(res.body).toContain("GS Bot");
    });
    (0, vitest_1.it)("serves overlay HTML at GET /overlay (no auth)", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "t" }, makeDeps());
        runningServer = server;
        await server.start();
        const res = await makeRequest("GET", port, "/overlay");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(res.body).toContain("<!DOCTYPE html>");
        (0, vitest_1.expect)(res.body).toContain("overlay/events");
    });
    (0, vitest_1.it)("GET /overlay/events calls overlayBroadcaster.connect", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "t" }, deps);
        runningServer = server;
        await server.start();
        // Use a net socket so we can close cleanly without triggering HTTP client errors
        const net = await Promise.resolve().then(() => __importStar(require("net")));
        await new Promise((resolve) => {
            const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
                socket.write("GET /overlay/events HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
                setTimeout(() => { socket.destroy(); resolve(); }, 60);
            });
            socket.on("error", () => resolve());
        });
        (0, vitest_1.expect)(deps.overlayBroadcaster.connect).toHaveBeenCalled();
    });
    (0, vitest_1.it)("GET /api/status requires auth and returns state", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const unauth = await makeRequest("GET", port, "/api/status");
        (0, vitest_1.expect)(unauth.statusCode).toBe(401);
        const ok = await makeRequest("GET", port, "/api/status", "tok");
        (0, vitest_1.expect)(ok.statusCode).toBe(200);
        const body = JSON.parse(ok.body);
        (0, vitest_1.expect)(body).toHaveProperty("config");
        (0, vitest_1.expect)(body).toHaveProperty("queue");
        (0, vitest_1.expect)(body).toHaveProperty("approval");
        (0, vitest_1.expect)(body).toHaveProperty("overlay");
        (0, vitest_1.expect)(body.config.access.subOnly).toBe(false);
    });
    (0, vitest_1.it)("PATCH /api/config mutates runtime config", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("PATCH", port, "/api/config", "tok", {
            subOnly: true,
            cooldownSeconds: 30
        });
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.runtimeConfig.access.subOnly).toBe(true);
        (0, vitest_1.expect)(deps.runtimeConfig.cooldown.seconds).toBe(30);
    });
    (0, vitest_1.it)("PATCH /api/config toggles approvalEnabled", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        await makeRequest("PATCH", port, "/api/config", "tok", { approvalEnabled: true });
        (0, vitest_1.expect)(deps.runtimeConfig.approval.enabled).toBe(true);
    });
    (0, vitest_1.it)("POST /api/queue/stop calls emergency stop", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/queue/stop", "tok");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.queue.stop).toHaveBeenCalled();
    });
    (0, vitest_1.it)("POST /api/cooldown/reset calls cooldownService.reset", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/cooldown/reset", "tok");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.cooldownService.reset).toHaveBeenCalled();
    });
    (0, vitest_1.it)("POST /api/approve/:username calls approvalService.approve", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/approve/alice", "tok");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.approvalService.approve).toHaveBeenCalledWith("alice", vitest_1.expect.any(Function));
    });
    (0, vitest_1.it)("POST /api/deny/:username calls approvalService.deny", async () => {
        const port = await findOpenPort();
        const deps = makeDeps();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/deny/bob", "tok");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        (0, vitest_1.expect)(deps.approvalService.deny).toHaveBeenCalledWith("bob", vitest_1.expect.any(Function));
    });
    (0, vitest_1.it)("POST /api/simulate routes message and returns replies", async () => {
        const port = await findOpenPort();
        const deps = makeDeps({
            router: {
                route: vitest_1.vi.fn(async (ctx) => {
                    await ctx.reply("!gs processed for " + ctx.user.username);
                })
            }
        });
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/simulate", "tok", {
            username: "alice",
            message: "!gs https://youtu.be/abc",
            isMod: true,
            isSubscriber: false
        });
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        (0, vitest_1.expect)(body.ok).toBe(true);
        (0, vitest_1.expect)(body.replies).toEqual(["!gs processed for alice"]);
        (0, vitest_1.expect)(deps.router.route).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            user: { username: "alice", isMod: true, isSubscriber: false },
            channel: "dashboard",
            rawMessage: "!gs https://youtu.be/abc"
        }));
    });
    (0, vitest_1.it)("POST /api/simulate returns 400 on empty message", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, makeDeps());
        runningServer = server;
        await server.start();
        const res = await makeRequest("POST", port, "/api/simulate", "tok", {
            username: "alice",
            message: ""
        });
        (0, vitest_1.expect)(res.statusCode).toBe(400);
    });
    (0, vitest_1.it)("GET /api/history returns entries", async () => {
        const port = await findOpenPort();
        const deps = makeDeps({
            historyService: {
                getLast: vitest_1.vi.fn(() => [
                    {
                        timestamp: "2024-01-01T10:00:00Z",
                        username: "alice",
                        url: "https://youtu.be/abc",
                        durationSeconds: 15
                    }
                ])
            }
        });
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "tok" }, deps);
        runningServer = server;
        await server.start();
        const res = await makeRequest("GET", port, "/api/history?n=5", "tok");
        (0, vitest_1.expect)(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        (0, vitest_1.expect)(body.entries).toHaveLength(1);
        (0, vitest_1.expect)(body.entries[0].username).toBe("alice");
        (0, vitest_1.expect)(deps.historyService.getLast).toHaveBeenCalledWith(5);
    });
});
