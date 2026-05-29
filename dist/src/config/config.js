"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const dotenv_1 = __importDefault(require("dotenv"));
const schema_1 = require("./schema");
dotenv_1.default.config();
function loadConfig() {
    const parsed = schema_1.envSchema.safeParse(process.env);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
        throw new Error(`Invalid configuration:\n${issues.join("\n")}`);
    }
    const env = parsed.data;
    return {
        twitch: {
            channel: env.TWITCH_CHANNEL,
            botUsername: env.TWITCH_BOT_USERNAME,
            oauthToken: env.TWITCH_OAUTH_TOKEN
        },
        obs: {
            websocketUrl: env.OBS_WEBSOCKET_URL,
            websocketPassword: env.OBS_WEBSOCKET_PASSWORD,
            sceneName: env.OBS_SCENE_NAME,
            sourceName: env.OBS_SOURCE_NAME
        },
        commands: {
            gs: env.GS_COMMAND,
            stop: env.GS_STOP_COMMAND
        },
        access: {
            subOnly: env.GS_SUB_ONLY,
            modOnly: env.GS_MOD_ONLY
        },
        cooldown: {
            enabled: env.GS_COOLDOWN_ENABLED,
            seconds: env.GS_COOLDOWN_SECONDS
        },
        playback: {
            durationSeconds: env.GS_DURATION_SECONDS
        },
        validation: {
            allowedDomains: env.GS_ALLOWED_DOMAINS,
            allowDirectFiles: env.GS_ALLOW_DIRECT_FILES,
            allowedFileExtensions: env.GS_ALLOWED_FILE_EXTENSIONS
        },
        controlHttp: {
            enabled: env.CONTROL_HTTP_ENABLED,
            host: env.CONTROL_HTTP_HOST,
            port: env.CONTROL_HTTP_PORT,
            token: env.CONTROL_HTTP_TOKEN
        },
        logLevel: env.LOG_LEVEL
    };
}
