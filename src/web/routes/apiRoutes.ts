import { Hono } from "hono";
import type { Logger } from "pino";
import {
  deleteTtsVoice,
  getTtsVoices,
  insertTtsVoice,
  updateTtsVoiceSettings,
  type Database
} from "../../db/database";
import { requireAuth } from "../../auth/sessionMiddleware";
import { buildDashboardConfigPatch, buildTtsConfigPatch } from "../../tenant/configPatches";
import { TenantManager } from "../../tenant/tenantManager";
import {
  buildHistoryResponse,
  buildOverlayRotateTokenResponse,
  buildStatusResponse,
  buildTtsVoicesResponse
} from "../apiContracts";
import {
  configPatchSchema,
  parseJsonBody,
  simulateSchema,
  ttsConfigSchema,
  ttsVoiceCreateSchema,
  ttsVoiceUpdateSchema
} from "../requestValidation";
import { buildOverlayPath } from "../publicTokens";
import { verifySameOrigin } from "../../security/httpSecurity";

interface ApiRoutesDeps {
  db: Database;
  logger: Logger;
  tenantManager: TenantManager;
}

export function createApiRouter({ db, logger, tenantManager }: ApiRoutesDeps): Hono {
  const api = new Hono();

  api.use("*", async (c, next) => {
    const user = requireAuth(c);
    if (!user) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method) && !verifySameOrigin(c)) {
      return c.json({ ok: false, error: "csrf_check_failed" }, 403);
    }
    tenantManager.markDashboardActive(user.id);
    await next();
  });

  api.get("/status", (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const runtime = tenantManager.getRuntimeState(user.id);
    return c.json(
      buildStatusResponse(
        tenant,
        buildOverlayPath(user.twitchLogin, tenant.runtimeConfig.publicAccess.overlayToken),
        runtime
      )
    );
  });

  api.get("/history", (c) => {
    const user = requireAuth(c)!;
    const tenant = tenantManager.getOrCreate(user.id);
    const rawN = c.req.query("n");
    const n = Math.min(Math.max(parseInt(rawN ?? "30", 10) || 30, 1), 100);
    return c.json(buildHistoryResponse(tenant.historyService.getLast(n)));
  });

  api.post("/overlay/rotate-token", (c) => {
    const user = requireAuth(c)!;
    const token = tenantManager.rotateOverlayToken(user.id);
    logger.info({ userId: user.id }, "Overlay token rotated");
    return c.json(buildOverlayRotateTokenResponse(buildOverlayPath(user.twitchLogin, token)));
  });

  api.patch("/config", async (c) => {
    const user = requireAuth(c)!;
    const parsed = await parseJsonBody(c, configPatchSchema);
    if (!parsed.success) return parsed.response;
    const patch = buildDashboardConfigPatch(parsed.data);
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
    const parsed = await parseJsonBody(c, simulateSchema);
    if (!parsed.success) return parsed.response;
    const username = (parsed.data.username ?? "testuser").replace(/\s/g, "").slice(0, 25) || "testuser";
    const message = parsed.data.message;
    const isMod = parsed.data.isMod === true;
    const isSubscriber = parsed.data.isSubscriber === true;

    const replies: string[] = [];
    await tenant.router.route({
      user: { username, isMod, isBroadcaster: false, isSubscriber },
      channel: user.twitchLogin,
      rawMessage: message,
      reply: async (text) => { replies.push(text); }
    });
    return c.json({ ok: true, replies });
  });

  api.patch("/tts/config", async (c) => {
    const user = requireAuth(c)!;
    const parsed = await parseJsonBody(c, ttsConfigSchema);
    if (!parsed.success) return parsed.response;
    const patch = buildTtsConfigPatch(parsed.data);
    tenantManager.persistConfig(user.id, patch);
    logger.info({ userId: user.id }, "TTS config updated");
    return c.json({ ok: true });
  });

  api.get("/tts/voices", (c) => {
    const user = requireAuth(c)!;
    return c.json(buildTtsVoicesResponse(getTtsVoices(db, user.id)));
  });

  api.post("/tts/voices", async (c) => {
    const user = requireAuth(c)!;
    const parsed = await parseJsonBody(c, ttsVoiceCreateSchema);
    if (!parsed.success) return parsed.response;
    const body = parsed.data;
    const voice = insertTtsVoice(db, user.id, {
      label: body.label,
      provider: body.provider ?? "elevenlabs",
      voice_id: body.voiceId,
      is_default: body.isDefault ?? false,
      aliases: body.aliases ?? [],
      stability: body.stability ?? 0.5,
      similarity_boost: body.similarityBoost ?? 0.75,
      style: body.style ?? 0.0,
      use_speaker_boost: body.useSpeakerBoost ?? true,
      speed: body.speed ?? 1.0
    });
    logger.info({ userId: user.id, voiceId: voice.id }, "TTS voice added");
    return c.json({ ok: true, voice: { id: voice.id, label: voice.label } }, 201);
  });

  api.patch("/tts/voices/:id", async (c) => {
    const user = requireAuth(c)!;
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) return c.json({ ok: false, error: "invalid_id" }, 400);
    const parsed = await parseJsonBody(c, ttsVoiceUpdateSchema);
    if (!parsed.success) return parsed.response;
    const body = parsed.data;
    const settings = {
      stability: body.stability,
      similarity_boost: body.similarityBoost,
      style: body.style,
      use_speaker_boost: body.useSpeakerBoost,
      speed: body.speed
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

  return api;
}
