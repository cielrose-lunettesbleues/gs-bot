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

export async function searchShortVideo(
  query: string,
  maxDurationSeconds: number,
  apiKey: string
): Promise<YoutubeSearchResult | null> {
  // maxDurationSeconds === 0 means no limit — cap at 240s (YouTube API "short" ceiling)
  const durationCeiling = maxDurationSeconds > 0 ? maxDurationSeconds : 240;

  const searchParams = new URLSearchParams({
    part: "id",
    type: "video",
    videoDuration: "short",
    videoEmbeddable: "true",
    safeSearch: "none",
    order: "relevance",
    q: query,
    maxResults: "25",
    key: apiKey
  });

  const searchRes = await fetch(`${SEARCH_API}?${searchParams}`);
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    items?: Array<{ id: { videoId: string } }>;
  };
  const ids = (searchData.items ?? []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return null;

  const videosParams = new URLSearchParams({
    part: "contentDetails,snippet,statistics",
    id: ids.join(","),
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

  // Among candidates within duration, pick the most viewed (best signal for quality/relevance)
  const candidates = allItems
    .map((item) => ({ item, duration: parseDuration(item.contentDetails.duration) }))
    .filter(({ duration }) => duration > 0 && duration <= durationCeiling)
    .sort((a, b) => Number(b.item.statistics.viewCount ?? 0) - Number(a.item.statistics.viewCount ?? 0));

  if (candidates.length > 0) {
    const { item, duration } = candidates[0];
    return buildResult(item, duration);
  }

  // Fallback: no clip within duration — most-viewed Short (portrait)
  const shortFallbacks = allItems
    .map((item) => ({ item, duration: parseDuration(item.contentDetails.duration) }))
    .filter(({ item, duration }) => {
      if (duration <= 0) return false;
      const thumb = item.snippet.thumbnails?.high ?? item.snippet.thumbnails?.default;
      return thumb ? thumb.height > thumb.width : false;
    })
    .sort((a, b) => Number(b.item.statistics.viewCount ?? 0) - Number(a.item.statistics.viewCount ?? 0));

  if (shortFallbacks.length > 0) {
    const { item, duration } = shortFallbacks[0];
    return buildResult(item, duration);
  }

  return null;
}
