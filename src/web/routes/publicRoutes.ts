import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Logger } from "pino";
import { createSession, deleteSession, getTenantConfig, getUserByLogin, upsertUser, type Database } from "../../db/database";
import { buildAuthUrl, exchangeCode, fetchUserInfo, generateSessionId, type OAuthConfig } from "../../auth/oauthHandler";
import {
  clearSessionCookie,
  getCookie,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  type SessionUser
} from "../../auth/sessionMiddleware";
import type { ServerConfig } from "../../config/serverConfig";
import { saveServerOAuthConfig } from "../../config/serverConfig";
import { getOverlayHtml, getOverlayVersion } from "../../overlay/overlayHtml";
import type { OverlayBroadcaster } from "../../overlay/overlayBroadcaster";
import { buildMonitorSnapshot } from "../../overlay/monitorSnapshot";
import { TenantManager } from "../../tenant/tenantManager";
import { executeEmergencyStop } from "../../commands/stopAction";
import { getDashboardHtml } from "../../views/dashboardHtml";
import { getLoginHtml } from "../../views/loginHtml";
import { getSetupHtml } from "../../views/setupHtml";
import { overlayEndedSchema, setupSchema, parseJsonBody } from "../requestValidation";
import { buildOverlayPath, buildSubmitPath, isValidSetupRequest } from "../publicTokens";
import { clearViewerFlow, completeViewerLogin, readViewerFlow } from "../../viewer/viewerLogin";
import { escapeHtml, isSecureRequest, verifySameOrigin } from "../../security/httpSecurity";

const MAX_OVERLAY_CLIENTS_PER_TENANT = 3;
const MAX_MONITOR_CLIENTS_PER_TENANT = 3;
// The queue and approvals have no event of their own, so the monitor samples
// them; a start or stop also triggers an immediate sample.
const MONITOR_POLL_MS = 1_000;
const MONITOR_HEARTBEAT_MS = 25_000;

interface PublicRoutesDeps {
  app: Hono;
  db: Database;
  oauthConfig: OAuthConfig;
  config: ServerConfig;
  logger: Logger;
  tenantManager: TenantManager;
}

export function registerPublicRoutes({ app, db, oauthConfig, config, logger, tenantManager }: PublicRoutesDeps): void {
  const monitorClients = new Map<number, number>();

  app.get("/setup", (c) => {
    if (oauthConfig.clientId && oauthConfig.clientSecret) return c.redirect("/");
    if (!isValidSetupRequest(c, config)) {
      return c.html("<p>Setup protégé. Utilise <code>/setup?token=...</code> avec <code>GS_SETUP_TOKEN</code> ou ouvre cette route en local.</p>", 403);
    }
    return c.html(getSetupHtml());
  });

  app.post("/setup", async (c) => {
    if (oauthConfig.clientId && oauthConfig.clientSecret) {
      return c.json({ ok: false, error: "already_configured" }, 400);
    }
    if (!verifySameOrigin(c)) {
      return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    }

    const parsed = await parseJsonBody(c, setupSchema);
    if (!parsed.success) return parsed.response;
    if (!isValidSetupRequest(c, config, parsed.data.setupToken)) {
      return c.json({ ok: false, error: "setup_forbidden" }, 403);
    }

    const { clientId, clientSecret, redirectUri } = parsed.data;
    saveServerOAuthConfig(config.dataDir, clientId, clientSecret, redirectUri);
    oauthConfig.clientId = clientId;
    oauthConfig.clientSecret = clientSecret;
    oauthConfig.redirectUri = redirectUri;
    logger.info({}, "OAuth configuration saved via setup wizard");
    return c.json({ ok: true });
  });

  app.get("/", (c) => {
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) return c.redirect("/setup");
    const user = requireAuth(c);
    if (!user) return c.html(getLoginHtml(oauthConfig.clientId));
    return c.redirect("/dashboard");
  });

  app.get("/dashboard", (c) => {
    const user = requireAuth(c);
    if (!user) return c.redirect("/");
    const tenant = tenantManager.markDashboardActive(user.id);
    return c.html(getDashboardHtml(user.twitchLogin, buildOverlayPath(user.twitchLogin, tenant.runtimeConfig.publicAccess.overlayToken)));
  });

  app.get("/auth/twitch", (c) => {
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      return c.redirect("/");
    }
    const state = crypto.randomUUID();
    const secure = isSecureRequest(c);
    c.header("Set-Cookie", `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300${secure ? "; Secure" : ""}`);
    return c.redirect(buildAuthUrl(oauthConfig, state));
  });

  app.get("/auth/twitch/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.html(`<p>Twitch a refusé l'autorisation : ${escapeHtml(error)}. <a href="/">Retour</a></p>`, 400);
    }
    if (!code) {
      return c.html("<p>Code manquant dans le callback OAuth.</p>", 400);
    }

    const cookieState = getCookie(c, "oauth_state");
    if (!state || !cookieState || state !== cookieState) {
      return c.html("<p>Erreur CSRF — réessaie.</p>", 400);
    }

    try {
      const tokens = await exchangeCode(oauthConfig, code);
      const userInfo = await fetchUserInfo(tokens.accessToken, oauthConfig.clientId);

      // The viewer flow borrows this callback because Twitch allows a single
      // registered redirect URI. It must stop here: no tenant, no bot, no
      // streamer session — only an audience identity.
      const viewerFlow = readViewerFlow(c);
      if (viewerFlow) {
        const viewer = completeViewerLogin(c, db, userInfo);
        clearViewerFlow(c);
        c.header("Set-Cookie", `oauth_state=; HttpOnly; Max-Age=0; Path=/${isSecureRequest(c) ? "; Secure" : ""}`, { append: true });
        logger.info({ viewerId: viewer.id, channel: viewerFlow.channel }, "Viewer logged in via Twitch OAuth");
        return c.redirect(buildSubmitPath(viewerFlow.channel, viewerFlow.token));
      }

      const dbUser = upsertUser(db, {
        twitch_id: userInfo.id,
        twitch_login: userInfo.login,
        twitch_display_name: userInfo.displayName,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt
      });

      const tenant = tenantManager.getOrCreate(dbUser.id);
      const sessionId = generateSessionId();
      createSession(db, sessionId, dbUser.id);
      setSessionCookie(c, sessionId, isSecureRequest(c));

      tenant.twitchBotManager.start({
        channel: userInfo.login,
        botUsername: userInfo.login,
        oauthToken: tokens.accessToken
      }).catch((err) => logger.error({ err, channel: userInfo.login }, "Twitch bot failed to start after login"));

      logger.info({ userId: dbUser.id, channel: userInfo.login }, "User logged in via Twitch OAuth");
      c.header("Set-Cookie", `oauth_state=; HttpOnly; Max-Age=0; Path=/${isSecureRequest(c) ? "; Secure" : ""}`, { append: true });
      return c.redirect("/dashboard");
    } catch (err) {
      logger.error({ err }, "OAuth callback error");
      return c.html("<p>Erreur lors de la connexion Twitch. <a href='/'>Réessaier</a></p>", 500);
    }
  });

  app.post("/auth/logout", (c) => {
    if (!verifySameOrigin(c)) {
      return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    }
    const sessionId = getCookie(c, SESSION_COOKIE);
    const user = requireAuth(c);
    if (sessionId) deleteSession(db, sessionId);
    clearSessionCookie(c, isSecureRequest(c));
    if (user) {
      tenantManager.clearDashboardActivity(user.id);
      void tenantManager.reconcileTenant(user.id);
    }
    return c.redirect("/");
  });

  app.get("/overlay/:channel", (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.text("Overlay token invalide", 403);
    }
    return c.html(getOverlayHtml());
  });

  app.get("/overlay/:channel/events", (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel.toLowerCase());
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.text("Overlay token invalide", 403);
    }
    // Created on connect, not merely fetched: an overlay attaching off-stream
    // must bring the tenant up, so a later submission has somewhere to play.
    const tenant = tenantManager.getOrCreate(dbUser.id);
    if (tenant.overlayBroadcaster.clientCount() >= MAX_OVERLAY_CLIENTS_PER_TENANT) {
      return c.text("Trop de clients overlay", 429);
    }

    return streamSSE(c, async (stream) => {
      const broadcaster = tenant.overlayBroadcaster;
      // La version part avec la connexion: une page restée ouverte dans OBS
      // depuis un déploiement précédent s'en aperçoit et se recharge.
      await stream.writeSSE({
        data: JSON.stringify({ type: "connected", overlayVersion: getOverlayVersion() })
      });
      const remove = broadcaster.addClient(async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      });

      // When the tenant stops, end the response instead of idling on a dead
      // broadcaster: the overlay EventSource then reconnects to the next one.
      let wake: () => void = () => undefined;
      const offClose = broadcaster.onClose(() => wake());
      stream.onAbort(() => {
        remove();
        wake();
      });

      while (!stream.aborted && !broadcaster.isClosed()) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 25_000);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        if (!stream.aborted && !broadcaster.isClosed()) {
          try {
            await stream.writeSSE({ data: "" });
          } catch {
            break;
          }
        }
      }
      offClose();
      remove();
    });
  });

  // Flux du moniteur du streamer: les mêmes évènements que l'overlay, plus un
  // instantané de la file et des approbations. Il ne réveille pas le tenant et
  // ne le garde pas en vie: une fenêtre restée ouverte hors stream ne doit pas
  // tenir un bot IRC connecté. Il s'accroche au tenant dès qu'il existe.
  app.get("/overlay/:channel/monitor", (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.text("Overlay token invalide", 403);
    }
    const userId = dbUser.id;
    // Counted here rather than on the broadcaster: a monitor stays connected
    // while the tenant sleeps, when there is no broadcaster to count on.
    const connected = monitorClients.get(userId) ?? 0;
    if (connected >= MAX_MONITOR_CLIENTS_PER_TENANT) {
      return c.text("Trop de moniteurs", 429);
    }
    monitorClients.set(userId, connected + 1);

    return streamSSE(c, async (stream) => {
      let wake: () => void = () => undefined;
      let attachedTo: OverlayBroadcaster | null = null;
      let detach: () => void = () => undefined;
      let lastSnapshot = "";
      let lastWriteAt = Date.now();
      stream.onAbort(() => wake());

      try {
        // La version voyage aussi ici: la fenêtre moniteur garde sa page comme
        // OBS, et doit se recharger après un déploiement.
        await stream.writeSSE({ data: JSON.stringify({ type: "connected", overlayVersion: getOverlayVersion() }) });
        while (!stream.aborted) {
          const tenant = tenantManager.get(userId);
          const broadcaster = tenant && !tenant.overlayBroadcaster.isClosed() ? tenant.overlayBroadcaster : null;
          if (broadcaster !== attachedTo) {
            detach();
            attachedTo = broadcaster;
            detach = () => undefined;
            if (broadcaster) {
              const remove = broadcaster.addMonitor(async (event) => {
                await stream.writeSSE({ data: JSON.stringify(event) });
                lastWriteAt = Date.now();
                // A start or stop moves the queue: resample now, not next tick
                wake();
              });
              const offClose = broadcaster.onClose(() => wake());
              detach = () => {
                remove();
                offClose();
              };
            }
          }

          const snapshot = JSON.stringify(buildMonitorSnapshot(broadcaster ? tenant : undefined));
          if (snapshot !== lastSnapshot) {
            await stream.writeSSE({ data: snapshot });
            lastSnapshot = snapshot;
            lastWriteAt = Date.now();
          } else if (Date.now() - lastWriteAt >= MONITOR_HEARTBEAT_MS) {
            await stream.writeSSE({ data: "" });
            lastWriteAt = Date.now();
          }

          // A hang-up during a write fired the abort before this sleep could
          // hear it: check now rather than holding the slot for a whole tick.
          if (stream.aborted) break;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, MONITOR_POLL_MS);
            wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
        }
      } catch {
        // client gone mid-write
      } finally {
        detach();
        const remaining = (monitorClients.get(userId) ?? 1) - 1;
        if (remaining > 0) monitorClients.set(userId, remaining);
        else monitorClients.delete(userId);
      }
    });
  });

  // L'overlay signale que le média a quitté l'écran (fin, échec, coupe): la
  // file passe au suivant au lieu d'attendre la durée prévue devant un écran
  // vide. Même token que le flux, et un identifiant périmé est sans effet.
  app.post("/overlay/:channel/ended", async (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.text("Overlay token invalide", 403);
    }
    const parsed = await parseJsonBody(c, overlayEndedSchema);
    if (!parsed.success) return parsed.response;
    const finished = tenantManager.get(dbUser.id)?.queue.finishCurrent(parsed.data.playbackId) ?? false;
    if (finished) logger.info({ userId: dbUser.id, playbackId: parsed.data.playbackId }, "Overlay reported playback end");
    return c.json({ ok: true, finished });
  });

  // Arrêt d'urgence depuis un bouton Stream Deck. GET accepté exprès: l'action
  // « Site web » du Stream Deck sait faire une requête GET en arrière-plan sans
  // plugin à installer. Même effet que !gstop: lecture coupée, file vidée, TTS
  // coupé, sur OBS comme sur le moniteur. Protégé par le token overlay, et sans
  // réveiller un tenant endormi, qui n'a rien à arrêter.
  const emergencyStop = async (c: Context) => {
    const channel = (c.req.param("channel") ?? "").toLowerCase();
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.text("Overlay token invalide", 403);
    }
    const tenant = tenantManager.get(dbUser.id);
    if (!tenant) return c.text("Rien à arrêter");
    await executeEmergencyStop({ queue: tenant.queue, logger }, "streamdeck_plugin");
    return c.text("Source arrêtée");
  };
  app.get("/overlay/:channel/stop", emergencyStop);
  app.post("/overlay/:channel/stop", emergencyStop);

  app.get("/tts/audio/:channel/:id", (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const id = c.req.param("id");
    const token = c.req.query("token");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.body(null, 404);
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.overlay_token) {
      return c.body(null, 403);
    }
    const tenant = tenantManager.get(dbUser.id);
    if (!tenant) return c.body(null, 404);
    const audio = tenant.ttsService.getAudio(id);
    if (!audio) return c.body(null, 404);
    return c.body(new Uint8Array(audio.buffer), 200, {
      "Content-Type": audio.mimeType,
      "Cache-Control": "no-store"
    });
  });
}
