import { afterEach, describe, expect, it, vi } from "vitest";
import { searchShortVideo } from "../../src/media/youtubeSearch";

function mockSearchAndVideos(items: Array<{
  id: string;
  title: string;
  duration: string;
  portrait?: boolean;
}>) {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: items.map((item) => ({ id: { videoId: item.id } })) })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: items.map((item) => ({
          id: item.id,
          contentDetails: { duration: item.duration },
          snippet: {
            title: item.title,
            thumbnails: item.portrait
              ? { high: { width: 720, height: 1280 } }
              : { high: { width: 1280, height: 720 } }
          }
        }))
      })
    });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("youtubeSearch", () => {
  it("prefers a relevant short over a landscape result", async () => {
    mockSearchAndVideos([
      { id: "land-1", title: "Chat qui danse compilation", duration: "PT1M10S", portrait: false },
      { id: "short-1", title: "Chat qui danse short", duration: "PT0M35S", portrait: true }
    ]);

    const result = await searchShortVideo("chat qui danse", 120, "key");
    expect(result?.url).toBe("https://www.youtube.com/shorts/short-1");
  });

  it("falls back to a more relevant landscape video when the short is weakly relevant", async () => {
    mockSearchAndVideos([
      { id: "short-1", title: "funny random short", duration: "PT0M30S", portrait: true },
      { id: "land-1", title: "chat qui danse officiel", duration: "PT1M00S", portrait: false }
    ]);

    const result = await searchShortVideo("chat qui danse", 120, "key");
    expect(result?.url).toBe("https://www.youtube.com/watch?v=land-1");
  });
});
