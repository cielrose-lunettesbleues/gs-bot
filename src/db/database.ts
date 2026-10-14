import BetterSqlite3 from "better-sqlite3";
import crypto from "crypto";
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
  allowed_domains            TEXT    NOT NULL DEFAULT 'youtube.com,youtu.be,streamable.com,tenor.com,giphy.com,klipy.com,tiktok.com,instagram.com',
  allow_direct_files         INTEGER NOT NULL DEFAULT 1,
  allowed_file_extensions    TEXT    NOT NULL DEFAULT '.mp4,.webm,.mov,.gif',
  max_video_duration_seconds INTEGER NOT NULL DEFAULT 0,
  overlay_token              TEXT    NOT NULL DEFAULT '',
  web_submit_enabled         INTEGER NOT NULL DEFAULT 1,
  web_guest_enabled          INTEGER NOT NULL DEFAULT 1,
  web_token                  TEXT    NOT NULL DEFAULT ''
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

-- Mots interdits dans les textes affichés ou lus à voix haute. Stockés
-- normalisés (minuscules, sans accents) pour que la comparaison le soit aussi.
CREATE TABLE IF NOT EXISTS banned_words (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word    TEXT    NOT NULL,
  PRIMARY KEY (user_id, word)
);

CREATE TABLE IF NOT EXISTS tenant_tts_voices (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label             TEXT    NOT NULL,
  provider          TEXT    NOT NULL DEFAULT 'elevenlabs',
  voice_id          TEXT    NOT NULL,
  is_default        INTEGER NOT NULL DEFAULT 0,
  aliases_json      TEXT    NOT NULL DEFAULT '[]',
  stability         REAL    NOT NULL DEFAULT 0.5,
  similarity_boost  REAL    NOT NULL DEFAULT 0.75,
  style             REAL    NOT NULL DEFAULT 0.0,
  use_speaker_boost INTEGER NOT NULL DEFAULT 1,
  speed             REAL    NOT NULL DEFAULT 1.0,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tts_voices_tenant ON tenant_tts_voices(tenant_id);

-- Viewers are the audience of the submit page. They are deliberately kept out
-- of "users", which means "streamer running a tenant": a viewer must never own
-- a tenant, a bot or a dashboard. No Twitch token is stored for them, only the
-- identity needed to attribute a submission.
CREATE TABLE IF NOT EXISTS viewers (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  twitch_id           TEXT    UNIQUE NOT NULL,
  twitch_login        TEXT    NOT NULL,
  twitch_display_name TEXT    NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS viewer_sessions (
  id         TEXT    PRIMARY KEY,
  viewer_id  INTEGER NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS viewer_favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer_id  INTEGER NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  label      TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (viewer_id, url)
);

CREATE INDEX IF NOT EXISTS idx_viewer_favorites ON viewer_favorites(viewer_id, created_at DESC);
`;

const MIGRATIONS = [
  // Add domains to existing tenant rows that predate them
  `UPDATE tenant_configs SET allowed_domains = allowed_domains || ',klipy.com'  WHERE allowed_domains NOT LIKE '%klipy.com%'`,
  `UPDATE tenant_configs SET allowed_domains = allowed_domains || ',tiktok.com' WHERE allowed_domains NOT LIKE '%tiktok.com%'`,
  `UPDATE tenant_configs SET allowed_domains = allowed_domains || ',instagram.com' WHERE allowed_domains NOT LIKE '%instagram.com%'`,
  // Les GIF choisis depuis la page viewers arrivent en lien direct vers un CDN
  `UPDATE tenant_configs SET allowed_file_extensions = allowed_file_extensions || ',.gif' WHERE allowed_file_extensions NOT LIKE '%.gif%'`,
];

// ALTER TABLE migrations — idempotent (errors silently ignored)
const COLUMN_MIGRATIONS = [
  `ALTER TABLE tenant_configs ADD COLUMN tts_enabled INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tenant_configs ADD COLUMN tts_provider TEXT NOT NULL DEFAULT 'elevenlabs'`,
  `ALTER TABLE tenant_configs ADD COLUMN tts_api_key TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenant_configs ADD COLUMN tts_volume REAL NOT NULL DEFAULT 1.0`,
  `ALTER TABLE tenant_configs ADD COLUMN tts_max_length INTEGER NOT NULL DEFAULT 200`,
  `ALTER TABLE tenant_configs ADD COLUMN tts_cooldown_seconds INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tenant_configs ADD COLUMN overlay_token TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE tenant_tts_voices ADD COLUMN stability REAL NOT NULL DEFAULT 0.5`,
  `ALTER TABLE tenant_tts_voices ADD COLUMN similarity_boost REAL NOT NULL DEFAULT 0.75`,
  `ALTER TABLE tenant_tts_voices ADD COLUMN style REAL NOT NULL DEFAULT 0.0`,
  `ALTER TABLE tenant_tts_voices ADD COLUMN use_speaker_boost INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tenant_tts_voices ADD COLUMN speed REAL NOT NULL DEFAULT 1.0`,
  `ALTER TABLE tenant_configs ADD COLUMN web_submit_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tenant_configs ADD COLUMN web_guest_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE tenant_configs ADD COLUMN web_token TEXT NOT NULL DEFAULT ''`,
];

export function openDatabase(dataDir: string): Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new BetterSqlite3(path.join(dataDir, "gs.sqlite"));
  db.exec(SCHEMA);
  for (const sql of MIGRATIONS) db.prepare(sql).run();
  for (const sql of COLUMN_MIGRATIONS) {
    try { db.prepare(sql).run(); } catch { /* column already exists */ }
  }
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

export function listUsers(db: Database): DbUser[] {
  return db.prepare("SELECT * FROM users ORDER BY id ASC").all() as DbUser[];
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
  tts_enabled: number;
  tts_provider: string;
  tts_api_key: string;
  tts_volume: number;
  tts_max_length: number;
  tts_cooldown_seconds: number;
  overlay_token: string;
  web_submit_enabled: number;
  web_guest_enabled: number;
  web_token: string;
}

function generatePublicToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function getTenantConfig(db: Database, userId: number): DbTenantConfig {
  db.prepare("INSERT OR IGNORE INTO tenant_configs (user_id) VALUES (?)").run(userId);
  const row = db.prepare("SELECT * FROM tenant_configs WHERE user_id=?").get(userId) as DbTenantConfig;
  if (row.overlay_token && row.web_token) return row;

  // Tokens are minted on first read, so a row created before a token existed
  // gets one without needing a dedicated migration.
  if (!row.overlay_token) {
    db.prepare("UPDATE tenant_configs SET overlay_token=? WHERE user_id=?").run(generatePublicToken(), userId);
  }
  if (!row.web_token) {
    db.prepare("UPDATE tenant_configs SET web_token=? WHERE user_id=?").run(generatePublicToken(), userId);
  }
  return db.prepare("SELECT * FROM tenant_configs WHERE user_id=?").get(userId) as DbTenantConfig;
}

export function rotateOverlayToken(db: Database, userId: number): string {
  const overlayToken = generatePublicToken();
  db.prepare("INSERT OR IGNORE INTO tenant_configs (user_id) VALUES (?)").run(userId);
  db.prepare("UPDATE tenant_configs SET overlay_token=? WHERE user_id=?").run(overlayToken, userId);
  return overlayToken;
}

export function rotateWebToken(db: Database, userId: number): string {
  const webToken = generatePublicToken();
  db.prepare("INSERT OR IGNORE INTO tenant_configs (user_id) VALUES (?)").run(userId);
  db.prepare("UPDATE tenant_configs SET web_token=? WHERE user_id=?").run(webToken, userId);
  return webToken;
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

// ─── Mots interdits ───────────────────────────────────────────────────────────

/** Le mot est attendu déjà normalisé par le service appelant. */
export function addBannedWord(db: Database, userId: number, word: string): boolean {
  try {
    db.prepare("INSERT INTO banned_words (user_id, word) VALUES (?,?)").run(userId, word);
    return true;
  } catch {
    return false;
  }
}

export function removeBannedWord(db: Database, userId: number, word: string): boolean {
  const result = db.prepare("DELETE FROM banned_words WHERE user_id=? AND word=?").run(userId, word);
  return result.changes > 0;
}

export function listBannedWords(db: Database, userId: number): string[] {
  return (db.prepare("SELECT word FROM banned_words WHERE user_id=? ORDER BY word").all(userId) as
    Array<{ word: string }>).map((r) => r.word);
}

// ─── TTS Voices ───────────────────────────────────────────────────────────────

export interface DbTtsVoice {
  id: number;
  tenant_id: number;
  label: string;
  provider: string;
  voice_id: string;
  is_default: number;
  aliases_json: string;
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: number;
  speed: number;
  created_at: number;
}

export function getTtsVoices(db: Database, tenantId: number): DbTtsVoice[] {
  return db.prepare("SELECT * FROM tenant_tts_voices WHERE tenant_id=? ORDER BY id ASC")
    .all(tenantId) as DbTtsVoice[];
}

export function insertTtsVoice(
  db: Database,
  tenantId: number,
  voice: {
    label: string;
    provider: string;
    voice_id: string;
    is_default: boolean;
    aliases: string[];
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  }
): DbTtsVoice {
  if (voice.is_default) {
    db.prepare("UPDATE tenant_tts_voices SET is_default=0 WHERE tenant_id=?").run(tenantId);
  }
  const result = db.prepare(`
    INSERT INTO tenant_tts_voices
      (tenant_id, label, provider, voice_id, is_default, aliases_json,
       stability, similarity_boost, style, use_speaker_boost, speed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenantId, voice.label, voice.provider, voice.voice_id, voice.is_default ? 1 : 0,
    JSON.stringify(voice.aliases),
    voice.stability ?? 0.5,
    voice.similarity_boost ?? 0.75,
    voice.style ?? 0.0,
    (voice.use_speaker_boost ?? true) ? 1 : 0,
    voice.speed ?? 1.0
  );
  return db.prepare("SELECT * FROM tenant_tts_voices WHERE id=?").get(result.lastInsertRowid) as DbTtsVoice;
}

export function updateTtsVoiceSettings(
  db: Database,
  id: number,
  tenantId: number,
  settings: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
    speed?: number;
  }
): boolean {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (settings.stability !== undefined) { fields.push("stability=?"); values.push(settings.stability); }
  if (settings.similarity_boost !== undefined) { fields.push("similarity_boost=?"); values.push(settings.similarity_boost); }
  if (settings.style !== undefined) { fields.push("style=?"); values.push(settings.style); }
  if (settings.use_speaker_boost !== undefined) { fields.push("use_speaker_boost=?"); values.push(settings.use_speaker_boost ? 1 : 0); }
  if (settings.speed !== undefined) { fields.push("speed=?"); values.push(settings.speed); }
  if (fields.length === 0) return false;
  values.push(id, tenantId);
  const result = db.prepare(`UPDATE tenant_tts_voices SET ${fields.join(",")} WHERE id=? AND tenant_id=?`).run(...values);
  return result.changes > 0;
}

export function deleteTtsVoice(db: Database, id: number, tenantId: number): boolean {
  const result = db.prepare("DELETE FROM tenant_tts_voices WHERE id=? AND tenant_id=?").run(id, tenantId);
  return result.changes > 0;
}

// ─── Viewers (submit page audience) ───────────────────────────────────────────

export interface DbViewer {
  id: number;
  twitch_id: string;
  twitch_login: string;
  twitch_display_name: string;
  created_at: number;
  last_seen_at: number;
}

export function upsertViewer(
  db: Database,
  data: { twitch_id: string; twitch_login: string; twitch_display_name: string }
): DbViewer {
  db.prepare(`
    INSERT INTO viewers (twitch_id, twitch_login, twitch_display_name)
    VALUES (@twitch_id, @twitch_login, @twitch_display_name)
    ON CONFLICT(twitch_id) DO UPDATE SET
      twitch_login        = excluded.twitch_login,
      twitch_display_name = excluded.twitch_display_name,
      last_seen_at        = unixepoch()
  `).run(data);
  return db.prepare("SELECT * FROM viewers WHERE twitch_id = ?").get(data.twitch_id) as DbViewer;
}

export function getViewerById(db: Database, id: number): DbViewer | undefined {
  return db.prepare("SELECT * FROM viewers WHERE id = ?").get(id) as DbViewer | undefined;
}

export function createViewerSession(db: Database, sessionId: string, viewerId: number, ttlSeconds = 2592000): void {
  db.prepare("INSERT INTO viewer_sessions (id, viewer_id, expires_at) VALUES (?,?,unixepoch()+?)")
    .run(sessionId, viewerId, ttlSeconds);
}

export function getViewerSession(db: Database, sessionId: string): { viewerId: number } | undefined {
  const row = db.prepare("SELECT viewer_id FROM viewer_sessions WHERE id=? AND expires_at>unixepoch()")
    .get(sessionId) as { viewer_id: number } | undefined;
  return row ? { viewerId: row.viewer_id } : undefined;
}

export function deleteViewerSession(db: Database, sessionId: string): void {
  db.prepare("DELETE FROM viewer_sessions WHERE id=?").run(sessionId);
}

export function purgeExpiredViewerSessions(db: Database): void {
  db.prepare("DELETE FROM viewer_sessions WHERE expires_at<=unixepoch()").run();
}

// ─── Viewer favorites ─────────────────────────────────────────────────────────

export interface DbViewerFavorite {
  id: number;
  viewer_id: number;
  url: string;
  label: string;
  created_at: number;
}

export function listFavorites(db: Database, viewerId: number, limit = 100): DbViewerFavorite[] {
  return db.prepare("SELECT * FROM viewer_favorites WHERE viewer_id=? ORDER BY id DESC LIMIT ?")
    .all(viewerId, limit) as DbViewerFavorite[];
}

export function countFavorites(db: Database, viewerId: number): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM viewer_favorites WHERE viewer_id=?").get(viewerId) as { n: number };
  return row.n;
}

/** Returns undefined when this url is already a favorite of this viewer. */
export function addFavorite(
  db: Database,
  viewerId: number,
  entry: { url: string; label: string }
): DbViewerFavorite | undefined {
  try {
    db.prepare("INSERT INTO viewer_favorites (viewer_id, url, label) VALUES (?,?,?)")
      .run(viewerId, entry.url, entry.label);
  } catch {
    return undefined;
  }
  return db.prepare("SELECT * FROM viewer_favorites WHERE viewer_id=? AND url=?")
    .get(viewerId, entry.url) as DbViewerFavorite;
}

export function deleteFavorite(db: Database, viewerId: number, favoriteId: number): boolean {
  const result = db.prepare("DELETE FROM viewer_favorites WHERE id=? AND viewer_id=?").run(favoriteId, viewerId);
  return result.changes > 0;
}
