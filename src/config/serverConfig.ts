import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4317),
  HOST: z.string().default("0.0.0.0"),
  GS_DATA_DIR: z.string().default("./data"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  TWITCH_CLIENT_ID: z.string().default(""),
  TWITCH_CLIENT_SECRET: z.string().default(""),
  TWITCH_REDIRECT_URI: z.string().default(""),
  GS_YOUTUBE_API_KEY: z.string().default(""),
  GS_TENOR_API_KEY: z.string().default("")
});

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  youtubeApiKey: string;
  tenorApiKey: string;
  twitch: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
}

// Loads optional overrides from data/server-config.json (set via the /setup UI).
// These take precedence over environment variables so the operator never needs
// to touch the .env file manually.
function loadPersistedEnv(dataDir: string): Record<string, string> {
  try {
    const configPath = path.join(dataDir, "server-config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveServerOAuthConfig(
  dataDir: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(dataDir, "server-config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({ TWITCH_CLIENT_ID: clientId, TWITCH_CLIENT_SECRET: clientSecret, TWITCH_REDIRECT_URI: redirectUri }, null, 2)
  );
}

export function loadServerConfig(): ServerConfig {
  // Determine dataDir early (before full parse) so we can load persisted overrides.
  const dataDir = process.env.GS_DATA_DIR ?? "./data";
  const persisted = loadPersistedEnv(dataDir);

  // Persisted file overrides env vars — env vars override schema defaults.
  const merged = { ...process.env, ...persisted };

  const parsed = schema.safeParse(merged);
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
    youtubeApiKey: env.GS_YOUTUBE_API_KEY,
    tenorApiKey: env.GS_TENOR_API_KEY,
    twitch: {
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      redirectUri: env.TWITCH_REDIRECT_URI
    }
  };
}
