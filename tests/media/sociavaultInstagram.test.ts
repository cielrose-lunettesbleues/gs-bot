import { afterEach, describe, expect, it, vi } from "vitest";
import { isInstagramPostUrl, sociavaultResolveInstagram } from "../../src/media/sociavaultClient";

const API_KEY = "sk_live_test";
const REEL = "https://www.instagram.com/reel/DEiyb48AeB9/";

// The API wraps the media in two {success, data} envelopes
function payload(media: Record<string, unknown>) {
  return { success: true, data: { success: true, data: { xdt_shortcode_media: media } } };
}

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isInstagramPostUrl", () => {
  it("accepts reel, post and tv urls with or without a username segment", () => {
    expect(isInstagramPostUrl(REEL)).toBe(true);
    expect(isInstagramPostUrl("https://instagram.com/p/ABC123/")).toBe(true);
    expect(isInstagramPostUrl("https://www.instagram.com/someone/reel/ABC_1-2/")).toBe(true);
    expect(isInstagramPostUrl("https://www.instagram.com/tv/ABC123")).toBe(true);
  });

  it("rejects profiles and other hosts", () => {
    expect(isInstagramPostUrl("https://www.instagram.com/someone/")).toBe(false);
    expect(isInstagramPostUrl("https://example.com/reel/ABC123")).toBe(false);
  });
});

describe("sociavaultResolveInstagram", () => {
  it("returns the direct video url, rounded duration and orientation", async () => {
    const fetchMock = stubFetch(payload({
      video_url: "https://cdn.test/v.mp4",
      video_duration: 8.466,
      dimensions: { width: 1080, height: 1923 }
    }));

    const resolved = await sociavaultResolveInstagram(REEL, API_KEY);

    expect(resolved).toEqual({ url: "https://cdn.test/v.mp4", durationSeconds: 9, portrait: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.sociavault.com/v1/scrape/instagram/post-info?url=" + encodeURIComponent(REEL)
    );
    expect((init?.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
  });

  it("marks a landscape post as not portrait", async () => {
    stubFetch(payload({
      video_url: "https://cdn.test/wide.mp4",
      video_duration: 12,
      dimensions: { width: 1920, height: 1080 }
    }));

    const resolved = await sociavaultResolveInstagram(REEL, API_KEY);

    expect(resolved?.portrait).toBe(false);
  });

  it("reads a single-envelope payload", async () => {
    stubFetch({
      data: {
        xdt_shortcode_media: {
          video_url: "https://cdn.test/v.mp4",
          video_duration: 5,
          dimensions: { width: 720, height: 1280 }
        }
      }
    });

    const resolved = await sociavaultResolveInstagram(REEL, API_KEY);

    expect(resolved?.url).toBe("https://cdn.test/v.mp4");
  });

  it("returns null for a post with no video", async () => {
    stubFetch(payload({ dimensions: { width: 1080, height: 1080 } }));
    expect(await sociavaultResolveInstagram(REEL, API_KEY)).toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    stubFetch({}, 402);
    expect(await sociavaultResolveInstagram(REEL, API_KEY)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    expect(await sociavaultResolveInstagram(REEL, API_KEY)).toBeNull();
  });

  it("does not spend a credit on a profile url", async () => {
    const fetchMock = stubFetch(payload({}));

    expect(await sociavaultResolveInstagram("https://www.instagram.com/someone/", API_KEY)).toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
