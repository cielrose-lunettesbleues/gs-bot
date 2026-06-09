import tmi from "tmi.js";

interface TwitchClientConfig {
  channel: string;
  botUsername: string;
  oauthToken: string;
}

export class TwitchClient {
  private readonly client: tmi.Client;

  constructor(private readonly config: TwitchClientConfig) {
    // tmi.js expects the token with the "oauth:" prefix
    const password = config.oauthToken.startsWith("oauth:")
      ? config.oauthToken
      : `oauth:${config.oauthToken}`;

    this.client = new tmi.Client({
      options: { debug: false },
      identity: { username: config.botUsername, password },
      channels: [config.channel]
    });
  }

  public onMessage(handler: (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => void | Promise<void>): void {
    this.client.on("message", handler);
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
