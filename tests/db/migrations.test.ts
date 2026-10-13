import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTenantConfig, openDatabase, rotateWebToken } from "../../src/db/database";
import type { Database } from "../../src/db/database";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-migrations-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const DOMAINS_BEFORE_INSTAGRAM =
  "youtube.com,youtu.be,streamable.com,tenor.com,giphy.com,klipy.com,tiktok.com";

function insertTenant(db: Database) {
  db.prepare(
    "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
  ).run("1", "streamer", "Streamer", "", "", 0);
  db.prepare("INSERT INTO tenant_configs (user_id) VALUES (1)").run();
}

function readDomains(db: Database): string {
  const row = db.prepare("SELECT allowed_domains FROM tenant_configs WHERE user_id=1").get() as {
    allowed_domains: string;
  };
  return row.allowed_domains;
}

describe("allowed_domains migrations", () => {
  it("gives a new tenant instagram.com by default", () => {
    const db = openDatabase(testDir);
    insertTenant(db);
    const domains = readDomains(db);
    db.close();

    expect(domains).toContain("instagram.com");
  });

  it("adds instagram.com to a tenant row that predates it", () => {
    const first = openDatabase(testDir);
    insertTenant(first);
    // Roll the row back to the domain list that shipped before Instagram support
    first.prepare("UPDATE tenant_configs SET allowed_domains=? WHERE user_id=1").run(
      DOMAINS_BEFORE_INSTAGRAM
    );
    first.close();

    const reopened = openDatabase(testDir);
    const domains = readDomains(reopened);
    reopened.close();

    expect(domains).toContain("instagram.com");
    expect(domains.match(/tiktok\.com/g)).toHaveLength(1);
  });

  it("gives an existing tenant row the viewer page columns", () => {
    const first = openDatabase(testDir);
    insertTenant(first);
    const config = getTenantConfig(first, 1);
    first.close();

    expect(config.web_submit_enabled).toBe(1);
    expect(config.web_guest_enabled).toBe(1);
    expect(config.web_token).toMatch(/^[0-9a-f]{48}$/);
  });

  it("mints a web token on first read and keeps it stable", () => {
    const db = openDatabase(testDir);
    insertTenant(db);

    const first = getTenantConfig(db, 1).web_token;
    const second = getTenantConfig(db, 1).web_token;
    db.close();

    expect(first).toBe(second);
  });

  it("rotating the web token leaves the overlay token alone", () => {
    const db = openDatabase(testDir);
    insertTenant(db);
    const before = getTenantConfig(db, 1);

    const rotated = rotateWebToken(db, 1);
    const after = getTenantConfig(db, 1);
    db.close();

    expect(rotated).not.toBe(before.web_token);
    expect(after.web_token).toBe(rotated);
    expect(after.overlay_token).toBe(before.overlay_token);
  });

  it("does not duplicate instagram.com when reopened", () => {
    const first = openDatabase(testDir);
    insertTenant(first);
    first.close();

    const second = openDatabase(testDir);
    const domains = readDomains(second);
    second.close();

    expect(domains.match(/instagram\.com/g)).toHaveLength(1);
  });
});
