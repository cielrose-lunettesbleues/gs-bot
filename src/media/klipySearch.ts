const KLIPY_API = "https://api.klipy.com/api/v1";

export interface KlipySearchResult {
  url: string;
  title: string;
}

export async function searchGif(query: string, apiKey: string): Promise<KlipySearchResult | null> {
  const params = new URLSearchParams({ q: query, per_page: "1" });
  const res = await fetch(`${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/search?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as Array<{
    title?: string;
    src?: string;
    proxy_src?: string;
  }>;

  const item = Array.isArray(data) ? data[0] : undefined;
  if (!item) return null;

  const url = item.src ?? item.proxy_src;
  if (!url) return null;

  return { url, title: item.title || query };
}
