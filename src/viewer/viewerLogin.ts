import type { Context } from "hono";
import { buildAuthUrl, generateSessionId, VIEWER_SCOPES, type OAuthConfig } from "../auth/oauthHandler";
import { getCookie } from "../auth/sessionMiddleware";
import { createViewerSession, upsertViewer, type Database, type DbViewer } from "../db/database";
import { isSecureRequest } from "../security/httpSecurity";
import { setViewerCookie } from "./viewerSession";

// Twitch only accepts redirect URIs registered in the developer console, and the
// operator registered exactly one. The viewer flow therefore shares the streamer
// callback and is told apart by this cookie, which avoids asking every operator
// to add a second URI.
const FLOW_COOKIE = "gs_oauth_flow";
const STATE_COOKIE = "oauth_state";
const FLOW_PREFIX = "viewer:";

export interface ViewerFlow {
  channel: string;
  token: string;
}

function cookieAttributes(secure: boolean): string {
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=300${secure ? "; Secure" : ""}`;
}

export function beginViewerLogin(c: Context, oauthConfig: OAuthConfig, flow: ViewerFlow): string {
  const state = crypto.randomUUID();
  const secure = isSecureRequest(c);
  const payload = encodeURIComponent(`${FLOW_PREFIX}${flow.channel}:${flow.token}`);

  c.header("Set-Cookie", `${STATE_COOKIE}=${state}; ${cookieAttributes(secure)}`, { append: true });
  c.header("Set-Cookie", `${FLOW_COOKIE}=${payload}; ${cookieAttributes(secure)}`, { append: true });

  // No scope at all: the viewer only proves who they are.
  return buildAuthUrl(oauthConfig, state, VIEWER_SCOPES);
}

export function readViewerFlow(c: Context): ViewerFlow | null {
  const raw = getCookie(c, FLOW_COOKIE);
  if (!raw || !raw.startsWith(FLOW_PREFIX)) return null;

  const rest = raw.slice(FLOW_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator <= 0) return null;

  return { channel: rest.slice(0, separator), token: rest.slice(separator + 1) };
}

export function clearViewerFlow(c: Context): void {
  c.header(
    "Set-Cookie",
    `${FLOW_COOKIE}=; HttpOnly; Path=/; Max-Age=0${isSecureRequest(c) ? "; Secure" : ""}`,
    { append: true }
  );
}

// Creates the viewer identity and its session. Note what it does NOT do: no
// upsertUser, no tenant, no bot. A viewer signing in stays an audience member.
export function completeViewerLogin(
  c: Context,
  db: Database,
  info: { id: string; login: string; displayName: string }
): DbViewer {
  const viewer = upsertViewer(db, {
    twitch_id: info.id,
    twitch_login: info.login,
    twitch_display_name: info.displayName
  });

  const sessionId = generateSessionId();
  createViewerSession(db, sessionId, viewer.id);
  setViewerCookie(c, sessionId, isSecureRequest(c));
  return viewer;
}
