import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/db/database";
import type { Database } from "../../src/db/database";
import { createLogger } from "../../src/logger/logger";
import { TenantManager } from "../../src/tenant/tenantManager";

let testDir: string;
let db: Database;
let manager: TenantManager;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-tenant-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  // Empty access token so no Twitch bot is started
  db.prepare(
    "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
  ).run("1", "streamer", "Streamer", "", "", 0);
  manager = new TenantManager(db, createLogger("silent"));
});

afterEach(async () => {
  await manager.stopAll();
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

const USER_ID = 1;

describe("TenantManager", () => {
  it("closes the overlay broadcaster when a tenant stops", async () => {
    const tenant = manager.getOrCreate(USER_ID);
    const onClose = vi.fn();
    tenant.overlayBroadcaster.onClose(onClose);

    await manager.stop(USER_ID);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(manager.get(USER_ID)).toBeUndefined();
  });

  it("gives a restarted tenant a fresh broadcaster", async () => {
    const first = manager.getOrCreate(USER_ID).overlayBroadcaster;
    await manager.stop(USER_ID);

    const second = manager.getOrCreate(USER_ID).overlayBroadcaster;

    expect(second).not.toBe(first);
    expect(second.isClosed()).toBe(false);
  });
});
