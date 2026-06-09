const EVENTSUB_WS_URL = "wss://eventsub.wss.twitch.tv/ws";
const HELIX_EVENTSUB_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
const HELIX_USERS_URL = "https://api.twitch.tv/helix/users";
const CONNECT_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 5_000;

export interface EventSubConfig {
  clientId: string;
  accessToken: string;
  broadcasterId: string;
  rewardId: string;
}

export interface ChannelPointsRedemption {
  id: string;
  userId: string;
  username: string;
  userInput: string;
  rewardId: string;
  rewardTitle: string;
}

export type RedemptionCallback = (redemption: ChannelPointsRedemption) => void | Promise<void>;

interface EventSubLogger {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
  error: (payload: Record<string, unknown>, message: string) => void;
}

interface EventSubMessage {
  metadata: { message_type: string };
  payload: Record<string, unknown>;
}

interface RedemptionEvent {
  id: string;
  user_id: string;
  user_login: string;
  user_input: string;
  reward: { id: string; title: string };
}

export function extractRedemption(event: Record<string, unknown>): ChannelPointsRedemption {
  const e = event as unknown as RedemptionEvent;
  return {
    id: e.id,
    userId: e.user_id,
    username: e.user_login,
    userInput: e.user_input ?? "",
    rewardId: e.reward.id,
    rewardTitle: e.reward.title
  };
}

export async function fetchBroadcasterId(
  channelName: string,
  clientId: string,
  accessToken: string
): Promise<string> {
  const url = `${HELIX_USERS_URL}?login=${encodeURIComponent(channelName)}`;
  const response = await fetch(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Twitch API error ${response.status}: ${response.statusText}`);
  }
  const data = (await response.json()) as { data?: Array<{ id: string }> };
  const user = data.data?.[0];
  if (!user) throw new Error(`Twitch channel not found: ${channelName}`);
  return user.id;
}

export class TwitchEventSubClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private shouldReconnect = false;

  constructor(
    private readonly config: EventSubConfig,
    private readonly onRedemption: RedemptionCallback,
    private readonly logger: EventSubLogger
  ) {}

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    await this.openSocket(EVENTSUB_WS_URL);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  private openSocket(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const succeed = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      const timer = setTimeout(
        () => fail(new Error("EventSub connection timed out after 15s")),
        CONNECT_TIMEOUT_MS
      );

      ws.onmessage = (ev: MessageEvent) => {
        this.handleMessage(ev.data as string, succeed, fail).catch((err: unknown) => {
          if (!settled) {
            fail(err instanceof Error ? err : new Error(String(err)));
          } else {
            this.logger.error({ error: err }, "EventSub post-connect message error");
          }
        });
      };

      ws.onerror = () => fail(new Error("EventSub WebSocket error"));

      ws.onclose = () => {
        clearTimeout(timer);
        // Closed after we switched to a reconnect URL — ignore
        if (this.ws !== ws) return;
        if (!settled) {
          settled = true;
          reject(new Error("EventSub WebSocket closed before connection established"));
          return;
        }
        this.logger.warn({}, "EventSub disconnected");
        if (this.shouldReconnect) {
          setTimeout(
            () =>
              this.openSocket(EVENTSUB_WS_URL).catch((err) =>
                this.logger.error({ error: err }, "EventSub reconnect failed")
              ),
            RECONNECT_DELAY_MS
          );
        }
      };
    });
  }

  private async handleMessage(
    data: string,
    succeed: () => void,
    fail: (err: Error) => void
  ): Promise<void> {
    const msg = JSON.parse(data) as EventSubMessage;
    switch (msg.metadata.message_type) {
      case "session_welcome": {
        this.sessionId = (msg.payload.session as { id: string }).id;
        await this.subscribe();
        succeed();
        this.logger.info(
          { rewardId: this.config.rewardId || "any" },
          "EventSub subscribed to channel points"
        );
        break;
      }
      case "session_keepalive":
        break;
      case "notification": {
        const payload = msg.payload as {
          subscription: { type: string };
          event: Record<string, unknown>;
        };
        if (payload.subscription.type === "channel.channel_points_custom_reward_redemption.add") {
          const redemption = extractRedemption(payload.event);
          await Promise.resolve(this.onRedemption(redemption));
        }
        break;
      }
      case "session_reconnect": {
        const reconnectUrl = (msg.payload.session as { reconnect_url: string }).reconnect_url;
        const oldWs = this.ws;
        try {
          await this.openSocket(reconnectUrl);
          oldWs?.close();
          succeed();
        } catch (err) {
          this.logger.error({ error: err }, "EventSub session_reconnect failed");
        }
        break;
      }
    }
  }

  private async subscribe(): Promise<void> {
    const condition: Record<string, string> = {
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
