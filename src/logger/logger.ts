import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: ["config.twitch.oauthToken", "config.obs.websocketPassword"],
      censor: "[REDACTED]"
    }
  });
}
