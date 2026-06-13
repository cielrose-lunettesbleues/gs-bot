const MEDIA_EXTENSION_RE = /\.(gif|mp4|webm|mov|jpg|jpeg|png|webp)(\?.*)?$/i;
// Tenor/Giphy can place attributes in either order
const OG_IMAGE_RES = [
  /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
  /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i,
];

const PAGE_PATTERNS: { test: RegExp }[] = [
  { test: /^https:\/\/(www\.)?tenor\.com\/view\//i },
  { test: /^https:\/\/(www\.)?giphy\.com\/gifs\//i },
];

export function isPageUrl(url: string): boolean {
  return PAGE_PATTERNS.some(({ test }) => test.test(url));
}

export async function resolveMediaUrl(url: string): Promise<string> {
  if (!isPageUrl(url)) return url;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    });
    const html = await res.text();
    for (const re of OG_IMAGE_RES) {
      const m = html.match(re);
      if (m?.[1] && MEDIA_EXTENSION_RE.test(m[1])) return m[1];
    }
  } catch {
    // fall through to original URL
  }
  return url;
}
