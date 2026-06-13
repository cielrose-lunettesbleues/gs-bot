import type { Logger } from "pino";
import type { Database } from "../db/database";
import { listUsers } from "../db/database";
import {
  fetchLiveChannels,
  getAppAccessToken,
  type OAuthConfig,
  type TwitchAppAccessToken
} from "../auth/oauthHandler";
import { TenantManager } from "./tenantManager";

export const LIVE_POLL_INTERVAL_MS = 3 * 60 * 1000;

export class LiveStatusPoller {
  private twitchAppTokenCache: TwitchAppAccessToken | null = null;

  constructor(
    private readonly db: Database,
    private readonly oauthConfig: OAuthConfig,
    private readonly tenantManager: TenantManager,
    private readonly logger: Logger
  ) {}

  async poll(): Promise<void> {
    if (!this.oauthConfig.clientId || !this.oauthConfig.clientSecret) return;

    const users = listUsers(this.db);
    if (users.length === 0) {
      await this.tenantManager.reconcileAll();
      return;
    }

    try {
      const appAccessToken = await this.getCachedAppAccessToken();
      const liveLogins = new Set<string>();

      for (let index = 0; index < users.length; index += 100) {
        const chunk = users.slice(index, index + 100).map((user) => user.twitch_login);
        const chunkLiveLogins = await fetchLiveChannels(this.oauthConfig.clientId, appAccessToken, chunk);
        for (const login of chunkLiveLogins) liveLogins.add(login);
      }

      for (const user of users) {
        this.tenantManager.setLiveState(user.id, liveLogins.has(user.twitch_login.toLowerCase()));
      }

      await this.tenantManager.reconcileAll();
    } catch (err) {
      this.logger.warn({ err }, "Failed to poll Twitch live status");
    }
  }

  private async getCachedAppAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.twitchAppTokenCache && this.twitchAppTokenCache.expiresAt - now > 60) {
      return this.twitchAppTokenCache.accessToken;
    }

    const token = await getAppAccessToken(this.oauthConfig);
    this.twitchAppTokenCache = token;
    return token.accessToken;
  }
}
