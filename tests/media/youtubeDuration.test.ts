import { afterEach, describe, expect, it, vi } from "vitest";
import { clearYoutubeDurationCache, sociavaultYoutubeDuration } from "../../src/media/sociavaultClient";

const API_KEY = "sk_live_test";
const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const SHORT_LINK = "https://youtu.be/dQw4w9WgXcQ";

afterEach(() => {
  vi.unstubAllGlobals();
  clearYoutubeDurationCache();
});

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sociavaultYoutubeDuration", () => {
  it("returns the length in seconds, rounded up", async () => {
    stub({ data: { durationMs: 90400 } });
    expect(await sociavaultYoutubeDuration(WATCH, API_KEY)).toBe(91);
  });

  it("reads the duration through a second envelope", async () => {
    stub({ success: true, data: { success: true, data: { durationMs: 12000 } } });
    expect(await sociavaultYoutubeDuration(WATCH, API_KEY)).toBe(12);
  });

  it("spends one credit for a video, whatever shape the link takes", async () => {
    const fetchMock = stub({ data: { durationMs: 30000 } });

    await sociavaultYoutubeDuration(WATCH, API_KEY);
    await sociavaultYoutubeDuration(SHORT_LINK, API_KEY);
    await sociavaultYoutubeDuration("https://www.youtube.com/shorts/dQw4w9WgXcQ", API_KEY);

    // Cached on the video id, so the three links share one call
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks the documented endpoint with the key in the header", async () => {
    const fetchMock = stub({ data: { durationMs: 1000 } });

    await sociavaultYoutubeDuration(WATCH, API_KEY);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/scrape/youtube/video?url=");
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("answers null rather than throwing when the API refuses", async () => {
    stub({}, 402);
    expect(await sociavaultYoutubeDuration(WATCH, API_KEY)).toBeNull();
  });

  it("answers null when the response carries no duration", async () => {
    stub({ data: { title: "something" } });
    expect(await sociavaultYoutubeDuration(WATCH, API_KEY)).toBeNull();
  });

  it("never calls the API for a link that is not a video", async () => {
    const fetchMock = stub({ data: { durationMs: 1000 } });

    expect(await sociavaultYoutubeDuration("https://example.com/clip", API_KEY)).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
