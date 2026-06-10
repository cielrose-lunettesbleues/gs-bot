const GIPHY_API = "https://api.giphy.com/v1/gifs/search";

export interface TenorSearchResult {
  url: string;
  title: string;
}

export async function searchGif(query: string, apiKey: string): Promise<TenorSearchResult | null> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    limit: "1",
    rating: "g"
  });

  const res = await fetch(`${GIPHY_API}?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    data?: Array<{
      title?: string;
      images?: {
        original?: { url: string };
        downsized?: { url: string };
      };
    }>;
  };

  const item = data.data?.[0];
  if (!item) return null;

  const url = item.images?.original?.url ?? item.images?.downsized?.url;
  if (!url) return null;

  return { url, title: item.title || query };
}
