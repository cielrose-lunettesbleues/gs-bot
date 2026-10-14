import { isPageUrl, resolveMediaUrl } from "./urlResolver";
import { isInstagramPostUrl, isInstagramShareUrl } from "./sociavaultClient";

// What the submit page needs in order to show the viewer what they are about
// to send, without reimplementing the overlay player.
export type MediaPreview =
  | { kind: "youtube"; embedUrl: string; thumbnailUrl: string; portrait: boolean }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string; portrait: boolean; durationSeconds: number }
  | { kind: "unsupported"; reason: string };

type Resolver = (url: string) => Promise<{ url: string; durationSeconds: number; portrait: boolean } | null>;

export interface PreviewDeps {
  instagramResolve?: Resolver;
  tiktokResolve?: Resolver;
}

const YOUTUBE_RE = /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/i;
const IMAGE_RE = /\.(gif|png|jpe?g|webp)(\?.*)?$/i;
const VIDEO_RE = /\.(mp4|webm|mov)(\?.*)?$/i;

export function youtubeId(url: string): string | null {
  const match = YOUTUBE_RE.exec(url);
  return match ? match[1] : null;
}

export async function buildMediaPreview(url: string, deps: PreviewDeps = {}): Promise<MediaPreview> {
  const videoId = youtubeId(url);
  if (videoId) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0`,
      // hqdefault rather than maxres: it exists for every video, Shorts included
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      // Previewed in the shape the overlay will actually give it
      portrait: /youtube\.com\/shorts\//i.test(url)
    };
  }

  if (/tiktok\.com/i.test(url)) {
    if (!deps.tiktokResolve) return { kind: "unsupported", reason: "tiktok_not_configured" };
    const resolved = await deps.tiktokResolve(url);
    // A TikTok only resolves to a real file now, so there is nothing left that
    // would need an iframe: no file means no preview and no send.
    if (!resolved) return { kind: "unsupported", reason: "tiktok_unresolved" };
    return {
      kind: "video",
      url: resolved.url,
      portrait: resolved.portrait,
      durationSeconds: resolved.durationSeconds
    };
  }

  if (isInstagramPostUrl(url) || isInstagramShareUrl(url)) {
    if (!deps.instagramResolve) return { kind: "unsupported", reason: "instagram_not_configured" };
    const resolved = await deps.instagramResolve(url);
    if (!resolved) return { kind: "unsupported", reason: "instagram_unresolved" };
    return {
      kind: "video",
      url: resolved.url,
      portrait: resolved.portrait,
      durationSeconds: resolved.durationSeconds
    };
  }

  if (/instagram\.com/i.test(url)) {
    return { kind: "unsupported", reason: "instagram_not_a_post" };
  }

  // Tenor and Giphy page links hide the real file behind an og:image tag
  const direct = isPageUrl(url) ? await resolveMediaUrl(url) : url;

  if (IMAGE_RE.test(direct)) return { kind: "image", url: direct };
  if (VIDEO_RE.test(direct)) return { kind: "video", url: direct, portrait: false, durationSeconds: 0 };

  return { kind: "unsupported", reason: "no_preview" };
}
