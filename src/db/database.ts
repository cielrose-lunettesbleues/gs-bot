import BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import path from "path";

export type Database = BetterSqlite3.Database;

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  twitch_id           TEXT    UNIQUE NOT NULL,
  twitch_login        TEXT    NOT NULL,
  twitch_display_name TEXT    NOT NULL,
  access_token        TEXT    NOT NULL,
  refresh_token       TEXT    NOT NULL,
  token_expires_at    INTEGER NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tenant_configs (
  user_id                    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sub_only                   INTEGER NOT NULL DEFAULT 0,
  mod_only                   INTEGER NOT NULL DEFAULT 0,
  cooldown_enabled           INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds           INTEGER NOT NULL DEFAULT 60,
  cooldown_per_user          INTEGER NOT NULL DEFAULT 0,
  cooldown_per_user_seconds  INTEGER NOT NULL DEFAULT 30,
  approval_enabled           INTEGER NOT NULL DEFAULT 0,
  approval_timeout_seconds   INTEGER NOT NULL DEFAULT 60,
  queue_mode                 TEXT    NOT NULL DEFAULT 'queue',
  queue_max_size             INTEGER NOT NULL DEFAULT 3,
  duration_seconds           INTEGER NOT NULL DEFAULT 30,
  chat_feedback              INTEGER NOT NULL DEFAULT 1,
  allowed_domains            TEXT    NOT NULL DEFAULT 'youtube.com,youtu.be,streamable.com,tenor.com,giphy.com,klipy.com,tiktok.com',
  allow_direct_files         INTEGER NOT NULL DEFAULT 1,
  allowed_file_extensions    TEXT    NOT NULL DEFAULT '.mp4,.webm,.mov',
  max_video_duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url              TEXT    NOT NULL,
  username         TEXT    NOT NULL,
  duration_seconds INTEGER NOT NULL,
  played_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, played_at DESC);

CREATE TABLE IF NOT EXISTS blacklist (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_username TEXT    NOT NULL,
  PRIMARY KEY (user_id, blocked_username)
);
`;

const MIGRATIONS = [
  // Add klipy.com and tiktok.com to existing tenant rows that predate these domains
  `UPDATE tenant_configs SET allowed_domains = allowed_domains || ',klipy.com'  WHERE allowed_domains NOT LIKE '%klipy.com%'`,
  `UPDATE tenant_configs SET allowed_domains = allowed_domains || ',tiktok.com' WHERE allowed_domains NOT LIKE '%tiktok.com%'`,
];

export function openDatabase(dataDir: string): Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new BetterSqlite3(path.join(dataDir, "gs.sqlite"));
  db.exec(SCHEMA);
  for (const sql of MIGRATIONS) db.prepare(sql).run();
  return db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  twitch_id: string;
  twitch_login: string;
  twitch_display_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  created_at: number;
  last_seen_at: number;
}

export function upsertUser(
  db: Database,
  data: Omit<DbUser, "id" | "created_at" | "last_seen_at">
): DbUser {
  db.prepare(`
    INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at)
    VALUES (@twitch_id, @twitch_login, @twitch_display_name, @access_token, @refresh_token, @token_expires_at)
    ON CONFLICT(twitch_id) DO UPDATE SET
      twitch_login        = excluded.twitch_login,
      twitch_display_name = excluded.twitch_display_name,
      access_token        = excluded.access_token,
      refresh_token       = excluded.refresh_token,
      token_expires_at    = excluded.token_expires_at,
      last_seen_at        = unixepoch()
  `).run(data);
  return db.prepare("SELECT * FROM users WHERE twitch_id = ?").get(data.twitch_id) as DbUser;
}

export function getUserById(db: Database, id: number): DbUser | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function getUserByLogin(db: Database, login: string): DbUser | undefined {
  return db.prepare("SELECT * FROM users WHERE twitch_login = ?").get(login) as DbUser | undefined;
}

export function updateUserTokens(
  db: Database,
  userId: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): void {
  db.prepare(`
    UPDATE users SET access_token=?, refresh_token=?, token_expires_at=?, last_seen_at=unixepoch()
    WHERE id=?
  `).run(accessToken, refreshToken, expiresAt, userId);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(db: Database, sessionId: string, userId: number, ttlSeconds = 2592000): void {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(sessionId, userId, expiresAt);
}

export function getSession(db: Database, sessionId: string): { userId: number } | undefined {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare("SELECT user_id FROM sessions WHERE id=? AND expires_at>?").get(sessionId, now) as
    | { user_id: number }
    | undefined;
  return row ? { userId: row.user_id } : undefined;
}

export function deleteSession(db: Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId);
}

export function purgeExpiredSessions(db: Database): void {
  db.prepare("DELETE FROM sessions WHERE expires_at<=unixepoch()").run();
}

// ─── Tenant config ────────────────────────────────────────────────────────────

export interface DbTenantConfig {
  user_id: number;
  sub_only: number;
  mod_only: number;
  cooldown_enabled: number;
  cooldown_seconds: number;
  cooldown_per_user: number;
  cooldown_per_user_seconds: number;
  approval_enabled: number;
  approval_timeout_seconds: number;
  queue_mode: string;
  queue_max_size: number;
  duration_seconds: number;
  chat_feedback: number;
  allowed_domains: string;
  allow_direct_files: number;
  allowed_file_extensions: string;
  max_video_duration_seconds: number;
}

export function getTenantConfig(db: Database, userId: number): DbTenantConfig {
  db.prepare("INSERT OR IGNORE INTO tenant_configs (user_id) VALUES (?)").run(userId);
  return db.prepare("SELECT * FROM tenant_configs WHERE user_id=?").get(userId) as DbTenantConfig;
}

export function updateTenantConfig(db: Database, userId: number, patch: Partial<DbTenantConfig>): void {
  const fields = Object.keys(patch)
    .filter((k) => k !== "user_id")
    .map((k) => `${k}=@${k}`)
    .join(", ");
  if (!fields) return;
  db.prepare(`UPDATE tenant_configs SET ${fields} WHERE user_id=@user_id`).run({ ...patch, user_id: userId });
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface DbHistoryEntry {
  id: number;
  user_id: number;
  url: string;
  username: string;
  duration_seconds: number;
  played_at: number;
}

export function insertHistory(
  db: Database,
  userId: number,
  entry: { url: string; username: string; durationSeconds: number }
): void {
  db.prepare("INSERT INTO history (user_id, url, username, duration_seconds) VALUES (?,?,?,?)")
    .run(userId, entry.url, entry.username, entry.durationSeconds);
}

export function getHistory(db: Database, userId: number, limit: number): DbHistoryEntry[] {
  return db.prepare("SELECT * FROM history WHERE user_id=? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as DbHistoryEntry[];
}

// ─── Blacklist ─────────────────────────────────────────────────────────────────

export function isBlocked(db: Database, userId: number, username: string): boolean {
  return !!db.prepare("SELECT 1 FROM blacklist WHERE user_id=? AND blocked_username=?")
    .get(userId, username.toLowerCase());
}

export function blockUser(db: Database, userId: number, username: string): boolean {
  try {
    db.prepare("INSERT INTO blacklist (user_id, blocked_username) VALUES (?,?)").run(userId, username.toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export function unblockUser(db: Database, userId: number, username: string): boolean {
  const result = db.prepare("DELETE FROM blacklist WHERE user_id=? AND blocked_username=?")
    .run(userId, username.toLowerCase());
  return result.changes > 0;
}

export function listBlocked(db: Database, userId: number): string[] {
  return (db.prepare("SELECT blocked_username FROM blacklist WHERE user_id=? ORDER BY blocked_username").all(userId) as
    Array<{ blocked_username: string }>).map((r) => r.blocked_username);
}
