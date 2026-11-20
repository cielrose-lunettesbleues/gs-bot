import type { Logger } from "pino";
import type { CommandRouter } from "../commands/commandRouter";
import { TwitchClient } from "./twitchClient";
import { bindTwitchMessageHandler } from "./twitchMessageHandler";

export interface TwitchBotConfig {
  channel: string;
  botUsername: string;
  oauthToken: string;
}

// tmi.js reconnects on its own after a network drop, but stops for good when
// Twitch refuses the login. After this long without a connection, the bot is
// rebuilt from scratch with a freshly refreshed token.
export const TWITCH_RECOVERY_DELAY_MS = 30_000;
const TWITCH_RECOVERY_MAX_DELAY_MS = 5 * 60_000;

export class TwitchBotManager {
  private client: TwitchClient | null = null;
  private currentChannel: string | null = null;
  private connected = false;
  private shutDown = false;
  private lastConfig: TwitchBotConfig | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryAttempts = 0;

  constructor(
    private readonly router: CommandRouter,
    private readonly logger: Logger,
    // Returns a valid Twitch user token, refreshed if needed; null if it cannot.
    private readonly resolveToken?: () => Promise<string | null>,
    private readonly recoveryDelayMs = TWITCH_RECOVERY_DELAY_MS
  ) {}

  async start(config: TwitchBotConfig): Promise<void> {
    await this.stop();
    if (this.shutDown) return;
    this.lastConfig = config;

    const client = new TwitchClient({ ...config, getToken: this.resolveToken });
    this.client = client;
    this.currentChannel = config.channel;
    bindTwitchMessageHandler(client, this.router, this.logger);
    client.onConnected(() => {
      if (this.client !== client) return;
      this.connected = true;
      this.recoveryAttempts = 0;
    });
    client.onDisconnected((reason) => {
      if (this.client !== client) return;
      this.connected = false;
      this.logger.warn({ channel: config.channel, reason }, "Twitch bot disconnected");
      this.scheduleRecovery(client);
    });
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
    this.recoveryAttempts = 0;
    this.logger.info({ channel: config.channel }, "Twitch bot connected");
  }

  private scheduleRecovery(client: TwitchClient): void {
    if (this.recoveryTimer || this.shutDown) return;
    const delay = Math.min(
      this.recoveryDelayMs * 2 ** this.recoveryAttempts,
      TWITCH_RECOVERY_MAX_DELAY_MS
    );
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.shutDown || this.client !== client || client.isOpen()) return;
      void this.recover();
    }, delay);
    this.recoveryTimer.unref?.();
  }

  private async recover(): Promise<void> {
    const config = this.lastConfig;
    if (!config || this.shutDown) return;
    this.recoveryAttempts += 1;
    const token = this.resolveToken ? await this.resolveToken().catch(() => null) : config.oauthToken;
    if (!token) {
      this.logger.warn({ channel: config.channel }, "Twitch bot cannot reconnect: token refresh refused (streamer must log in again)");
      return;
    }
    this.logger.info({ channel: config.channel, attempt: this.recoveryAttempts }, "Restarting Twitch bot with a fresh token");
    const attempts = this.recoveryAttempts;
    try {
      await this.start({ ...config, oauthToken: token });
    } catch (err) {
      this.logger.error({ err, channel: config.channel }, "Twitch bot restart failed");
      this.recoveryAttempts = attempts;
      // The failed client is gone, so retry from here.
      if (!this.shutDown && !this.recoveryTimer) {
        const delay = Math.min(this.recoveryDelayMs * 2 ** attempts, TWITCH_RECOVERY_MAX_DELAY_MS);
        this.recoveryTimer = setTimeout(() => {
          this.recoveryTimer = null;
          if (!this.shutDown && !this.client) void this.recover();
        }, delay);
        this.recoveryTimer.unref?.();
      }
    }
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.currentChannel = null;
    this.connected = false;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
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
