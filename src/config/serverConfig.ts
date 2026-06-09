import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4317),
  HOST: z.string().default("0.0.0.0"),
  GS_DATA_DIR: z.string().default("./data"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TWITCH_CLIENT_ID: z.string().min(1, "TWITCH_CLIENT_ID is required"),
  TWITCH_CLIENT_SECRET: z.string().min(1, "TWITCH_CLIENT_SECRET is required"),
  TWITCH_REDIRECT_URI: z.string().url("TWITCH_REDIRECT_URI must be a valid URL")
});

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  twitch: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

export function loadServerConfig(): ServerConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${issues.join("\n")}`);
  }
  const env = parsed.data;
  return {
    port: env.PORT,
    host: env.HOST,
    dataDir: env.GS_DATA_DIR,
    logLevel: env.LOG_LEVEL,
    twitch: {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      redirectUri: env.TWITCH_REDIRECT_URI
    }
  };
}
