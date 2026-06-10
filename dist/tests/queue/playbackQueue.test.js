"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const playbackQueue_1 = require("../../src/queue/playbackQueue");
function makeObs() {
    return {
        setSourceUrl: vitest_1.vi.fn(async (_url) => undefined),
        showSource: vitest_1.vi.fn(async () => undefined),
        hideSource: vitest_1.vi.fn(async () => undefined)
    };
}
function makeLogger() {
    return { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() };
}
function makeItem(url = "https://example.com/v.mp4", durationSeconds = 10) {
    return {
        url,
        durationSeconds,
        username: "user1",
        reply: vitest_1.vi.fn(async () => undefined)
    };
}
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.useFakeTimers();
});
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
(0, vitest_1.describe)("PlaybackQueue — drop mode", () => {
    (0, vitest_1.it)("plays immediately when idle", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());
        const result = await queue.enqueue(makeItem());
        (0, vitest_1.expect)(result.status).toBe("playing");
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(obs.showSource).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("drops when busy", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());
        await queue.enqueue(makeItem());
        const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        (0, vitest_1.expect)(result.status).toBe("dropped");
        (0, vitest_1.expect)(result.reason).toBe("busy");
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("plays next item after timer fires", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 5));
        await vitest_1.vi.runAllTimersAsync();
        (0, vitest_1.expect)(obs.hideSource).toHaveBeenCalled();
        const result2 = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        (0, vitest_1.expect)(result2.status).toBe("playing");
    });
});
(0, vitest_1.describe)("PlaybackQueue — queue mode", () => {
    (0, vitest_1.it)("queues a second item and returns position", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4"));
        const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        (0, vitest_1.expect)(result.status).toBe("queued");
        (0, vitest_1.expect)(result.position).toBe(1);
    });
    (0, vitest_1.it)("drops when queue is full", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 2 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4"));
        await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        await queue.enqueue(makeItem("https://example.com/v3.mp4"));
        const result = await queue.enqueue(makeItem("https://example.com/v4.mp4"));
        (0, vitest_1.expect)(result.status).toBe("dropped");
        (0, vitest_1.expect)(result.reason).toBe("full");
    });
    (0, vitest_1.it)("plays queued items sequentially after each timer", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 5));
        await queue.enqueue(makeItem("https://example.com/v2.mp4", 5));
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledWith("https://example.com/v1.mp4");
        await vitest_1.vi.runAllTimersAsync();
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenLastCalledWith("https://example.com/v2.mp4");
    });
});
(0, vitest_1.describe)("PlaybackQueue — replace mode", () => {
    (0, vitest_1.it)("returns replaced when busy", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "replace", maxSize: 1 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
        const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        (0, vitest_1.expect)(result.status).toBe("replaced");
    });
    (0, vitest_1.it)("plays replacement after abort resolves", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "replace", maxSize: 1 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
        await queue.enqueue(makeItem("https://example.com/v2.mp4", 5));
        await vitest_1.vi.runAllTimersAsync();
        const calls = obs.setSourceUrl.mock.calls.map((c) => c[0]);
        (0, vitest_1.expect)(calls).toContain("https://example.com/v1.mp4");
        (0, vitest_1.expect)(calls).toContain("https://example.com/v2.mp4");
    });
});
(0, vitest_1.describe)("PlaybackQueue — stop", () => {
    (0, vitest_1.it)("hides source immediately on stop", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
        await queue.stop();
        (0, vitest_1.expect)(obs.hideSource).toHaveBeenCalled();
    });
    (0, vitest_1.it)("clears pending items on stop", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
        await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        await queue.enqueue(makeItem("https://example.com/v3.mp4"));
        await queue.stop();
        await vitest_1.vi.runAllTimersAsync();
        // Only v1 was set (the playing one); v2 and v3 were cleared
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(obs.setSourceUrl).toHaveBeenCalledWith("https://example.com/v1.mp4");
    });
    (0, vitest_1.it)("allows new items after stop", async () => {
        const obs = makeObs();
        const queue = new playbackQueue_1.PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());
        await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
        await queue.stop();
        await vitest_1.vi.runAllTimersAsync();
        const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
        (0, vitest_1.expect)(result.status).toBe("playing");
    });
});
