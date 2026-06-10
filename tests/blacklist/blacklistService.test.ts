import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BlacklistService } from "../../src/blacklist/blacklistService";
import { openDatabase } from "../../src/db/database";
import type { Database } from "../../src/db/database";

let testDir: string;
let db: Database;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-blacklist-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  // Insert a dummy user so FK constraint is satisfied
  db.prepare(
    "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
  ).run("system", "system", "system", "", "", 0);
});

afterEach(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

const USER_ID = 1;

describe("BlacklistService", () => {
  it("starts empty", () => {
    const service = new BlacklistService(db, USER_ID);
    expect(service.list()).toEqual([]);
  });

  it("blocks a user", () => {
    const service = new BlacklistService(db, USER_ID);
    service.block("Alice");
    expect(service.isBlocked("alice")).toBe(true);
  });

  it("is case-insensitive", () => {
    const service = new BlacklistService(db, USER_ID);
    service.block("ALICE");
    expect(service.isBlocked("alice")).toBe(true);
    expect(service.isBlocked("ALICE")).toBe(true);
  });

  it("unblocks a user and returns true", () => {
    const service = new BlacklistService(db, USER_ID);
    service.block("alice");
    const result = service.unblock("alice");
    expect(result).toBe(true);
    expect(service.isBlocked("alice")).toBe(false);
  });

  it("returns false when unblocking unknown user", () => {
    const service = new BlacklistService(db, USER_ID);
    expect(service.unblock("nobody")).toBe(false);
  });

  it("lists blocked users sorted", () => {
    const service = new BlacklistService(db, USER_ID);
    service.block("charlie");
    service.block("alice");
    service.block("bob");
    expect(service.list()).toEqual(["alice", "bob", "charlie"]);
  });

  it("persists across instances using same DB", () => {
    const s1 = new BlacklistService(db, USER_ID);
    s1.block("alice");
    s1.block("bob");

    const s2 = new BlacklistService(db, USER_ID);
    expect(s2.isBlocked("alice")).toBe(true);
    expect(s2.isBlocked("bob")).toBe(true);
  });

  it("persists unblock across instances using same DB", () => {
    const s1 = new BlacklistService(db, USER_ID);
    s1.block("alice");
    s1.unblock("alice");

    const s2 = new BlacklistService(db, USER_ID);
    expect(s2.isBlocked("alice")).toBe(false);
  });
});
