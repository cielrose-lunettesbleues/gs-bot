const API_BASE = "https://api.sociavault.com/v1/scrape";
const TIKTOK_BASE = `${API_BASE}/tiktok`;
const INSTAGRAM_BASE = `${API_BASE}/instagram`;

export interface TiktokResolved {
  url: string;
  durationSeconds: number;
  portrait: boolean;
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

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// The Share button in the mobile apps hands out short links that carry no id.
// Following the redirect reveals the canonical URL and costs no API credit.
export async function expandShortLink(url: string, log?: SimpleLogger): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000)
    });
    return res.url || url;
  } catch (err) {
    log?.warn({ url, err: String(err) }, "Short link expansion failed");
    return url;
  }
}

// Payloads arrive wrapped in one or two {success, data} envelopes depending on
// the trim setting, so walk down to whichever level carries the key.
function findInEnvelopes(payload: unknown, key: string): Record<string, unknown> | null {
  let node: unknown = payload;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!node || typeof node !== "object") return null;
    const found = (node as Record<string, unknown>)[key];
    if (found && typeof found === "object") return found as Record<string, unknown>;
    node = (node as { data?: unknown }).data;
  }
  return null;
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
      `${TIKTOK_BASE}/search/keyword?query=${encodeURIComponent(query)}&count=10`,
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

// Covers photo posts too: they carry an id of the same shape and TikTok embeds
// them through the same player.
const TIKTOK_ID_RE = /\/(?:video|photo)\/(\d+)/;
const TIKTOK_SHORT_RE = /^https:\/\/(?:vm|vt|m)\.tiktok\.com\/|^https:\/\/(?:www\.)?tiktok\.com\/t\//i;

export function isTiktokShortLink(url: string): boolean {
  return TIKTOK_SHORT_RE.test(url);
}

const tiktokCache = new Map<string, { value: TiktokResolved; at: number }>();
const TIKTOK_CACHE_TTL_MS = 10 * 60 * 1000;
const TIKTOK_CACHE_MAX = 200;

export function clearTiktokCache(): void {
  tiktokCache.clear();
}

interface BitRateEntry {
  is_bytevc1?: unknown;
  play_addr?: unknown;
}

function toValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>);
  return [];
}

function firstHttpsUrl(addr: unknown): string {
  const list = (addr as { url_list?: unknown } | undefined)?.url_list;
  const found = toValues(list).find((entry) => typeof entry === "string" && entry.startsWith("https://"));
  return typeof found === "string" ? found : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

// The embed player starts muted and, in consent regions, hides the video behind
// a cookie banner nobody can click inside an OBS source. So a real file is
// needed -- and it must be H.264: ByteVC1 is HEVC, which the OBS browser cannot
// decode. That codec trap is the reason the embed was used in the first place.
function pickPlayableVideo(video: Record<string, unknown>): { url: string; width: number; height: number } | null {
  const playAddr = video.play_addr as { width?: unknown; height?: unknown } | undefined;
  const fallbackWidth = asNumber(playAddr?.width);
  const fallbackHeight = asNumber(playAddr?.height);

  for (const entry of toValues(video.bit_rate) as BitRateEntry[]) {
    if (entry?.is_bytevc1) continue;
    const url = firstHttpsUrl(entry?.play_addr);
    if (!url) continue;
    const addr = entry.play_addr as { width?: unknown; height?: unknown };
    return {
      url,
      width: asNumber(addr?.width) || fallbackWidth,
      height: asNumber(addr?.height) || fallbackHeight
    };
  }

  const direct = firstHttpsUrl(video.download_no_watermark_addr) || firstHttpsUrl(video.download_addr);
  if (direct) return { url: direct, width: fallbackWidth, height: fallbackHeight };

  return null;
}

async function fetchTiktokDirect(
  url: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokResolved | null> {
  let res: Response;
  try {
    res = await fetch(`${TIKTOK_BASE}/video-info?url=${encodeURIComponent(url)}`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    log?.warn({ url, err: String(err) }, "SociaVault TikTok fetch failed");
    return null;
  }
  if (!res.ok) {
    log?.warn({ url, status: res.status }, `SociaVault TikTok refused with HTTP ${res.status}`);
    return null;
  }

  const detail = findInEnvelopes(await res.json(), "aweme_detail");
  const video = detail?.video;
  if (!video || typeof video !== "object") {
    log?.warn({ url }, "SociaVault TikTok: no video in response");
    return null;
  }

  const picked = pickPlayableVideo(video as Record<string, unknown>);
  if (!picked) {
    log?.warn({ url }, "SociaVault TikTok: no H.264 playable url");
    return null;
  }

  const duration = normalizeDuration(asNumber((video as Record<string, unknown>).duration));
  log?.info({ url, durationSeconds: duration, width: picked.width, height: picked.height }, "SociaVault TikTok resolved");

  return {
    url: picked.url,
    durationSeconds: duration,
    portrait: picked.height >= picked.width
  };
}

export async function sociavaultResolve(
  tiktokUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<TiktokResolved | null> {
  let target = tiktokUrl;
  let match = TIKTOK_ID_RE.exec(target);

  // A phone share link (vm./vt./m. or /t/) has to be expanded first
  if (!match && isTiktokShortLink(target)) {
    target = await expandShortLink(target, log);
    match = TIKTOK_ID_RE.exec(target);
  }

  if (!match) {
    log?.warn({ tiktokUrl, expanded: target }, "SociaVault: cannot extract aweme_id from URL");
    return null;
  }

  const canonical = target.split("?")[0];
  const cached = tiktokCache.get(canonical);
  if (cached && Date.now() - cached.at < TIKTOK_CACHE_TTL_MS) return cached.value;

  const direct = apiKey ? await fetchTiktokDirect(canonical, apiKey, log) : null;
  if (direct) {
    if (tiktokCache.size >= TIKTOK_CACHE_MAX) tiktokCache.clear();
    tiktokCache.set(canonical, { value: direct, at: Date.now() });
    return direct;
  }

  // Last resort, deliberately not cached so the next try can still get a file:
  // the embed plays, but muted and possibly behind a cookie banner.
  log?.warn({ tiktokUrl: canonical }, "SociaVault TikTok: falling back to the embed player");
  return { url: embedUrl(match[1]), durationSeconds: 0, portrait: true };
}

// ─── YouTube ──────────────────────────────────────────────────────────────────

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]+)/i;

const youtubeDurationCache = new Map<string, { value: number; at: number }>();
const YOUTUBE_CACHE_TTL_MS = 10 * 60 * 1000;
const YOUTUBE_CACHE_MAX = 200;

export function clearYoutubeDurationCache(): void {
  youtubeDurationCache.clear();
}

// durationMs peut être au premier niveau ou sous une enveloppe {success, data}
function findDurationMs(payload: unknown): number {
  let node: unknown = payload;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!node || typeof node !== "object") return 0;
    const value = (node as { durationMs?: unknown }).durationMs;
    if (typeof value === "number" && value > 0) return value;
    node = (node as { data?: unknown }).data;
  }
  return 0;
}

/**
 * Longueur réelle d'une vidéo YouTube, en secondes. L'endpoint ne donne aucun
 * flux lisible, seulement des métadonnées: c'est la durée qui nous intéresse,
 * pour jouer la vidéo jusqu'à sa fin au lieu de la couper arbitrairement.
 * Coûte un crédit, et renvoie null plutôt que d'échouer.
 */
export async function sociavaultYoutubeDuration(
  youtubeUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<number | null> {
  const match = YOUTUBE_ID_RE.exec(youtubeUrl);
  if (!match) return null;

  const videoId = match[1];
  const cached = youtubeDurationCache.get(videoId);
  if (cached && Date.now() - cached.at < YOUTUBE_CACHE_TTL_MS) return cached.value;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/youtube/video?url=${encodeURIComponent(youtubeUrl)}`, {
      headers: { "X-API-Key": apiKey },
      signal: AbortSignal.timeout(10000)
    });
  } catch (err) {
    log?.warn({ youtubeUrl, err: String(err) }, "SociaVault YouTube fetch failed");
    return null;
  }
  if (!res.ok) {
    log?.warn({ youtubeUrl, status: res.status }, `SociaVault YouTube refused with HTTP ${res.status}`);
    return null;
  }

  const durationMs = findDurationMs(await res.json());
  if (durationMs <= 0) {
    log?.warn({ youtubeUrl }, "SociaVault YouTube: no duration in response");
    return null;
  }

  const seconds = Math.ceil(durationMs / 1000);
  if (youtubeDurationCache.size >= YOUTUBE_CACHE_MAX) youtubeDurationCache.clear();
  youtubeDurationCache.set(videoId, { value: seconds, at: Date.now() });
  log?.info({ youtubeUrl, durationSeconds: seconds }, "SociaVault YouTube duration resolved");
  return seconds;
}

// ─── Instagram ────────────────────────────────────────────────────────────────

export interface InstagramResolved {
  url: string;
  durationSeconds: number;
  portrait: boolean;
}

// Reels, posts and IGTV, with or without a leading /<username>/ segment
const INSTAGRAM_POST_RE =
  /^https:\/\/(?:www\.)?instagram\.com\/(?:[^/?#]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i;

export function isInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_RE.test(url);
}

// Share menus append tracking parameters (?igsh=, ?cplk=, ...). They are
// dropped before the API call: they carry no meaning for the lookup, and a
// base64 value with padding is a needless thing to hand to a parser. It also
// means the same post shared twice hits one cache entry, hence one credit.
export function canonicalInstagramUrl(url: string): string | null {
  const match = INSTAGRAM_POST_RE.exec(url);
  if (!match) return null;

  const kind = match[1].toLowerCase() === "reels" ? "reel" : match[1].toLowerCase();
  return `https://www.instagram.com/${kind}/${match[2]}/`;
}

// The app also produces /share/<id> links, which only reveal the post after a
// redirect.
const INSTAGRAM_SHARE_RE = /^https:\/\/(?:www\.)?instagram\.com\/share\//i;

export function isInstagramShareUrl(url: string): boolean {
  return INSTAGRAM_SHARE_RE.test(url);
}

// Successful resolutions are memoised briefly so a submit-page preview and the
// send that follows it cost one credit instead of two. The CDN links stay valid
// far longer than this window.
const instagramCache = new Map<string, { value: InstagramResolved; at: number }>();
const INSTAGRAM_CACHE_TTL_MS = 10 * 60 * 1000;
const INSTAGRAM_CACHE_MAX = 200;

export function clearInstagramCache(): void {
  instagramCache.clear();
}

interface ShortcodeMedia {
  video_url?: unknown;
  video_duration?: unknown;
  dimensions?: unknown;
}

function findShortcodeMedia(payload: unknown): ShortcodeMedia | null {
  return findInEnvelopes(payload, "xdt_shortcode_media") as ShortcodeMedia | null;
}

// Instagram embeds never autoplay, so the overlay needs the direct video file:
// it then plays as a plain <video> and reports its own end.
export async function sociavaultResolveInstagram(
  instagramUrl: string,
  apiKey: string,
  log?: SimpleLogger
): Promise<InstagramResolved | null> {
  let target = instagramUrl;
  if (!isInstagramPostUrl(target)) {
    if (!isInstagramShareUrl(target)) {
      log?.warn({ instagramUrl }, "SociaVault: not an Instagram post or reel URL");
      return null;
    }
    target = await expandShortLink(target, log);
  }

  const canonical = canonicalInstagramUrl(target);
  if (!canonical) {
    log?.warn({ instagramUrl, expanded: target }, "SociaVault: link did not lead to an Instagram post");
    return null;
  }

  const cached = instagramCache.get(canonical);
  if (cached && Date.now() - cached.at < INSTAGRAM_CACHE_TTL_MS) return cached.value;

  let res: Response;
  try {
    res = await fetch(
      `${INSTAGRAM_BASE}/post-info?url=${encodeURIComponent(canonical)}`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(10000) }
    );
  } catch (err) {
    log?.warn({ instagramUrl, canonical, err: String(err) }, "SociaVault Instagram fetch failed");
    return null;
  }
  // The status goes in the message, not only in the fields: log viewers show
  // the message alone, and this status is the whole diagnosis (402 out of
  // credits, 401/403 bad key, 404 unknown post, 400 rejected url).
  if (!res.ok) {
    log?.warn(
      { instagramUrl, canonical, status: res.status },
      `SociaVault Instagram refused with HTTP ${res.status}`
    );
    return null;
  }

  const media = findShortcodeMedia(await res.json());
  const videoUrl = media && typeof media.video_url === "string" ? media.video_url : "";
  if (!videoUrl) {
    log?.warn({ instagramUrl, canonical }, "SociaVault Instagram: post carries no video");
    return null;
  }

  const rawDuration = typeof media?.video_duration === "number" ? media.video_duration : 0;
  const dimensions = (media?.dimensions ?? {}) as { width?: unknown; height?: unknown };
  const width = typeof dimensions.width === "number" ? dimensions.width : 0;
  const height = typeof dimensions.height === "number" ? dimensions.height : 0;

  log?.info(
    { instagramUrl, durationSeconds: rawDuration, width, height },
    "SociaVault Instagram resolved"
  );

  const resolved: InstagramResolved = {
    url: videoUrl,
    durationSeconds: rawDuration > 0 ? Math.ceil(rawDuration) : 0,
    // Reels are vertical; only a clearly landscape post plays full width
    portrait: height >= width
  };

  if (instagramCache.size >= INSTAGRAM_CACHE_MAX) instagramCache.clear();
  instagramCache.set(canonical, { value: resolved, at: Date.now() });
  return resolved;
}
