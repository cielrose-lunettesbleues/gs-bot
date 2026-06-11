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
  desc?: string;
  author?: { unique_id?: string };
  video?: { duration?: number };
  music?: { duration?: number; video_duration?: number };
  is_ads?: boolean;
}

function normalizeDuration(d: number): number {
  return d > 600 ? Math.round(d / 1000) : d;
}

function toItems(v: unknown): AwemeInfo[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>);
  return raw
    .map((i: unknown) => (i as { aweme_info?: AwemeInfo })?.aweme_info)
    .filter((a): a is AwemeInfo => !!a && typeof a === "object");
}

function embedUrl(awemeId: string): string {
  return `https://www.tiktok.com/embed/v2/${awemeId}?autoplay=1`;
}

function videoDuration(v: AwemeInfo): number {
  const d = v.video?.duration ?? v.music?.video_duration ?? v.music?.duration ?? 0;
  return normalizeDuration(d);
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
  const items = toItems(data.data?.search_item_list);
  log?.info({ query, count: items.length }, "SociaVault search raw results");
  if (!items.length) return null;

  function valid(v: AwemeInfo): boolean {
    return !v.is_ads && !!v.aweme_id && !!v.author?.unique_id;
  }

  const dur = (v: AwemeInfo) => videoDuration(v);

  let chosen = items.find(v => valid(v) && dur(v) > 0 && dur(v) <= ceiling);
  if (!chosen) chosen = items.find(v => valid(v));
  if (!chosen) {
    log?.warn({ query }, "SociaVault search: no valid video found");
    return null;
  }

  const durationSeconds = dur(chosen) || 15;
  log?.info({
    aweme_id: chosen.aweme_id,
    author: chosen.author!.unique_id,
    duration: durationSeconds,
    desc: chosen.desc?.slice(0, 80)
  }, "SociaVault chosen video");

  return {
    url: embedUrl(chosen.aweme_id!),
    durationSeconds,
    portrait: true,
    title: `@${chosen.author!.unique_id}`
  };
}

export async function sociavaultResolve(
  tiktokUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokResolved | null> {
  const m = tiktokUrl.match(/\/video\/(\d+)/);
  if (!m) {
    log?.warn({ tiktokUrl }, "SociaVault: cannot extract aweme_id from URL");
    return null;
  }
  // Embed URL bypasses the H.265 codec issue — TikTok's own player handles it
  return { url: embedUrl(m[1]), durationSeconds: 0, portrait: true };
}
