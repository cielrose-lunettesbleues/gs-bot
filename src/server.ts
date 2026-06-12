import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Logger } from "pino";
import { createLogger } from "./logger/logger";
import {
  openDatabase,
  purgeExpiredSessions,
  createSession,
  deleteSession,
  getUserByLogin,
  getTtsVoices,
  insertTtsVoice,
  updateTtsVoiceSettings,
  deleteTtsVoice
} from "./db/database";
import {
  buildAuthUrl,
  exchangeCode,
  fetchUserInfo,
  generateSessionId,
  upsertUser
} from "./auth/oauthHandler";
import {
  clearSessionCookie,
  getCookie,
  requireAuth,
  SESSION_COOKIE,
  sessionMiddleware,
  setSessionCookie
} from "./auth/sessionMiddleware";
import { TenantManager } from "./tenant/tenantManager";
import { getOverlayHtml } from "./overlay/overlayHtml";
import { getLoginHtml } from "./views/loginHtml";
import { getDashboardHtml } from "./views/dashboardHtml";
import { getSetupHtml } from "./views/setupHtml";
import { loadServerConfig, saveServerOAuthConfig } from "./config/serverConfig";
import type { ServerConfig } from "./config/serverConfig";

// ─── App bootstrap ────────────────────────────────────────────────────────────

export async function createApp(config: ServerConfig, logger: Logger) {
  const db = openDatabase(config.dataDir);
  const oauthConfig = {
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    redirectUri: config.twitch.redirectUri
  };
  const tenantManager = new TenantManager(db, logger, config.youtubeApiKey || undefined, config.klipyApiKey || undefined, config.sociavaultApiKey || undefined);

  // Purge expired sessions every hour
  setInterval(() => purgeExpiredSessions(db), 3_600_000);

  const app = new Hono();
  app.use("*", sessionMiddleware(db, oauthConfig));

  // ─── First-run setup (no auth required) ──────────────────────────────────────

  app.get("/setup", (c) => {
    if (oauthConfig.clientId && oauthConfig.clientSecret) return c.redirect("/");
    return c.html(getSetupHtml());
  });

  app.post("/setup", async (c) => {
    if (oauthConfig.clientId && oauthConfig.clientSecret) {
      return c.json({ ok: false, error: "already_configured" }, 400);
    }
    const body = await c.req.json<{ clientId?: string; clientSecret?: string; redirectUri?: string }>();
    const clientId = (body.clientId ?? "").trim();
    const clientSecret = (body.clientSecret ?? "").trim();
    const redirectUri = (body.redirectUri ?? "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      return c.json({ ok: false, error: "missing_fields" }, 400);
    }

    saveServerOAuthConfig(config.dataDir, clientId, clientSecret, redirectUri);

    // Update in-memory config — no restart needed
    oauthConfig.clientId = clientId;
    oauthConfig.clientSecret = clientSecret;
    oauthConfig.redirectUri = redirectUri;

    logger.info({}, "OAuth configuration saved via setup wizard");
    return c.json({ ok: true });
  });

  // ─── Public pages ────────────────────────────────────────────────────────────

  app.get("/", (c) => {
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) return c.redirect("/setup");
    const user = requireAuth(c);
    if (!user) return c.html(getLoginHtml(oauthConfig.clientId));
    return c.redirect("/dashboard");
  });

  app.get("/dashboard", (c) => {
    const user = requireAuth(c);
    if (!user) return c.redirect("/");
    return c.html(getDashboardHtml(user.twitchLogin));
  });

  // ─── Twitch OAuth ─────────────────────────────────────────────────────────

  app.get("/auth/twitch", (c) => {
    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      return c.redirect("/");
    }
    const state = crypto.randomUUID();
    // Store state in a short-lived cookie for CSRF protection
    c.header("Set-Cookie", `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=300`);
    return c.redirect(buildAuthUrl(oauthConfig, state));
  });

  app.get("/auth/twitch/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.html(`<p>Twitch a refusé l'autorisation : ${error}. <a href="/">Retour</a></p>`, 400);
    }
    if (!code) {
      return c.html("<p>Code manquant dans le callback OAuth.</p>", 400);
    }

    // CSRF check
    const cookieState = getCookie(c, "oauth_state");
    if (state && cookieState && state !== cookieState) {
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

      // Create tenant services and session before starting the bot so the user
      // always reaches the dashboard even if the IRC connection is slow/fails.
      const tenant = tenantManager.getOrCreate(dbUser.id);
      const sessionId = generateSessionId();
      createSession(db, sessionId, dbUser.id);
      setSessionCookie(c, sessionId);

      // Start the Twitch bot in the background — don't block the redirect.
      tenant.twitchBotManager.start({
        channel: userInfo.login,
        botUsername: userInfo.login,
        oauthToken: tokens.accessToken
      }).catch((err) =>
        logger.error({ err, channel: userInfo.login }, "Twitch bot failed to start after login")
      );

      logger.info({ userId: dbUser.id, channel: userInfo.login }, "User logged in via Twitch OAuth");
      // Clear the state cookie
      c.header("Set-Cookie", "oauth_state=; HttpOnly; Max-Age=0; Path=/", { append: true });
      return c.redirect("/dashboard");
    } catch (err) {
      logger.error({ err }, "OAuth callback error");
      return c.html("<p>Erreur lors de la connexion Twitch. <a href='/'>Réessaier</a></p>", 500);
    }
  });

  app.post("/auth/logout", (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) deleteSession(db, sessionId);
    clearSessionCookie(c);
    return c.redirect("/");
  });

  // ─── Overlay (no auth — OBS Browser Source) ───────────────────────────────

  app.get("/overlay/:channel", (c) => {
    return c.html(getOverlayHtml());
  });

  app.get("/overlay/:channel/events", (c) => {
    const channel = c.req.param("channel");
    const dbUser = getUserByLogin(db, channel.toLowerCase());
    if (!dbUser) return c.text("Canal introuvable", 404);
    const tenant = tenantManager.getOrCreate(dbUser.id);

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) });

      const remove = tenant.overlayBroadcaster.addClient(async (event) => {
        await stream.writeSSE({ data: JSON.stringify(event) });
      });

      stream.onAbort(remove);

      // Keepalive ping every 25s to prevent proxy timeouts
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

  // ─── TTS audio (no auth — OBS Browser Source fetches these) ─────────────

  app.get("/tts/audio/:channel/:id", (c) => {
    const channel = c.req.param("channel").toLowerCase();
    const id = c.req.param("id");
    const dbUser = getUserByLogin(db, channel);
    if (!dbUser) return c.body(null, 404);
    const tenant = tenantManager.get(dbUser.id);
    if (!tenant) return c.body(null, 404);
    const audio = tenant.ttsService.getAudio(id);
    if (!audio) return c.body(null, 404);
    return c.body(new Uint8Array(audio.buffer), 200, {
      "Content-Type": audio.mimeType,
      "Cache-Control": "no-store"
    });
  });

  // ─── API — all require session auth ──────────────────────────────────────

  const api = new Hono();

  api.use("*", async (c, next) => {
    if (!requireAuth(c)) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    await next();
  });

  api.get("/status", (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const cfg = tenant.runtimeConfig;
    const pending = tenant.approvalService.listPending();
    const twitch = tenant.twitchBotManager.status();
    return c.json({
      config: {
        access: cfg.access,
        cooldown: { enabled: cfg.cooldown.enabled, seconds: cfg.cooldown.seconds },
        approval: { enabled: cfg.approval.enabled },
        playback: { durationSeconds: cfg.playback.durationSeconds, chatFeedback: cfg.playback.chatFeedback },
        tts: {
          enabled: cfg.tts.enabled,
          provider: cfg.tts.provider,
          apiKeySet: cfg.tts.apiKey.length > 0,
          volume: cfg.tts.volume,
          maxLength: cfg.tts.maxLength
        }
      },
      queue: tenant.queue.getState(),
      approval: { pendingCount: pending.length, pending },
      overlay: {
        clients: tenant.overlayBroadcaster.clientCount(),
        url: `/overlay/${user.twitchLogin}`
      },
      twitch: { connected: twitch.connected, channel: twitch.channel }
    });
  });

  api.get("/history", (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const rawN = c.req.query("n");
    const n = Math.min(Math.max(parseInt(rawN ?? "30", 10) || 30, 1), 100);
    return c.json({ entries: tenant.historyService.getLast(n) });
  });

  api.patch("/config", async (c) => {
    const user = requireAuth(c)!;
    const body = await c.req.json<Record<string, unknown>>();
    const patch: Record<string, unknown> = {};
    if (typeof body.subOnly === "boolean") patch.sub_only = body.subOnly ? 1 : 0;
    if (typeof body.modOnly === "boolean") patch.mod_only = body.modOnly ? 1 : 0;
    if (typeof body.cooldownEnabled === "boolean") patch.cooldown_enabled = body.cooldownEnabled ? 1 : 0;
    if (typeof body.cooldownSeconds === "number" && body.cooldownSeconds >= 0) {
      patch.cooldown_seconds = Math.floor(body.cooldownSeconds);
    }
    if (typeof body.approvalEnabled === "boolean") patch.approval_enabled = body.approvalEnabled ? 1 : 0;
    if (typeof body.durationSeconds === "number" && body.durationSeconds >= 1) {
      patch.duration_seconds = Math.floor(body.durationSeconds);
    }
    if (typeof body.chatFeedback === "boolean") patch.chat_feedback = body.chatFeedback ? 1 : 0;
    tenantManager.persistConfig(user.id, patch);
    logger.info({ userId: user.id, patch }, "Config updated");
    return c.json({ ok: true });
  });

  api.post("/queue/stop", async (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    await tenant.queue.stop();
    logger.info({ userId: user.id }, "Emergency stop triggered from dashboard");
    return c.json({ ok: true });
  });

  api.post("/cooldown/reset", (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    tenant.cooldownService.reset();
    return c.json({ ok: true });
  });

  api.post("/approve/:username", async (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const username = decodeURIComponent(c.req.param("username"));
    const ok = await tenant.approvalService.approve(username, async () => undefined);
    return c.json({ ok }, ok ? 200 : 404);
  });

  api.post("/deny/:username", async (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const username = decodeURIComponent(c.req.param("username"));
    const ok = await tenant.approvalService.deny(username, async () => undefined);
    return c.json({ ok }, ok ? 200 : 404);
  });

  api.post("/simulate", async (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const body = await c.req.json<Record<string, unknown>>();
    const username = String(body.username ?? "testuser").replace(/\s/g, "").slice(0, 25) || "testuser";
    const message = String(body.message ?? "").trim();
    const isMod = body.isMod === true;
    const isSubscriber = body.isSubscriber === true;
    if (!message) return c.json({ ok: false, error: "message_required" }, 400);

    const replies: string[] = [];
    await tenant.router.route({
      user: { username, isMod, isBroadcaster: false, isSubscriber },
      channel: user.twitchLogin,
      rawMessage: message,
      reply: async (text) => { replies.push(text); }
    });
    return c.json({ ok: true, replies });
  });

  // ─── TTS config API ────────────────────────────────────────────────────────

  api.patch("/tts/config", async (c) => {
    const user = requireAuth(c)!;
    const body = await c.req.json<Record<string, unknown>>();
    const patch: Record<string, unknown> = {};
    if (typeof body.ttsEnabled === "boolean") patch.tts_enabled = body.ttsEnabled ? 1 : 0;
    if (typeof body.ttsApiKey === "string") patch.tts_api_key = body.ttsApiKey.trim();
    if (typeof body.ttsVolume === "number" && body.ttsVolume >= 0 && body.ttsVolume <= 2) {
      patch.tts_volume = body.ttsVolume;
    }
    if (typeof body.ttsMaxLength === "number" && body.ttsMaxLength >= 1) {
      patch.tts_max_length = Math.floor(body.ttsMaxLength);
    }
    if (typeof body.ttsCooldownSeconds === "number" && body.ttsCooldownSeconds >= 0) {
      patch.tts_cooldown_seconds = Math.floor(body.ttsCooldownSeconds);
    }
    tenantManager.persistConfig(user.id, patch);
    logger.info({ userId: user.id }, "TTS config updated");
    return c.json({ ok: true });
  });

  // ─── TTS voices API ────────────────────────────────────────────────────────

  api.get("/tts/voices", (c) => {
    const user = requireAuth(c)!;
    const voices = getTtsVoices(db, user.id).map((v) => ({
      id: v.id,
      label: v.label,
      provider: v.provider,
      voiceId: v.voice_id,
      isDefault: Boolean(v.is_default),
      aliases: JSON.parse(v.aliases_json) as string[],
      stability: v.stability ?? 0.5,
      similarityBoost: v.similarity_boost ?? 0.75,
      style: v.style ?? 0.0,
      useSpeakerBoost: Boolean(v.use_speaker_boost ?? 1),
      speed: v.speed ?? 1.0
    }));
    return c.json({ voices });
  });

  api.post("/tts/voices", async (c) => {
    const user = requireAuth(c)!;
    const body = await c.req.json<Record<string, unknown>>();
    const label = String(body.label ?? "").trim();
    const voiceId = String(body.voiceId ?? "").trim();
    const provider = String(body.provider ?? "elevenlabs").trim();
    const isDefault = body.isDefault === true;
    const aliases = Array.isArray(body.aliases)
      ? (body.aliases as unknown[]).filter((a) => typeof a === "string").map((a) => String(a).trim())
      : [];
    const clamp = (v: unknown, min: number, max: number, def: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
    const stability = clamp(body.stability, 0, 1, 0.5);
    const similarityBoost = clamp(body.similarityBoost, 0, 1, 0.75);
    const style = clamp(body.style, 0, 1, 0.0);
    const useSpeakerBoost = body.useSpeakerBoost !== false;
    const speed = clamp(body.speed, 0.5, 2.0, 1.0);
    if (!label || !voiceId) return c.json({ ok: false, error: "label and voiceId required" }, 400);
    const voice = insertTtsVoice(db, user.id, {
      label, provider, voice_id: voiceId, is_default: isDefault, aliases,
      stability, similarity_boost: similarityBoost, style, use_speaker_boost: useSpeakerBoost, speed
    });
    logger.info({ userId: user.id, voiceId: voice.id }, "TTS voice added");
    return c.json({ ok: true, voice: { id: voice.id, label: voice.label } }, 201);
  });

  api.patch("/tts/voices/:id", async (c) => {
    const user = requireAuth(c)!;
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ ok: false, error: "invalid_id" }, 400);
    const body = await c.req.json<Record<string, unknown>>();
    const clamp = (v: unknown, min: number, max: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
    const settings = {
      stability: clamp(body.stability, 0, 1),
      similarity_boost: clamp(body.similarityBoost, 0, 1),
      style: clamp(body.style, 0, 1),
      use_speaker_boost: typeof body.useSpeakerBoost === "boolean" ? body.useSpeakerBoost : undefined,
      speed: clamp(body.speed, 0.5, 2.0)
    };
    const ok = updateTtsVoiceSettings(db, id, user.id, settings);
    if (!ok) return c.json({ ok: false, error: "not_found" }, 404);
    logger.info({ userId: user.id, voiceId: id }, "TTS voice settings updated");
    return c.json({ ok: true });
  });

  api.delete("/tts/voices/:id", (c) => {
    const user = requireAuth(c)!;
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ ok: false, error: "invalid_id" }, 400);
    const ok = deleteTtsVoice(db, id, user.id);
    return c.json({ ok }, ok ? 200 : 404);
  });

  app.route("/api", api);

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
