import type { Logger } from "pino";
import { ensureFreshAccessToken, type OAuthConfig } from "../auth/oauthHandler";
import type { Database } from "../db/database";
import { getTenantConfig, rotateOverlayToken, updateTenantConfig, getUserById } from "../db/database";
import { CommandRouter } from "../commands/commandRouter";
import { ApprovalService } from "../approval/approvalService";
import { BlacklistService } from "../blacklist/blacklistService";
import { HistoryService } from "../history/historyService";
import { CooldownService } from "../cooldown/cooldownService";
import { OverlayBroadcaster } from "../overlay/overlayBroadcaster";
import { PlaybackQueue } from "../queue/playbackQueue";
import { TwitchBotManager } from "../twitch/twitchBotManager";
import type { ITtsService } from "../tts/ttsService";
import type { TenantConfigPatch } from "./configPatches";
import { createTenantServices } from "./createTenantServices";
import { applyRuntimeConfig, dbConfigToRuntime, type TenantRuntimeConfig } from "./runtimeConfig";

export interface TenantServices {
  runtimeConfig: TenantRuntimeConfig;
  queue: PlaybackQueue;
  cooldownService: CooldownService;
  approvalService: ApprovalService;
  blacklistService: BlacklistService;
  historyService: HistoryService;
  overlayBroadcaster: OverlayBroadcaster;
  twitchBotManager: TwitchBotManager;
  router: CommandRouter;
  ttsService: ITtsService;
}

export interface TenantRuntimeState {
  resident: boolean;
  dashboardActive: boolean;
  dashboardLastSeenAt: string | null;
  dashboardExpiresAt: string | null;
  live: boolean;
  queueBusy: boolean;
  overlayClients: number;
  twitchConnected: boolean;
  activeReasons: Array<"dashboard" | "live" | "queue_busy">;
}

interface TenantActivity {
  dashboardLastSeenAt: number;
  isLive: boolean;
}

const DASHBOARD_ACTIVE_TTL_MS = 10 * 60 * 1000;

function toIsoOrNull(value: number): string | null {
  return value > 0 ? new Date(value).toISOString() : null;
}

export class TenantManager {
  private readonly tenants = new Map<number, TenantServices>();
  private readonly activity = new Map<number, TenantActivity>();

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly youtubeApiKey?: string,
    private readonly klipyApiKey?: string,
    private readonly sociavaultApiKey?: string,
    private readonly oauthConfig?: OAuthConfig
  ) {}

  getOrCreate(userId: number): TenantServices {
    const existing = this.tenants.get(userId);
    if (existing) return existing;

    const dbConfig = getTenantConfig(this.db, userId);
    const runtimeConfig = dbConfigToRuntime(dbConfig);
    const dbUser = getUserById(this.db, userId);
    const oauthConfig = this.oauthConfig;
    const services = createTenantServices({
      db: this.db,
      userId,
      dbUser,
      logger: this.logger,
      runtimeConfig,
      persistRuntimeConfig: (patch) => this.persistConfig(userId, patch),
      youtubeApiKey: this.youtubeApiKey,
      klipyApiKey: this.klipyApiKey,
      sociavaultApiKey: this.sociavaultApiKey,
      resolveAccessToken: oauthConfig
        ? () => ensureFreshAccessToken(this.db, userId, oauthConfig)
        : undefined
    });

    this.tenants.set(userId, services);
    const existingActivity = this.activity.get(userId);
    this.activity.set(userId, existingActivity ?? { dashboardLastSeenAt: 0, isLive: false });
    this.logger.info({ userId }, "Tenant services created");
    return services;
  }

  get(userId: number): TenantServices | undefined {
    return this.tenants.get(userId);
  }

  markDashboardActive(userId: number): TenantServices {
    const tenant = this.getOrCreate(userId);
    const activity = this.activity.get(userId) ?? { dashboardLastSeenAt: 0, isLive: false };
    const wasActive = this.isDashboardActive(userId);
    activity.dashboardLastSeenAt = Date.now();
    this.activity.set(userId, activity);
    if (!wasActive) {
      this.logger.info({ userId }, "Tenant activated by dashboard activity");
    }
    return tenant;
  }

  clearDashboardActivity(userId: number): void {
    const activity = this.activity.get(userId);
    if (!activity) return;
    activity.dashboardLastSeenAt = 0;
    this.activity.set(userId, activity);
    this.logger.info({ userId }, "Tenant dashboard activity cleared");
  }

  setLiveState(userId: number, isLive: boolean): void {
    const activity = this.activity.get(userId) ?? { dashboardLastSeenAt: 0, isLive: false };
    const wasLive = activity.isLive;
    activity.isLive = isLive;
    this.activity.set(userId, activity);

    if (wasLive !== isLive) {
      this.logger.info({ userId, live: isLive }, isLive ? "Tenant activated by live status" : "Tenant live status cleared");
    }

    if (isLive) {
      this.getOrCreate(userId);
      return;
    }

    void this.reconcileTenant(userId);
  }

  isDashboardActive(userId: number): boolean {
    const activity = this.activity.get(userId);
    if (!activity) return false;
    return Date.now() - activity.dashboardLastSeenAt < DASHBOARD_ACTIVE_TTL_MS;
  }

  async reconcileTenant(userId: number): Promise<void> {
    const tenant = this.tenants.get(userId);
    if (!tenant) return;

    const activity = this.activity.get(userId) ?? { dashboardLastSeenAt: 0, isLive: false };
    if (activity.isLive || this.isDashboardActive(userId)) return;
    if (tenant.queue.getState().busy) return;

    await this.stop(userId);
  }

  getRuntimeState(userId: number): TenantRuntimeState {
    const activity = this.activity.get(userId) ?? { dashboardLastSeenAt: 0, isLive: false };
    const tenant = this.tenants.get(userId);
    const dashboardActive = this.isDashboardActive(userId);
    const queueBusy = tenant?.queue.getState().busy ?? false;
    const activeReasons: Array<"dashboard" | "live" | "queue_busy"> = [];
    if (dashboardActive) activeReasons.push("dashboard");
    if (activity.isLive) activeReasons.push("live");
    if (queueBusy) activeReasons.push("queue_busy");
    const dashboardExpiresAt = activity.dashboardLastSeenAt > 0
      ? activity.dashboardLastSeenAt + DASHBOARD_ACTIVE_TTL_MS
      : 0;

    return {
      resident: Boolean(tenant),
      dashboardActive,
      dashboardLastSeenAt: toIsoOrNull(activity.dashboardLastSeenAt),
      dashboardExpiresAt: toIsoOrNull(dashboardExpiresAt),
      live: activity.isLive,
      queueBusy,
      overlayClients: tenant?.overlayBroadcaster.clientCount() ?? 0,
      twitchConnected: tenant?.twitchBotManager.status().connected ?? false,
      activeReasons
    };
  }

  async reconcileAll(): Promise<void> {
    await Promise.all([...this.tenants.keys()].map((userId) => this.reconcileTenant(userId)));
  }

  async stop(userId: number): Promise<void> {
    const tenant = this.tenants.get(userId);
    if (!tenant) return;
    const runtime = this.getRuntimeState(userId);
    await tenant.twitchBotManager.shutdown();
    await tenant.queue.stop();
    tenant.overlayBroadcaster.close();
    this.tenants.delete(userId);
    this.logger.info({ userId, previousRuntime: runtime }, "Tenant services stopped");
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.tenants.keys()].map((id) => this.stop(id)));
  }

  // Persist config change to DB and update in-memory reference
  persistConfig(userId: number, patch: TenantConfigPatch): void {
    updateTenantConfig(this.db, userId, patch);
    const tenant = this.tenants.get(userId);
    if (!tenant) return;
    const updated = dbConfigToRuntime(getTenantConfig(this.db, userId));
    applyRuntimeConfig(tenant.runtimeConfig, updated);
  }

  rotateOverlayToken(userId: number): string {
    const overlayToken = rotateOverlayToken(this.db, userId);
    const tenant = this.tenants.get(userId);
    if (tenant) {
      tenant.runtimeConfig.publicAccess.overlayToken = overlayToken;
    }
    return overlayToken;
  }
}
