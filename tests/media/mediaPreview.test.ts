import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMediaPreview, youtubeId } from "../../src/media/mediaPreview";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("youtubeId", () => {
  it("reads watch, short and youtu.be links", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(youtubeId("https://youtu.be/abc123")).toBe("abc123");
    expect(youtubeId("https://www.youtube.com/shorts/abc123")).toBe("abc123");
    expect(youtubeId("https://example.com/video")).toBeNull();
  });
});

describe("buildMediaPreview", () => {
  it("previews a YouTube link without any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const preview = await buildMediaPreview("https://www.youtube.com/watch?v=abc123");

    expect(preview).toMatchObject({ kind: "youtube" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews a Short in the shape the overlay will give it", async () => {
    const short = await buildMediaPreview("https://www.youtube.com/shorts/abc123");
    const wide = await buildMediaPreview("https://www.youtube.com/watch?v=abc123");

    expect(short).toMatchObject({ kind: "youtube", portrait: true });
    expect(wide).toMatchObject({ kind: "youtube", portrait: false });
  });

  it("uses a thumbnail that exists for every video", async () => {
    const preview = await buildMediaPreview("https://youtu.be/abc123");
    // maxresdefault is missing on many videos, Shorts especially
    expect(preview).toMatchObject({ thumbnailUrl: "https://img.youtube.com/vi/abc123/hqdefault.jpg" });
  });

  it("previews a direct video and a direct image", async () => {
    expect(await buildMediaPreview("https://cdn.test/clip.mp4")).toMatchObject({
      kind: "video",
      url: "https://cdn.test/clip.mp4"
    });
    expect(await buildMediaPreview("https://cdn.test/funny.gif")).toMatchObject({
      kind: "image",
      url: "https://cdn.test/funny.gif"
    });
  });

  it("previews an Instagram reel through the resolver", async () => {
    const instagramResolve = vi.fn(async () => ({
      url: "https://cdn.test/reel.mp4",
      durationSeconds: 9,
      portrait: true
    }));

    const preview = await buildMediaPreview("https://www.instagram.com/reel/ABC123/", { instagramResolve });

    expect(instagramResolve).toHaveBeenCalled();
    expect(preview).toEqual({
      kind: "video",
      url: "https://cdn.test/reel.mp4",
      portrait: true,
      durationSeconds: 9
    });
  });

  it("explains an Instagram profile link instead of trying to play it", async () => {
    const preview = await buildMediaPreview("https://www.instagram.com/someone/", {
      instagramResolve: vi.fn(async () => null)
    });
    expect(preview).toEqual({ kind: "unsupported", reason: "instagram_not_a_post" });
  });

  it("reports when the streamer has no resolver configured", async () => {
    expect(await buildMediaPreview("https://www.instagram.com/reel/ABC123/")).toEqual({
      kind: "unsupported",
      reason: "instagram_not_configured"
    });
    expect(await buildMediaPreview("https://www.tiktok.com/@a/video/123")).toEqual({
      kind: "unsupported",
      reason: "tiktok_not_configured"
    });
  });

  it("previews a resolved TikTok as a plain video", async () => {
    const tiktokResolve = vi.fn(async () => ({
      url: "https://v16.tiktokcdn.com/video.mp4",
      durationSeconds: 12,
      portrait: true
    }));

    const preview = await buildMediaPreview("https://www.tiktok.com/@a/video/123", { tiktokResolve });

    expect(preview).toEqual({
      kind: "video",
      url: "https://v16.tiktokcdn.com/video.mp4",
      portrait: true,
      durationSeconds: 12
    });
  });

  it("says so when a TikTok yields no file, rather than offering the embed", async () => {
    // The embed opens muted behind a cookie banner, which is useless on stream
    const tiktokResolve = vi.fn(async () => null);

    const preview = await buildMediaPreview("https://www.tiktok.com/@a/video/123", { tiktokResolve });

    expect(preview).toEqual({ kind: "unsupported", reason: "tiktok_unresolved" });
  });

  it("resolves a Tenor page to its image", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      '<meta property="og:image" content="https://media.tenor.com/x.gif">',
      { status: 200 }
    )));

    const preview = await buildMediaPreview("https://tenor.com/view/something-123");

    expect(preview).toEqual({ kind: "image", url: "https://media.tenor.com/x.gif" });
  });

  it("says plainly when there is nothing to preview", async () => {
    expect(await buildMediaPreview("https://example.com/page")).toEqual({
      kind: "unsupported",
      reason: "no_preview"
    });
  });
});
