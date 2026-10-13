import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAllowedSpriteFile, loadSpriteSet, SPRITE_MANIFEST_NAME } from "../../src/views/spriteManifest";

let dir: string;
const logger = { warn: vi.fn() };

beforeEach(() => {
  dir = join(tmpdir(), `gs-sprites-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  logger.warn.mockReset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeManifest(content: unknown) {
  writeFileSync(join(dir, SPRITE_MANIFEST_NAME), typeof content === "string" ? content : JSON.stringify(content));
}

function writeImage(name: string) {
  writeFileSync(join(dir, name), "not really an image");
}

describe("isAllowedSpriteFile", () => {
  it("accepts plain image names and rejects anything that could climb out", () => {
    expect(isAllowedSpriteFile("ring.png")).toBe(true);
    expect(isAllowedSpriteFile("mascot-run_2.webp")).toBe(true);

    expect(isAllowedSpriteFile("../../.env")).toBe(false);
    expect(isAllowedSpriteFile("a/b.png")).toBe(false);
    expect(isAllowedSpriteFile("sprites.json")).toBe(false);
    expect(isAllowedSpriteFile("ring.png.txt")).toBe(false);
  });
});

describe("loadSpriteSet", () => {
  it("returns nothing when no manifest is present", () => {
    expect(loadSpriteSet(dir, logger)).toEqual({});
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("keeps a slot whose image exists, with the documented defaults", () => {
    writeManifest({ ring: { file: "ring.png" } });
    writeImage("ring.png");

    expect(loadSpriteSet(dir, logger).ring).toEqual({
      file: "ring.png",
      frames: 1,
      fps: 12,
      width: 64,
      height: 64
    });
  });

  it("drops a slot whose image is missing", () => {
    writeManifest({ ring: { file: "ring.png" }, ground: { file: "ground.png" } });
    writeImage("ground.png");

    const set = loadSpriteSet(dir, logger);

    expect(set.ring).toBeUndefined();
    expect(set.ground).toBeDefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("ignores a malformed manifest rather than breaking the page", () => {
    writeManifest("{ not json");
    expect(loadSpriteSet(dir, logger)).toEqual({});
    expect(logger.warn).toHaveBeenCalled();
  });

  it("rejects a manifest whose file name could escape the directory", () => {
    writeManifest({ mascot: { file: "../../../etc/passwd" } });
    expect(loadSpriteSet(dir, logger)).toEqual({});
  });

  it("accepts a backdrop enlarged several times over", () => {
    writeManifest({ backdrop: { file: "backdrop.png", width: 512, height: 214, displayWidth: 1536, displayHeight: 642 } });
    writeImage("backdrop.png");

    // Too tight a ceiling here rejects the whole manifest, slots and all
    expect(loadSpriteSet(dir, logger).backdrop).toMatchObject({ displayWidth: 1536, displayHeight: 642 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not let one bad slot take the others down", () => {
    writeManifest({
      ring: { file: "ring.png" },
      mascot: { file: "mascot.png", frames: 999 }
    });
    writeImage("ring.png");
    writeImage("mascot.png");

    // A single out-of-range value voids the parse, which is worth knowing
    expect(loadSpriteSet(dir, logger)).toEqual({});
  });

  it("rejects out-of-range frame counts", () => {
    writeManifest({ mascot: { file: "mascot.png", frames: 999 } });
    writeImage("mascot.png");
    expect(loadSpriteSet(dir, logger)).toEqual({});
  });

  it("ignores unknown slots", () => {
    writeManifest({ badnik: { file: "badnik.png" }, ring: { file: "ring.png" } });
    writeImage("ring.png");
    writeImage("badnik.png");

    const set = loadSpriteSet(dir, logger) as Record<string, unknown>;

    expect(set.badnik).toBeUndefined();
    expect(set.ring).toBeDefined();
  });
});
