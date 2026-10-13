import type { Context, Hono } from "hono";
import type { Logger } from "pino";
import type { OAuthConfig } from "../../auth/oauthHandler";
import type { ServerConfig } from "../../config/serverConfig";
import {
  addFavorite,
  countFavorites,
  deleteFavorite,
  deleteViewerSession,
  getTenantConfig,
  getUserByLogin,
  listFavorites,
  type Database,
  type DbTenantConfig,
  type DbUser
} from "../../db/database";
import { getCookie } from "../../auth/sessionMiddleware";
import { buildMediaPreview } from "../../media/mediaPreview";
import { sociavaultResolve, sociavaultResolveInstagram } from "../../media/sociavaultClient";
import { getClientIp, verifySameOrigin, isSecureRequest } from "../../security/httpSecurity";
import { RateLimiter } from "../../security/rateLimiter";
import { dbConfigToRuntime } from "../../tenant/runtimeConfig";
import { TenantManager } from "../../tenant/tenantManager";
import { UrlValidator } from "../../validation/urlValidator";
import { getSubmitHtml } from "../../views/submitHtml";
import { resolveSubmitterIdentity } from "../../viewer/viewerIdentity";
import { beginViewerLogin } from "../../viewer/viewerLogin";
import { clearViewerCookie, getViewerFromRequest, VIEWER_COOKIE } from "../../viewer/viewerSession";
import { favoriteCreateSchema, parseJsonBody, viewerPreviewSchema, viewerSubmitSchema } from "../requestValidation";

const MAX_FAVORITES_PER_VIEWER = 100;
const SEND_LIMIT = { hits: 5, windowMs: 60_000 };
const PREVIEW_LIMIT = { hits: 20, windowMs: 60_000 };
const LIMITER_PRUNE_THRESHOLD = 1000;

interface ViewerRoutesDeps {
  app: Hono;
  db: Database;
  oauthConfig: OAuthConfig;
  config: ServerConfig;
  logger: Logger;
  tenantManager: TenantManager;
}

interface ChannelContext {
  dbUser: DbUser;
  tenantConfig: DbTenantConfig;
}

export function registerViewerRoutes({ app, db, oauthConfig, config, logger, tenantManager }: ViewerRoutesDeps): void {
  const sendLimiter = new RateLimiter(SEND_LIMIT.hits, SEND_LIMIT.windowMs);
  const previewLimiter = new RateLimiter(PREVIEW_LIMIT.hits, PREVIEW_LIMIT.windowMs);
  const urlValidator = new UrlValidator();

  // Resolves and authorises the channel behind a submit link. The token is
  // separate from the overlay token so the streamer can revoke the public page
  // without breaking their OBS source.
  function resolveChannel(c: Context): ChannelContext | { error: string; status: 403 | 404 } {
    const channel = (c.req.param("channel") ?? "").toLowerCase();
    const token = c.req.query("token");
    const dbUser = channel ? getUserByLogin(db, channel) : undefined;
    if (!dbUser) return { error: "channel_not_found", status: 404 };

    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || !tenantConfig.web_token || token !== tenantConfig.web_token) {
      return { error: "invalid_token", status: 403 };
    }
    if (!tenantConfig.web_submit_enabled) {
      return { error: "submit_disabled", status: 403 };
    }
    return { dbUser, tenantConfig };
  }

  function isError(value: ChannelContext | { error: string; status: number }): value is { error: string; status: 403 | 404 } {
    return "error" in value;
  }

  function limited(c: Context, limiter: RateLimiter): number {
    if (limiter.size() > LIMITER_PRUNE_THRESHOLD) limiter.prune();
    const decision = limiter.check(getClientIp(c));
    return decision.allowed ? 0 : decision.retryAfterSeconds;
  }

  function mediaResolvers() {
    const apiKey = config.sociavaultApiKey;
    if (!apiKey) return {};
    return {
      instagramResolve: (url: string) => sociavaultResolveInstagram(url, apiKey, logger),
      tiktokResolve: (url: string) => sociavaultResolve(url, apiKey, logger)
    };
  }

  // ─── Page ───────────────────────────────────────────────────────────────────

  app.get("/submit/:channel", (c) => {
    const resolved = resolveChannel(c);
    if (isError(resolved)) {
      const messages: Record<string, string> = {
        channel_not_found: "Canal introuvable",
        invalid_token: "Lien invalide ou expiré",
        submit_disabled: "Cette page est désactivée par le streamer"
      };
      return c.text(messages[resolved.error] ?? resolved.error, resolved.status);
    }

    const { dbUser, tenantConfig } = resolved;
    const viewer = getViewerFromRequest(c, db);
    const runtime = dbConfigToRuntime(tenantConfig);

    return c.html(getSubmitHtml({
      channel: dbUser.twitch_login,
      token: tenantConfig.web_token,
      viewer: viewer ? { login: viewer.twitch_login, displayName: viewer.twitch_display_name } : null,
      guestEnabled: Boolean(tenantConfig.web_guest_enabled),
      subOnly: runtime.access.subOnly,
      modOnly: runtime.access.modOnly,
      approvalEnabled: runtime.approval.enabled,
      defaultDurationSeconds: runtime.playback.durationSeconds,
      maxDurationSeconds: runtime.validation.maxDurationSeconds,
      allowedDomains: runtime.validation.allowedDomains,
      favorites: viewer ? listFavorites(db, viewer.id).map((f) => ({ id: f.id, url: f.url, label: f.label })) : []
    }));
  });

  app.get("/submit/:channel/state", (c) => {
    const resolved = resolveChannel(c);
    if (isError(resolved)) return c.json({ ok: false, error: resolved.error }, resolved.status);

    const { tenantConfig } = resolved;
    const viewer = getViewerFromRequest(c, db);
    const runtime = dbConfigToRuntime(tenantConfig);

    return c.json({
      ok: true,
      viewer: viewer ? { login: viewer.twitch_login, displayName: viewer.twitch_display_name } : null,
      guestEnabled: Boolean(tenantConfig.web_guest_enabled),
      subOnly: runtime.access.subOnly,
      modOnly: runtime.access.modOnly,
      approvalEnabled: runtime.approval.enabled,
      favorites: viewer ? listFavorites(db, viewer.id).map((f) => ({ id: f.id, url: f.url, label: f.label })) : []
    });
  });

  // ─── Preview ────────────────────────────────────────────────────────────────

  app.post("/submit/:channel/preview", async (c) => {
    if (!verifySameOrigin(c)) return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    const resolved = resolveChannel(c);
    if (isError(resolved)) return c.json({ ok: false, error: resolved.error }, resolved.status);

    const retryAfter = limited(c, previewLimiter);
    if (retryAfter) return c.json({ ok: false, error: "rate_limited", retryAfterSeconds: retryAfter }, 429);

    const parsed = await parseJsonBody(c, viewerPreviewSchema);
    if (!parsed.success) return parsed.response;

    const runtime = dbConfigToRuntime(resolved.tenantConfig);
    // Validated before any fetch: the preview must never become a way to make
    // the server request arbitrary hosts.
    const decision = urlValidator.validate(parsed.data.url, runtime.validation);
    if (!decision.valid) return c.json({ ok: false, error: "url_not_allowed", reason: decision.reason }, 400);

    const preview = await buildMediaPreview(parsed.data.url, mediaResolvers());
    return c.json({ ok: true, preview });
  });

  // ─── Submit ─────────────────────────────────────────────────────────────────

  app.post("/submit/:channel/send", async (c) => {
    if (!verifySameOrigin(c)) return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    const resolved = resolveChannel(c);
    if (isError(resolved)) return c.json({ ok: false, error: resolved.error }, resolved.status);

    const retryAfter = limited(c, sendLimiter);
    if (retryAfter) return c.json({ ok: false, error: "rate_limited", retryAfterSeconds: retryAfter }, 429);

    const parsed = await parseJsonBody(c, viewerSubmitSchema);
    if (!parsed.success) return parsed.response;
    if (/\s/.test(parsed.data.url)) return c.json({ ok: false, error: "invalid_url" }, 400);

    const { dbUser, tenantConfig } = resolved;
    const viewer = getViewerFromRequest(c, db);

    if (!viewer && !tenantConfig.web_guest_enabled) {
      return c.json({ ok: false, error: "guest_disabled" }, 403);
    }
    // Sub-only and mod-only are verified against Twitch, which needs an
    // identity: a guest has none, so the chat is the only way in.
    if (!viewer && (tenantConfig.sub_only || tenantConfig.mod_only)) {
      return c.json({ ok: false, error: "login_required" }, 403);
    }

    const identity = await resolveSubmitterIdentity({ db, oauthConfig, broadcaster: dbUser, viewer });

    const tenant = tenantManager.getOrCreate(dbUser.id);
    // A pipe in the caption would forge extra command arguments, so it is
    // flattened away along with any whitespace it leaves behind.
    const caption = parsed.data.caption?.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    const duration = parsed.data.durationSeconds;
    const message = [
      tenant.runtimeConfig.commands.gs,
      parsed.data.url,
      duration ? `/${duration}` : "",
      caption ? `|${caption}` : ""
    ].filter(Boolean).join(" ");

    // Routed through the same command pipeline as the chat, so blacklist,
    // permissions, cooldown, approval and URL validation all still apply.
    const replies: string[] = [];
    await tenant.router.route({
      user: {
        username: identity.username,
        isMod: identity.isMod,
        isBroadcaster: identity.isBroadcaster,
        isSubscriber: identity.isSubscriber
      },
      channel: dbUser.twitch_login,
      rawMessage: message,
      reply: async (text) => {
        replies.push(text);
      }
    });

    logger.info(
      { channel: dbUser.twitch_login, submitter: identity.username, guest: identity.guest, url: parsed.data.url },
      "Submission received from the viewer page"
    );
    return c.json({ ok: true, replies, submittedAs: identity.username, guest: identity.guest });
  });

  // ─── Viewer session ─────────────────────────────────────────────────────────

  app.get("/viewer/auth/twitch", (c) => {
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) return c.text("OAuth non configuré", 503);

    const channel = (c.req.query("channel") ?? "").toLowerCase();
    const token = c.req.query("token") ?? "";
    const dbUser = channel ? getUserByLogin(db, channel) : undefined;
    if (!dbUser) return c.text("Canal introuvable", 404);

    // The link is checked here too, so this route cannot be abused as a way to
    // bounce people through Twitch towards an arbitrary channel page.
    const tenantConfig = getTenantConfig(db, dbUser.id);
    if (!token || token !== tenantConfig.web_token) return c.text("Lien invalide", 403);

    return c.redirect(beginViewerLogin(c, oauthConfig, { channel: dbUser.twitch_login, token }));
  });

  app.post("/viewer/logout", (c) => {
    if (!verifySameOrigin(c)) return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    const sessionId = getCookie(c, VIEWER_COOKIE);
    if (sessionId) deleteViewerSession(db, sessionId);
    clearViewerCookie(c, isSecureRequest(c));
    return c.json({ ok: true });
  });

  // ─── Favorites ──────────────────────────────────────────────────────────────

  app.get("/viewer/favorites", (c) => {
    const viewer = getViewerFromRequest(c, db);
    if (!viewer) return c.json({ ok: false, error: "login_required" }, 401);
    return c.json({ ok: true, favorites: listFavorites(db, viewer.id).map((f) => ({ id: f.id, url: f.url, label: f.label })) });
  });

  app.post("/viewer/favorites", async (c) => {
    if (!verifySameOrigin(c)) return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    const viewer = getViewerFromRequest(c, db);
    if (!viewer) return c.json({ ok: false, error: "login_required" }, 401);

    const parsed = await parseJsonBody(c, favoriteCreateSchema);
    if (!parsed.success) return parsed.response;

    if (countFavorites(db, viewer.id) >= MAX_FAVORITES_PER_VIEWER) {
      return c.json({ ok: false, error: "too_many_favorites" }, 409);
    }

    const favorite = addFavorite(db, viewer.id, {
      url: parsed.data.url,
      label: parsed.data.label ?? ""
    });
    if (!favorite) return c.json({ ok: false, error: "already_favorite" }, 409);

    return c.json({ ok: true, favorite: { id: favorite.id, url: favorite.url, label: favorite.label } }, 201);
  });

  app.delete("/viewer/favorites/:id", (c) => {
    if (!verifySameOrigin(c)) return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    const viewer = getViewerFromRequest(c, db);
    if (!viewer) return c.json({ ok: false, error: "login_required" }, 401);

    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ ok: false, error: "invalid_id" }, 400);

    const ok = deleteFavorite(db, viewer.id, id);
    return c.json({ ok }, ok ? 200 : 404);
  });
}
