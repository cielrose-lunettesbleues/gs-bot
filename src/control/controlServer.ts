import http, { type IncomingMessage, type Server, type ServerResponse } from "http";
import { executeEmergencyStop, type StopActionDeps } from "../commands/stopAction";

export interface ControlServerConfig {
  enabled: boolean;
  host: string;
  port: number;
  token: string;
}

export interface ControlServer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function parseBearerToken(req: IncomingMessage): string | null {
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

function respondJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function createControlServer(
  config: ControlServerConfig,
  deps: StopActionDeps
): ControlServer {
  let server: Server | null = null;

  const requestHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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
      await executeEmergencyStop(deps, "streamdeck_plugin");
      respondJson(res, 200, { ok: true });
    } catch (error) {
      deps.logger.error({ error, triggerSource: "streamdeck_plugin" }, "Emergency stop failed from control API");
      respondJson(res, 500, { ok: false, error: "internal_error" });
    }
  };

  return {
    async start(): Promise<void> {
      if (!config.enabled || server) {
        return;
      }

      server = http.createServer((req, res) => {
        requestHandler(req, res).catch((error: unknown) => {
          deps.logger.error({ error }, "Unhandled control API request error");
          respondJson(res, 500, { ok: false, error: "internal_error" });
        });
      });

      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen(config.port, config.host, () => resolve());
      });
    },
    async stop(): Promise<void> {
      if (!server) {
        return;
      }

      const currentServer = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
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
