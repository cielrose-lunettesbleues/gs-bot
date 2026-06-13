import type { DbTenantConfig } from "../db/database";

// The mutable runtime config that all tenant services share via reference.
export interface TenantRuntimeConfig {
  access: { subOnly: boolean; modOnly: boolean };
  cooldown: { enabled: boolean; seconds: number; perUserEnabled: boolean; perUserSeconds: number };
  approval: { enabled: boolean; timeoutSeconds: number };
  queue: { mode: "queue" | "replace" | "drop"; maxSize: number };
  playback: { durationSeconds: number; chatFeedback: boolean };
  validation: {
    allowedDomains: string[];
    allowDirectFiles: boolean;
    allowedFileExtensions: string[];
    maxDurationSeconds: number;
  };
  commands: { gs: string; stop: string };
  tts: {
    enabled: boolean;
    provider: string;
    apiKey: string;
    volume: number;
    maxLength: number;
    cooldownSeconds: number;
  };
  publicAccess: {
    overlayToken: string;
  };
}

export function dbConfigToRuntime(row: DbTenantConfig): TenantRuntimeConfig {
  return {
    access: { subOnly: Boolean(row.sub_only), modOnly: Boolean(row.mod_only) },
    cooldown: {
      enabled: Boolean(row.cooldown_enabled),
      seconds: row.cooldown_seconds,
      perUserEnabled: Boolean(row.cooldown_per_user),
      perUserSeconds: row.cooldown_per_user_seconds
    },
    approval: { enabled: Boolean(row.approval_enabled), timeoutSeconds: row.approval_timeout_seconds },
    queue: { mode: row.queue_mode as "queue" | "replace" | "drop", maxSize: row.queue_max_size },
    playback: { durationSeconds: row.duration_seconds, chatFeedback: Boolean(row.chat_feedback) },
    validation: {
      allowedDomains: row.allowed_domains.split(",").map((d) => d.trim()).filter(Boolean),
      allowDirectFiles: Boolean(row.allow_direct_files),
      allowedFileExtensions: row.allowed_file_extensions.split(",").map((e) => e.trim()).filter(Boolean),
      maxDurationSeconds: row.max_video_duration_seconds
    },
    commands: { gs: "!gs", stop: "!gstop" },
    tts: {
      enabled: Boolean(row.tts_enabled ?? 0),
      provider: row.tts_provider ?? "elevenlabs",
      apiKey: row.tts_api_key ?? "",
      volume: row.tts_volume ?? 1.0,
      maxLength: row.tts_max_length ?? 200,
      cooldownSeconds: row.tts_cooldown_seconds ?? 0
    },
    publicAccess: {
      overlayToken: row.overlay_token
    }
  };
}

export function applyRuntimeConfig(target: TenantRuntimeConfig, source: TenantRuntimeConfig): void {
  Object.assign(target.access, source.access);
  Object.assign(target.cooldown, source.cooldown);
  Object.assign(target.approval, source.approval);
  Object.assign(target.queue, source.queue);
  Object.assign(target.playback, source.playback);
  Object.assign(target.validation, source.validation);
  Object.assign(target.tts, source.tts);
  Object.assign(target.publicAccess, source.publicAccess);
}
