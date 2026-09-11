import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureFreshAccessToken } from "../../src/auth/oauthHandler";
import { getUserById, openDatabase, upsertUser } from "../../src/db/database";
import type { Database } from "../../src/db/database";

const oauthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://example.com/auth/twitch/callback"
};

let testDir: string;
let db: Database;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-oauth-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
});

afterEach(() => {
  vi.unstubAllGlobals();
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

function insertUser(tokenExpiresAt: number) {
  return upsertUser(db, {
    twitch_id: "1",
    twitch_login: "streamer",
    twitch_display_name: "Streamer",
    access_token: "old-access",
    refresh_token: "old-refresh",
    token_expires_at: tokenExpiresAt
  });
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe("ensureFreshAccessToken", () => {
  it("returns the stored token while it is still valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = insertUser(nowSeconds() + 3600);

    expect(await ensureFreshAccessToken(db, user.id, oauthConfig)).toBe("old-access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes and persists an expired token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 14400 }),
      { status: 200 }
    )));
    const user = insertUser(nowSeconds() - 3600);

    expect(await ensureFreshAccessToken(db, user.id, oauthConfig)).toBe("new-access");
    const stored = getUserById(db, user.id);
    expect(stored?.access_token).toBe("new-access");
    expect(stored?.refresh_token).toBe("new-refresh");
  });

  it("returns null when Twitch rejects the refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 400 })));
    const user = insertUser(nowSeconds() - 3600);

    expect(await ensureFreshAccessToken(db, user.id, oauthConfig)).toBeNull();
  });
});
