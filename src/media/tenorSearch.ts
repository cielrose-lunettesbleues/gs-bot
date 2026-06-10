const TENOR_API = "https://tenor.googleapis.com/v2/search";

export interface TenorSearchResult {
  url: string;
  title: string;
}

export async function searchGif(query: string, apiKey: string): Promise<TenorSearchResult | null> {
  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    limit: "1",
    media_filter: "gif"
  });

  const res = await fetch(`${TENOR_API}?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      content_description?: string;
      media_formats?: {
        gif?: { url: string };
        tinygif?: { url: string };
      };
    }>;
  };

  const item = data.results?.[0];
  if (!item) return null;

  const url = item.media_formats?.gif?.url ?? item.media_formats?.tinygif?.url;
  if (!url) return null;

  return {
    url,
    title: item.title || item.content_description || query
  };
}
