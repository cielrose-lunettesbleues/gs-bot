import { CommandRouter } from "./commands/commandRouter";
import { AdminService, createAdminCommands } from "./commands/adminCommands";
import { createEmergencyStopCommand } from "./commands/emergencyStopCommand";
import { createGreenScreenCommand } from "./commands/greenScreenCommand";
import { loadConfig } from "./config/config";
import { PersistedConfigStore } from "./config/persistedConfig";
import { createControlServer } from "./control/controlServer";
import { CooldownService } from "./cooldown/cooldownService";
import { ApprovalService } from "./approval/approvalService";
import { BlacklistService } from "./blacklist/blacklistService";
import { HistoryService } from "./history/historyService";
import { YoutubeDurationValidator } from "./validation/youtubeDurationValidator";
import { createLogger } from "./logger/logger";
import { MockObsSourceController } from "./obs/mockObsSourceController";
import { ObsClient } from "./obs/obsClient";
import { ObsSourceController } from "./obs/obsSourceController";
import type { IObsSourceController } from "./obs/obsSourceController.interface";
import { OverlayBroadcaster } from "./overlay/overlayBroadcaster";
import { PermissionService } from "./permissions/permissionService";
import { PlaybackQueue } from "./queue/playbackQueue";
import { createRuntimeState } from "./state/runtimeState";
import { TwitchEventSubClient, fetchBroadcasterId } from "./twitch/twitchEventSubClient";
import { TwitchBotManager } from "./twitch/twitchBotManager";
import { fetchTwitchUserInfo } from "./twitch/twitchOAuth";
import { UrlValidator } from "./validation/urlValidator";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const persistedConfigStore = new PersistedConfigStore(config.dataDir);

  const permissionService = new PermissionService();
  const cooldownService = new CooldownService();
  const urlValidator = new UrlValidator();
  const blacklistService = new BlacklistService(config.dataDir);
  const historyService = new HistoryService(config.dataDir);

  const runtimeState = createRuntimeState();

  let obsController: IObsSourceController;
  let obsClient: ObsClient | null = null;

  if (config.obsMock) {
    logger.warn({}, "OBS mock mode — using overlay Browser Source instead of OBS WebSocket");
    obsController = new MockObsSourceController(runtimeState, logger);
  } else {
    obsClient = new ObsClient();
    obsController = new ObsSourceController(obsClient, config.obs, runtimeState, logger);
  }

  const overlayBroadcaster = new OverlayBroadcaster();

  const queue = new PlaybackQueue(
    obsController,
    config.queue,
    logger,
    (event) => overlayBroadcaster.broadcast(event)
  );

  const youtubeDurationValidator =
    config.youtube.apiKey && config.youtube.maxDurationSeconds > 0
      ? new YoutubeDurationValidator(config.youtube)
      : undefined;

  const approvalService = new ApprovalService({ queue, config: config.approval, logger });

  const adminService = new AdminService({
    runtimeConfig: config,
    cooldownService,
    blacklistService,
    historyService,
    approvalService,
    logger
  });

  const commandDeps = {
    permissionService,
    cooldownService,
    urlValidator,
    queue,
    blacklistService,
    historyService,
    youtubeDurationValidator,
    approvalService,
    adminService,
    config,
    logger
  };

  const router = new CommandRouter([
    createGreenScreenCommand(commandDeps, config.commands.gs),
    createEmergencyStopCommand(commandDeps, config.commands.stop),
    ...createAdminCommands()
  ]);

  // Twitch bot manager — handles connect/disconnect/reconnect lifecycle
  const twitchBotManager = new TwitchBotManager(router, logger);

  // Start Twitch from persisted OAuth config, then fall back to env vars
  if (!config.twitchMock) {
    const persisted = persistedConfigStore.load();
    const twitchCreds = persisted.twitch ?? (
      config.twitch.channel && config.twitch.oauthToken
        ? {
            channel: config.twitch.channel,
            botUsername: config.twitch.botUsername || config.twitch.channel,
            oauthToken: config.twitch.oauthToken
          }
        : null
    );
    if (twitchCreds) {
      try {
        await twitchBotManager.start(twitchCreds);
      } catch (err) {
        logger.error({ err }, "Failed to start Twitch bot — open the dashboard to reconnect");
      }
    } else {
      logger.info({}, "No Twitch credentials — open the dashboard to connect via Twitch OAuth");
    }
  }

  // Compute the OAuth redirect URI (can be overridden via TWITCH_REDIRECT_URI)
  const redirectUri = config.oauth.redirectUri ||
    `http://${config.controlHttp.host}:${config.controlHttp.port}/oauth/callback`;

  // Wire twitchBot interface for the control server
  const twitchBotDeps = {
    status: () => ({
      ...twitchBotManager.status(),
      oauthClientId: config.oauth.clientId || null,
      redirectUri
    }),
    connectOAuth: async (token: string): Promise<{ channel: string }> => {
      if (!config.oauth.clientId) {
        throw new Error("TWITCH_CLIENT_ID is not set — add it to .env to enable OAuth");
      }
      const userInfo = await fetchTwitchUserInfo(token, config.oauth.clientId);
      const twitchConfig = {
        oauthToken: token,
        channel: userInfo.login,
        botUsername: userInfo.login,
        broadcasterId: userInfo.id
      };
      persistedConfigStore.saveTwitch(twitchConfig);
      await twitchBotManager.start(twitchConfig);
      logger.info({ channel: userInfo.login }, "Twitch connected via OAuth");
      return { channel: userInfo.login };
    },
    disconnectAndClear: async (): Promise<void> => {
      await twitchBotManager.stop();
      persistedConfigStore.clearTwitch();
      logger.info({}, "Twitch disconnected and OAuth config cleared");
    }
  };

  const controlServer = createControlServer(config.controlHttp, {
    queue,
    cooldownService,
    blacklistService,
    historyService,
    approvalService,
    overlayBroadcaster,
    router,
    runtimeConfig: config,
    logger,
    twitchBot: twitchBotDeps
  });

  if (obsClient) {
    await obsClient.connect(config.obs.websocketUrl, config.obs.websocketPassword);
  }
  await obsController.hideSource();
  await controlServer.start();

  // Channel points via EventSub WebSocket
  let eventSubClient: TwitchEventSubClient | null = null;
  if (config.channelPoints.enabled) {
    let broadcasterId = config.channelPoints.broadcasterId;
    if (!broadcasterId) {
      broadcasterId = await fetchBroadcasterId(
        config.twitch.channel,
        config.channelPoints.clientId,
        config.channelPoints.accessToken
      );
      logger.info({ broadcasterId, channel: config.twitch.channel }, "Resolved broadcaster ID");
    }

    eventSubClient = new TwitchEventSubClient(
      { ...config.channelPoints, broadcasterId },
      async (redemption) => {
        const url = redemption.userInput.trim();
        if (!url) return;

        if (blacklistService.isBlocked(redemption.username)) {
          logger.info({ username: redemption.username }, "Channel points blocked (blacklist)");
          return;
        }

        const urlCheck = urlValidator.validate(url, config.validation);
        if (!urlCheck.valid) {
          logger.info(
            { username: redemption.username, url, reason: urlCheck.reason },
            "Channel points URL invalid"
          );
          return;
        }

        if (youtubeDurationValidator) {
          const durationCheck = await youtubeDurationValidator.check(url);
          if (!durationCheck.allowed) {
            logger.info(
              { username: redemption.username, url, reason: durationCheck.reason },
              "Channel points duration rejected"
            );
            return;
          }
        }

        const result = await queue.enqueue({
          url,
          durationSeconds: config.playback.durationSeconds,
          username: redemption.username,
          reply: async () => undefined
        });

        logger.info(
          { username: redemption.username, url, rewardId: redemption.rewardId, queueStatus: result.status },
          "Channel points redemption processed"
        );
      },
      logger
    );

    await eventSubClient.connect();
    logger.info({ rewardId: config.channelPoints.rewardId || "any" }, "Channel points enabled");
  }

  logger.info(
    { channel: config.twitch.channel || "(OAuth pending)", obsMock: config.obsMock },
    "GS Bot started"
  );
  if (config.controlHttp.enabled) {
    logger.info(
      { host: config.controlHttp.host, port: config.controlHttp.port },
      "Dashboard: http://%s:%d/  |  Browser Source: http://%s:%d/overlay",
      config.controlHttp.host, config.controlHttp.port,
      config.controlHttp.host, config.controlHttp.port
    );
  }

  const shutdown = async (): Promise<void> => {
    logger.info({}, "Shutting down GS Bot");
    try {
      await queue.stop();
    } catch (error) {
      logger.error({ error }, "Failed to stop queue during shutdown");
    }
    eventSubClient?.disconnect();
    await twitchBotManager.stop();
    await controlServer.stop();
    if (obsClient) {
      await obsClient.disconnect();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown().catch((error) => logger.error({ error }, "Shutdown failed"));
  });
  process.on("SIGTERM", () => {
    shutdown().catch((error) => logger.error({ error }, "Shutdown failed"));
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", error);
  process.exit(1);
});
