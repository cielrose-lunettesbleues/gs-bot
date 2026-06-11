const TIKWM_SEARCH = "https://www.tikwm.com/api/feed/search";

export interface TiktokSearchResult {
  url: string;
  title: string;
  durationSeconds: number;
}

interface TikwmVideo {
  video_id?: string;
  title?: string;
  duration?: number;
  is_ad?: boolean;
  author?: { unique_id?: string };
}

export async function searchTiktokVideo(
  query: string,
  maxDurationSeconds: number
): Promise<TiktokSearchResult | null> {
  const durationCeiling = maxDurationSeconds > 0 ? maxDurationSeconds : 60;

  const params = new URLSearchParams({ keywords: query, count: "10" });

  let res: Response;
  try {
    res = await fetch(`${TIKWM_SEARCH}?${params}`, {
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    code?: number;
    data?: { videos?: TikwmVideo[] };
  };

  if (data.code !== 0 || !data.data?.videos?.length) return null;

  const videos = data.data.videos;

  function toResult(item: TikwmVideo): TiktokSearchResult {
    return {
      url: `https://www.tiktok.com/@${item.author!.unique_id}/video/${item.video_id}`,
      title: item.title ?? query,
      durationSeconds: item.duration!
    };
  }

  function isValid(item: TikwmVideo): boolean {
    return !item.is_ad && !!item.video_id && !!item.author?.unique_id && (item.duration ?? 0) > 0;
  }

  // First pass: non-ad video within duration limit
  for (const item of videos) {
    if (!isValid(item)) continue;
    if (item.duration! <= durationCeiling) return toResult(item);
  }

  // Fallback: any non-ad video regardless of duration
  for (const item of videos) {
    if (isValid(item)) return toResult(item);
  }

  return null;
}
