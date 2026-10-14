import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTiktokCache, sociavaultResolve, sociavaultSearch } from "../../src/media/sociavaultClient";

const API_KEY = "sk_live_test";
const VIDEO = "https://www.tiktok.com/@someone/video/7311111111111111111";

const logger = { info: vi.fn(), warn: vi.fn() };

/** A video object in the shape the API returns, with a playable H.264 entry. */
function playableVideo() {
  return {
    duration: 12000,
    play_addr: { width: 576, height: 1024 },
    bit_rate: [
      { is_bytevc1: 1, play_addr: { url_list: ["https://cdn.test/hevc.mp4"], width: 576, height: 1024 } },
      { is_bytevc1: 0, play_addr: { url_list: ["https://cdn.test/h264.mp4"], width: 576, height: 1024 } }
    ]
  };
}

/** Same, but with nothing a browser could play. */
function unplayableVideo() {
  return {
    duration: 12000,
    play_addr: { width: 576, height: 1024 },
    bit_rate: [
      { is_bytevc1: 1, play_addr: { url_list: ["https://cdn.test/hevc.mp4"], width: 576, height: 1024 } }
    ]
  };
}

function stubFetch(...bodies: unknown[]) {
  let call = 0;
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function videoInfo(video: unknown) {
  return { success: true, data: { aweme_detail: { video } } };
}

function searchPayload(item: Record<string, unknown>) {
  return { data: { search_item_list: [{ aweme_info: item }] } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearTiktokCache();
  logger.info.mockReset();
  logger.warn.mockReset();
});

describe("sociavaultResolve", () => {
  it("returns the playable file of a video", async () => {
    stubFetch(videoInfo(playableVideo()));

    expect(await sociavaultResolve(VIDEO, API_KEY, logger)).toEqual({
      url: "https://cdn.test/h264.mp4",
      durationSeconds: 12,
      portrait: true
    });
  });

  it("refuses a video with no playable file instead of handing back the embed", async () => {
    stubFetch(videoInfo(unplayableVideo()));

    const resolved = await sociavaultResolve(VIDEO, API_KEY, logger);

    // The embed player is muted and sits behind a cookie banner: on a stream
    // that is worse than saying it did not work.
    expect(resolved).toBeNull();
  });

  it("refuses rather than embedding when no key is configured", async () => {
    const fetchMock = stubFetch(videoInfo(playableVideo()));

    expect(await sociavaultResolve(VIDEO, "", logger)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sociavaultSearch", () => {
  const item = { aweme_id: "7311111111111111111", author: { unique_id: "someone" }, desc: "hello" };

  it("uses the addresses already in the search payload, spending no extra credit", async () => {
    const fetchMock = stubFetch(searchPayload({ ...item, video: playableVideo() }));

    const found = await sociavaultSearch("chat drole", 60, API_KEY, logger);

    expect(found).toEqual({
      url: "https://cdn.test/h264.mp4",
      durationSeconds: 12,
      portrait: true,
      title: "@someone"
    });
    // One call: the search itself. A second would be a credit for nothing.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("looks the video up when the search payload carries no addresses", async () => {
    const fetchMock = stubFetch(
      searchPayload({ ...item, video: { duration: 12000 } }),
      videoInfo(playableVideo())
    );

    const found = await sociavaultSearch("chat drole", 60, API_KEY, logger);

    expect(found?.url).toBe("https://cdn.test/h264.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second call must address the chosen video, not the search again
    expect(String(fetchMock.mock.calls[1][0])).toContain("video-info");
  });

  it("finds nothing when the chosen video has no playable file either", async () => {
    stubFetch(
      searchPayload({ ...item, video: { duration: 12000 } }),
      videoInfo(unplayableVideo())
    );

    expect(await sociavaultSearch("chat drole", 60, API_KEY, logger)).toBeNull();
  });
});
