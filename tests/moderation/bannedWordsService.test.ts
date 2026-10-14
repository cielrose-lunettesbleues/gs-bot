import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/db/database";
import type { Database } from "../../src/db/database";
import { BannedWordsService, normaliseText } from "../../src/moderation/bannedWordsService";

let testDir: string;
let db: Database;
let service: BannedWordsService;

const USER_ID = 1;

beforeEach(() => {
  testDir = join(tmpdir(), `gs-banwords-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  db.prepare(
    "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
  ).run("1", "streamer", "Streamer", "", "", 0);
  service = new BannedWordsService(db, USER_ID);
});

afterEach(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
});

describe("normaliseText", () => {
  it("brings case, accents and spacing to a common form", () => {
    expect(normaliseText("  CÔNNERIE   grave ")).toBe("connerie grave");
    expect(normaliseText("Éléphant")).toBe("elephant");
  });
});

describe("BannedWordsService", () => {
  it("finds nothing in an empty list", () => {
    expect(service.find("un texte quelconque")).toBeNull();
  });

  it("catches a word whatever its case or accents", () => {
    service.add("Connerie");

    expect(service.find("quelle CONNERIE")).toBe("connerie");
    expect(service.find("quelle cônnerie")).toBe("connerie");
    expect(service.find("rien de mal ici")).toBeNull();
  });

  it("catches a word inside a longer one, plurals included", () => {
    service.add("insulte");
    expect(service.find("des insultes partout")).toBe("insulte");
  });

  it("accepts an expression of several words", () => {
    service.add("sale type");

    expect(service.find("espèce de sale type")).toBe("sale type");
    // Spacing is normalised on both sides, so an odd gap still matches
    expect(service.find("espèce de  sale   type")).toBe("sale type");
  });

  it("stores a word once, however it is typed", () => {
    expect(service.add("Déchet")).toBe(true);
    expect(service.add("dechet")).toBe(false);
    expect(service.list()).toEqual(["dechet"]);
  });

  it("removes a word whatever its case", () => {
    service.add("merde");

    expect(service.remove("MERDE")).toBe(true);
    expect(service.find("merde alors")).toBeNull();
    expect(service.remove("merde")).toBe(false);
  });

  it("refuses an empty word rather than banning everything", () => {
    expect(service.add("   ")).toBe(false);
    expect(service.list()).toEqual([]);
    // A blank entry would match every text ever submitted
    expect(service.find("texte innocent")).toBeNull();
  });

  it("keeps each streamer's list to themselves", () => {
    db.prepare(
      "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
    ).run("2", "other", "Other", "", "", 0);
    const other = new BannedWordsService(db, 2);

    service.add("interdit");

    expect(other.find("mot interdit")).toBeNull();
    expect(other.list()).toEqual([]);
  });
});
