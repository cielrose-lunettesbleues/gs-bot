const BASE = "https://api.sociavault.com/v1/scrape/tiktok";

export interface TiktokResolved {
  url: string;
  durationSeconds: number;
  portrait: true;
}

export interface TiktokSearchResult extends TiktokResolved {
  title: string;
}

interface SearchItem {
  aweme_id?: string;
  author?: { unique_id?: string };
  video?: { duration?: number };
  is_ad?: boolean;
}

interface VideoDetail {
  video?: {
    duration?: number;
    bit_rate?: Array<{ play_addr?: { url_list?: string[] } }>;
  };
  duration?: number;
  music?: { duration?: number; video_duration?: number };
}

async function fetchVideoInfo(tiktokUrl: string, apiKey: string): Promise<TiktokResolved | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/video-info?url=${encodeURIComponent(tiktokUrl)}`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as { data?: { aweme_detail?: VideoDetail } };
  const d = data.data?.aweme_detail;
  if (!d) return null;

  const mp4 = d.video?.bit_rate?.[0]?.play_addr?.url_list?.[0];
  if (!mp4) return null;

  const durationSeconds =
    d.video?.duration ?? d.duration ?? d.music?.video_duration ?? d.music?.duration ?? 0;

  return { url: mp4, durationSeconds, portrait: true };
}

export async function sociavaultSearch(
  query: string,
  maxDurationSeconds: number,
  apiKey: string
): Promise<TiktokSearchResult | null> {
  const ceiling = maxDurationSeconds > 0 ? maxDurationSeconds : 60;

  let res: Response;
  try {
    res = await fetch(
      `${BASE}/search/keyword?query=${encodeURIComponent(query)}&count=10`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(10000) }
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as { data?: { aweme_list?: Record<string, SearchItem> } };
  const videos = Object.values(data.data?.aweme_list ?? {});
  if (!videos.length) return null;

  function valid(v: SearchItem) {
    return !v.is_ad && !!v.aweme_id && !!v.author?.unique_id && (v.video?.duration ?? 0) > 0;
  }

  let chosen = videos.find(v => valid(v) && (v.video?.duration ?? 0) <= ceiling);
  if (!chosen) chosen = videos.find(v => valid(v));
  if (!chosen) return null;

  const tiktokUrl = `https://www.tiktok.com/@${chosen.author!.unique_id}/video/${chosen.aweme_id}`;
  const resolved = await fetchVideoInfo(tiktokUrl, apiKey);
  if (!resolved) return null;

  return {
    ...resolved,
    durationSeconds: resolved.durationSeconds || chosen.video?.duration || 15,
    title: `@${chosen.author!.unique_id}`
  };
}

export async function sociavaultResolve(
  tiktokUrl: string,
  apiKey: string
): Promise<TiktokResolved | null> {
  return fetchVideoInfo(tiktokUrl, apiKey);
}
