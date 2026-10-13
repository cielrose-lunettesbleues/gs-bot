import fs from "fs";
import path from "path";
import { z } from "zod";

// Optional sprite slots for the viewer page. Every slot is opt-in: when a file
// is absent the page keeps the CSS-drawn artwork, so removing third-party
// artwork is a matter of deleting files, with no code change.
const SPRITE_FILE_RE = /^[A-Za-z0-9_-]+\.(png|gif|webp|jpe?g)$/i;

const spriteSchema = z.object({
  file: z.string().trim().regex(SPRITE_FILE_RE),
  /** Horizontal sprite sheet: number of frames side by side. 1 = still image. */
  frames: z.number().int().min(1).max(64).default(1),
  fps: z.number().int().min(1).max(60).default(12),
  /** Size of one frame in the file. */
  width: z.number().int().min(1).max(1024).default(64),
  height: z.number().int().min(1).max(1024).default(64),
  /**
   * Size on the page, when it should differ from the file. The sheet is scaled
   * as a whole and the frame step follows, so the animation stays in register.
   */
  displayWidth: z.number().int().min(1).max(1024).optional(),
  displayHeight: z.number().int().min(1).max(1024).optional()
});

const manifestSchema = z.object({
  mascot: spriteSchema.optional(),
  /** Flies alongside the mascot, at its own pace. */
  sidekick: spriteSchema.optional(),
  ring: spriteSchema.optional(),
  ground: spriteSchema.optional()
});

export type SpriteDefinition = z.infer<typeof spriteSchema>;
export type SpriteSet = z.infer<typeof manifestSchema>;

export const SPRITE_MANIFEST_NAME = "sprites.json";

export function isAllowedSpriteFile(name: string): boolean {
  return SPRITE_FILE_RE.test(name);
}

interface SimpleLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

/**
 * Reads <dir>/sprites.json and keeps only the slots whose image is actually
 * present. Any problem yields an empty set rather than an error: a missing or
 * malformed manifest must never keep the page from rendering.
 */
export function loadSpriteSet(dir: string, log?: SimpleLogger): SpriteSet {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, SPRITE_MANIFEST_NAME), "utf-8");
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    log?.warn({ dir }, "Sprite manifest is not valid JSON, ignoring it");
    return {};
  }

  const result = manifestSchema.safeParse(parsed);
  if (!result.success) {
    log?.warn({ dir, issues: result.error.issues.length }, "Sprite manifest rejected, ignoring it");
    return {};
  }

  const kept: SpriteSet = {};
  for (const [slot, definition] of Object.entries(result.data)) {
    if (!definition) continue;
    if (!fs.existsSync(path.join(dir, definition.file))) {
      log?.warn({ slot, file: definition.file }, "Sprite file listed in the manifest is missing");
      continue;
    }
    kept[slot as keyof SpriteSet] = definition;
  }
  return kept;
}
