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

export function buildSubmitPath(channel: string, webToken: string): string {
  return `/submit/${channel}?token=${encodeURIComponent(webToken)}`;
}

/** Absolute link handed to viewers in chat. Empty when no public URL is known. */
export function buildSubmitUrl(publicUrl: string, channel: string, webToken: string): string {
  if (!publicUrl) return "";
  return `${publicUrl.replace(/\/+$/, "")}${buildSubmitPath(channel, webToken)}`;
}
