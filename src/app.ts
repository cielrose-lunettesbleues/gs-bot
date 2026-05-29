import { CommandRouter } from "./commands/commandRouter";
import { createAdminCommands } from "./commands/adminCommands";
import { createEmergencyStopCommand } from "./commands/emergencyStopCommand";
import { createGreenScreenCommand } from "./commands/greenScreenCommand";
import { loadConfig } from "./config/config";
import { createControlServer } from "./control/controlServer";
import { CooldownService } from "./cooldown/cooldownService";
import { createLogger } from "./logger/logger";
import { ObsClient } from "./obs/obsClient";
import { ObsSourceController } from "./obs/obsSourceController";
import { PermissionService } from "./permissions/permissionService";
import { createRuntimeState } from "./state/runtimeState";
import { TwitchClient } from "./twitch/twitchClient";
import { bindTwitchMessageHandler } from "./twitch/twitchMessageHandler";
import { UrlValidator } from "./validation/urlValidator";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  const permissionService = new PermissionService();
  const cooldownService = new CooldownService();
  const urlValidator = new UrlValidator();

  const runtimeState = createRuntimeState();
  const obsClient = new ObsClient();
  const obsController = new ObsSourceController(obsClient, config.obs, runtimeState, logger);

  const deps = {
    permissionService,
    cooldownService,
    urlValidator,
    obsController,
    config,
    logger
  };

  const router = new CommandRouter([
    createGreenScreenCommand(deps, config.commands.gs),
    createEmergencyStopCommand(deps, config.commands.stop),
    ...createAdminCommands()
  ]);

  const twitchClient = new TwitchClient(config.twitch);
  const controlServer = createControlServer(config.controlHttp, {
    obsController,
    logger
  });
  bindTwitchMessageHandler(twitchClient, router, logger);

  await obsClient.connect(config.obs.websocketUrl, config.obs.websocketPassword);
  await obsController.hideSource();
  await twitchClient.connect();
  await controlServer.start();

  logger.info({ channel: config.twitch.channel }, "GS bot started");
  if (config.controlHttp.enabled) {
    logger.info(
      {
        host: config.controlHttp.host,
        port: config.controlHttp.port
      },
      "Control HTTP server enabled"
    );
  }

  const shutdown = async (): Promise<void> => {
    logger.info({}, "Shutting down GS bot");
    try {
      await obsController.emergencyStop();
    } catch (error) {
      logger.error({ error }, "Failed to emergency stop source during shutdown");
    }

    await twitchClient.disconnect();
    await controlServer.stop();
    await obsClient.disconnect();
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
