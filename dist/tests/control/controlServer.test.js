"use strict";
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
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(port);
            });
        });
    });
}
async function postEmergencyStop(port, token) {
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            method: "POST",
            host: "127.0.0.1",
            port,
            path: "/actions/emergency-stop",
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => {
                body += chunk.toString();
            });
            res.on("end", () => {
                resolve({ statusCode: res.statusCode ?? 0, body });
            });
        });
        req.once("error", reject);
        req.end();
    });
}
async function getPath(port, path) {
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            method: "GET",
            host: "127.0.0.1",
            port,
            path
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => {
                body += chunk.toString();
            });
            res.on("end", () => {
                resolve({ statusCode: res.statusCode ?? 0, body });
            });
        });
        req.once("error", reject);
        req.end();
    });
}
(0, vitest_1.describe)("controlServer", () => {
    const stop = vitest_1.vi.fn(async () => undefined);
    const logger = { info: vitest_1.vi.fn(), error: vitest_1.vi.fn() };
    let runningServer = null;
    (0, vitest_1.afterEach)(async () => {
        if (runningServer) {
            await runningServer.stop();
            runningServer = null;
        }
        stop.mockClear();
        logger.info.mockClear();
        logger.error.mockClear();
    });
    (0, vitest_1.it)("triggers emergency stop with valid token", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "secret" }, { obsController: { emergencyStop: stop }, logger });
        runningServer = server;
        await server.start();
        const response = await postEmergencyStop(port, "secret");
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(stop).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("rejects invalid token", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "secret" }, { obsController: { emergencyStop: stop }, logger });
        runningServer = server;
        await server.start();
        const response = await postEmergencyStop(port, "wrong");
        (0, vitest_1.expect)(response.statusCode).toBe(401);
        (0, vitest_1.expect)(stop).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("returns 404 for unknown route", async () => {
        const port = await findOpenPort();
        const server = (0, controlServer_1.createControlServer)({ enabled: true, host: "127.0.0.1", port, token: "secret" }, { obsController: { emergencyStop: stop }, logger });
        runningServer = server;
        await server.start();
        const response = await getPath(port, "/unknown");
        (0, vitest_1.expect)(response.statusCode).toBe(404);
    });
});
