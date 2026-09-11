import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { Logger } from "pino";
import { createLogger } from "./logger/logger";
import { openDatabase, purgeExpiredSessions } from "./db/database";
import { sessionMiddleware } from "./auth/sessionMiddleware";
import { TenantManager } from "./tenant/tenantManager";
import { LiveStatusPoller, LIVE_POLL_INTERVAL_MS } from "./tenant/liveStatusPoller";
import { createApiRouter } from "./web/routes/apiRoutes";
import { registerPublicRoutes } from "./web/routes/publicRoutes";
import { loadServerConfig } from "./config/serverConfig";
import type { ServerConfig } from "./config/serverConfig";

// ─── App bootstrap ────────────────────────────────────────────────────────────

export async function createApp(config: ServerConfig, logger: Logger) {
  const db = openDatabase(config.dataDir);
  const oauthConfig = {
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    redirectUri: config.twitch.redirectUri
  };
  const tenantManager = new TenantManager(
    db,
    logger,
    config.youtubeApiKey || undefined,
    config.klipyApiKey || undefined,
    config.sociavaultApiKey || undefined,
    oauthConfig
  );
  const liveStatusPoller = new LiveStatusPoller(db, oauthConfig, tenantManager, logger);

  // Purge expired sessions every hour
  setInterval(() => purgeExpiredSessions(db), 3_600_000);
  setInterval(() => {
    void liveStatusPoller.poll();
  }, LIVE_POLL_INTERVAL_MS);
  void liveStatusPoller.poll();

  const app = new Hono();
  app.use("*", sessionMiddleware(db, oauthConfig));
  registerPublicRoutes({ app, db, oauthConfig, config, logger, tenantManager });
  app.route("/api", createApiRouter({ db, logger, tenantManager }));

  return { app, tenantManager, db };
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────

async function main() {
  const config = loadServerConfig();
  const logger = createLogger(config.logLevel);

  const { app, tenantManager, db } = await createApp(config, logger);

  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    logger.info(
      { port: info.port },
      "GS Bot SaaS started — http://%s:%d/",
      config.host,
      info.port
    );
  });

  const shutdown = async () => {
    logger.info({}, "Shutting down...");
    await tenantManager.stopAll();
    db.close();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
