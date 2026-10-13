import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalInstagramUrl,
  clearInstagramCache,
  isInstagramShareUrl,
  isTiktokShortLink,
  sociavaultResolve,
  sociavaultResolveInstagram
} from "../../src/media/sociavaultClient";

const API_KEY = "sk_live_test";
const CANONICAL_TIKTOK = "https://www.tiktok.com/@user/video/7123456789012345678";
const EMBED = "https://www.tiktok.com/embed/v2/7123456789012345678?autoplay=1";

afterEach(() => {
  vi.unstubAllGlobals();
  clearInstagramCache();
});

/** expandShortLink only reads res.url, so a minimal stand-in is enough. */
function stubRedirect(finalUrl: string) {
  const fetchMock = vi.fn(async () => ({ url: finalUrl }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("isTiktokShortLink", () => {
  it("recognises the shapes the mobile share button produces", () => {
    expect(isTiktokShortLink("https://vm.tiktok.com/ZMhabc123/")).toBe(true);
    expect(isTiktokShortLink("https://vt.tiktok.com/ZSabc123/")).toBe(true);
    expect(isTiktokShortLink("https://www.tiktok.com/t/ZTabc123/")).toBe(true);
    expect(isTiktokShortLink(CANONICAL_TIKTOK)).toBe(false);
  });
});

describe("sociavaultResolve", () => {
  it("reads a desktop link without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sociavaultResolve(CANONICAL_TIKTOK, API_KEY)).toEqual({
      url: EMBED,
      durationSeconds: 0,
      portrait: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a photo post", async () => {
    const resolved = await sociavaultResolve("https://www.tiktok.com/@user/photo/7123456789012345678", API_KEY);
    expect(resolved?.url).toBe(EMBED);
  });

  it("expands a phone share link to reach the video id", async () => {
    const fetchMock = stubRedirect(CANONICAL_TIKTOK);

    const resolved = await sociavaultResolve("https://vm.tiktok.com/ZMhabc123/", API_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved?.url).toBe(EMBED);
  });

  it("gives up when the short link leads nowhere usable", async () => {
    stubRedirect("https://www.tiktok.com/@user");
    expect(await sociavaultResolve("https://vt.tiktok.com/ZSabc123/", API_KEY)).toBeNull();
  });

  it("does not try to expand an unrelated link", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sociavaultResolve("https://example.com/whatever", API_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("canonicalInstagramUrl", () => {
  it("drops the tracking parameters a share menu appends", () => {
    expect(canonicalInstagramUrl("https://www.instagram.com/p/Ddn1p6FMwTV/?cplk=MTUxanN1anlpaHV4dw=="))
      .toBe("https://www.instagram.com/p/Ddn1p6FMwTV/");
    expect(canonicalInstagramUrl("https://www.instagram.com/reel/ABC123/?igsh=MTE0cjZhbGZ6"))
      .toBe("https://www.instagram.com/reel/ABC123/");
  });

  it("normalises reels to reel and strips a username segment", () => {
    expect(canonicalInstagramUrl("https://www.instagram.com/reels/ABC123"))
      .toBe("https://www.instagram.com/reel/ABC123/");
    expect(canonicalInstagramUrl("https://instagram.com/someone/reel/ABC123"))
      .toBe("https://www.instagram.com/reel/ABC123/");
  });

  it("returns null for anything that is not a post", () => {
    expect(canonicalInstagramUrl("https://www.instagram.com/someone/")).toBeNull();
  });
});

describe("sociavaultResolveInstagram url handling", () => {
  function stubApi(payload: unknown, status = 200) {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const PAYLOAD = {
    data: {
      data: {
        xdt_shortcode_media: {
          video_url: "https://cdn.test/v.mp4",
          video_duration: 5,
          dimensions: { width: 720, height: 1280 }
        }
      }
    }
  };

  it("asks the API for the canonical url, not the one with tracking parameters", async () => {
    const fetchMock = stubApi(PAYLOAD);
    const shared = "https://www.instagram.com/p/Ddn1p6FMwTV/?cplk=MTUxanN1anlpaHV4dw==";

    await sociavaultResolveInstagram(shared, API_KEY);

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain(encodeURIComponent("https://www.instagram.com/p/Ddn1p6FMwTV/"));
    expect(calledUrl).not.toContain("cplk");
  });

  it("serves the same post shared with different parameters from one credit", async () => {
    const fetchMock = stubApi(PAYLOAD);

    await sociavaultResolveInstagram("https://www.instagram.com/p/Ddn1p6FMwTV/?cplk=aaa", API_KEY);
    await sociavaultResolveInstagram("https://www.instagram.com/p/Ddn1p6FMwTV/?igsh=bbb", API_KEY);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the API refuses", async () => {
    stubApi({}, 402);
    expect(await sociavaultResolveInstagram("https://www.instagram.com/p/ABC123/", API_KEY)).toBeNull();
  });
});

describe("isInstagramShareUrl", () => {
  it("recognises only the share shape", () => {
    expect(isInstagramShareUrl("https://www.instagram.com/share/BAbcdefghij")).toBe(true);
    expect(isInstagramShareUrl("https://www.instagram.com/reel/ABC123/")).toBe(false);
    expect(isInstagramShareUrl("https://www.instagram.com/someone/")).toBe(false);
  });
});

describe("sociavaultResolveInstagram with a share link", () => {
  it("expands the link, then asks the API about the real post", async () => {
    const canonical = "https://www.instagram.com/reel/DEiyb48AeB9/";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/share/")) return { url: canonical } as unknown as Response;
      return new Response(
        JSON.stringify({
          data: {
            data: {
              xdt_shortcode_media: {
                video_url: "https://cdn.test/v.mp4",
                video_duration: 7.2,
                dimensions: { width: 720, height: 1280 }
              }
            }
          }
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await sociavaultResolveInstagram("https://www.instagram.com/share/BAbcdefghij", API_KEY);

    expect(resolved).toEqual({ url: "https://cdn.test/v.mp4", durationSeconds: 8, portrait: true });
    // The API must be asked about the canonical url, not the share one
    const apiCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("post-info"));
    expect(String(apiCall?.[0])).toContain(encodeURIComponent(canonical));
  });

  it("stops before the API when a share link leads to a profile", async () => {
    const fetchMock = vi.fn(async () => ({ url: "https://www.instagram.com/someone/" }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await sociavaultResolveInstagram("https://www.instagram.com/share/BAbcdefghij", API_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never calls the API for a profile url", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await sociavaultResolveInstagram("https://www.instagram.com/someone/", API_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
