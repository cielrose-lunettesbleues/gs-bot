import type { DbTtsVoice } from "../db/database";
import type { HistoryEntry } from "../history/historyService";
import type { TenantRuntimeState, TenantServices } from "../tenant/tenantManager";

export interface StatusResponse {
  config: {
    access: { subOnly: boolean; modOnly: boolean };
    cooldown: { enabled: boolean; seconds: number };
    approval: { enabled: boolean };
    playback: { durationSeconds: number; chatFeedback: boolean };
    tts: {
      enabled: boolean;
      provider: string;
      apiKeySet: boolean;
      volume: number;
      maxLength: number;
      status: string;
      statusMessage?: string;
    };
  };
  queue: { busy: boolean; pendingCount: number };
  approval: { pendingCount: number; pending: string[] };
  overlay: { clients: number; url: string };
  twitch: { connected: boolean; channel: string | null };
  runtime: TenantRuntimeState;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

export interface TtsVoiceResponseItem {
  id: number;
  label: string;
  provider: string;
  voiceId: string;
  isDefault: boolean;
  aliases: string[];
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed: number;
}

export interface TtsVoicesResponse {
  voices: TtsVoiceResponseItem[];
}

export interface OverlayRotateTokenResponse {
  ok: true;
  overlayUrl: string;
}

export function buildStatusResponse(
  tenant: TenantServices,
  overlayUrl: string,
  runtime: TenantRuntimeState
): StatusResponse {
  const cfg = tenant.runtimeConfig;
  const pending = tenant.approvalService.listPending();
  const twitch = tenant.twitchBotManager.status();
  const ttsStatus = tenant.ttsService.getStatus();

  return {
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
        maxLength: cfg.tts.maxLength,
        status: ttsStatus.state,
        statusMessage: ttsStatus.message
      }
    },
    queue: tenant.queue.getState(),
    approval: { pendingCount: pending.length, pending },
    overlay: {
      clients: tenant.overlayBroadcaster.clientCount(),
      url: overlayUrl
    },
    twitch: { connected: twitch.connected, channel: twitch.channel },
    runtime
  };
}

export function buildHistoryResponse(entries: HistoryEntry[]): HistoryResponse {
  return { entries };
}

export function mapTtsVoice(voice: DbTtsVoice): TtsVoiceResponseItem {
  return {
    id: voice.id,
    label: voice.label,
    provider: voice.provider,
    voiceId: voice.voice_id,
    isDefault: Boolean(voice.is_default),
    aliases: JSON.parse(voice.aliases_json) as string[],
    stability: voice.stability ?? 0.5,
    similarityBoost: voice.similarity_boost ?? 0.75,
    style: voice.style ?? 0.0,
    useSpeakerBoost: Boolean(voice.use_speaker_boost ?? 1),
    speed: voice.speed ?? 1.0
  };
}

export function buildTtsVoicesResponse(voices: DbTtsVoice[]): TtsVoicesResponse {
  return { voices: voices.map(mapTtsVoice) };
}

export function buildOverlayRotateTokenResponse(overlayUrl: string): OverlayRotateTokenResponse {
  return { ok: true, overlayUrl };
}
