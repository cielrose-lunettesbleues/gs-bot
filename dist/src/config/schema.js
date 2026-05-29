"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envSchema = void 0;
const zod_1 = require("zod");
const splitCsv = (value) => value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
exports.envSchema = zod_1.z.object({
    TWITCH_CHANNEL: zod_1.z.string().min(1),
    TWITCH_BOT_USERNAME: zod_1.z.string().min(1),
    TWITCH_OAUTH_TOKEN: zod_1.z.string().min(1),
    OBS_WEBSOCKET_URL: zod_1.z.string().url(),
    OBS_WEBSOCKET_PASSWORD: zod_1.z.string().default(""),
    OBS_SCENE_NAME: zod_1.z.string().min(1),
    OBS_SOURCE_NAME: zod_1.z.string().min(1),
    GS_COMMAND: zod_1.z.string().default("!gs"),
    GS_STOP_COMMAND: zod_1.z.string().default("!gstop"),
    GS_SUB_ONLY: zod_1.z.coerce.boolean().default(true),
    GS_MOD_ONLY: zod_1.z.coerce.boolean().default(false),
    GS_COOLDOWN_ENABLED: zod_1.z.coerce.boolean().default(true),
    GS_COOLDOWN_SECONDS: zod_1.z.coerce.number().int().nonnegative().default(60),
    GS_DURATION_SECONDS: zod_1.z.coerce.number().int().positive().default(15),
    GS_ALLOWED_DOMAINS: zod_1.z
        .string()
        .transform(splitCsv)
        .pipe(zod_1.z.array(zod_1.z.string()).min(1)),
    GS_ALLOW_DIRECT_FILES: zod_1.z.coerce.boolean().default(true),
    GS_ALLOWED_FILE_EXTENSIONS: zod_1.z
        .string()
        .default(".mp4,.webm,.mov")
        .transform(splitCsv)
        .pipe(zod_1.z.array(zod_1.z.string())),
    CONTROL_HTTP_ENABLED: zod_1.z.coerce.boolean().default(false),
    CONTROL_HTTP_HOST: zod_1.z.string().default("127.0.0.1"),
    CONTROL_HTTP_PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(4317),
    CONTROL_HTTP_TOKEN: zod_1.z.string().default(""),
    LOG_LEVEL: zod_1.z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info")
}).superRefine((env, ctx) => {
    if (env.CONTROL_HTTP_ENABLED && env.CONTROL_HTTP_TOKEN.trim().length === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["CONTROL_HTTP_TOKEN"],
            message: "CONTROL_HTTP_TOKEN is required when CONTROL_HTTP_ENABLED=true"
        });
    }
});
