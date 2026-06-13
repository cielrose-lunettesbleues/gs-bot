const SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter((token) => token.length >= 3);
}

function titleRelevanceScore(query: string, title: string): number {
  const normalizedQuery = normalize(query);
  const normalizedTitle = normalize(title);
  if (!normalizedQuery || !normalizedTitle) return 0;

  let score = 0;
  if (normalizedTitle.includes(normalizedQuery)) score += 3;

  const tokens = queryTokens(query);
  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 1;
  }

  return score;
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return Infinity;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export interface YoutubeSearchResult {
  url: string;
  title: string;
  durationSeconds: number;
}

interface YoutubeCandidate extends YoutubeSearchResult {
  isShort: boolean;
  relevanceScore: number;
  searchIndex: number;
}

export async function searchShortVideo(
  query: string,
  maxDurationSeconds: number,
  apiKey: string
): Promise<YoutubeSearchResult | null> {
  // maxDurationSeconds === 0 means no limit — cap at 240s (YouTube API "short" ceiling)
  const durationCeiling = maxDurationSeconds > 0 ? maxDurationSeconds : 240;

  const searchParams = new URLSearchParams({
    part: "id",
    type: "video",
    videoDuration: "short",
    q: query,
    maxResults: "10",
    key: apiKey
  });

  const searchRes = await fetch(`${SEARCH_API}?${searchParams}`);
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    items?: Array<{ id: { videoId: string } }>;
  };
  const ids = (searchData.items ?? []).map((i) => i.id.videoId).filter(Boolean);
  if (!ids.length) return null;

  const videosParams = new URLSearchParams({
    part: "contentDetails,snippet",
    id: ids.join(","),
    key: apiKey
  });

  const videosRes = await fetch(`${VIDEOS_API}?${videosParams}`);
  if (!videosRes.ok) return null;

  const videosData = (await videosRes.json()) as {
    items?: Array<{
      id: string;
      contentDetails: { duration: string };
      snippet: {
        title: string;
        thumbnails?: {
          high?: { width: number; height: number };
          default?: { width: number; height: number };
        };
      };
    }>;
  };

  const items = videosData.items ?? [];

  const candidates: YoutubeCandidate[] = items.flatMap((item, index) => {
    const duration = parseDuration(item.contentDetails.duration);
    if (duration <= 0) return [];
    const thumb = item.snippet.thumbnails?.high ?? item.snippet.thumbnails?.default;
    const isShort = Boolean(thumb && thumb.height > thumb.width);
    return [{
      url: isShort
        ? `https://www.youtube.com/shorts/${item.id}`
        : `https://www.youtube.com/watch?v=${item.id}`,
      title: item.snippet.title,
      durationSeconds: duration,
      isShort,
      relevanceScore: titleRelevanceScore(query, item.snippet.title),
      searchIndex: index
    }];
  });

  if (!candidates.length) return null;

  const withinDuration = candidates.filter((candidate) => candidate.durationSeconds <= durationCeiling);
  const shortCandidates = withinDuration.filter((candidate) => candidate.isShort);
  const landscapeCandidates = withinDuration.filter((candidate) => !candidate.isShort);

  function sortCandidates(a: YoutubeCandidate, b: YoutubeCandidate): number {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return a.searchIndex - b.searchIndex;
  }

  const bestShort = [...shortCandidates].sort(sortCandidates)[0];
  const bestLandscape = [...landscapeCandidates].sort(sortCandidates)[0];

  if (bestShort && bestLandscape) {
    if (bestShort.relevanceScore > 0 && bestShort.relevanceScore >= bestLandscape.relevanceScore) {
      return { url: bestShort.url, title: bestShort.title, durationSeconds: bestShort.durationSeconds };
    }
    return { url: bestLandscape.url, title: bestLandscape.title, durationSeconds: bestLandscape.durationSeconds };
  }

  if (bestShort) {
    return { url: bestShort.url, title: bestShort.title, durationSeconds: bestShort.durationSeconds };
  }

  if (bestLandscape) {
    return { url: bestLandscape.url, title: bestLandscape.title, durationSeconds: bestLandscape.durationSeconds };
  }

  const fallbackShort = candidates.find((candidate) => candidate.isShort);
  if (fallbackShort) {
    return { url: fallbackShort.url, title: fallbackShort.title, durationSeconds: fallbackShort.durationSeconds };
  }

  const fallbackLandscape = candidates[0];
  return {
    url: fallbackLandscape.url,
    title: fallbackLandscape.title,
    durationSeconds: fallbackLandscape.durationSeconds
  };
}
