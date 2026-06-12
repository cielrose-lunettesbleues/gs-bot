import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../src/db/database";
import type { Database } from "../../src/db/database";
import { insertTtsVoice } from "../../src/db/database";
import { TtsService, NullTtsService } from "../../src/tts/ttsService";
import type { ITtsProvider } from "../../src/tts/elevenLabsProvider";

let testDir: string;
let db: Database;
const TENANT_ID = 1;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeProvider(buf: Buffer = Buffer.from("audio")): ITtsProvider {
  return {
    synthesize: vi.fn(async () => ({ audioBuffer: buf, mimeType: "audio/mpeg" }))
  };
}

beforeEach(() => {
  testDir = join(tmpdir(), `gs-tts-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  db = openDatabase(testDir);
  db.prepare(
    "INSERT INTO users (twitch_id, twitch_login, twitch_display_name, access_token, refresh_token, token_expires_at) VALUES (?,?,?,?,?,?)"
  ).run("u1", "streamer", "Streamer", "", "", 0);
});

afterEach(() => {
  db.close();
  rmSync(testDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("NullTtsService", () => {
  it("is always disabled", () => {
    const svc = new NullTtsService();
    expect(svc.isEnabled()).toBe(false);
  });

  it("synthesize returns null", async () => {
    expect(await new NullTtsService().synthesize("hello", "voice")).toBeNull();
  });

  it("getAudio returns null", () => {
    expect(new NullTtsService().getAudio("any")).toBeNull();
  });
});

describe("TtsService.isEnabled", () => {
  it("disabled when config.enabled is false", () => {
    const svc = new TtsService(db, TENANT_ID, makeProvider(), { enabled: false, maxLength: 200, volume: 1 }, logger);
    expect(svc.isEnabled()).toBe(false);
  });

  it("disabled when provider is null", () => {
    const svc = new TtsService(db, TENANT_ID, null, { enabled: true, maxLength: 200, volume: 1 }, logger);
    expect(svc.isEnabled()).toBe(false);
  });

  it("enabled when provider set and config enabled", () => {
    const svc = new TtsService(db, TENANT_ID, makeProvider(), { enabled: true, maxLength: 200, volume: 1 }, logger);
    expect(svc.isEnabled()).toBe(true);
  });
});

describe("TtsService.synthesize", () => {
  it("returns null when disabled", async () => {
    const svc = new TtsService(db, TENANT_ID, makeProvider(), { enabled: false, maxLength: 200, volume: 1 }, logger);
    expect(await svc.synthesize("hello", "voice")).toBeNull();
  });

  it("returns null when no voices configured", async () => {
    const svc = new TtsService(db, TENANT_ID, makeProvider(), { enabled: true, maxLength: 200, volume: 1 }, logger);
    expect(await svc.synthesize("hello", "voice")).toBeNull();
  });

  it("returns audioId and durationSeconds on success", async () => {
    insertTtsVoice(db, TENANT_ID, { label: "Césaire", provider: "elevenlabs", voice_id: "v-123", is_default: true, aliases: [] });
    const svc = new TtsService(db, TENANT_ID, makeProvider(), { enabled: true, maxLength: 200, volume: 1 }, logger);

    const result = await svc.synthesize("bonjour", "cesaire");
    expect(result).not.toBeNull();
    expect(typeof result!.audioId).toBe("string");
    expect(result!.durationSeconds).toBeGreaterThan(0);
  });

  it("truncates text to maxLength", async () => {
    insertTtsVoice(db, TENANT_ID, { label: "Sett", provider: "elevenlabs", voice_id: "v-sett", is_default: true, aliases: [] });
    const provider = makeProvider();
    const svc = new TtsService(db, TENANT_ID, provider, { enabled: true, maxLength: 5, volume: 1 }, logger);

    await svc.synthesize("hello world", "sett");
    expect((provider.synthesize as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("hello");
  });

  it("stores audio retrievable by getAudio", async () => {
    insertTtsVoice(db, TENANT_ID, { label: "Jett", provider: "elevenlabs", voice_id: "v-jett", is_default: true, aliases: [] });
    const buf = Buffer.from("mp3data");
    const svc = new TtsService(db, TENANT_ID, makeProvider(buf), { enabled: true, maxLength: 200, volume: 1 }, logger);

    const result = await svc.synthesize("test", "jett");
    const audio = svc.getAudio(result!.audioId);
    expect(audio).not.toBeNull();
    expect(audio!.buffer).toEqual(buf);
    expect(audio!.mimeType).toBe("audio/mpeg");
  });

  it("returns null when provider fails", async () => {
    insertTtsVoice(db, TENANT_ID, { label: "Err", provider: "elevenlabs", voice_id: "v-err", is_default: true, aliases: [] });
    const failProvider: ITtsProvider = { synthesize: async () => null };
    const svc = new TtsService(db, TENANT_ID, failProvider, { enabled: true, maxLength: 200, volume: 1 }, logger);

    expect(await svc.synthesize("boom", "err")).toBeNull();
  });
});

describe("TtsService.getVoices", () => {
  it("reads voices from DB", () => {
    insertTtsVoice(db, TENANT_ID, { label: "A", provider: "elevenlabs", voice_id: "va", is_default: false, aliases: ["aa"] });
    insertTtsVoice(db, TENANT_ID, { label: "B", provider: "elevenlabs", voice_id: "vb", is_default: true, aliases: [] });
    const svc = new TtsService(db, TENANT_ID, null, { enabled: false, maxLength: 200, volume: 1 }, logger);
    const voices = svc.getVoices();
    expect(voices).toHaveLength(2);
    expect(voices[0].label).toBe("A");
    expect(voices[0].aliases).toEqual(["aa"]);
    expect(voices[1].isDefault).toBe(true);
  });
});
