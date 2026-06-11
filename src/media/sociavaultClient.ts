const BASE = "https://api.sociavault.com/v1/scrape/tiktok";

export interface TiktokResolved {
  url: string;
  durationSeconds: number;
  portrait: true;
}

export interface TiktokSearchResult extends TiktokResolved {
  title: string;
}

interface SimpleLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
}

interface AwemeInfo {
  aweme_id?: string;
  author?: { unique_id?: string };
  video?: { duration?: number; bit_rate?: Array<{ play_addr?: { url_list?: Record<string, string> } }> };
  music?: { duration?: number; video_duration?: number };
  is_ads?: boolean;
}

interface SearchItem {
  aweme_info?: AwemeInfo;
}

interface VideoDetail {
  video?: {
    duration?: number;
    bit_rate?: Array<{ play_addr?: { url_list?: string[] | Record<string, string> } }>;
  };
  duration?: number;
  music?: { duration?: number; video_duration?: number };
}

async function fetchVideoInfo(tiktokUrl: string, apiKey: string, log?: SimpleLogger): Promise<TiktokResolved | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/video-info?url=${encodeURIComponent(tiktokUrl)}`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    log?.warn({ tiktokUrl, err: String(err) }, "SociaVault video-info fetch failed");
    return null;
  }
  if (!res.ok) {
    log?.warn({ tiktokUrl, status: res.status }, "SociaVault video-info non-OK response");
    return null;
  }

  const data = (await res.json()) as { data?: { aweme_detail?: VideoDetail } };
  const d = data.data?.aweme_detail;
  if (!d) {
    log?.warn({ tiktokUrl, data: JSON.stringify(data).slice(0, 200) }, "SociaVault video-info: no aweme_detail");
    return null;
  }

  const rawUrlList = d.video?.bit_rate?.[0]?.play_addr?.url_list;
  const mp4 = Array.isArray(rawUrlList)
    ? rawUrlList[0]
    : rawUrlList ? Object.values(rawUrlList)[0] : undefined;
  if (!mp4) {
    log?.warn({ tiktokUrl, video: JSON.stringify(d.video).slice(0, 200) }, "SociaVault video-info: no mp4 url");
    return null;
  }

  const durationSeconds =
    d.video?.duration ?? d.duration ?? d.music?.video_duration ?? d.music?.duration ?? 0;

  return { url: mp4, durationSeconds, portrait: true };
}

export async function sociavaultSearch(
  query: string,
  maxDurationSeconds: number,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokSearchResult | null> {
  const ceiling = maxDurationSeconds > 0 ? maxDurationSeconds : 60;

  let res: Response;
  try {
    res = await fetch(
      `${BASE}/search/keyword?query=${encodeURIComponent(query)}&count=10`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(10000) }
    );
  } catch (err) {
    log?.warn({ query, err: String(err) }, "SociaVault search fetch failed");
    return null;
  }
  if (!res.ok) {
    log?.warn({ query, status: res.status }, "SociaVault search non-OK response");
    return null;
  }

  const data = (await res.json()) as { data?: { search_item_list?: Record<string, SearchItem> } };
  const items = Object.values(data.data?.search_item_list ?? {});
  const videos = items.map(i => i.aweme_info).filter((a): a is AwemeInfo => !!a);
  log?.info({ query, count: videos.length }, "SociaVault search raw results");
  if (!videos.length) return null;

  function duration(v: AwemeInfo) {
    return v.video?.duration ?? v.music?.video_duration ?? v.music?.duration ?? 0;
  }

  function valid(v: AwemeInfo) {
    return !v.is_ads && !!v.aweme_id && !!v.author?.unique_id && duration(v) > 0;
  }

  let chosen = videos.find(v => valid(v) && duration(v) <= ceiling);
  if (!chosen) chosen = videos.find(v => valid(v));
  if (!chosen) {
    log?.warn(
      { query, sample: JSON.stringify(videos[0]).slice(0, 200) },
      "SociaVault search: no valid video found"
    );
    return null;
  }

  log?.info({ aweme_id: chosen.aweme_id, author: chosen.author?.unique_id, duration: duration(chosen) }, "SociaVault chosen video");

  const tiktokUrl = `https://www.tiktok.com/@${chosen.author!.unique_id}/video/${chosen.aweme_id}`;
  const resolved = await fetchVideoInfo(tiktokUrl, apiKey, log);
  if (!resolved) return null;

  return {
    ...resolved,
    durationSeconds: resolved.durationSeconds || duration(chosen) || 15,
    title: `@${chosen.author!.unique_id}`
  };
}

export async function sociavaultResolve(
  tiktokUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokResolved | null> {
  return fetchVideoInfo(tiktokUrl, apiKey, log);
}
