const KLIPY_API = "https://api.klipy.com/api/v1";

export interface KlipySearchResult {
  url: string;
  title: string;
}

export async function searchGif(query: string, apiKey: string): Promise<KlipySearchResult | null> {
  const params = new URLSearchParams({ q: query, per_page: "1" });
  const res = await fetch(`${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/search?${params}`);

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[klipySearch] HTTP", res.status, bodyText);
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    console.error("[klipySearch] JSON parse error:", bodyText);
    return null;
  }

  console.log("[klipySearch] response:", JSON.stringify(data).slice(0, 300));

  const item = Array.isArray(data) ? data[0] : undefined;
  if (!item) return null;

  const url = (item as { src?: string; proxy_src?: string }).src
    ?? (item as { src?: string; proxy_src?: string }).proxy_src;
  if (!url) return null;

  return {
    url,
    title: (item as { title?: string }).title || query
  };
}
