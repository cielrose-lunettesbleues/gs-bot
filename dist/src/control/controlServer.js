"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createControlServer = createControlServer;
const http_1 = __importDefault(require("http"));
const stopAction_1 = require("../commands/stopAction");
function parseBearerToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }
    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || !token) {
        return null;
    }
    return token;
}
function respondJson(res, statusCode, payload) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
}
function createControlServer(config, deps) {
    let server = null;
    const requestHandler = async (req, res) => {
        const requestUrl = req.url ?? "";
        if (requestUrl !== "/actions/emergency-stop") {
            respondJson(res, 404, { ok: false, error: "not_found" });
            return;
        }
        if (req.method !== "POST") {
            respondJson(res, 405, { ok: false, error: "method_not_allowed" });
            return;
        }
        const token = parseBearerToken(req);
        if (token !== config.token) {
            respondJson(res, 401, { ok: false, error: "unauthorized" });
            return;
        }
        try {
            await (0, stopAction_1.executeEmergencyStop)(deps, "streamdeck_plugin");
            respondJson(res, 200, { ok: true });
        }
        catch (error) {
            deps.logger.error({ error, triggerSource: "streamdeck_plugin" }, "Emergency stop failed from control API");
            respondJson(res, 500, { ok: false, error: "internal_error" });
        }
    };
    return {
        async start() {
            if (!config.enabled || server) {
                return;
            }
            server = http_1.default.createServer((req, res) => {
                requestHandler(req, res).catch((error) => {
                    deps.logger.error({ error }, "Unhandled control API request error");
                    respondJson(res, 500, { ok: false, error: "internal_error" });
                });
            });
            await new Promise((resolve, reject) => {
                server?.once("error", reject);
                server?.listen(config.port, config.host, () => resolve());
            });
        },
        async stop() {
            if (!server) {
                return;
            }
            const currentServer = server;
            server = null;
            await new Promise((resolve, reject) => {
                currentServer.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
    };
}
