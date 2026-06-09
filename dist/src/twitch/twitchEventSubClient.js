"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchEventSubClient = void 0;
exports.extractRedemption = extractRedemption;
exports.fetchBroadcasterId = fetchBroadcasterId;
const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const HELIX_EVENTSUB_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
const HELIX_USERS_URL = "https://api.twitch.tv/helix/users";
const CONNECT_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;
function extractRedemption(event) {
    const e = event;
    return {
        id: e.id,
        userId: e.user_id,
        username: e.user_login,
        userInput: e.user_input ?? "",
        rewardId: e.reward.id,
        rewardTitle: e.reward.title
    };
}
async function fetchBroadcasterId(channelName, clientId, accessToken) {
    const url = `${HELIX_USERS_URL}?login=${encodeURIComponent(channelName)}`;
    const response = await fetch(url, {
        headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error(`Twitch API error ${response.status}: ${response.statusText}`);
    }
    const data = (await response.json());
    const user = data.data?.[0];
    if (!user)
        throw new Error(`Twitch channel not found: ${channelName}`);
    return user.id;
}
class TwitchEventSubClient {
    config;
    onRedemption;
    logger;
    ws = null;
    sessionId = null;
    shouldReconnect = false;
    constructor(config, onRedemption, logger) {
        this.config = config;
        this.onRedemption = onRedemption;
        this.logger = logger;
    }
    async connect() {
        this.shouldReconnect = true;
        await this.openSocket(EVENTSUB_WS_URL);
    }
    disconnect() {
        this.shouldReconnect = false;
        this.ws?.close();
        this.ws = null;
    }
    openSocket(url) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            this.ws = ws;
            let settled = false;
            const succeed = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                resolve();
            };
            const fail = (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            };
            const timer = setTimeout(() => fail(new Error("EventSub connection timed out after 15s")), CONNECT_TIMEOUT_MS);
            ws.onmessage = (ev) => {
                this.handleMessage(ev.data, succeed, fail).catch((err) => {
                    if (!settled) {
                        fail(err instanceof Error ? err : new Error(String(err)));
                    }
                    else {
                        this.logger.error({ error: err }, "EventSub post-connect message error");
                    }
                });
            };
            ws.onerror = () => fail(new Error("EventSub WebSocket error"));
            ws.onclose = () => {
                clearTimeout(timer);
                // Closed after we switched to a reconnect URL — ignore
                if (this.ws !== ws)
                    return;
                if (!settled) {
                    settled = true;
                    reject(new Error("EventSub WebSocket closed before connection established"));
                    return;
                }
                this.logger.warn({}, "EventSub disconnected");
                if (this.shouldReconnect) {
                    setTimeout(() => this.openSocket(EVENTSUB_WS_URL).catch((err) => this.logger.error({ error: err }, "EventSub reconnect failed")), RECONNECT_DELAY_MS);
                }
            };
        });
    }
    async handleMessage(data, succeed, fail) {
        const msg = JSON.parse(data);
        switch (msg.metadata.message_type) {
            case "session_welcome": {
                this.sessionId = msg.payload.session.id;
                await this.subscribe();
                succeed();
                this.logger.info({ rewardId: this.config.rewardId || "any" }, "EventSub subscribed to channel points");
                break;
            }
            case "session_keepalive":
                break;
            case "notification": {
                const payload = msg.payload;
                if (payload.subscription.type === "channel.channel_points_custom_reward_redemption.add") {
                    const redemption = extractRedemption(payload.event);
                    await Promise.resolve(this.onRedemption(redemption));
                }
                break;
            }
            case "session_reconnect": {
                const reconnectUrl = msg.payload.session.reconnect_url;
                const oldWs = this.ws;
                try {
                    await this.openSocket(reconnectUrl);
                    oldWs?.close();
                    succeed();
                }
                catch (err) {
                    this.logger.error({ error: err }, "EventSub session_reconnect failed");
                }
                break;
            }
        }
    }
    async subscribe() {
        const condition = {
            broadcaster_user_id: this.config.broadcasterId
        };
        if (this.config.rewardId) {
            condition.reward_id = this.config.rewardId;
        }
        const response = await fetch(HELIX_EVENTSUB_URL, {
            method: "POST",
            headers: {
                "Client-Id": this.config.clientId,
                Authorization: `Bearer ${this.config.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                type: "channel.channel_points_custom_reward_redemption.add",
                version: "1",
                condition,
                transport: { method: "websocket", session_id: this.sessionId }
            })
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "(unreadable)");
            throw new Error(`EventSub subscription failed (${response.status}): ${body}`);
        }
    }
}
exports.TwitchEventSubClient = TwitchEventSubClient;
