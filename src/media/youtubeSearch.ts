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
  const searchParams = new URLSearchParams({
    part: "id",
    type: "video",
    videoDuration: "short",
    order: "viewCount",
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
    part: "contentDetails,snippet",
    id: ids.join(","),
    key: apiKey
  });

  const videosRes = await fetch(`${VIDEOS_API}?${videosParams}`);
  if (!videosRes.ok) return null;

  const videosData = (await videosRes.json()) as {
    items?: Array<{
      id: string;
      contentDetails: { duration: string };
      snippet: {
        title: string;
        thumbnails?: {
          high?: { width: number; height: number };
          default?: { width: number; height: number };
        };
      };
    }>;
  };

  const items = videosData.items ?? [];

  // First pass: video within the configured duration limit
  for (const item of items) {
    const duration = parseDuration(item.contentDetails.duration);
    if (duration > 0 && duration <= maxDurationSeconds) {
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
  }

  // Fallback: no short clip found — return the first Short (portrait thumbnail)
  for (const item of items) {
    const duration = parseDuration(item.contentDetails.duration);
    if (duration <= 0) continue;
    const thumb = item.snippet.thumbnails?.high ?? item.snippet.thumbnails?.default;
    if (thumb && thumb.height > thumb.width) {
      return {
        url: `https://www.youtube.com/shorts/${item.id}`,
        title: item.snippet.title,
        durationSeconds: duration
      };
    }
  }

  return null;
}
