import type { Hono } from "hono";
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
import { getOverlayHtml } from "../../overlay/overlayHtml";
import { TenantManager } from "../../tenant/tenantManager";
import { getDashboardHtml } from "../../views/dashboardHtml";
import { getLoginHtml } from "../../views/loginHtml";
import { getSetupHtml } from "../../views/setupHtml";
import { setupSchema, parseJsonBody } from "../requestValidation";
import { buildOverlayPath, isValidSetupRequest } from "../publicTokens";
import { escapeHtml, isSecureRequest, verifySameOrigin } from "../../security/httpSecurity";

const MAX_OVERLAY_CLIENTS_PER_TENANT = 3;

interface PublicRoutesDeps {
  app: Hono;
  db: Database;
  oauthConfig: OAuthConfig;
  config: ServerConfig;
  logger: Logger;
  tenantManager: TenantManager;
}

export function registerPublicRoutes({ app, db, oauthConfig, config, logger, tenantManager }: PublicRoutesDeps): void {
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
    const tenant = tenantManager.get(dbUser.id);
    if (!tenant) return c.text("Overlay inactif", 404);
    if (tenant.overlayBroadcaster.clientCount() >= MAX_OVERLAY_CLIENTS_PER_TENANT) {
      return c.text("Trop de clients overlay", 429);
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });
      const remove = tenant.overlayBroadcaster.addClient(async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(remove);

      while (!stream.aborted) {
        await new Promise<void>((r) => setTimeout(r, 25_000));
        if (!stream.aborted) {
          try {
            await stream.writeSSE({ data: "" });
          } catch {
            break;
          }
        }
      }
      remove();
    });
  });

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
