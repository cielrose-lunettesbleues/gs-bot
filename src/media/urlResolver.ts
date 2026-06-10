const MEDIA_EXTENSION_RE = /\.(gif|mp4|webm|mov|jpg|jpeg|png|webp)(\?.*)?$/i;
const OG_IMAGE_RE = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i;

const PAGE_PATTERNS: { test: RegExp }[] = [
  { test: /^https:\/\/(www\.)?tenor\.com\/view\//i },
  { test: /^https:\/\/(www\.)?giphy\.com\/gifs\//i },
];

function isPageUrl(url: string): boolean {
  return PAGE_PATTERNS.some(({ test }) => test.test(url));
}

export async function resolveMediaUrl(url: string): Promise<string> {
  if (!isPageUrl(url)) return url;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const m = html.match(OG_IMAGE_RE);
    if (m?.[1] && MEDIA_EXTENSION_RE.test(m[1])) return m[1];
  } catch {
    // fall through to original URL
  }
  return url;
}
