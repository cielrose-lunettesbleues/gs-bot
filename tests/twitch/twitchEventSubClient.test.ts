import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TwitchEventSubClient,
  extractRedemption,
  fetchBroadcasterId,
  type ChannelPointsRedemption,
  type EventSubConfig
} from "../../src/twitch/twitchEventSubClient";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static lastInstance: MockWebSocket | null = null;

  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.lastInstance = this;
  }

  close(): void {
    this.onclose?.();
  }

  simulateMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeConfig(overrides: Partial<EventSubConfig> = {}): EventSubConfig {
  return {
    clientId: "test-client-id",
    accessToken: "test-token",
    broadcasterId: "123456",
    rewardId: "",
    ...overrides
  };
}

function mockFetchOk(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, text: async () => "" })
  );
}

// ---------------------------------------------------------------------------
// extractRedemption
// ---------------------------------------------------------------------------

describe("extractRedemption", () => {
  it("maps Twitch event fields to ChannelPointsRedemption", () => {
    const event = {
      id: "redemption-id",
      user_id: "99",
      user_login: "alice",
      user_input: "https://youtu.be/abc",
      reward: { id: "reward-id", title: "Green Screen" }
    };

    const result = extractRedemption(event);

    expect(result).toEqual<ChannelPointsRedemption>({
      id: "redemption-id",
      userId: "99",
      username: "alice",
      userInput: "https://youtu.be/abc",
      rewardId: "reward-id",
      rewardTitle: "Green Screen"
    });
  });

  it("defaults userInput to empty string when absent", () => {
    const event = {
      id: "r",
      user_id: "1",
      user_login: "bob",
      reward: { id: "rw", title: "GS" }
    };
    expect(extractRedemption(event).userInput).toBe("");
  });
});

// ---------------------------------------------------------------------------
// fetchBroadcasterId
// ---------------------------------------------------------------------------

describe("fetchBroadcasterId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the broadcaster user ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: "12345" }] })
      })
    );

    const id = await fetchBroadcasterId("mychannel", "client-id", "token");
    expect(id).toBe("12345");
  });

  it("throws if channel not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    );

    await expect(fetchBroadcasterId("unknown", "c", "t")).rejects.toThrow("not found");
  });

  it("throws on non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" })
    );

    await expect(fetchBroadcasterId("chan", "c", "t")).rejects.toThrow("401");
  });
});

// ---------------------------------------------------------------------------
// TwitchEventSubClient — connection
// ---------------------------------------------------------------------------

describe("TwitchEventSubClient", () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    vi.stubGlobal("WebSocket", MockWebSocket);
    mockFetchOk();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("resolves connect() after session_welcome + successful subscribe", async () => {
    const client = new TwitchEventSubClient(makeConfig(), vi.fn(), makeLogger());

    const connectPromise = client.connect();
    const ws = MockWebSocket.lastInstance!;

    ws.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "sess-abc" } }
    });

    await connectPromise;

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("eventsub/subscriptions"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("includes reward_id in subscription when configured", async () => {
    const client = new TwitchEventSubClient(
      makeConfig({ rewardId: "reward-xyz" }),
      vi.fn(),
      makeLogger()
    );

    const connectPromise = client.connect();
    MockWebSocket.lastInstance!.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "sess-1" } }
    });
    await connectPromise;

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.condition.reward_id).toBe("reward-xyz");
    expect(body.condition.broadcaster_user_id).toBe("123456");
  });

  it("omits reward_id when not configured", async () => {
    const client = new TwitchEventSubClient(makeConfig({ rewardId: "" }), vi.fn(), makeLogger());
    const connectPromise = client.connect();
    MockWebSocket.lastInstance!.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "sess-2" } }
    });
    await connectPromise;

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.condition).not.toHaveProperty("reward_id");
  });

  it("rejects connect() when subscribe returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" })
    );

    const client = new TwitchEventSubClient(makeConfig(), vi.fn(), makeLogger());
    const connectPromise = client.connect();
    MockWebSocket.lastInstance!.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "sess-3" } }
    });

    await expect(connectPromise).rejects.toThrow("403");
  });

  it("rejects connect() on WebSocket error", async () => {
    const client = new TwitchEventSubClient(makeConfig(), vi.fn(), makeLogger());
    const connectPromise = client.connect();
    MockWebSocket.lastInstance!.onerror?.();

    await expect(connectPromise).rejects.toThrow("WebSocket error");
  });

  it("rejects connect() if socket closes before session_welcome", async () => {
    const client = new TwitchEventSubClient(makeConfig(), vi.fn(), makeLogger());
    const connectPromise = client.connect();
    // Simulate: WebSocket closes with this.ws === ws (no reconnect assigned yet)
    MockWebSocket.lastInstance!.onclose?.();

    await expect(connectPromise).rejects.toThrow("closed before connection established");
  });

  it("ignores session_keepalive messages", async () => {
    const client = new TwitchEventSubClient(makeConfig(), vi.fn(), makeLogger());
    const connectPromise = client.connect();
    const ws = MockWebSocket.lastInstance!;

    ws.simulateMessage({ metadata: { message_type: "session_keepalive" }, payload: {} });
    ws.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "sess-4" } }
    });

    await connectPromise; // should still resolve
  });
});

// ---------------------------------------------------------------------------
// TwitchEventSubClient — redemption handling
// ---------------------------------------------------------------------------

describe("TwitchEventSubClient — redemption", () => {
  beforeEach(() => {
    MockWebSocket.lastInstance = null;
    vi.stubGlobal("WebSocket", MockWebSocket);
    mockFetchOk();
  });

  afterEach(() => vi.unstubAllGlobals());

  async function connectClient(
    onRedemption: (r: ChannelPointsRedemption) => void
  ): Promise<MockWebSocket> {
    const client = new TwitchEventSubClient(makeConfig(), onRedemption, makeLogger());
    const p = client.connect();
    const ws = MockWebSocket.lastInstance!;
    ws.simulateMessage({
      metadata: { message_type: "session_welcome" },
      payload: { session: { id: "s" } }
    });
    await p;
    return ws;
  }

  it("calls onRedemption with parsed redemption data", async () => {
    const onRedemption = vi.fn();
    const ws = await connectClient(onRedemption);

    ws.simulateMessage({
      metadata: { message_type: "notification" },
      payload: {
        subscription: { type: "channel.channel_points_custom_reward_redemption.add" },
        event: {
          id: "evt-1",
          user_id: "42",
          user_login: "viewer1",
          user_input: "https://youtu.be/dQw4w9WgXcQ",
          reward: { id: "rw-1", title: "GS" }
        }
      }
    });

    await vi.waitFor(() => expect(onRedemption).toHaveBeenCalledTimes(1));
    expect(onRedemption).toHaveBeenCalledWith<[ChannelPointsRedemption]>({
      id: "evt-1",
      userId: "42",
      username: "viewer1",
      userInput: "https://youtu.be/dQw4w9WgXcQ",
      rewardId: "rw-1",
      rewardTitle: "GS"
    });
  });

  it("ignores notification for other subscription types", async () => {
    const onRedemption = vi.fn();
    const ws = await connectClient(onRedemption);

    ws.simulateMessage({
      metadata: { message_type: "notification" },
      payload: {
        subscription: { type: "channel.follow" },
        event: {}
      }
    });

    expect(onRedemption).not.toHaveBeenCalled();
  });
});
