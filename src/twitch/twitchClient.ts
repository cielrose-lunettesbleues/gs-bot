import tmi from "tmi.js";

interface TwitchClientConfig {
  channel: string;
  botUsername: string;
  oauthToken: string;
  // Called by tmi.js before every (re)connection. Twitch user tokens expire
  // after about 4 hours, so a reconnection made with the token we started with
  // is refused and tmi.js then gives up for good.
  getToken?: () => Promise<string | null>;
}

function withOauthPrefix(token: string): string {
  // tmi.js expects the token with the "oauth:" prefix
  return token.startsWith("oauth:") ? token : `oauth:${token}`;
}

export class TwitchClient {
  private readonly client: tmi.Client;
  private lastToken: string;

  constructor(private readonly config: TwitchClientConfig) {
    this.lastToken = config.oauthToken;
    const getToken = config.getToken;
    const password = getToken
      ? async () => {
        const fresh = await getToken().catch(() => null);
        if (fresh) this.lastToken = fresh;
        return withOauthPrefix(this.lastToken);
      }
      : withOauthPrefix(config.oauthToken);

    this.client = new tmi.Client({
      options: { debug: false },
      connection: { reconnect: true, secure: true },
      identity: { username: config.botUsername, password },
      channels: [config.channel]
    });
  }

  public onMessage(handler: (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => void | Promise<void>): void {
    this.client.on("message", handler);
  }

  public onDisconnected(handler: (reason: string) => void): void {
    this.client.on("disconnected", handler);
  }

  public onConnected(handler: () => void): void {
    this.client.on("connected", () => handler());
  }

  public isOpen(): boolean {
    return this.client.readyState() === "OPEN";
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  public async say(channel: string, message: string): Promise<void> {
    await this.client.say(channel, message);
  }
}
