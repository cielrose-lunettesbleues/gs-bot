"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envSchema = void 0;
const zod_1 = require("zod");
const splitCsv = (value) => value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
// z.coerce.boolean() uses JavaScript's Boolean() which converts "false" → true.
// This helper correctly maps env var strings: "false"/"0"/"" → false, everything else → true.
const envBool = (def) => zod_1.z.preprocess((val) => {
    if (val === "false" || val === "0" || val === "")
        return false;
    if (val === "true" || val === "1")
        return true;
    return val;
}, zod_1.z.boolean().default(def));
exports.envSchema = zod_1.z.object({
    TWITCH_CHANNEL: zod_1.z.string().min(1),
    TWITCH_BOT_USERNAME: zod_1.z.string().min(1),
    TWITCH_OAUTH_TOKEN: zod_1.z.string().min(1),
    OBS_MOCK: envBool(false),
    OBS_WEBSOCKET_URL: zod_1.z.string().url().default("ws://localhost:4455"),
    OBS_WEBSOCKET_PASSWORD: zod_1.z.string().default(""),
    OBS_SCENE_NAME: zod_1.z.string().default("Main"),
    OBS_SOURCE_NAME: zod_1.z.string().default("GreenScreenSource"),
    GS_COMMAND: zod_1.z.string().default("!gs"),
    GS_STOP_COMMAND: zod_1.z.string().default("!gstop"),
    GS_SUB_ONLY: envBool(true),
    GS_MOD_ONLY: envBool(false),
    GS_COOLDOWN_ENABLED: envBool(true),
    GS_COOLDOWN_SECONDS: zod_1.z.coerce.number().int().nonnegative().default(60),
    GS_COOLDOWN_PER_USER: envBool(false),
    GS_COOLDOWN_PER_USER_SECONDS: zod_1.z.coerce.number().int().nonnegative().default(30),
    GS_DURATION_SECONDS: zod_1.z.coerce.number().int().positive().default(15),
    GS_CHAT_FEEDBACK: envBool(true),
    GS_QUEUE_MODE: zod_1.z.enum(["queue", "replace", "drop"]).default("queue"),
    GS_QUEUE_MAX_SIZE: zod_1.z.coerce.number().int().min(1).max(20).default(3),
    GS_ALLOWED_DOMAINS: zod_1.z
        .string()
        .transform(splitCsv)
        .pipe(zod_1.z.array(zod_1.z.string()).min(1)),
    GS_ALLOW_DIRECT_FILES: envBool(true),
    GS_ALLOWED_FILE_EXTENSIONS: zod_1.z
        .string()
        .default(".mp4,.webm,.mov")
        .transform(splitCsv)
        .pipe(zod_1.z.array(zod_1.z.string())),
    CONTROL_HTTP_ENABLED: envBool(false),
    CONTROL_HTTP_HOST: zod_1.z.string().default("127.0.0.1"),
    CONTROL_HTTP_PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(4317),
    CONTROL_HTTP_TOKEN: zod_1.z.string().default(""),
    YOUTUBE_API_KEY: zod_1.z.string().default(""),
    GS_MAX_VIDEO_DURATION_SECONDS: zod_1.z.coerce.number().int().nonnegative().default(0),
    GS_MOD_APPROVAL: envBool(false),
    GS_MOD_APPROVAL_TIMEOUT: zod_1.z.coerce.number().int().positive().default(60),
    GS_DATA_DIR: zod_1.z.string().default("."),
    LOG_LEVEL: zod_1.z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    CHANNEL_POINTS_ENABLED: envBool(false),
    TWITCH_CLIENT_ID: zod_1.z.string().default(""),
    TWITCH_USER_ACCESS_TOKEN: zod_1.z.string().default(""),
    TWITCH_BROADCASTER_ID: zod_1.z.string().default(""),
    CHANNEL_POINTS_REWARD_ID: zod_1.z.string().default("")
}).superRefine((env, ctx) => {
    if (env.CONTROL_HTTP_ENABLED && env.CONTROL_HTTP_TOKEN.trim().length === 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["CONTROL_HTTP_TOKEN"],
            message: "CONTROL_HTTP_TOKEN is required when CONTROL_HTTP_ENABLED=true"
        });
    }
    if (env.CHANNEL_POINTS_ENABLED) {
        if (!env.TWITCH_CLIENT_ID) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["TWITCH_CLIENT_ID"],
                message: "TWITCH_CLIENT_ID is required when CHANNEL_POINTS_ENABLED=true"
            });
        }
        if (!env.TWITCH_USER_ACCESS_TOKEN) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                path: ["TWITCH_USER_ACCESS_TOKEN"],
                message: "TWITCH_USER_ACCESS_TOKEN is required when CHANNEL_POINTS_ENABLED=true"
            });
        }
    }
});
