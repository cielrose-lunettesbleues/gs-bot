import type { IBlacklistService } from "../blacklist/blacklistService";
import type { IHistoryService } from "../history/historyService";
import type { PlaybackItem, EnqueueResult } from "../queue/playbackQueue";
import type { CommandContext } from "../twitch/twitchTypes";
import type { ITtsService } from "../tts/ttsService";

export type { PlaybackItem, EnqueueResult };

export interface AdminService {
  isAdminKeyword: (token: string) => boolean;
  execute: (context: CommandContext, args: string[]) => Promise<void>;
}

export interface DurationCheckResult {
  allowed: boolean;
  durationSeconds?: number;
  reason?: "too_long" | "video_not_found";
}

export interface QueueService {
  enqueue: (item: PlaybackItem) => Promise<EnqueueResult>;
  stop: () => Promise<void>;
}

export interface CommandDependencies {
  permissionService: {
    canUseGreenScreen: CommandPermissionCheck;
  };
  cooldownService: {
    checkAndConsume: CommandCooldownCheck;
  };
  urlValidator: {
    validate: CommandUrlValidate;
  };
  queue: QueueService;
  blacklistService: IBlacklistService;
  historyService: IHistoryService;
  youtubeDurationValidator?: { check: (url: string) => Promise<DurationCheckResult> };
  youtubeSearch?: (query: string, maxDurationSeconds: number) => Promise<{ url: string; title: string; durationSeconds: number; portrait?: boolean } | null>;
  tiktokSearch?: (query: string, maxDurationSeconds: number) => Promise<{ url: string; title: string; durationSeconds: number; portrait?: boolean } | null>;
  tiktokResolve?: (url: string) => Promise<{ url: string; durationSeconds: number; portrait: boolean } | null>;
  gifSearch?: (query: string) => Promise<{ url: string; title: string } | null>;
  approvalService?: {
    config: { enabled: boolean };
    submit: (item: { url: string; durationSeconds: number; username: string; caption?: string; portrait?: boolean; ttsGenerate?: () => Promise<import("../queue/playbackQueue").TtsPlaybackEvent | null>; userReply: (msg: string) => Promise<void> }, channelNotify: (msg: string) => Promise<void>) => Promise<void>;
  };
  adminService?: AdminService;
  ttsService?: ITtsService;
  /** Twitch channel login (without #) for building TTS audio URLs. */
  channelLogin?: string;
  config: {
    access: { subOnly: boolean; modOnly: boolean };
    cooldown: { enabled: boolean; seconds: number; perUserEnabled?: boolean; perUserSeconds?: number };
    playback: { durationSeconds: number; chatFeedback?: boolean };
    validation: {
      allowedDomains: string[];
      allowDirectFiles: boolean;
      allowedFileExtensions: string[];
      maxDurationSeconds: number;
    };
  };
  logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
}

export type CommandPermissionCheck = (
  user: CommandContext["user"],
  config: { subOnly: boolean; modOnly: boolean }
) => { allowed: boolean; reason?: string };

export type CommandCooldownCheck = (
  config: { enabled: boolean; seconds: number; perUserEnabled?: boolean; perUserSeconds?: number },
  username?: string
) => { allowed: boolean; retryAfterSeconds: number };

export type CommandUrlValidate = (
  url: string,
  config: {
    allowedDomains: string[];
    allowDirectFiles: boolean;
    allowedFileExtensions: string[];
  }
) => { valid: boolean; reason?: string };

export interface Command {
  name: string;
  aliases: string[];
  execute: (context: CommandContext, args: string[]) => Promise<void>;
}
