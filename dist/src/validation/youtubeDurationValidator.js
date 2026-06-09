"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YoutubeDurationValidator = void 0;
function parseIsoDuration(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match)
        return 0;
    const h = parseInt(match[1] ?? "0", 10);
    const m = parseInt(match[2] ?? "0", 10);
    const s = parseInt(match[3] ?? "0", 10);
    return h * 3600 + m * 60 + s;
}
function extractVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname === "youtu.be") {
            return u.pathname.slice(1) || null;
        }
        if (u.hostname.endsWith("youtube.com")) {
            const fromQuery = u.searchParams.get("v");
            if (fromQuery)
                return fromQuery;
            // /embed/ID and /shorts/ID
            const parts = u.pathname.split("/").filter(Boolean);
            const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "v");
            if (idx !== -1 && parts[idx + 1])
                return parts[idx + 1];
        }
    }
    catch {
        // invalid URL
    }
    return null;
}
function isYoutubeUrl(url) {
    try {
        const u = new URL(url);
        return u.hostname === "youtu.be" || u.hostname.endsWith("youtube.com");
    }
    catch {
        return false;
    }
}
class YoutubeDurationValidator {
    config;
    constructor(config) {
        this.config = config;
    }
    async check(url) {
        if (!isYoutubeUrl(url)) {
            return { allowed: true };
        }
        const videoId = extractVideoId(url);
        if (!videoId) {
            return { allowed: true };
        }
        let data;
        try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos` +
                `?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(this.config.apiKey)}`;
            const res = await fetch(apiUrl);
            if (!res.ok) {
                return { allowed: true }; // API error → fail open
            }
            data = await res.json();
        }
        catch {
            return { allowed: true }; // network error → fail open
        }
        const item = data.items?.[0];
        if (!item?.contentDetails?.duration) {
            return { allowed: false, reason: "video_not_found" };
        }
        const durationSeconds = parseIsoDuration(item.contentDetails.duration);
        if (durationSeconds > this.config.maxDurationSeconds) {
            return { allowed: false, durationSeconds, reason: "too_long" };
        }
        return { allowed: true, durationSeconds };
    }
}
exports.YoutubeDurationValidator = YoutubeDurationValidator;
