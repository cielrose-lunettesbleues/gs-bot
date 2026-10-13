import { afterEach, describe, expect, it, vi } from "vitest";
import { searchGif, searchGifs } from "../../src/media/klipySearch";

const API_KEY = "klipy-key";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function item(name: string, withHd = true) {
  return {
    title: name,
    file: {
      hd: withHd ? { gif: { url: `https://cdn.test/${name}-hd.gif` } } : undefined,
      sd: { gif: { url: `https://cdn.test/${name}-sd.gif` } }
    }
  };
}

describe("searchGifs", () => {
  it("returns a full file to send and a lighter one for the grid", async () => {
    stub({ data: { data: [item("cat"), item("dog")] } });

    const gifs = await searchGifs("animals", API_KEY);

    expect(gifs).toEqual([
      { url: "https://cdn.test/cat-hd.gif", previewUrl: "https://cdn.test/cat-sd.gif", title: "cat" },
      { url: "https://cdn.test/dog-hd.gif", previewUrl: "https://cdn.test/dog-sd.gif", title: "dog" }
    ]);
  });

  it("falls back to the lighter file when there is no full one", async () => {
    stub({ data: { data: [item("cat", false)] } });

    const [gif] = await searchGifs("cat", API_KEY);

    expect(gif.url).toBe("https://cdn.test/cat-sd.gif");
    expect(gif.previewUrl).toBe("https://cdn.test/cat-sd.gif");
  });

  it("drops entries carrying no file at all", async () => {
    stub({ data: { data: [{ title: "broken" }, item("cat")] } });

    const gifs = await searchGifs("cat", API_KEY);

    expect(gifs).toHaveLength(1);
    expect(gifs[0].title).toBe("cat");
  });

  it("asks for the requested count, clamped to what the API accepts", async () => {
    const fetchMock = stub({ data: { data: [] } });

    await searchGifs("cat", API_KEY, 500);

    expect(String(fetchMock.mock.calls[0][0])).toContain("per_page=50");
  });

  it("returns nothing rather than throwing when the API refuses", async () => {
    stub({}, 402);
    expect(await searchGifs("cat", API_KEY)).toEqual([]);
  });

  it("returns nothing when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    expect(await searchGifs("cat", API_KEY)).toEqual([]);
  });

  it("keeps the api key in the path, never in the query", async () => {
    const fetchMock = stub({ data: { data: [] } });

    await searchGifs("cat", API_KEY);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(`/${API_KEY}/gifs/search?`);
    expect(url).not.toContain(`q=${API_KEY}`);
  });
});

describe("searchGif", () => {
  it("still answers the chat command with a single result", async () => {
    stub({ data: { data: [item("cat"), item("dog")] } });

    expect(await searchGif("animals", API_KEY)).toEqual({
      url: "https://cdn.test/cat-hd.gif",
      title: "cat"
    });
  });

  it("answers null when nothing matches", async () => {
    stub({ data: { data: [] } });
    expect(await searchGif("nothing", API_KEY)).toBeNull();
  });
});
