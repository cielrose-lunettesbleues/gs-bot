const SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return Infinity;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export interface YoutubeSearchResult {
  url: string;
  title: string;
  durationSeconds: number;
}

async function searchIds(query: string, order: "relevance" | "viewCount", apiKey: string): Promise<string[]> {
  const params = new URLSearchParams({
    part: "id",
    type: "video",
    videoDuration: "short",
    videoEmbeddable: "true",
    safeSearch: "none",
    order,
    q: query,
    maxResults: "25",
    key: apiKey
  });
  const res = await fetch(`${SEARCH_API}?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: Array<{ id: { videoId: string } }> };
  return (data.items ?? []).map((i) => i.id.videoId).filter(Boolean);
}

export async function searchShortVideo(
  query: string,
  maxDurationSeconds: number,
  apiKey: string
): Promise<YoutubeSearchResult | null> {
  // Two searches in parallel: relevance (best text match) + viewCount (most popular)
  const [relevanceIds, viewCountIds] = await Promise.all([
    searchIds(query, "relevance", apiKey),
    searchIds(query, "viewCount", apiKey)
  ]);

  // Merge and deduplicate, preserving order (relevance first, then viewCount-only)
  const seen = new Set<string>();
  const mergedIds: string[] = [];
  for (const id of [...relevanceIds, ...viewCountIds]) {
    if (!seen.has(id)) { seen.add(id); mergedIds.push(id); }
  }
  if (!mergedIds.length) return null;

  // Fetch details + statistics in one call
  const videosParams = new URLSearchParams({
    part: "contentDetails,snippet,statistics",
    id: mergedIds.join(","),
    key: apiKey
  });
  const videosRes = await fetch(`${VIDEOS_API}?${videosParams}`);
  if (!videosRes.ok) return null;

  const videosData = (await videosRes.json()) as {
    items?: Array<{
      id: string;
      contentDetails: { duration: string };
      statistics: { viewCount?: string };
      snippet: {
        title: string;
        thumbnails?: {
          high?: { width: number; height: number };
          default?: { width: number; height: number };
        };
      };
    }>;
  };

  const allItems = videosData.items ?? [];

  function buildResult(item: typeof allItems[0], duration: number): YoutubeSearchResult {
    const thumb = item.snippet.thumbnails?.high ?? item.snippet.thumbnails?.default;
    const isShort = thumb ? thumb.height > thumb.width : false;
    return {
      url: isShort
        ? `https://www.youtube.com/shorts/${item.id}`
        : `https://www.youtube.com/watch?v=${item.id}`,
      title: item.snippet.title,
      durationSeconds: duration
    };
  }

  // First pass: candidates within duration limit, sorted by view count
  const candidates = allItems
    .map((item) => ({ item, duration: parseDuration(item.contentDetails.duration) }))
    .filter(({ duration }) => duration > 0 && duration <= maxDurationSeconds)
    .sort((a, b) => {
      const va = Number(a.item.statistics.viewCount ?? 0);
      const vb = Number(b.item.statistics.viewCount ?? 0);
      return vb - va;
    });

  if (candidates.length > 0) {
    const { item, duration } = candidates[0];
    return buildResult(item, duration);
  }

  // Fallback: no clip within duration — take the most-viewed Short (portrait)
  const shortFallbacks = allItems
    .map((item) => ({ item, duration: parseDuration(item.contentDetails.duration) }))
    .filter(({ item, duration }) => {
      if (duration <= 0) return false;
      const thumb = item.snippet.thumbnails?.high ?? item.snippet.thumbnails?.default;
      return thumb ? thumb.height > thumb.width : false;
    })
    .sort((a, b) => {
      const va = Number(a.item.statistics.viewCount ?? 0);
      const vb = Number(b.item.statistics.viewCount ?? 0);
      return vb - va;
    });

  if (shortFallbacks.length > 0) {
    const { item, duration } = shortFallbacks[0];
    return buildResult(item, duration);
  }

  return null;
}
