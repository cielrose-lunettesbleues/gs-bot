import type { Logger } from "pino";
import { AdminService, createAdminCommands } from "../commands/adminCommands";
import { createEmergencyStopCommand } from "../commands/emergencyStopCommand";
import { createGreenScreenCommand } from "../commands/greenScreenCommand";
import { createTtsCommand } from "../commands/ttsCommand";
import { CommandRouter } from "../commands/commandRouter";
import { ApprovalService } from "../approval/approvalService";
import { BlacklistService } from "../blacklist/blacklistService";
import { HistoryService } from "../history/historyService";
import { CooldownService } from "../cooldown/cooldownService";
import { PermissionService } from "../permissions/permissionService";
import { UrlValidator } from "../validation/urlValidator";
import { OverlayBroadcaster } from "../overlay/overlayBroadcaster";
import { PlaybackQueue, type TtsPlaybackEvent } from "../queue/playbackQueue";
import { TwitchBotManager } from "../twitch/twitchBotManager";
import { MockObsSourceController } from "../obs/mockObsSourceController";
import { createRuntimeState } from "../state/runtimeState";
import { searchShortVideo } from "../media/youtubeSearch";
import { sociavaultResolve } from "../media/sociavaultClient";
import { searchGif } from "../media/klipySearch";
import { TtsService, type ITtsService } from "../tts/ttsService";
import type { Database, DbUser } from "../db/database";
import type { TenantAdminConfigPatch } from "./configPatches";
import type { TenantRuntimeConfig } from "./runtimeConfig";
import type { TenantServices } from "./tenantManager";

interface CreateTenantServicesDeps {
  db: Database;
  userId: number;
  dbUser: DbUser | undefined;
  logger: Logger;
  runtimeConfig: TenantRuntimeConfig;
  persistRuntimeConfig: (patch: TenantAdminConfigPatch) => void;
  youtubeApiKey?: string;
  klipyApiKey?: string;
  sociavaultApiKey?: string;
  // Returns a valid Twitch user token, refreshed if needed; null if it cannot.
  resolveAccessToken?: () => Promise<string | null>;
}

export function createTenantServices({
  db,
  userId,
  dbUser,
  logger,
  runtimeConfig,
  persistRuntimeConfig,
  youtubeApiKey,
  klipyApiKey,
  sociavaultApiKey,
  resolveAccessToken
}: CreateTenantServicesDeps): TenantServices {
  const overlayBroadcaster = new OverlayBroadcaster();
  const obsController = new MockObsSourceController(createRuntimeState(), logger);

  const queue = new PlaybackQueue(
    obsController,
    runtimeConfig.queue,
    logger,
    (event) => overlayBroadcaster.broadcast(event)
  );

  const permissionService = new PermissionService();
  const cooldownService = new CooldownService();
  const urlValidator = new UrlValidator();
  const blacklistService = new BlacklistService(db, userId);
  const historyService = new HistoryService(db, userId);
  const approvalService = new ApprovalService({ queue, config: runtimeConfig.approval, logger });
  const adminService = new AdminService({
    runtimeConfig,
    persistRuntimeConfig,
    cooldownService,
    blacklistService,
    historyService,
    approvalService,
    logger
  });

  const ttsService: ITtsService = new TtsService(db, userId, runtimeConfig.tts, logger);
  const channelLogin = dbUser?.twitch_login ?? "";

  const commandDeps = {
    permissionService,
    cooldownService,
    urlValidator,
    queue,
    blacklistService,
    historyService,
    youtubeDurationValidator: undefined,
    tiktokSearch: undefined,
    tiktokResolve: sociavaultApiKey
      ? (url: string) => sociavaultResolve(url, sociavaultApiKey, logger)
      : undefined,
    youtubeSearch: youtubeApiKey
      ? (query: string, maxDuration: number) => searchShortVideo(query, maxDuration, youtubeApiKey)
      : undefined,
    gifSearch: klipyApiKey
      ? (query: string) => searchGif(query, klipyApiKey)
      : undefined,
    approvalService,
    adminService,
    ttsService,
    channelLogin,
    createTtsAudioPath: (channel: string, audioId: string) => {
      return `/tts/audio/${channel}/${audioId}?token=${encodeURIComponent(runtimeConfig.publicAccess.overlayToken)}`;
    },
    broadcastOverlay: (event: TtsPlaybackEvent) => overlayBroadcaster.broadcast(event),
    config: runtimeConfig,
    logger
  };

  const router = new CommandRouter([
    createGreenScreenCommand(commandDeps, runtimeConfig.commands.gs),
    createTtsCommand(commandDeps, "!tts"),
    createEmergencyStopCommand(commandDeps, runtimeConfig.commands.stop),
    ...createAdminCommands()
  ]);

  const twitchBotManager = new TwitchBotManager(router, logger);

  if (dbUser?.access_token && dbUser?.twitch_login) {
    const channel = dbUser.twitch_login;
    const storedToken = dbUser.access_token;
    // The stored token is only refreshed by dashboard requests, so a tenant woken
    // by the live poller can hold one that expired hours ago.
    const resolveToken = resolveAccessToken ?? (async () => storedToken);
    resolveToken()
      .then((oauthToken) => {
        if (!oauthToken) {
          logger.warn({ userId }, "No valid Twitch token, bot not started (streamer must log in again)");
          return;
        }
        return twitchBotManager.start({ channel, botUsername: channel, oauthToken });
      })
      .catch((err) => logger.error({ err, userId }, "Failed to auto-start Twitch bot"));
  }

  return {
    runtimeConfig,
    queue,
    cooldownService,
    approvalService,
    blacklistService,
    historyService,
    overlayBroadcaster,
    twitchBotManager,
    router,
    ttsService
  };
}
