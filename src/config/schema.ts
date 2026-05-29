import { z } from "zod";

const splitCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const envSchema = z.object({
  TWITCH_CHANNEL: z.string().min(1),
  TWITCH_BOT_USERNAME: z.string().min(1),
  TWITCH_OAUTH_TOKEN: z.string().min(1),
  OBS_WEBSOCKET_URL: z.string().url(),
  OBS_WEBSOCKET_PASSWORD: z.string().default(""),
  OBS_SCENE_NAME: z.string().min(1),
  OBS_SOURCE_NAME: z.string().min(1),
  GS_COMMAND: z.string().default("!gs"),
  GS_STOP_COMMAND: z.string().default("!gstop"),
  GS_SUB_ONLY: z.coerce.boolean().default(true),
  GS_MOD_ONLY: z.coerce.boolean().default(false),
  GS_COOLDOWN_ENABLED: z.coerce.boolean().default(true),
  GS_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
  GS_DURATION_SECONDS: z.coerce.number().int().positive().default(15),
  GS_ALLOWED_DOMAINS: z
    .string()
    .transform(splitCsv)
    .pipe(z.array(z.string()).min(1)),
  GS_ALLOW_DIRECT_FILES: z.coerce.boolean().default(true),
  GS_ALLOWED_FILE_EXTENSIONS: z
    .string()
    .default(".mp4,.webm,.mov")
    .transform(splitCsv)
    .pipe(z.array(z.string())),
  CONTROL_HTTP_ENABLED: z.coerce.boolean().default(false),
  CONTROL_HTTP_HOST: z.string().default("127.0.0.1"),
  CONTROL_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(4317),
  CONTROL_HTTP_TOKEN: z.string().default(""),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info")
}).superRefine((env, ctx) => {
  if (env.CONTROL_HTTP_ENABLED && env.CONTROL_HTTP_TOKEN.trim().length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CONTROL_HTTP_TOKEN"],
      message: "CONTROL_HTTP_TOKEN is required when CONTROL_HTTP_ENABLED=true"
    });
  }
});

export type EnvSchema = z.infer<typeof envSchema>;
