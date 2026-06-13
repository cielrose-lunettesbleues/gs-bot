import type { Context } from "hono";
import crypto from "crypto";

function forwardedProto(c: Context): string | null {
  const raw = c.req.header("x-forwarded-proto");
  return raw ? raw.split(",")[0].trim().toLowerCase() : null;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isSecureRequest(c: Context): boolean {
  const proto = forwardedProto(c);
  if (proto) return proto === "https";
  return new URL(c.req.url).protocol === "https:";
}

export function getRequestOrigin(c: Context): string {
  const proto = forwardedProto(c) ?? new URL(c.req.url).protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
  return `${proto}://${host}`;
}

export function verifySameOrigin(c: Context): boolean {
  const expectedOrigin = getRequestOrigin(c);
  const origin = c.req.header("origin");
  if (origin) return origin === expectedOrigin;

  const referer = c.req.header("referer");
  if (!referer) return false;

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function isLocalRequest(c: Context): boolean {
  const forwardedFor = c.req.header("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0].trim() ?? "";
  if (["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(clientIp)) return true;

  const host = (c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "").toLowerCase();
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

function sign(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

export function createScopedToken(secret: string, scope: string, subject: string): string {
  return sign(secret, `${scope}:${subject}`);
}

export function verifyScopedToken(secret: string, scope: string, subject: string, token: string): boolean {
  const expected = createScopedToken(secret, scope, subject);
  return safeEqual(expected, token);
}
