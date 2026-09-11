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
  private connected = false;
  private shutDown = false;

  constructor(
    private readonly router: CommandRouter,
    private readonly logger: Logger
  ) {}

  async start(config: TwitchBotConfig): Promise<void> {
    await this.stop();
    if (this.shutDown) return;

    const client = new TwitchClient(config);
    this.client = client;
    this.currentChannel = config.channel;
    bindTwitchMessageHandler(client, this.router, this.logger);
    try {
      await client.connect();
    } catch (err) {
      if (this.client === client) {
        this.client = null;
        this.currentChannel = null;
      }
      throw err;
    }

    // stop() or another start() ran while we were connecting
    if (this.client !== client) {
      await client.disconnect().catch(() => undefined);
      return;
    }
    this.connected = true;
    this.logger.info({ channel: config.channel }, "Twitch bot connected");
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.currentChannel = null;
    this.connected = false;
    if (!client) return;
    try {
      await client.disconnect();
    } catch (err) {
      this.logger.warn({ err }, "Error disconnecting Twitch client");
    }
  }

  // Final stop for a tenant being torn down: a start() still waiting on a token
  // refresh must not bring the bot back afterwards.
  async shutdown(): Promise<void> {
    this.shutDown = true;
    await this.stop();
  }

  status(): { connected: boolean; channel: string | null } {
    return { connected: this.connected, channel: this.currentChannel };
  }
}
