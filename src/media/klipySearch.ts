const KLIPY_API = "https://api.klipy.com/api/v1";

export interface KlipySearchResult {
  url: string;
  title: string;
}

export async function searchGif(query: string, apiKey: string): Promise<KlipySearchResult | null> {
  const params = new URLSearchParams({ q: query, per_page: "1" });
  const res = await fetch(`${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/search?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    result?: boolean;
    data?: {
      data?: Array<{
        title?: string;
        file?: {
          hd?: { gif?: { url?: string } };
          sd?: { gif?: { url?: string } };
        };
      }>;
    };
  };

  const item = data.data?.data?.[0];
  if (!item) return null;

  const url = item.file?.hd?.gif?.url ?? item.file?.sd?.gif?.url;
  if (!url) return null;

  return { url, title: item.title || query };
}
