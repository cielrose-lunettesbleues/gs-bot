"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const youtubeDurationValidator_1 = require("../../src/validation/youtubeDurationValidator");
const config = { apiKey: "test-key", maxDurationSeconds: 120 };
function mockFetch(durationIso, status = 200) {
    const body = durationIso === null
        ? { items: [] }
        : { items: [{ contentDetails: { duration: durationIso } }] };
    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn(async () => ({
        ok: status === 200,
        json: async () => body
    })));
}
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.unstubAllGlobals();
});
(0, vitest_1.describe)("YoutubeDurationValidator — URL detection", () => {
    (0, vitest_1.it)("skips non-YouTube URLs", async () => {
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://streamable.com/abc");
        (0, vitest_1.expect)(result.allowed).toBe(true);
        // fetch should not be called
        (0, vitest_1.expect)(vitest_1.vi.isMockFunction(globalThis.fetch)).toBe(false);
    });
    (0, vitest_1.it)("handles youtu.be short links", async () => {
        mockFetch("PT1M30S");
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/dQw4w9WgXcQ");
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.durationSeconds).toBe(90);
    });
    (0, vitest_1.it)("handles youtube.com/watch?v= links", async () => {
        mockFetch("PT2M0S");
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.durationSeconds).toBe(120);
    });
    (0, vitest_1.it)("handles youtube.com/shorts/ links", async () => {
        mockFetch("PT30S");
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://www.youtube.com/shorts/abc123");
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
});
(0, vitest_1.describe)("YoutubeDurationValidator — duration parsing", () => {
    (0, vitest_1.it)("allows video within limit", async () => {
        mockFetch("PT1M59S"); // 119s
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(result.durationSeconds).toBe(119);
    });
    (0, vitest_1.it)("allows video exactly at limit", async () => {
        mockFetch("PT2M0S"); // 120s
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
    (0, vitest_1.it)("rejects video exceeding limit", async () => {
        mockFetch("PT2M1S"); // 121s
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.reason).toBe("too_long");
        (0, vitest_1.expect)(result.durationSeconds).toBe(121);
    });
    (0, vitest_1.it)("parses hours correctly", async () => {
        mockFetch("PT1H30M0S"); // 5400s
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.durationSeconds).toBe(5400);
    });
});
(0, vitest_1.describe)("YoutubeDurationValidator — error handling", () => {
    (0, vitest_1.it)("fails open on API error (non-200)", async () => {
        mockFetch("PT1M", 500);
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
    (0, vitest_1.it)("fails open on network error", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn(async () => { throw new Error("network error"); }));
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
    (0, vitest_1.it)("rejects video not found (empty items)", async () => {
        mockFetch(null);
        const validator = new youtubeDurationValidator_1.YoutubeDurationValidator(config);
        const result = await validator.check("https://youtu.be/abc");
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.reason).toBe("video_not_found");
    });
});
