import type { Logger } from "pino";
import type { CommandRouter } from "../commands/commandRouter";
import { TwitchClient } from "./twitchClient";
import { bindTwitchMessageHandler } from "./twitchMessageHandler";

export interface TwitchBotConfig {
  channel: string;
  botUsername: string;
  oauthToken: string;
}

export class TwitchBotManager {
  private client: TwitchClient | null = null;
  private currentChannel: string | null = null;

  constructor(
    private readonly router: CommandRouter,
    private readonly logger: Logger
  ) {}

  async start(config: TwitchBotConfig): Promise<void> {
    if (this.client) {
      await this.stop();
    }
    this.currentChannel = config.channel;
    this.client = new TwitchClient(config);
    bindTwitchMessageHandler(this.client, this.router, this.logger);
    await this.client.connect();
    this.logger.info({ channel: config.channel }, "Twitch bot connected");
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.disconnect();
    } catch (err) {
      this.logger.warn({ err }, "Error disconnecting Twitch client");
    }
    this.client = null;
    this.currentChannel = null;
  }

  status(): { connected: boolean; channel: string | null } {
    return { connected: this.client !== null, channel: this.currentChannel };
  }
}
