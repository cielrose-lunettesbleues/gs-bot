import http from "http";
import net from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createControlServer } from "../../src/control/controlServer";

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

async function postEmergencyStop(port: number, token?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "POST",
        host: "127.0.0.1",
        port,
        path: "/actions/emergency-stop",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      }
    );

    req.once("error", reject);
    req.end();
  });
}

async function getPath(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method: "GET",
        host: "127.0.0.1",
        port,
        path
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body });
        });
      }
    );

    req.once("error", reject);
    req.end();
  });
}

describe("controlServer", () => {
  const stop = vi.fn(async () => undefined);
  const logger = { info: vi.fn(), error: vi.fn() };
  let runningServer: { stop: () => Promise<void> } | null = null;

  afterEach(async () => {
    if (runningServer) {
      await runningServer.stop();
      runningServer = null;
    }
    stop.mockClear();
    logger.info.mockClear();
    logger.error.mockClear();
  });

  it("triggers emergency stop with valid token", async () => {
    const port = await findOpenPort();
    const server = createControlServer(
      { enabled: true, host: "127.0.0.1", port, token: "secret" },
      { obsController: { emergencyStop: stop }, logger }
    );
    runningServer = server;
    await server.start();

    const response = await postEmergencyStop(port, "secret");
    expect(response.statusCode).toBe(200);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid token", async () => {
    const port = await findOpenPort();
    const server = createControlServer(
      { enabled: true, host: "127.0.0.1", port, token: "secret" },
      { obsController: { emergencyStop: stop }, logger }
    );
    runningServer = server;
    await server.start();

    const response = await postEmergencyStop(port, "wrong");
    expect(response.statusCode).toBe(401);
    expect(stop).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown route", async () => {
    const port = await findOpenPort();
    const server = createControlServer(
      { enabled: true, host: "127.0.0.1", port, token: "secret" },
      { obsController: { emergencyStop: stop }, logger }
    );
    runningServer = server;
    await server.start();

    const response = await getPath(port, "/unknown");
    expect(response.statusCode).toBe(404);
  });
});
