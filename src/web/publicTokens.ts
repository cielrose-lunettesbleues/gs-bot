import type { Context } from "hono";
import type { ServerConfig } from "../config/serverConfig";
import { isLocalRequest } from "../security/httpSecurity";

export function buildOverlayPath(channel: string, overlayToken: string): string {
  return `/overlay/${channel}?token=${encodeURIComponent(overlayToken)}`;
}

export function isValidSetupRequest(c: Context, config: ServerConfig, setupToken?: string): boolean {
  if (isLocalRequest(c)) return true;
  if (!config.setupToken) return false;
  const queryToken = c.req.query("token");
  const headerToken = c.req.header("x-setup-token");
  return queryToken === config.setupToken || headerToken === config.setupToken || setupToken === config.setupToken;
}
