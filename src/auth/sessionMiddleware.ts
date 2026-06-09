import type { Context, MiddlewareHandler } from "hono";
import type { Database } from "../db/database";
import type { OAuthConfig } from "./oauthHandler";
import { getUserFromSession } from "./oauthHandler";

export const SESSION_COOKIE = "gs_session";

export interface SessionUser {
  id: number;
  twitchLogin: string;
  accessToken: string;
}

declare module "hono" {
  interface ContextVariableMap {
    sessionUser: SessionUser | null;
  }
}

export function sessionMiddleware(db: Database, oauthConfig: OAuthConfig): MiddlewareHandler {
  return async (c: Context, next) => {
    const sessionId = getCookie(c, SESSION_COOKIE);
    if (sessionId) {
      const user = await getUserFromSession(db, sessionId, oauthConfig);
      c.set("sessionUser", user ?? null);
    } else {
      c.set("sessionUser", null);
    }
    await next();
  };
}

export function requireAuth(c: Context): SessionUser | null {
  return c.get("sessionUser");
}

// Minimal cookie helpers (avoid dependency on hono/cookie for now)
export function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k?.trim() === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function setSessionCookie(c: Context, sessionId: string, ttlSeconds = 2592000): void {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  c.header(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires}`
  );
}

export function clearSessionCookie(c: Context): void {
  c.header("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
