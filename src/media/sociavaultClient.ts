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

interface BitRateEntry {
  codec_type?: number;
  play_addr?: { url_list?: string[] | Record<string, string> };
}

interface PlayAddr {
  url_list?: string[] | Record<string, string>;
}

interface AwemeInfo {
  aweme_id?: string;
  desc?: string;
  author?: { unique_id?: string };
  video?: {
    duration?: number;
    play_addr?: PlayAddr;
    download_addr?: PlayAddr;
    bit_rate?: BitRateEntry[] | Record<string, BitRateEntry>;
  };
  music?: { duration?: number; video_duration?: number };
  is_ads?: boolean;
}

interface SearchItem {
  aweme_info?: AwemeInfo;
}

interface VideoDetail {
  video?: {
    duration?: number;
    play_addr?: PlayAddr;
    bit_rate?: BitRateEntry[] | Record<string, BitRateEntry>;
  };
  duration?: number;
  music?: { duration?: number; video_duration?: number };
}

function normalizeDuration(d: number): number {
  // TikTok API sometimes returns milliseconds; values > 600 are implausibly long in seconds
  return d > 600 ? Math.round(d / 1000) : d;
}

function toArray<T>(v: T[] | Record<string, T> | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

// Prefer tiktokv.us direct-play URLs (H.264, OBS-compatible) over CDN URLs (may be H.265)
function pickMp4(bitRates: BitRateEntry[], playAddr?: PlayAddr, downloadAddr?: PlayAddr, log?: SimpleLogger): string | undefined {
  const allUrls: string[] = [];
  for (const e of bitRates) allUrls.push(...toArray(e.play_addr?.url_list));
  allUrls.push(...toArray(playAddr?.url_list));
  allUrls.push(...toArray(downloadAddr?.url_list));

  log?.info({
    bitRateCount: bitRates.length,
    codecTypes: bitRates.map(e => e.codec_type),
    allUrlDomains: allUrls.map(u => { try { return new URL(u).hostname; } catch { return "?"; } })
  }, "SociaVault available streams");

  // 1. download_addr tiktokv.us (H.264 download endpoint)
  const dlDirect = toArray(downloadAddr?.url_list).find(u => u.includes("tiktokv."));
  if (dlDirect) return dlDirect;

  // 2. bit_rate with codec_type 0 (H.264), prefer tiktokv.us URL within it
  for (const e of bitRates) {
    if (e.codec_type === 0) {
      const urls = toArray(e.play_addr?.url_list);
      return urls.find(u => u.includes("tiktokv.")) ?? urls[0];
    }
  }

  // 3. Any tiktokv.us URL from play_addr or bit_rate
  const direct = allUrls.find(u => u.includes("tiktokv."));
  if (direct) return direct;

  // 4. Last bit_rate entry (lowest quality, more likely H.264)
  const last = bitRates[bitRates.length - 1];
  if (last) return toArray(last.play_addr?.url_list)[0];

  return toArray(playAddr?.url_list)[0];
}

function resolveFromAweme(aweme: AwemeInfo | VideoDetail, log?: SimpleLogger, label?: string): TiktokResolved | null {
  const vid = aweme.video;
  const bitRates = toArray(vid?.bit_rate);
  const mp4 = pickMp4(bitRates, vid?.play_addr, (aweme as AwemeInfo).video?.download_addr, log);
  if (!mp4) return null;

  const rawDuration =
    vid?.duration ??
    (aweme as AwemeInfo).music?.video_duration ??
    (aweme as AwemeInfo).music?.duration ??
    (aweme as VideoDetail).duration ?? 0;
  const durationSeconds = normalizeDuration(rawDuration);

  log?.info({ label, durationSeconds, url: mp4.slice(0, 80) }, "SociaVault mp4 resolved");
  return { url: mp4, durationSeconds, portrait: true };
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

  const result = resolveFromAweme(d, log, "video-info");
  if (!result) {
    log?.warn({ tiktokUrl, video: JSON.stringify(d.video).slice(0, 200) }, "SociaVault video-info: no mp4 url");
  }
  return result;
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
  const items = toArray(data.data?.search_item_list);
  const videos = items.map(i => i.aweme_info).filter((a): a is AwemeInfo => !!a);
  log?.info({ query, count: videos.length }, "SociaVault search raw results");
  if (!videos.length) return null;

  function duration(v: AwemeInfo) {
    const d = v.video?.duration ?? v.music?.video_duration ?? v.music?.duration ?? 0;
    return normalizeDuration(d);
  }

  function valid(v: AwemeInfo) {
    return !v.is_ads && !!v.aweme_id && !!v.author?.unique_id && duration(v) > 0;
  }

  let chosen = videos.find(v => valid(v) && duration(v) <= ceiling);
  if (!chosen) chosen = videos.find(v => valid(v));
  if (!chosen) {
    log?.warn({ query, sample: JSON.stringify(videos[0]).slice(0, 200) }, "SociaVault search: no valid video found");
    return null;
  }

  log?.info({ aweme_id: chosen.aweme_id, author: chosen.author?.unique_id, duration: duration(chosen), desc: chosen.desc?.slice(0, 80) }, "SociaVault chosen video");

  // Try to extract MP4 directly from search result (saves the video-info API call)
  const direct = resolveFromAweme(chosen, log, "search-direct");
  if (direct) {
    return {
      ...direct,
      durationSeconds: direct.durationSeconds || duration(chosen) || 15,
      title: `@${chosen.author!.unique_id}`
    };
  }

  // Fallback: call video-info endpoint (costs an extra credit)
  log?.warn({ aweme_id: chosen.aweme_id }, "SociaVault search: no direct URL, falling back to video-info");
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
