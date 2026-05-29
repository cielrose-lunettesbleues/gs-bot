"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commandRouter_1 = require("./commands/commandRouter");
const adminCommands_1 = require("./commands/adminCommands");
const emergencyStopCommand_1 = require("./commands/emergencyStopCommand");
const greenScreenCommand_1 = require("./commands/greenScreenCommand");
const config_1 = require("./config/config");
const controlServer_1 = require("./control/controlServer");
const cooldownService_1 = require("./cooldown/cooldownService");
const logger_1 = require("./logger/logger");
const obsClient_1 = require("./obs/obsClient");
const obsSourceController_1 = require("./obs/obsSourceController");
const permissionService_1 = require("./permissions/permissionService");
const runtimeState_1 = require("./state/runtimeState");
const twitchClient_1 = require("./twitch/twitchClient");
const twitchMessageHandler_1 = require("./twitch/twitchMessageHandler");
const urlValidator_1 = require("./validation/urlValidator");
async function main() {
    const config = (0, config_1.loadConfig)();
    const logger = (0, logger_1.createLogger)(config.logLevel);
    const permissionService = new permissionService_1.PermissionService();
    const cooldownService = new cooldownService_1.CooldownService();
    const urlValidator = new urlValidator_1.UrlValidator();
    const runtimeState = (0, runtimeState_1.createRuntimeState)();
    const obsClient = new obsClient_1.ObsClient();
    const obsController = new obsSourceController_1.ObsSourceController(obsClient, config.obs, runtimeState, logger);
    const deps = {
        permissionService,
        cooldownService,
        urlValidator,
        obsController,
        config,
        logger
    };
    const router = new commandRouter_1.CommandRouter([
        (0, greenScreenCommand_1.createGreenScreenCommand)(deps, config.commands.gs),
        (0, emergencyStopCommand_1.createEmergencyStopCommand)(deps, config.commands.stop),
        ...(0, adminCommands_1.createAdminCommands)()
    ]);
    const twitchClient = new twitchClient_1.TwitchClient(config.twitch);
    const controlServer = (0, controlServer_1.createControlServer)(config.controlHttp, {
        obsController,
        logger
    });
    (0, twitchMessageHandler_1.bindTwitchMessageHandler)(twitchClient, router, logger);
    await obsClient.connect(config.obs.websocketUrl, config.obs.websocketPassword);
    await obsController.hideSource();
    await twitchClient.connect();
    await controlServer.start();
    logger.info({ channel: config.twitch.channel }, "GS bot started");
    if (config.controlHttp.enabled) {
        logger.info({
            host: config.controlHttp.host,
            port: config.controlHttp.port
        }, "Control HTTP server enabled");
    }
    const shutdown = async () => {
        logger.info({}, "Shutting down GS bot");
        try {
            await obsController.emergencyStop();
        }
        catch (error) {
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
