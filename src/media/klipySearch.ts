const KLIPY_API = "https://api.klipy.com/api/v1";

export interface KlipySearchResult {
  url: string;
  title: string;
}

/** One result of a browse, with a lighter file for the grid. */
export interface KlipyGif {
  url: string;
  previewUrl: string;
  title: string;
}

interface SimpleLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

interface KlipyItem {
  title?: string;
  file?: {
    hd?: { gif?: { url?: string } };
    sd?: { gif?: { url?: string } };
  };
}

export async function searchGifs(
  query: string,
  apiKey: string,
  limit = 24,
  log?: SimpleLogger
): Promise<KlipyGif[]> {
  const params = new URLSearchParams({ q: query, per_page: String(Math.min(Math.max(limit, 1), 50)) });

  let res: Response;
  try {
    res = await fetch(`${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/search?${params}`, {
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    log?.warn({ query, err: String(err) }, "Klipy fetch failed");
    return [];
  }
  if (!res.ok) {
    log?.warn({ query, status: res.status }, `Klipy refused with HTTP ${res.status}`);
    return [];
  }

  const data = (await res.json()) as { data?: { data?: KlipyItem[] } };
  const items = data.data?.data ?? [];

  return items
    .map((item) => {
      const full = item.file?.hd?.gif?.url ?? item.file?.sd?.gif?.url;
      const preview = item.file?.sd?.gif?.url ?? full;
      if (!full || !preview) return null;
      return { url: full, previewUrl: preview, title: item.title || query };
    })
    .filter((gif): gif is KlipyGif => gif !== null);
}

export async function searchGif(query: string, apiKey: string): Promise<KlipySearchResult | null> {
  const [first] = await searchGifs(query, apiKey, 1);
  return first ? { url: first.url, title: first.title } : null;
}
