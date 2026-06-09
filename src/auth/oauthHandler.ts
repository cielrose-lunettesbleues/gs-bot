import {
  type Database,
  createSession,
  deleteSession,
  getSession,
  getUserById,
  updateUserTokens,
  upsertUser
} from "../db/database";

const SCOPES = "chat:read chat:edit channel:read:redemptions user:read:email";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_VALIDATE_URL = "https://id.twitch.tv/oauth2/validate";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
}

export interface TwitchUserInfo {
  id: string;
  login: string;
  displayName: string;
}

// ─── Auth URL ─────────────────────────────────────────────────────────────────

export function buildAuthUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    force_verify: "false"
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

// ─── Exchange code for tokens ─────────────────────────────────────────────────

export async function exchangeCode(config: OAuthConfig, code: string): Promise<TwitchTokens> {
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    })
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in
  };
}

// ─── Refresh access token ─────────────────────────────────────────────────────

export async function refreshAccessToken(config: OAuthConfig, refreshToken: string): Promise<TwitchTokens> {
  const res = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in
  };
}

// ─── Fetch user info ──────────────────────────────────────────────────────────

export async function fetchUserInfo(accessToken: string, clientId: string): Promise<TwitchUserInfo> {
  const res = await fetch(TWITCH_USERS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId
    }
  });
  if (!res.ok) throw new Error(`Helix /users failed: ${res.status}`);
  const data = await res.json() as {
    data: Array<{ id: string; login: string; display_name: string }>;
  };
  const user = data.data[0];
  if (!user) throw new Error("No user data from Twitch API");
  return { id: user.id, login: user.login, displayName: user.display_name };
}

// ─── Validate token ───────────────────────────────────────────────────────────

export async function validateToken(accessToken: string): Promise<boolean> {
  const res = await fetch(TWITCH_VALIDATE_URL, {
    headers: { Authorization: `OAuth ${accessToken}` }
  });
  return res.ok;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export { createSession, deleteSession, getSession, getUserById, updateUserTokens, upsertUser };

// ─── Get user and auto-refresh token if needed ────────────────────────────────

export async function getUserFromSession(
  db: Database,
  sessionId: string,
  oauthConfig: OAuthConfig
): Promise<{ id: number; twitchLogin: string; accessToken: string } | null> {
  const session = getSession(db, sessionId);
  if (!session) return null;

  const user = getUserById(db, session.userId);
  if (!user) return null;

  const now = Math.floor(Date.now() / 1000);
  // Refresh if token expires within 5 minutes
  if (user.token_expires_at - now < 300) {
    try {
      const tokens = await refreshAccessToken(oauthConfig, user.refresh_token);
      updateUserTokens(db, user.id, tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
      return { id: user.id, twitchLogin: user.twitch_login, accessToken: tokens.accessToken };
    } catch {
      return null;
    }
  }

  return { id: user.id, twitchLogin: user.twitch_login, accessToken: user.access_token };
}
