"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const twitchEventSubClient_1 = require("../../src/twitch/twitchEventSubClient");
// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------
class MockWebSocket {
    url;
    static lastInstance = null;
    onmessage = null;
    onerror = null;
    onclose = null;
    constructor(url) {
        this.url = url;
        MockWebSocket.lastInstance = this;
    }
    close() {
        this.onclose?.();
    }
    simulateMessage(payload) {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }
}
function makeLogger() {
    return { info: vitest_1.vi.fn(), warn: vitest_1.vi.fn(), error: vitest_1.vi.fn() };
}
function makeConfig(overrides = {}) {
    return {
        clientId: "test-client-id",
        accessToken: "test-token",
        broadcasterId: "123456",
        rewardId: "",
        ...overrides
    };
}
function mockFetchOk() {
    vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));
}
// ---------------------------------------------------------------------------
// extractRedemption
// ---------------------------------------------------------------------------
(0, vitest_1.describe)("extractRedemption", () => {
    (0, vitest_1.it)("maps Twitch event fields to ChannelPointsRedemption", () => {
        const event = {
            id: "redemption-id",
            user_id: "99",
            user_login: "alice",
            user_input: "https://youtu.be/abc",
            reward: { id: "reward-id", title: "Green Screen" }
        };
        const result = (0, twitchEventSubClient_1.extractRedemption)(event);
        (0, vitest_1.expect)(result).toEqual({
            id: "redemption-id",
            userId: "99",
            username: "alice",
            userInput: "https://youtu.be/abc",
            rewardId: "reward-id",
            rewardTitle: "Green Screen"
        });
    });
    (0, vitest_1.it)("defaults userInput to empty string when absent", () => {
        const event = {
            id: "r",
            user_id: "1",
            user_login: "bob",
            reward: { id: "rw", title: "GS" }
        };
        (0, vitest_1.expect)((0, twitchEventSubClient_1.extractRedemption)(event).userInput).toBe("");
    });
});
// ---------------------------------------------------------------------------
// fetchBroadcasterId
// ---------------------------------------------------------------------------
(0, vitest_1.describe)("fetchBroadcasterId", () => {
    (0, vitest_1.afterEach)(() => vitest_1.vi.unstubAllGlobals());
    (0, vitest_1.it)("returns the broadcaster user ID", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: "12345" }] })
        }));
        const id = await (0, twitchEventSubClient_1.fetchBroadcasterId)("mychannel", "client-id", "token");
        (0, vitest_1.expect)(id).toBe("12345");
    });
    (0, vitest_1.it)("throws if channel not found", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
        await (0, vitest_1.expect)((0, twitchEventSubClient_1.fetchBroadcasterId)("unknown", "c", "t")).rejects.toThrow("not found");
    });
    (0, vitest_1.it)("throws on non-200 response", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
        await (0, vitest_1.expect)((0, twitchEventSubClient_1.fetchBroadcasterId)("chan", "c", "t")).rejects.toThrow("401");
    });
});
// ---------------------------------------------------------------------------
// TwitchEventSubClient — connection
// ---------------------------------------------------------------------------
(0, vitest_1.describe)("TwitchEventSubClient", () => {
    (0, vitest_1.beforeEach)(() => {
        MockWebSocket.lastInstance = null;
        vitest_1.vi.stubGlobal("WebSocket", MockWebSocket);
        mockFetchOk();
    });
    (0, vitest_1.afterEach)(() => vitest_1.vi.unstubAllGlobals());
    (0, vitest_1.it)("resolves connect() after session_welcome + successful subscribe", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        const ws = MockWebSocket.lastInstance;
        ws.simulateMessage({
            metadata: { message_type: "session_welcome" },
            payload: { session: { id: "sess-abc" } }
        });
        await connectPromise;
        (0, vitest_1.expect)(fetch).toHaveBeenCalledWith(vitest_1.expect.stringContaining("eventsub/subscriptions"), vitest_1.expect.objectContaining({ method: "POST" }));
    });
    (0, vitest_1.it)("includes reward_id in subscription when configured", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig({ rewardId: "reward-xyz" }), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        MockWebSocket.lastInstance.simulateMessage({
            metadata: { message_type: "session_welcome" },
            payload: { session: { id: "sess-1" } }
        });
        await connectPromise;
        const body = JSON.parse(vitest_1.vi.mocked(fetch).mock.calls[0][1].body);
        (0, vitest_1.expect)(body.condition.reward_id).toBe("reward-xyz");
        (0, vitest_1.expect)(body.condition.broadcaster_user_id).toBe("123456");
    });
    (0, vitest_1.it)("omits reward_id when not configured", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig({ rewardId: "" }), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        MockWebSocket.lastInstance.simulateMessage({
            metadata: { message_type: "session_welcome" },
            payload: { session: { id: "sess-2" } }
        });
        await connectPromise;
        const body = JSON.parse(vitest_1.vi.mocked(fetch).mock.calls[0][1].body);
        (0, vitest_1.expect)(body.condition).not.toHaveProperty("reward_id");
    });
    (0, vitest_1.it)("rejects connect() when subscribe returns non-200", async () => {
        vitest_1.vi.stubGlobal("fetch", vitest_1.vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" }));
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        MockWebSocket.lastInstance.simulateMessage({
            metadata: { message_type: "session_welcome" },
            payload: { session: { id: "sess-3" } }
        });
        await (0, vitest_1.expect)(connectPromise).rejects.toThrow("403");
    });
    (0, vitest_1.it)("rejects connect() on WebSocket error", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        MockWebSocket.lastInstance.onerror?.();
        await (0, vitest_1.expect)(connectPromise).rejects.toThrow("WebSocket error");
    });
    (0, vitest_1.it)("rejects connect() if socket closes before session_welcome", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        // Simulate: WebSocket closes with this.ws === ws (no reconnect assigned yet)
        MockWebSocket.lastInstance.onclose?.();
        await (0, vitest_1.expect)(connectPromise).rejects.toThrow("closed before connection established");
    });
    (0, vitest_1.it)("ignores session_keepalive messages", async () => {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), vitest_1.vi.fn(), makeLogger());
        const connectPromise = client.connect();
        const ws = MockWebSocket.lastInstance;
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
(0, vitest_1.describe)("TwitchEventSubClient — redemption", () => {
    (0, vitest_1.beforeEach)(() => {
        MockWebSocket.lastInstance = null;
        vitest_1.vi.stubGlobal("WebSocket", MockWebSocket);
        mockFetchOk();
    });
    (0, vitest_1.afterEach)(() => vitest_1.vi.unstubAllGlobals());
    async function connectClient(onRedemption) {
        const client = new twitchEventSubClient_1.TwitchEventSubClient(makeConfig(), onRedemption, makeLogger());
        const p = client.connect();
        const ws = MockWebSocket.lastInstance;
        ws.simulateMessage({
            metadata: { message_type: "session_welcome" },
            payload: { session: { id: "s" } }
        });
        await p;
        return ws;
    }
    (0, vitest_1.it)("calls onRedemption with parsed redemption data", async () => {
        const onRedemption = vitest_1.vi.fn();
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
        await vitest_1.vi.waitFor(() => (0, vitest_1.expect)(onRedemption).toHaveBeenCalledTimes(1));
        (0, vitest_1.expect)(onRedemption).toHaveBeenCalledWith({
            id: "evt-1",
            userId: "42",
            username: "viewer1",
            userInput: "https://youtu.be/dQw4w9WgXcQ",
            rewardId: "rw-1",
            rewardTitle: "GS"
        });
    });
    (0, vitest_1.it)("ignores notification for other subscription types", async () => {
        const onRedemption = vitest_1.vi.fn();
        const ws = await connectClient(onRedemption);
        ws.simulateMessage({
            metadata: { message_type: "notification" },
            payload: {
                subscription: { type: "channel.follow" },
                event: {}
            }
        });
        (0, vitest_1.expect)(onRedemption).not.toHaveBeenCalled();
    });
});
