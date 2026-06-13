import type { DbTenantConfig } from "../db/database";
import type { ConfigPatchBody, TtsConfigBody } from "../web/requestValidation";

export type TenantConfigPatch = Partial<Pick<DbTenantConfig,
  | "sub_only"
  | "mod_only"
  | "cooldown_enabled"
  | "cooldown_seconds"
  | "approval_enabled"
  | "duration_seconds"
  | "chat_feedback"
  | "tts_enabled"
  | "tts_api_key"
  | "tts_volume"
  | "tts_max_length"
  | "tts_cooldown_seconds"
>>;

export type TenantAdminConfigPatch = Partial<Pick<DbTenantConfig,
  | "sub_only"
  | "mod_only"
  | "cooldown_enabled"
  | "cooldown_seconds"
>>;

export function buildDashboardConfigPatch(body: ConfigPatchBody): TenantConfigPatch {
  const patch: TenantConfigPatch = {};
  if (typeof body.subOnly === "boolean") patch.sub_only = body.subOnly ? 1 : 0;
  if (typeof body.modOnly === "boolean") patch.mod_only = body.modOnly ? 1 : 0;
  if (typeof body.cooldownEnabled === "boolean") patch.cooldown_enabled = body.cooldownEnabled ? 1 : 0;
  if (typeof body.cooldownSeconds === "number") patch.cooldown_seconds = Math.floor(body.cooldownSeconds);
  if (typeof body.approvalEnabled === "boolean") patch.approval_enabled = body.approvalEnabled ? 1 : 0;
  if (typeof body.durationSeconds === "number") patch.duration_seconds = Math.floor(body.durationSeconds);
  if (typeof body.chatFeedback === "boolean") patch.chat_feedback = body.chatFeedback ? 1 : 0;
  return patch;
}

export function buildTtsConfigPatch(body: TtsConfigBody): TenantConfigPatch {
  const patch: TenantConfigPatch = {};
  if (typeof body.ttsEnabled === "boolean") patch.tts_enabled = body.ttsEnabled ? 1 : 0;
  if (typeof body.ttsApiKey === "string") patch.tts_api_key = body.ttsApiKey.trim();
  if (typeof body.ttsVolume === "number") patch.tts_volume = body.ttsVolume;
  if (typeof body.ttsMaxLength === "number") patch.tts_max_length = Math.floor(body.ttsMaxLength);
  if (typeof body.ttsCooldownSeconds === "number") patch.tts_cooldown_seconds = Math.floor(body.ttsCooldownSeconds);
  return patch;
}
