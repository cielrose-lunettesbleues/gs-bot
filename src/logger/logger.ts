import pino, { type Logger } from "pino";

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        "config.twitch.oauthToken",
        "config.obs.websocketPassword",
        "clientSecret",
        "accessToken",
        "refreshToken",
        "access_token",
        "refresh_token",
        "ttsApiKey",
        "tts_api_key",
        "oauthConfig.clientSecret"
      ],
      censor: "[REDACTED]"
    }
  });
}
