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
  play_addr?: { url_list?: unknown };
}

interface AwemeInfo {
  aweme_id?: string;
  desc?: string;
  author?: { unique_id?: string };
  video?: {
    duration?: number;
    play_addr?: { url_list?: unknown };
    download_addr?: { url_list?: unknown };
    bit_rate?: unknown;
  };
  music?: { duration?: number; video_duration?: number };
  is_ads?: boolean;
}

interface VideoDetail {
  video?: {
    duration?: number;
    play_addr?: { url_list?: unknown };
    download_addr?: { url_list?: unknown };
    bit_rate?: unknown;
  };
  duration?: number;
  music?: { duration?: number; video_duration?: number };
}

// Safely extract a string array from TikTok's url_list (real array or {"0":"url",...} object)
function extractUrls(urlList: unknown): string[] {
  if (!urlList) return [];
  const raw = Array.isArray(urlList) ? urlList : Object.values(urlList as Record<string, unknown>);
  return raw.filter((u): u is string => typeof u === "string" && u.length > 0);
}

// Safely extract BitRateEntry array from TikTok's bit_rate (real array or {"0":{...},...} object)
function extractBitRates(bitRate: unknown): BitRateEntry[] {
  if (!bitRate) return [];
  const raw = Array.isArray(bitRate) ? bitRate : Object.values(bitRate as Record<string, unknown>);
  return raw.filter((e): e is BitRateEntry => !!e && typeof e === "object");
}

// Normalize duration: TikTok API sometimes returns milliseconds (> 600 means implausibly long in seconds)
function normalizeDuration(d: number): number {
  return d > 600 ? Math.round(d / 1000) : d;
}

// Pick best MP4 URL, preferring tiktokv.us (serves H.264) over CDN URLs (may be H.265/HEVC)
function pickMp4(video: AwemeInfo["video"] | VideoDetail["video"], log?: SimpleLogger): string | undefined {
  if (!video) return undefined;

  const bitRates = extractBitRates(video.bit_rate);
  const allCandidates: Array<{ url: string; codec_type?: number; source: string }> = [];

  for (const e of bitRates) {
    for (const url of extractUrls(e.play_addr?.url_list)) {
      allCandidates.push({ url, codec_type: e.codec_type, source: "bit_rate" });
    }
  }
  for (const url of extractUrls(video.play_addr?.url_list)) {
    allCandidates.push({ url, source: "play_addr" });
  }
  for (const url of extractUrls(video.download_addr?.url_list)) {
    allCandidates.push({ url, source: "download_addr" });
  }

  if (log) {
    log.info({
      bitRateCount: bitRates.length,
      codecTypes: bitRates.map(e => e.codec_type),
      candidateCount: allCandidates.length,
      hasTiktokv: allCandidates.some(c => c.url.includes("tiktokv.")),
      hasH264: allCandidates.some(c => c.codec_type === 0),
    }, "SociaVault available streams");
  }

  if (!allCandidates.length) return undefined;

  // 1. H.264 (codec_type 0) with tiktokv.us
  for (const c of allCandidates) {
    if (c.codec_type === 0 && c.url.includes("tiktokv.")) return c.url;
  }
  // 2. Any tiktokv.us URL (direct endpoint, usually H.264 compatible)
  const direct = allCandidates.find(c => c.url.includes("tiktokv."));
  if (direct) return direct.url;
  // 3. H.264 by codec_type only
  const h264 = allCandidates.find(c => c.codec_type === 0);
  if (h264) return h264.url;
  // 4. Last bit_rate entry (lowest quality, more likely H.264)
  const lastBr = [...allCandidates].reverse().find(c => c.source === "bit_rate");
  if (lastBr) return lastBr.url;
  // 5. Any candidate
  return allCandidates[0].url;
}

function getDuration(video?: AwemeInfo["video"] | VideoDetail["video"], music?: { duration?: number; video_duration?: number }, fallbackDuration?: number): number {
  const raw = video?.duration ?? music?.video_duration ?? music?.duration ?? fallbackDuration ?? 0;
  return normalizeDuration(raw);
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
    log?.warn({ tiktokUrl, keys: Object.keys(data.data ?? {}) }, "SociaVault video-info: no aweme_detail");
    return null;
  }

  const mp4 = pickMp4(d.video, log);
  if (!mp4) {
    log?.warn({ tiktokUrl }, "SociaVault video-info: no mp4 url found");
    return null;
  }

  const durationSeconds = getDuration(d.video, d.music, d.duration);
  log?.info({ tiktokUrl, durationSeconds }, "SociaVault video-info resolved");
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

  const data = (await res.json()) as { data?: { search_item_list?: unknown } };
  const rawItems = data.data?.search_item_list;
  const items: AwemeInfo[] = (Array.isArray(rawItems) ? rawItems : Object.values(rawItems as Record<string, unknown> ?? {}))
    .map((i: unknown) => (i as { aweme_info?: AwemeInfo })?.aweme_info)
    .filter((a): a is AwemeInfo => !!a && typeof a === "object");

  log?.info({ query, count: items.length }, "SociaVault search raw results");
  if (!items.length) return null;

  function videoDuration(v: AwemeInfo): number {
    return getDuration(v.video, v.music);
  }

  function valid(v: AwemeInfo): boolean {
    return !v.is_ads && !!v.aweme_id && !!v.author?.unique_id;
  }

  // Prefer valid videos within ceiling, otherwise any valid video
  let chosen = items.find(v => valid(v) && videoDuration(v) > 0 && videoDuration(v) <= ceiling);
  if (!chosen) chosen = items.find(v => valid(v));
  if (!chosen) {
    log?.warn({ query }, "SociaVault search: no valid video found");
    return null;
  }

  const dur = videoDuration(chosen);
  log?.info({ aweme_id: chosen.aweme_id, author: chosen.author!.unique_id, duration: dur, desc: chosen.desc?.slice(0, 80) }, "SociaVault chosen video");

  // Try to extract MP4 directly from search result (saves the video-info API call)
  const mp4 = pickMp4(chosen.video, log);
  if (mp4) {
    const durationSeconds = dur || 15;
    log?.info({ source: "search-direct", durationSeconds }, "SociaVault URL resolved without video-info call");
    return { url: mp4, durationSeconds, portrait: true, title: `@${chosen.author!.unique_id}` };
  }

  // Fallback: call video-info endpoint
  log?.warn({ aweme_id: chosen.aweme_id }, "SociaVault: no direct URL in search result, calling video-info");
  const tiktokUrl = `https://www.tiktok.com/@${chosen.author!.unique_id}/video/${chosen.aweme_id}`;
  const resolved = await fetchVideoInfo(tiktokUrl, apiKey, log);
  if (!resolved) return null;

  return { ...resolved, durationSeconds: resolved.durationSeconds || dur || 15, title: `@${chosen.author!.unique_id}` };
}

export async function sociavaultResolve(
  tiktokUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokResolved | null> {
  return fetchVideoInfo(tiktokUrl, apiKey, log);
}
