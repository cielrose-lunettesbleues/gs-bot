import type { Context } from "hono";
import { getCookie } from "../auth/sessionMiddleware";
import { getViewerById, getViewerSession, type Database, type DbViewer } from "../db/database";

// Deliberately not SESSION_COOKIE: a viewer session must never satisfy
// requireAuth, which would hand them a dashboard and a tenant of their own.
export const VIEWER_COOKIE = "gs_viewer";

const VIEWER_SESSION_TTL_SECONDS = 2592000;

export function getViewerFromRequest(c: Context, db: Database): DbViewer | null {
  const sessionId = getCookie(c, VIEWER_COOKIE);
  if (!sessionId) return null;
  const session = getViewerSession(db, sessionId);
  if (!session) return null;
  return getViewerById(db, session.viewerId) ?? null;
}

export function setViewerCookie(
  c: Context,
  sessionId: string,
  secure: boolean,
  ttlSeconds = VIEWER_SESSION_TTL_SECONDS
): void {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  c.header(
    "Set-Cookie",
    `${VIEWER_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires}${secure ? "; Secure" : ""}`,
    { append: true }
  );
}

export function clearViewerCookie(c: Context, secure: boolean): void {
  c.header(
    "Set-Cookie",
    `${VIEWER_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`,
    { append: true }
  );
}
