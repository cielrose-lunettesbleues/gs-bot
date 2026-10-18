import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackQueue } from "../../src/queue/playbackQueue";

function makeObs() {
  return {
    setSourceUrl: vi.fn(async (_url: string) => undefined),
    showSource: vi.fn(async () => undefined),
    hideSource: vi.fn(async () => undefined)
  };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeItem(url = "https://example.com/v.mp4", durationSeconds = 10) {
  return {
    url,
    durationSeconds,
    username: "user1",
    reply: vi.fn(async () => undefined)
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlaybackQueue — drop mode", () => {
  it("plays immediately when idle", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());

    const result = await queue.enqueue(makeItem());
    expect(result.status).toBe("playing");
    expect(obs.setSourceUrl).toHaveBeenCalledTimes(1);
    expect(obs.showSource).toHaveBeenCalledTimes(1);
  });

  it("drops when busy", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());

    await queue.enqueue(makeItem());
    const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));

    expect(result.status).toBe("dropped");
    expect((result as { status: "dropped"; reason: string }).reason).toBe("busy");
    expect(obs.setSourceUrl).toHaveBeenCalledTimes(1);
  });

  it("plays next item after timer fires", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "drop", maxSize: 1 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 5));
    await vi.runAllTimersAsync();

    expect(obs.hideSource).toHaveBeenCalled();

    const result2 = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
    expect(result2.status).toBe("playing");
  });
});

describe("PlaybackQueue — queue mode", () => {
  it("queues a second item and returns position", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4"));
    const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));

    expect(result.status).toBe("queued");
    expect((result as { status: "queued"; position: number }).position).toBe(1);
  });

  it("drops when queue is full", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 2 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4"));
    await queue.enqueue(makeItem("https://example.com/v2.mp4"));
    await queue.enqueue(makeItem("https://example.com/v3.mp4"));
    const result = await queue.enqueue(makeItem("https://example.com/v4.mp4"));

    expect(result.status).toBe("dropped");
    expect((result as { status: "dropped"; reason: string }).reason).toBe("full");
  });

  it("plays queued items sequentially after each timer", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 5));
    await queue.enqueue(makeItem("https://example.com/v2.mp4", 5));

    expect(obs.setSourceUrl).toHaveBeenCalledTimes(1);
    expect(obs.setSourceUrl).toHaveBeenCalledWith("https://example.com/v1.mp4");

    await vi.runAllTimersAsync();

    expect(obs.setSourceUrl).toHaveBeenCalledTimes(2);
    expect(obs.setSourceUrl).toHaveBeenLastCalledWith("https://example.com/v2.mp4");
  });
});

describe("PlaybackQueue — replace mode", () => {
  it("returns replaced when busy", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "replace", maxSize: 1 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
    const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));

    expect(result.status).toBe("replaced");
  });

  it("plays replacement after abort resolves", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "replace", maxSize: 1 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
    await queue.enqueue(makeItem("https://example.com/v2.mp4", 5));

    await vi.runAllTimersAsync();

    const calls = obs.setSourceUrl.mock.calls.map((c) => c[0]);
    expect(calls).toContain("https://example.com/v1.mp4");
    expect(calls).toContain("https://example.com/v2.mp4");
  });
});

describe("PlaybackQueue — stop", () => {
  it("hides source immediately on stop", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
    await queue.stop();

    expect(obs.hideSource).toHaveBeenCalled();
  });

  it("clears pending items on stop", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
    await queue.enqueue(makeItem("https://example.com/v2.mp4"));
    await queue.enqueue(makeItem("https://example.com/v3.mp4"));
    await queue.stop();
    await vi.runAllTimersAsync();

    // Only v1 was set (the playing one); v2 and v3 were cleared
    expect(obs.setSourceUrl).toHaveBeenCalledTimes(1);
    expect(obs.setSourceUrl).toHaveBeenCalledWith("https://example.com/v1.mp4");
  });

  it("allows new items after stop", async () => {
    const obs = makeObs();
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger());

    await queue.enqueue(makeItem("https://example.com/v1.mp4", 30));
    await queue.stop();
    await vi.runAllTimersAsync();

    const result = await queue.enqueue(makeItem("https://example.com/v2.mp4"));
    expect(result.status).toBe("playing");
  });
});

describe("PlaybackQueue — requested cut", () => {
  it("passes cutAfterSeconds to the start event", async () => {
    const events: Array<Record<string, unknown>> = [];
    const queue = new PlaybackQueue(makeObs(), { mode: "queue", maxSize: 2 }, makeLogger(), (e) =>
      events.push(e as unknown as Record<string, unknown>)
    );

    await queue.enqueue({ ...makeItem(), cutAfterSeconds: 10 });
    await vi.advanceTimersByTimeAsync(1);

    expect(events[0]).toMatchObject({ type: "start", cutAfterSeconds: 10 });
  });

  it("leaves cutAfterSeconds undefined when none was requested", async () => {
    const events: Array<Record<string, unknown>> = [];
    const queue = new PlaybackQueue(makeObs(), { mode: "queue", maxSize: 2 }, makeLogger(), (e) =>
      events.push(e as unknown as Record<string, unknown>)
    );

    await queue.enqueue(makeItem());
    await vi.advanceTimersByTimeAsync(1);

    expect(events[0].cutAfterSeconds).toBeUndefined();
  });
});

describe("PlaybackQueue — end reported by the overlay", () => {
  async function startedQueue() {
    const obs = makeObs();
    const events: Array<{ type: string; playbackId?: number; url?: string }> = [];
    const queue = new PlaybackQueue(obs, { mode: "queue", maxSize: 3 }, makeLogger(), (e) => events.push(e));
    // A long expected length: the overlay knows better when the clip is over
    await queue.enqueue(makeItem("https://example.com/v1.mp4", 600));
    await queue.enqueue(makeItem("https://example.com/v2.mp4", 600));
    await vi.advanceTimersByTimeAsync(0);
    return { queue, events };
  }

  it("moves on as soon as the overlay reports the current clip finished", async () => {
    const { queue, events } = await startedQueue();
    const first = events.find((e) => e.type === "start")!;

    expect(queue.finishCurrent(first.playbackId!)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    // No waiting out the 600 s the server expected
    const starts = events.filter((e) => e.type === "start");
    expect(starts.map((e) => e.url)).toEqual(["https://example.com/v1.mp4", "https://example.com/v2.mp4"]);
    expect(starts[1].playbackId).not.toBe(first.playbackId);
    expect(queue.getState()).toEqual({ busy: true, pendingCount: 0 });
  });

  it("ignores a late report, so it can never cut the next clip short", async () => {
    const { queue, events } = await startedQueue();
    const first = events.find((e) => e.type === "start")!;
    queue.finishCurrent(first.playbackId!);
    await vi.advanceTimersByTimeAsync(0);

    // A second overlay, or a retry, reporting the same clip again
    expect(queue.finishCurrent(first.playbackId!)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(events.filter((e) => e.type === "stop")).toHaveLength(1);
  });

  it("still ends on its own timer when no overlay answers", async () => {
    const { queue } = await startedQueue();
    await vi.advanceTimersByTimeAsync(1200 * 1000);
    expect(queue.getState()).toEqual({ busy: false, pendingCount: 0 });
  });
});

describe("PlaybackQueue — emergency stop event", () => {
  it("tells the overlays even when nothing is queued, so a lingering TTS is cut too", async () => {
    const events: Array<{ type: string; emergency?: boolean }> = [];
    const queue = new PlaybackQueue(makeObs(), { mode: "queue", maxSize: 3 }, makeLogger(), (e) => events.push(e));

    await queue.stop();

    expect(events).toEqual([{ type: "stop", emergency: true }]);
  });
});
