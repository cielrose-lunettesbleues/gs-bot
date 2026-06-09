import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YoutubeDurationValidator } from "../../src/validation/youtubeDurationValidator";

const config = { apiKey: "test-key", maxDurationSeconds: 120 };

function mockFetch(durationIso: string | null, status = 200) {
  const body =
    durationIso === null
      ? { items: [] }
      : { items: [{ contentDetails: { duration: durationIso } }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status === 200,
      json: async () => body
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YoutubeDurationValidator — URL detection", () => {
  it("skips non-YouTube URLs", async () => {
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://streamable.com/abc");
    expect(result.allowed).toBe(true);
    // fetch should not be called
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  });

  it("handles youtu.be short links", async () => {
    mockFetch("PT1M30S");
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/dQw4w9WgXcQ");
    expect(result.allowed).toBe(true);
    expect(result.durationSeconds).toBe(90);
  });

  it("handles youtube.com/watch?v= links", async () => {
    mockFetch("PT2M0S");
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.allowed).toBe(true);
    expect(result.durationSeconds).toBe(120);
  });

  it("handles youtube.com/shorts/ links", async () => {
    mockFetch("PT30S");
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://www.youtube.com/shorts/abc123");
    expect(result.allowed).toBe(true);
  });
});

describe("YoutubeDurationValidator — duration parsing", () => {
  it("allows video within limit", async () => {
    mockFetch("PT1M59S"); // 119s
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(true);
    expect(result.durationSeconds).toBe(119);
  });

  it("allows video exactly at limit", async () => {
    mockFetch("PT2M0S"); // 120s
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(true);
  });

  it("rejects video exceeding limit", async () => {
    mockFetch("PT2M1S"); // 121s
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("too_long");
    expect(result.durationSeconds).toBe(121);
  });

  it("parses hours correctly", async () => {
    mockFetch("PT1H30M0S"); // 5400s
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(false);
    expect(result.durationSeconds).toBe(5400);
  });
});

describe("YoutubeDurationValidator — error handling", () => {
  it("fails open on API error (non-200)", async () => {
    mockFetch("PT1M", 500);
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(true);
  });

  it("fails open on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network error"); }));
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(true);
  });

  it("rejects video not found (empty items)", async () => {
    mockFetch(null);
    const validator = new YoutubeDurationValidator(config);
    const result = await validator.check("https://youtu.be/abc");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("video_not_found");
  });
});
